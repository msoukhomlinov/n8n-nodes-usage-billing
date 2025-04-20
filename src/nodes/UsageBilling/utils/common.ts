import type { IDataObject } from 'n8n-workflow';
import type {
  CalculatedRecord,
  MatchFieldPair,
  PriceListItem,
  UsageRecord,
  OutputFieldConfig,
} from '../interfaces';
import _ from 'lodash';

/**
 * Helper function to get a property from an object case-insensitively
 */
export function getPropertyCaseInsensitive(obj: Record<string, unknown>, key: string): unknown {
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
 * Generic function to extract and normalize data from various input sources
 * Used to handle both price list and usage data extraction with the same pattern
 */
export function extractAndNormalizeData<T>(
  inputData: IDataObject,
  fieldPath: string | unknown,
): T[] {
  let data: unknown;

  // Handle different ways data can be provided
  if (typeof fieldPath === 'string' && fieldPath.trim().length > 0) {
    // If fieldPath is a string, treat it as a path to look up in the inputData
    data = _.get(inputData, fieldPath);
  } else {
    // If fieldPath is not a string or empty, it's likely the actual data
    data = fieldPath;
  }

  // Handle case where the data might be a string (JSON)
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

  return data as T[];
}

/**
 * Add match fields from a record to the output
 */
export function addMatchFieldsToOutput(
  outputRecord: CalculatedRecord,
  sourceRecord: PriceListItem | UsageRecord,
  matchFields: MatchFieldPair[],
  fieldType: 'pricelist' | 'usage',
  prefix: string,
): void {
  for (const matchField of matchFields) {
    const fieldName = fieldType === 'pricelist' ? matchField.priceListField : matchField.usageField;
    const value = getPropertyCaseInsensitive(sourceRecord, fieldName) as
      | string
      | number
      | boolean
      | null
      | undefined;

    if (value !== undefined) {
      outputRecord[`${prefix}${fieldName}`] = value;
    }
  }
}

/**
 * Add extra fields to the output record
 */
export function addExtraFieldsToOutput(
  outputRecord: CalculatedRecord,
  priceRecord: PriceListItem,
  usageRecord: UsageRecord,
  outputConfig: OutputFieldConfig,
): void {
  if (!outputConfig.includeFields || outputConfig.includeFields.length === 0) return;

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
