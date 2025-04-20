import { NodeOperationError } from 'n8n-workflow';
import type { CsvParsingConfig, ColumnFilterConfig } from '../interfaces';

// Configuration type for error context
export interface ErrorConfig {
  csvParsingConfig?: CsvParsingConfig;
  columnFilterConfig?: ColumnFilterConfig;
  [key: string]: unknown;
}

// Error categories
export enum ErrorCategory {
  INPUT_ERROR = 'INPUT_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  DATA_ERROR = 'DATA_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

// Error codes
export enum ErrorCode {
  // Input errors
  MISSING_CSV_DATA = 'MISSING_CSV_DATA',
  INVALID_CSV_FORMAT = 'INVALID_CSV_FORMAT',
  INVALID_FIELD_NAME = 'INVALID_FIELD_NAME',

  // Processing errors
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Data errors
  EMPTY_DATASET = 'EMPTY_DATASET',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Standard error structure
export interface StandardizedError {
  code: ErrorCode;
  message: string;
  category: ErrorCategory;
  context?: Record<string, unknown>;
  suggestions?: string[];
  timestamp: string;
  debug?: {
    errorType: string;
    trace?: string;
  };
}

/**
 * Creates a standardized error object
 */
export function createStandardizedError(
  code: ErrorCode,
  message: string,
  category: ErrorCategory,
  options?: {
    context?: Record<string, unknown>;
    suggestions?: string[];
    error?: Error;
    includeDebug?: boolean;
  },
): StandardizedError {
  const standardizedError: StandardizedError = {
    code,
    message,
    category,
    timestamp: new Date().toISOString(),
  };

  if (options?.context) {
    standardizedError.context = options.context;
  }

  if (options?.suggestions) {
    standardizedError.suggestions = options.suggestions;
  }

  // Include debug info if requested and an error is provided
  if (options?.includeDebug && options?.error) {
    standardizedError.debug = {
      errorType: options.error.name || 'Error',
      // Include only first 3 lines of stack trace to avoid overwhelming
      trace: options.error.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }

  return standardizedError;
}

/**
 * Detects error type and creates appropriate standardized error
 */
export function handleError(error: Error, config?: ErrorConfig): StandardizedError {
  // NodeOperationError from n8n is a special case
  if (error instanceof NodeOperationError) {
    // Handle specific error messages
    if (error.message.includes('CSV data is missing or invalid')) {
      const fieldName = error.message.match(/field "([^"]+)"/)?.[1] || '';

      return createStandardizedError(
        ErrorCode.MISSING_CSV_DATA,
        'Could not find CSV data in the specified field',
        ErrorCategory.INPUT_ERROR,
        {
          context: {
            fieldName,
            configuration: config,
          },
          suggestions: [
            `Check that the field "${fieldName}" exists in your input data`,
            'If the field name has spaces, ensure it matches exactly as shown in your data',
            'Try using a different field name that contains your CSV data',
            'Check if your incoming data actually contains CSV content',
          ],
          error,
          includeDebug: true,
        },
      );
    }

    if (error.message.includes('No data rows found in CSV')) {
      return createStandardizedError(
        ErrorCode.EMPTY_DATASET,
        'The CSV data was found but contains no data rows',
        ErrorCategory.DATA_ERROR,
        {
          context: { configuration: config },
          suggestions: [
            'Verify your CSV data contains valid content',
            'Check that your CSV has at least one data row (not just headers)',
            'Ensure the delimiter setting matches your CSV format',
          ],
          error,
          includeDebug: true,
        },
      );
    }

    if (error.message.includes('Failed to parse CSV data')) {
      return createStandardizedError(
        ErrorCode.PARSING_ERROR,
        'Could not parse the CSV data',
        ErrorCategory.PROCESSING_ERROR,
        {
          context: { configuration: config },
          suggestions: [
            'Check your CSV format for errors',
            'Verify the delimiter setting matches your CSV format',
            'Ensure your CSV has consistent columns across all rows',
          ],
          error,
          includeDebug: true,
        },
      );
    }

    // Handle other node operation errors
    return createStandardizedError(
      ErrorCode.PARSING_ERROR,
      error.message,
      ErrorCategory.PROCESSING_ERROR,
      {
        context: { configuration: config },
        error,
        includeDebug: true,
      },
    );
  }

  // Default unknown error
  return createStandardizedError(
    ErrorCode.UNKNOWN_ERROR,
    error.message || 'An unknown error occurred',
    ErrorCategory.SYSTEM_ERROR,
    {
      error,
      includeDebug: true,
      suggestions: [
        'Check your input data and configuration',
        'Review the node settings and ensure all required fields are specified correctly',
      ],
    },
  );
}

/**
 * Creates a standardized validation error for invalid price list items
 */
export function createValidationError(
  itemErrors: Array<{
    record: Record<string, unknown>;
    errors: string[];
  }>,
): StandardizedError {
  return createStandardizedError(
    ErrorCode.VALIDATION_ERROR,
    `${itemErrors.length} price list items failed validation`,
    ErrorCategory.DATA_ERROR,
    {
      context: {
        invalidRecords: itemErrors.map((item) => ({
          record: item.record,
          errors: item.errors,
        })),
        recordCount: itemErrors.length,
      },
      suggestions: [
        'Review the invalid records and fix the validation issues',
        'Ensure price values are valid numbers',
        'Check for required fields in your price list data',
      ],
    },
  );
}
