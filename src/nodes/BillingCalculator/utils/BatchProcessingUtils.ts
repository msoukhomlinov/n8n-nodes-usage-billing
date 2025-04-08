import type { INodeExecutionData } from 'n8n-workflow';
import type {
  MatchConfig,
  OutputConfig,
  PriceListItem,
  UsageRecord,
  MatchResult,
  BillingRecord,
} from '../interfaces/SchemaInterfaces';
import type { IDiagnosticInfo } from './DebugUtils';

// Define a type for the execution functions with log capability
interface IExecutionFunctionsWithLog {
  log?: (level: number, message: string, meta?: object) => void;
  getNode?: () => { name: string };
}

/**
 * Options for batch processing
 */
export interface BatchProcessingOptions {
  enabled: boolean;
  batchSize: number;
  reportProgress: boolean;
  onBatchError: 'stopAll' | 'skipBatch' | 'processIndividual';
  memoryOptimization?: {
    optimizeIndex: boolean;
  };
}

/**
 * Progress information for batch processing
 */
export interface BatchProgress {
  message: string;
  progress: number; // 0-100
}

/**
 * Default batch processing options
 */
export const DEFAULT_BATCH_OPTIONS: BatchProcessingOptions = {
  enabled: false,
  batchSize: 100,
  reportProgress: true,
  onBatchError: 'stopAll',
  memoryOptimization: {
    optimizeIndex: true,
  },
};

/**
 * Split an array into chunks of the specified size
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Creates an optimized price list index for faster lookups
 */
export function createOptimizedIndex(
  priceList: PriceListItem[],
  matchConfig: MatchConfig,
  outputConfig?: OutputConfig,
): PriceListItem[] {
  // This is a placeholder for Phase 3 optimization
  // In Phase 3, we'll implement a more sophisticated indexing mechanism
  return priceList;
}

/**
 * Process billing in batches for improved performance with large datasets
 */
export async function processBillingInBatches(
  priceList: PriceListItem[],
  usageRecords: UsageRecord[],
  matchConfig: MatchConfig,
  outputConfig: OutputConfig,
  options: BatchProcessingOptions = DEFAULT_BATCH_OPTIONS,
  onProgress?: (progress: BatchProgress) => void,
  diagnosticInfo?: IDiagnosticInfo,
  logLevel?: number,
  execFunctions?: IExecutionFunctionsWithLog,
): Promise<INodeExecutionData[]> {
  // Skip processing if there are no records
  if (!usageRecords.length) {
    return [];
  }

  const batchSize = options.batchSize || DEFAULT_BATCH_OPTIONS.batchSize;
  const chunks = chunkArray(usageRecords, batchSize);
  const results: INodeExecutionData[] = [];

  // Update diagnostic info with total records if available
  if (diagnosticInfo) {
    diagnosticInfo.batchStatistics.totalRecords = usageRecords.length;
  }

  // Create an optimized price list index for improved lookup performance
  const priceIndex = options.memoryOptimization?.optimizeIndex
    ? createOptimizedIndex(priceList, matchConfig, outputConfig)
    : priceList;

  // Log the start of batch processing
  if (logLevel && logLevel >= 3 && execFunctions && execFunctions.log) {
    execFunctions.log(
      logLevel,
      `Starting batch processing of ${usageRecords.length} records in ${chunks.length} batches`,
      { batchSize, options },
    );
  }

  // Process each batch
  let processedRecords = 0;
  let batchIndex = 0;

  for (const chunk of chunks) {
    try {
      // Report progress
      if (options.reportProgress && onProgress) {
        const progress = (processedRecords / usageRecords.length) * 100;
        onProgress({
          message: `Processing batch ${batchIndex + 1}/${chunks.length} (${processedRecords}/${
            usageRecords.length
          } records)`,
          progress,
        });
      }

      // Log batch processing start
      if (logLevel && logLevel >= 4 && execFunctions && execFunctions.log) {
        execFunctions.log(logLevel, `Processing batch ${batchIndex + 1}/${chunks.length}`, {
          batchSize: chunk.length,
          batchIndex,
        });
      }

      // Process the current batch
      const batchStartTime = Date.now();

      for (const usageRecord of chunk) {
        // Update processed count in diagnostic info if available
        if (diagnosticInfo) {
          diagnosticInfo.batchStatistics.processedRecords++;
        }

        // Find match with diagnostic collection if enabled
        const match =
          typeof matchConfig.findMatch === 'function'
            ? matchConfig.findMatch(
                usageRecord,
                priceIndex,
                matchConfig,
                diagnosticInfo,
                logLevel,
                execFunctions,
              )
            : findMatch(
                usageRecord,
                priceIndex,
                matchConfig,
                diagnosticInfo,
                logLevel,
                execFunctions,
              );

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
            throw new Error(
              `No matching price list item found for usage record: ${JSON.stringify(usageRecord)}`,
            );
          }
          if (matchConfig.defaultOnNoMatch === 'skip') {
            continue;
          }
        }

        // Process the match to generate billing record
        const billingRecord = processBillingRecord
          ? processBillingRecord(
              usageRecord,
              match,
              outputConfig,
              diagnosticInfo,
              logLevel,
              execFunctions,
            )
          : {
              ...usageRecord,
              ...(match.matched ? match.matchedItems[0] : {}),
            };

        results.push({
          json: billingRecord,
        });
      }

      // Log batch completion
      if (logLevel && logLevel >= 4 && execFunctions && execFunctions.log) {
        execFunctions.log(
          logLevel,
          `Completed batch ${batchIndex + 1}/${chunks.length} in ${Date.now() - batchStartTime}ms`,
          { recordsProcessed: chunk.length },
        );
      }

      // Update progress
      processedRecords += chunk.length;
      batchIndex++;
    } catch (error: unknown) {
      const err = error as Error;

      // Log the error
      if (logLevel && logLevel >= 1 && execFunctions && execFunctions.log) {
        execFunctions.log(
          1, // ERROR level
          `Error processing batch ${batchIndex + 1}: ${err.message}`,
          { error: err, batchIndex },
        );
      }

      // Handle the error based on the configured strategy
      if (options.onBatchError === 'stopAll') {
        throw err;
      }

      if (options.onBatchError === 'skipBatch') {
        // Skip this batch and continue with the next one
        processedRecords += chunk.length;
        batchIndex++;
        continue;
      }

      if (options.onBatchError === 'processIndividual') {
        // Process records individually
        for (const usageRecord of chunk) {
          try {
            // Find match
            const match =
              typeof matchConfig.findMatch === 'function'
                ? matchConfig.findMatch(usageRecord, priceIndex, matchConfig)
                : findMatch(usageRecord, priceIndex, matchConfig);

            // Skip invalid matches based on configuration
            if (!match.matched) {
              if (
                matchConfig.defaultOnNoMatch === 'error' ||
                matchConfig.defaultOnNoMatch === 'skip'
              ) {
                // Skip this record and continue with the next one
                continue;
              }
            }

            // Process the match to generate billing record
            const billingRecord = processBillingRecord
              ? processBillingRecord(usageRecord, match, outputConfig)
              : {
                  ...usageRecord,
                  ...(match.matched ? match.matchedItems[0] : {}),
                };

            results.push({
              json: billingRecord,
            });
          } catch (recordError: unknown) {
            // Use unknown type for type-safety in catch clauses
            const error = recordError as Error;

            // Log individual record error
            if (logLevel && logLevel >= 2 && execFunctions && execFunctions.log) {
              execFunctions.log(
                2, // WARN level
                `Error processing individual record: ${error.message}`,
                { error, usageRecord },
              );
            }
          }
        }

        processedRecords += chunk.length;
        batchIndex++;
      }
    }
  }

  // Report final progress
  if (options.reportProgress && onProgress) {
    onProgress({
      message: `Processing complete. Processed ${processedRecords}/${usageRecords.length} records`,
      progress: 100,
    });
  }

  // Log completion
  if (logLevel && logLevel >= 3 && execFunctions && execFunctions.log) {
    execFunctions.log(
      logLevel,
      `Completed batch processing: ${processedRecords} records processed in ${chunks.length} batches`,
      { totalRecords: usageRecords.length, results: results.length },
    );
  }

  return results;
}

// Placeholder function to avoid reference errors
function findMatch(
  usageRecord: UsageRecord,
  priceIndex: Map<string, PriceListItem[]> | PriceListItem[],
  matchConfig: MatchConfig,
  diagnosticInfo?: IDiagnosticInfo,
  logLevel?: number,
  execFunctions?: IExecutionFunctionsWithLog,
): MatchResult {
  // This function should be imported from MatchingUtils
  // It's defined here to avoid circular imports
  return { matched: false, matchedItems: [], multipleMatches: false };
}

// Placeholder function to avoid reference errors
function processBillingRecord(
  usageRecord: UsageRecord,
  match: MatchResult,
  outputConfig: OutputConfig,
  diagnosticInfo?: IDiagnosticInfo,
  logLevel?: number,
  execFunctions?: IExecutionFunctionsWithLog,
): BillingRecord {
  // This function should be imported from somewhere else
  // It's defined here to avoid circular imports
  return { ...usageRecord, ...(match.matched ? match.matchedItems[0] : {}) };
}
