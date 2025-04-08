import Ajv from 'ajv';
import type { PriceListItem, UsageRecord } from '../interfaces';

// Initialize Ajv instance
const ajv = new Ajv({
  allErrors: true, // Return all errors, not just the first one
  coerceTypes: true, // Coerce data types when possible
  useDefaults: false, // Don't apply default values defined in the schema
  removeAdditional: false, // Don't remove additional properties
});

// JSON Schema for Price List Items (individual items in the price list)
export const priceListItemSchema = {
  type: 'object',
  properties: {
    // Common properties - these are just examples and should be customized
    productId: { type: 'string' },
    productName: { type: 'string' },
    category: { type: 'string' },
    unitPrice: { type: 'number', minimum: 0 },
    currency: { type: 'string' },
  },
  // We don't require specific properties as column mapping is customizable
  additionalProperties: true,
};

// JSON Schema for the entire Price List
export const priceListSchema = {
  type: 'array',
  items: priceListItemSchema,
  minItems: 1,
};

// JSON Schema for Usage Records
export const usageRecordSchema = {
  type: 'object',
  properties: {
    // Common properties - these are just examples and should be customized
    productId: { type: 'string' },
    customerId: { type: 'string' },
    usage: { type: 'number', minimum: 0 },
    period: { type: 'string' },
  },
  // We don't require specific properties as field mapping is customizable
  additionalProperties: true,
};

// JSON Schema for Usage Data array
export const usageDataSchema = {
  type: 'array',
  items: usageRecordSchema,
  minItems: 1,
};

// Compile schemas for reuse
const validatePriceList = ajv.compile(priceListSchema);
const validateUsageRecords = ajv.compile(usageDataSchema);

/**
 * Validate price list data against the schema
 */
export function validatePriceListData(data: PriceListItem[]): { valid: boolean; errors: string[] } {
  const isValid = validatePriceList(data);

  if (isValid) {
    return { valid: true, errors: [] };
  }

  // Format validation errors for better readability
  const errors = (validatePriceList.errors || []).map((error) => {
    const path = error.instancePath || 'data';
    return `${path}: ${error.message}`;
  });

  return { valid: false, errors };
}

/**
 * Validate usage data against the schema
 */
export function validateUsageRecordsData(data: UsageRecord[]): {
  valid: boolean;
  errors: string[];
} {
  const isValid = validateUsageRecords(data);

  if (isValid) {
    return { valid: true, errors: [] };
  }

  // Format validation errors for better readability
  const errors = (validateUsageRecords.errors || []).map((error) => {
    const path = error.instancePath || 'data';
    return `${path}: ${error.message}`;
  });

  return { valid: false, errors };
}

/**
 * Create a custom schema validator for a specific data structure
 */
export function createCustomValidator(
  schemaDefinition: object,
): (data: unknown) => { valid: boolean; errors: string[] } {
  const validate = ajv.compile(schemaDefinition);

  return (data: unknown) => {
    const isValid = validate(data);

    if (isValid) {
      return { valid: true, errors: [] };
    }

    // Format validation errors for better readability
    const errors = (validate.errors || []).map((error) => {
      const path = error.instancePath || 'data';
      return `${path}: ${error.message}`;
    });

    return { valid: false, errors };
  };
}
