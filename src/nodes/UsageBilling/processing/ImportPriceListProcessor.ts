import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type { PriceListItem, CsvParsingConfig, ColumnFilterConfig } from '../interfaces';
import {
  extractCsvData,
  parseAndTransformCsv,
  createColumnTransformers,
  applyColumnMappings,
} from '../utils/csvProcessing';
import { handleError, createValidationError } from '../utils/errorHandling';
import { validatePriceListData } from '../utils/validation';
import { logger } from '../utils/LoggerHelper';
import _ from 'lodash';

/**
 * Process a CSV string into a flat array of price list items
 */
export async function importPriceList(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  csvParsingConfig: CsvParsingConfig,
  columnFilterConfig: ColumnFilterConfig,
): Promise<INodeExecutionData[][]> {
  const validRecords: INodeExecutionData[] = [];
  const invalidRecords: INodeExecutionData[] = [];

  try {
    // Input parameters logging
    logger.info('CSV Import: Starting CSV import process');

    // 1. Extract CSV data from input
    const csvData = extractCsvData(items, csvParsingConfig.csvSource.fieldName, this);
    logger.info(`CSV Import: Data extracted, length: ${csvData.length}`);

    // 2. Setup parser options
    const parserOptions = {
      delimiter: csvParsingConfig.csvSource.delimiter || ',',
      skipFirstRow: true, // Always assume the first row is a header
    };

    // 3. Create empty column transformers for now (no type conversion)
    const transformers = createColumnTransformers([]);

    // 4. Parse CSV into JSON array
    logger.info('CSV Import: Parsing CSV into JSON array');
    const jsonArray = await parseAndTransformCsv(
      csvData,
      parserOptions.delimiter,
      parserOptions.skipFirstRow,
      transformers,
      this,
    );
    logger.info(`CSV Import: JSON array created, items: ${jsonArray.length}`);

    // 5. Apply column filtering using the more comprehensive applyColumnMappings function
    logger.info('CSV Import: Applying column filtering');

    // Convert comma-separated list to array if needed
    const includeColumnsList = columnFilterConfig.includeColumnsList
      ? columnFilterConfig.includeColumnsList
          .split(',')
          .map((col) => col.trim())
          .filter((col) => col !== '')
      : [];

    // Apply column filtering using applyColumnMappings with minimal parameters
    const processedArray = applyColumnMappings(
      jsonArray,
      [], // No column mappings for data type conversion
      [], // No hierarchy identifiers
      new Map(), // No field rename map
      columnFilterConfig.includeAllColumns,
      includeColumnsList,
    );

    logger.info(`CSV Import: Column filtering applied, items: ${processedArray.length}`);

    // 6. Validate the processed array and create output items
    logger.info('CSV Import: Validating records');

    // Use schema validation first for basic checks
    const schemaValidation = validatePriceListData(processedArray);

    if (!schemaValidation.valid) {
      // Schema validation failed
      logger.info(
        `CSV Import: Schema validation failed with ${schemaValidation.errors.length} issues`,
      );

      invalidRecords.push({
        json: {
          error: createValidationError([
            {
              record: { sample: processedArray.length > 0 ? processedArray[0] : {} },
              errors: schemaValidation.errors,
            },
          ]),
        },
      });

      return [[], invalidRecords];
    }

    // Also perform per-item validation for detailed error reporting
    const validItems: PriceListItem[] = [];
    const invalidItems: Array<{ record: PriceListItem; errors: string[] }> = [];

    // Perform additional item-specific validations
    for (const item of processedArray) {
      const errors: string[] = [];

      // Check for valid price if present
      if (item.price !== undefined) {
        if (typeof item.price !== 'number' || Number.isNaN(item.price) || item.price < 0) {
          errors.push(`Invalid price value: ${item.price}. Must be a non-negative number.`);
        }
      }

      // Add any additional validation rules here

      if (errors.length === 0) {
        validItems.push(item);
      } else {
        invalidItems.push({
          record: item,
          errors,
        });
      }
    }

    logger.info(
      `CSV Import: Item validation complete - Valid: ${validItems.length}, Invalid: ${invalidItems.length}`,
    );

    // 7. Create output for valid records
    if (validItems.length > 0) {
      validRecords.push({
        json: {
          priceList: validItems,
          recordCount: validItems.length,
        },
      });
    }

    // 8. Create output for invalid records with standardized error format
    if (invalidItems.length > 0) {
      invalidRecords.push({
        json: {
          error: createValidationError(invalidItems),
        },
      });
    }

    logger.info('CSV Import: Process completed successfully');
    return [validRecords, invalidRecords];
  } catch (error) {
    // Log the error using the custom logger
    logger.error(
      `CSV Import: Error in importPriceList: ${(error as Error).message}`,
      error as Error,
    );

    // Use our existing error handling utility to create a standardized error
    const standardizedError = handleError(error as Error, {
      csvParsingConfig,
      columnFilterConfig,
    });

    // For catastrophic errors, return empty valid records and standardized error in invalid records
    invalidRecords.push({
      json: {
        error: standardizedError,
      },
    });

    return [[], invalidRecords];
  }
}
