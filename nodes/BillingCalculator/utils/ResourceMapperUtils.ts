import type { INodeProperties, NodeParameterValue } from 'n8n-workflow';
import type {
  Schema,
  SchemaField,
  MatchConfig,
  PriceListItem,
  UsageRecord,
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
      },
    },
    description: 'Map fields between price list and usage data for matching',
  };
}

/**
 * Converts resource mapper value to match config
 */
export function resourceMapperToMatchConfig(resourceMapperValue: {
  [key: string]: { value: string };
}): MatchConfig {
  const mappings = Object.entries(resourceMapperValue);

  // For Phase 2, we only support the first mapping as the match key
  if (mappings.length === 0) {
    throw new Error('No field mappings defined for matching');
  }

  // Extract the first mapping
  const [priceListFieldFull, usageFieldObj] = mappings[0];
  const priceListField = priceListFieldFull.replace('priceList.', '');
  const usageField = usageFieldObj.value.replace('usage.', '');

  return {
    priceListField,
    usageField,
    allowMultipleMatches: false,
    defaultOnNoMatch: 'error',
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
