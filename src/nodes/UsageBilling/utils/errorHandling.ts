import { NodeOperationError } from 'n8n-workflow';
import type { CalculationConfig, MatchFieldPair, OutputFieldConfig } from '../interfaces';

// Configuration type for error context
export interface ErrorConfig {
  calculationConfig?: CalculationConfig;
  matchFields?: MatchFieldPair[];
  outputConfig?: OutputFieldConfig;
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
  INVALID_FIELD_NAME = 'INVALID_FIELD_NAME',

  // Processing errors
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Data errors
  EMPTY_DATASET = 'EMPTY_DATASET',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  // Price lookup specific errors
  INVALID_PRICE_LIST_FORMAT = 'INVALID_PRICE_LIST_FORMAT',
  INVALID_USAGE_DATA_FORMAT = 'INVALID_USAGE_DATA_FORMAT',
  MISSING_MATCH_FIELDS = 'MISSING_MATCH_FIELDS',
  MULTIPLE_MATCHES_FOUND = 'MULTIPLE_MATCHES_FOUND',
  NO_MATCH_FOUND = 'NO_MATCH_FOUND',

  // Customer-specific pricing errors
  MULTIPLE_CUSTOMER_MATCHES_FOUND = 'MULTIPLE_CUSTOMER_MATCHES_FOUND',
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

/**
 * Validates price list data structure for matchUsageAndCalculate operation
 */
export function validatePriceListStructure(priceList: unknown): {
  valid: boolean;
  error?: StandardizedError;
} {
  // Check if price list exists
  if (!priceList) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.INVALID_PRICE_LIST_FORMAT,
        'Price list data is missing',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Check that you have provided a price list in the input data',
            'Ensure the price list field name is correctly specified',
            'Verify that your price list data is properly formatted',
          ],
        },
      ),
    };
  }

  // Check if price list is an object and not an array
  if (typeof priceList !== 'object' || Array.isArray(priceList) || priceList === null) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.INVALID_PRICE_LIST_FORMAT,
        'Price list must be a single object, not an array of price items',
        ErrorCategory.INPUT_ERROR,
        {
          context: {
            receivedType: typeof priceList,
            isArray: Array.isArray(priceList),
            valuePreview: JSON.stringify(priceList).slice(0, 100),
          },
          suggestions: [
            'Ensure your price list is formatted as a single object, not an array',
            'If you have multiple price items, use a single object with properties',
            'Check the structure of your price list data',
          ],
        },
      ),
    };
  }

  // Check if price list is empty
  if (Object.keys(priceList as object).length === 0) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.EMPTY_DATASET,
        'Price list is empty',
        ErrorCategory.DATA_ERROR,
        {
          suggestions: [
            'Ensure your price list contains at least one property',
            'Check that your price list data is being correctly loaded',
          ],
        },
      ),
    };
  }

  // Price list is valid
  return { valid: true };
}

/**
 * Validates usage data structure for matchUsageAndCalculate operation
 */
export function validateUsageDataStructure(usageData: unknown): {
  valid: boolean;
  error?: StandardizedError;
} {
  // Check if usage data exists
  if (!usageData) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.INVALID_USAGE_DATA_FORMAT,
        'Usage data is missing',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Check that you have provided usage data in the input',
            'Ensure the usage data field name is correctly specified',
            'Verify that your usage data is properly formatted',
          ],
        },
      ),
    };
  }

  // Check if usage data is an object
  if (typeof usageData !== 'object' || usageData === null) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.INVALID_USAGE_DATA_FORMAT,
        'Usage data must be an object',
        ErrorCategory.INPUT_ERROR,
        {
          context: {
            receivedType: typeof usageData,
            valuePreview: JSON.stringify(usageData).slice(0, 100),
          },
          suggestions: [
            'Ensure your usage data is formatted as an object',
            'Check the structure of your usage data',
          ],
        },
      ),
    };
  }

  // Check if usage data has items (either directly as properties or as an array)
  if (Array.isArray(usageData)) {
    if (usageData.length === 0) {
      return {
        valid: false,
        error: createStandardizedError(
          ErrorCode.EMPTY_DATASET,
          'Usage data array is empty',
          ErrorCategory.DATA_ERROR,
          {
            suggestions: [
              'Ensure your usage data contains at least one record',
              'Check that your usage data is being correctly loaded',
            ],
          },
        ),
      };
    }
  } else if (Object.keys(usageData).length === 0) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.EMPTY_DATASET,
        'Usage data object is empty',
        ErrorCategory.DATA_ERROR,
        {
          suggestions: [
            'Ensure your usage data object contains at least one property',
            'Check that your usage data is being correctly loaded',
          ],
        },
      ),
    };
  }

  // Usage data is valid
  return { valid: true };
}

/**
 * Validates match fields configuration for matchUsageAndCalculate operation
 */
export function validateMatchFields(matchFields: MatchFieldPair[]): {
  valid: boolean;
  error?: StandardizedError;
} {
  // Check if match fields exist
  if (!matchFields || !Array.isArray(matchFields)) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.MISSING_MATCH_FIELDS,
        'Match fields are missing or invalid',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Ensure you have defined at least one match field pair',
            'Match fields should be configured as an array',
          ],
        },
      ),
    };
  }

  // Check if match fields array is empty
  if (matchFields.length === 0) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.MISSING_MATCH_FIELDS,
        'No match fields defined',
        ErrorCategory.INPUT_ERROR,
        {
          suggestions: [
            'Define at least one match field pair to link price list and usage data',
            'Each match field pair should specify a priceListField and usageField',
          ],
        },
      ),
    };
  }

  // Validate each match field pair has both priceListField and usageField
  const invalidFields = matchFields.filter((field) => !field.priceListField || !field.usageField);

  if (invalidFields.length > 0) {
    return {
      valid: false,
      error: createStandardizedError(
        ErrorCode.MISSING_MATCH_FIELDS,
        'One or more match field pairs are incomplete',
        ErrorCategory.INPUT_ERROR,
        {
          context: {
            invalidFields,
          },
          suggestions: [
            'Ensure each match field pair has both priceListField and usageField defined',
            'Check that field names are not empty strings',
          ],
        },
      ),
    };
  }

  // Match fields are valid
  return { valid: true };
}

/**
 * Creates a standardized error for unmatched records
 */
export function createUnmatchedRecordsError(
  unmatchedRecords: unknown[],
  matchReason: 'none' | 'multiple',
): StandardizedError {
  const errorCode =
    matchReason === 'none' ? ErrorCode.NO_MATCH_FOUND : ErrorCode.MULTIPLE_MATCHES_FOUND;
  const message =
    matchReason === 'none'
      ? `${unmatchedRecords.length} usage records have no matching price list items`
      : `${unmatchedRecords.length} usage records match multiple price list items`;

  const suggestions =
    matchReason === 'none'
      ? [
          'Check your match field values in both usage data and price list',
          'Ensure your price list contains entries for all expected match values',
          'Verify that the match fields are correctly specified',
        ]
      : [
          'Ensure each usage record matches exactly one price list item',
          'Review your price list for duplicate entries',
          'Consider adding more match fields to create unique matches',
        ];

  return createStandardizedError(errorCode, message, ErrorCategory.DATA_ERROR, {
    context: {
      recordCount: unmatchedRecords.length,
      sampleRecords: unmatchedRecords.slice(0, 3),
    },
    suggestions,
  });
}
