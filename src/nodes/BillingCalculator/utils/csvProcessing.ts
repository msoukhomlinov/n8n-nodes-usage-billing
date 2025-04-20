import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import csv from 'csvtojson';
import type { PriceListItem, ColumnMapping } from '../interfaces';
import _ from 'lodash';

/**
 * Extracts CSV data from various input sources
 * @param items The input items that might contain CSV data
 * @param csvField The field name that should contain the CSV data
 * @returns The extracted CSV string
 */
export function extractCsvData(
  items: INodeExecutionData[],
  csvField: string,
  executeFunctions: IExecuteFunctions,
): string {
  // First, check if csvField itself is CSV data
  if (
    typeof csvField === 'string' &&
    csvField.includes(',') &&
    (csvField.includes('\n') || csvField.includes('\r'))
  ) {
    // If csvField looks like CSV data (has commas and newlines), return it directly
    if (executeFunctions.logger) {
      executeFunctions.logger.info('Detected direct CSV string input, using it directly');
    }
    return csvField;
  }

  if (executeFunctions.logger) {
    executeFunctions.logger.info(`Looking for CSV data in field: ${csvField}`);
  }

  // Existing logic to look for a field with the name csvField
  let csvData: unknown = _.get(items[0].json, csvField);

  // If not found directly, try to find it in the item
  if (csvData === undefined) {
    // Find any string property that looks like CSV
    const csvProperty = _.find(
      items[0].json,
      (value) => typeof value === 'string' && value.includes(','),
    );

    if (csvProperty) {
      csvData = csvProperty;
    } else if (items[0].binary) {
      // Check binary attachments for CSV content
      const csvBinary = _.find(
        items[0].binary,
        (binaryData) =>
          binaryData.mimeType === 'text/csv' || binaryData.mimeType === 'application/csv',
      );

      if (csvBinary) {
        csvData = Buffer.from(csvBinary.data, 'base64').toString();
      }
    }
  }

  // Convert to string if it's not already
  if (csvData !== undefined && typeof csvData !== 'string') {
    try {
      // Try to stringify if it's an object/array
      csvData = JSON.stringify(csvData);
    } catch (e) {
      // If that fails, convert to string directly
      csvData = String(csvData);
    }
  }

  if (!csvData || typeof csvData !== 'string') {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      `CSV data is missing or invalid. Please ensure the data is in field "${csvField}" and is a valid CSV string.`,
    );
  }

  return csvData as string;
}

/**
 * Type for csvtojson column parser function
 */
type CellParser = (
  item: string,
  head: string,
  resultRow: IDataObject,
  row: string[],
) => string | number | boolean | null;

/**
 * Creates column parsers based on column mapping configuration
 */
export function createColumnParsers(columnMappings: ColumnMapping[]): Record<string, CellParser> {
  const colParser: Record<string, CellParser> = {};

  for (const mapping of columnMappings) {
    const columnKey = mapping.csvColumn;

    switch (mapping.dataType) {
      case 'number':
        colParser[columnKey] = (item: string) => {
          const num = Number(item);
          return Number.isNaN(num) ? 0 : num;
        };
        break;
      case 'boolean':
        colParser[columnKey] = (item: string) => ['true', 'yes', '1'].includes(item.toLowerCase());
        break;
      default:
        // String type is the default behavior, no need for custom parser
        break;
    }
  }

  return colParser;
}

/**
 * Parses CSV string into JSON objects
 */
export async function parseAndTransformCsv(
  csvData: string,
  delimiter: string,
  skipFirstRow: boolean,
  colParser: Record<string, CellParser>,
  executeFunctions: IExecuteFunctions,
  quote = '"',
): Promise<PriceListItem[]> {
  // Process special delimiter cases
  let processedDelimiter = delimiter;
  let autoDetect = false;

  // Check for auto-detect
  if (delimiter === 'auto') {
    autoDetect = true;
    executeFunctions.logger.info('Using auto-detect for delimiter');
  } else {
    // Handle common special character cases
    if (delimiter === '\\t' || delimiter.toLowerCase() === 'tab') {
      processedDelimiter = '\t';
    } else if (delimiter === '\\n') {
      processedDelimiter = '\n';
    } else if (delimiter === '\\r') {
      processedDelimiter = '\r';
    }

    // Log the specified delimiter
    executeFunctions.logger.info(
      `Using specified delimiter: "${processedDelimiter}" (charCode: ${processedDelimiter.charCodeAt(0)})`,
    );
  }

  // Parse the CSV data using csvtojson
  const converterOptions: {
    noheader: boolean;
    trim: boolean;
    ignoreEmpty: boolean;
    colParser: Record<string, CellParser>;
    quote: string;
    checkType: boolean;
    delimiter?: string;
  } = {
    noheader: !skipFirstRow,
    trim: true,
    ignoreEmpty: true,
    colParser,
    quote,
    checkType: true, // Ensure proper type detection
  };

  // Set delimiter based on whether we're auto-detecting
  if (autoDetect) {
    converterOptions.delimiter = 'auto';
  } else {
    converterOptions.delimiter = processedDelimiter;
  }

  const converter = csv(converterOptions);

  // Listen for delimiter detection event (works with 'auto' delimiter)
  converter.on('delimiter', (detectedDelimiter: string) => {
    executeFunctions.logger.info(
      `Delimiter detected: "${detectedDelimiter}" (charCode: ${detectedDelimiter.charCodeAt(0)})`,
    );
  });

  try {
    const jsonArray = await converter.fromString(csvData);

    if (jsonArray.length === 0) {
      throw new NodeOperationError(executeFunctions.getNode(), 'No data rows found in CSV');
    }

    // Log parsing results
    executeFunctions.logger.info(`Successfully parsed ${jsonArray.length} records from CSV`);
    if (jsonArray.length > 0 && Object.keys(jsonArray[0]).length > 0) {
      executeFunctions.logger.info(`Detected columns: ${Object.keys(jsonArray[0]).join(', ')}`);
    }

    return jsonArray as PriceListItem[];
  } catch (error) {
    executeFunctions.logger.error(`Error parsing CSV: ${(error as Error).message}`);
    throw new NodeOperationError(
      executeFunctions.getNode(),
      `Failed to parse CSV data: ${(error as Error).message}`,
    );
  }
}

/**
 * Applies column mappings and data type conversions to the JSON array
 */
export function applyColumnMappings(
  jsonArray: PriceListItem[],
  columnMappings: ColumnMapping[],
  hierarchyIdentifiers: string[],
  fieldRenameMap: Map<string, string>,
  includeAllColumns: boolean,
  includeColumnsList: string[] = [],
): PriceListItem[] {
  return _.map(jsonArray, (item) => {
    // Start with a fresh item
    const filteredItem: PriceListItem = {};
    // Track which fields have been processed to avoid duplicates
    const processedFields = new Set<string>();

    // Add all hierarchy fields that exist in the source (with renaming if specified)
    for (const sourceField of hierarchyIdentifiers) {
      if (_.has(item, sourceField)) {
        // Always preserve the original field for hierarchy grouping
        filteredItem[sourceField] = item[sourceField];
        processedFields.add(sourceField);

        // Also add the renamed field if specified
        const targetField = fieldRenameMap.get(sourceField);
        if (targetField && targetField !== sourceField) {
          filteredItem[targetField] = item[sourceField];
          processedFields.add(targetField);
        }
      }
    }

    // If includeAllColumns is true, include all fields from the original item
    if (includeAllColumns) {
      _.forEach(item, (value, key) => {
        if (!processedFields.has(key)) {
          filteredItem[key] = value;
          processedFields.add(key);
        }
      });
    } else {
      // First add columns from includeColumnsList if provided
      if (includeColumnsList.length > 0) {
        for (const columnName of includeColumnsList) {
          if (_.has(item, columnName) && !processedFields.has(columnName)) {
            filteredItem[columnName] = item[columnName];
            processedFields.add(columnName);
          }
        }
      }

      // Then add additional fields specified in Column Filter
      for (const mapping of columnMappings) {
        const sourceField = mapping.csvColumn;
        const targetField = mapping.targetField || sourceField;

        if (_.has(item, sourceField) && !processedFields.has(targetField)) {
          // Apply data type conversion if needed
          let value = item[sourceField];

          switch (mapping.dataType) {
            case 'number':
              value = Number.parseFloat(String(value));
              break;
            case 'boolean':
              value = ['true', 'yes', '1', true, 1].includes(
                value !== undefined && value !== null ? value : '',
              );
              break;
            // String is the default type
          }

          filteredItem[targetField] = value;
          processedFields.add(targetField);
        }
      }
    }

    return filteredItem;
  });
}

/**
 * Helper function to get column mappings array
 */
export function getColumnMappings(columnFilterConfig: {
  mappings?: { columns?: { column?: ColumnMapping[] | ColumnMapping } };
}): ColumnMapping[] {
  const columnData = columnFilterConfig.mappings?.columns?.column;
  if (!columnData) return [];
  return Array.isArray(columnData) ? columnData : [columnData];
}

/**
 * Extract hierarchy identifiers from hierarchy configuration
 */
export function extractHierarchyIdentifiers(hierarchyConfig: {
  levels?: {
    levelDefinitions?: {
      level?:
        | Array<{ identifierField: string; outputField?: string }>
        | { identifierField: string; outputField?: string };
    };
  };
}): { identifiers: string[]; fieldRenameMap: Map<string, string> } {
  const hierarchyFields = hierarchyConfig.levels?.levelDefinitions?.level;
  const hierarchyIdentifiers: string[] = [];
  const fieldRenameMap = new Map<string, string>();

  if (hierarchyFields) {
    const fieldsArray = Array.isArray(hierarchyFields) ? hierarchyFields : [hierarchyFields];

    // Populate identifiers and rename mapping
    for (const field of fieldsArray) {
      hierarchyIdentifiers.push(field.identifierField);
      if (field.outputField && field.outputField.trim() !== '') {
        fieldRenameMap.set(field.identifierField, field.outputField);
      }
    }
  }

  return { identifiers: hierarchyIdentifiers, fieldRenameMap };
}
