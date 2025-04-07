import type { MatchConfig, MatchResult, PriceListItem, UsageRecord } from '../interfaces';
import type { IDataObject } from 'n8n-workflow';

/**
 * Creates an index for price list items for efficient lookup
 */
export function indexPriceList(
  priceList: PriceListItem[],
  matchConfig: MatchConfig,
): Map<string, PriceListItem[]> {
  const priceIndex = new Map<string, PriceListItem[]>();

  for (const priceItem of priceList) {
    const key = getMatchKeyFromItem(priceItem, matchConfig.priceListField);

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
 * Builds a match key from a usage record
 */
export function buildMatchKey(usageRecord: UsageRecord, matchConfig: MatchConfig): string | null {
  return getMatchKeyFromItem(usageRecord, matchConfig.usageField);
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
    return {
      matched: false,
      multipleMatches: false,
      matchedItems: [],
      errorMessage: `No match key found in usage record for field "${matchConfig.usageField}"`,
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
