import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import csv from 'csvtojson';
import type {
  PriceListItem,
  CsvParsingConfig,
  ColumnFilterConfig,
  HierarchyConfig,
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

        // Add any additional fields specified in Column Filter
        for (const mapping of additionalFields) {
          const sourceKey = mapping.csvColumn;
          // If target field is empty, use source field name
          const targetKey = mapping.targetField || sourceKey;

          // Only include if source exists in the item and not already processed
          if (_.has(item, sourceKey) && !processedFields.has(targetKey)) {
            filteredItem[targetKey] = item[sourceKey];
            processedFields.add(targetKey);
          }
        }

        // If no fields specified at all, use entire item
        if (hierarchyIdentifiers.length === 0 && additionalFields.length === 0) {
          return item;
        }

        return filteredItem;
      });
    }

    // Validate the JSON data against our schema
    const validation = validatePriceListData(jsonArray);
    if (!validation.valid) {
      this.logger.warn(`Price list validation issues: ${validation.errors.join(', ')}`);

      // We'll continue processing but add validation issues to the output
      // This allows workflows to decide how to handle validation issues
    }

    // Build hierarchical structure from flat data
    const priceList = buildHierarchicalPriceList(jsonArray, hierarchyConfig);

    // Helper function to clean up the hierarchical price list - removing original fields that have renamed versions
    function cleanupHierarchy(data: unknown): unknown {
      // Base case: not an object
      if (!data || typeof data !== 'object') {
        return data;
      }

      // Handle arrays (these are typically leaf nodes with data items)
      if (Array.isArray(data)) {
        return data.map((item) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            // Create a clean copy without the original fields when there are renamed versions
            const cleanItem: Record<string, unknown> = {};

            // First copy all properties
            Object.assign(cleanItem, item);

            // Then remove fields that have renamed versions
            for (const [original, renamed] of fieldRenameMap.entries()) {
              if (original in cleanItem && renamed in cleanItem && original !== renamed) {
                delete cleanItem[original];
              }
            }

            return cleanItem;
          }
          // Recursively process nested objects
          return typeof item === 'object' ? cleanupHierarchy(item) : item;
        });
      }

      // Handle regular objects (these are hierarchy structure nodes)
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        result[key] = typeof value === 'object' && value !== null ? cleanupHierarchy(value) : value;
      }

      return result;
    }

    // Apply cleanup to remove original fields when they have renamed versions
    let cleanedPriceList = priceList;
    if (fieldRenameMap.size > 0) {
      // Only clean up if we have field renames
      cleanedPriceList = cleanupHierarchy(priceList) as Record<string, unknown>;
    }

    // Return the processed price list with cleaned data
    returnData.push({
      json: {
        priceList: cleanedPriceList,
        success: true,
        count: jsonArray.length,
        valid: validation.valid,
        validationErrors: validation.errors,
      },
    });

    return returnData;
  } catch (error) {
    // Handle any errors
    if (error instanceof NodeOperationError) {
      throw error;
    }
    throw new NodeOperationError(
      this.getNode(),
      `Error processing price list: ${(error as Error).message}`,
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
