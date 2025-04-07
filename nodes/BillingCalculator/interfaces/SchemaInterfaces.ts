import type { IDataObject } from 'n8n-workflow';

/**
 * Core interfaces for schema management
 */
export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  description?: string;
}

export interface Schema {
  fields: SchemaField[];
  primaryKey?: string[];
}

/**
 * Runtime data interfaces
 */
export interface PriceListItem extends IDataObject {
  [key: string]: string | number | boolean | object | null | undefined;
}

export interface UsageRecord extends IDataObject {
  usage: number;
  [key: string]: string | number | boolean | object | null | undefined;
}

export interface BillingRecord extends IDataObject {
  [key: string]: string | number | boolean | object | null | undefined;
}

export interface MatchResult {
  matched: boolean;
  multipleMatches: boolean;
  matchedItems: PriceListItem[];
  errorMessage?: string;
}

/**
 * Match configuration interfaces
 */
export interface MatchConfig {
  priceListField: string;
  usageField: string;
  allowMultipleMatches: boolean;
  defaultOnNoMatch?: string;
}

/**
 * Enhanced match configuration for resource mapper
 */
export interface ResourceMapperMatchConfig {
  mappings: FieldMapping[];
  multiKeyMatch: boolean;
  defaultOnNoMatch: 'error' | 'skip' | 'empty';
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  sourceType: 'priceList' | 'usage';
  targetType: 'priceList' | 'usage';
}

/**
 * Output configuration interfaces
 */
export interface OutputConfig {
  fields: OutputField[];
}

export interface OutputField {
  name: string;
  sourceField?: string;
  sourceType?: 'usage' | 'price' | 'calculated';
  formula?: string;
}

/**
 * Enhanced output configuration for resource mapper
 */
export interface ResourceMapperOutputConfig {
  mappings: OutputFieldMapping[];
  includeAllFields: boolean;
  transformations: Transformation[];
}

export interface OutputFieldMapping {
  outputField: string;
  sourceField: string;
  sourceType: 'usage' | 'price' | 'calculated';
}

export interface Transformation {
  targetField: string;
  type: 'formula' | 'concat' | 'format' | 'conditional';
  formula?: string;
  fields?: string[];
  format?: string;
  condition?: string;
  trueValue?: string | number;
  falseValue?: string | number;
}

/**
 * Enhanced schema visualization interface
 */
export interface SchemaVisualization {
  schema: Schema;
  highlightedFields: string[];
  relationships: SchemaRelationship[];
}

export interface SchemaRelationship {
  sourceSchema: 'price' | 'usage' | 'output';
  sourceField: string;
  targetSchema: 'price' | 'usage' | 'output';
  targetField: string;
  type: 'match' | 'output' | 'formula';
}

/**
 * Enhanced validation interfaces
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  schema?: 'price' | 'usage' | 'output';
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  schema?: 'price' | 'usage' | 'output';
  severity: 'warning' | 'info';
}
