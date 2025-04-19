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

        // Get the hierarchy configuration information
        const rawHierarchyConfigParam = this.getNodeParameter(
          'hierarchyConfigFieldName',
          0,
          'hierarchyConfig',
        );

        this.logger.info(`DEBUG: Raw hierarchy param: ${JSON.stringify(rawHierarchyConfigParam)}`);

        // In some cases, n8n might pass the entire hierarchy configuration object directly
        const hierarchyConfigFieldName = rawHierarchyConfigParam;

        this.logger.info(
          `DEBUG: Looking for shared hierarchy: ${JSON.stringify(hierarchyConfigFieldName)}`,
        );

        // Use the shared hierarchy if specified - handle both string and object inputs
        let hierarchyConfigData = null;

        // Handle string parameter (field name)
        if (typeof hierarchyConfigFieldName === 'string') {
          hierarchyConfigData = items[0].json[hierarchyConfigFieldName];
          this.logger.info(
            `DEBUG: Looking up hierarchy using field name: ${hierarchyConfigFieldName}`,
          );
        }
        // Handle object parameter (possibly contains the config directly)
        else if (hierarchyConfigFieldName && typeof hierarchyConfigFieldName === 'object') {
          this.logger.info(
            `DEBUG: hierarchyConfigFieldName is an object: ${JSON.stringify(hierarchyConfigFieldName)}`,
          );

          // First, check if it looks like a hierarchy config itself (has levels)
          if (
            'levels' in hierarchyConfigFieldName &&
            Array.isArray(hierarchyConfigFieldName.levels)
          ) {
            hierarchyConfigData = hierarchyConfigFieldName;
            this.logger.info(
              `DEBUG: Using hierarchyConfigFieldName directly as it contains ${hierarchyConfigFieldName.levels.length} levels`,
            );
          }
          // Next, check if it contains a hierarchyConfig property (standard format)
          else if ('hierarchyConfig' in hierarchyConfigFieldName) {
            hierarchyConfigData = hierarchyConfigFieldName.hierarchyConfig;
            this.logger.info('DEBUG: Using hierarchyConfig property directly from parameter');
          }
          // Last, if it has a name property but no levels, try using that as a field name
          else if ('name' in hierarchyConfigFieldName && !('levels' in hierarchyConfigFieldName)) {
            const fieldName = hierarchyConfigFieldName.name as string;
            hierarchyConfigData = items[0].json[fieldName];
            this.logger.info(`DEBUG: Using name property as field name: ${fieldName}`);
          }
        }

        // Fallback to standard field name if nothing was found
        if (!hierarchyConfigData) {
          hierarchyConfigData = items[0].json.hierarchyConfig;
          this.logger.info('DEBUG: Trying default field name: hierarchyConfig');
        }

        if (!hierarchyConfigData) {
          throw new NodeOperationError(
            this.getNode(),
            `No hierarchy configuration found. Please check that you connected this node to a defineHierarchy operation or specified a valid field name or configuration object.`,
          );
        }

        this.logger.info(`DEBUG: Found hierarchy data: ${JSON.stringify(hierarchyConfigData)}`);

        // Convert shared hierarchy to the format expected by processPriceList
        let hierarchyConfig: HierarchyConfig;

        // Validate and cast the shared hierarchy configuration
        if (typeof hierarchyConfigData === 'object' && hierarchyConfigData !== null) {
          // Try to access the levels property
          let levelsArray: HierarchyLevel[] | undefined;

          this.logger.info(
            `DEBUG: Hierarchy data keys: ${Object.keys(hierarchyConfigData).join(', ')}`,
          );

          // Check for levels array in the standard format (directly in the config)
          if (
            'levels' in (hierarchyConfigData as IDataObject) &&
            Array.isArray((hierarchyConfigData as IDataObject).levels)
          ) {
            levelsArray = (hierarchyConfigData as IDataObject)
              .levels as unknown as HierarchyLevel[];

            // Log the actual structure of the levels array
            if (levelsArray && levelsArray.length > 0) {
              this.logger.info(
                `DEBUG: First level item structure: ${JSON.stringify(levelsArray[0])}`,
              );
            }

            this.logger.info(`DEBUG: Found direct levels array with ${levelsArray.length} entries`);
          }
          // Check for hierarchyConfig.levels format
          else if (
            'hierarchyConfig' in (hierarchyConfigData as IDataObject) &&
            typeof (hierarchyConfigData as IDataObject).hierarchyConfig === 'object' &&
            (hierarchyConfigData as IDataObject).hierarchyConfig !== null
          ) {
            const nestedConfig = (hierarchyConfigData as IDataObject)
              .hierarchyConfig as IDataObject;
            this.logger.info(
              `DEBUG: Checking nested hierarchyConfig keys: ${Object.keys(nestedConfig).join(', ')}`,
            );

            if ('levels' in nestedConfig && Array.isArray(nestedConfig.levels)) {
              levelsArray = nestedConfig.levels as unknown as HierarchyLevel[];
              this.logger.info(
                `DEBUG: Found nested levels array with ${levelsArray.length} entries`,
              );
            }
          }

          if (levelsArray && levelsArray.length > 0) {
            // Convert shared hierarchy format to the format expected by processPriceList
            this.logger.info(
              `DEBUG: Converting ${levelsArray.length} hierarchy levels to price list format`,
            );

            // Validate that all levels have an identifierField
            const validLevels = levelsArray.filter((level: HierarchyLevel) => {
              if (!level.identifierField) {
                this.logger.warn('DEBUG: Found level with missing identifierField, skipping');
                return false;
              }
              return true;
            });

            if (validLevels.length === 0) {
              throw new NodeOperationError(
                this.getNode(),
                'All hierarchy levels are missing required identifierField property.',
              );
            }

            if (validLevels.length < levelsArray.length) {
              this.logger.warn(
                `DEBUG: Skipped ${levelsArray.length - validLevels.length} invalid levels`,
              );
            }

            hierarchyConfig = {
              levels: {
                levelDefinitions: {
                  level: validLevels.map((level: HierarchyLevel) => {
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
              `No hierarchy levels found in the provided configuration. Expected an array of HierarchyLevel objects with identifierField and outputField properties.`,
            );
          }
        } else {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid hierarchy configuration format. Expected an object but received ${typeof hierarchyConfigData}.`,
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
