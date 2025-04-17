import type { INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export const nodeDescription: INodeTypeDescription = {
  displayName: 'Billing Calculator',
  name: 'billingCalculator',
  icon: 'file:calculator.svg',
  group: ['transform'],
  codex: {
    categories: ['Finance'],
    resources: {
      primaryDocumentation: [
        {
          url: 'https://github.com/yourusername/n8n-nodes-billing-calculator',
        },
      ],
    },
  },
  version: 1,
  subtitle: '={{$parameter["operation"]}}',
  description: 'Process pricing and usage data to generate billing records',
  defaults: {
    name: 'Billing Calculator',
    color: '#785AA2',
  },
  inputs: [NodeConnectionType.Main],
  outputs: [NodeConnectionType.Main],
  properties: [
    {
      displayName: 'Operation',
      name: 'operation',
      type: 'options',
      noDataExpression: true,
      options: [
        {
          name: 'Load Price List',
          value: 'loadPriceList',
          description: 'Import and transform price list data from CSV to JSON format',
          action: 'Import and transform price list data',
        },
        {
          name: 'Calculate Billing',
          value: 'calculateBilling',
          description: 'Process pricing and usage data to generate billing records',
          action: 'Calculate billing based on usage and price data',
        },
      ],
      default: 'loadPriceList',
    },

    // Load Price List Operation - CSV Parsing Configuration
    {
      displayName: 'CSV Parsing Configuration',
      name: 'csvParsingConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['loadPriceList'],
        },
      },
      options: [
        {
          name: 'csvSource',
          displayName: 'CSV Source Data',
          values: [
            {
              displayName: 'Input Data Property Name',
              name: 'fieldName',
              type: 'string',
              default: 'csvdata',
              description:
                'The name of the field containing CSV data (e.g., csvdata, data, or rawCsv)',
            },
            {
              displayName: 'Skip First Row',
              name: 'skipFirstRow',
              type: 'boolean',
              default: true,
              description: 'Whether to skip the first row (header row)',
            },
            {
              displayName: 'Delimiter',
              name: 'delimiter',
              type: 'string',
              default: ',',
              description: 'The character used to separate values in the CSV',
            },
          ],
        },
      ],
    },

    // Load Price List Operation - Hierarchy Configuration (moved before Column Filter)
    {
      displayName: 'Hierarchy Configuration',
      name: 'hierarchyConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['loadPriceList'],
        },
      },
      options: [
        {
          name: 'levels',
          displayName: 'Hierarchy Levels (Ordered by Priority)',
          values: [
            {
              displayName: 'Hierarchy Levels',
              name: 'levelDefinitions',
              placeholder: 'Add Hierarchy Level',
              type: 'fixedCollection',
              typeOptions: {
                multipleValues: true,
              },
              default: {},
              description:
                'Fields to group by, in hierarchical order (first level at the top, more specific levels below)',
              options: [
                {
                  name: 'level',
                  displayName: 'Level',
                  values: [
                    {
                      displayName: 'Source Field',
                      name: 'identifierField',
                      type: 'string',
                      default: '',
                      description:
                        'Field in your data to use for this hierarchy level (e.g., ProductName, Category, etc.)',
                      required: true,
                    },
                    {
                      displayName: 'Output Field Name (Optional)',
                      name: 'outputField',
                      type: 'string',
                      default: '',
                      description:
                        'Rename this field in the output (leave empty to keep the original field name)',
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // Load Price List Operation - Column Filter (renamed from Column Mapping)
    {
      displayName: 'Column Filter',
      name: 'columnMappingConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['loadPriceList'],
        },
      },
      description:
        'Configure which additional fields to include and their data types (hierarchy fields are always included)',
      options: [
        {
          name: 'includeOptions',
          displayName: 'Column Inclusion Options',
          values: [
            {
              displayName: 'Include All Columns',
              name: 'includeAllColumns',
              type: 'boolean',
              default: true,
              description:
                'Whether to include all columns at each level once hierarchy has been applied',
            },
            {
              displayName: 'Columns to Include',
              name: 'includeColumnsList',
              type: 'string',
              default: '',
              displayOptions: {
                show: {
                  includeAllColumns: [false],
                },
              },
              placeholder: 'column1,column2,column3',
              description:
                'Comma-separated list of column names to include (if empty, only hierarchy fields will be included)',
            },
          ],
        },
        {
          name: 'mappings',
          displayName: 'Include Additional Fields',
          values: [
            {
              displayName: 'Additional Fields',
              name: 'columns',
              placeholder: 'Add Field',
              type: 'fixedCollection',
              typeOptions: {
                multipleValues: true,
              },
              default: {},
              description: 'Fields to include in addition to hierarchy fields',
              options: [
                {
                  name: 'column',
                  displayName: 'Field',
                  values: [
                    {
                      displayName: 'CSV Column',
                      name: 'csvColumn',
                      type: 'string',
                      default: '',
                      description: 'CSV column to include',
                    },
                    {
                      displayName: 'Target Field',
                      name: 'targetField',
                      type: 'string',
                      default: '',
                      description:
                        'Field name in the resulting JSON (same as CSV column if left empty)',
                    },
                    {
                      displayName: 'Data Type',
                      name: 'dataType',
                      type: 'options',
                      options: [
                        { name: 'String', value: 'string' },
                        { name: 'Number', value: 'number' },
                        { name: 'Boolean', value: 'boolean' },
                      ],
                      default: 'string',
                      description: 'How to convert the field value',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // Input Data Section - For Calculate Billing Operation
    {
      displayName: 'Price List Field Name',
      name: 'priceListFieldName',
      type: 'string',
      default: 'priceList',
      description: 'The name of the field containing price list data',
      required: true,
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
    },
    {
      displayName: 'Usage Data Field Name',
      name: 'usageDataFieldName',
      type: 'string',
      default: 'usageData',
      description: 'The name of the field containing usage data',
      required: true,
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
    },

    // Match Configuration Section - For Calculate Billing Operation
    {
      displayName: 'Match Configuration',
      name: 'matchConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
      options: [
        {
          name: 'hierarchyLevels',
          displayName: 'Hierarchy Matching Levels',
          values: [
            {
              displayName: 'Hierarchy Levels',
              name: 'level',
              placeholder: 'Add Hierarchy Level',
              type: 'fixedCollection',
              typeOptions: {
                multipleValues: true,
              },
              default: {},
              description: 'Fields to match at each hierarchy level (top to bottom)',
              options: [
                {
                  name: 'level',
                  displayName: 'Level',
                  values: [
                    {
                      displayName: 'Price List Field',
                      name: 'priceListField',
                      type: 'string',
                      default: '',
                      description: 'The key in the price list hierarchy at this level',
                      required: true,
                    },
                    {
                      displayName: 'Usage Field',
                      name: 'usageField',
                      type: 'string',
                      default: '',
                      description: 'Field in usage data containing value to match at this level',
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'partialMatchBehavior',
          displayName: 'Partial Match Behavior',
          values: [
            {
              displayName: 'Partial Match Behavior',
              name: 'behavior',
              type: 'options',
              options: [
                { name: 'Best Match (Match As Far As Possible)', value: 'bestMatch' },
                { name: 'No Match (Require Full Path Match)', value: 'noMatch' },
              ],
              default: 'noMatch',
              description: 'What to do when only some levels in the hierarchy match',
            },
          ],
        },
        {
          name: 'fieldMappings',
          displayName: 'Field Mappings',
          values: [
            {
              displayName: 'Field Mappings',
              name: 'mappings',
              placeholder: 'Add Field Mapping',
              type: 'fixedCollection',
              typeOptions: {
                multipleValues: true,
              },
              default: {},
              description: 'Map fields from usage data to output fields',
              options: [
                {
                  name: 'mapping',
                  displayName: 'Mapping',
                  values: [
                    {
                      displayName: 'Source Field',
                      name: 'sourceField',
                      type: 'string',
                      default: '',
                      description: 'Field in usage data to map',
                      required: true,
                    },
                    {
                      displayName: 'Target Field',
                      name: 'targetField',
                      type: 'string',
                      default: '',
                      description:
                        'Name of field in output (leave empty to keep source field name)',
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // No Match Behavior - For Calculate Billing Operation (Independent setting)
    {
      displayName: 'No Match Behavior',
      name: 'matchConfig.noMatchBehavior',
      type: 'options',
      options: [
        { name: 'Skip Record', value: 'skip' },
        { name: 'Error', value: 'error' },
      ],
      default: 'skip',
      description: 'What to do when no matching price is found for a usage record',
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
    },

    // Calculation Configuration - For Calculate Billing Operation
    {
      displayName: 'Calculation Configuration',
      name: 'calculationConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
      options: [
        {
          name: 'calculationMethod',
          displayName: 'Calculation Method',
          values: [
            {
              displayName: 'Method',
              name: 'method',
              type: 'options',
              options: [
                { name: 'Basic (quantity * price)', value: 'basic' },
                { name: 'Simple Tiered', value: 'tiered' },
              ],
              default: 'basic',
              description: 'Method to calculate billing amount',
            },
            {
              displayName: 'Quantity Field',
              name: 'quantityField',
              type: 'string',
              default: 'usage',
              description: 'Field containing quantity/usage amount',
            },
            {
              displayName: 'Price Field',
              name: 'priceField',
              type: 'string',
              default: 'unitPrice',
              description: 'Field containing unit price',
            },
          ],
        },
      ],
    },

    // Output Field Configuration - For Calculate Billing Operation
    {
      displayName: 'Output Configuration',
      name: 'outputConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['calculateBilling'],
        },
      },
      options: [
        {
          name: 'outputFields',
          displayName: 'Output Fields',
          values: [
            {
              displayName: 'Fields',
              name: 'fields',
              type: 'string',
              typeOptions: {
                multipleValues: true,
              },
              default: ['productId', 'usage', 'unitPrice', 'totalCost', 'customerId'],
              description: 'Fields to include in output',
            },
            {
              displayName: 'Total Field',
              name: 'totalField',
              type: 'string',
              default: 'totalCost',
              description: 'Field to store calculation result',
            },
          ],
        },
      ],
    },
  ],
};
