import type { INodeTypeDescription } from 'n8n-workflow';

/**
 * Node UI Configuration
 */
export const nodeDescription: INodeTypeDescription = {
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
              default: '{\n  "productId": "PROD001",\n  "usage": 5,\n  "customerId": "CUST123"\n}',
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
                  name: 'Multi-Field Match',
                  value: 'multi',
                  description: 'Match records using multiple fields (composite key)',
                },
              ],
              default: 'single',
              description: 'How to match price list items with usage records',
            },
            {
              displayName: 'Field Mapping',
              name: 'fieldMapping',
              type: 'fixedCollection',
              default: { mapping: [{}] },
              typeOptions: {
                multipleValues: true,
              },
              options: [
                {
                  name: 'mapping',
                  displayName: 'Mapping',
                  values: [
                    {
                      displayName: 'Price List Field',
                      name: 'priceListField',
                      type: 'string',
                      default: 'productId',
                      description: 'Field from price list to use for matching',
                      required: true,
                    },
                    {
                      displayName: 'Usage Field',
                      name: 'usageField',
                      type: 'string',
                      default: 'productId',
                      description: 'Corresponding field from usage data for matching',
                      required: true,
                    },
                  ],
                },
              ],
            },
            {
              displayName: 'When No Match Found',
              name: 'defaultOnNoMatch',
              type: 'options',
              options: [
                {
                  name: 'Report Error',
                  value: 'error',
                  description: 'Throw an error if a usage record has no matching price',
                },
                {
                  name: 'Skip Record',
                  value: 'skip',
                  description: 'Skip usage records that have no matching price',
                },
                {
                  name: 'Include with Empty Price Data',
                  value: 'include',
                  description: 'Include the record but with empty price data',
                },
              ],
              default: 'error',
              description: 'What to do when a usage record has no matching price list item',
            },
          ],
        },
      ],
    },

    // Input Data Section with JSON Support
    {
      displayName: 'Input Data',
      name: 'inputData',
      type: 'fixedCollection',
      default: {
        data: {
          priceListSource: 'input',
          usageDataSource: 'input',
        },
      },
      options: [
        {
          name: 'data',
          displayName: 'Data Sources',
          values: [
            {
              displayName: 'Price List Source',
              name: 'priceListSource',
              type: 'options',
              options: [
                {
                  name: 'Data from Input',
                  value: 'input',
                  description: 'Use data from input (priceList field)',
                },
                {
                  name: 'Parameter Value',
                  value: 'parameter',
                  description: 'Use data from a parameter',
                },
              ],
              default: 'input',
              description: 'Where to get the price list data from',
            },
            {
              displayName: 'Price List Parameter',
              name: 'priceListParameter',
              type: 'json',
              displayOptions: {
                show: {
                  priceListSource: ['parameter'],
                },
              },
              default: '[]',
              description: 'JSON array of price list items',
            },
            {
              displayName: 'Usage Records Source',
              name: 'usageDataSource',
              type: 'options',
              options: [
                {
                  name: 'Data from Input',
                  value: 'input',
                  description: 'Use data from input (usageRecords field)',
                },
                {
                  name: 'Parameter Value',
                  value: 'parameter',
                  description: 'Use data from a parameter',
                },
              ],
              default: 'input',
              description: 'Where to get the usage data from',
            },
            {
              displayName: 'Usage Records Parameter',
              name: 'usageDataParameter',
              type: 'json',
              displayOptions: {
                show: {
                  usageDataSource: ['parameter'],
                },
              },
              default: '[]',
              description: 'JSON array of usage records',
            },
          ],
        },
      ],
    },

    // Output Mapping Section - Enhanced Resource Mapper (Phase 2)
    {
      displayName: 'Output Mapping',
      name: 'outputMappingV2',
      type: 'fixedCollection',
      default: {
        config: {
          includeAllFields: true,
          fieldMapping: { mapping: [] },
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
              default: true,
              description:
                'Whether to include all fields from both price and usage data in the output',
            },
            {
              displayName: 'Custom Field Mapping',
              name: 'fieldMapping',
              type: 'fixedCollection',
              default: { mapping: [] },
              displayOptions: {
                show: {
                  includeAllFields: [false],
                },
              },
              typeOptions: {
                multipleValues: true,
              },
              options: [
                {
                  name: 'mapping',
                  displayName: 'Field Mapping',
                  values: [
                    {
                      displayName: 'Output Field Name',
                      name: 'outputField',
                      type: 'string',
                      default: '',
                      description: 'Name of the field in the output',
                      required: true,
                    },
                    {
                      displayName: 'Source Type',
                      name: 'source',
                      type: 'options',
                      options: [
                        {
                          name: 'Usage Data',
                          value: 'usage',
                          description: 'Take value from usage record',
                        },
                        {
                          name: 'Price List',
                          value: 'price',
                          description: 'Take value from price list item',
                        },
                        {
                          name: 'Calculated Value',
                          value: 'calculated',
                          description: 'Calculate value using a formula',
                        },
                      ],
                      default: 'usage',
                      description: 'Where to get the value from',
                    },
                    {
                      displayName: 'Source Field',
                      name: 'sourceField',
                      type: 'string',
                      displayOptions: {
                        show: {
                          source: ['usage', 'price'],
                        },
                      },
                      default: '',
                      description: 'Field name from the source record',
                    },
                    {
                      displayName: 'Formula',
                      name: 'formula',
                      type: 'string',
                      displayOptions: {
                        show: {
                          source: ['calculated'],
                        },
                      },
                      default: 'price.unitPrice * usage.quantity',
                      placeholder: 'e.g., price.unitPrice * usage.quantity',
                      description:
                        'Calculate value using a formula with price.{field} and usage.{field} references',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // Advanced Options
    {
      displayName: 'Advanced Options',
      name: 'advancedOptions',
      type: 'collection',
      placeholder: 'Add Option',
      default: {},
      options: [
        {
          displayName: 'Batch Processing',
          name: 'batchProcessing',
          type: 'collection',
          placeholder: 'Configure Batch Processing',
          default: {},
          options: [
            {
              displayName: 'Enable Batch Processing',
              name: 'enabled',
              type: 'boolean',
              default: false,
              description: 'Process records in batches for better performance with large datasets',
            },
            {
              displayName: 'Batch Size',
              name: 'batchSize',
              type: 'number',
              default: 1000,
              description: 'Number of records to process in each batch',
              displayOptions: {
                show: {
                  enabled: [true],
                },
              },
            },
            {
              displayName: 'Report Progress',
              name: 'reportProgress',
              type: 'boolean',
              default: true,
              description: 'Whether to report progress during batch processing',
              displayOptions: {
                show: {
                  enabled: [true],
                },
              },
            },
          ],
        },
        {
          displayName: 'Error Handling',
          name: 'errorHandling',
          type: 'collection',
          placeholder: 'Configure Error Handling',
          default: {},
          options: [
            {
              displayName: 'On Batch Error',
              name: 'onBatchError',
              type: 'options',
              options: [
                {
                  name: 'Stop All Processing',
                  value: 'stopAll',
                  description: 'Stop all processing when an error occurs in a batch',
                },
                {
                  name: 'Skip Failed Batch',
                  value: 'skipBatch',
                  description: 'Skip the entire batch when an error occurs in it',
                },
                {
                  name: 'Process Records Individually',
                  value: 'processIndividual',
                  description:
                    'Fall back to processing records individually when a batch error occurs',
                },
              ],
              default: 'processIndividual',
              description: 'How to handle errors during batch processing',
            },
          ],
        },
        {
          displayName: 'Debugging',
          name: 'debugging',
          type: 'collection',
          placeholder: 'Configure Debugging',
          default: {},
          options: [
            {
              displayName: 'Log Level',
              name: 'logLevel',
              type: 'options',
              options: [
                {
                  name: 'None',
                  value: 'NONE',
                  description: 'No logging',
                },
                {
                  name: 'Errors Only',
                  value: 'ERROR',
                  description: 'Log errors only',
                },
                {
                  name: 'Warnings & Errors',
                  value: 'WARN',
                  description: 'Log warnings and errors',
                },
                {
                  name: 'Info',
                  value: 'INFO',
                  description: 'Log informational messages, warnings, and errors',
                },
                {
                  name: 'Debug',
                  value: 'DEBUG',
                  description: 'Verbose logging for debugging',
                },
                {
                  name: 'Trace',
                  value: 'TRACE',
                  description: 'Maximum verbosity logging',
                },
              ],
              default: 'ERROR',
              description: 'Set the level of detail for logs',
            },
            {
              displayName: 'Include Match Details',
              name: 'includeMatchDetails',
              type: 'boolean',
              default: false,
              description: 'Include details about match attempts in the output',
            },
            {
              displayName: 'Include Formula Evaluation Details',
              name: 'includeFormulaDetails',
              type: 'boolean',
              default: false,
              description: 'Include details about formula evaluations in the output',
            },
            {
              displayName: 'Include Batch Statistics',
              name: 'includeBatchStatistics',
              type: 'boolean',
              default: false,
              description: 'Include batch processing statistics in the output',
            },
            {
              displayName: 'Include Data Flow Visualization',
              name: 'includeDataFlowVisualization',
              type: 'boolean',
              default: false,
              description: 'Include a visualization of the data processing flow',
            },
          ],
        },
      ],
    },
  ],
};
