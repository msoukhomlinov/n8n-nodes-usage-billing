import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nodeDescription } from './config';
import { calculateBilling, processPriceList, defineHierarchy } from './processing';
import type {
  InputDataConfig,
  MatchConfig,
  CalculationConfig,
  OutputConfig,
  CsvParsingConfig,
  ColumnFilterConfig,
  HierarchyConfig,
  OperationType,
  HierarchyLevel,
  SharedHierarchyConfig,
} from './interfaces';

export class BillingCalculator implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    const operation = this.getNodeParameter('operation', 0) as OperationType;

    try {
      let returnData: INodeExecutionData[];

      // Handle different operations
      if (operation === 'defineHierarchy') {
        // Process the defineHierarchy operation
        returnData = await defineHierarchy.call(this, items);
      } else if (operation === 'loadPriceList') {
        // Get configuration for Load Price List operation
        const csvParsingConfig = this.getNodeParameter('csvParsingConfig', 0) as CsvParsingConfig;
        const columnFilterConfig = this.getNodeParameter(
          'columnMappingConfig',
          0,
        ) as ColumnFilterConfig;

        // Get the field name containing the shared hierarchy config
        const hierarchyConfigFieldName = this.getNodeParameter(
          'hierarchyConfigFieldName',
          0,
          'hierarchyConfig',
        ) as string;

        this.logger.info(
          `DEBUG: Looking for shared hierarchy in field "${hierarchyConfigFieldName}"`,
        );

        // Use the shared hierarchy if specified
        const hierarchyConfigData = items[0].json[hierarchyConfigFieldName];

        if (!hierarchyConfigData) {
          throw new NodeOperationError(
            this.getNode(),
            `No hierarchy configuration found in field "${hierarchyConfigFieldName}". Make sure to connect this node to a defineHierarchy operation.`,
          );
        }

        this.logger.info(`DEBUG: Found hierarchy data: ${JSON.stringify(hierarchyConfigData)}`);

        // Convert shared hierarchy to the format expected by processPriceList
        let hierarchyConfig: HierarchyConfig;

        // Validate and cast the shared hierarchy configuration
        if (typeof hierarchyConfigData === 'object' && hierarchyConfigData !== null) {
          // Try to access the levels property - could be at different paths depending on structure
          let levelsArray: HierarchyLevel[] | undefined;

          // Case 1: Direct levels array in the expected format
          if (
            'levels' in (hierarchyConfigData as IDataObject) &&
            Array.isArray((hierarchyConfigData as IDataObject).levels)
          ) {
            levelsArray = (hierarchyConfigData as IDataObject)
              .levels as unknown as HierarchyLevel[];
            this.logger.info(
              `DEBUG: Found levels array directly with ${levelsArray.length} entries`,
            );
          }
          // Case 2: It might be the entire hierarchyConfig object
          else if (
            'hierarchyConfig' in (hierarchyConfigData as IDataObject) &&
            typeof (hierarchyConfigData as IDataObject).hierarchyConfig === 'object' &&
            (hierarchyConfigData as IDataObject).hierarchyConfig !== null
          ) {
            const nestedConfig = (hierarchyConfigData as IDataObject).hierarchyConfig;

            if (
              'levels' in (nestedConfig as IDataObject) &&
              Array.isArray((nestedConfig as IDataObject).levels)
            ) {
              levelsArray = (nestedConfig as IDataObject).levels as unknown as HierarchyLevel[];
              this.logger.info(
                `DEBUG: Found levels array in nested config with ${levelsArray.length} entries`,
              );
            }
          }

          if (levelsArray && levelsArray.length > 0) {
            // Convert shared hierarchy format to the format expected by processPriceList
            this.logger.info(
              `DEBUG: Converting ${levelsArray.length} hierarchy levels to price list format`,
            );

            hierarchyConfig = {
              levels: {
                levelDefinitions: {
                  level: levelsArray.map((level: HierarchyLevel) => {
                    this.logger.info(
                      `DEBUG: Adding level: ${level.identifierField} -> ${level.outputField || level.identifierField}`,
                    );
                    return {
                      identifierField: level.identifierField,
                      outputField: level.outputField || level.identifierField,
                    };
                  }),
                },
              },
            };
          } else {
            throw new NodeOperationError(
              this.getNode(),
              `No hierarchy levels found in the configuration from field "${hierarchyConfigFieldName}". The hierarchy structure may be invalid.`,
            );
          }
        } else {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid hierarchy configuration format in field "${hierarchyConfigFieldName}". Expected an object but received ${typeof hierarchyConfigData}.`,
          );
        }

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
          hierarchyConfigFieldName: this.getNodeParameter('hierarchyConfigFieldName', 0) as string,
        };

        // Log the actual value of hierarchyConfigFieldName for debugging
        this.logger.info(
          `DEBUG: hierarchyConfigFieldName value: ${inputData.hierarchyConfigFieldName}`,
        );

        const matchConfig = this.getNodeParameter('matchConfig', 0) as MatchConfig;

        // Update to get noMatchBehavior from its new location in the matchConfig structure
        if (matchConfig.noMatchBehavior && typeof matchConfig.noMatchBehavior === 'object') {
          const noMatchBehaviorObj = matchConfig.noMatchBehavior as unknown as {
            behavior: 'skip' | 'error';
          };
          matchConfig.noMatchBehavior = noMatchBehaviorObj.behavior || 'skip';
        } else {
          // Set default if not found
          matchConfig.noMatchBehavior = 'skip';
        }

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
