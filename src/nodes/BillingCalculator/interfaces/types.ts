export interface PriceListItem {
  [key: string]: string | number | boolean | null | undefined;
}

export interface UsageRecord {
  [key: string]: string | number | boolean | null | undefined;
}

export interface BillingRecord {
  [key: string]: string | number | boolean | null | undefined;
}

export interface MatchResult {
  matched: boolean;
  multipleMatches: boolean;
  matchedItems: PriceListItem[];
  errorMessage?: string;
}

// Shared Hierarchy Types
export interface HierarchyLevel {
  identifierField: string;
  outputField?: string;
  priority?: number; // Optional priority for sorting levels
}

export interface SharedHierarchyConfig {
  name: string;
  description?: string;
  levels: HierarchyLevel[];
}

export interface HierarchyOutput {
  name: string;
  description?: string;
  hierarchyConfig: HierarchyLevel[];
}

// Load Price List Operation Interfaces
export interface CsvParsingConfig {
  csvSource: {
    fieldName: string;
    skipFirstRow: boolean;
    delimiter: string;
  };
}

export interface ColumnFilterConfig {
  mappings?: {
    columns: {
      column:
        | Array<{
            csvColumn: string;
            targetField: string;
            dataType: 'string' | 'number' | 'boolean';
          }>
        | {
            csvColumn: string;
            targetField: string;
            dataType: 'string' | 'number' | 'boolean';
          };
    };
  };
  includeOptions?: {
    includeAllColumns?: boolean;
    includeColumnsList?: string;
  };
}

export interface HierarchyConfig {
  levels: {
    levelDefinitions: {
      level:
        | Array<{
            identifierField: string;
            outputField?: string;
          }>
        | {
            identifierField: string;
            outputField?: string;
          };
    };
  };
  includeAllColumns?: boolean;
}

export interface LoadPriceListConfig {
  csvParsingConfig: CsvParsingConfig;
  columnFilterConfig: ColumnFilterConfig;
  hierarchyConfig: HierarchyConfig;
}

// Calculate Billing Operation Interfaces
export interface InputDataConfig {
  priceListFieldName: string;
  usageDataFieldName: string;
  hierarchyConfigFieldName?: string; // Added for shared hierarchy configuration
}

export interface MatchConfig {
  hierarchyLevels: {
    level: Array<{
      priceListField: string;
      usageField: string;
    }>;
  };
  noMatchBehavior?: 'skip' | 'error' | { behavior: 'skip' | 'error' };
  partialMatchBehavior?: 'bestMatch' | 'noMatch' | { behavior: 'bestMatch' | 'noMatch' };
  fieldMappings?: {
    mappings: Array<{
      sourceField: string; // Field in usage data
      targetField: string; // Name in output
    }>;
  };
  useWildcardMatching?: boolean; // Whether to allow wildcard matching
  wildcardValue?: string; // Value to use as wildcard (default: '*')
  hierarchicalFallback?: boolean; // Whether to allow falling back to parent level matches
}

export interface CalculationConfig {
  calculationMethod: {
    method: string;
    quantityField: string;
    priceField: string;
  };
}

export interface OutputConfig {
  outputFields: {
    fields: string[];
    totalField: string;
  };
}

// Field mapping for applying data from usage and price records to output
export interface FieldMapping {
  priceField: string;
  quantityField: string;
  outputFields?: Array<{
    sourceField: string;
    targetField: string;
    sourceObject?: 'usage' | 'price';
  }>;
}

export type OperationType = 'loadPriceList' | 'calculateBilling' | 'defineHierarchy';
