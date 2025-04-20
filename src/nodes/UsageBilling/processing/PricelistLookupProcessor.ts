import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type {
  PriceListItem,
  UsageRecord,
  CalculatedRecord,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
} from '../interfaces';
import { multiply } from '../utils/calculations';
import {
  handleError,
  validatePriceListStructure,
  validateUsageDataStructure,
  validateMatchFields,
  createUnmatchedRecordsError,
  ErrorCode,
  ErrorCategory,
  createStandardizedError,
} from '../utils/errorHandling';
import {
  getPropertyCaseInsensitive,
  addMatchFieldsToOutput,
  addExtraFieldsToOutput,
} from '../utils/common';
import Decimal from 'decimal.js';
import _ from 'lodash';

// Define extended UsageRecord type with match properties
type ExtendedUsageRecord = UsageRecord & {
  matchReason?: string;
  matchCount?: number;
  matchedFields?: string[];
};

/**
 * Process usage records against a price list, performing exact matching and calculation
 */
export async function pricelistLookup(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  priceListFieldName: string | unknown,
  usageDataFieldName: string | unknown,
  matchFields: MatchFieldPair[],
  calculationConfig: CalculationConfig,
  outputConfig: OutputFieldConfig,
): Promise<INodeExecutionData[][]> {
  // Arrays to hold all matched and unmatched records
  const allMatchedRecords: CalculatedRecord[] = [];
  const allUnmatchedRecords: ExtendedUsageRecord[] = [];
  // Array to hold error records for the second output
  const errorRecords: INodeExecutionData[] = [];
  // Arrays to track no-match records for detailed error reporting
  const noMatchRecords: ExtendedUsageRecord[] = [];

  try {
    // Basic input validation
    if (items.length === 0 || !items[0]?.json) {
      const error = createStandardizedError(
        ErrorCode.EMPTY_DATASET,
        'No input data found',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Ensure there is input data connected to this node',
            'Check previous nodes in the workflow to make sure they are sending data',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Validate match fields
    const matchFieldsValidation = validateMatchFields(matchFields);
    if (!matchFieldsValidation.valid && matchFieldsValidation.error) {
      errorRecords.push({ json: { error: matchFieldsValidation.error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Validate required calculation fields
    if (!calculationConfig.quantityField) {
      const error = createStandardizedError(
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Quantity Field is required for price lookup',
        ErrorCategory.INPUT_ERROR,
        {
          context: { calculationConfig },
          suggestions: [
            'Provide a valid field name for the quantity field in the calculation settings',
            'This field should exist in your usage data',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    if (!calculationConfig.priceField) {
      const error = createStandardizedError(
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Price Field is required for price lookup',
        ErrorCategory.INPUT_ERROR,
        {
          context: { calculationConfig },
          suggestions: [
            'Provide a valid field name for the price field in the calculation settings',
            'This field should exist in your price list data',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Extract the shared price list once from the first item
    const priceList = extractPriceListData(items[0].json, priceListFieldName);

    // Validate price list structure
    const priceListValidation = validatePriceListStructure(priceList);
    if (!priceListValidation.valid && priceListValidation.error) {
      errorRecords.push({ json: { error: priceListValidation.error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Process each item individually
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item?.json) continue;

      // Default: Use the item directly as the usage record
      // Only extract from field path if explicitly provided a string path
      let usageData: UsageRecord[];
      if (typeof usageDataFieldName === 'string' && usageDataFieldName.trim().length > 0) {
        // Extract data from specific field path
        usageData = extractDataFromFieldPath(item.json, usageDataFieldName);
      } else {
        // Use the item itself as the usage record (direct data mode)
        usageData = [item.json as UsageRecord];
      }

      // Validate usage data structure
      const usageDataValidation = validateUsageDataStructure(usageData);
      if (!usageDataValidation.valid && usageDataValidation.error) {
        errorRecords.push({
          json: {
            error: usageDataValidation.error,
            itemIndex: i,
          },
        });
        continue; // Skip this item and process the next one
      }

      // Process each usage record for this item against the shared price list
      const matchedRecords: CalculatedRecord[] = [];
      const unmatchedRecords: ExtendedUsageRecord[] = [];

      for (const usageRecord of usageData) {
        // Find matching price records
        const matchedPrice = findMatchingPriceRecords(usageRecord, priceList, matchFields);

        // Check if we have exactly one match
        if (matchedPrice) {
          // Calculate amount and create output record
          const calculated = calculateAmount(
            usageRecord,
            matchedPrice,
            calculationConfig,
            outputConfig,
            matchFields,
          );
          matchedRecords.push(calculated);
        } else {
          // Create a copy of the usage record with detailed match info
          const unmatchedRecord: ExtendedUsageRecord = { ...usageRecord };

          // Determine if any fields matched or if there were multiple matches
          let allFieldsMatched = true;
          const matchingFields: string[] = [];

          // Check each match field
          for (const matchField of matchFields) {
            const priceValue = getPropertyCaseInsensitive(priceList, matchField.priceListField);
            const usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);

            // Track which fields matched
            if (priceValue !== undefined && usageValue !== undefined) {
              let fieldMatched = false;

              // Compare values based on type
              if (typeof priceValue === 'string' && typeof usageValue === 'string') {
                fieldMatched = priceValue.toLowerCase() === usageValue.toLowerCase();
              } else {
                fieldMatched = priceValue === usageValue;
              }

              if (fieldMatched) {
                matchingFields.push(matchField.usageField);
              } else {
                allFieldsMatched = false;
              }
            } else {
              allFieldsMatched = false;
            }
          }

          // Set match reason based on the outcome
          if (matchingFields.length === 0) {
            unmatchedRecord.matchReason = 'No matching fields found';
            unmatchedRecord.matchCount = 0;
          } else if (!allFieldsMatched) {
            unmatchedRecord.matchReason = 'Partial match - some fields did not match';
            unmatchedRecord.matchCount = matchingFields.length;
            unmatchedRecord.matchedFields = matchingFields;
          } else {
            // This shouldn't happen but is here for completeness
            unmatchedRecord.matchReason = 'Unknown matching issue';
            unmatchedRecord.matchCount = matchingFields.length;
          }

          // Add to tracking collections
          noMatchRecords.push(unmatchedRecord);
          unmatchedRecords.push(unmatchedRecord);
        }
      }

      // Add this item's results to the overall collections
      allMatchedRecords.push(...matchedRecords);
      allUnmatchedRecords.push(...unmatchedRecords);
    }

    // Create standardized errors for unmatched records if any
    if (noMatchRecords.length > 0) {
      errorRecords.push({
        json: {
          error: createUnmatchedRecordsError(noMatchRecords, 'none'),
        },
      });
    }

    // Prepare output data - valid matched records for the first output
    const successOutput = allMatchedRecords.map((record) => ({ json: record }));

    // Merge unmatched records with error records for the second output
    const unmatchedOutput = [
      ...allUnmatchedRecords.map((record) => ({ json: record })),
      ...errorRecords,
    ];

    // Return outputs in the correct order: [validRecords, invalidRecords]
    return [successOutput, unmatchedOutput];
  } catch (error) {
    // Use handleError to create a standardized error
    const standardizedError = handleError(error as Error, {
      calculationConfig,
      matchFields,
      outputConfig,
    });

    // Add to error records
    errorRecords.push({
      json: {
        error: standardizedError,
      },
    });

    // Return in the correct order: [validRecords (empty), invalidRecords]
    return [[], errorRecords];
  }
}

/**
 * Extract price list data from input
 */
function extractPriceListData(inputData: IDataObject, fieldName: string | unknown): PriceListItem {
  if (typeof fieldName !== 'string' || !fieldName.trim()) {
    // If no field name specified, assume the input data itself is the price list
    return inputData as PriceListItem;
  }

  // Get the field value
  const fieldValue = getPropertyCaseInsensitive(inputData, fieldName);
  if (fieldValue === undefined) {
    throw new Error(`Price list field "${fieldName}" not found in input data`);
  }

  return fieldValue as PriceListItem;
}

/**
 * Extract data from a specific field path in an object
 */
function extractDataFromFieldPath(inputData: IDataObject, fieldPath: string): UsageRecord[] {
  if (!fieldPath.trim()) {
    // If no field path specified, assume the input data itself is the usage record
    return [inputData as UsageRecord];
  }

  // Get the field value
  const fieldValue = getPropertyCaseInsensitive(inputData, fieldPath);
  if (fieldValue === undefined) {
    throw new Error(`Usage data field "${fieldPath}" not found in input data`);
  }

  // Convert to array if it's an object (but not an array)
  if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
    // Convert object to array of records
    const records: UsageRecord[] = [];
    for (const key in fieldValue as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(fieldValue, key)) {
        const record = (fieldValue as Record<string, unknown>)[key];
        if (typeof record === 'object' && record !== null) {
          records.push(record as UsageRecord);
        }
      }
    }
    return records;
  }

  // If it's already an array, return as is
  if (Array.isArray(fieldValue)) {
    return fieldValue as UsageRecord[];
  }

  // If it's a single value, wrap in array
  return [fieldValue as UsageRecord];
}

/**
 * Find matching price records for a usage record against a price list
 * Returns the matching price record if exactly one match is found
 * Returns null if no match or multiple matches are found
 */
function findMatchingPriceRecords(
  usageRecord: UsageRecord,
  priceList: PriceListItem,
  matchFields: MatchFieldPair[],
): PriceListItem | null {
  if (matchFields.length === 0) {
    return null;
  }

  // Check if the price list matches all configured match fields
  for (const matchField of matchFields) {
    // Use case-insensitive property lookup
    const priceValue = getPropertyCaseInsensitive(priceList, matchField.priceListField);
    const usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);

    // If either value is undefined, return false
    if (priceValue === undefined || usageValue === undefined) {
      return null;
    }

    // Case insensitive comparison for string values
    if (typeof priceValue === 'string' && typeof usageValue === 'string') {
      if (priceValue.toLowerCase() !== usageValue.toLowerCase()) {
        return null;
      }
    } else if (priceValue !== usageValue) {
      // Regular comparison for non-string values
      return null;
    }
  }

  return priceList;
}

/**
 * Calculate amount based on usage and price
 */
function calculateAmount(
  usageRecord: UsageRecord,
  priceRecord: PriceListItem,
  calculationConfig: CalculationConfig,
  outputConfig: OutputFieldConfig,
  matchFields: MatchFieldPair[],
): CalculatedRecord {
  // Create the output record
  const outputRecord: CalculatedRecord = {};

  // Get quantity and price values using case-insensitive property lookup
  const quantity = Number(
    getPropertyCaseInsensitive(usageRecord, calculationConfig.quantityField) || 0,
  );
  const price = Number(getPropertyCaseInsensitive(priceRecord, calculationConfig.priceField) || 0);

  // Calculate amount
  let amount = multiply(quantity, price);

  // Apply rounding if enabled (roundingDirection is not 'none')
  if (calculationConfig.roundingDirection && calculationConfig.roundingDirection !== 'none') {
    const decimalPlaces =
      calculationConfig.decimalPlaces !== undefined ? calculationConfig.decimalPlaces : 1;
    const roundingDirection = calculationConfig.roundingDirection;

    const decimalAmount = new Decimal(amount);
    if (roundingDirection === 'up') {
      // Round up (ceiling) to specified decimal places
      amount = decimalAmount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_UP).toNumber();
    } else {
      // Round down (floor) to specified decimal places
      amount = decimalAmount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_DOWN).toNumber();
    }
  }

  // Get prefixes from outputConfig (with defaults)
  const pricelistPrefix = outputConfig.pricelistFieldPrefix || 'price_';
  const usagePrefix = outputConfig.usageFieldPrefix || 'usage_';
  const calcPrefix = outputConfig.calculationFieldPrefix || 'calc_';
  const amountFieldName = outputConfig.calculatedAmountField || 'calc_amount';

  // Add match fields from price record if enabled
  if (outputConfig.includeMatchPricelistFields !== false) {
    addMatchFieldsToOutput(outputRecord, priceRecord, matchFields, 'pricelist', pricelistPrefix);
  }

  // Add match fields from usage record if enabled
  if (outputConfig.includeMatchUsageFields !== false) {
    addMatchFieldsToOutput(outputRecord, usageRecord, matchFields, 'usage', usagePrefix);
  }

  // Include quantity and price fields if calculation fields are enabled
  if (outputConfig.includeCalculationFields !== false) {
    outputRecord[`${calcPrefix}${calculationConfig.quantityField}`] = quantity;
    outputRecord[`${calcPrefix}${calculationConfig.priceField}`] = price;
  }

  // Add calculated amount to output
  outputRecord[amountFieldName] = amount;

  // Add any additional configured output fields
  addExtraFieldsToOutput(outputRecord, priceRecord, usageRecord, outputConfig);

  return outputRecord;
}
