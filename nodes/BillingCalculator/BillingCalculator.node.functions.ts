import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type {
  BillingRecord,
  MatchConfig,
  MatchResult,
  OutputConfig,
  PriceListItem,
  UsageRecord,
} from './interfaces/SchemaInterfaces';
import type { BatchProcessingOptions, BatchProgress, IDiagnosticInfo } from './utils';
import {
  findMatch,
  indexPriceList,
  inferSchemaFromExample,
  validateAll,
  calculateWithFormula,
  processBillingInBatches,
  LogLevel,
  log,
  createEmptyDiagnosticInfo,
  createDataFlowVisualization,
  createRecordDiagnostics,
} from './utils';

/**
 * Processes billing based on price list and usage data
 */
export async function processBilling(
  this: IExecuteFunctions,
  priceList: PriceListItem[],
  usageRecords: UsageRecord[],
  matchConfig: MatchConfig,
  outputConfig: OutputConfig,
  batchOptions?: BatchProcessingOptions,
): Promise<INodeExecutionData[]> {
  // Ensure matchConfig has all required properties for multi-key matching
  if (matchConfig.multiKeyMatch && (!matchConfig.priceListFields || !matchConfig.usageFields)) {
    matchConfig.priceListFields = matchConfig.priceListFields || [matchConfig.priceListField];
    matchConfig.usageFields = matchConfig.usageFields || [matchConfig.usageField];
  }

  // Get debugging options
  const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as IDataObject;
  const debuggingOptions = (advancedOptions.debugging as IDataObject) || {};

  // Set up logging level
  const logLevelStr = (debuggingOptions.logLevel as string) || 'ERROR';
  const logLevel = LogLevel[logLevelStr as keyof typeof LogLevel] || LogLevel.ERROR;

  // Set up diagnostic information collection
  const includeDiagnostics =
    debuggingOptions.includeMatchDetails === true ||
    debuggingOptions.includeFormulaDetails === true ||
    debuggingOptions.includeBatchStatistics === true ||
    debuggingOptions.includeDataFlowVisualization === true;

  // Create diagnostic container if needed
  const diagnosticInfo = includeDiagnostics ? createEmptyDiagnosticInfo() : undefined;

  // Log start of processing
  log.call(
    this,
    LogLevel.INFO,
    `Starting billing processing for ${usageRecords.length} usage records`,
    { matchConfig, outputConfig, batchOptions },
    { level: logLevel },
  );

  // Start timing if collecting statistics
  const startTime = Date.now();

  // Use batch processing if options are provided
  if (batchOptions?.enabled) {
    // Create progress reporting callback
    const onProgress = (progress: BatchProgress) => {
      try {
        // Access reportProgress using type assertion to avoid TypeScript errors
        // This is safe as n8n might add this property in newer versions
        const executeFunctions = this as unknown as {
          reportProgress?: (data: BatchProgress) => void;
        };
        if (typeof executeFunctions.reportProgress === 'function') {
          executeFunctions.reportProgress(progress);
        }

        // Log progress if appropriate
        if (logLevel >= LogLevel.INFO) {
          log.call(
            this,
            LogLevel.INFO,
            `Batch processing progress: ${progress.progress.toFixed(2)}% - ${progress.message}`,
            undefined,
            { level: logLevel },
          );
        }
      } catch (error) {
        // Suppress any errors from progress reporting
        // This ensures batch processing continues even if progress reporting fails
      }
    };

    // Use batch processing with the provided options and diagnostic collection
    const results = await processBillingInBatches(
      priceList,
      usageRecords,
      matchConfig,
      outputConfig,
      batchOptions,
      onProgress,
      diagnosticInfo,
      logLevel,
      this,
    );

    // Add diagnostic information to results if requested
    if (diagnosticInfo) {
      // Update batch statistics
      diagnosticInfo.batchStatistics.processingTimeMs = Date.now() - startTime;

      if (diagnosticInfo.batchStatistics.totalRecords > 0) {
        diagnosticInfo.batchStatistics.averageTimePerRecordMs =
          diagnosticInfo.batchStatistics.processingTimeMs /
          diagnosticInfo.batchStatistics.totalRecords;
      }

      // Add visualization if requested
      if (debuggingOptions.includeDataFlowVisualization === true) {
        const visualization = createDataFlowVisualization(diagnosticInfo);

        // Add visualization to the first result item
        if (results.length > 0) {
          results[0].json.debugInfo = { visualization };
        }
      }

      // Add individual diagnostics based on options
      if (debuggingOptions.includeMatchDetails === true) {
        for (const result of results) {
          result.json._debugMatchAttempts = diagnosticInfo.matchAttempts;
        }
      }

      if (debuggingOptions.includeFormulaDetails === true) {
        for (const result of results) {
          result.json._debugFormulaEvaluations = diagnosticInfo.formulaEvaluations;
        }
      }

      if (debuggingOptions.includeBatchStatistics === true) {
        for (const result of results) {
          result.json._debugBatchStatistics = diagnosticInfo.batchStatistics;
        }
      }
    }

    // Log completion
    log.call(
      this,
      LogLevel.INFO,
      `Completed batch processing of ${usageRecords.length} records in ${Date.now() - startTime}ms`,
      undefined,
      { level: logLevel },
    );

    return results;
  }

  // Fall back to traditional processing for smaller datasets or when batch processing is disabled
  const results: INodeExecutionData[] = [];
  const priceIndex = indexPriceList(priceList, matchConfig);

  // Initialize statistics if collecting them
  if (diagnosticInfo) {
    diagnosticInfo.batchStatistics.totalRecords = usageRecords.length;
  }

  // Log indexed price list
  log.call(this, LogLevel.DEBUG, `Indexed price list with ${priceList.length} items`, priceIndex, {
    level: logLevel,
  });

  for (const usageRecord of usageRecords) {
    // Update processed count
    if (diagnosticInfo) {
      diagnosticInfo.batchStatistics.processedRecords++;
    }

    // Log current record
    log.call(
      this,
      LogLevel.DEBUG,
      `Processing usage record ${diagnosticInfo?.batchStatistics.processedRecords || 0}/${
        usageRecords.length
      }`,
      usageRecord,
      { level: logLevel },
    );

    // Find match with diagnostic collection if enabled
    const match = findMatch(usageRecord, priceIndex, matchConfig);

    // Update statistics
    if (diagnosticInfo) {
      if (match.matched) {
        diagnosticInfo.batchStatistics.successfulMatches++;
      } else {
        diagnosticInfo.batchStatistics.failedMatches++;
      }
    }

    // Skip invalid matches based on configuration
    if (!match.matched) {
      if (matchConfig.defaultOnNoMatch === 'error') {
        const errorMsg = `No matching price list item found for usage record: ${JSON.stringify(
          usageRecord,
        )}`;
        log.call(this, LogLevel.ERROR, errorMsg, undefined, { level: logLevel });
        throw new Error(errorMsg);
      }
      if (matchConfig.defaultOnNoMatch === 'skip') {
        log.call(this, LogLevel.WARN, 'Skipping record with no match', usageRecord, {
          level: logLevel,
        });
        continue;
      }
    }

    // Process the match to generate billing record
    const billingRecord = processBillingRecord(
      usageRecord,
      match,
      outputConfig,
      diagnosticInfo,
      logLevel,
      this,
    );

    // Create record diagnostics if requested
    if (debuggingOptions.includeMatchDetails === true) {
      const recordDiagnostic = createRecordDiagnostics(usageRecord, match, matchConfig);
      billingRecord._debugRecordDiagnostic = recordDiagnostic;
    }

    results.push({
      json: billingRecord as IDataObject,
    });
  }

  // Add diagnostic information to results if requested
  if (diagnosticInfo) {
    // Update statistics
    diagnosticInfo.batchStatistics.processingTimeMs = Date.now() - startTime;

    if (diagnosticInfo.batchStatistics.totalRecords > 0) {
      diagnosticInfo.batchStatistics.averageTimePerRecordMs =
        diagnosticInfo.batchStatistics.processingTimeMs /
        diagnosticInfo.batchStatistics.totalRecords;
    }

    // Add visualization if requested
    if (debuggingOptions.includeDataFlowVisualization === true) {
      const visualization = createDataFlowVisualization(diagnosticInfo);

      // Add visualization to the first result item
      if (results.length > 0) {
        results[0].json.debugInfo = { visualization };
      }
    }

    // Add individual diagnostics based on options
    if (debuggingOptions.includeMatchDetails === true) {
      for (const result of results) {
        result.json._debugMatchAttempts = diagnosticInfo.matchAttempts;
      }
    }

    if (debuggingOptions.includeFormulaDetails === true) {
      for (const result of results) {
        result.json._debugFormulaEvaluations = diagnosticInfo.formulaEvaluations;
      }
    }

    if (debuggingOptions.includeBatchStatistics === true) {
      for (const result of results) {
        result.json._debugBatchStatistics = diagnosticInfo.batchStatistics;
      }
    }
  }

  // Log completion
  log.call(
    this,
    LogLevel.INFO,
    `Completed processing of ${usageRecords.length} records in ${Date.now() - startTime}ms`,
    undefined,
    { level: logLevel },
  );

  return results;
}

/**
 * Processes a single billing record based on usage data and matched price item
 */
export function processBillingRecord(
  usageRecord: UsageRecord,
  match: MatchResult,
  outputConfig: OutputConfig,
  diagnosticInfo?: IDiagnosticInfo,
  logLevel: LogLevel = LogLevel.NONE,
  execFunctions?: IExecuteFunctions,
): BillingRecord {
  const billingRecord: BillingRecord = {};
  const priceItem = match.matched ? match.matchedItems[0] : {};

  // Process each output field
  for (const field of outputConfig.fields) {
    if (field.sourceType === 'usage' && field.sourceField) {
      // Copy from usage record
      billingRecord[field.name] = usageRecord[field.sourceField];
    } else if (field.sourceType === 'price' && field.sourceField && match.matched) {
      // Copy from price list item
      billingRecord[field.name] = priceItem[field.sourceField];
    } else if (field.sourceType === 'calculated' && field.formula) {
      // Calculate based on formula with diagnostics
      try {
        billingRecord[field.name] = calculateField(
          usageRecord,
          priceItem,
          field.formula,
          diagnosticInfo,
          logLevel,
          execFunctions,
        );
      } catch (error) {
        if (logLevel >= LogLevel.ERROR && execFunctions) {
          log.call(
            execFunctions,
            LogLevel.ERROR,
            `Error calculating field ${field.name} with formula ${field.formula}`,
            { error, usageRecord, priceItem },
            { level: logLevel },
          );
        }

        // Set error message instead of throwing to continue processing
        billingRecord[field.name] = `ERROR: ${(error as Error).message}`;
      }
    }
  }

  return billingRecord;
}

/**
 * Calculates a field value based on a formula
 */
export function calculateField(
  usageRecord: UsageRecord,
  priceItem: PriceListItem,
  formula: string,
  diagnosticInfo?: IDiagnosticInfo,
  logLevel: LogLevel = LogLevel.NONE,
  execFunctions?: IExecuteFunctions,
): number | string | boolean {
  if (logLevel >= LogLevel.DEBUG && execFunctions) {
    log.call(
      execFunctions,
      LogLevel.DEBUG,
      `Calculating field with formula: ${formula}`,
      { usageRecord, priceItem },
      { level: logLevel },
    );
  }

  try {
    // Use the formula evaluation utility with diagnostic collection
    const result = calculateWithFormula(formula, usageRecord, priceItem, diagnosticInfo);

    if (logLevel >= LogLevel.DEBUG && execFunctions) {
      log.call(
        execFunctions,
        LogLevel.DEBUG,
        `Formula result: ${result}`,
        { formula, result },
        { level: logLevel },
      );
    }

    return result;
  } catch (error) {
    if (logLevel >= LogLevel.ERROR && execFunctions) {
      log.call(
        execFunctions,
        LogLevel.ERROR,
        `Formula evaluation failed: ${(error as Error).message}`,
        { formula, error },
        { level: logLevel },
      );
    }

    throw error;
  }
}

/**
 * Validates configuration without processing actual billing
 */
export async function validateConfiguration(
  this: IExecuteFunctions,
  priceListExample: IDataObject,
  usageExample: IDataObject,
  outputExample: IDataObject,
  matchConfig: MatchConfig,
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

  // Format the validation result as node output
  return [
    {
      json: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        priceListSchema,
        usageSchema,
        outputSchema,
        multiKeyMatch: matchConfig.multiKeyMatch,
      } as IDataObject,
    },
  ];
}
