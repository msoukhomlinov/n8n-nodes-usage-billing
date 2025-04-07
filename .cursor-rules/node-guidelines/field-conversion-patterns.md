# Field Conversion Patterns in Autotask Integration

This document describes the field conversion patterns used in the Autotask integration for n8n.

## Overview

The field conversion system handles:
- Type conversion between n8n and Autotask
- Date/time format standardization
- Reference field resolution
- Picklist value mapping
- User-defined field (UDF) conversion

## Type Conversion

### Basic Type Mapping

```typescript
interface ITypeConversionContext {
  direction: 'read' | 'write';
  operation: OperationType;
  entityType: string;
}

function convertFieldValue(
  field: IEntityField,
  value: unknown,
  context: ITypeConversionContext
): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return field.isRequired ? '' : null;
  }

  switch (field.dataType) {
    case 'string':
      return String(value);
    case 'integer':
    case 'long':
      return parseInt(String(value), 10);
    case 'double':
    case 'decimal':
      return parseFloat(String(value));
    case 'boolean':
      return Boolean(value);
    case 'dateTime':
    case 'date':
      return convertDateTime(value, field.dataType);
    default:
      return String(value);
  }
}
```

## Date/Time Handling

### Date Conversion

```typescript
function convertDateTime(
  value: unknown,
  type: 'date' | 'dateTime'
): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    
    if (type === 'date') {
      // Format as YYYY-MM-DD
      return date.toISOString().split('T')[0];
    }
    
    // Format as ISO string
    return date.toISOString();
  }
  
  if (value instanceof Date) {
    return type === 'date'
      ? value.toISOString().split('T')[0]
      : value.toISOString();
  }
  
  throw new Error(`Invalid date value: ${value}`);
}
```

### Timezone Handling

```typescript
function handleTimezone(
  date: Date,
  timezone: string
): Date {
  // Convert to target timezone
  const targetDate = new Date(
    date.toLocaleString('en-US', { timeZone: timezone })
  );
  
  // Adjust for timezone offset
  const offset = targetDate.getTimezoneOffset();
  return new Date(targetDate.getTime() - offset * 60 * 1000);
}
```

## Reference Field Processing

### Reference Resolution

```typescript
async function resolveReference(
  field: IEntityField,
  value: unknown,
  context: ITypeConversionContext
): Promise<unknown> {
  if (!field.isReference || !field.referenceEntityType) {
    return value;
  }

  // Handle ID references
  if (typeof value === 'number') {
    return value;
  }

  // Resolve reference by name
  if (typeof value === 'string') {
    const entity = await findReferenceByName(
      field.referenceEntityType,
      value
    );
    return entity?.id;
  }

  throw new Error(
    `Invalid reference value for ${field.name}: ${value}`
  );
}
```

### Reference Loading

```typescript
async function loadReferenceValues(
  field: IEntityField
): Promise<INodePropertyOptions[]> {
  if (!field.isReference || !field.referenceEntityType) {
    return [];
  }

  const entities = await queryReferenceEntities(
    field.referenceEntityType
  );

  return entities.map(entity => ({
    name: entity.name,
    value: entity.id,
    description: entity.description
  }));
}
```

## Picklist Value Mapping

### Value Conversion

```typescript
function convertPicklistValue(
  field: IEntityField,
  value: unknown
): unknown {
  if (!field.isPickList || !field.picklistValues) {
    return value;
  }

  // Handle numeric values
  if (typeof value === 'number') {
    const picklistValue = field.picklistValues.find(
      pv => pv.value === value
    );
    return picklistValue?.value ?? value;
  }

  // Handle label values
  if (typeof value === 'string') {
    const picklistValue = field.picklistValues.find(
      pv => pv.label.toLowerCase() === value.toLowerCase()
    );
    return picklistValue?.value ?? value;
  }

  return value;
}
```

### Dependent Picklists

```typescript
async function loadDependentPicklistValues(
  field: IEntityField,
  parentValue: unknown
): Promise<INodePropertyOptions[]> {
  if (
    !field.isPickList ||
    !field.picklistValues ||
    !field.picklistParentValueField
  ) {
    return [];
  }

  const filteredValues = field.picklistValues.filter(
    pv => pv.parentValue === parentValue
  );

  return filteredValues.map(value => ({
    name: value.label,
    value: value.value,
    description: value.description
  }));
}
```

## UDF Value Conversion

### UDF Type Handling

```typescript
function convertUdfValue(
  field: IEntityField & { isUdf: true },
  value: unknown
): unknown {
  if (!field.isUdf) {
    return value;
  }

  switch (field.udfType) {
    case 1: // Text
      return String(value);
    case 2: // Number
      return convertNumericUdf(value, field);
    case 3: // Datetime
      return convertDateTime(value, 'dateTime');
    case 4: // Picklist
      return convertPicklistValue(field, value);
    default:
      return value;
  }
}
```

### Numeric UDF Processing

```typescript
function convertNumericUdf(
  value: unknown,
  field: IEntityField & {
    isUdf: true;
    numberOfDecimalPlaces?: number;
  }
): number {
  const num = parseFloat(String(value));
  
  if (isNaN(num)) {
    throw new Error(`Invalid numeric value for ${field.name}: ${value}`);
  }
  
  if (field.numberOfDecimalPlaces !== undefined) {
    return Number(num.toFixed(field.numberOfDecimalPlaces));
  }
  
  return num;
}
```

## Implementation Examples

### Basic Field Conversion

```typescript
class CompanyOperation extends BaseOperation {
  async processFieldValues(
    values: IDataObject
  ): Promise<IDataObject> {
    const fields = await this.getEntityFields();
    const processed: IDataObject = {};
    
    for (const [key, value] of Object.entries(values)) {
      const field = fields.find(f => f.name === key);
      if (!field) continue;
      
      processed[key] = await this.convertField(field, value);
    }
    
    return processed;
  }

  private async convertField(
    field: IEntityField,
    value: unknown
  ): Promise<unknown> {
    // Handle references
    if (field.isReference) {
      return await this.resolveReference(field, value);
    }
    
    // Handle picklists
    if (field.isPickList) {
      return this.convertPicklistValue(field, value);
    }
    
    // Handle UDFs
    if (field.isUdf) {
      return this.convertUdfValue(field, value);
    }
    
    // Handle basic types
    return this.convertFieldValue(field, value);
  }
}
```

### Complex Field Conversion

```typescript
class TaskOperation extends BaseOperation {
  async processFieldsWithRelations(
    values: IDataObject
  ): Promise<IDataObject> {
    const fields = await this.getEntityFields();
    const processed: IDataObject = {};
    
    for (const [key, value] of Object.entries(values)) {
      const field = fields.find(f => f.name === key);
      if (!field) continue;
      
      // Handle dependent picklists
      if (
        field.isPickList &&
        field.picklistParentValueField &&
        values[field.picklistParentValueField]
      ) {
        processed[key] = await this.convertDependentPicklist(
          field,
          value,
          values[field.picklistParentValueField]
        );
        continue;
      }
      
      // Handle standard conversion
      processed[key] = await this.convertField(field, value);
    }
    
    return processed;
  }
}
```

## Best Practices

1. **Type Safety**
   - Use strict type checking
   - Handle all possible input types
   - Validate converted values

2. **Date/Time Handling**
   - Always use ISO format for storage
   - Handle timezone conversions explicitly
   - Validate date string formats

3. **Reference Fields**
   - Cache reference lookups
   - Handle both ID and name inputs
   - Validate reference existence

4. **Picklist Values**
   - Support both value and label inputs
   - Handle dependent picklists properly
   - Validate against allowed values

5. **UDF Conversion**
   - Handle all UDF types consistently
   - Respect decimal place settings
   - Support encrypted UDF fields

6. **Performance**
   - Cache field definitions
   - Batch reference resolutions
   - Optimize validation checks 
