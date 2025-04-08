# n8n-nodes-billing-calculator design

# Simplified Design: n8n-nodes-billing-calculator (v1)

## Core Functionality Overview

The n8n-nodes-billing-calculator node will serve as middleware that processes pricing and usage data to generate accurate billing records. This simplified design focuses on:

1. Direct field mapping for pricing and usage data
2. Basic matching between usage data and price list items
3. Simple output generation based on configurable fields
4. Essential validation for key operations

## Node Operation

The node will offer a single operation:

1. **Process Billing**
   - Takes usage data and price list as inputs
   - Performs matching and calculation
   - Outputs formatted billing records

## Field Configuration Interface

The node will use direct field mapping for simplicity:

### Manual Field Configuration

- Users specify key fields for:
  - Price list items (e.g., productId, unitPrice, currency)
  - Usage data (e.g., productId, usage, customerId)
  - Output billing records

- Configuration is done through:
  - Dropdown selection of input fields
  - Simple mapping between input and output fields
  - Selection of calculation method

## Field Mapping

The node implements a straightforward approach to field mapping:

### Match Configuration

- Clear UI section for defining how usage data maps to price list items
- Support for single-key matching (e.g., ProductID to SKU)
- Dropdown selection of fields from input data

### Calculation Configuration

- Predefined calculation templates:
  - Basic multiplication (quantity * unit price)
  - Simple tiered pricing
- Option to specify output fields

## Validation Framework

The node implements essential validation:

### Input Validation

- Verification of required fields
- Type checking for key fields (ensuring numbers are numeric, etc.)

### Match Validation

- Detection of missing match keys
- Error reporting for usage items without matching prices
- Option to specify default behavior for non-matches

### Output Validation

- Basic verification that required output fields can be populated
- Validation of calculation results

## Technical Implementation Details

### Data Structures

```typescript
// Runtime data interfaces
interface PriceListItem {
  [key: string]: any;
}

interface UsageRecord {
  [key: string]: any;
}

interface BillingRecord {
  [key: string]: any;
}

interface MatchResult {
  matched: boolean;
  multipleMatches: boolean;
  matchedItems: PriceListItem[];
  errorMessage?: string;
}
```

### Node Parameters Structure

```typescript
// Simplified representation of node parameters
const nodeParameters = [
  // Input Data Section
  {
    name: 'inputData',
    displayName: 'Input Data',
    type: 'fixedCollection',
    default: {},
    options: [
      {
        name: 'priceListSource',
        displayName: 'Price List Data',
        values: [
          {
            name: 'fieldName',
            type: 'string',
            default: 'priceList',
            description: 'The name of the field containing price list data'
          }
        ]
      },
      {
        name: 'usageSource',
        displayName: 'Usage Data',
        values: [
          {
            name: 'fieldName',
            type: 'string',
            default: 'usageData',
            description: 'The name of the field containing usage data'
          }
        ]
      }
    ]
  },

  // Match Configuration Section
  {
    name: 'matchConfig',
    displayName: 'Match Configuration',
    type: 'fixedCollection',
    default: {},
    options: [
      {
        name: 'matchFields',
        displayName: 'Match Fields',
        values: [
          {
            name: 'priceListField',
            type: 'string',
            default: 'productId',
            description: 'Field in price list to match on'
          },
          {
            name: 'usageField',
            type: 'string',
            default: 'productId',
            description: 'Field in usage data to match on'
          },
          {
            name: 'noMatchBehavior',
            type: 'options',
            options: [
              { name: 'Skip Record', value: 'skip' },
              { name: 'Error', value: 'error' }
            ],
            default: 'skip',
            description: 'What to do when no match is found'
          }
        ]
      }
    ]
  },

  // Calculation Configuration
  {
    name: 'calculationConfig',
    displayName: 'Calculation Configuration',
    type: 'fixedCollection',
    default: {},
    options: [
      {
        name: 'calculationMethod',
        displayName: 'Calculation Method',
        values: [
          {
            name: 'method',
            type: 'options',
            options: [
              { name: 'Basic (quantity * price)', value: 'basic' },
              { name: 'Simple Tiered', value: 'tiered' }
            ],
            default: 'basic',
            description: 'Method to calculate billing amount'
          },
          {
            name: 'quantityField',
            type: 'string',
            default: 'usage',
            description: 'Field containing quantity/usage amount'
          },
          {
            name: 'priceField',
            type: 'string',
            default: 'unitPrice',
            description: 'Field containing unit price'
          }
        ]
      }
    ]
  },

  // Output Field Configuration
  {
    name: 'outputConfig',
    displayName: 'Output Configuration',
    type: 'fixedCollection',
    default: {},
    options: [
      {
        name: 'outputFields',
        displayName: 'Output Fields',
        values: [
          {
            name: 'fields',
            type: 'string',
            typeOptions: {
              multipleValues: true
            },
            default: ['productId', 'usage', 'unitPrice', 'totalCost', 'customerId'],
            description: 'Fields to include in output'
          },
          {
            name: 'totalField',
            type: 'string',
            default: 'totalCost',
            description: 'Field to store calculation result'
          }
        ]
      }
    ]
  }
]
```

### Match Algorithm

```typescript
// Core matching logic (pseudocode)
function findMatches(priceList, usageRecords, matchConfig) {
  // Index price list for efficient lookup
  const priceIndex = indexPriceList(priceList, matchConfig);

  // Process each usage record
  return usageRecords.map(usage => {
    // Build match key from usage record
    const matchKey = buildMatchKey(usage, matchConfig);

    // Look up matching price
    const matchedPrice = priceIndex.get(matchKey);

    if (!matchedPrice) {
      // Handle no-match case based on configuration
      return handleNoMatch(usage, matchConfig);
    }

    // Calculate billing based on match
    return calculateBilling(usage, matchedPrice, matchConfig);
  });
}
```

## Implementation Strategy

1. **Phase 1: Core Functionality (v1)**
   - Basic node with "Process Billing" operation
   - Simple field mapping for input/output
   - Single-key matching engine
   - Basic validation and error handling

2. **Phase 2: Enhancements (Future)**
   - Example-based schema generation
   - Multi-key matching
   - Advanced calculation methods
   - Resource mapper integration
   - Enhanced validation and debugging tools
   - Performance optimization for large datasets

## Best Practices & Considerations

1. **Performance**
   - Index price list data for efficient lookups
   - Simple error handling with clear messages
   - Focus on reliability over advanced features

2. **Extensibility**
   - Design core structures to be easily extended in future versions
   - Maintain clear separation between matching, calculation, and output generation
   - Document extension points for future development
