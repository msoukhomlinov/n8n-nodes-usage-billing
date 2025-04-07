import type { INodeProperties } from 'n8n-workflow';
import type {
  Schema,
  MatchConfig,
  ResourceMapperMatchConfig,
  FieldMapping,
} from '../interfaces/SchemaInterfaces';

/**
 * Converts a schema to resource mapper options
 */
export function schemaToResourceMapperOptions(schema: Schema, prefix = ''): Record<string, string> {
  const options = {} as Record<string, string>;

  // Convert each field in the schema to a resource mapper option
  for (const field of schema.fields) {
    const key = prefix ? `${prefix}.${field.name}` : field.name;
    options[key] = field.description || field.name;
  }

  return options;
}

/**
 * Creates the resource mapper properties for match configuration
 */
export function createMatchResourceMapper(
  priceListSchema: Schema,
  usageSchema: Schema,
): INodeProperties {
  return {
    displayName: 'Match Configuration',
    name: 'matchResourceMapper',
    type: 'fixedCollection' as const, // Using fixedCollection with custom UI
    default: {
      mappingMode: 'defineBelow',
      value: [],
    },
    required: true,
    typeOptions: {
      resourceMapper: {
        resourceMapperMethod: 'matchFields',
        mode: 'mappedValues',
        fieldWords: {
          singular: 'field',
          plural: 'fields',
        },
        leftSide: {
          displayName: 'Price List Field',
          options: schemaToResourceMapperOptions(priceListSchema, 'priceList'),
        },
        rightSide: {
          displayName: 'Usage Data Field',
          options: schemaToResourceMapperOptions(usageSchema, 'usage'),
        },
        multiSelect: true, // Enable multi-select for multi-key matching
      },
    },
    description: 'Map fields between price list and usage data for matching',
  };
}

/**
 * Converts resource mapper value to match config
 */
export function resourceMapperToMatchConfig(
  resourceMapperValue: { [key: string]: { value: string } },
  useMultiKeyMatch = false,
  defaultOnNoMatch = 'error',
): MatchConfig {
  const mappings = Object.entries(resourceMapperValue);

  if (mappings.length === 0) {
    throw new Error('No field mappings defined for matching');
  }

  if (useMultiKeyMatch && mappings.length > 0) {
    // Extract all mappings for multi-key match
    const priceListFields: string[] = [];
    const usageFields: string[] = [];

    for (const [priceListFieldFull, usageFieldObj] of mappings) {
      const priceListField = priceListFieldFull.replace('priceList.', '');
      const usageField = usageFieldObj.value.replace('usage.', '');

      priceListFields.push(priceListField);
      usageFields.push(usageField);
    }

    return {
      priceListField: priceListFields[0], // Primary field for backward compatibility
      usageField: usageFields[0], // Primary field for backward compatibility
      priceListFields,
      usageFields,
      allowMultipleMatches: false,
      defaultOnNoMatch,
      multiKeyMatch: true,
    };
  }

  // Extract the first mapping for single field match (legacy support)
  const [priceListFieldFull, usageFieldObj] = mappings[0];
  const priceListField = priceListFieldFull.replace('priceList.', '');
  const usageField = usageFieldObj.value.replace('usage.', '');

  return {
    priceListField,
    usageField,
    priceListFields: [priceListField],
    usageFields: [usageField],
    allowMultipleMatches: false,
    defaultOnNoMatch,
    multiKeyMatch: false,
  };
}

/**
 * Transforms resource mapper values to ResourceMapperMatchConfig format
 */
export function transformToResourceMapperMatchConfig(
  resourceMapperValue: { [key: string]: { value: string } },
  useMultiKeyMatch = false,
  defaultOnNoMatch: 'error' | 'skip' | 'empty' = 'error',
): ResourceMapperMatchConfig {
  const mappings: FieldMapping[] = [];

  // Extract all mappings
  for (const [priceListFieldFull, usageFieldObj] of Object.entries(resourceMapperValue)) {
    const priceListField = priceListFieldFull.replace('priceList.', '');
    const usageField = usageFieldObj.value.replace('usage.', '');

    mappings.push({
      sourceField: priceListField,
      targetField: usageField,
      sourceType: 'priceList',
      targetType: 'usage',
    });
  }

  return {
    mappings,
    multiKeyMatch: useMultiKeyMatch && mappings.length > 1,
    defaultOnNoMatch,
  };
}

/**
 * Creates the resource mapper properties for output configuration
 */
export function createOutputResourceMapper(
  priceListSchema: Schema,
  usageSchema: Schema,
  outputSchema: Schema,
): INodeProperties {
  // Create options for all available source fields
  const sourceOptions: Record<string, string> = {
    ...schemaToResourceMapperOptions(priceListSchema, 'priceList'),
    ...schemaToResourceMapperOptions(usageSchema, 'usage'),
  };

  // Add calculated fields options
  sourceOptions['calculated.totalCost'] = 'Total Cost (usage * unitPrice)';

  return {
    displayName: 'Output Field Mapping',
    name: 'outputResourceMapper',
    type: 'fixedCollection' as const, // Using fixedCollection with custom UI
    default: {
      mappingMode: 'defineBelow',
      value: {},
    },
    required: true,
    typeOptions: {
      resourceMapper: {
        resourceMapperMethod: 'outputFields',
        mode: 'mappedValues',
        fieldWords: {
          singular: 'field',
          plural: 'fields',
        },
        leftSide: {
          displayName: 'Output Field',
          options: schemaToResourceMapperOptions(outputSchema),
        },
        rightSide: {
          displayName: 'Source Field',
          options: sourceOptions,
        },
      },
    },
    description: 'Map fields to generate the output records',
  };
}
