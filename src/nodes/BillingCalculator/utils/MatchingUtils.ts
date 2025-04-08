import type {
  MatchConfig,
  MatchResult,
  PriceListItem,
  UsageRecord,
  ResourceMapperMatchConfig,
} from '../interfaces';
import type { IDataObject } from 'n8n-workflow';

/**
 * Key separator for composite keys
 */
const KEY_SEPARATOR = '|||';

/**
 * Creates an index for price list items for efficient lookup
 */
export function indexPriceList(
  priceList: PriceListItem[],
  matchConfig: MatchConfig,
): Map<string, PriceListItem[]> {
  const priceIndex = new Map<string, PriceListItem[]>();

  for (const priceItem of priceList) {
    // Support for legacy single field match
    const key =
      matchConfig.multiKeyMatch && matchConfig.priceListFields
        ? buildCompositeKeyFromItem(priceItem, matchConfig.priceListFields)
        : getMatchKeyFromItem(priceItem, matchConfig.priceListField);

    if (!key) continue;

    if (!priceIndex.has(key)) {
      priceIndex.set(key, []);
    }

    priceIndex.get(key)?.push(priceItem);
  }

  return priceIndex;
}

/**
 * Extracts match key from an item based on field name
 */
export function getMatchKeyFromItem(item: IDataObject, fieldName: string): string | null {
  const value = item[fieldName];

  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

/**
 * Builds a composite key from multiple fields in an item
 */
export function buildCompositeKeyFromItem(item: IDataObject, fieldNames: string[]): string | null {
  if (!fieldNames || !fieldNames.length) return null;

  const values: string[] = [];

  for (const field of fieldNames) {
    const value = item[field];

    // If any required field is missing, we can't create a valid composite key
    if (value === undefined || value === null) {
      return null;
    }

    values.push(String(value));
  }

  return values.join(KEY_SEPARATOR);
}

/**
 * Builds a match key from a usage record
 */
export function buildMatchKey(usageRecord: UsageRecord, matchConfig: MatchConfig): string | null {
  if (matchConfig.multiKeyMatch && matchConfig.usageFields) {
    return buildCompositeKeyFromItem(usageRecord, matchConfig.usageFields);
  }
  return getMatchKeyFromItem(usageRecord, matchConfig.usageField);
}

/**
 * Converts ResourceMapperMatchConfig to MatchConfig
 */
export function matchConfigFromResourceMapper(config: ResourceMapperMatchConfig): MatchConfig {
  // Handle multi-key matching if enabled
  if (config.multiKeyMatch && config.mappings.length > 0) {
    // Extract price list fields and usage fields from mappings
    const priceListFields: string[] = [];
    const usageFields: string[] = [];

    for (const mapping of config.mappings) {
      if (mapping.sourceType === 'priceList' && mapping.targetType === 'usage') {
        priceListFields.push(mapping.sourceField);
        usageFields.push(mapping.targetField);
      } else if (mapping.sourceType === 'usage' && mapping.targetType === 'priceList') {
        usageFields.push(mapping.sourceField);
        priceListFields.push(mapping.targetField);
      }
    }

    return {
      priceListField: priceListFields[0] || '', // Fallback for backward compatibility
      usageField: usageFields[0] || '', // Fallback for backward compatibility
      priceListFields,
      usageFields,
      allowMultipleMatches: false, // For now, we don't support multiple matches with multi-key
      defaultOnNoMatch: config.defaultOnNoMatch,
      multiKeyMatch: true,
    };
  }

  // Single field matching (legacy support)
  // Extract the first mapping for price list and usage
  let priceListField = '';
  let usageField = '';

  if (config.mappings.length > 0) {
    const mapping = config.mappings[0];
    if (mapping.sourceType === 'priceList' && mapping.targetType === 'usage') {
      priceListField = mapping.sourceField;
      usageField = mapping.targetField;
    } else if (mapping.sourceType === 'usage' && mapping.targetType === 'priceList') {
      usageField = mapping.sourceField;
      priceListField = mapping.targetField;
    }
  }

  return {
    priceListField,
    usageField,
    priceListFields: [priceListField],
    usageFields: [usageField],
    allowMultipleMatches: false,
    defaultOnNoMatch: config.defaultOnNoMatch,
    multiKeyMatch: false,
  };
}

/**
 * Finds matching price list items for a given usage record
 */
export function findMatch(
  usageRecord: UsageRecord,
  priceIndex: Map<string, PriceListItem[]>,
  matchConfig: MatchConfig,
): MatchResult {
  const matchKey = buildMatchKey(usageRecord, matchConfig);

  if (!matchKey) {
    const fieldName =
      matchConfig.multiKeyMatch && matchConfig.usageFields
        ? `fields [${matchConfig.usageFields.join(', ')}]`
        : `field "${matchConfig.usageField}"`;

    return {
      matched: false,
      multipleMatches: false,
      matchedItems: [],
      errorMessage: `No match key found in usage record for ${fieldName}`,
    };
  }

  const matchedItems = priceIndex.get(matchKey) || [];

  if (matchedItems.length === 0) {
    return {
      matched: false,
      multipleMatches: false,
      matchedItems: [],
      errorMessage: `No price list items found for key "${matchKey}"`,
    };
  }

  const isMultipleMatch = matchedItems.length > 1;

  if (isMultipleMatch && !matchConfig.allowMultipleMatches) {
    return {
      matched: true,
      multipleMatches: true,
      matchedItems,
      errorMessage: `Multiple matches found for key "${matchKey}" but multiple matches are not allowed`,
    };
  }

  return {
    matched: true,
    multipleMatches: isMultipleMatch,
    matchedItems,
    errorMessage: undefined,
  };
}

/**
 * Handles the case when no match is found
 */
export function handleNoMatch(usageRecord: UsageRecord, matchConfig: MatchConfig): MatchResult {
  if (matchConfig.defaultOnNoMatch === 'error') {
    return {
      matched: false,
      multipleMatches: false,
      matchedItems: [],
      errorMessage: 'No matching price list item found for usage record',
    };
  }

  return {
    matched: false,
    multipleMatches: false,
    matchedItems: [],
    errorMessage: undefined,
  };
}
