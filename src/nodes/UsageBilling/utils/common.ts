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
 * Normalise data that may be provided as:
 * - String path to look up on a fallback object
 * - JSON string representing an object or array
 * - Direct object or array (e.g. from an expression)
 */
export function normaliseDataInput<T>(input: unknown, fallbackData?: IDataObject): T[] {
  let data = input;

  // When input is blank string or undefined, fall back to provided data
  if ((typeof data === 'string' && data.trim() === '') || data === undefined) {
    data = fallbackData;
  }

  // If input is a string, decide whether it's JSON or a path
  if (typeof data === 'string') {
    const trimmed = data.trim();
    const looksJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));

    if (looksJson) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = [];
      }
    } else if (fallbackData) {
      data = _.get(fallbackData, trimmed);
    } else {
      data = [];
    }
  }

  // If we have an object, check for an embedded array property (common when data is wrapped)
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const arrayProps = Object.keys(data).filter((key) =>
      Array.isArray((data as IDataObject)[key]),
    );

    if (arrayProps.length > 0) {
      const preferredPropNames = [
        'priceList',
        'pricelist',
        'prices',
        'items',
        'records',
        'data',
        'usage',
        'usageData',
        'usageItems',
      ];

      const preferredMatch = arrayProps.find((prop) =>
        preferredPropNames.some((name) => prop.toLowerCase().includes(name.toLowerCase())),
      );

      const selectedProp = preferredMatch ?? arrayProps[0];
      data = (data as IDataObject)[selectedProp];
    }
  }

  // Arrays are returned as-is
  if (Array.isArray(data)) {
    return data as T[];
  }

  // Wrap single objects
  if (typeof data === 'object' && data !== null) {
    return [data as T];
  }

  // Anything else becomes empty
  return [];
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
  // Automatic mode: add all fields from both pricelist and usage with prefixes
  if (outputConfig.automatic === true) {
    const pricelistPrefix = outputConfig.pricelistFieldPrefix || 'price_';
    const usagePrefix = outputConfig.usageFieldPrefix || 'usage_';

    // Get all fields from pricelist record
    for (const key of Object.keys(priceRecord)) {
      const value = priceRecord[key];
      if (value !== undefined) {
        const targetField = `${pricelistPrefix}${key}`;
        // Only add if not already present (to avoid overwriting calculated values)
        if (!(targetField in outputRecord)) {
          outputRecord[targetField] = value;
        }
      }
    }

    // Get all fields from usage record
    for (const key of Object.keys(usageRecord)) {
      const value = usageRecord[key];
      if (value !== undefined) {
        const targetField = `${usagePrefix}${key}`;
        // Only add if not already present (to avoid overwriting calculated values)
        if (!(targetField in outputRecord)) {
          outputRecord[targetField] = value;
        }
      }
    }

    return;
  }

  // Manual mode: use the configured field mappings
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
