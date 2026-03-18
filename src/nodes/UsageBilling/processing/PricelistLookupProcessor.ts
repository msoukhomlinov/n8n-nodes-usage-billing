import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type {
  PriceListItem,
  UsageRecord,
  CalculatedRecord,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
  CustomerPricingConfig,
} from '../interfaces';
import type { StandardizedError } from '../utils/errorHandling';
import { multiply, subtract, divide } from '../utils/calculations';
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
  normaliseDataInput,
  sortObjectKeysAlphabetically,
} from '../utils/common';
import { logger } from '../utils/LoggerHelper';
import Decimal from 'decimal.js';

/**
 * Hash index for O(1) pricelist lookups.
 * Key = concatenated lowercase match field values separated by \0
 */
interface PricelistIndex {
  /** Generic pricelist items (no customer ID set), keyed by match fields */
  generic: Map<string, PriceListItem[]>;
  /** Customer-specific items, keyed by customerID + \0 + match fields */
  customerSpecific: Map<string, PriceListItem[]>;
}

/**
 * Build a hash key from a record's match field values
 */
function buildMatchKey(
  record: PriceListItem | UsageRecord,
  fields: string[],
): string | null {
  const parts: string[] = [];
  for (const field of fields) {
    const value = getPropertyCaseInsensitive(record, field);
    if (value === undefined || value === null) {
      return null;
    }
    parts.push(String(value).toLowerCase());
  }
  return parts.join('\0');
}

/**
 * Build hash indexes from the pricelist for O(1) lookups
 */
function buildPricelistIndex(
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
  customerPricingConfig?: CustomerPricingConfig,
): PricelistIndex {
  const index: PricelistIndex = {
    generic: new Map(),
    customerSpecific: new Map(),
  };

  const priceFieldNames = matchFields.map((mf) => mf.priceListField);
  const customerIdField = customerPricingConfig?.customerIdPriceListField;
  const customerPricingEnabled = customerPricingConfig?.useCustomerSpecificPricing === true;

  for (const priceItem of priceList) {
    const matchKey = buildMatchKey(priceItem, priceFieldNames);
    if (matchKey === null) {
      continue; // Skip items that don't have all match fields
    }

    // Determine if this is a customer-specific row
    if (customerPricingEnabled && customerIdField) {
      const customerId = getPropertyCaseInsensitive(priceItem, customerIdField);
      const hasCustomerId =
        customerId !== undefined && customerId !== null && String(customerId).trim() !== '';

      if (hasCustomerId) {
        const customerKey = `${String(customerId).toLowerCase()}\0${matchKey}`;
        const existing = index.customerSpecific.get(customerKey) || [];
        existing.push(priceItem);
        index.customerSpecific.set(customerKey, existing);
        continue;
      }
    }

    // Generic (non-customer-specific) entry
    const existing = index.generic.get(matchKey) || [];
    existing.push(priceItem);
    index.generic.set(matchKey, existing);
  }

  return index;
}

// Define extended UsageRecord type containing original record and match/error details
type ExtendedUsageRecord = {
  originalRecord: UsageRecord; // Keep original data separate
  matchReason?: string;
  matchCount?: number;
  matchedFields?: string[];
  matchedPriceItems?: PriceListItem[];
  processingErrorDetails?: StandardizedError;
  // Customer-specific pricing fields
  isCustomerSpecificMatch?: boolean;
  customerIdField?: string;
  customerId?: unknown;
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
    logger.info('PriceList Lookup: Starting process');
    logger.debug(
      `PriceList Lookup: Received ${items.length} items, FieldNames - PriceList: ${String(priceListFieldName)}, UsageData: ${String(usageDataFieldName)}`,
    );
    logger.debug(`PriceList Lookup: Match fields configuration: ${JSON.stringify(matchFields)}`);

    // Validate customer pricing config if enabled
    if (calculationConfig.customerPricingConfig?.useCustomerSpecificPricing) {
      logger.info('PriceList Lookup: Customer-specific pricing is enabled');

      if (!calculationConfig.customerPricingConfig.customerIdPriceListField) {
        logger.warn('PriceList Lookup: Missing customer ID field for price list');
        const error = createStandardizedError(
          ErrorCode.MISSING_REQUIRED_FIELD,
          'Customer ID Field for Price List is required when Customer-Specific Pricing is enabled',
          ErrorCategory.INPUT_ERROR,
          {
            suggestions: [
              'Provide a valid field name for the customer ID in the price list',
              'This field should exist in your price list data',
            ],
          },
        );
        errorRecords.push({ json: { error } });
        return [[], errorRecords];
      }

      if (!calculationConfig.customerPricingConfig.customerIdUsageField) {
        logger.warn('PriceList Lookup: Missing customer ID field for usage data');
        const error = createStandardizedError(
          ErrorCode.MISSING_REQUIRED_FIELD,
          'Customer ID Field for Usage Data is required when Customer-Specific Pricing is enabled',
          ErrorCategory.INPUT_ERROR,
          {
            suggestions: [
              'Provide a valid field name for the customer ID in the usage data',
              'This field should exist in your usage data',
            ],
          },
        );
        errorRecords.push({ json: { error } });
        return [[], errorRecords];
      }
    }

    // Basic input validation
    if (items.length === 0 || !items[0]?.json) {
      logger.warn('PriceList Lookup: No input data found');
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
      logger.warn(
        `PriceList Lookup: Invalid match fields configuration - ${matchFieldsValidation.error.message}`,
      );
      errorRecords.push({ json: { error: matchFieldsValidation.error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Validate required calculation fields
    if (!calculationConfig.quantityField) {
      logger.warn('PriceList Lookup: Missing required quantity field');
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

    // Validate cost price field
    if (!calculationConfig.costPriceField) {
      logger.warn('PriceList Lookup: Missing required cost price field');
      const error = createStandardizedError(
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Cost Price Field is required for price lookup',
        ErrorCategory.INPUT_ERROR,
        {
          context: { calculationConfig },
          suggestions: [
            'Provide a valid field name for the cost price field in the calculation settings',
            'This field should exist in your price list data',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Validate sell price field
    if (!calculationConfig.sellPriceField) {
      logger.warn('PriceList Lookup: Missing required sell price field');
      const error = createStandardizedError(
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Sell Price Field is required for price lookup',
        ErrorCategory.INPUT_ERROR,
        {
          context: { calculationConfig },
          suggestions: [
            'Provide a valid field name for the sell price field in the calculation settings',
            'This field should exist in your price list data',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    // Extract the shared price list once from the first item
    logger.debug('PriceList Lookup: Extracting price list data');
    const priceList = extractPriceListData(items[0].json, priceListFieldName);

    // Validate price list structure
    if (!priceList || priceList.length === 0) {
      logger.warn('PriceList Lookup: Price list data is empty or invalid');
      const error = createStandardizedError(
        ErrorCode.INVALID_PRICE_LIST_FORMAT,
        'Price list data is empty or invalid',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Check that your price list data is properly formatted',
            'Ensure the price list contains at least one item',
            'Verify the Price List Field Name parameter or expression is correct',
            'If using an expression, ensure it resolves to an array (e.g., {{ $(\'Import Pricing\').all() }})',
          ],
        },
      );
      errorRecords.push({ json: { error } });
      // Return empty valid records first, then invalid records
      return [[], errorRecords];
    }

    logger.info(
      `PriceList Lookup: Successfully extracted price list with ${priceList.length} items`,
    );

    // Build hash index for O(1) lookups
    const pricelistIndex = buildPricelistIndex(
      priceList,
      matchFields,
      calculationConfig.customerPricingConfig,
    );
    logger.debug(
      `PriceList Lookup: Built hash index - ${pricelistIndex.generic.size} generic keys, ${pricelistIndex.customerSpecific.size} customer-specific keys`,
    );

    // Build usage batches: either a shared expression result or per-item extraction
    const sharedUsageData =
      typeof usageDataFieldName === 'string'
        ? null
        : normaliseDataInput<UsageRecord>(usageDataFieldName);

    const usageBatches =
      sharedUsageData && sharedUsageData.length > 0
        ? [{ usageData: sharedUsageData, itemIndex: 0 }]
        : items.map((item, i) => ({
            usageData: normaliseDataInput<UsageRecord>(usageDataFieldName, item.json),
            itemIndex: i,
          }));

    for (const batch of usageBatches) {
      const usageData = batch.usageData;

      // Validate usage data structure
      const usageDataValidation = validateUsageDataStructure(usageData);
      if (!usageDataValidation.valid && usageDataValidation.error) {
        logger.warn(`PriceList Lookup: Invalid usage data structure in item ${batch.itemIndex}`);
        errorRecords.push({
          json: {
            error: usageDataValidation.error,
            itemIndex: batch.itemIndex,
          },
        });
        continue; // Skip this batch and process the next one
      }

      logger.info(
        `PriceList Lookup: Processing ${usageData.length} usage records for item ${batch.itemIndex + 1}`,
      );

      // Process each usage record for this batch against the shared price list
      const matchedRecords: CalculatedRecord[] = [];

      for (const usageRecord of usageData) {
        // Find matching price records using hash index for O(1) lookup
        const {
          match,
          genericMatch,
          isCustomerSpecificMatch,
          multipleCustomerMatches,
          customerMatchCount,
        } = findMatchingPriceRecords(
          usageRecord,
          priceList,
          matchFields,
          calculationConfig.customerPricingConfig,
          pricelistIndex,
        );

        // Check if we have a valid match
        if (match) {
          // Process matched record
          const calculated = calculateAmount(
            usageRecord,
            match,
            genericMatch,
            isCustomerSpecificMatch,
            calculationConfig,
            outputConfig,
            matchFields,
          );

          // Add information about match type for customer-specific pricing
          if (
            calculationConfig.customerPricingConfig?.useCustomerSpecificPricing &&
            isCustomerSpecificMatch
          ) {
            // Flag this record as using customer-specific pricing
            calculated.isCustomPricing = true;
            calculated.customerIdField =
              calculationConfig.customerPricingConfig.customerIdUsageField;
            const customerId = getPropertyCaseInsensitive(
              usageRecord,
              calculationConfig.customerPricingConfig.customerIdUsageField,
            );
            if (typeof customerId === 'string' || typeof customerId === 'number') {
              calculated.customerId = customerId;
            }
          }

          matchedRecords.push(calculated);
        } else {
          // Create unmatched record
          const unmatchedRecord: ExtendedUsageRecord = {
            originalRecord: { ...usageRecord },
          };

          // Handle customer-specific pricing errors
          if (
            calculationConfig.customerPricingConfig?.useCustomerSpecificPricing &&
            multipleCustomerMatches
          ) {
            unmatchedRecord.matchReason = 'Multiple customer-specific matches found';
            unmatchedRecord.matchCount = customerMatchCount;
            unmatchedRecord.isCustomerSpecificMatch = true;

            // Get the customer ID for context
            unmatchedRecord.customerIdField =
              calculationConfig.customerPricingConfig.customerIdUsageField;
            const customerId = getPropertyCaseInsensitive(
              usageRecord,
              calculationConfig.customerPricingConfig.customerIdUsageField,
            );
            unmatchedRecord.customerId = customerId;

            // Create customer-specific error
            unmatchedRecord.processingErrorDetails = createStandardizedError(
              ErrorCode.MULTIPLE_CUSTOMER_MATCHES_FOUND,
              `Found ${customerMatchCount} price list entries for the same customer ID - ambiguous match`,
              ErrorCategory.PROCESSING_ERROR,
              {
                context: {
                  customerIdField: calculationConfig.customerPricingConfig.customerIdUsageField,
                  customerId: customerId,
                  matchCount: customerMatchCount,
                },
                suggestions: [
                  'Check your price list for duplicate entries with the same customer ID',
                  'Ensure each customer ID has at most one price list entry for each product',
                  'Add additional match fields to differentiate between similar products for the same customer',
                ],
              },
            );
          } else {
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
          }

          // Add to tracking collections
          // noMatchRecords.push(unmatchedRecord); // Temporarily commented out
          allUnmatchedRecords.push(unmatchedRecord);
        }
      }

      // Add this batch's results to the overall collections
      allMatchedRecords.push(...matchedRecords); // Collect matched records
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

    logger.info(
      `PriceList Lookup: Process completed - Matched: ${allMatchedRecords.length}, Unmatched: ${allUnmatchedRecords.length}`,
    );

    // Return successful records first, then unmatched/error records
    const successOutputFinal: INodeExecutionData[] = [];
    if (allMatchedRecords.length > 0) {
      // Create individual items for each matched record
      for (const record of allMatchedRecords) {
        successOutputFinal.push({
          json: record,
        });
      }
    }

    // Create a simpler error object without context
    if (allUnmatchedRecords.length > 0) {
      // Create error output for each individual unmatched record
      for (const unmatchedRecord of allUnmatchedRecords) {
        // Create a more descriptive match reason that includes matched/unmatched fields
        let detailedMatchReason = unmatchedRecord.matchReason || 'Unknown match issue';

        // For partial matches, enhance the reason with both matched and unmatched fields
        if (
          unmatchedRecord.matchReason?.includes('Partial match') &&
          unmatchedRecord.matchedFields &&
          unmatchedRecord.matchedFields.length > 0
        ) {
          // Get all configured match fields
          const allConfiguredMatchFields = matchFields.map((field) => field.usageField);
          const unmatchedFields = allConfiguredMatchFields.filter(
            (field) => !unmatchedRecord.matchedFields?.includes(field),
          );

          // Create matched fields pairs showing both price list and usage fields
          const matchedFieldPairs = unmatchedRecord.matchedFields.map((usageField) => {
            const matchConfig = matchFields.find((config) => config.usageField === usageField);
            return matchConfig ? `${matchConfig.priceListField}=${usageField}` : usageField;
          });

          // Create unmatched fields pairs showing both price list and usage fields
          const unmatchedFieldPairs = unmatchedFields.map((usageField) => {
            const matchConfig = matchFields.find((config) => config.usageField === usageField);
            return matchConfig ? `${matchConfig.priceListField}=${usageField}` : usageField;
          });

          // Create a detailed match reason with price list and usage field mappings
          detailedMatchReason = `Partial match - Matched pairs (price list=usage): ${matchedFieldPairs.join(', ')}; Unmatched pairs: ${unmatchedFieldPairs.join(', ')}`;
        }

        // Create a simplified error without context
        const errorCode =
          unmatchedRecord.matchReason === 'Multiple exact matches found'
            ? ErrorCode.MULTIPLE_MATCHES_FOUND
            : ErrorCode.NO_MATCH_FOUND;
        const errorWithoutContext = {
          code: errorCode,
          category: ErrorCategory.PROCESSING_ERROR,
          message: detailedMatchReason,
        };

        // Flatten error structure and remove redundant fields
        errorRecords.push({
          json: {
            // Include original record data
            ...unmatchedRecord.originalRecord,
            // Add match count
            matchCount: unmatchedRecord.matchCount || 0,
            // Flatten error fields to top level
            code: errorWithoutContext.code,
            category: errorWithoutContext.category,
            message: detailedMatchReason,
            // matchReason removed as it duplicates message
          },
        });
      }
    }

    return [successOutputFinal, errorRecords];
  } catch (error) {
    logger.error(
      `PriceList Lookup: Error processing data: ${(error as Error).message}`,
      error as Error,
    );

    // Create standardized error
    const standardizedError = handleError(error as Error, {
      priceListFieldName,
      usageDataFieldName,
      matchFields,
      calculationConfig,
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
 * Extract price list data from input based on field name or direct data
 */
function extractPriceListData(
  inputData: IDataObject,
  fieldName: string | unknown,
): PriceListItem[] {
  try {
    logger.debug('PriceList Lookup: Extracting price list data');

    const priceList = normaliseDataInput<PriceListItem>(fieldName, inputData);

    return priceList;
  } catch (error) {
    logger.error(
      `PriceList Lookup: Error extracting price list data: ${(error as Error).message}`,
      error as Error,
    );
    throw error;
  }
}

/**
 * Find matching price list records for a usage record
 */
function findMatchingPriceRecords(
  usageRecord: UsageRecord,
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
  customerPricingConfig?: CustomerPricingConfig,
  pricelistIndex?: PricelistIndex,
): {
  match: PriceListItem | null;
  genericMatch: PriceListItem | null;
  isCustomerSpecificMatch: boolean;
  multipleCustomerMatches: boolean;
  customerMatchCount: number;
} {
  try {
    logger.debug(
      `PriceList Lookup: Finding matches for usage record using ${matchFields.length} match fields`,
    );

    // Default return object
    const result = {
      match: null as PriceListItem | null,
      genericMatch: null as PriceListItem | null,
      isCustomerSpecificMatch: false,
      multipleCustomerMatches: false,
      customerMatchCount: 0,
    };

    if (matchFields.length === 0 || !priceList || priceList.length === 0) {
      return result;
    }

    // Build usage match key (try usageField first, fallback to priceListField)
    const usageFieldNames = matchFields.map((mf) => mf.usageField);
    let usageKey = buildMatchKey(usageRecord, usageFieldNames);
    if (usageKey === null) {
      // Fallback: try using priceListField names on the usage record
      const priceFieldNames = matchFields.map((mf) => mf.priceListField);
      usageKey = buildMatchKey(usageRecord, priceFieldNames);
    }

    // Use hash index for O(1) lookup when available and key can be built
    if (pricelistIndex && usageKey !== null) {
      // First try customer-specific matching if enabled
      if (customerPricingConfig?.useCustomerSpecificPricing) {
        const customerIdUsageField = customerPricingConfig.customerIdUsageField;
        const customerIdValue = getPropertyCaseInsensitive(usageRecord, customerIdUsageField);

        if (customerIdValue !== undefined) {
          logger.debug(
            `PriceList Lookup: Performing customer-specific hash lookup with customer ID from field "${customerIdUsageField}"`,
          );

          const customerKey = `${String(customerIdValue).toLowerCase()}\0${usageKey}`;
          const customerSpecificMatches = pricelistIndex.customerSpecific.get(customerKey) || [];

          result.customerMatchCount = customerSpecificMatches.length;

          if (customerSpecificMatches.length === 1) {
            logger.debug('PriceList Lookup: Found exactly one customer-specific match via hash');
            result.match = customerSpecificMatches[0];
            result.isCustomerSpecificMatch = true;
            // Find generic match for min sell price comparison
            const genericMatches = pricelistIndex.generic.get(usageKey) || [];
            result.genericMatch = genericMatches.length === 1 ? genericMatches[0] : null;
            if (genericMatches.length > 1) {
              logger.warn(
                `PriceList Lookup: Found ${genericMatches.length} generic matches for min sell baseline - cannot determine standard price`,
              );
            }
            return result;
          }

          if (customerSpecificMatches.length > 1) {
            logger.warn(
              `PriceList Lookup: Found ${customerSpecificMatches.length} customer-specific matches via hash, which is ambiguous`,
            );
            result.multipleCustomerMatches = true;
            return result;
          }

          // No customer-specific match, fall through to generic matching
          logger.debug(
            'PriceList Lookup: No customer-specific match found via hash, falling back to generic matching',
          );
        }
      }

      // Generic matching via hash index
      const genericMatches = pricelistIndex.generic.get(usageKey) || [];

      if (genericMatches.length === 1) {
        result.match = genericMatches[0];
        return result;
      }

      // No match or multiple matches - return with no match
      return result;
    }

    // Fallback: linear scan when index is unavailable or key couldn't be built
    // First try customer-specific matching if enabled
    if (customerPricingConfig?.useCustomerSpecificPricing) {
      const customerIdUsageField = customerPricingConfig.customerIdUsageField;
      const customerIdPriceListField = customerPricingConfig.customerIdPriceListField;

      // Get customer ID from usage record
      const customerIdValue = getPropertyCaseInsensitive(usageRecord, customerIdUsageField);

      if (customerIdValue !== undefined) {
        logger.debug(
          `PriceList Lookup: Performing customer-specific match with customer ID from field "${customerIdUsageField}"`,
        );

        // Find customer-specific matches
        const customerSpecificMatches: PriceListItem[] = [];

        for (const priceItem of priceList) {
          // Match on customer ID first
          const priceCustomerId = getPropertyCaseInsensitive(priceItem, customerIdPriceListField);

          // Skip if customer ID doesn't match
          if (
            priceCustomerId === undefined ||
            (typeof priceCustomerId === 'string' && typeof customerIdValue === 'string'
              ? priceCustomerId.toLowerCase() !== customerIdValue.toLowerCase()
              : priceCustomerId !== customerIdValue)
          ) {
            continue;
          }

          // Now check all other match fields
          if (recordMatchesAllFields(priceItem, usageRecord, matchFields)) {
            customerSpecificMatches.push(priceItem);
          }
        }

        // Save match count for reporting
        result.customerMatchCount = customerSpecificMatches.length;

        // Exactly one customer-specific match found
        if (customerSpecificMatches.length === 1) {
          logger.debug('PriceList Lookup: Found exactly one customer-specific match');
          result.match = customerSpecificMatches[0];
          result.isCustomerSpecificMatch = true;
          // Also find the generic (non-customer) match for min sell price comparison
          result.genericMatch = findGenericMatch(
            usageRecord,
            priceList,
            matchFields,
            customerPricingConfig,
          );
          return result;
        }

        // Multiple customer-specific matches found
        if (customerSpecificMatches.length > 1) {
          logger.warn(
            `PriceList Lookup: Found ${customerSpecificMatches.length} customer-specific matches, which is ambiguous`,
          );
          result.multipleCustomerMatches = true;
          return result;
        }

        // No customer-specific match, fall back to regular matching
        logger.debug(
          'PriceList Lookup: No customer-specific match found, falling back to regular matching',
        );
      }
    }

    // Regular matching logic (linear scan)
    const matchedItems: PriceListItem[] = [];

    // Determine if we should skip customer-specific rows during generic matching
    const customerSpecificEnabled = customerPricingConfig?.useCustomerSpecificPricing === true;
    const customerIdPriceListField = customerPricingConfig?.customerIdPriceListField;

    for (const priceItem of priceList) {
      // If customer-specific pricing is enabled, ignore rows that contain a customer ID
      if (customerSpecificEnabled && customerIdPriceListField) {
        const priceCustomerId = getPropertyCaseInsensitive(priceItem, customerIdPriceListField);
        const hasCustomerId =
          priceCustomerId !== undefined &&
          priceCustomerId !== null &&
          String(priceCustomerId).trim() !== '';

        if (hasCustomerId) {
          logger.debug(
            `PriceList Lookup: Skipping customer-specific price item during generic matching (customer ID field "${customerIdPriceListField}")`,
          );
          continue;
        }
      }

      if (recordMatchesAllFields(priceItem, usageRecord, matchFields)) {
        matchedItems.push(priceItem);
      }
    }

    // Check if we have exactly one match
    if (matchedItems.length === 1) {
      result.match = matchedItems[0];
      return result;
    }

    // No matches or multiple matches
    return result;
  } catch (error) {
    logger.error(
      `PriceList Lookup: Error finding matching price records: ${(error as Error).message}`,
      error as Error,
    );
    throw error;
  }
}

/**
 * Check if a price item matches all match fields against a usage record
 */
function recordMatchesAllFields(
  priceItem: PriceListItem,
  usageRecord: UsageRecord,
  matchFields: MatchFieldPair[],
): boolean {
  for (const matchField of matchFields) {
    const priceValue = getPropertyCaseInsensitive(priceItem, matchField.priceListField);
    let usageValue = getPropertyCaseInsensitive(usageRecord, matchField.usageField);
    // Fallback: if usage field is missing, try the price list field name
    if (usageValue === undefined) {
      usageValue = getPropertyCaseInsensitive(usageRecord, matchField.priceListField);
    }

    if (priceValue === undefined || usageValue === undefined) {
      return false;
    }

    if (typeof priceValue === 'string' && typeof usageValue === 'string') {
      if (priceValue.toLowerCase() !== usageValue.toLowerCase()) {
        return false;
      }
    } else if (priceValue !== usageValue) {
      return false;
    }
  }
  return true;
}

/**
 * Find the generic (non-customer-specific) match for a usage record.
 * Used to retrieve the standard pricelist price for min sell enforcement.
 */
function findGenericMatch(
  usageRecord: UsageRecord,
  priceList: PriceListItem[],
  matchFields: MatchFieldPair[],
  customerPricingConfig?: CustomerPricingConfig,
): PriceListItem | null {
  const customerIdPriceListField = customerPricingConfig?.customerIdPriceListField;
  const matchedItems: PriceListItem[] = [];

  for (const priceItem of priceList) {
    // Skip customer-specific rows
    if (customerIdPriceListField) {
      const priceCustomerId = getPropertyCaseInsensitive(priceItem, customerIdPriceListField);
      const hasCustomerId =
        priceCustomerId !== undefined &&
        priceCustomerId !== null &&
        String(priceCustomerId).trim() !== '';
      if (hasCustomerId) {
        continue;
      }
    }

    if (recordMatchesAllFields(priceItem, usageRecord, matchFields)) {
      matchedItems.push(priceItem);
    }
  }

  if (matchedItems.length === 1) {
    return matchedItems[0];
  }
  if (matchedItems.length > 1) {
    logger.warn(
      `PriceList Lookup: Found ${matchedItems.length} generic matches for min sell baseline - cannot determine standard price`,
    );
  }
  return null;
}

/**
 * Calculate cost and price amounts based on usage quantity and price list rates
 */
function calculateAmount(
  usageRecord: UsageRecord,
  priceRecord: PriceListItem,
  genericPriceRecord: PriceListItem | null,
  isCustomerSpecificMatch: boolean,
  calculationConfig: CalculationConfig,
  outputConfig: OutputFieldConfig,
  matchFields: MatchFieldPair[],
): CalculatedRecord {
  try {
    logger.debug(
      `PriceList Lookup: Calculating amounts using ${calculationConfig.quantityField} quantity field`,
    );

    // Create the output record
    const outputRecord: CalculatedRecord = {};

    // Always include the customer-specific pricing fields for consistent output schema
    // These will be overridden later if this is a customer-specific match
    outputRecord.isCustomPricing = false;
    outputRecord.customerIdField = '';
    outputRecord.customerId = '';

    // Get quantity value using case-insensitive property lookup
    const rawQuantity = getPropertyCaseInsensitive(usageRecord, calculationConfig.quantityField);
    if (rawQuantity === undefined || rawQuantity === null) {
      throw new Error(
        `Quantity field "${calculationConfig.quantityField}" not found in usage record`,
      );
    }
    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity)) {
      throw new Error(
        `Quantity field "${calculationConfig.quantityField}" contains non-numeric value: ${String(rawQuantity)}`,
      );
    }

    // Get cost and sell price values using case-insensitive property lookup
    const rawCostPrice = getPropertyCaseInsensitive(
      priceRecord,
      calculationConfig.costPriceField,
    );
    if (rawCostPrice === undefined || rawCostPrice === null) {
      throw new Error(
        `Cost price field "${calculationConfig.costPriceField}" not found in price record`,
      );
    }
    const costPrice = Number(rawCostPrice);
    if (!Number.isFinite(costPrice)) {
      throw new Error(
        `Cost price field "${calculationConfig.costPriceField}" contains non-numeric value: ${String(rawCostPrice)}`,
      );
    }

    const rawSellPrice = getPropertyCaseInsensitive(
      priceRecord,
      calculationConfig.sellPriceField,
    );
    if (rawSellPrice === undefined || rawSellPrice === null) {
      throw new Error(
        `Sell price field "${calculationConfig.sellPriceField}" not found in price record`,
      );
    }
    const sellPrice = Number(rawSellPrice);
    if (!Number.isFinite(sellPrice)) {
      throw new Error(
        `Sell price field "${calculationConfig.sellPriceField}" contains non-numeric value: ${String(rawSellPrice)}`,
      );
    }

    // Enforce minimum sell price if configured (only for customer-specific matches)
    let effectiveSellPrice = sellPrice;
    if (
      calculationConfig.minSellPriceConfig?.enabled &&
      calculationConfig.customerPricingConfig?.useCustomerSpecificPricing &&
      isCustomerSpecificMatch
    ) {
      if (genericPriceRecord) {
        const rawStandardSellPrice = getPropertyCaseInsensitive(
          genericPriceRecord,
          calculationConfig.sellPriceField,
        );
        const standardSellPrice =
          rawStandardSellPrice !== undefined && rawStandardSellPrice !== null
            ? Number(rawStandardSellPrice)
            : 0;
        if (sellPrice < standardSellPrice) {
          effectiveSellPrice = standardSellPrice;
          outputRecord.minSellEnforced = true;
          outputRecord.standardSellPrice = standardSellPrice;
          outputRecord.originalCustomerSellPrice = sellPrice;
        }
      } else {
        logger.warn(
          'PriceList Lookup: Min sell enforcement enabled but no generic (standard) pricelist row found for comparison. Customer-specific price used as-is.',
        );
      }
    }

    // Calculate cost and sell amounts
    let costAmount = multiply(quantity, costPrice);
    let sellAmount = multiply(quantity, effectiveSellPrice);

    // Apply FX conversion if configured (rate validated at config level in UsageBilling.node.ts)
    if (calculationConfig.fxConversionConfig?.enabled) {
      const fxRate = calculationConfig.fxConversionConfig.fxRate;
      costAmount = multiply(costAmount, fxRate);
      sellAmount = multiply(sellAmount, fxRate);
    }

    // Apply rounding if enabled (roundingDirection is not 'none')
    if (calculationConfig.roundingDirection && calculationConfig.roundingDirection !== 'none') {
      const decimalPlaces =
        calculationConfig.decimalPlaces !== undefined ? calculationConfig.decimalPlaces : 1;
      const roundingDirection = calculationConfig.roundingDirection;

      // Round cost amount
      const decimalCostAmount = new Decimal(costAmount);
      if (roundingDirection === 'up') {
        // Round up (ceiling) to specified decimal places
        costAmount = decimalCostAmount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_UP).toNumber();
      } else {
        // Round down (floor) to specified decimal places
        costAmount = decimalCostAmount
          .toDecimalPlaces(decimalPlaces, Decimal.ROUND_DOWN)
          .toNumber();
      }

      // Round sell amount
      const decimalSellAmount = new Decimal(sellAmount);
      if (roundingDirection === 'up') {
        // Round up (ceiling) to specified decimal places
        sellAmount = decimalSellAmount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_UP).toNumber();
      } else {
        // Round down (floor) to specified decimal places
        sellAmount = decimalSellAmount
          .toDecimalPlaces(decimalPlaces, Decimal.ROUND_DOWN)
          .toNumber();
      }
    }

    // Get prefixes from outputConfig (with defaults)
    const pricelistPrefix = outputConfig.pricelistFieldPrefix || 'price_';
    const usagePrefix = outputConfig.usageFieldPrefix || 'usage_';
    const calcPrefix = outputConfig.calculationFieldPrefix || 'calc_';
    const costAmountFieldName = outputConfig.calculatedCostAmountField || 'calc_cost_amount';
    const sellAmountFieldName = outputConfig.calculatedSellAmountField || 'calc_sell_amount';

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
      outputRecord[`${calcPrefix}${calculationConfig.costPriceField}`] = costPrice;
      outputRecord[`${calcPrefix}${calculationConfig.sellPriceField}`] = effectiveSellPrice;
    }

    // Add calculated amounts to output
    outputRecord[costAmountFieldName] = costAmount;
    outputRecord[sellAmountFieldName] = sellAmount;

    // Add FX conversion metadata to output
    if (calculationConfig.fxConversionConfig?.enabled) {
      outputRecord[`${calcPrefix}fxRate`] = calculationConfig.fxConversionConfig.fxRate;
      outputRecord[`${calcPrefix}currencyCode`] = calculationConfig.fxConversionConfig.currencyCode;
    }

    // Add margin/profit fields if enabled
    if (calculationConfig.includeMarginFields) {
      const margin = subtract(sellAmount, costAmount);
      outputRecord[`${calcPrefix}margin`] = margin;

      // margin_percent = (sell - cost) / sell × 100; null if sell = 0
      if (sellAmount !== 0) {
        try {
          outputRecord[`${calcPrefix}margin_percent`] = multiply(divide(margin, sellAmount), 100);
        } catch {
          outputRecord[`${calcPrefix}margin_percent`] = null;
        }
      } else {
        outputRecord[`${calcPrefix}margin_percent`] = null;
      }

      // markup_percent = (sell - cost) / cost × 100; null if cost = 0
      if (costAmount !== 0) {
        try {
          outputRecord[`${calcPrefix}markup_percent`] = multiply(divide(margin, costAmount), 100);
        } catch {
          outputRecord[`${calcPrefix}markup_percent`] = null;
        }
      } else {
        outputRecord[`${calcPrefix}markup_percent`] = null;
      }
    }

    // Add any additional configured output fields
    addExtraFieldsToOutput(outputRecord, priceRecord, usageRecord, outputConfig);

    // Add pass-through fields (copied verbatim from usage record, no prefix)
    if (outputConfig.passThroughFields) {
      const fieldNames = outputConfig.passThroughFields
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      for (const fieldName of fieldNames) {
        const value = getPropertyCaseInsensitive(usageRecord, fieldName);
        if (value !== undefined) {
          outputRecord[fieldName] = value as string | number | boolean | null;
        }
      }
    }

    // Sort all fields alphabetically for consistent output ordering
    return sortObjectKeysAlphabetically(outputRecord);
  } catch (error) {
    logger.error(
      `PriceList Lookup: Error calculating amounts: ${(error as Error).message}`,
      error as Error,
    );
    throw error;
  }
}
