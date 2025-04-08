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

export class BillingCalculator implements INodeType {
  description = nodeDescription;

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    try {
      const operation = this.getNodeParameter('operation', 0) as string;

      // Get examples from parameters
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
      const priceListExample = JSON.parse(priceListExampleJson);
      const usageExample = JSON.parse(usageExampleJson);
      const outputExample = JSON.parse(outputExampleJson);

      // Infer schemas
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
      const matchConfigV2 = this.getNodeParameter('matchConfigV2.config', 0, {}) as {
        matchMethod: string;
        fieldMapping: { mapping: { priceListField: string; usageField: string }[] };
        defaultOnNoMatch: string;
      };

      // Create resource mapper-compatible format for conversion
      const matchMappings: { [key: string]: { value: string } } = {};

      if (matchConfigV2.fieldMapping?.mapping) {
        for (const mapping of matchConfigV2.fieldMapping.mapping) {
          if (mapping.priceListField && mapping.usageField) {
            matchMappings[`priceList.${mapping.priceListField}`] = {
              value: `usage.${mapping.usageField}`,
            };
          }
        }
      }

      // Convert to MatchConfig for compatibility with existing functions
      // Use enhanced resourceMapperToMatchConfig that supports multi-key matching
      const matchConfig = resourceMapperToMatchConfig(
        matchMappings,
        matchConfigV2.matchMethod === 'multi',
        matchConfigV2.defaultOnNoMatch,
      );

      let result: INodeExecutionData[] = [];

      if (operation === 'validateConfig') {
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
        // Get input data for processing billing
        const inputDataConfig = this.getNodeParameter('inputData.data', 0, {}) as {
          priceListSource?: string;
          priceListParameter?: string;
          usageDataSource?: string;
          usageDataParameter?: string;
        };

        const items = this.getInputData();

        // Determine price list source and get data
        let priceList = [];
        if (inputDataConfig.priceListSource === 'parameter' && inputDataConfig.priceListParameter) {
          priceList = JSON.parse(inputDataConfig.priceListParameter as string);
        } else {
          // Default to input data
          const priceListItem = items[0]?.json?.priceList;
          priceList = Array.isArray(priceListItem) ? priceListItem : [priceListItem];
        }

        // Determine usage data source and get data
        let usageRecords = [];
        if (inputDataConfig.usageDataSource === 'parameter' && inputDataConfig.usageDataParameter) {
          usageRecords = JSON.parse(inputDataConfig.usageDataParameter as string);
        } else {
          // Default to input data
          const usageItem = items[0]?.json?.usageRecords;
          usageRecords = Array.isArray(usageItem) ? usageItem : [usageItem];
        }

        // Get output mapping config - Phase 2 enhanced version
        const outputMappingV2 = this.getNodeParameter('outputMappingV2.config', 0, {
          includeAllFields: false,
          fieldMapping: { mapping: [] },
        }) as {
          includeAllFields: boolean;
          fieldMapping: {
            mapping: {
              outputField: string;
              source: string;
              sourceField: string;
              formula: string;
            }[];
          };
        };

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
        } else if (outputMappingV2.fieldMapping?.mapping?.length > 0) {
          // Use the explicit field mappings
          outputConfig.fields = outputMappingV2.fieldMapping.mapping.map((mapping) => ({
            name: mapping.outputField,
            sourceField: mapping.source !== 'calculated' ? mapping.sourceField : undefined,
            sourceType: mapping.source as 'usage' | 'price' | 'calculated',
            formula: mapping.source === 'calculated' ? mapping.formula : undefined,
          }));
        } else {
          // Default field mapping based on output example
          outputConfig.fields = Object.keys(outputExample).map((name) => ({
            name,
            sourceField: name,
            sourceType: 'usage' as const, // Default source type
          }));
        }

        // Get advanced options for batch processing
        const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as IDataObject;
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
      }

      return [result];
    } catch (error) {
      throw new NodeOperationError(this.getNode(), error as Error);
    }
  }
}

// No re-export needed as it's already exported from config/SchemaVisualization
