import { NodeOperationError } from 'n8n-workflow';
import type {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
} from 'n8n-workflow';
import type {
  MatchConfig,
  OutputConfig,
  ResourceMapperMatchConfig,
  ResourceMapperOutputConfig,
  Schema,
  SchemaVisualization,
} from './interfaces/SchemaInterfaces';
import { processBilling, validateConfiguration } from './BillingCalculator.node.functions';
import {
  inferSchemaFromExample,
  createMatchResourceMapper,
  createOutputResourceMapper,
  resourceMapperToMatchConfig,
  schemaToResourceMapperOptions,
} from './utils';

/**
 * Create a visualization of the schemas for the UI
 */
export function createSchemaVisualization(
  priceListSchema: Schema,
  usageSchema: Schema,
  outputSchema: Schema,
  matchConfig: MatchConfig,
): string {
  // Build a simple text representation of the schemas for Phase 2
  // This will be enhanced with HTML/CSS in a future phase

  const priceFieldsText = priceListSchema.fields
    .map((f) => {
      const isMatch = f.name === matchConfig.priceListField;
      return `${isMatch ? '→ ' : '  '}${f.name} (${f.type})${f.required ? ' *required' : ''}`;
    })
    .join('\n');

  const usageFieldsText = usageSchema.fields
    .map((f) => {
      const isMatch = f.name === matchConfig.usageField;
      return `${isMatch ? '→ ' : '  '}${f.name} (${f.type})${f.required ? ' *required' : ''}`;
    })
    .join('\n');

  const outputFieldsText = outputSchema.fields
    .map((f) => `  ${f.name} (${f.type})${f.required ? ' *required' : ''}`)
    .join('\n');

  return `
<h3>Inferred Schemas from Examples</h3>

<b>Price List Schema:</b>
${priceFieldsText}

<b>Usage Data Schema:</b>
${usageFieldsText}

<b>Output Schema:</b>
${outputFieldsText}

<p>→ Fields marked with an arrow are used for matching</p>
<p>* Fields marked with an asterisk are required</p>
  `.trim();
}

export class BillingCalculator implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Billing Calculator',
    name: 'billingCalculator',
    icon: 'file:billing-calculator.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Calculate billing based on price lists and usage data',
    defaults: {
      name: 'Billing Calculator',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      // Operation Selection
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Process Billing',
            value: 'processBilling',
            description: 'Generate billing records from price lists and usage data',
          },
          {
            name: 'Validate Configuration',
            value: 'validateConfig',
            description: 'Test configuration without processing actual billing',
          },
        ],
        default: 'processBilling',
      },

      // Schema Inference Section
      {
        displayName: 'Schema Definition from Examples',
        name: 'schemaInference',
        type: 'fixedCollection',
        default: {},
        options: [
          {
            name: 'priceListExample',
            displayName: 'Price List Item Example',
            values: [
              {
                displayName: 'Example JSON',
                name: 'example',
                type: 'json',
                typeOptions: {
                  alwaysOpenEditWindow: true,
                },
                default:
                  '{\n  "productId": "PROD001",\n  "unitPrice": 10.99,\n  "currency": "USD"\n}',
                description: 'Paste an example of a single price list item as JSON',
              },
            ],
          },
          {
            name: 'usageExample',
            displayName: 'Usage Data Example',
            values: [
              {
                displayName: 'Example JSON',
                name: 'example',
                type: 'json',
                typeOptions: {
                  alwaysOpenEditWindow: true,
                },
                default:
                  '{\n  "productId": "PROD001",\n  "usage": 5,\n  "customerId": "CUST123"\n}',
                description: 'Paste an example of a single usage record as JSON',
              },
            ],
          },
          {
            name: 'outputExample',
            displayName: 'Desired Output Example',
            values: [
              {
                displayName: 'Example JSON',
                name: 'example',
                type: 'json',
                typeOptions: {
                  alwaysOpenEditWindow: true,
                },
                default:
                  '{\n  "productId": "PROD001",\n  "usage": 5,\n  "unitPrice": 10.99,\n  "totalCost": 54.95,\n  "customerId": "CUST123"\n}',
                description: 'Paste an example of how you want the output to look',
              },
            ],
          },
        ],
      },

      // Enhanced Match Configuration using Resource Mapper (Phase 2)
      {
        displayName: 'Match Configuration',
        name: 'matchConfigV2',
        type: 'fixedCollection',
        default: {
          config: {
            matchMethod: 'single',
            defaultOnNoMatch: 'error',
          },
        },
        options: [
          {
            name: 'config',
            displayName: 'Configuration',
            values: [
              {
                displayName: 'Match Method',
                name: 'matchMethod',
                type: 'options',
                options: [
                  {
                    name: 'Single Field Match',
                    value: 'single',
                    description: 'Match records using a single field from each source',
                  },
                  {
                    name: 'Multi-field Match',
                    value: 'multi',
                    description: 'Match records using multiple fields (e.g., Product ID + Region)',
                  },
                ],
                default: 'single',
                description: 'How to match price list items with usage records',
              },
              {
                displayName: 'Field Mapping',
                name: 'fieldMapping',
                type: 'fixedCollection',
                typeOptions: {
                  // This will be replaced with the actual resource mapper in runtime
                  multipleValues: true,
                },
                default: {},
                options: [
                  {
                    name: 'mapping',
                    displayName: 'Map Fields',
                    values: [
                      {
                        displayName: 'Price List Field',
                        name: 'priceListField',
                        type: 'string',
                        default: 'productId',
                        description: 'Field in price list to match on',
                      },
                      {
                        displayName: 'Usage Data Field',
                        name: 'usageField',
                        type: 'string',
                        default: 'productId',
                        description: 'Field in usage data to match on',
                      },
                    ],
                  },
                ],
                description: 'Define which fields should be used for matching',
              },
              {
                displayName: 'When No Match Found',
                name: 'defaultOnNoMatch',
                type: 'options',
                options: [
                  {
                    name: 'Error',
                    value: 'error',
                    description: 'Throw an error if no match is found',
                  },
                  {
                    name: 'Skip Record',
                    value: 'skip',
                    description: 'Skip the usage record if no match is found',
                  },
                  {
                    name: 'Process with Empty Price',
                    value: 'empty',
                    description: 'Process the record with an empty price item',
                  },
                ],
                default: 'error',
                description: 'What to do when no matching price item is found',
              },
            ],
          },
        ],
      },

      // Output Field Mapping using Resource Mapper (Phase 2)
      {
        displayName: 'Output Field Mapping',
        name: 'outputMappingV2',
        type: 'fixedCollection',
        default: {},
        displayOptions: {
          show: {
            operation: ['processBilling'],
          },
        },
        options: [
          {
            name: 'config',
            displayName: 'Configuration',
            values: [
              {
                displayName: 'Include All Fields',
                name: 'includeAllFields',
                type: 'boolean',
                default: false,
                description: 'Whether to include all fields from source data automatically',
              },
              {
                displayName: 'Field Mapping',
                name: 'fieldMapping',
                type: 'fixedCollection',
                typeOptions: {
                  // This will be replaced with the actual resource mapper in runtime
                  multipleValues: true,
                },
                default: {},
                options: [
                  {
                    name: 'mapping',
                    displayName: 'Map Fields',
                    values: [
                      {
                        displayName: 'Output Field',
                        name: 'outputField',
                        type: 'string',
                        default: '',
                        description: 'Field name in the output',
                      },
                      {
                        displayName: 'Source',
                        name: 'source',
                        type: 'options',
                        options: [
                          {
                            name: 'Usage Data',
                            value: 'usage',
                          },
                          {
                            name: 'Price List',
                            value: 'price',
                          },
                          {
                            name: 'Calculated',
                            value: 'calculated',
                          },
                        ],
                        default: 'usage',
                        description: 'Source of the field data',
                      },
                      {
                        displayName: 'Source Field',
                        name: 'sourceField',
                        type: 'string',
                        default: '',
                        displayOptions: {
                          show: {
                            source: ['usage', 'price'],
                          },
                        },
                        description: 'Field name in the source data',
                      },
                      {
                        displayName: 'Formula',
                        name: 'formula',
                        type: 'string',
                        default: 'usage * unitPrice',
                        displayOptions: {
                          show: {
                            source: ['calculated'],
                          },
                        },
                        description: 'Formula to calculate the field value',
                      },
                    ],
                  },
                ],
                description: 'Define mappings between source fields and output fields',
              },
            ],
          },
        ],
      },

      // Input Data Section
      {
        displayName: 'Input Data',
        name: 'inputData',
        type: 'fixedCollection',
        default: {},
        displayOptions: {
          show: {
            operation: ['processBilling'],
          },
        },
        options: [
          {
            name: 'data',
            displayName: 'Data Sources',
            values: [
              {
                displayName: 'Price List Data Source',
                name: 'priceListSource',
                type: 'options',
                options: [
                  {
                    name: 'Input',
                    value: 'input',
                    description: 'Use input data for price list',
                  },
                  {
                    name: 'Parameter',
                    value: 'parameter',
                    description: 'Provide price list as parameter',
                  },
                ],
                default: 'input',
                description: 'Source of price list data',
              },
              {
                displayName: 'Price List Parameter',
                name: 'priceListParameter',
                type: 'json',
                typeOptions: {
                  alwaysOpenEditWindow: true,
                },
                displayOptions: {
                  show: {
                    priceListSource: ['parameter'],
                  },
                },
                default: '[]',
                description: 'Price list as JSON array',
              },
              {
                displayName: 'Usage Data Source',
                name: 'usageDataSource',
                type: 'options',
                options: [
                  {
                    name: 'Input',
                    value: 'input',
                    description: 'Use input data for usage records',
                  },
                  {
                    name: 'Parameter',
                    value: 'parameter',
                    description: 'Provide usage data as parameter',
                  },
                ],
                default: 'input',
                description: 'Source of usage data',
              },
              {
                displayName: 'Usage Data Parameter',
                name: 'usageDataParameter',
                type: 'json',
                typeOptions: {
                  alwaysOpenEditWindow: true,
                },
                displayOptions: {
                  show: {
                    usageDataSource: ['parameter'],
                  },
                },
                default: '[]',
                description: 'Usage data as JSON array',
              },
            ],
          },
        ],
      },
    ],
  };

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
      const outputSchema = inferSchemaFromExample(outputExample);

      // Get match configuration - Phase 2 enhanced version
      const matchConfigV2 = this.getNodeParameter('matchConfigV2.config', 0, {}) as {
        matchMethod: string;
        fieldMapping: { mapping: { priceListField: string; usageField: string }[] };
        defaultOnNoMatch: string;
      };

      // Convert to MatchConfig for compatibility with existing functions
      const matchConfig: MatchConfig = {
        priceListField: matchConfigV2.fieldMapping?.mapping?.[0]?.priceListField || 'productId',
        usageField: matchConfigV2.fieldMapping?.mapping?.[0]?.usageField || 'productId',
        allowMultipleMatches: matchConfigV2.matchMethod === 'multi',
        defaultOnNoMatch: matchConfigV2.defaultOnNoMatch,
      };

      let result: INodeExecutionData[] = [];

      if (operation === 'validateConfig') {
        // Execute validation operation with enhanced feedback
        const validationResults = await validateConfiguration.call(
          this,
          priceListExample,
          usageExample,
          outputExample,
          matchConfig,
        );

        // Add schema visualization to validation results
        const schemaVisualization = createSchemaVisualization(
          priceListSchema,
          usageSchema,
          outputSchema,
          matchConfig,
        );

        // Include the visualization in the output
        validationResults[0].json.schemaVisualization = schemaVisualization;

        result = validationResults;
      } else if (operation === 'processBilling') {
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

        // Execute billing process
        result = await processBilling.call(
          this,
          priceList,
          usageRecords,
          matchConfig,
          outputConfig,
        );
      }

      return [result];
    } catch (error) {
      throw new NodeOperationError(this.getNode(), error as Error);
    }
  }
}
