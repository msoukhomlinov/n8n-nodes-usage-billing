import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type { UsageSummaryConfig, UsageSummaryRecord } from '../interfaces';
import { createStandardizedError, ErrorCode, ErrorCategory } from '../utils/errorHandling';
import { normaliseDataInput } from '../utils/common';
import { logger } from '../utils/LoggerHelper';
import Decimal from 'decimal.js';

/**
 * Generate a summary of all usage and cost calculations
 * This can be used to track total consumption and costs across workflow runs
 */
export async function generateUsageSummary(
  this: IExecuteFunctions,
  _items: INodeExecutionData[],
  config: UsageSummaryConfig,
  usageDataInput: unknown,
): Promise<INodeExecutionData[][]> {
  const successOutput: INodeExecutionData[] = [];
  const errorOutput: INodeExecutionData[] = [];

  try {
    logger.info('Usage Summary: Starting summary generation process');

    const usageRecords = normaliseDataInput<IDataObject>(usageDataInput);
    logger.debug(`Usage Summary: Resolved ${usageRecords.length} usage records for processing`);
    logger.debug(
      `Usage Summary: Configuration - Fields to total: ${config.fieldsToTotal}, Group by: ${config.groupByFields ? config.groupByFields.join(', ') : 'None'}`,
    );

    // Basic input validation
    if (!usageRecords || usageRecords.length === 0) {
      logger.warn('Usage Summary: Usage data is empty or invalid');
      const error = createStandardizedError(
        ErrorCode.EMPTY_DATASET,
        'Usage data is empty or invalid for usage summary',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Ensure the Usage Data parameter resolves to an object or array',
            'Check the expression for Usage Data (e.g., {{ $(\'Match Usage and Calculate\').all() }})',
            'Provide valid JSON or a data expression that returns records to summarise',
          ],
        },
      );
      errorOutput.push({ json: { error } });
      return [[], errorOutput];
    }

    // Validate required fields
    if (!config.fieldsToTotal) {
      logger.warn('Usage Summary: Missing required fields to total');
      const error = createStandardizedError(
        ErrorCode.MISSING_REQUIRED_FIELD,
        'Fields to Total is required for usage summary',
        ErrorCategory.INPUT_ERROR,
        {
          context: { config },
          suggestions: ['Provide at least one field name to total in the summary configuration'],
        },
      );
      errorOutput.push({ json: { error } });
      return [[], errorOutput];
    }

    // Group records if groupByFields is specified
    if (config.groupByFields && config.groupByFields.length > 0) {
      logger.info(
        `Usage Summary: Generating grouped summaries using fields: ${config.groupByFields.join(', ')}`,
      );
      const groupedSummaries = generateGroupedSummaries(usageRecords, config);
      logger.info(`Usage Summary: Generated ${groupedSummaries.length} grouped summaries`);
      successOutput.push(...groupedSummaries);
    } else {
      // Generate a single summary for all records
      logger.info('Usage Summary: Generating a single summary for all records');
      const summary = generateSingleSummary(usageRecords, config);
      successOutput.push(summary);
    }

    logger.info('Usage Summary: Process completed successfully');
    return [successOutput, errorOutput];
  } catch (error) {
    logger.error(
      `Usage Summary: Error generating summary: ${(error as Error).message}`,
      error as Error,
    );
    const standardizedError = createStandardizedError(
      ErrorCode.PARSING_ERROR,
      'Error generating usage summary',
      ErrorCategory.PROCESSING_ERROR,
      {
        error: error as Error,
      },
    );
    errorOutput.push({ json: { error: standardizedError } });
    return [[], errorOutput];
  }
}

/**
 * Generate a single summary record for all items
 */
function generateSingleSummary(
  records: IDataObject[],
  config: UsageSummaryConfig,
): INodeExecutionData {
  try {
    logger.debug('Usage Summary: Generating single summary');
    const recordsProcessed = records.length;
    const sourceData: IDataObject[] = [];

    // Parse fields to total
    const fieldsToTotal = config.fieldsToTotal.split(',').map((field) => field.trim());
    logger.debug(`Usage Summary: Totaling fields: ${fieldsToTotal.join(', ')}`);

    // Initialize a Decimal for each field to total
    const totals: { [fieldName: string]: Decimal } = {};
    for (const field of fieldsToTotal) {
      totals[field] = new Decimal(0);
    }

    // Process each item
    for (const record of records) {
      // Store source data if requested
      if (config.includeSourceData) {
        sourceData.push(record);
      }

      // Process each field to total
      for (const field of fieldsToTotal) {
        const value = getNumberValue(record, field);
        if (value !== undefined) {
          totals[field] = totals[field].plus(value);
        }
      }
    }

    // Create summary record
    const summary: UsageSummaryRecord = {
      recordsProcessed,
      summaryDate: new Date().toISOString(),
    };

    // Add the total for each field
    for (const field of fieldsToTotal) {
      summary[`total_${field}`] = totals[field].toNumber();
    }

    // Add source data if requested
    if (config.includeSourceData && sourceData.length > 0) {
      summary.sourceData = sourceData;
    }

    logger.debug(
      `Usage Summary: Single summary generated with ${recordsProcessed} records processed`,
    );
    return { json: summary };
  } catch (error) {
    logger.error(
      `Usage Summary: Error generating single summary: ${(error as Error).message}`,
      error as Error,
    );
    throw error;
  }
}

/**
 * Generate grouped summaries based on specified fields
 */
function generateGroupedSummaries(
  records: IDataObject[],
  config: UsageSummaryConfig,
): INodeExecutionData[] {
  try {
    logger.debug(
      `Usage Summary: Generating grouped summaries on fields: ${config.groupByFields?.join(', ')}`,
    );
    const groupedSummaries: INodeExecutionData[] = [];

    if (!config.groupByFields || config.groupByFields.length === 0) {
      logger.warn('Usage Summary: No group by fields specified, returning empty result');
      return groupedSummaries;
    }

    // Group records based on groupByFields
    const groups: { [key: string]: IDataObject[] } = {};

    for (const record of records) {
      // Generate group key based on groupByFields
      const groupValues: string[] = [];
      for (const field of config.groupByFields) {
        groupValues.push(String(record[field] ?? 'undefined'));
      }

      const groupKey = groupValues.join('::');

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }

      groups[groupKey].push(record);
    }

    logger.debug(`Usage Summary: Found ${Object.keys(groups).length} distinct groups to summarize`);

    // Generate summary for each group
    for (const [groupKey, groupItems] of Object.entries(groups)) {
      const summary = generateSingleSummary(groupItems, config);

      // Add group key fields to the summary
      const keyParts = groupKey.split('::');
      if (config.groupByFields) {
        for (let i = 0; i < config.groupByFields.length; i++) {
          const field = config.groupByFields[i];
          if (i < keyParts.length) {
            summary.json[field] = keyParts[i] === 'undefined' ? undefined : keyParts[i];
          }
        }
      }

      groupedSummaries.push(summary);
    }

    logger.debug(`Usage Summary: ${groupedSummaries.length} grouped summaries generated`);
    return groupedSummaries;
  } catch (error) {
    logger.error(
      `Usage Summary: Error generating grouped summaries: ${(error as Error).message}`,
      error as Error,
    );
    throw error;
  }
}

/**
 * Safely extract a number value from a record
 */
function getNumberValue(record: IDataObject, fieldName: string): number | undefined {
  try {
    const value = record[fieldName];

    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'number') {
      return value;
    }

    // Try to convert string to number
    if (typeof value === 'string') {
      const numberValue = Number.parseFloat(value);
      if (!Number.isNaN(numberValue)) {
        return numberValue;
      }
    }

    // Value not a valid number
    logger.warn(`Usage Summary: Field '${fieldName}' contains non-numeric value: ${String(value)}`);
    return 0;
  } catch (error) {
    logger.error(
      `Usage Summary: Error extracting number value for field '${fieldName}': ${(error as Error).message}`,
      error as Error,
    );
    return 0;
  }
}
