import type { MatchConfig, MatchResult, Schema, UsageRecord, PriceListItem } from '../interfaces';
import { validateObjectAgainstSchema } from './SchemaUtils';
import { findMatch, indexPriceList } from './MatchingUtils';
import type { IDataObject } from 'n8n-workflow';

/**
 * Validates match configuration
 */
export function validateMatchConfig(
  matchConfig: MatchConfig,
  priceListSchema: Schema,
  usageSchema: Schema,
): string[] {
  const errors: string[] = [];

  // Check if the match fields exist in the respective schemas
  const priceListFields = priceListSchema.fields.map((field) => field.name);
  if (!priceListFields.includes(matchConfig.priceListField)) {
    errors.push(
      `Price list match field "${matchConfig.priceListField}" does not exist in the price list schema`,
    );
  }

  const usageFields = usageSchema.fields.map((field) => field.name);
  if (!usageFields.includes(matchConfig.usageField)) {
    errors.push(`Usage match field "${matchConfig.usageField}" does not exist in the usage schema`);
  }

  return errors;
}

/**
 * Validates that usage data has at least one match in price list
 */
export function validateUsageMatches(
  usageRecords: UsageRecord[],
  priceList: PriceListItem[],
  matchConfig: MatchConfig,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const priceIndex = indexPriceList(priceList, matchConfig);
  let valid = true;

  // Check each usage record for a matching price list item
  for (let i = 0; i < usageRecords.length; i++) {
    const usageRecord = usageRecords[i];
    const matchResult = findMatch(usageRecord, priceIndex, matchConfig);

    if (!matchResult.matched) {
      valid = false;
      errors.push(
        `Usage record at index ${i} has no matching price list item: ${matchResult.errorMessage}`,
      );
    } else if (matchResult.multipleMatches && !matchConfig.allowMultipleMatches) {
      valid = false;
      errors.push(
        `Usage record at index ${i} has multiple matching price list items but multiple matches are not allowed`,
      );
    }
  }

  return { valid, errors };
}

/**
 * Performs comprehensive validation of all components
 */
export function validateAll(
  priceListSchema: Schema,
  usageSchema: Schema,
  outputSchema: Schema,
  matchConfig: MatchConfig,
  priceList: PriceListItem[],
  usageRecords: UsageRecord[],
): { valid: boolean; errors: { [key: string]: string[] } } {
  const errors: { [key: string]: string[] } = {
    priceListSchema: [],
    usageSchema: [],
    outputSchema: [],
    matchConfig: [],
    priceListData: [],
    usageData: [],
    matches: [],
  };

  // Validate match configuration
  errors.matchConfig = validateMatchConfig(matchConfig, priceListSchema, usageSchema);

  // Validate price list data against schema
  for (let i = 0; i < priceList.length; i++) {
    const itemErrors = validateObjectAgainstSchema(priceListSchema, priceList[i]);
    if (itemErrors.length > 0) {
      errors.priceListData.push(
        `Price list item at index ${i} has validation errors: ${itemErrors.join(', ')}`,
      );
    }
  }

  // Validate usage data against schema
  for (let i = 0; i < usageRecords.length; i++) {
    const itemErrors = validateObjectAgainstSchema(usageSchema, usageRecords[i]);
    if (itemErrors.length > 0) {
      errors.usageData.push(
        `Usage record at index ${i} has validation errors: ${itemErrors.join(', ')}`,
      );
    }
  }

  // Validate usage matches
  const matchValidation = validateUsageMatches(usageRecords, priceList, matchConfig);
  errors.matches = matchValidation.errors;

  // Determine overall validity
  const valid = Object.values(errors).every((errorList) => errorList.length === 0);

  return { valid, errors };
}
