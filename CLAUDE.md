# n8n-nodes-usage-billing

## Project Overview
n8n community node for usage-based billing. Takes usage data + pricelists as input, performs matching and calculation, outputs billing records with dual outputs (valid/invalid).

## Tech Stack
- TypeScript, n8n-workflow SDK
- decimal.js for financial precision
- lodash for data utilities

## Build & Test
```bash
npm run build    # clean + tsc + gulp icons
npm run dev      # watch mode
```
No test suite configured yet.

## Architecture
```
src/nodes/UsageBilling/
├── UsageBilling.node.ts          # Entry point, param extraction
├── config/nodeDescription.ts     # UI definition (all n8n params)
├── interfaces/types.ts           # All interfaces
├── processing/
│   ├── PricelistLookupProcessor.ts  # Core matching + calculation
│   └── UsageSummaryProcessor.ts     # Usage summary aggregation
└── utils/
    ├── calculations.ts           # Decimal-safe math (multiply, subtract, divide, etc.)
    ├── common.ts                 # Field helpers, data normalisation
    ├── errorHandling.ts          # Standardised error codes + factory
    ├── LoggerHelper.ts           # Logger wrapper
    └── validation.ts             # Input validation
```

## Key Patterns
- **calcPrefix pattern**: All calculated output fields use `${calcPrefix}fieldName` (default `calc_`).
- **Case-insensitive matching**: All field lookups use `getPropertyCaseInsensitive()`.
- **Hash-based matching**: Pricelist is pre-indexed into `Map<string, PriceListItem[]>` for O(1) lookups with linear-scan fallback.
- **Dual output**: Output 0 = valid matched records, Output 1 = unmatched/error records.
- **Financial precision**: All money math uses decimal.js via `calculations.ts` helpers.

## Processing Pipeline Order
Min sell enforcement → quantity × price → FX conversion → rounding → margin calc → output assembly → pass-through fields → alphabetical sort.

## Conventions
- Node params extracted in `UsageBilling.node.ts`, passed as config objects to processors.
- UI definitions live in `nodeDescription.ts`, never in the processor.
- Unused calculation functions (`calculateTieredBilling`, `calculateGraduatedBilling`) exist for future use.
