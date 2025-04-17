import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import _ from 'lodash';
import type {
  PriceListItem,
  UsageRecord,
  BillingRecord,
  InputDataConfig,
  MatchConfig,
  CalculationConfig,
  OutputConfig,
} from '../interfaces';
import { validateUsageRecordsData } from '../utils';
import { calculateBasicBilling, multiply, round } from '../utils/calculations';

/**
 * Find a matching price item in a hierarchical price list
 *
 * This function traverses the hierarchy based on the specified matching levels
 * and returns the matching price item if found.
 */
function findHierarchicalMatch(
  usageRecord: UsageRecord,
  priceListHierarchy: Record<string, unknown>,
  matchConfig: MatchConfig,
  currentLevel: number = 0,
): PriceListItem | null {
  // Base case: we've processed all levels or the hierarchy is empty
  if (
    !matchConfig.hierarchyLevels ||
    !matchConfig.hierarchyLevels.level ||
    currentLevel >= matchConfig.hierarchyLevels.level.length ||
    !priceListHierarchy
  ) {
    return null;
  }

  // Get the current level's configuration
  const levelConfig = matchConfig.hierarchyLevels.level[currentLevel];

  // Get the value from the usage record for this level
  const usageValue = String(usageRecord[levelConfig.usageField] || '');

  // If no value for this level, we can't match
  if (!usageValue) {
    return null;
  }

  // Try to find a match at this level
  if (usageValue in priceListHierarchy) {
    const matchedBranch = priceListHierarchy[usageValue];

    // If this is the last level, we expect the value to be an array of items
    if (currentLevel === matchConfig.hierarchyLevels.level.length - 1) {
      // At leaf level, return the first item if it's an array
      if (Array.isArray(matchedBranch) && matchedBranch.length > 0) {
        return matchedBranch[0] as PriceListItem;
      }
    } else {
      // Still traversing, recurse to the next level
      const nextLevelMatch = findHierarchicalMatch(
        usageRecord,
        matchedBranch as Record<string, unknown>,
        matchConfig,
        currentLevel + 1,
      );

      if (nextLevelMatch) {
        return nextLevelMatch;
      }
    }
  }

  // No match at this level or deeper
  // Check partial match behavior
  if (matchConfig.partialMatchBehavior === 'bestMatch' && currentLevel > 0) {
    // We could implement more sophisticated partial matching here
    // For now, just return null
    return null;
  }

  return null;
}

/**
 * Apply field mappings to an output record
 */
function applyFieldMappings(
  outputRecord: BillingRecord,
  usageRecord: UsageRecord,
  matchConfig: MatchConfig,
): BillingRecord {
  if (!matchConfig.fieldMappings?.mappings) {
    return outputRecord;
  }

  // Apply each field mapping
  for (const mapping of matchConfig.fieldMappings.mappings) {
    const sourceField = mapping.sourceField;
    const targetField = mapping.targetField || sourceField; // Use source as target if not specified

    if (sourceField in usageRecord) {
      outputRecord[targetField] = usageRecord[sourceField];
    }
  }

  return outputRecord;
}

/**
 * Processes billing calculations based on hierarchical price list and usage data
 */
export function calculateBilling(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  inputData: InputDataConfig,
  matchConfig: MatchConfig,
  calculationConfig: CalculationConfig,
  outputConfig: OutputConfig,
): INodeExecutionData[] {
  const returnData: INodeExecutionData[] = [];

  try {
    // Extract price list and usage data
    const priceListData = items[0].json[inputData.priceListFieldName];
    const usageData = items[0].json[inputData.usageDataFieldName] as UsageRecord[];

    // Check if we have valid usage data
    if (!Array.isArray(usageData)) {
      throw new NodeOperationError(this.getNode(), 'Invalid usage data format. Expected an array.');
    }

    // Verify price list is a hierarchical structure
    if (typeof priceListData !== 'object' || priceListData === null) {
      throw new NodeOperationError(
        this.getNode(),
        'Invalid price list format. Expected a hierarchical object structure.',
      );
    }

    // Cast price list to the expected type
    const hierarchicalPriceList = priceListData as Record<string, unknown>;

    // Validate usage data
    const usageValidation = validateUsageRecordsData(usageData);
    if (!usageValidation.valid) {
      this.logger.warn(`Usage data validation issues: ${usageValidation.errors.join(', ')}`);
    }

    // Initialize processing summary
    const processingSummary = {
      totalRecords: usageData.length,
      processedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
    };

    // Process each usage record
    const processedRecords = _.flatMap(usageData, (usage) => {
      try {
        // Find matching price in hierarchical structure
        const matchedPrice = findHierarchicalMatch(usage, hierarchicalPriceList, matchConfig);

        // Handle no match scenario
        if (!matchedPrice) {
          if (matchConfig.noMatchBehavior === 'error') {
            throw new NodeOperationError(
              this.getNode(),
              `No matching price found for usage record`,
            );
          }
          processingSummary.skippedRecords++;
          return []; // Skip record
        }

        // Get quantity and unit price
        const quantity = usage[calculationConfig.calculationMethod.quantityField];
        const unitPrice = matchedPrice[calculationConfig.calculationMethod.priceField];

        if (
          quantity === undefined ||
          unitPrice === undefined ||
          (typeof quantity !== 'number' && typeof quantity !== 'string') ||
          (typeof unitPrice !== 'number' && typeof unitPrice !== 'string')
        ) {
          throw new NodeOperationError(this.getNode(), 'Invalid quantity or price values');
        }

        // Calculate based on method using our precise financial calculation utilities
        let totalCost: number;

        if (calculationConfig.calculationMethod.method === 'basic') {
          totalCost = calculateBasicBilling(quantity, unitPrice);
        } else {
          // For tiered pricing
          totalCost = multiply(quantity, unitPrice);
        }

        // Ensure the total cost is properly rounded to 2 decimal places for currency
        totalCost = round(totalCost, 2);

        // Start with the base output record containing selected fields from the price list
        let outputRecord = _.pick(matchedPrice, outputConfig.outputFields.fields) as BillingRecord;

        // Apply field mappings from usage data
        outputRecord = applyFieldMappings(outputRecord, usage, matchConfig);

        // Add the calculated total
        outputRecord[outputConfig.outputFields.totalField] = totalCost;

        processingSummary.processedRecords++;

        // Return as array entry for flatMap
        return [
          {
            json: {
              ...outputRecord,
              _validationStatus: {
                usageDataValid: usageValidation.valid,
              },
            },
          },
        ];
      } catch (recordError) {
        processingSummary.errorRecords++;
        if (matchConfig.noMatchBehavior === 'error') {
          throw recordError;
        }
        return []; // Skip record on error
      }
    });

    // Add all processed records to the return data
    returnData.push(...processedRecords);

    // If no records were processed successfully, add a summary record
    if (returnData.length === 0) {
      returnData.push({
        json: {
          success: false,
          message: 'No billing records could be processed',
          summary: processingSummary,
          validationStatus: {
            usageDataValid: usageValidation.valid,
            usageDataErrors: usageValidation.errors,
          },
        },
      });
    }

    return returnData;
  } catch (error) {
    // Handle any errors
    if (error instanceof NodeOperationError) {
      throw error;
    }
    throw new NodeOperationError(
      this.getNode(),
      `Error calculating billing: ${(error as Error).message}`,
    );
  }
}

/**
 * Processes a single billing record
 */
export function processBillingRecord(
  this: IExecuteFunctions,
  usage: UsageRecord,
  priceIndex: Map<string, PriceListItem>,
  matchConfig: MatchConfig,
  calculationConfig: CalculationConfig,
  outputConfig: OutputConfig,
): BillingRecord | null {
  // For backward compatibility, if we're using a Map for simple lookups,
  // we should be using the first level's usage field as the match key
  const matchKey = String(usage[matchConfig.hierarchyLevels.level[0].usageField]);
  const matchedPrice = priceIndex.get(matchKey);

  if (!matchedPrice) {
    if (matchConfig.noMatchBehavior === 'error') {
      throw new NodeOperationError(this.getNode(), `No matching price found for ${matchKey}`);
    }
    return null; // Skip record
  }

  // Get quantity and unit price
  const quantity = usage[calculationConfig.calculationMethod.quantityField];
  const unitPrice = matchedPrice[calculationConfig.calculationMethod.priceField];

  if (
    quantity === undefined ||
    unitPrice === undefined ||
    (typeof quantity !== 'number' && typeof quantity !== 'string') ||
    (typeof unitPrice !== 'number' && typeof unitPrice !== 'string')
  ) {
    throw new NodeOperationError(this.getNode(), 'Invalid quantity or price values');
  }

  // Calculate based on method
  let totalCost: number;
  if (calculationConfig.calculationMethod.method === 'basic') {
    totalCost = calculateBasicBilling(quantity, unitPrice);
  } else {
    // For tiered pricing, implement proper pricing logic
    totalCost = multiply(quantity, unitPrice); // Simplified for now
  }

  // Ensure the total cost is properly rounded to 2 decimal places for currency
  totalCost = round(totalCost, 2);

  // Build output record - start with fields from the price list
  let outputRecord: BillingRecord = {};
  for (const field of outputConfig.outputFields.fields) {
    outputRecord[field] = matchedPrice[field];
  }

  // Apply field mappings from usage data
  outputRecord = applyFieldMappings(outputRecord, usage, matchConfig);

  // Add the calculated total
  outputRecord[outputConfig.outputFields.totalField] = totalCost;

  return outputRecord;
}
