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
}

export interface MatchConfig {
  hierarchyLevels: {
    level: Array<{
      priceListField: string;
      usageField: string;
    }>;
  };
  noMatchBehavior: 'skip' | 'error';
  partialMatchBehavior: 'bestMatch' | 'noMatch';
  fieldMappings?: {
    mappings: Array<{
      sourceField: string; // Field in usage data
      targetField: string; // Name in output
    }>;
  };
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

export type OperationType = 'loadPriceList' | 'calculateBilling';
