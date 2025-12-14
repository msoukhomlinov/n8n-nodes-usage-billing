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
      default: 'matchUsageAndCalculate',
    },

    // Match Usage and Calculate Configuration
    {
      displayName: 'Price List Data',
      name: 'priceListFieldName',
      type: 'string',
      placeholder: 'priceList',
      default: '',
      description:
        'Field name or expression that resolves to the price list array. Examples: priceList, data.prices, or {{ $(\'Import Pricing\').all() }}. The value is evaluated once and reused for all matches.',
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
        'Field name or expression that resolves to usage records. Examples: usageItems, data.usage, or {{ $(\'Usage Source\').all() }}. Accepts arrays or single objects.',
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
              noDataExpression: true,
              default: '',
              placeholder: 'product_id',
              description: 'Field name in the price list data to match on',
              required: true,
            },
            {
              displayName: 'Usage Field',
              name: 'usageField',
              type: 'string',
              noDataExpression: true,
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
          noDataExpression: true,
          default: 'customerId',
          placeholder: 'customerId',
          description: 'The field name in your price list that contains the customer identifier',
          required: true,
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
          noDataExpression: true,
          default: 'customerId',
          placeholder: 'customerId',
          description:
            'The field name in your usage data that contains the customer identifier to match against the price list',
          required: true,
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
          noDataExpression: true,
          placeholder: 'quantity',
          default: '',
          description:
            'Literal field name in the usage data containing the quantity value; must come from usage data',
          required: false,
        },
        {
          displayName: 'Cost Price Field',
          name: 'costPriceField',
          type: 'string',
          noDataExpression: true,
          placeholder: 'cost',
          default: '',
          description:
            'Literal field name in the price list data containing the cost price value; must come from price list data',
          required: false,
        },
        {
          displayName: 'Sell Price Field',
          name: 'sellPriceField',
          type: 'string',
          noDataExpression: true,
          placeholder: 'price',
          default: '',
          description:
            'Literal field name in the price list data containing the sell price value; must come from price list data',
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
      type: 'collection',
      placeholder: 'Add Output Field Configuration',
      default: {
        automatic: false,
        pricelistFieldPrefix: 'price_',
        usageFieldPrefix: 'usage_',
      },
      displayOptions: {
        show: {
          operation: ['matchUsageAndCalculate'],
        },
      },
      options: [
        {
          displayName: 'Automatic Field Inclusion',
          name: 'automatic',
          type: 'boolean',
          default: false,
          description:
            'When enabled, automatically includes all fields from both pricelist and usage data with configured prefixes. When disabled, manually specify which fields to include.',
        },
        {
          displayName: 'Pricelist Field Prefix',
          name: 'pricelistFieldPrefix',
          type: 'string',
          default: 'price_',
          required: true,
          description:
            'Prefix to add to all pricelist field names in output (required when automatic mode is enabled)',
          displayOptions: {
            show: {
              automatic: [true],
            },
          },
        },
        {
          displayName: 'Usage Field Prefix',
          name: 'usageFieldPrefix',
          type: 'string',
          default: 'usage_',
          required: true,
          description:
            'Prefix to add to all usage field names in output (required when automatic mode is enabled)',
          displayOptions: {
            show: {
              automatic: [true],
            },
          },
        },
        {
          displayName: 'Manual Fields',
          name: 'includeFields',
          type: 'fixedCollection',
          typeOptions: {
            multipleValues: true,
          },
          placeholder: 'Add Output Field',
          default: {},
          description:
            'Manually specify fields to include in the output (only used when automatic mode is disabled)',
          displayOptions: {
            show: {
              automatic: [false],
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
                  noDataExpression: true,
                  default: '',
                  description: 'Literal field name in the source data',
                  required: true,
                },
                {
                  displayName: 'Target Field',
                  name: 'targetField',
                  type: 'string',
                  noDataExpression: true,
                  default: '',
                  description:
                    'Literal name to use in the output data (leave empty to reuse source name; expressions not allowed)',
                },
              ],
            },
          ],
        },
      ],
      description:
        'Configure which additional fields to include in the output records. Use automatic mode to include all fields with prefixes, or manual mode to specify individual fields. Note: All matched fields, quantity field, cost and sell price fields, and calculated totals are automatically included.',
    },

    // Usage Summary Configuration options
    {
      displayName: 'Usage Data',
      name: 'usageData',
      type: 'string',
      placeholder: '{{ $(\'Match Usage and Calculate\').all() }}',
      default: '',
      description:
        'Expression or JSON that resolves to the usage records to summarise. Accepts arrays or single objects.',
      required: true,
      displayOptions: {
        show: {
          operation: ['usageSummary'],
        },
      },
    },
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
