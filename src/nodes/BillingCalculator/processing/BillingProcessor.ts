import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, LoggerProxy } from 'n8n-workflow';
import type { IDataObject } from 'n8n-workflow';
import _ from 'lodash';
import type {
  PriceListItem,
  UsageRecord,
  BillingRecord,
  InputDataConfig,
  MatchConfig,
  CalculationConfig,
  OutputConfig,
  HierarchyLevel,
  SharedHierarchyConfig,
  FieldMapping,
  HierarchyConfig,
} from '../interfaces';
import { validateUsageRecordsData } from '../utils';
import { calculateBasicBilling, multiply, round } from '../utils/calculations';

// Simulating the decimal.js functionality with simple multiply function
// This is a placeholder until the actual utils/decimal implementation is available
function multiplyWithPrecision(a: string | number, b: string | number): string {
  return String(Number(a) * Number(b));
}

/**
 * Helper function to extract hierarchy levels from a complex object structure
 * This handles various formats that the hierarchy configuration might be in
 */
function extractHierarchyLevels(
  hierarchyConfigData: IDataObject | null,
  logger?: IExecuteFunctions['logger'],
): HierarchyLevel[] {
  if (!hierarchyConfigData) {
    return [];
  }

  // Log what we're working with if logger is provided
  if (logger) {
    logger.info(`DEBUG: Extracting levels from: ${JSON.stringify(hierarchyConfigData)}`);
  }

  // Case 1: Standard hierarchyConfig format (primary format from defineHierarchy)
  if (
    'hierarchyConfig' in hierarchyConfigData &&
    typeof hierarchyConfigData.hierarchyConfig === 'object' &&
    hierarchyConfigData.hierarchyConfig !== null
  ) {
    const sharedConfig = hierarchyConfigData.hierarchyConfig as IDataObject;

    if (logger) {
      logger.info('DEBUG: Found hierarchyConfig property, checking for levels');
    }

    if ('levels' in sharedConfig && Array.isArray(sharedConfig.levels)) {
      const levelsArray = sharedConfig.levels;
      if (logger) {
        logger.info(`DEBUG: Found standard hierarchyConfig with ${levelsArray.length} levels`);
      }

      // Validate the levels have the required fields
      const validLevels = (levelsArray as IDataObject[]).filter(
        (level) =>
          level && typeof level === 'object' && 'identifierField' in level && level.identifierField,
      );

      if (validLevels.length > 0) {
        // Ensure outputField is set even if it wasn't in the original data
        return validLevels.map((level) => ({
          identifierField: level.identifierField as string,
          outputField: (level.outputField as string) || (level.identifierField as string),
        })) as unknown as HierarchyLevel[];
      }
    }
  }

  // Case 2: If the object itself is a SharedHierarchyConfig
  if (
    'name' in hierarchyConfigData &&
    'levels' in hierarchyConfigData &&
    Array.isArray(hierarchyConfigData.levels)
  ) {
    const levelsArray = hierarchyConfigData.levels;
    if (logger) {
      logger.info(`DEBUG: Found direct SharedHierarchyConfig with ${levelsArray.length} levels`);
    }

    // Check if it's already an array of HierarchyLevel objects
    if (levelsArray.length > 0) {
      const firstItem = levelsArray[0];
      if (typeof firstItem === 'object' && firstItem !== null && 'identifierField' in firstItem) {
        if (logger) {
          logger.info('DEBUG: Using HierarchyLevel objects directly from SharedHierarchyConfig');
        }
        return levelsArray as unknown as HierarchyLevel[];
      }
    }
  }

  // Case 3: If it has a direct levels array containing HierarchyLevel objects
  if ('levels' in hierarchyConfigData && Array.isArray(hierarchyConfigData.levels)) {
    const levelsArray = hierarchyConfigData.levels;
    if (logger) {
      logger.info(`DEBUG: Found levels array with ${levelsArray.length} items`);
    }

    // Check if it's already an array of HierarchyLevel objects
    if (levelsArray.length > 0) {
      const firstItem = levelsArray[0];
      if (typeof firstItem === 'object' && firstItem !== null && 'identifierField' in firstItem) {
        if (logger) {
          logger.info('DEBUG: Using direct HierarchyLevel objects in levels array');
        }
        return levelsArray as unknown as HierarchyLevel[];
      }
    }
  }

  // Case 4: Check if the structure follows HierarchyConfig format
  if (
    'levels' in hierarchyConfigData &&
    typeof hierarchyConfigData.levels === 'object' &&
    hierarchyConfigData.levels !== null
  ) {
    const levelsObj = hierarchyConfigData.levels as IDataObject;

    if (logger) {
      logger.info('DEBUG: Examining levels object structure');
    }

    // Case 4.1: Has levelDefinitions structure
    if (
      'levelDefinitions' in levelsObj &&
      typeof levelsObj.levelDefinitions === 'object' &&
      levelsObj.levelDefinitions !== null
    ) {
      const levelDefs = levelsObj.levelDefinitions as IDataObject;

      if (logger) {
        logger.info(`DEBUG: Found levelDefinitions: ${JSON.stringify(levelDefs)}`);
      }

      // Check if it has a "level" property that contains the definitions
      if ('level' in levelDefs) {
        const levelData = levelDefs.level;

        // Convert to HierarchyLevel[] format
        if (Array.isArray(levelData)) {
          if (logger) {
            logger.info(`DEBUG: Found level definitions array with ${levelData.length} items`);
          }
          return (levelData as IDataObject[]).map((def) => ({
            identifierField: def.identifierField as string,
            outputField: (def.outputField as string) || (def.identifierField as string),
          }));
        }

        // Single level definition
        if (typeof levelData === 'object' && levelData !== null) {
          if (logger) {
            logger.info('DEBUG: Found single level definition');
          }
          return [
            {
              identifierField: (levelData as IDataObject).identifierField as string,
              outputField:
                ((levelData as IDataObject).outputField as string) ||
                ((levelData as IDataObject).identifierField as string),
            },
          ];
        }
      }
    }
  }

  // Case 5: Check if it's already a HierarchyLevel object itself
  if ('identifierField' in hierarchyConfigData) {
    if (logger) {
      logger.info('DEBUG: Found direct HierarchyLevel object');
    }
    return [
      {
        identifierField: hierarchyConfigData.identifierField as string,
        outputField:
          (hierarchyConfigData.outputField as string) ||
          (hierarchyConfigData.identifierField as string),
      },
    ];
  }

  // Case 6: Check if this is the parent object of a nested structure (level.level.level)
  if ('level' in hierarchyConfigData && typeof hierarchyConfigData.level === 'object') {
    if (logger) {
      logger.info('DEBUG: Found potential nested level structure, recursing');
    }
    // Recurse into this structure
    return extractHierarchyLevels(hierarchyConfigData.level as IDataObject, logger);
  }

  // No recognizable structure found
  if (logger) {
    logger.info('DEBUG: Could not extract hierarchy levels from the provided structure');
  }
  return [];
}

/**
 * Helper function to extract data array from a parameter that could be a field name or an object
 */
function extractDataFromParameter(
  parameter: string | IDataObject,
  inputData: IDataObject,
  defaultFieldName: string,
  parameterName: string,
  logger?: IExecuteFunctions['logger'],
): IDataObject[] {
  let data: IDataObject[] = [];

  if (logger) {
    logger.info(`DEBUG: Extracting ${parameterName} from: ${JSON.stringify(parameter)}`);
  }

  // Handle string parameter (field name)
  if (typeof parameter === 'string') {
    if (logger) {
      logger.info(`DEBUG: Looking up ${parameterName} using field name: ${parameter}`);
    }
    data = (inputData[parameter] as IDataObject[]) || [];
  }
  // Handle object parameter
  else if (parameter && typeof parameter === 'object') {
    if (logger) {
      logger.info(`DEBUG: ${parameterName} is an object: ${JSON.stringify(parameter)}`);
    }

    // Check if the parameter is already an array of data objects
    if (Array.isArray(parameter)) {
      if (logger) {
        logger.info(`DEBUG: Using ${parameterName} directly as it is an array`);
      }
      data = parameter as unknown as IDataObject[];
    }
    // Check for common property names
    else if ('data' in parameter && Array.isArray(parameter.data)) {
      if (logger) {
        logger.info(`DEBUG: Extracting ${parameterName} from data property`);
      }
      data = parameter.data as IDataObject[];
    } else if ('records' in parameter && Array.isArray(parameter.records)) {
      if (logger) {
        logger.info(`DEBUG: Extracting ${parameterName} from records property`);
      }
      data = parameter.records as IDataObject[];
    } else if ('items' in parameter && Array.isArray(parameter.items)) {
      if (logger) {
        logger.info(`DEBUG: Extracting ${parameterName} from items property`);
      }
      data = parameter.items as IDataObject[];
    }
    // If the object is a single data item (for usage data), convert to array
    else if (
      parameterName === 'usage data' &&
      ('usageAmount' in parameter || 'usage' in parameter || 'quantity' in parameter)
    ) {
      if (logger) {
        logger.info('DEBUG: Converting single usage data object to array');
      }
      data = [parameter];
    }
    // If the object might be a price list item, check for price-related fields
    else if (
      parameterName === 'price list data' &&
      ('unitPrice' in parameter || 'price' in parameter || 'rate' in parameter)
    ) {
      if (logger) {
        logger.info('DEBUG: Converting single price list item to array');
      }
      data = [parameter];
    }
    // If it's a hierarchy config object but we're looking for price list or usage data
    else if (
      'levels' in parameter &&
      Array.isArray(parameter.levels) &&
      (parameterName === 'price list data' || parameterName === 'usage data')
    ) {
      if (logger) {
        logger.info(
          `DEBUG: Parameter appears to be a hierarchy config object, not ${parameterName}`,
        );
        logger.info(
          `DEBUG: Looking up ${parameterName} using default field name: ${defaultFieldName}`,
        );
      }
      // Try the default field name instead
      data = (inputData[defaultFieldName] as IDataObject[]) || [];
    }
    // Check for name property to use as field name
    else if ('name' in parameter) {
      const fieldName = parameter.name as string;
      if (logger) {
        logger.info(`DEBUG: Looking up ${parameterName} using name property: ${fieldName}`);
      }
      data = (inputData[fieldName] as IDataObject[]) || [];
    } else if ('value' in parameter) {
      const fieldName = parameter.value as string;
      if (logger) {
        logger.info(`DEBUG: Looking up ${parameterName} using value property: ${fieldName}`);
      }
      data = (inputData[fieldName] as IDataObject[]) || [];
    }
  }
  // Use default field name as fallback
  else {
    if (logger) {
      logger.info(`DEBUG: Using default field name for ${parameterName}: ${defaultFieldName}`);
    }
    data = (inputData[defaultFieldName] as IDataObject[]) || [];
  }

  // If we still don't have data, try commonly used field names as a last resort
  if ((!data || data.length === 0) && parameterName === 'price list data') {
    const commonPriceListFields = ['priceList', 'prices', 'rates', 'priceTable', 'priceItems'];
    for (const field of commonPriceListFields) {
      if (inputData[field] && Array.isArray(inputData[field])) {
        data = inputData[field] as IDataObject[];
        if (logger) {
          logger.info(`DEBUG: Found price list data in common field: ${field}`);
        }
        break;
      }
    }
  } else if ((!data || data.length === 0) && parameterName === 'usage data') {
    const commonUsageFields = ['usageData', 'usageRecords', 'usage', 'records', 'data'];
    for (const field of commonUsageFields) {
      if (inputData[field] && Array.isArray(inputData[field])) {
        data = inputData[field] as IDataObject[];
        if (logger) {
          logger.info(`DEBUG: Found usage data in common field: ${field}`);
        }
        break;
      }
    }
  }

  if (logger) {
    logger.info(`DEBUG: Extracted ${data.length} items for ${parameterName}`);
    if (data.length > 0) {
      logger.info(`DEBUG: First item example: ${JSON.stringify(data[0])}`);
    }
  }

  return data;
}

/**
 * Processes billing calculations based on hierarchical price list and usage data
 */
export function calculateBilling(
  this: IExecuteFunctions,
  items: INodeExecutionData[],
  inputDataConfig: InputDataConfig,
  matchConfig: MatchConfig,
  calculationConfig: CalculationConfig,
  outputConfig: OutputConfig,
): INodeExecutionData[] {
  // Destructure input config
  const { priceListFieldName, usageDataFieldName, hierarchyConfigFieldName } = inputDataConfig;

  this.logger.info(
    `DEBUG: Input field names - priceList: ${JSON.stringify(priceListFieldName)}, usageData: ${JSON.stringify(usageDataFieldName)}, hierarchyConfig: ${JSON.stringify(hierarchyConfigFieldName)}`,
  );

  // Get input from the first item (assuming single item workflow)
  const inputData = items[0].json as IDataObject;

  // Get price list data using helper function
  const priceListData = extractDataFromParameter(
    priceListFieldName as string | IDataObject,
    inputData,
    'priceList',
    'price list data',
    this.logger,
  );

  if (!priceListData || !Array.isArray(priceListData) || priceListData.length === 0) {
    throw new NodeOperationError(
      this.getNode(),
      'Price list data not found or is empty. Please check your price list configuration. Make sure the price list field name is correct or the parameter contains valid price data.',
    );
  }

  // Get usage data using helper function
  const usageData = extractDataFromParameter(
    usageDataFieldName as string | IDataObject,
    inputData,
    'usageData',
    'usage data',
    this.logger,
  );

  if (!usageData || !Array.isArray(usageData) || usageData.length === 0) {
    throw new NodeOperationError(
      this.getNode(),
      'Usage data not found or is empty. Please check your usage data configuration. Make sure the usage data field name is correct or the parameter contains valid usage records.',
    );
  }

  // Get hierarchy configuration
  this.logger.info(
    `DEBUG: Checking for hierarchy config in: ${JSON.stringify(hierarchyConfigFieldName) || ''}`,
  );
  let hierarchyConfigData = null;

  // Try to get hierarchy configuration data
  if (hierarchyConfigFieldName && typeof hierarchyConfigFieldName === 'string') {
    // Standard case - look up by field name
    hierarchyConfigData = inputData[hierarchyConfigFieldName];
    this.logger.info(`DEBUG: Looking up hierarchy using field name: ${hierarchyConfigFieldName}`);
  } else if (hierarchyConfigFieldName && typeof hierarchyConfigFieldName === 'object') {
    // If hierarchyConfigFieldName is an object, it might be the hierarchy config itself
    this.logger.info(
      `DEBUG: hierarchyConfigFieldName is an object: ${JSON.stringify(hierarchyConfigFieldName)}`,
    );

    // Check if the object itself is a valid hierarchy configuration
    if ('levels' in (hierarchyConfigFieldName as IDataObject)) {
      hierarchyConfigData = hierarchyConfigFieldName;
      this.logger.info('DEBUG: Using hierarchyConfigFieldName directly as it contains levels');
    }
    // Check if it contains a hierarchyConfig property (standard format)
    else if (
      'hierarchyConfig' in (hierarchyConfigFieldName as IDataObject) &&
      (hierarchyConfigFieldName as IDataObject).hierarchyConfig !== null
    ) {
      hierarchyConfigData = (hierarchyConfigFieldName as IDataObject).hierarchyConfig;
      this.logger.info(
        'DEBUG: Using hierarchyConfig property from hierarchyConfigFieldName object',
      );
    }
    // If it has a name property, try using that as a field name
    else if ('name' in (hierarchyConfigFieldName as IDataObject)) {
      const fieldName = (hierarchyConfigFieldName as IDataObject).name as string;
      hierarchyConfigData = inputData[fieldName];
      this.logger.info(`DEBUG: Using name property as field name: ${fieldName}`);
    }
  } else {
    // Default to 'hierarchyConfig' if not specified
    hierarchyConfigData = inputData.hierarchyConfig;
    this.logger.info('DEBUG: Using default field name: hierarchyConfig');

    // If not found, try common alternative field names
    if (!hierarchyConfigData) {
      const commonHierarchyFields = ['hierarchy', 'hierarchyLevels'];
      for (const field of commonHierarchyFields) {
        if (inputData[field]) {
          hierarchyConfigData = inputData[field];
          this.logger.info(`DEBUG: Found hierarchy data in common field: ${field}`);
          break;
        }
      }
    }
  }

  if (!hierarchyConfigData) {
    throw new NodeOperationError(
      this.getNode(),
      `Hierarchy configuration not found. Parameter value: ${JSON.stringify(hierarchyConfigFieldName)}. Please check that either the field name is correct or the provided object contains valid hierarchy levels.`,
    );
  }

  this.logger.info(`DEBUG: Found hierarchy data: ${JSON.stringify(hierarchyConfigData)}`);

  // Extract hierarchy levels from the shared configuration
  let hierarchyLevels: HierarchyLevel[] = [];

  // Use the helper function to extract hierarchy levels regardless of format
  hierarchyLevels = extractHierarchyLevels(hierarchyConfigData as IDataObject, this.logger);

  if (!hierarchyLevels || hierarchyLevels.length === 0) {
    this.logger.info(
      `DEBUG: Failed to extract hierarchy levels from: ${JSON.stringify(hierarchyConfigData)}`,
    );
    throw new NodeOperationError(
      this.getNode(),
      `No hierarchy levels found in the configuration from field "${hierarchyConfigFieldName}". The hierarchy structure may be invalid.`,
    );
  }

  this.logger.info(`DEBUG: Successfully extracted ${hierarchyLevels.length} hierarchy levels`);

  // Log each level for debugging
  hierarchyLevels.forEach((level, index) => {
    this.logger.info(
      `DEBUG: Level ${index + 1}: identifierField=${level.identifierField}, outputField=${level.outputField || '(same)'}`,
    );
  });

  // Destructure calculation configuration
  const { calculationMethod } = calculationConfig;
  const priceField = calculationMethod?.priceField || 'unitPrice';
  const quantityField = calculationMethod?.quantityField || 'usage';

  // Resolve field mappings and defaults
  const fieldMappings: FieldMapping = {
    priceField,
    quantityField,
    outputFields: [],
  };

  // Process each usage record
  const processedItems: IDataObject[] = [];
  const errorItems: IDataObject[] = [];
  let skippedItems = 0;

  this.logger.info(
    `DEBUG: Processing ${usageData.length} usage records with ${priceListData.length} price list items`,
  );

  for (const usage of usageData) {
    try {
      const result = processBillingRecord(
        usage,
        priceListData,
        hierarchyLevels,
        fieldMappings,
        matchConfig,
        multiplyWithPrecision,
        this.logger,
      );
      if (result) {
        processedItems.push(result);
      } else {
        skippedItems++;
      }
    } catch (error) {
      if (matchConfig.noMatchBehavior === 'error') {
        throw error;
      }
      // Add error information to the record and include in errorItems
      errorItems.push({
        ...usage,
        error: (error as Error).message,
      });
    }
  }

  this.logger.info(
    `DEBUG: Processing complete - successful: ${processedItems.length}, errors: ${errorItems.length}, skipped: ${skippedItems}`,
  );

  // Prepare the output based on the output config
  const result: INodeExecutionData[] = [];
  const summary = {
    totalProcessed: usageData.length,
    successfulItems: processedItems.length,
    errorItems: errorItems.length,
    skippedItems,
  };

  // Create the output object with processing summary
  const outputData: IDataObject = {
    processingDate: new Date().toISOString(),
    billingSummary: summary,
  };

  // Add data arrays based on output config - always include billingItems regardless of outputConfig
  outputData.billingItems = processedItems;

  // Add error items if present
  if (errorItems.length > 0) {
    outputData.errorItems = errorItems;
  }

  // Add debug information
  outputData.debug = {
    priceListCount: priceListData.length,
    usageDataCount: usageData.length,
    hierarchyLevelsCount: hierarchyLevels.length,
  };

  // Add hierarchy configuration to the output
  outputData.hierarchyConfig = hierarchyConfigData;

  result.push({
    json: outputData,
  });

  return result;
}

/**
 * Helper function to find the best matching price item from the price list using hierarchical matching
 * This function works with a flat list of price items and uses hierarchical levels for matching
 */
function findHierarchicalMatchInFlatList(
  usageItem: IDataObject,
  priceList: IDataObject[],
  hierarchyLevels: HierarchyLevel[],
  matchConfig: MatchConfig,
): IDataObject | null {
  // If no hierarchy levels are defined, return null
  if (!hierarchyLevels || hierarchyLevels.length === 0) {
    throw new Error('Hierarchy configuration must include at least one level');
  }

  // Sort levels by priority (if provided) or use the order in the array
  const sortedLevels = [...hierarchyLevels].sort((a, b) => {
    const priorityA = a.priority ?? hierarchyLevels.indexOf(a);
    const priorityB = b.priority ?? hierarchyLevels.indexOf(b);
    return priorityA - priorityB;
  });

  // Create a lookup function that checks each level in priority order
  const matchFound = findMatchRecursive(usageItem, priceList, sortedLevels, 0, matchConfig);

  return matchFound;
}

// Recursive function to find matches at each hierarchy level
function findMatchRecursive(
  usageItem: IDataObject,
  priceList: IDataObject[],
  hierarchyLevels: HierarchyLevel[],
  levelIndex: number,
  matchConfig: MatchConfig,
): IDataObject | null {
  // If we've checked all levels, no match was found
  if (levelIndex >= hierarchyLevels.length) {
    return null;
  }

  // Get the current level
  const level = hierarchyLevels[levelIndex];
  const { identifierField } = level;

  // Get the value to match from the usage item
  const usageValue = usageItem[identifierField];

  // Find all price items that match at this level
  let matches = priceList.filter((priceItem) => {
    const priceValue = priceItem[identifierField];

    // Handle exact matching
    return priceValue === usageValue;
  });

  // If no matches at this level and we have a wildcard match pattern, try that
  if (matches.length === 0 && matchConfig.useWildcardMatching) {
    const wildcardValue = matchConfig.wildcardValue || '*';

    matches = priceList.filter((priceItem) => {
      const priceValue = priceItem[identifierField];
      return priceValue === wildcardValue;
    });
  }

  // If matches found at this level
  if (matches.length > 0) {
    // If this is the most specific level, return the best match
    if (levelIndex === hierarchyLevels.length - 1) {
      return matches[0]; // Return the first match at the lowest level
    }

    // Try to find a match at the next level
    const nextLevelMatch = findMatchRecursive(
      usageItem,
      matches,
      hierarchyLevels,
      levelIndex + 1,
      matchConfig,
    );

    // If a match is found at the next level, return it
    if (nextLevelMatch) {
      return nextLevelMatch;
    }

    // If no match at next level, return the current level match if fallback is enabled
    if (matchConfig.hierarchicalFallback) {
      return matches[0]; // Return the first match at this level
    }
  }

  // If no match at this level, try the next level
  return findMatchRecursive(usageItem, priceList, hierarchyLevels, levelIndex + 1, matchConfig);
}

/**
 * Apply field mappings from usage and price data to an output record
 */
function applyPriceAndUsageFieldMappings(
  output: IDataObject,
  usage: IDataObject,
  price: IDataObject,
  fieldMappings: FieldMapping,
): IDataObject {
  // Apply custom output field mappings
  if (Array.isArray(fieldMappings.outputFields)) {
    for (const mapping of fieldMappings.outputFields) {
      // If the mapping doesn't have both source and target, skip it
      if (!mapping.sourceField || !mapping.targetField) continue;

      // If a sourceObject is specified, get value from that object
      if (mapping.sourceObject) {
        if (mapping.sourceObject === 'usage') {
          output[mapping.targetField] = usage[mapping.sourceField];
        } else if (mapping.sourceObject === 'price') {
          output[mapping.targetField] = price[mapping.sourceField];
        }
        // Could add support for more source objects here
      } else {
        // Default behavior: look for field in both objects, prioritizing price
        output[mapping.targetField] =
          price[mapping.sourceField] !== undefined
            ? price[mapping.sourceField]
            : usage[mapping.sourceField];
      }
    }
  }

  return output;
}

/**
 * Process a single billing record
 */
function processBillingRecord(
  usage: IDataObject,
  priceList: IDataObject[],
  hierarchyLevels: HierarchyLevel[],
  fieldMappings: FieldMapping,
  matchConfig: MatchConfig,
  multiplyFn: (a: string | number, b: string | number) => string,
  logger?: IExecuteFunctions['logger'],
): IDataObject | null {
  try {
    // Log each processing step if logger is provided
    if (logger) {
      logger.info(`DEBUG: Processing usage record: ${JSON.stringify(usage)}`);
      logger.info(`DEBUG: Using ${hierarchyLevels.length} hierarchy levels for matching`);
    }

    // Find the matching price list item
    const matchedPrice = findHierarchicalMatchInFlatList(
      usage,
      priceList,
      hierarchyLevels,
      matchConfig,
    );

    // If no match was found, throw an error or return null based on configuration
    if (!matchedPrice) {
      if (matchConfig.noMatchBehavior === 'error') {
        throw new Error(`No matching price found for usage item: ${JSON.stringify(usage)}`);
      }
      // Skip this record if we're not throwing an error
      if (logger) {
        logger.info(
          `DEBUG: No matching price found for usage item, skipping: ${JSON.stringify(usage)}`,
        );
      }
      return null;
    }

    if (logger) {
      logger.info(`DEBUG: Found matching price: ${JSON.stringify(matchedPrice)}`);
    }

    // Get price and quantity values
    const priceValue = matchedPrice[fieldMappings.priceField];
    const quantityValue = usage[fieldMappings.quantityField];

    // Validate price and quantity
    if (priceValue === undefined || priceValue === null) {
      throw new Error(
        `Price field '${fieldMappings.priceField}' not found in price list item: ${JSON.stringify(matchedPrice)}`,
      );
    }

    if (quantityValue === undefined || quantityValue === null) {
      throw new Error(
        `Quantity field '${fieldMappings.quantityField}' not found in usage data: ${JSON.stringify(usage)}`,
      );
    }

    if (logger) {
      logger.info(`DEBUG: Calculating with price=${priceValue}, quantity=${quantityValue}`);
    }

    // Calculate billing amount
    const amount = multiplyFn(priceValue as string | number, quantityValue as string | number);

    // Create the output record
    const output: IDataObject = {
      price: priceValue,
      quantity: quantityValue,
      amount,
    };

    // Apply field mappings to the output
    const result = applyPriceAndUsageFieldMappings(output, usage, matchedPrice, fieldMappings);

    if (logger) {
      logger.info(`DEBUG: Produced billing record: ${JSON.stringify(result)}`);
    }

    return result;
  } catch (error) {
    if (logger) {
      logger.error(`ERROR processing record: ${(error as Error).message}`);
    }
    throw error;
  }
}
