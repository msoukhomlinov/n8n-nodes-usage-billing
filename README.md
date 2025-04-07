# n8n-nodes-billing-calculator

This is a node for [n8n](https://n8n.io/) that provides billing calculation functionality. It takes usage data and price lists as inputs, performs matching and calculation, and outputs formatted billing records.

## Features

- **Schema generation**: Create schemas from JSON examples
- **Flexible matching**: Match usage data to price list items
- **Validation**: Validate configuration before processing
- **Two operations**:
  - **Process Billing**: Generate billing records from price lists and usage data
  - **Validate Configuration**: Test configuration without processing actual billing

## Installation

Follow these steps to install this custom node:

```bash
# Navigate to your n8n installation folder
cd /path/to/n8n

# Install the node
npm install n8n-nodes-billing-calculator

# Restart n8n
```

## Usage

The node has two main operations:

### 1. Process Billing

The primary operation for generating billing records:

1. Provide price list and usage data examples
2. Configure matching fields between price list and usage data
3. Supply actual price list and usage data in the workflow
4. Get calculated billing records as output

### 2. Validate Configuration

Test your schema definition and matching rules:

1. Provide price list and usage data examples
2. Configure matching fields between price list and usage data
3. Run validation to check for potential issues
4. View validation report without processing actual billing

## Configuration

### Schema Definition

Define your data schemas by providing JSON examples:

- **Price List Item Example**: A sample price list item with fields like productId, unitPrice, etc.
- **Usage Data Example**: A sample usage record with fields like productId, usage, etc.
- **Desired Output Example**: How you want the output billing record to look

### Match Configuration

Configure how price list items are matched to usage records:

- **Price List Field**: Field in price list to match on (e.g., productId)
- **Usage Data Field**: Field in usage data to match on (e.g., productId)
- **Allow Multiple Matches**: Whether to allow multiple matching price items
- **When No Match Found**: Behavior when no match is found (Error, Skip, Process with Empty Price)

## License

MIT
