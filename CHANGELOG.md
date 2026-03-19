# Changelog

All notable changes to the n8n-nodes-usage-billing node will be documented in this file.

## [0.5.3] - 2026-03-19

### Fixes
- **Rounding now applied to quantity field**: The `calc_<quantityField>` output was not rounded when rounding was enabled.

## [0.5.2] - 2026-03-19

### Fixes
- **Rounding now applied to margin fields**: `calc_margin`, `calc_margin_percent`, and `calc_markup_percent` were not rounded when rounding was enabled. All margin/markup output fields now respect the configured rounding direction and decimal places.

### Internal
- Extracted reusable `applyRounding()` helper in `PricelistLookupProcessor`, eliminating duplicated rounding logic.

## [0.5.1] - 2026-03-19

### Features
- **Margin/Profit Calculation**: New `Include Margin Fields` toggle in Calculation Settings. When enabled, outputs `calc_margin` (sell − cost), `calc_margin_percent` ((sell − cost) / sell × 100), and `calc_markup_percent` ((sell − cost) / cost × 100). Division-by-zero cases output `null`.
- **Pass-Through Fields**: New `Pass-Through Fields` option in Output Field Configuration. Comma-separated list of usage record field names copied verbatim (no prefix) to output — solves the problem of billing period dates and identifiers being stripped or prefixed.
- **Hash-Based Matching**: Pricelist is now pre-indexed into a hash map for O(1) lookups. No configuration needed — same results, significantly faster on large datasets.

## [0.5.0] - 2026-03-19

### Features
- **FX Conversion**: Convert calculated cost and sell amounts from source currency to a target currency using a configurable exchange rate. Adds `calc_fxRate` and `calc_currencyCode` to output records. Strict validation rejects invalid or missing rates when enabled.
- **Minimum Sell Price Enforcement**: When customer-specific pricing is active, prevents the customer sell price from falling below the standard pricelist sell price. Outputs `minSellEnforced`, `standardSellPrice`, and `originalCustomerSellPrice` when enforcement triggers.

### Processing Order
Min sell enforcement → quantity × price → FX conversion → rounding → output assembly.

### Fixes
- **Missing/invalid billing fields now error instead of silently producing $0**: Quantity, cost price, and sell price fields that are missing or non-numeric now throw descriptive errors instead of silently defaulting to zero.
- **Decimal places setting now applied**: The `decimalPlaces` UI parameter was not being extracted — rounding always used 1 decimal place regardless of user configuration.
- **Multiple-match errors now use correct error code**: Records matching multiple pricelist items now emit `MULTIPLE_MATCHES_FOUND` instead of incorrectly reporting `NO_MATCH_FOUND`.
- **Usage Summary no longer silently zeros non-numeric values**: `getNumberValue` now returns `undefined` for non-numeric fields instead of `0`, preventing silent pollution of totals.
- **JSON parse failures now logged**: Malformed JSON input to `normaliseDataInput` now logs a warning instead of silently returning an empty array.
- **Min sell enforcement no longer warns on generic matches**: The false warning that fired on every generic match when min sell was enabled has been eliminated by checking `isCustomerSpecificMatch`.
- Added missing MIT LICENSE file.

## [0.4.3] - 2025-12-14

### Fixes
- Fixed case sensitivity of the icon file

## [0.4.1] - 2025-12-14

### Fixes
- Output fields in Match Usage and Calculate operation are now sorted alphabetically, ensuring consistent field ordering regardless of when fields are added (match fields, calculation fields, or additional output fields).

## [0.4.0] - 2025-12-14

### Enhancements
- Added automatic field inclusion mode to Output Fields in Match Usage and Calculate operation. When enabled, all fields from both pricelist and usage data are automatically included with configurable prefixes (default: `price_` and `usage_`). Manual mode remains available for selective field inclusion.


## [0.3.3] - 2025-12-09

### Fixes
- Match Usage and Calculate now falls back to price-list field names when a mapped usage field is missing, ensuring customer-specific rows still match when usage data already uses price-list schema.


## [0.3.2] - 2025-12-09

### Fixes
- Match Usage and Calculate now correctly prefers customer-specific price rows when `Pricelist Contains Customer-Specific Pricing` is enabled, skipping customer-tagged rows during generic matching so the intended per-customer sell price is applied.


## [0.3.1] - 2025-12-09

### Fixes
- Output Fields parameters in Match Usage and Calculate now accept literal field names only (`Source Field` and `Target Field`), preventing expressions from being evaluated in output mappings.

## [0.3.0] - 2025-12-08

### Enhancements
- Price list and usage inputs can now be provided via n8n expressions that return arrays or objects, not just string paths on the first item.
- Normalised input handling for price list and usage data (arrays, objects, JSON strings, or field paths), reducing the need to merge data onto a specific item.
- Validation guidance now references expression-based inputs for clearer troubleshooting.
- Calculation Settings fields for quantity, cost price, and sell price now accept literal field names only (expressions are treated as plain text).
- Customer-specific pricing now requires customer ID fields when enabled to avoid incomplete configuration.

### Behaviour changes
- Usage Summary now requires an explicit `Usage Data` parameter; it no longer pulls data from the immediately previous node. An error is raised when the expression resolves to no data.
- Import Pricing Data operation removed; use standard n8n CSV/HTTP/File nodes for price list ingestion.
- Default operation is now Match Usage and Calculate.


## [0.2.1] - 2025-04-27

### Enhancements
- Added usableAsTool support


## [0.2.0] - 2025-04-21

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
