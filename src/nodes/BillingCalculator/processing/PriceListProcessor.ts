import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import csv from 'csvtojson';
import type {
  PriceListItem,
  CsvParsingConfig,
  ColumnFilterConfig,
  HierarchyConfig,
  HierarchyLevel,
  SharedHierarchyConfig,
} from '../interfaces';
import { validatePriceListData } from '../utils';
import _ from 'lodash';

// Type for csvtojson column parser function
type CellParser = (
  item: string,
  head: string,
  resultRow: IDataObject,
  row: string[],
) => string | number | boolean | null;

/**
 * Processes CSV data into a structured price list
 */
export async function processPriceList(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  csvParsingConfig: CsvParsingConfig,
  columnFilterConfig: ColumnFilterConfig,
  hierarchyConfig: HierarchyConfig,
  includeAllColumns = true,
  includeColumnsList: string[] = [],
): Promise<INodeExecutionData[]> {
  const returnData: INodeExecutionData[] = [];

  try {
    // Extract CSV data from input - handle both direct strings and objects
    const csvField = csvParsingConfig.csvSource.fieldName;
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
        this.getNode(),
        `CSV data is missing or invalid. Please ensure the data is in field "${csvField}" and is a valid CSV string.`,
      );
    }

    // Helper function to normalize columns to array
    const getColumnMappings = () => {
      const columnData = columnFilterConfig.mappings?.columns?.column;
      if (!columnData) return [];
      return Array.isArray(columnData) ? columnData : [columnData];
    };

    // Get additional fields to include beyond hierarchy fields
    const additionalFields = getColumnMappings();

    // Create column parsers based on column mapping configuration
    const colParser: Record<string, CellParser> = {};
    for (const mapping of additionalFields) {
      const columnKey = mapping.csvColumn;

      switch (mapping.dataType) {
        case 'number':
          colParser[columnKey] = (item: string) => {
            const num = Number(item);
            return Number.isNaN(num) ? 0 : num;
          };
          break;
        case 'boolean':
          colParser[columnKey] = (item: string) =>
            ['true', 'yes', '1'].includes(item.toLowerCase());
          break;
        default:
          // String type is the default behavior, no need for custom parser
          break;
      }
    }

    // Parse the CSV data using csvtojson
    const converter = csv({
      delimiter: csvParsingConfig.csvSource.delimiter,
      noheader: !csvParsingConfig.csvSource.skipFirstRow,
      trim: true,
      ignoreEmpty: true,
      colParser,
    });

    let jsonArray = await converter.fromString(csvData);

    if (jsonArray.length === 0) {
      throw new NodeOperationError(this.getNode(), 'No data rows found in CSV');
    }

    // Create a map of source field names to output field names for renamed fields
    const fieldRenameMap = new Map<string, string>();

    // Apply field filtering to include only hierarchy fields and explicitly included fields
    if (csvParsingConfig.csvSource.skipFirstRow) {
      // Get hierarchy fields to always include
      const hierarchyFields = hierarchyConfig.levels?.levelDefinitions?.level;
      const hierarchyIdentifiers: string[] = [];

      if (hierarchyFields) {
        const fieldsArray = Array.isArray(hierarchyFields) ? hierarchyFields : [hierarchyFields];

        // Populate identifiers and rename mapping
        for (const field of fieldsArray) {
          hierarchyIdentifiers.push(field.identifierField);
          if (field.outputField && field.outputField.trim() !== '') {
            fieldRenameMap.set(field.identifierField, field.outputField);
          }
        }
      } else {
        // Empty array if no hierarchy fields defined
      }

      // Check if we should include all columns
      const includeAllColumnsValue = includeAllColumns;

      // Important: Field renaming happens here in the data preparation phase.
      // We need to use original field names for grouping but only include
      // the renamed fields in the final output values.
      jsonArray = _.map(jsonArray, (item) => {
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
        if (includeAllColumnsValue) {
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
          for (const mapping of additionalFields) {
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
                  value = ['true', 'yes', '1', true, 1].includes(value);
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

    // Ensure we have valid price list data
    validatePriceListData(jsonArray);

    // Process raw data into hierarchical structure
    const hierarchicalData = buildHierarchicalPriceList(jsonArray, hierarchyConfig);

    // Convert back to n8n output format
    // Create a copy of input item but replace json with our processed data
    const item = { ...items[0] };

    // Preserve the original flat price list array
    item.json = {
      priceList: hierarchicalData,
      flatPriceList: jsonArray,
    };

    // If this processed data came from a shared hierarchy, also include the hierarchy config
    // Look for the 'hierarchyConfig' field in the input
    if (items[0].json.hierarchyConfig) {
      // Add more robust logging
      this.logger.info(
        'DEBUG: Found shared hierarchy configuration in input, preserving it in output',
      );

      // Include the shared hierarchy configuration in the output
      // Make a deep copy to avoid reference issues
      try {
        const hierarchyConfig = items[0].json.hierarchyConfig;
        item.json.hierarchyConfig = JSON.parse(JSON.stringify(hierarchyConfig));

        // Also preserve the name if available
        if (items[0].json.hierarchyName) {
          item.json.hierarchyName = items[0].json.hierarchyName;
          this.logger.info(`DEBUG: Preserved hierarchy name: ${items[0].json.hierarchyName}`);
        }

        // Log the preserved hierarchy structure
        this.logger.info('DEBUG: Preserved hierarchy config in output');
        if (
          hierarchyConfig &&
          typeof hierarchyConfig === 'object' &&
          'levels' in (hierarchyConfig as IDataObject)
        ) {
          const levels = (hierarchyConfig as IDataObject).levels;
          if (Array.isArray(levels)) {
            this.logger.info(`DEBUG: Config contains ${levels.length} hierarchy levels`);
          }
        }
      } catch (e) {
        this.logger.warn(`DEBUG: Error preserving hierarchy config: ${(e as Error).message}`);
      }
    }

    returnData.push(item);
    return returnData;
  } catch (error) {
    // Propagate original error if it's already a NodeOperationError
    if (error instanceof NodeOperationError) {
      throw error;
    }

    // Otherwise wrap in NodeOperationError
    throw new NodeOperationError(
      this.getNode(),
      `Failed to process price list: ${(error as Error).message}`,
    );
  }
}

/**
 * Build hierarchical price list structure
 */
function buildHierarchicalPriceList(
  items: PriceListItem[],
  hierarchyConfig: HierarchyConfig,
): Record<string, unknown> {
  // Check if we have any level definitions
  const levelDefs = hierarchyConfig.levels?.levelDefinitions?.level;
  if (!levelDefs) {
    // No hierarchy defined, return flat list
    return { items };
  }

  // Normalize to array
  const levelDefinitions = Array.isArray(levelDefs) ? levelDefs : [levelDefs];

  if (levelDefinitions.length === 0) {
    // No hierarchy defined, return flat list
    return { items };
  }

  // Map level definitions to the expected format
  const levels = _.map(levelDefinitions, (level, index) => ({
    name: `level_${index + 1}`, // Generate a level name based on index
    idField: level.identifierField, // Original source field for looking up values
    outputField:
      level.outputField && level.outputField.trim() !== ''
        ? level.outputField
        : level.identifierField,
  }));

  // Use a recursive approach to build the hierarchy
  return buildHierarchyLevel(items, levels, 0);
}

/**
 * Recursive helper to build hierarchy levels
 */
function buildHierarchyLevel(
  items: PriceListItem[],
  levels: Array<{ name: string; idField: string; outputField: string }>,
  currentLevelIndex: number,
): Record<string, unknown> {
  // If we've processed all levels or there are no more items, return empty object
  if (currentLevelIndex >= levels.length || items.length === 0) {
    return {};
  }

  // Get the field to group by at this level
  const level = levels[currentLevelIndex];
  const groupField = level.idField; // Original field for grouping
  const outputField = level.outputField; // Field name to use in output

  // Group the items by the current level's identifier field (using original field name)
  const groupedItems = _.groupBy(items, (item) => String(_.get(item, groupField, 'unknown')));

  // If this is the last level, we're done for this branch
  if (currentLevelIndex === levels.length - 1) {
    return groupedItems;
  }

  // Otherwise, recursively process each group to build the next level
  const result: Record<string, unknown> = {};

  // Create the next level, preserving the values but using the output field name for the key
  _.forEach(groupedItems, (groupItems, groupKey) => {
    // Use the nested structure
    result[groupKey] = buildHierarchyLevel(groupItems, levels, currentLevelIndex + 1);
  });

  return result;
}
