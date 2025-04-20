/**
 * Interfaces for the refactored UsageBilling node
 * Simplified with flat data structures (no hierarchy)
 */

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
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * CSV parsing configuration
 */
export interface CsvParsingConfig {
  csvSource: {
    fieldName: string;
    delimiter: string;
  };
}

/**
 * Column filtering configuration
 */
export interface ColumnFilterConfig {
  includeAllColumns: boolean;
  includeColumnsList?: string;
}

/**
 * Column mapping interface for CSV processing
 */
export interface ColumnMapping {
  csvColumn: string;
  targetField: string;
  dataType: 'string' | 'number' | 'boolean';
}

/**
 * Field mapping pair for matching
 */
export interface MatchFieldPair {
  priceListField: string;
  usageField: string;
}

/**
 * Configuration for calculation
 */
export interface CalculationConfig {
  quantityField: string;
  priceField: string;
  roundingDirection?: 'up' | 'down' | 'none';
  decimalPlaces?: number;
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
  // New fields for automatic inclusion
  includeMatchPricelistFields?: boolean;
  includeMatchUsageFields?: boolean;
  includeCalculationFields?: boolean;
  // Field prefix settings
  pricelistFieldPrefix?: string;
  usageFieldPrefix?: string;
  calculationFieldPrefix?: string;
  // Calculated amount field name
  calculatedAmountField?: string;
}

/**
 * The operations supported by the node
 */
export type OperationType = 'importPricingData' | 'matchUsageAndCalculate';
