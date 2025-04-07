# n8n-nodes-billing-calculator design

# Refactored Design: n8n-nodes-billing-calculator

## Core Functionality Overview

The n8n-nodes-billing-calculator node will serve as middleware that processes pricing and usage data to generate accurate billing records. This refactored design focuses on:

1. Schema generation from examples rather than manual building
2. Robust matching between usage data and price list items
3. Flexible output generation based on configurable schemas
4. Comprehensive validation at all stages

## Node Structure & Operations

The node will offer two distinct operations:

1. **Process Billing** (Primary Operation)
   - Takes usage data and price list as inputs
   - Performs matching and calculation
   - Outputs formatted billing records

2. **Validate Configuration**
   - Tests schema definitions and matching rules
   - Reports potential issues without processing actual billing
   - Helps users troubleshoot configurations before production use

## Schema Definition Interface

Instead of requiring manual schema building, the node will primarily rely on example-based schema generation:

### Example-Driven Schema Generation

- A simple interface where users paste sample JSON objects for:
  - Price list item example
  - Usage data example
  - Desired output record example

- The node automatically:
  - Infers field names and types from the examples
  - Creates appropriate schema definitions
  - Presents the inferred schema for review
  - Allows minor adjustments (marking fields as required, etc.)

- Users can optionally fine-tune generated schemas by:
  - Adjusting data types
  - Marking fields as required/optional
  - Adding descriptions to fields

### Schema Visualization

- Displays the generated schema in a readable format
- Highlights key fields that will be used for matching
- Shows relationships between input and output schemas

## Enhanced Field Mapping

The node will implement multiple approaches to field mapping:

### Resource Mapper Component

- Dedicated visual interface for mapping between schemas
- Shows source fields on one side, target fields on the other
- Supports drag-and-drop field mapping
- Auto-mapping option for fields with matching names

### Match Configuration

- Clear UI section for defining how usage data maps to price list items
- Support for single-key matching (e.g., ProductID to SKU)
- Advanced option for multi-key matching (e.g., ProductID + Region)
- Dropdown selection of fields (populated from inferred schemas)

### Calculation Configuration

- Visual formula builder for custom calculations
- Predefined calculation templates (basic multiplication, tiered pricing, etc.)
- Support for margin-based or fixed pricing models

## Validation Framework

The node implements comprehensive validation:

### Schema Validation

- Internal JSON Schema validation using Ajv
- Type checking for all fields (ensuring numbers are numeric, etc.)
- Required field validation
- Format validation for special fields (dates, emails, etc.)

### Match Validation

- Detection of missing match keys
- Warning for price list items without corresponding usage
- Error reporting for usage items without matching prices
- Option to specify default behavior for non-matches

### Output Validation

- Verification that all required output fields can be populated
- Type checking before output generation
- Validation of calculation results (e.g., no negative prices)

## User Experience Improvements

### Contextual Help

- Inline documentation for each section
- Tooltips explaining parameters and options
- Example configurations accessible within the node

### Debugging Assistance

- Detailed error messages identifying specific issues
- Preview mode showing intermediate matching results
- Debug output option for troubleshooting

## Technical Implementation Details

### Data Structures

```typescript
// Core interfaces for schema management
interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  description?: string;
}

interface Schema {
  fields: SchemaField[];
  primaryKey?: string[];
}

// Runtime data interfaces
interface PriceListItem {
  [key: string]: any;
}

interface UsageRecord {
  vendorProductFamily: string;
  usage: number;
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

### Schema Inference Logic

```typescript
// Schema inference from example (pseudocode)
function inferSchemaFromExample(exampleObject) {
  const schema = {
    fields: []
  };

  // Process each property in the example object
  for (const [key, value] of Object.entries(exampleObject)) {
    // Determine the data type
    let type = typeof value;

    // Convert JavaScript types to schema types
    if (type === 'number') {
      type = 'number';
    } else if (type === 'boolean') {
      type = 'boolean';
    } else if (value instanceof Date) {
      type = 'date';
    } else {
      type = 'string';
    }

    // Add field to schema
    schema.fields.push({
      name: key,
      type,
      required: true, // Default to required, can be adjusted later
      description: ''
    });
  }

  return schema;
}
```

### Node Parameters Structure

```typescript
// Simplified representation of node parameters
const nodeParameters = [
  // Operation selection
  {
    name: 'operation',
    type: 'options',
    options: [
      { name: 'Process Billing', value: 'processBilling' },
      { name: 'Validate Configuration', value: 'validateConfig' }
    ],
    default: 'processBilling',
    description: 'Operation to perform'
  },

  // Schema Inference Section
  {
    name: 'schemaInference',
    displayName: 'Schema Definition from Examples',
    type: 'fixedCollection',
    default: {},
    options: [
      {
        name: 'priceListExample',
        displayName: 'Price List Item Example',
        values: [
          {
            name: 'example',
            type: 'json',
            typeOptions: {
              alwaysOpenEditWindow: true
            },
            default: '{\n  "productId": "PROD001",\n  "unitPrice": 10.99,\n  "currency": "USD"\n}',
            description: 'Paste an example of a single price list item as JSON'
          }
        ]
      },
      {
        name: 'usageExample',
        displayName: 'Usage Data Example',
        values: [
          {
            name: 'example',
            type: 'json',
            typeOptions: {
              alwaysOpenEditWindow: true
            },
            default: '{\n  "productId": "PROD001",\n  "usage": 5,\n  "customerId": "CUST123"\n}',
            description: 'Paste an example of a single usage record as JSON'
          }
        ]
      },
      {
        name: 'outputExample',
        displayName: 'Desired Output Example',
        values: [
          {
            name: 'example',
            type: 'json',
            typeOptions: {
              alwaysOpenEditWindow: true
            },
            default: '{\n  "productId": "PROD001",\n  "usage": 5,\n  "unitPrice": 10.99,\n  "totalCost": 54.95,\n  "customerId": "CUST123"\n}',
            description: 'Paste an example of how you want the output to look'
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
      // Match fields definition
      // Multiple/no match handling
    ],
    // Display conditions based on operation
  },

  // Input Data Section
  {
    name: 'inputData',
    displayName: 'Input Data',
    type: 'fixedCollection',
    default: {},
    options: [
      // Price list data source
      // Usage data source
    ],
    // Display conditions based on operation
  },

  // Output Configuration
  {
    name: 'outputConfig',
    displayName: 'Output Configuration',
    type: 'resourceMapper',
    // Configuration for output mapping
    // Display conditions based on operation
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
      // Handle no-match case
      return handleNoMatch(usage, matchConfig);
    }

    if (Array.isArray(matchedPrice) && matchedPrice.length > 1) {
      // Handle multiple matches case
      return handleMultipleMatches(usage, matchedPrice, matchConfig);
    }

    // Calculate billing based on match
    return calculateBilling(usage, matchedPrice, matchConfig);
  });
}
```

## Implementation Strategy

1. **Phase 1: Core Framework**
   - Basic node structure with operations
   - Schema inference from examples
   - Simple matching engine
   - Basic validation

2. **Phase 2: Enhanced User Experience**
   - Resource Mapper integration
   - Improved schema visualization
   - Enhanced validation feedback

3. **Phase 3: Advanced Features**
   - Multi-key matching
   - Custom calculation formulas
   - Batch processing optimization
   - Debugging tools

## Best Practices & Considerations

1. **Performance Optimization**
   - Index price list data for O(1) lookups
   - Process records in batches for large datasets
   - Implement pagination for very large outputs

2. **Error Handling**
   - Provide clear, actionable error messages
   - Allow configurable error tolerance (fail fast vs. continue with warnings)
   - Include row/record references in error messages

3. **Extensibility**
   - Design schemas to be easily extended
   - Support for custom calculation logic
   - Allow for future pricing models
