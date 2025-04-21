import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nodeDescription } from './config';
import { importPricingData, matchUsageAndCalculate, usageSummary } from './processing';
import type {
  CsvParsingConfig,
  ColumnFilterConfig,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
  OperationType,
  UsageSummaryConfig,
} from './interfaces';

export class UsageBilling implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    const operation = this.getNodeParameter('operation', 0) as OperationType;

    try {
      let returnData: INodeExecutionData[][] = [];

      // Handle different operations
      if (operation === 'importPricingData') {
        // Get configuration for Import Pricing Data operation
        const csvParsingConfig = this.getNodeParameter('csvParsingConfig', 0) as CsvParsingConfig;
        const columnFilterConfig = this.getNodeParameter('columnFilterConfig', 0, {
          includeAllColumns: true,
        }) as ColumnFilterConfig;

        // Import pricing data from CSV data
        const importResult = await importPricingData.call(
          this,
          items,
          csvParsingConfig,
          columnFilterConfig,
        );

        // Directly use the returned data which now contains both outputs
        returnData = importResult;
      } else if (operation === 'matchUsageAndCalculate') {
        // Get configuration for Match Usage and Calculate operation
        const priceListFieldName = this.getNodeParameter('priceListFieldName', 0) as unknown;
        const usageDataFieldName = this.getNodeParameter('usageDataFieldName', 0) as unknown;

        // Get match fields
        const matchFieldsParam = this.getNodeParameter('matchFields', 0) as IDataObject;
        const matchFields: MatchFieldPair[] = [];

        // Extract match fields from the parameter
        if (matchFieldsParam?.field && Array.isArray(matchFieldsParam.field)) {
          for (const fieldPair of matchFieldsParam.field as IDataObject[]) {
            matchFields.push({
              priceListField: fieldPair.priceListField as string,
              usageField: fieldPair.usageField as string,
            });
          }
        }

        // Ensure at least one match field exists
        if (matchFields.length === 0) {
          // Add a default match field with empty values to force validation error
          // This ensures the user must configure at least one match field
          matchFields.push({
            priceListField: '',
            usageField: '',
          });
        }

        // Get calculation configuration first
        const calculationConfigParam = this.getNodeParameter('calculationConfig', 0, {
          roundingDirection: 'none',
          quantityField: 'quantity',
          costPriceField: 'cost',
          sellPriceField: 'price',
        }) as IDataObject;

        const calculationConfig: CalculationConfig = {
          quantityField: (calculationConfigParam.quantityField as string) || 'quantity',
          costPriceField: (calculationConfigParam.costPriceField as string) || 'cost',
          sellPriceField: (calculationConfigParam.sellPriceField as string) || 'price',
          roundingDirection:
            (calculationConfigParam.roundingDirection as 'up' | 'down' | 'none') || 'none',
        };

        // Get customer pricing configuration (now a top-level parameter)
        const customerPricingParam = this.getNodeParameter('customerPricingConfig', 0, {
          useCustomerSpecificPricing: false,
        }) as IDataObject;

        // Build customer pricing config
        if (customerPricingParam.useCustomerSpecificPricing === true) {
          calculationConfig.customerPricingConfig = {
            useCustomerSpecificPricing: true,
            customerIdPriceListField:
              (customerPricingParam.customerIdPriceListField as string) || 'customerId',
            customerIdUsageField:
              (customerPricingParam.customerIdUsageField as string) || 'customerId',
          };
        }

        // Get automatic field inclusion settings
        const outputFieldsConfigParam = this.getNodeParameter('outputFieldsConfig', 0, {
          includeMatchPricelistFields: true,
          includeMatchUsageFields: true,
          includeCalculationFields: true,
          pricelistFieldPrefix: 'price_',
          usageFieldPrefix: 'usage_',
          calculationFieldPrefix: 'calc_',
          calculatedCostAmountField: 'calc_cost_amount',
          calculatedSellAmountField: 'calc_sell_amount',
        }) as IDataObject;

        // Get output configuration
        const outputConfigParam = this.getNodeParameter('outputConfig', 0, {}) as IDataObject;
        const outputConfig: OutputFieldConfig = {
          includeFields: [],
          // Add the automatic inclusion settings
          includeMatchPricelistFields:
            outputFieldsConfigParam.includeMatchPricelistFields as boolean,
          includeMatchUsageFields: outputFieldsConfigParam.includeMatchUsageFields as boolean,
          includeCalculationFields: outputFieldsConfigParam.includeCalculationFields as boolean,
          // Add field prefix settings
          pricelistFieldPrefix: outputFieldsConfigParam.pricelistFieldPrefix as string,
          usageFieldPrefix: outputFieldsConfigParam.usageFieldPrefix as string,
          calculationFieldPrefix: outputFieldsConfigParam.calculationFieldPrefix as string,
          // Add calculated amount field names
          calculatedCostAmountField: outputFieldsConfigParam.calculatedCostAmountField as string,
          calculatedSellAmountField: outputFieldsConfigParam.calculatedSellAmountField as string,
        };

        // Extract output fields from the parameter
        if (outputConfigParam?.includeFields && Array.isArray(outputConfigParam.includeFields)) {
          for (const field of outputConfigParam.includeFields as IDataObject[]) {
            outputConfig.includeFields.push({
              source: field.source as 'pricelist' | 'usage',
              sourceField: field.sourceField as string,
              targetField: (field.targetField as string) || (field.sourceField as string),
            });
          }
        }

        // Perform match usage and calculate
        returnData = await matchUsageAndCalculate.call(
          this,
          items,
          priceListFieldName,
          usageDataFieldName,
          matchFields,
          calculationConfig,
          outputConfig,
        );
      } else if (operation === 'usageSummary') {
        // Get configuration for Usage Summary operation
        const fieldsToTotal = this.getNodeParameter(
          'fieldsToTotal',
          0,
          'calc_cost_amount,calc_sell_amount',
        ) as string;
        const groupByFieldsStr = this.getNodeParameter('groupByFields', 0, '') as string;
        const includeSourceData = this.getNodeParameter('includeSourceData', 0, false) as boolean;

        // Parse group by fields from comma-separated string
        const groupByFields = groupByFieldsStr
          ? groupByFieldsStr.split(',').map((f) => f.trim())
          : [];

        // Create usage summary config
        const summaryConfig: UsageSummaryConfig = {
          fieldsToTotal,
          groupByFields,
          includeSourceData,
        };

        // Generate usage summary
        returnData = await usageSummary.call(this, items, summaryConfig);
      }

      return returnData;
    } catch (error) {
      if (error instanceof NodeOperationError) {
        throw error;
      }
      throw new NodeOperationError(this.getNode(), error as Error);
    }
  }
}
