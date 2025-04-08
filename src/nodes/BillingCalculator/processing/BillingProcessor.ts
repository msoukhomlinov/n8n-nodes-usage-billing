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
import { validatePriceListData, validateUsageRecordsData } from '../utils';
import { calculateBasicBilling, multiply, round } from '../utils/calculations';

/**
 * Processes billing calculations based on price list and usage data
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
    const priceList = items[0].json[inputData.priceListSource.fieldName] as PriceListItem[];
    const usageData = items[0].json[inputData.usageSource.fieldName] as UsageRecord[];

    if (!Array.isArray(priceList) || !Array.isArray(usageData)) {
      throw new NodeOperationError(this.getNode(), 'Invalid input data format');
    }

    // Validate price list data
    const priceListValidation = validatePriceListData(priceList);
    if (!priceListValidation.valid) {
      this.logger.warn(`Price list validation issues: ${priceListValidation.errors.join(', ')}`);
    }

    // Validate usage data
    const usageValidation = validateUsageRecordsData(usageData);
    if (!usageValidation.valid) {
      this.logger.warn(`Usage data validation issues: ${usageValidation.errors.join(', ')}`);
    }

    // Continue processing even with validation issues, but include validation status in the output

    // Use lodash to create an efficient lookup table for price list items
    const priceIndex = _.keyBy(priceList, (item) =>
      String(item[matchConfig.matchFields.priceListField]),
    );

    // Track processing results
    const processingSummary = {
      totalRecords: usageData.length,
      processedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
    };

    // Process each usage record
    const processedRecords = _.flatMap(usageData, (usage) => {
      try {
        const matchKey = String(usage[matchConfig.matchFields.usageField]);
        const matchedPrice = priceIndex[matchKey];

        // Handle no match scenario
        if (!matchedPrice) {
          if (matchConfig.matchFields.noMatchBehavior === 'error') {
            throw new NodeOperationError(this.getNode(), `No matching price found for ${matchKey}`);
          }
          processingSummary.skippedRecords++;
          return []; // Skip record (empty array in flatMap = filter out)
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
          // For tiered pricing, we'll do a simplified version for now
          // In a production system, we'd implement proper tiered pricing logic
          totalCost = multiply(quantity, unitPrice);
        }

        // Ensure the total cost is properly rounded to 2 decimal places for currency
        totalCost = round(totalCost, 2);

        // Build output record using lodash merge to simplify
        // This will prioritize usage data fields but include price list fields where not present
        const outputRecord = _.pick(
          // Merge usage and price data, with usage taking precedence
          _.merge({}, matchedPrice, usage),
          // Pick only the fields specified in the output config
          outputConfig.outputFields.fields,
        );

        // Add the calculated total
        outputRecord[outputConfig.outputFields.totalField] = totalCost;

        processingSummary.processedRecords++;

        // Return as array entry for flatMap
        return [
          {
            json: {
              ...outputRecord,
              // Add validation metadata
              _validationStatus: {
                priceListValid: priceListValidation.valid,
                usageDataValid: usageValidation.valid,
              },
            },
          },
        ];
      } catch (recordError) {
        processingSummary.errorRecords++;
        if (matchConfig.matchFields.noMatchBehavior === 'error') {
          throw recordError;
        }
        return []; // Skip record on error if not explicitly configured to fail
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
            priceListValid: priceListValidation.valid,
            priceListErrors: priceListValidation.errors,
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
  const matchKey = String(usage[matchConfig.matchFields.usageField]);
  const matchedPrice = priceIndex.get(matchKey);

  if (!matchedPrice) {
    if (matchConfig.matchFields.noMatchBehavior === 'error') {
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

  // Build output record
  const outputRecord: BillingRecord = {};
  for (const field of outputConfig.outputFields.fields) {
    outputRecord[field] = usage[field] || matchedPrice[field];
  }
  outputRecord[outputConfig.outputFields.totalField] = totalCost;

  return outputRecord;
}
