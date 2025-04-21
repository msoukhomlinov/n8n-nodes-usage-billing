# Changelog

All notable changes to the n8n-nodes-usage-billing node will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-04-21

### Initial Release

#### Core Operations
- **Import Pricing Data**: Convert CSV pricing data to structured JSON
  - Automatic delimiter detection (comma, semicolon, tab, pipe)
  - Column filtering with include/exclude options
  - Support for various CSV formats and structures

- **Match Usage and Calculate**: Match usage data against price list records and calculate costs
  - Multiple match field support for complex matching requirements
  - Output separation for valid and invalid/unmatched records
  - Comprehensive validation and error handling
  - Calculation with configurable rounding options (up, down, none)

- **Usage Summary**: Generate summaries of usage and costs
  - Flexible field totaling with comma-separated field lists
  - Grouping by multiple field options
  - Option to include source records in summary output

#### Key Features
- **Customer-Specific Pricing**
  - Support for price list entries specific to individual customers
  - Customer ID matching between price list and usage data
  - Fallback to general pricing when no customer-specific entry exists
  - Output indicators for customer-specific pricing application

- **Output Field Customization**
  - Control over which fields appear in output records
  - Configurable field prefixes for price list, usage, and calculation fields
  - Custom naming for calculated amount fields
  - Field inclusion options from both price list and usage data

- **Advanced Configuration Options**
  - Decimal precision control for calculations
  - Multiple output strategies for handling unmatched records
  - Comprehensive error messages with specific error codes
  - Optimized performance for large datasets

#### Other Improvements
- Dual outputs to separate valid records from problematic ones
- Comprehensive error handling with detailed messages
- Optimization for processing large datasets
- Detailed documentation and usage examples
