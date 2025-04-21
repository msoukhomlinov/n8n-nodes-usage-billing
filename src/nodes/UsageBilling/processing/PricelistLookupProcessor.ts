import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type {
  PriceListItem,
  UsageRecord,
  CalculatedRecord,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
} from '../interfaces';
import type { StandardizedError } from '../utils/errorHandling';
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

// Define extended UsageRecord type containing original record and match/error details
type ExtendedUsageRecord = {
  originalRecord: UsageRecord; // Keep original data separate
  matchReason?: string;
  matchCount?: number;
  matchedFields?: string[];
  matchedPriceItems?: PriceListItem[];
  processingErrorDetails?: StandardizedError;
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
  const allUnmatchedRecords: ExtendedUsageRecord[] = []; // Use the new type
  // Array to hold error records for the second output
  const errorRecords: INodeExecutionData[] = [];
  // Arrays to track no-match records for detailed error reporting
  // Note: noMatchRecords was used for creating a summary error, which is currently bypassed
  // We might need to adjust this if we re-introduce summary errors
  // const noMatchRecords: ExtendedUsageRecord[] = [];

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
    if (!priceList || priceList.length === 0) {
      const error = createStandardizedError(
        ErrorCode.INVALID_PRICE_LIST_FORMAT,
        'Price list data is empty or invalid',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Check that your price list data is properly formatted',
            'Ensure the price list contains at least one item',
            'Verify the Price List Field Name parameter is correct',
          ],
        },
      );
      errorRecords.push({ json: { error } });
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
          const unmatchedRecord: ExtendedUsageRecord = {
            originalRecord: { ...usageRecord }, // Store original record
            // Other fields (matchReason, etc.) will be populated below
          };

          // Determine if any fields matched or if there were multiple matches
          const matchingFields: string[] = [];
          const nonMatchingFields: string[] = [];
          let exactMatchCount = 0;
          const exactlyMatchedItems: PriceListItem[] = [];
          const partiallyMatchedItems: PriceListItem[] = [];

          // We'll check against each price list item individually rather than the whole array
          for (const priceItem of priceList) {
            let allFieldsMatchForItem = true;
            const itemMatchingFields: string[] = [];
            const itemNonMatchingFields: string[] = [];

            // Check each match field against this price list item
            for (const matchField of matchFields) {
              const priceValue = getPropertyCaseInsensitive(priceItem, matchField.priceListField);
              const usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);

              // Track which fields matched or didn't match
              if (priceValue !== undefined && usageValue !== undefined) {
                let fieldMatched = false;

                // Compare values based on type
                if (typeof priceValue === 'string' && typeof usageValue === 'string') {
                  fieldMatched = priceValue.toLowerCase() === usageValue.toLowerCase();
                } else {
                  fieldMatched = priceValue === usageValue;
                }

                if (fieldMatched) {
                  itemMatchingFields.push(matchField.usageField);
                  if (!matchingFields.includes(matchField.usageField)) {
                    matchingFields.push(matchField.usageField);
                  }
                } else {
                  allFieldsMatchForItem = false;
                  itemNonMatchingFields.push(matchField.usageField);
                  if (!nonMatchingFields.includes(matchField.usageField)) {
                    nonMatchingFields.push(matchField.usageField);
                  }
                }
              } else {
                allFieldsMatchForItem = false;
                // If either value is undefined, mark field as non-matching
                itemNonMatchingFields.push(matchField.usageField);
                if (!nonMatchingFields.includes(matchField.usageField)) {
                  nonMatchingFields.push(matchField.usageField);
                }
              }
            }

            // If all fields matched for this item, increment our exact match count and store the item
            if (allFieldsMatchForItem) {
              exactMatchCount++;
              exactlyMatchedItems.push(priceItem);
            }

            // If this item had at least one matching field (was part of a potential partial match)
            if (itemMatchingFields.length > 0) {
              partiallyMatchedItems.push(priceItem);
            }
          }

          // Set match reason based on detailed analysis
          if (matchingFields.length === 0) {
            // No fields matched at all
            unmatchedRecord.matchReason = 'No matching fields found';
            unmatchedRecord.matchCount = 0;
          } else if (exactMatchCount > 1) {
            // Multiple items matched all criteria
            unmatchedRecord.matchReason = 'Multiple exact matches found';
            unmatchedRecord.matchCount = exactMatchCount;
            unmatchedRecord.matchedFields = [...matchingFields];
            unmatchedRecord.matchedPriceItems = [...exactlyMatchedItems];
          } else if (nonMatchingFields.length > 0) {
            // Some fields matched but others didn't - partial match
            unmatchedRecord.matchReason = `Partial match - fields not matched: ${nonMatchingFields.join(', ')}`;
            unmatchedRecord.matchCount = matchingFields.length;
            unmatchedRecord.matchedFields = [...matchingFields];
            unmatchedRecord.matchedPriceItems = [...new Set(partiallyMatchedItems)];
          } else {
            // Should not reach here, but just in case
            unmatchedRecord.matchReason = 'Unknown match issue';
            unmatchedRecord.matchCount = matchingFields.length;
          }

          // Add to tracking collections
          // noMatchRecords.push(unmatchedRecord); // Temporarily commented out
          allUnmatchedRecords.push(unmatchedRecord);
        }
      }

      // Add this item's results to the overall collections
      allMatchedRecords.push(...matchedRecords); // Collect matched records from this item
      // allUnmatchedRecords.push(...unmatchedRecords); // Already done inside loop
    }

    // Create standardized errors for unmatched records if any
    if (allUnmatchedRecords.length > 0) {
      // Create simplified versions of the records for the error context
      // to avoid circular references
      const simplifiedRecords = allUnmatchedRecords.map((record) => {
        // Extract just the basic information needed for the error message
        // without creating circular references
        return {
          // Include original record data but exclude complex nested objects
          ...record.originalRecord,
          matchReason: record.matchReason,
          matchCount: record.matchCount,
          // Don't include the full matchedPriceItems arrays to avoid circular references
        };
      });

      // Generate the standardized error using the simplified records
      const unmatchedError = createUnmatchedRecordsError(simplifiedRecords, 'none');

      // Add this error to each unmatched record
      for (const record of allUnmatchedRecords) {
        record.processingErrorDetails = unmatchedError;
      }
    }

    // Prepare output data - valid matched records for the first output
    const successOutput = allMatchedRecords.map((record) => ({ json: record }));

    // Prepare the second output (unmatched/error records) ensuring consistent schema
    // We will only include allUnmatchedRecords (which now have any error details embedded)
    // and skip any separate error records
    const unmatchedOutputRecords = allUnmatchedRecords.map((record) => {
      // Ensure all standard fields exist, even if empty/default
      return {
        originalRecord: record.originalRecord,
        matchReason: record.matchReason ?? 'Unknown Match Issue',
        matchCount: record.matchCount ?? 0,
        matchedFields: record.matchedFields ?? [],
        matchedPriceItems: record.matchedPriceItems ?? [],
        processingErrorDetails: record.processingErrorDetails,
      };
    });

    // No longer need to create and combine separate processing error records
    // Just use the unmatchedOutputRecords which now have all necessary information
    const unmatchedOutput = unmatchedOutputRecords.map((record) => ({
      json: {
        ...record.originalRecord,
        matchReason: record.matchReason,
        matchCount: record.matchCount,
        matchedFields: record.matchedFields,
        matchedPriceItems: record.matchedPriceItems,
        processingErrorDetails: record.processingErrorDetails,
      },
    }));

    // Return outputs in the correct order: [validRecords (output 1), invalidRecords (output 2)]
    return [successOutput, unmatchedOutput];
  } catch (error) {
    // Use handleError to create a standardized error
    const standardizedError = handleError(error as Error, {
      calculationConfig,
      matchFields,
      outputConfig,
    });

    // Create a standardized output record for the caught error
    const errorOutputRecord: ExtendedUsageRecord = {
      originalRecord: {}, // Base UsageRecord part is an empty object
      matchReason: 'Critical Processing Error',
      matchCount: 0,
      matchedFields: [], // Keep empty arrays here
      matchedPriceItems: [], // Keep empty arrays here
      processingErrorDetails: standardizedError,
    };

    // Flatten the output structure for the final JSON
    const finalErrorOutput = {
      json: {
        ...errorOutputRecord.originalRecord,
        matchReason: errorOutputRecord.matchReason,
        matchCount: errorOutputRecord.matchCount,
        matchedFields: errorOutputRecord.matchedFields,
        matchedPriceItems: errorOutputRecord.matchedPriceItems,
        processingErrorDetails: errorOutputRecord.processingErrorDetails,
      },
    };

    // Return in the correct order: [validRecords (empty), invalidRecords]
    // The second output contains a single record detailing the critical error
    return [[], [finalErrorOutput]];
  }
}

/**
 * Extract price list data from input
 */
function extractPriceListData(
  inputData: IDataObject,
  fieldName: string | unknown,
): PriceListItem[] {
  let priceList: PriceListItem[];

  // If fieldName is an array, it's the actual price list data
  if (Array.isArray(fieldName)) {
    // Use fieldName directly as the price list
    priceList = fieldName as PriceListItem[];
  }
  // If fieldName is not a string or empty, use inputData
  else if (typeof fieldName !== 'string' || !fieldName.trim()) {
    // If inputData is already an array, use it directly
    if (Array.isArray(inputData)) {
      priceList = inputData as PriceListItem[];
    } else {
      // If inputData is a single object, wrap it in an array
      priceList = [inputData as PriceListItem];
    }
  } else {
    // Get the field value using the provided field name
    const fieldValue = getPropertyCaseInsensitive(inputData, fieldName);

    if (fieldValue === undefined) {
      throw new Error(`Price list field "${fieldName}" not found in input data`);
    }

    // Handle the extracted field value
    if (Array.isArray(fieldValue)) {
      // If fieldValue is already an array, use it directly
      priceList = fieldValue as PriceListItem[];
    } else {
      // If fieldValue is a single object, wrap it in an array
      priceList = [fieldValue as PriceListItem];
    }
  }

  return priceList;
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
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
): PriceListItem | null {
  if (matchFields.length === 0 || !priceList || priceList.length === 0) {
    return null;
  }

  const matchedItems: PriceListItem[] = [];

  // Iterate through each price list item to find matches
  for (const priceItem of priceList) {
    let allFieldsMatch = true;

    // Check each match field for this price item
    for (const matchField of matchFields) {
      // Use case-insensitive property lookup
      const priceValue = getPropertyCaseInsensitive(priceItem, matchField.priceListField);
      const usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);

      // If either value is undefined, this item doesn't match
      if (priceValue === undefined || usageValue === undefined) {
        allFieldsMatch = false;
        break;
      }

      // Case insensitive comparison for string values
      if (typeof priceValue === 'string' && typeof usageValue === 'string') {
        if (priceValue.toLowerCase() !== usageValue.toLowerCase()) {
          allFieldsMatch = false;
          break;
        }
      } else if (priceValue !== usageValue) {
        // Regular comparison for non-string values
        allFieldsMatch = false;
        break;
      }
    }

    // If all fields matched, add to matches
    if (allFieldsMatch) {
      matchedItems.push(priceItem);
    }
  }

  // Check if we have exactly one match
  if (matchedItems.length === 1) {
    return matchedItems[0];
  }

  // No matches found or multiple matches
  return null;
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
