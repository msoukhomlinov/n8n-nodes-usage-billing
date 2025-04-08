import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { MatchConfig, PriceListItem, UsageRecord, ValidationOptions } from '../interfaces';
import { inferSchemaFromExample, validateAll } from '../utils';
import { createSchemaVisualization } from '../config/SchemaVisualization';

/**
 * Validates configuration without processing actual billing
 */
export async function validateConfiguration(
  this: IExecuteFunctions,
  priceListExample: IDataObject,
  usageExample: IDataObject,
  outputExample: IDataObject,
  matchConfig: MatchConfig,
  options?: ValidationOptions,
): Promise<INodeExecutionData[]> {
  // Ensure matchConfig has all required properties for multi-key matching
  if (matchConfig.multiKeyMatch && (!matchConfig.priceListFields || !matchConfig.usageFields)) {
    matchConfig.priceListFields = matchConfig.priceListFields || [matchConfig.priceListField];
    matchConfig.usageFields = matchConfig.usageFields || [matchConfig.usageField];
  }

  // Infer schemas from examples
  const priceListSchema = inferSchemaFromExample(priceListExample);
  const usageSchema = inferSchemaFromExample(usageExample);
  const outputSchema = inferSchemaFromExample(outputExample);

  // Create mock data for validation
  const mockPriceList = [priceListExample] as PriceListItem[];
  const mockUsageRecords = [usageExample] as UsageRecord[];

  // Perform validation
  const validationResult = validateAll(
    priceListSchema,
    usageSchema,
    outputSchema,
    matchConfig,
    mockPriceList,
    mockUsageRecords,
  );

  // Create the output object
  const outputObject: IDataObject = {
    valid: validationResult.valid,
    errors: validationResult.errors,
    priceListSchema,
    usageSchema,
    outputSchema,
    multiKeyMatch: matchConfig.multiKeyMatch,
  };

  // Add schema visualization if requested
  if (options?.includeVisualization) {
    const schemaVisualization = createSchemaVisualization.call(
      this,
      priceListSchema,
      usageSchema,
      outputSchema,
      matchConfig,
    );
    outputObject.schemaVisualization = schemaVisualization;
  }

  // Format the validation result as node output
  return [{ json: outputObject }];
}
