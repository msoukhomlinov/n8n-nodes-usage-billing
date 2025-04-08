import type { IExecuteFunctions } from 'n8n-workflow';
import type { BatchProcessingOptions, BatchProgress, IDiagnosticInfo, LogLevel } from '../utils';

/**
 * Interface for billing processor options
 */
export interface BillingProcessorOptions {
  /**
   * Configure batch processing
   */
  batchOptions?: BatchProcessingOptions;

  /**
   * The logging level to use
   */
  logLevel?: LogLevel;

  /**
   * Whether to include diagnostic information
   */
  includeDiagnostics?: boolean;

  /**
   * Reference to the execution functions
   */
  execFunctions?: IExecuteFunctions;
}

/**
 * Interface for formula processor options
 */
export interface FormulaProcessorOptions {
  /**
   * The logging level to use
   */
  logLevel?: LogLevel;

  /**
   * Collect diagnostic information
   */
  diagnosticInfo?: IDiagnosticInfo;

  /**
   * Reference to the execution functions
   */
  execFunctions?: IExecuteFunctions;
}

/**
 * Interface for the progress callback function
 */
export type ProgressCallback = (progress: BatchProgress) => void;

/**
 * Interface for configuration validation options
 */
export interface ValidationOptions {
  /**
   * Whether to include schema visualization
   */
  includeVisualization?: boolean;
}
