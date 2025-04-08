import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type {
  BillingRecord,
  MatchConfig,
  MatchResult,
  OutputConfig,
  PriceListItem,
  UsageRecord,
  BillingProcessorOptions,
  ProgressCallback,
} from '../interfaces';
import {
  findMatch,
  indexPriceList,
  LogLevel,
  log,
  createEmptyDiagnosticInfo,
  createDataFlowVisualization,
  processBillingInBatches,
} from '../utils';
import type { IDiagnosticInfo } from '../utils';
import { calculateField } from './FormulaProcessor';

/**
 * Processes billing based on price list and usage data
 */
export async function processBilling(
  this: IExecuteFunctions,
  priceList: PriceListItem[],
  usageRecords: UsageRecord[],
  matchConfig: MatchConfig,
  outputConfig: OutputConfig,
  options?: BillingProcessorOptions,
): Promise<INodeExecutionData[]> {
  // Ensure matchConfig has all required properties for multi-key matching
  if (matchConfig.multiKeyMatch && (!matchConfig.priceListFields || !matchConfig.usageFields)) {
    matchConfig.priceListFields = matchConfig.priceListFields || [matchConfig.priceListField];
    matchConfig.usageFields = matchConfig.usageFields || [matchConfig.usageField];
  }

  // Get options with defaults
  const batchOptions = options?.batchOptions;
  const logLevel = options?.logLevel || LogLevel.ERROR;
  const includeDiagnostics = options?.includeDiagnostics || false;

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
    const onProgress: ProgressCallback = (progress) => {
      try {
        // Access reportProgress using type assertion to avoid TypeScript errors
        // This is safe as n8n might add this property in newer versions
        const executeFunctions = this as unknown as {
          reportProgress?: (data: typeof progress) => void;
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
      if (options?.includeDiagnostics) {
        const visualization = createDataFlowVisualization(diagnosticInfo);

        // Add visualization to the first result item
        if (results.length > 0) {
          results[0].json.debugInfo = { visualization };
        }
      }

      // Process diagnostic information based on options
      if (options?.includeDiagnostics) {
        for (const result of results) {
          result.json._debugMatchAttempts = diagnosticInfo.matchAttempts;
          result.json._debugFormulaEvaluations = diagnosticInfo.formulaEvaluations;
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

    // Process the billing record
    const billingRecord = processBillingRecord(
      usageRecord,
      match,
      outputConfig,
      diagnosticInfo,
      logLevel,
      this,
    );

    // Create a node execution data item with the result
    results.push({
      json: billingRecord as IDataObject,
    });
  }

  // Add diagnostics to results if needed
  if (diagnosticInfo && options?.includeDiagnostics) {
    // Update timing statistics
    diagnosticInfo.batchStatistics.processingTimeMs = Date.now() - startTime;

    if (diagnosticInfo.batchStatistics.totalRecords > 0) {
      diagnosticInfo.batchStatistics.averageTimePerRecordMs =
        diagnosticInfo.batchStatistics.processingTimeMs /
        diagnosticInfo.batchStatistics.totalRecords;
    }

    // Add to output
    if (results.length > 0) {
      results[0].json._debugDiagnostics = diagnosticInfo;
    }
  }

  return results;
}

/**
 * Processes a single billing record by applying the output configuration
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
        billingRecord[field.name] = calculateField(usageRecord, priceItem, field.formula, {
          diagnosticInfo,
          logLevel,
          execFunctions,
        });
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
