import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { HierarchyLevel, SharedHierarchyConfig, HierarchyOutput } from '../interfaces';
import type { IDataObject } from 'n8n-workflow';

// Define type for level entries
interface LevelEntry {
  identifierField: string;
  outputField?: string;
}

// Define type for the collection structure
interface LevelCollection {
  level?: LevelEntry[] | LevelEntry;
  [key: string]: unknown;
}

/**
 * Defines a reusable hierarchy configuration that can be used across operations
 */
export async function defineHierarchy(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
  try {
    // Get raw hierarchy configuration from UI
    const hierarchyName = this.getNodeParameter('hierarchyName', 0) as string;
    const hierarchyDescription = this.getNodeParameter('hierarchyDescription', 0, '') as string;

    // Log the entire hierarchy structure for debugging
    this.logger.info('DEBUG: Full hierarchyLevels parameter:');
    const fullHierarchy = this.getNodeParameter('hierarchyLevels', 0, {});
    this.logger.info(JSON.stringify(fullHierarchy, null, 2));

    // Extract hierarchy levels based on the nested structure from n8n UI
    let hierarchyLevelsRaw: LevelEntry[] = [];

    // Based on the debug output, try the specific deeply nested path first
    try {
      // This specific path matches the exact nesting shown in the logs: hierarchyLevels.level.level.level
      const deeplyNested = this.getNodeParameter(
        'hierarchyLevels.level.level.level',
        0,
        null,
      ) as unknown;

      this.logger.info('DEBUG: Trying deeply nested path (hierarchyLevels.level.level.level):');
      this.logger.info(JSON.stringify(deeplyNested, null, 2));

      if (Array.isArray(deeplyNested) && deeplyNested.length > 0) {
        this.logger.info(`DEBUG: Found ${deeplyNested.length} levels at deeply nested path`);
        const validLevels = deeplyNested.filter(
          (item) => item && typeof item === 'object' && 'identifierField' in (item as object),
        );

        if (validLevels.length > 0) {
          hierarchyLevelsRaw = validLevels as LevelEntry[];
          this.logger.info(
            `DEBUG: Using ${hierarchyLevelsRaw.length} levels from deeply nested path`,
          );
        }
      }
    } catch (e) {
      this.logger.info(`DEBUG: Error accessing deeply nested path: ${(e as Error).message}`);
    }

    // If the deeply nested path didn't work, try other variations
    if (!hierarchyLevelsRaw.length) {
      // Try to navigate through the hierarchy manually based on the observed structure
      try {
        let currentLevel = fullHierarchy as unknown;

        // We know from logs the structure is: level -> level -> level (array)
        if (
          currentLevel &&
          typeof currentLevel === 'object' &&
          'level' in (currentLevel as Record<string, unknown>)
        ) {
          currentLevel = (currentLevel as Record<string, unknown>).level;

          if (
            currentLevel &&
            typeof currentLevel === 'object' &&
            'level' in (currentLevel as Record<string, unknown>)
          ) {
            currentLevel = (currentLevel as Record<string, unknown>).level;

            if (
              currentLevel &&
              typeof currentLevel === 'object' &&
              'level' in (currentLevel as Record<string, unknown>)
            ) {
              const levelsArray = (currentLevel as Record<string, unknown>).level;

              if (Array.isArray(levelsArray) && levelsArray.length > 0) {
                this.logger.info(`DEBUG: Found ${levelsArray.length} levels by manual navigation`);
                hierarchyLevelsRaw = levelsArray as LevelEntry[];
              }
            }
          }
        }
      } catch (e) {
        this.logger.info(`DEBUG: Error in manual navigation: ${(e as Error).message}`);
      }
    }

    // Validate hierarchy configuration
    if (!hierarchyName) {
      throw new NodeOperationError(this.getNode(), 'Hierarchy name is required');
    }

    // Log what we found before validation
    this.logger.info(`DEBUG: Final hierarchy levels count: ${hierarchyLevelsRaw?.length || 0}`);
    if (hierarchyLevelsRaw && hierarchyLevelsRaw.length > 0) {
      hierarchyLevelsRaw.forEach((level, index) => {
        this.logger.info(
          `DEBUG: Level ${index + 1}: identifierField=${level.identifierField}, outputField=${level.outputField || '(none)'}`,
        );
      });
    }

    if (!hierarchyLevelsRaw || !hierarchyLevelsRaw.length) {
      // Add detailed error to help troubleshoot
      const hierarchyStructure = this.getNodeParameter('hierarchyLevels', 0, {});
      throw new NodeOperationError(
        this.getNode(),
        `At least one hierarchy level is required. Received structure: ${JSON.stringify(hierarchyStructure)}`,
      );
    }

    // Process and normalize hierarchy levels
    const hierarchyLevels: HierarchyLevel[] = hierarchyLevelsRaw.map((level) => ({
      identifierField: level.identifierField,
      outputField: level.outputField || level.identifierField, // Default to input field name if output not specified
    }));

    // Create the hierarchy config object - standard format for shared config
    const hierarchyConfig: SharedHierarchyConfig = {
      name: hierarchyName,
      description: hierarchyDescription || undefined,
      levels: hierarchyLevels,
    };

    // Log the final hierarchy config for debugging
    this.logger.info(`DEBUG: Final hierarchy config: ${JSON.stringify(hierarchyConfig)}`);

    // Create the return data with multiple structure formats for compatibility
    const returnData: INodeExecutionData[] = items.map((item) => {
      const newItem = { ...item };

      // Store the configuration in a single standardized format
      newItem.json = {
        ...newItem.json,
        // Store as hierarchyConfig using the standard format
        hierarchyConfig,
      };

      return newItem;
    });

    this.logger.info(
      `DEBUG: Output uses standard hierarchyConfig format with name, description, and levels array`,
    );
    this.logger.info(`DEBUG: First output item: ${JSON.stringify(returnData[0].json)}`);

    return returnData;
  } catch (error) {
    if (error instanceof NodeOperationError) {
      throw error;
    }
    throw new NodeOperationError(
      this.getNode(),
      `Error defining hierarchy: ${(error as Error).message}`,
    );
  }
}
