import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nodeDescription } from './config';
import { calculateBilling, processPriceList } from './processing';
import type {
  InputDataConfig,
  MatchConfig,
  CalculationConfig,
  OutputConfig,
  CsvParsingConfig,
  ColumnFilterConfig,
  HierarchyConfig,
  OperationType,
} from './interfaces';

export class BillingCalculator implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    const operation = this.getNodeParameter('operation', 0) as OperationType;

    try {
      let returnData: INodeExecutionData[];

      // Handle different operations
      if (operation === 'loadPriceList') {
        // Get configuration for Load Price List operation
        const csvParsingConfig = this.getNodeParameter('csvParsingConfig', 0) as CsvParsingConfig;
        const columnFilterConfig = this.getNodeParameter(
          'columnMappingConfig',
          0,
        ) as ColumnFilterConfig;
        const hierarchyConfig = this.getNodeParameter('hierarchyConfig', 0) as HierarchyConfig;

        // Get column inclusion options
        const columnMappingData = columnFilterConfig.includeOptions || {};
        const includeAllColumns = columnMappingData.includeAllColumns !== false; // Default to true if not set

        // Get the list of columns to include if not including all columns
        let includeColumnsList: string[] = [];
        if (!includeAllColumns && columnMappingData.includeColumnsList) {
          const columnsString = columnMappingData.includeColumnsList as string;
          if (columnsString.trim() !== '') {
            includeColumnsList = columnsString.split(',').map((col) => col.trim());
          }
        }

        // Process price list from CSV data - this is now async
        returnData = await processPriceList.call(
          this,
          items,
          csvParsingConfig,
          columnFilterConfig,
          hierarchyConfig,
          includeAllColumns,
          includeColumnsList,
        );
      } else if (operation === 'calculateBilling') {
        // Get configuration for Calculate Billing operation
        const inputData: InputDataConfig = {
          priceListFieldName: this.getNodeParameter('priceListFieldName', 0) as string,
          usageDataFieldName: this.getNodeParameter('usageDataFieldName', 0) as string,
        };
        const matchConfig = this.getNodeParameter('matchConfig', 0) as MatchConfig;

        // Get the separate noMatchBehavior parameter and add it to matchConfig
        const noMatchBehavior = this.getNodeParameter('matchConfig.noMatchBehavior', 0) as
          | 'skip'
          | 'error';
        matchConfig.noMatchBehavior = noMatchBehavior;

        const calculationConfig = this.getNodeParameter(
          'calculationConfig',
          0,
        ) as CalculationConfig;
        const outputConfig = this.getNodeParameter('outputConfig', 0) as OutputConfig;

        // Process billing calculation
        returnData = calculateBilling.call(
          this,
          items,
          inputData,
          matchConfig,
          calculationConfig,
          outputConfig,
        );
      } else {
        throw new NodeOperationError(this.getNode(), `Operation "${operation}" is not supported`);
      }

      return [returnData];
    } catch (error) {
      if (error instanceof NodeOperationError) {
        throw error;
      }
      throw new NodeOperationError(
        this.getNode(),
        `Error executing operation: ${(error as Error).message}`,
      );
    }
  }
}
