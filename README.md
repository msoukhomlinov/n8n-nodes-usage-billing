# n8n-nodes-usage-billing
This n8n community node provides usage-based billing calculation functionality. It takes usage data and price lists as inputs, performs matching and calculation, and outputs formatted billing records.

![n8n-nodes-usage-billing](https://img.shields.io/badge/n8n--nodes--usage--billing-latest-blue)
![License](https://img.shields.io/badge/license-MIT-green)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow.svg)](https://buymeacoffee.com/msoukhomlinov)

> **IMPORTANT**: When updating between versions, make sure to restart your n8n instance after the update. UI changes and new features are only picked up after a restart.

This n8n community node provides usage-based billing calculation functionality. It takes usage data and price lists as inputs, performs matching and calculation, and outputs formatted billing records.

[Installation](#installation)
[Features](#features)
[Operations](#operations)
[Configuration Options](#configuration-options)
[Contributing](#contributing)
[Support](#support)
[License](#license)

## Features

- **Flexible Usage Matching**: Match usage data to price list items using multiple fields
- **Customer-Specific Pricing**: Support for customer-specific pricing rules
- **Calculation Options**: Configure rounding and decimal precision
- **Output Customization**: Control which fields appear in the output with automatic or manual field inclusion
- **Usage Summarization**: Generate summaries by grouping and totaling fields

## Operations

The node provides two main operations:

### Match Usage and Calculate

Match usage data with pricing records and calculate costs:

1. Provide price list and usage data in specified fields (supports expressions that return arrays or objects)
2. Configure match fields (productId, region, etc.)
3. Configure calculation options (quantity field, price fields, rounding)
4. Configure customer-specific pricing (if needed)
5. Configure output field options:
   - **Automatic mode**: Automatically include all fields from both pricelist and usage data with configurable prefixes (default: `price_` and `usage_`)
   - **Manual mode**: Manually specify which fields to include with custom source and target field names
6. Get calculated billing records as output, with unmatched records in a separate output

### Usage Summary

Generate summaries of usage and costs:

1. Provide calculated billing records as input
2. Specify fields to total (cost, price, etc.)
3. Specify fields to group by (date, customer, product, etc.)
4. Get summarized totals as output

## Configuration Options

### Match Usage and Calculate Configuration

- **Price List Field**: Field or expression containing price list data (supports arrays, objects, JSON strings, or field paths)
- **Usage Data Field**: Field or expression containing usage data (supports arrays, objects, JSON strings, or field paths)
- **Match Fields**: Field pairs to match between price list and usage data (at least one pair required)
- **Calculation Configuration**: Fields and options for calculation (quantity, cost price, sell price, rounding)
- **Customer-Specific Pricing**: Options for customer-specific price entries with customer ID matching
- **Output Field Configuration**: Automatic inclusion settings for match fields, calculation fields, and field prefixes
- **Output Fields**: Control which additional fields to include in output:
  - **Automatic Mode**: Automatically includes all fields from both pricelist and usage data with required prefixes
  - **Manual Mode**: Manually specify individual fields with source and target field names

### Usage Summary Configuration

- **Fields to Total**: Comma-separated list of fields to sum
- **Group By Fields**: Fields to group by when generating summaries
- **Include Source Data**: Option to include source records in summary

## Contributing

Contributions are welcome! If you'd like to contribute to this project:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you find this node helpful and would like to support its development:

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/msoukhomlinov)

## License

[MIT](LICENSE)
