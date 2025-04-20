import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nodeDescription } from './config';
import { importPriceList, pricelistLookup } from './processing';
import type {
  CsvParsingConfig,
  ColumnFilterConfig,
  MatchFieldPair,
  CalculationConfig,
  OutputFieldConfig,
  OperationType,
} from './interfaces';

export class BillingCalculator implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    const operation = this.getNodeParameter('operation', 0) as OperationType;

    try {
      let returnData: INodeExecutionData[][] = [];

      // Handle different operations
      if (operation === 'importPriceList') {
        // Get configuration for Import Price List operation
        const csvParsingConfig = this.getNodeParameter('csvParsingConfig', 0) as CsvParsingConfig;
        const columnFilterConfig = this.getNodeParameter('columnFilterConfig', 0, {
          includeAllColumns: true,
        }) as ColumnFilterConfig;

        // Import price list from CSV data
        const importResult = await importPriceList.call(
          this,
          items,
          csvParsingConfig,
          columnFilterConfig,
        );

        // Directly use the returned data which now contains both outputs
        returnData = importResult;
      } else if (operation === 'pricelistLookup') {
        // Get configuration for Pricelist Lookup operation
        const priceListFieldName = this.getNodeParameter('priceListFieldName', 0) as string;
        const usageDataFieldName = this.getNodeParameter('usageDataFieldName', 0) as string;

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

        // Get calculation configuration
        const calculationConfigParam = this.getNodeParameter(
          'calculationConfig',
          0,
          {},
        ) as IDataObject;
        const calculationConfig: CalculationConfig = {
          quantityField: (calculationConfigParam.quantityField as string) || 'quantity',
          priceField: (calculationConfigParam.priceField as string) || 'price',
        };

        // Get output configuration
        const outputConfigParam = this.getNodeParameter('outputConfig', 0, {}) as IDataObject;
        const outputConfig: OutputFieldConfig = {
          includeFields: [],
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

        // Perform pricelist lookup and calculation
        returnData = await pricelistLookup.call(
          this,
          items,
          priceListFieldName,
          usageDataFieldName,
          matchFields,
          calculationConfig,
          outputConfig,
        );
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
