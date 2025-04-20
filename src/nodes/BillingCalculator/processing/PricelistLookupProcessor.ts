import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type {
  PriceListItem,
  UsageRecord,
  CalculatedRecord,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
} from '../interfaces';
import { multiply, round } from '../utils/calculations';
import Decimal from 'decimal.js';
import _ from 'lodash';

/**
 * Helper function to get a property from an object case-insensitively
 */
function getPropertyCaseInsensitive(obj: Record<string, unknown>, key: string): unknown {
  if (!obj || typeof obj !== 'object' || key === undefined || key === null) {
    return undefined;
  }

  const keyLower = key.toLowerCase();

  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === keyLower) {
      return obj[k];
    }
  }

  return undefined;
}

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
  try {
    if (items.length === 0 || !items[0]?.json) {
      throw new NodeOperationError(this.getNode(), 'No input data found');
    }

    // Validate required calculation fields
    if (!calculationConfig.quantityField) {
      throw new NodeOperationError(
        this.getNode(),
        'Quantity Field is required for price lookup. Please provide a valid field name.',
      );
    }

    if (!calculationConfig.priceField) {
      throw new NodeOperationError(
        this.getNode(),
        'Price Field is required for price lookup. Please provide a valid field name.',
      );
    }

    // Extract the shared price list once from the first item
    const priceList = extractPriceListData(items[0].json, priceListFieldName, this);
    console.log(`Extracted price list: ${priceList.length} items`);

    // Arrays to hold all matched and unmatched records
    const allMatchedRecords: CalculatedRecord[] = [];
    const allUnmatchedRecords: UsageRecord[] = [];

    // Process each item individually
    console.log(`Processing ${items.length} input items`);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item?.json) continue;

      // Extract a brief summary of the input item for debugging
      const itemSummary =
        Object.keys(item.json).length > 0
          ? `Keys: ${Object.keys(item.json).slice(0, 3).join(', ')}${Object.keys(item.json).length > 3 ? '...' : ''}`
          : 'Empty item';

      // Default: Use the item directly as the usage record
      // Only extract from field path if explicitly provided a string path
      let usageData: UsageRecord[];
      if (typeof usageDataFieldName === 'string' && usageDataFieldName.trim().length > 0) {
        // Extract data from specific field path
        usageData = extractDataFromFieldPath(item.json, usageDataFieldName);
        console.log(`Item #${i + 1}: Extracted data from field path "${usageDataFieldName}"`);
      } else {
        // Use the item itself as the usage record (direct data mode)
        usageData = [item.json as UsageRecord];
        console.log(`Item #${i + 1}: Using item directly as usage data`);
      }

      // Log some identifying info from the first usage record
      let itemIdentifier = `Item #${i + 1}`;
      if (usageData.length > 0) {
        // Try to extract some identifying fields if they exist
        const firstRecord = usageData[0];

        // Use a more generic approach to find identifying fields
        let identifierFound = false;

        // First, look for fields containing 'id' (case insensitive)
        for (const field of Object.keys(firstRecord)) {
          if (field.toLowerCase().includes('id') && firstRecord[field] !== undefined) {
            itemIdentifier += ` (${field}: ${firstRecord[field]})`;
            identifierFound = true;
            break;
          }
        }

        // If no ID found, look for fields containing 'name' (case insensitive)
        if (!identifierFound) {
          for (const field of Object.keys(firstRecord)) {
            if (field.toLowerCase().includes('name') && firstRecord[field] !== undefined) {
              itemIdentifier += ` (${field}: ${firstRecord[field]})`;
              identifierFound = true;
              break;
            }
          }
        }

        // If still no identifier found, use the first field
        if (!identifierFound && Object.keys(firstRecord).length > 0) {
          const firstField = Object.keys(firstRecord)[0];
          itemIdentifier += ` (${firstField}: ${firstRecord[firstField]})`;
        }
      }

      console.log(
        `${itemIdentifier} [${itemSummary}]: Processing ${usageData.length} usage records`,
      );

      // Process each usage record for this item against the shared price list
      const matchedRecords: CalculatedRecord[] = [];
      const unmatchedRecords: UsageRecord[] = [];

      for (const usageRecord of usageData) {
        // Find matching price records
        const matchedPrices = findMatchingPriceRecords(usageRecord, priceList, matchFields);

        // Check if we have exactly one match
        if (matchedPrices.length === 1) {
          // Calculate amount and create output record
          const calculated = calculateAmount(
            usageRecord,
            matchedPrices[0],
            calculationConfig,
            outputConfig,
            matchFields,
          );
          matchedRecords.push(calculated);
        } else {
          // Add match reason and count to usage record
          const unmatchedRecord = { ...usageRecord };
          if (matchedPrices.length === 0) {
            unmatchedRecord.matchReason = 'No matching price records found';
          } else {
            unmatchedRecord.matchReason = `Multiple matching price records found (${matchedPrices.length})`;
          }
          unmatchedRecord.matchCount = matchedPrices.length;

          // Add to unmatched records
          unmatchedRecords.push(unmatchedRecord);
        }
      }

      // Show a preview of the data being output to detect duplicates
      let matchedDataPreview = '';
      if (matchedRecords.length > 0) {
        const sampleRecord = matchedRecords[0];
        const previewKeys = Object.keys(sampleRecord).slice(0, 3);
        matchedDataPreview = ` | Sample: ${previewKeys.map((k) => `${k}: ${sampleRecord[k]}`).join(', ')}`;
      }

      console.log(
        `${itemIdentifier} processed: ${matchedRecords.length} matched, ${unmatchedRecords.length} unmatched${matchedDataPreview}`,
      );

      // Add this item's results to the overall collections
      allMatchedRecords.push(...matchedRecords);
      allUnmatchedRecords.push(...unmatchedRecords);
    }

    // Show final summary with a preview of all the matched data structure
    console.log(
      `All items processed. Total: ${allMatchedRecords.length} matched, ${allUnmatchedRecords.length} unmatched`,
    );
    if (allMatchedRecords.length > 0) {
      console.log(`Output data structure: ${Object.keys(allMatchedRecords[0]).join(', ')}`);
    }

    // Prepare output data
    const successOutput = allMatchedRecords.map((record) => ({ json: record }));
    const unmatchedOutput = allUnmatchedRecords.map((record) => ({ json: record }));

    // Return both outputs
    return [successOutput, unmatchedOutput];
  } catch (error) {
    // Propagate original error if it's already a NodeOperationError
    if (error instanceof NodeOperationError) {
      throw error;
    }

    // Otherwise wrap in NodeOperationError
    throw new NodeOperationError(
      this.getNode(),
      `Failed to process billing lookup: ${(error as Error).message}`,
    );
  }
}

/**
 * Extract price list data from input
 */
function extractPriceListData(
  inputData: IDataObject,
  fieldName: string | unknown,
  executeFunctions: IExecuteFunctions,
): PriceListItem[] {
  let priceList: unknown;

  // Handle different ways data can be provided
  if (typeof fieldName === 'string') {
    // If fieldName is a string, treat it as a path to look up in the inputData
    priceList = _.get(inputData, fieldName);
  } else {
    // If fieldName is not a string, it's likely the actual data from an n8n expression
    priceList = fieldName;
  }

  // Handle case where the price list might be a string
  if (typeof priceList === 'string') {
    try {
      // Try to parse it if it's a JSON string
      priceList = JSON.parse(priceList);
    } catch (e) {
      // If not valid JSON, create empty array
      priceList = [];
    }
  }

  // Ensure priceList is an array
  if (!Array.isArray(priceList)) {
    // If it's an object but not an array, wrap it in an array
    if (typeof priceList === 'object' && priceList !== null) {
      priceList = [priceList];
    } else {
      // Create an empty array if it's neither an object nor array
      priceList = [];
    }
  }

  return priceList as PriceListItem[];
}

/**
 * Extract data from a specific field path in an object
 */
function extractDataFromFieldPath(inputData: IDataObject, fieldPath: string): UsageRecord[] {
  // Extract data from the specified field path
  let data = _.get(inputData, fieldPath);

  // Handle case where the data might be a string
  if (typeof data === 'string') {
    try {
      // Try to parse it if it's a JSON string
      data = JSON.parse(data);
    } catch (e) {
      // If not valid JSON, create empty array
      data = [];
    }
  }

  // Ensure data is an array
  if (!Array.isArray(data)) {
    // If it's an object but not an array, wrap it in an array
    if (typeof data === 'object' && data !== null) {
      data = [data];
    } else {
      // Create an empty array if it's neither an object nor array
      data = [];
    }
  }

  return data as UsageRecord[];
}

/**
 * Find matching price records for a usage record
 */
function findMatchingPriceRecords(
  usageRecord: UsageRecord,
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
): PriceListItem[] {
  if (matchFields.length === 0) {
    return [];
  }

  // Find all matches that satisfy all configured match fields
  const matches = priceList.filter((priceRecord) => {
    // All match criteria must be satisfied
    for (const matchField of matchFields) {
      // Use case-insensitive property lookup
      const priceValue = getPropertyCaseInsensitive(priceRecord, matchField.priceListField);
      const usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);

      // If either value is undefined, return false
      if (priceValue === undefined || usageValue === undefined) {
        return false;
      }

      // Case insensitive comparison for string values
      if (typeof priceValue === 'string' && typeof usageValue === 'string') {
        if (priceValue.toLowerCase() !== usageValue.toLowerCase()) {
          return false;
        }
      } else if (priceValue !== usageValue) {
        // Regular comparison for non-string values
        return false;
      }
    }
    return true;
  });

  return matches;
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

  // Get quantity and price values
  const quantity = Number(usageRecord[calculationConfig.quantityField] || 0);
  const price = Number(priceRecord[calculationConfig.priceField] || 0);

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
    for (const matchField of matchFields) {
      const priceField = matchField.priceListField;
      const priceValue = getPropertyCaseInsensitive(priceRecord, priceField) as
        | string
        | number
        | boolean
        | null
        | undefined;
      if (priceValue !== undefined) {
        outputRecord[`${pricelistPrefix}${priceField}`] = priceValue;
      }
    }
  }

  // Add match fields from usage record if enabled
  if (outputConfig.includeMatchUsageFields !== false) {
    for (const matchField of matchFields) {
      const usageField = matchField.usageField;
      const usageValue = getPropertyCaseInsensitive(usageRecord, usageField) as
        | string
        | number
        | boolean
        | null
        | undefined;
      if (usageValue !== undefined) {
        outputRecord[`${usagePrefix}${usageField}`] = usageValue;
      }
    }
  }

  // Include quantity and price fields if calculation fields are enabled
  if (outputConfig.includeCalculationFields !== false) {
    outputRecord[`${calcPrefix}${calculationConfig.quantityField}`] = quantity;
    outputRecord[`${calcPrefix}${calculationConfig.priceField}`] = price;
  }

  // Add calculated amount to output
  outputRecord[amountFieldName] = amount;

  // Add any additional configured output fields
  if (outputConfig.includeFields && outputConfig.includeFields.length > 0) {
    for (const fieldMapping of outputConfig.includeFields) {
      const source = fieldMapping.source === 'pricelist' ? priceRecord : usageRecord;
      const sourceValue = getPropertyCaseInsensitive(source, fieldMapping.sourceField) as
        | string
        | number
        | boolean
        | null
        | undefined;
      const targetField = fieldMapping.targetField || fieldMapping.sourceField;

      if (sourceValue !== undefined) {
        outputRecord[targetField] = sourceValue;
      }
    }
  }

  return outputRecord;
}
