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
  outputs: [
    {
      type: NodeConnectionType.Main,
      displayName: 'Valid Records',
    },
    {
      type: NodeConnectionType.Main,
      displayName: 'Invalid/Unmatched Records',
    },
  ],
  properties: [
    {
      displayName: 'Operation',
      name: 'operation',
      type: 'options',
      noDataExpression: true,
      options: [
        {
          name: 'Import Price List',
          value: 'importPriceList',
          description: 'Import and transform price list data from CSV to JSON format',
          action: 'Import and transform price list data',
        },
        {
          name: 'Pricelist Lookup',
          value: 'pricelistLookup',
          description: 'Match usage data against price list and calculate billing',
          action: 'Match usage data against price list and calculate billing',
        },
      ],
      default: 'importPriceList',
    },

    // Import Price List Operation - CSV Parsing Configuration
    {
      displayName: 'CSV Parsing Configuration',
      name: 'csvParsingConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['importPriceList'],
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
              default: '',
              placeholder: 'csvdata',
              description:
                'The name of the field containing CSV data (e.g., csvdata, data, or rawCsv)',
              required: true,
            },
            {
              displayName: 'Delimiter',
              name: 'delimiter',
              type: 'options',
              options: [
                {
                  name: 'Auto-detect',
                  value: 'auto',
                  description:
                    'Automatically detect the delimiter (works best with standard formats)',
                },
                {
                  name: 'Comma (,)',
                  value: ',',
                  description: 'Standard CSV delimiter',
                },
                {
                  name: 'Semicolon (;)',
                  value: ';',
                  description: 'Common in European locales',
                },
                {
                  name: 'Tab',
                  value: 'tab',
                  description: 'Tab-separated values (TSV)',
                },
                {
                  name: 'Pipe (|)',
                  value: '|',
                  description: 'Pipe-separated values',
                },
              ],
              default: 'auto',
              description: 'The character used to separate values in the CSV',
            },
          ],
        },
      ],
    },

    // Column Filtering Configuration for Import Price List
    {
      displayName: 'Column Filtering Options',
      name: 'columnFilterConfig',
      type: 'collection',
      placeholder: 'Add Field',
      default: {
        includeAllColumns: true,
      },
      displayOptions: {
        show: {
          operation: ['importPriceList'],
        },
      },
      options: [
        {
          displayName: 'Include All Columns',
          name: 'includeAllColumns',
          type: 'boolean',
          default: true,
          description: 'Whether to include all columns from the CSV data in the output',
        },
        {
          displayName: 'Columns to Include',
          name: 'includeColumnsList',
          type: 'string',
          default: '',
          description:
            'Comma-separated list of column names to include (only used if Include All Columns is false)',
          displayOptions: {
            show: {
              includeAllColumns: [false],
            },
          },
        },
      ],
    },

    // Pricelist Lookup Configuration
    {
      displayName: 'Price List Field Name',
      name: 'priceListFieldName',
      type: 'string',
      default: 'priceList',
      description: 'Name of the field containing the price list data',
      required: true,
      displayOptions: {
        show: {
          operation: ['pricelistLookup'],
        },
      },
    },
    {
      displayName: 'Usage Data Field Name',
      name: 'usageDataFieldName',
      type: 'string',
      default: 'usageData',
      description: 'Name of the field containing the usage data',
      required: true,
      displayOptions: {
        show: {
          operation: ['pricelistLookup'],
        },
      },
    },

    // Match Fields Configuration
    {
      displayName: 'Match Fields',
      name: 'matchFields',
      type: 'fixedCollection',
      typeOptions: {
        multipleValues: true,
      },
      placeholder: 'Add Match Field Pair',
      default: {},
      displayOptions: {
        show: {
          operation: ['pricelistLookup'],
        },
      },
      options: [
        {
          name: 'field',
          displayName: 'Field Mapping',
          values: [
            {
              displayName: 'Price List Field',
              name: 'priceListField',
              type: 'string',
              default: '',
              placeholder: 'product_id',
              description: 'Field name in the price list data to match on',
              required: true,
            },
            {
              displayName: 'Usage Field',
              name: 'usageField',
              type: 'string',
              default: '',
              placeholder: 'product_id',
              description: 'Field name in the usage data to match on',
              required: true,
            },
          ],
        },
      ],
      description: 'Fields to match between price list and usage data',
    },

    // Calculation Configuration
    {
      displayName: 'Calculation Settings',
      name: 'calculationConfig',
      type: 'collection',
      placeholder: 'Add Setting',
      default: {},
      displayOptions: {
        show: {
          operation: ['pricelistLookup'],
        },
      },
      options: [
        {
          displayName: 'Quantity Field',
          name: 'quantityField',
          type: 'string',
          default: 'quantity',
          description: 'Field in the usage data containing the quantity value',
          required: false,
        },
        {
          displayName: 'Price Field',
          name: 'priceField',
          type: 'string',
          default: 'price',
          description: 'Field in the price list data containing the price value',
          required: false,
        },
      ],
    },

    // Output Configuration
    {
      displayName: 'Output Fields',
      name: 'outputConfig',
      type: 'fixedCollection',
      typeOptions: {
        multipleValues: true,
      },
      placeholder: 'Add Output Field',
      default: {},
      displayOptions: {
        show: {
          operation: ['pricelistLookup'],
        },
      },
      options: [
        {
          name: 'includeFields',
          displayName: 'Field to Include',
          values: [
            {
              displayName: 'Source',
              name: 'source',
              type: 'options',
              options: [
                {
                  name: 'Price List',
                  value: 'pricelist',
                },
                {
                  name: 'Usage Data',
                  value: 'usage',
                },
              ],
              default: 'pricelist',
              description: 'Where to get the field from',
            },
            {
              displayName: 'Source Field',
              name: 'sourceField',
              type: 'string',
              default: '',
              description: 'Name of the field in the source data',
              required: true,
            },
            {
              displayName: 'Target Field',
              name: 'targetField',
              type: 'string',
              default: '',
              description:
                'Name to use for this field in the output data (leave empty to use source name)',
            },
          ],
        },
      ],
      description: 'Fields to include in the output records',
    },
  ],
};
