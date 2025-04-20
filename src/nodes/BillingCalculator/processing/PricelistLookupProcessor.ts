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
import _ from 'lodash';

/**
 * Process usage records against a price list, performing exact matching and calculation
 */
export async function pricelistLookup(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  priceListFieldName: string,
  usageDataFieldName: string,
  matchFields: MatchFieldPair[],
  calculationConfig: CalculationConfig,
  outputConfig: OutputFieldConfig,
): Promise<INodeExecutionData[][]> {
  try {
    if (!items[0]?.json) {
      throw new NodeOperationError(this.getNode(), 'No input data found');
    }

    // 1. Extract the price list and usage data
    const priceList = extractPriceListData(items[0].json, priceListFieldName, this);
    const usageData = extractUsageData(items[0].json, usageDataFieldName, this);

    // 2. Process each usage record
    const matchedRecords: CalculatedRecord[] = [];
    const unmatchedRecords: UsageRecord[] = [];

    for (const usageRecord of usageData) {
      // 3. Find matching price record
      const matchedPrice = findMatchingPriceRecord(usageRecord, priceList, matchFields);

      if (matchedPrice) {
        // 4. Calculate amount and create output record
        const calculated = calculateAmount(
          usageRecord,
          matchedPrice,
          calculationConfig,
          outputConfig,
        );
        matchedRecords.push(calculated);
      } else {
        // Add to unmatched records
        unmatchedRecords.push(usageRecord);
      }
    }

    // 5. Prepare output data
    const successOutput = matchedRecords.map((record) => ({ json: record }));
    const unmatchedOutput = unmatchedRecords.map((record) => ({ json: record }));

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
  fieldName: string,
  executeFunctions: IExecuteFunctions,
): PriceListItem[] {
  const priceList = _.get(inputData, fieldName);

  if (!priceList || !Array.isArray(priceList)) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      `Price list not found in field "${fieldName}" or is not an array`,
    );
  }

  return priceList as PriceListItem[];
}

/**
 * Extract usage data from input
 */
function extractUsageData(
  inputData: IDataObject,
  fieldName: string,
  executeFunctions: IExecuteFunctions,
): UsageRecord[] {
  const usageData = _.get(inputData, fieldName);

  if (!usageData || !Array.isArray(usageData)) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      `Usage data not found in field "${fieldName}" or is not an array`,
    );
  }

  return usageData as UsageRecord[];
}

/**
 * Find a matching price record for a usage record
 */
function findMatchingPriceRecord(
  usageRecord: UsageRecord,
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
): PriceListItem | null {
  // Find all matches that satisfy all configured match fields
  const matches = priceList.filter((priceRecord) => {
    // All match criteria must be satisfied
    for (const matchField of matchFields) {
      const priceValue = priceRecord[matchField.priceListField];
      const usageValue = usageRecord[matchField.usageField];

      // If either value is undefined or they don't match, return false
      if (priceValue === undefined || usageValue === undefined || priceValue !== usageValue) {
        return false;
      }
    }
    return true;
  });

  // Return the first match or null if no match found
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Calculate amount based on usage and price
 */
function calculateAmount(
  usageRecord: UsageRecord,
  priceRecord: PriceListItem,
  calculationConfig: CalculationConfig,
  outputConfig: OutputFieldConfig,
): CalculatedRecord {
  // Create the output record
  const outputRecord: CalculatedRecord = {};

  // Add the configured output fields
  for (const fieldMapping of outputConfig.includeFields) {
    const source = fieldMapping.source === 'pricelist' ? priceRecord : usageRecord;
    const sourceValue = source[fieldMapping.sourceField];

    if (sourceValue !== undefined) {
      outputRecord[fieldMapping.targetField] = sourceValue;
    }
  }

  // Get quantity and price values
  const quantity = Number(usageRecord[calculationConfig.quantityField] || 0);
  const price = Number(priceRecord[calculationConfig.priceField] || 0);

  // Calculate amount
  const amount = multiply(quantity, price);

  // Add calculated amount to output
  outputRecord.calculated_amount = amount;

  return outputRecord;
}
