/**
 * Interfaces for the refactored UsageBilling node
 * Simplified with flat data structures (no hierarchy)
 */

import type { IDataObject } from 'n8n-workflow';

/**
 * Base interface for pricelist items
 */
export interface PriceListItem {
  // Common price list fields that may exist
  price?: number;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Base interface for usage records
 */
export interface UsageRecord {
  quantity?: number;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Result of price calculation
 */
export interface CalculatedRecord {
  calculated_amount?: number;
  // Customer-specific pricing fields
  isCustomPricing?: boolean;
  customerIdField?: string;
  customerId?: string | number;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Usage summary record for tracking total consumption and costs
 */
export interface UsageSummaryRecord {
  recordsProcessed: number;
  summaryDate: string;
  sourceData?: IDataObject[];
  [key: string]: string | number | boolean | null | undefined | IDataObject[];
}

/**
 * Configuration for usage summary
 */
export interface UsageSummaryConfig {
  fieldsToTotal: string;
  groupByFields?: string[];
  includeSourceData?: boolean;
}

/**
 * Column mapping interface for CSV processing
 */
export interface MatchFieldPair {
  priceListField: string;
  usageField: string;
}

/**
 * Configuration for price calculation
 */
export interface CalculationConfig {
  quantityField: string;
  costPriceField: string;
  sellPriceField: string;
  roundingDirection?: 'up' | 'down' | 'none';
  decimalPlaces?: number;
  customerPricingConfig?: CustomerPricingConfig;
}

/**
 * Configuration for output fields
 */
export interface OutputFieldConfig {
  includeFields: Array<{
    sourceField: string;
    targetField: string;
    source: 'pricelist' | 'usage';
  }>;
  // Automatic field inclusion mode
  automatic?: boolean;
  // New fields for automatic inclusion
  includeMatchPricelistFields?: boolean;
  includeMatchUsageFields?: boolean;
  includeCalculationFields?: boolean;
  // Field prefix settings
  pricelistFieldPrefix?: string;
  usageFieldPrefix?: string;
  calculationFieldPrefix?: string;
  // Calculated amount field names
  calculatedCostAmountField?: string;
  calculatedSellAmountField?: string;
}

/**
 * The operations supported by the node
 */
export type OperationType = 'matchUsageAndCalculate' | 'usageSummary';

/**
 * Configuration for customer-specific pricing
 */
export interface CustomerPricingConfig {
  useCustomerSpecificPricing: boolean;
  customerIdPriceListField: string;
  customerIdUsageField: string;
}
