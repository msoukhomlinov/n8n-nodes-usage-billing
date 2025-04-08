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
  mappings: {
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
}

export interface LoadPriceListConfig {
  csvParsingConfig: CsvParsingConfig;
  columnFilterConfig: ColumnFilterConfig;
  hierarchyConfig: HierarchyConfig;
}

// Calculate Billing Operation Interfaces
export interface InputDataConfig {
  priceListSource: { fieldName: string };
  usageSource: { fieldName: string };
}

export interface MatchConfig {
  matchFields: {
    priceListField: string;
    usageField: string;
    noMatchBehavior: string;
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
