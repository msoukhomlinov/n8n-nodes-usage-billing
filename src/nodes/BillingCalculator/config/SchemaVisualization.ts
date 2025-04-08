import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { MatchConfig, Schema } from '../interfaces/SchemaInterfaces';

/**
 * Creates a visualization of the schema relationships and processing flow
 */
export function createSchemaVisualization(
  this: IExecuteFunctions,
  priceListSchema: Schema,
  usageSchema: Schema,
  outputSchema: Schema,
  matchConfig: MatchConfig,
  includeData = false,
): INodeExecutionData[] {
  // Create a simple visualization of the schema relationships
  const visualization = {
    priceListSchema: {
      name: 'Price List Schema',
      fields: priceListSchema.fields.map((f) => f.name),
    },
    usageSchema: {
      name: 'Usage Data Schema',
      fields: usageSchema.fields.map((f) => f.name),
    },
    outputSchema: {
      name: 'Output Schema',
      fields: outputSchema.fields.map((f) => f.name),
    },
    matchConfig: {
      matchFields: [
        {
          priceListField: matchConfig.priceListField,
          usageField: matchConfig.usageField,
        },
      ],
      isMultiMatch: matchConfig.multiKeyMatch || false,
      defaultAction: matchConfig.defaultOnNoMatch || 'error',
    },
  };

  // Return visualization as a node output
  return [
    {
      json: {
        visualization,
        includesData: includeData,
      },
    },
  ];
}
