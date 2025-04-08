import { NodeOperationError } from 'n8n-workflow';
import type { INodeType, IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type { OutputConfig } from './interfaces/SchemaInterfaces';
import type { BatchProcessingOptions } from './utils';
import { nodeDescription } from './config/NodeUIConfig';
import { processBilling } from './processing/BillingProcessor';
import { validateConfiguration } from './validation/ConfigValidator';
import {
  inferSchemaFromExample,
  resourceMapperToMatchConfig,
  DEFAULT_BATCH_OPTIONS,
  LogLevel,
  log,
} from './utils';

console.log('Node Description:', nodeDescription);
export class BillingCalculator implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    try {
      console.log('===== [DEBUG] Execute method started =====');

      console.log('[DEBUG] Getting operation parameter');
      const operation = this.getNodeParameter('operation', 0) as string;
      console.log('[DEBUG] Operation:', operation);

      // Get examples from parameters
      console.log('[DEBUG] Getting example parameters');
      const priceListExampleJson = this.getNodeParameter(
        'schemaInference.priceListExample.example',
        0,
        '{}',
      ) as string;
      const usageExampleJson = this.getNodeParameter(
        'schemaInference.usageExample.example',
        0,
        '{}',
      ) as string;
      const outputExampleJson = this.getNodeParameter(
        'schemaInference.outputExample.example',
        0,
        '{}',
      ) as string;

      // Parse examples
      console.log('[DEBUG] Parsing examples');
      const priceListExample = JSON.parse(priceListExampleJson);
      const usageExample = JSON.parse(usageExampleJson);
      const outputExample = JSON.parse(outputExampleJson);

      // Infer schemas
      console.log('[DEBUG] Inferring schemas');
      const priceListSchema = inferSchemaFromExample(priceListExample);
      const usageSchema = inferSchemaFromExample(usageExample);
      // This schema is used for validation and potentially for UI display
      const outputSchema = inferSchemaFromExample(outputExample);

      // Log the schemas at debug level
      log.call(
        this,
        LogLevel.DEBUG,
        'Inferred schemas from examples',
        { priceListSchema, usageSchema, outputSchema },
        { level: LogLevel.DEBUG },
      );

      // Get match configuration - Phase 3 enhanced version with multi-key support
      console.log('[DEBUG] Getting matchConfigV2 parameter');
      console.log(
        '[DEBUG] Checking if matchConfigV2 exists:',
        this.getNodeParameter('matchConfigV2', 0, null) !== null,
      );

      // Use safer approach to access nested properties
      const matchConfigWrapper = this.getNodeParameter('matchConfigV2', 0, {
        config: {},
      }) as IDataObject;
      console.log('[DEBUG] matchConfigWrapper:', matchConfigWrapper);

      const matchConfigV2 = (matchConfigWrapper.config as IDataObject) || {};
      console.log('[DEBUG] matchConfigV2:', matchConfigV2);

      // Create resource mapper-compatible format for conversion
      const matchMappings: { [key: string]: { value: string } } = {};

      if (matchConfigV2.fieldMapping && (matchConfigV2.fieldMapping as IDataObject).mapping) {
        const mappings =
          ((matchConfigV2.fieldMapping as IDataObject).mapping as IDataObject[]) || [];
        console.log('[DEBUG] fieldMapping mappings:', mappings);

        for (const mapping of mappings) {
          if (mapping.priceListField && mapping.usageField) {
            matchMappings[`priceList.${mapping.priceListField}`] = {
              value: `usage.${mapping.usageField}`,
            };
          }
        }
      }

      // Convert to MatchConfig for compatibility with existing functions
      // Use enhanced resourceMapperToMatchConfig that supports multi-key matching
      console.log('[DEBUG] Creating matchConfig');
      const matchConfig = resourceMapperToMatchConfig(
        matchMappings,
        (matchConfigV2.matchMethod as string) === 'multi',
        matchConfigV2.defaultOnNoMatch as string,
      );
      console.log('[DEBUG] matchConfig created:', matchConfig);

      let result: INodeExecutionData[] = [];

      if (operation === 'validateConfig') {
        console.log('[DEBUG] Executing validateConfig operation');
        // Execute validation operation with enhanced feedback
        const validationResults = await validateConfiguration.call(
          this,
          priceListExample,
          usageExample,
          outputExample,
          matchConfig,
          { includeVisualization: true },
        );

        result = validationResults;
      } else {
        console.log('[DEBUG] Executing processBilling operation');
        // Get input data for processing billing
        console.log('[DEBUG] Getting inputData.data parameter');
        console.log(
          '[DEBUG] Checking if inputData exists:',
          this.getNodeParameter('inputData', 0, null) !== null,
        );

        // Use safer approach to access nested properties
        const inputDataWrapper = this.getNodeParameter('inputData', 0, { data: {} }) as IDataObject;
        console.log('[DEBUG] inputDataWrapper:', inputDataWrapper);

        const inputDataConfig = (inputDataWrapper.data as IDataObject) || {};
        console.log('[DEBUG] inputDataConfig:', inputDataConfig);

        const items = this.getInputData();
        console.log('[DEBUG] Input items:', items.length);

        // Determine price list source and get data
        let priceList = [];
        if (inputDataConfig.priceListSource === 'parameter' && inputDataConfig.priceListParameter) {
          priceList = JSON.parse(inputDataConfig.priceListParameter as string);
        } else {
          // Default to input data
          const priceListItem = items[0]?.json?.priceList;
          priceList = Array.isArray(priceListItem) ? priceListItem : [priceListItem];
        }
        console.log('[DEBUG] priceList items:', priceList.length);

        // Determine usage data source and get data
        let usageRecords = [];
        if (inputDataConfig.usageDataSource === 'parameter' && inputDataConfig.usageDataParameter) {
          usageRecords = JSON.parse(inputDataConfig.usageDataParameter as string);
        } else {
          // Default to input data
          const usageItem = items[0]?.json?.usageRecords;
          usageRecords = Array.isArray(usageItem) ? usageItem : [usageItem];
        }
        console.log('[DEBUG] usageRecords items:', usageRecords.length);

        // Get output mapping config - Phase 2 enhanced version
        console.log('[DEBUG] Getting outputMappingV2 parameter');
        console.log(
          '[DEBUG] Checking if outputMappingV2 exists:',
          this.getNodeParameter('outputMappingV2', 0, null) !== null,
        );

        // Use safer approach to access nested properties
        const outputMappingWrapper = this.getNodeParameter('outputMappingV2', 0, {
          config: {},
        }) as IDataObject;
        console.log('[DEBUG] outputMappingWrapper:', outputMappingWrapper);

        const outputMappingV2 = (outputMappingWrapper.config as IDataObject) || {
          includeAllFields: false,
          fieldMapping: { mapping: [] },
        };
        console.log('[DEBUG] outputMappingV2:', outputMappingV2);

        // Create a compatible output config
        const outputConfig: OutputConfig = {
          fields: [],
        };

        // If includeAllFields is true, include all fields from both schemas
        if (outputMappingV2.includeAllFields) {
          outputConfig.fields = [
            ...priceListSchema.fields.map((field) => ({
              name: field.name,
              sourceField: field.name,
              sourceType: 'price' as const,
            })),
            ...usageSchema.fields.map((field) => ({
              name: field.name,
              sourceField: field.name,
              sourceType: 'usage' as const,
            })),
          ];
        } else if (
          outputMappingV2.fieldMapping &&
          (outputMappingV2.fieldMapping as IDataObject).mapping &&
          ((outputMappingV2.fieldMapping as IDataObject).mapping as IDataObject[]).length > 0
        ) {
          // Use the explicit field mappings
          const mappings =
            ((outputMappingV2.fieldMapping as IDataObject).mapping as IDataObject[]) || [];
          outputConfig.fields = mappings.map((mapping) => ({
            name: mapping.outputField as string,
            sourceField:
              mapping.source !== 'calculated' ? (mapping.sourceField as string) : undefined,
            sourceType: mapping.source as 'usage' | 'price' | 'calculated',
            formula: mapping.source === 'calculated' ? (mapping.formula as string) : undefined,
          }));
        } else {
          // Default field mapping based on output example
          outputConfig.fields = Object.keys(outputExample).map((name) => ({
            name,
            sourceField: name,
            sourceType: 'usage' as const, // Default source type
          }));
        }
        console.log('[DEBUG] outputConfig created');

        // Get advanced options for batch processing
        console.log('[DEBUG] Getting advancedOptions parameter');
        const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as IDataObject;
        console.log('[DEBUG] advancedOptions:', advancedOptions);

        const batchProcessingOptions = (advancedOptions.batchProcessing as IDataObject) || {};
        const errorHandlingOptions = (advancedOptions.errorHandling as IDataObject) || {};
        const debuggingOptions = (advancedOptions.debugging as IDataObject) || {};

        // Create batch processing configuration
        const batchOptions: BatchProcessingOptions = {
          enabled: batchProcessingOptions.enabled === true,
          batchSize: batchProcessingOptions.batchSize
            ? Number.parseInt(batchProcessingOptions.batchSize as string, 10)
            : DEFAULT_BATCH_OPTIONS.batchSize,
          reportProgress: batchProcessingOptions.reportProgress === true,
          onBatchError:
            (errorHandlingOptions.onBatchError as 'stopAll' | 'skipBatch' | 'processIndividual') ||
            DEFAULT_BATCH_OPTIONS.onBatchError,
        };
        console.log('[DEBUG] batchOptions created');

        // Set up logging level
        const logLevelStr = (debuggingOptions.logLevel as string) || 'ERROR';
        const logLevel = LogLevel[logLevelStr as keyof typeof LogLevel] || LogLevel.ERROR;

        // Set up diagnostic information collection
        const includeDiagnostics =
          debuggingOptions.includeMatchDetails === true ||
          debuggingOptions.includeFormulaDetails === true ||
          debuggingOptions.includeBatchStatistics === true ||
          debuggingOptions.includeDataFlowVisualization === true;

        // Execute billing process with options
        console.log('[DEBUG] Calling processBilling');
        result = await processBilling.call(
          this,
          priceList,
          usageRecords,
          matchConfig,
          outputConfig,
          {
            batchOptions,
            logLevel,
            includeDiagnostics,
            execFunctions: this,
          },
        );
        console.log('[DEBUG] processBilling completed');
      }

      console.log('===== [DEBUG] Execute method completed successfully =====');
      return [result];
    } catch (error) {
      console.error('===== [DEBUG] Execute method error =====', error);
      throw new NodeOperationError(this.getNode(), error as Error);
    }
  }
}

// No re-export needed as it's already exported from config/SchemaVisualization
