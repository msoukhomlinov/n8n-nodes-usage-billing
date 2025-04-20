import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type { PriceListItem, CsvParsingConfig, ColumnFilterConfig } from '../interfaces';
import { extractCsvData, parseAndTransformCsv, createColumnParsers } from '../utils/csvProcessing';
import { handleError, createValidationError } from '../utils/errorHandling';
import _ from 'lodash';

/**
 * Validate an individual price list item
 */
function validatePriceListItem(item: PriceListItem): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for valid price if present
  if (item.price !== undefined) {
    if (typeof item.price !== 'number' || Number.isNaN(item.price) || item.price < 0) {
      errors.push(`Invalid price value: ${item.price}. Must be a non-negative number.`);
    }
  }

  // Additional validations can be added here based on specific requirements

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
    // Debug logging: input parameters
    this.logger.info('DEBUG: Starting CSV import process');
    this.logger.info(`DEBUG: CSV parsing config: ${JSON.stringify(csvParsingConfig)}`);
    this.logger.info(`DEBUG: Column filter config: ${JSON.stringify(columnFilterConfig)}`);

    // 1. Extract CSV data from input using existing utility
    this.logger.info('DEBUG: Extracting CSV data');
    const csvData = extractCsvData(items, csvParsingConfig.csvSource.fieldName, this);
    this.logger.info(`DEBUG: CSV data extracted, length: ${csvData.length}`);

    // Log the first few characters to verify content
    if (csvData.length > 0) {
      this.logger.info(`DEBUG: CSV data preview: ${csvData.substring(0, 100)}...`);
    }

    // 2. Setup parser options
    const parserOptions = {
      delimiter: csvParsingConfig.csvSource.delimiter || ',',
      skipFirstRow: true, // Always assume the first row is a header
    };
    this.logger.info(`DEBUG: Parser options: ${JSON.stringify(parserOptions)}`);

    // 3. Create empty column parsers for now (no type conversion)
    const colParser = {};

    // 4. Parse CSV into JSON array
    this.logger.info('DEBUG: Parsing CSV into JSON array');
    const jsonArray = await parseAndTransformCsv(
      csvData,
      parserOptions.delimiter,
      parserOptions.skipFirstRow,
      colParser,
      this,
    );
    this.logger.info(`DEBUG: JSON array created, items: ${jsonArray.length}`);

    // Log sample data
    if (jsonArray.length > 0) {
      this.logger.info(`DEBUG: First item example: ${JSON.stringify(jsonArray[0])}`);
    }

    // 5. Apply column filtering if needed
    this.logger.info('DEBUG: Applying column filtering');
    const processedArray = processColumnFiltering(
      jsonArray,
      columnFilterConfig.includeAllColumns,
      columnFilterConfig.includeColumnsList || '',
    );
    this.logger.info(`DEBUG: Column filtering applied, items: ${processedArray.length}`);

    // 6. Validate and separate valid/invalid records
    this.logger.info('DEBUG: Validating records');
    const validItems: PriceListItem[] = [];
    const invalidItems: Array<{ record: PriceListItem; errors: string[] }> = [];

    for (const item of processedArray) {
      const validation = validatePriceListItem(item);

      if (validation.valid) {
        validItems.push(item);
      } else {
        invalidItems.push({
          record: item,
          errors: validation.errors,
        });
      }
    }

    this.logger.info(
      `DEBUG: Validation complete - Valid: ${validItems.length}, Invalid: ${invalidItems.length}`,
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

    this.logger.info('DEBUG: CSV import process completed successfully');
    return [validRecords, invalidRecords];
  } catch (error) {
    // Log the error using the existing logger
    this.logger.error(`Error in importPriceList: ${(error as Error).message}`);

    // Use our new error handling utility to create a standardized error
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

/**
 * Apply column filtering to the array of price list items
 */
function processColumnFiltering(
  items: PriceListItem[],
  includeAllColumns: boolean,
  includeColumnsList: string,
): PriceListItem[] {
  // If including all columns, return the array as is
  if (includeAllColumns) {
    return items;
  }

  // Parse the include columns list
  const columnsToInclude = includeColumnsList
    .split(',')
    .map((col) => col.trim())
    .filter((col) => col !== '');

  // If no specific columns are provided, return all
  if (columnsToInclude.length === 0) {
    return items;
  }

  // Filter the items to only include specified columns
  return items.map((item) => {
    const filteredItem: PriceListItem = {};

    // Include only the specified columns
    for (const columnName of columnsToInclude) {
      if (_.has(item, columnName)) {
        filteredItem[columnName] = item[columnName];
      }
    }

    return filteredItem;
  });
}
