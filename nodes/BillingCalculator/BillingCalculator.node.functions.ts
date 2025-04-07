import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type {
  BillingRecord,
  MatchConfig,
  MatchResult,
  OutputConfig,
  PriceListItem,
  Schema,
  UsageRecord,
} from './interfaces/SchemaInterfaces';
import {
  findMatch,
  getFieldNames,
  getSchemaField,
  indexPriceList,
  inferSchemaFromExample,
  validateAll,
} from './utils';

/**
 * Processes billing based on price list and usage data
 */
export async function processBilling(
  this: IExecuteFunctions,
  priceList: PriceListItem[],
  usageRecords: UsageRecord[],
  matchConfig: MatchConfig,
  outputConfig: OutputConfig,
): Promise<INodeExecutionData[]> {
  const results: INodeExecutionData[] = [];
  const priceIndex = indexPriceList(priceList, matchConfig);

  for (const usageRecord of usageRecords) {
    const match = findMatch(usageRecord, priceIndex, matchConfig);

    // Skip invalid matches based on configuration
    if (!match.matched) {
      if (matchConfig.defaultOnNoMatch === 'error') {
        throw new Error(
          `No matching price list item found for usage record: ${JSON.stringify(usageRecord)}`,
        );
      }
      if (matchConfig.defaultOnNoMatch === 'skip') {
        continue;
      }
    }

    // Process the match to generate billing record
    const billingRecord = processBillingRecord(usageRecord, match, outputConfig);

    results.push({
      json: billingRecord as IDataObject,
    });
  }

  return results;
}

/**
 * Processes a single billing record based on usage data and matched price item
 */
export function processBillingRecord(
  usageRecord: UsageRecord,
  match: MatchResult,
  outputConfig: OutputConfig,
): BillingRecord {
  const billingRecord: BillingRecord = {};
  const priceItem = match.matched ? match.matchedItems[0] : {};

  // Process each output field
  for (const field of outputConfig.fields) {
    if (field.sourceType === 'usage' && field.sourceField) {
      // Copy from usage record
      billingRecord[field.name] = usageRecord[field.sourceField];
    } else if (field.sourceType === 'price' && field.sourceField && match.matched) {
      // Copy from price list item
      billingRecord[field.name] = priceItem[field.sourceField];
    } else if (field.sourceType === 'calculated' && field.formula) {
      // Calculate based on formula
      billingRecord[field.name] = calculateField(usageRecord, priceItem, field.formula);
    }
  }

  return billingRecord;
}

/**
 * Calculates a field value based on a formula (simplified for Phase 1)
 */
export function calculateField(
  usageRecord: UsageRecord,
  priceItem: PriceListItem,
  formula: string,
): number | string {
  // Simple case: multiply usage by unit price
  if (formula === 'usage * unitPrice') {
    const usage = typeof usageRecord.usage === 'number' ? usageRecord.usage : 0;
    const unitPrice = typeof priceItem.unitPrice === 'number' ? priceItem.unitPrice : 0;

    return usage * unitPrice;
  }

  // Return 0 for unsupported formulas in Phase 1
  return 0;
}

/**
 * Validates configuration without processing actual billing
 */
export async function validateConfiguration(
  this: IExecuteFunctions,
  priceListExample: IDataObject,
  usageExample: IDataObject,
  outputExample: IDataObject,
  matchConfig: MatchConfig,
): Promise<INodeExecutionData[]> {
  // Infer schemas from examples
  const priceListSchema = inferSchemaFromExample(priceListExample);
  const usageSchema = inferSchemaFromExample(usageExample);
  const outputSchema = inferSchemaFromExample(outputExample);

  // Create mock data for validation
  const mockPriceList = [priceListExample] as PriceListItem[];
  const mockUsageRecords = [usageExample] as UsageRecord[];

  // Create mock output config (simplified for Phase 1)
  const outputConfig: OutputConfig = {
    fields: getFieldNames(outputSchema).map((name) => ({
      name,
      sourceField: name,
      sourceType: 'usage', // Default to usage as source
    })),
  };

  // Perform validation
  const validationResult = validateAll(
    priceListSchema,
    usageSchema,
    outputSchema,
    matchConfig,
    mockPriceList,
    mockUsageRecords,
  );

  // Format the validation result as node output
  return [
    {
      json: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        priceListSchema,
        usageSchema,
        outputSchema,
      } as IDataObject,
    },
  ];
}
