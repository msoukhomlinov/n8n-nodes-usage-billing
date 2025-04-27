import type { INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export const nodeDescription: INodeTypeDescription = {
  displayName: 'Usage Billing',
  name: 'usageBilling',
  icon: 'file:usageBilling.svg',
  group: ['transform'],
  usableAsTool: true,
  codex: {
    categories: ['Finance'],
    resources: {
      primaryDocumentation: [
        {
          url: 'https://github.com/msoukhomlinov/n8n-nodes-usage-billing',
        },
      ],
    },
  },
  version: 1,
  subtitle: '={{$parameter["operation"]}}',
  description: 'Process pricing and usage data to generate billing records',
  defaults: {
    name: 'Usage Billing',
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
          name: 'Import Pricing Data',
          value: 'importPricingData',
          description: 'Import and transform pricing data from CSV to JSON format',
          action: 'Import and transform pricing data',
        },
        {
          name: 'Match Usage and Calculate',
          value: 'matchUsageAndCalculate',
          description: 'Match usage data object against price list object and calculate billing.',
          action: 'Match usage data against price list and calculate billing',
        },
        {
          name: 'Usage Summary',
          value: 'usageSummary',
          description: 'Generate a summary of total costs from matched records',
          action: 'Generate a summary of costs from matched records',
        },
      ],
      default: 'importPricingData',
    },

    // Import Pricing Data Operation - CSV Parsing Configuration
    {
      displayName: 'CSV Parsing Configuration',
      name: 'csvParsingConfig',
      type: 'fixedCollection',
      default: {},
      displayOptions: {
        show: {
          operation: ['importPricingData'],
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

    // Column Filtering Configuration for Import Pricing Data
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
          operation: ['importPricingData'],
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

    // Match Usage and Calculate Configuration
    {
      displayName: 'Price List Data',
      name: 'priceListFieldName',
      type: 'string',
      placeholder: 'priceList',
      default: '',
      description: 'The field containing the price list data (must be provided as a single item)',
      required: true,
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
        },
      },
    },
    {
      displayName: 'Usage Data',
      name: 'usageDataFieldName',
      type: 'string',
      placeholder: 'usageData',
      default: '',
      description:
        'The field containing usage data (must be provided as an object with one or more items)',
      required: true,
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
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
      default: {
        field: [
          {
            priceListField: '',
            usageField: '',
          },
        ],
      },
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
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
      description:
        'Define field pairs that uniquely identify matching records between price list and usage data (at least one pair required to ensure a single, unique match)',
    },

    // Customer-Specific Pricing Configuration
    {
      displayName: 'Customer-Specific Pricing',
      name: 'customerPricingConfig',
      type: 'collection',
      placeholder: 'Add Customer Pricing Setting',
      default: {
        useCustomerSpecificPricing: false,
      },
      description:
        'Configure this section when your price list contains duplicate items where some entries are for specific customers and others are for all customers (requiring customer ID matching).',
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
        },
      },
      options: [
        {
          displayName: 'Pricelist Contains Customer-Specific Pricing',
          name: 'useCustomerSpecificPricing',
          type: 'boolean',
          default: false,
          description:
            'Turn on when your price list contains duplicate product entries where some are specific to individual customers and others apply to all customers',
        },
        {
          displayName: 'Customer ID Field in Price List',
          name: 'customerIdPriceListField',
          type: 'string',
          default: 'customerId',
          placeholder: 'customerId',
          description: 'The field name in your price list that contains the customer identifier',
          displayOptions: {
            show: {
              useCustomerSpecificPricing: [true],
            },
          },
        },
        {
          displayName: 'Customer ID Field in Usage Data',
          name: 'customerIdUsageField',
          type: 'string',
          default: 'customerId',
          placeholder: 'customerId',
          description:
            'The field name in your usage data that contains the customer identifier to match against the price list',
          displayOptions: {
            show: {
              useCustomerSpecificPricing: [true],
            },
          },
        },
      ],
    },

    // Calculation Configuration
    {
      displayName: 'Calculation Settings',
      name: 'calculationConfig',
      type: 'collection',
      placeholder: 'Add Setting',
      default: {
        quantityField: '',
        costPriceField: '',
        sellPriceField: '',
        roundingDirection: 'none',
        decimalPlaces: 1,
      },
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
        },
      },
      options: [
        {
          displayName: 'Quantity Field',
          name: 'quantityField',
          type: 'string',
          placeholder: 'quantity',
          default: '',
          description: 'Field in the usage data containing the quantity value',
          required: false,
        },
        {
          displayName: 'Cost Price Field',
          name: 'costPriceField',
          type: 'string',
          placeholder: 'cost',
          default: '',
          description: 'Field in the price list data containing the cost price value',
          required: false,
        },
        {
          displayName: 'Sell Price Field',
          name: 'sellPriceField',
          type: 'string',
          placeholder: 'price',
          default: '',
          description: 'Field in the price list data containing the sell price value',
          required: false,
        },
        {
          displayName: 'Rounding',
          name: 'roundingDirection',
          type: 'options',
          options: [
            {
              name: 'None',
              value: 'none',
              description: 'No rounding applied',
            },
            {
              name: 'Round Up',
              value: 'up',
              description: 'Round up to the nearest decimal place',
            },
            {
              name: 'Round Down',
              value: 'down',
              description: 'Round down to the nearest decimal place',
            },
          ],
          default: 'none',
          description:
            'How to round the calculated amounts (applies to both cost and sell calculations)',
        },
        {
          displayName: 'Decimal Places',
          name: 'decimalPlaces',
          type: 'options',
          displayOptions: {
            show: {
              roundingDirection: ['up', 'down'],
            },
          },
          options: [
            {
              name: '0 (Whole Numbers)',
              value: 0,
              description: 'Round to whole numbers',
            },
            {
              name: '1 (Tenths)',
              value: 1,
              description: 'Round to one decimal place (tenths)',
            },
            {
              name: '2 (Hundredths)',
              value: 2,
              description: 'Round to two decimal places (hundredths)',
            },
            {
              name: '3 (Thousandths)',
              value: 3,
              description: 'Round to three decimal places (thousandths)',
            },
          ],
          default: 1,
          description: 'Number of decimal places to round to',
        },
      ],
    },

    // Output Configuration
    {
      displayName: 'Output Field Configuration',
      name: 'outputFieldsConfig',
      type: 'collection',
      placeholder: 'Add Field Configuration',
      default: {
        includeMatchPricelistFields: true,
        includeMatchUsageFields: true,
        includeCalculationFields: true,
        pricelistFieldPrefix: 'price_',
        usageFieldPrefix: 'usage_',
        calculationFieldPrefix: 'calc_',
        calculatedCostAmountField: 'calc_cost_amount',
        calculatedSellAmountField: 'calc_sell_amount',
      },
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
        },
      },
      options: [
        {
          displayName: 'Include Match Pricelist Fields',
          name: 'includeMatchPricelistFields',
          type: 'boolean',
          default: true,
          description: 'Whether to automatically include all pricelist fields used for matching',
        },
        {
          displayName: 'Include Match Usage Fields',
          name: 'includeMatchUsageFields',
          type: 'boolean',
          default: true,
          description: 'Whether to automatically include all usage fields used for matching',
        },
        {
          displayName: 'Include Calculation Fields',
          name: 'includeCalculationFields',
          type: 'boolean',
          default: true,
          description:
            'Whether to automatically include quantity and price fields used in calculations',
        },
        {
          displayName: 'Pricelist Field Prefix',
          name: 'pricelistFieldPrefix',
          type: 'string',
          default: 'price_',
          description: 'Prefix to add to pricelist field names in output',
        },
        {
          displayName: 'Usage Field Prefix',
          name: 'usageFieldPrefix',
          type: 'string',
          default: 'usage_',
          description: 'Prefix to add to usage field names in output',
        },
        {
          displayName: 'Calculation Field Prefix',
          name: 'calculationFieldPrefix',
          type: 'string',
          default: 'calc_',
          description: 'Prefix to add to calculation field names in output',
        },
        {
          displayName: 'Calculated Cost Amount Field Name',
          name: 'calculatedCostAmountField',
          type: 'string',
          default: 'calc_cost_amount',
          description: 'Name of the field for the calculated cost amount in the output',
        },
        {
          displayName: 'Calculated Sell Amount Field Name',
          name: 'calculatedSellAmountField',
          type: 'string',
          default: 'calc_sell_amount',
          description: 'Name of the field for the calculated sell amount in the output',
        },
      ],
      description: 'Configure automatic field inclusion and naming in the output records',
    },
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
          operation: ['matchUsageAndCalculate'],
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
      description:
        'Additional fields to include in the output records. Note: All matched fields, quantity field, cost and sell price fields, and calculated totals are automatically included.',
    },

    // Usage Summary Configuration options
    {
      displayName: 'Fields to Total',
      name: 'fieldsToTotal',
      type: 'string',
      placeholder: 'calc_cost_amount,calc_sell_amount,quantity',
      default: '',
      description:
        'Comma-separated list of field names to total. For each field, a "total_[field name]" will be included in the summary output.',
      required: true,
      displayOptions: {
        show: {
          operation: ['usageSummary'],
        },
      },
    },
    {
      displayName: 'Group By Fields',
      name: 'groupByFields',
      type: 'string',
      placeholder: 'field1,field2',
      default: '',
      description:
        'Optional comma-separated list of fields to group summary by (e.g., product_id,region)',
      displayOptions: {
        show: {
          operation: ['usageSummary'],
        },
      },
    },
    {
      displayName: 'Include Source Data',
      name: 'includeSourceData',
      type: 'boolean',
      default: false,
      description: 'Whether to include the original source data records in the summary output',
      displayOptions: {
        show: {
          operation: ['usageSummary'],
        },
      },
    },
  ],
};
