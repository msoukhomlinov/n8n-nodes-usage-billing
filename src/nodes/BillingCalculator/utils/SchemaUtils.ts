import type { Schema, SchemaField } from '../interfaces';
import type { IDataObject } from 'n8n-workflow';

/**
 * Infers schema from an example object
 */
export function inferSchemaFromExample(exampleObject: IDataObject): Schema {
  const schema: Schema = {
    fields: [],
  };

  // Process each property in the example object
  for (const [key, value] of Object.entries(exampleObject)) {
    // Determine the data type
    let type: SchemaField['type'] = 'string';

    if (typeof value === 'number') {
      type = 'number';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (value instanceof Date) {
      type = 'date';
    }

    // Add field to schema
    schema.fields.push({
      name: key,
      type,
      required: true, // Default to required, can be adjusted later
      description: '',
    });
  }

  return schema;
}

/**
 * Gets a field from a schema by name
 */
export function getSchemaField(schema: Schema, fieldName: string): SchemaField | undefined {
  return schema.fields.find((field) => field.name === fieldName);
}

/**
 * Checks if a value matches the schema field type
 */
export function validateFieldType(field: SchemaField, value: unknown): boolean {
  if (value === null || value === undefined) {
    return !field.required;
  }

  switch (field.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return (
        value instanceof Date || (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
      );
    default:
      return false;
  }
}

/**
 * Extracts a list of field names from a schema
 */
export function getFieldNames(schema: Schema): string[] {
  return schema.fields.map((field) => field.name);
}

/**
 * Validates an object against a schema
 */
export function validateObjectAgainstSchema(schema: Schema, object: IDataObject): string[] {
  const errors: string[] = [];

  // Check required fields
  for (const field of schema.fields) {
    if (field.required && (object[field.name] === undefined || object[field.name] === null)) {
      errors.push(`Required field '${field.name}' is missing.`);
      continue;
    }

    if (object[field.name] !== undefined && !validateFieldType(field, object[field.name])) {
      errors.push(`Field '${field.name}' has invalid type. Expected ${field.type}.`);
    }
  }

  return errors;
}
