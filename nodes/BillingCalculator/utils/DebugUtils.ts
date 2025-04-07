import type {
  MatchResult,
  UsageRecord,
  MatchConfig,
  ResourceMapperMatchConfig,
} from '../interfaces/SchemaInterfaces';

/**
 * Logging level enumeration
 */
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

/**
 * Logging options
 */
export interface ILogOptions {
  level: LogLevel;
  includeTimestamp: boolean;
  includeNodeName: boolean;
}

/**
 * Default logging options
 */
export const DEFAULT_LOG_OPTIONS: ILogOptions = {
  level: LogLevel.ERROR,
  includeTimestamp: true,
  includeNodeName: true,
};

/**
 * Match attempt information for diagnostics
 */
export interface IMatchAttempt {
  usageRecord: Record<string, unknown>;
  matchFields: string[];
  matchValues: unknown[];
  priceListItem?: Record<string, unknown>;
  success: boolean;
  reason?: string;
}

/**
 * Formula evaluation step
 */
export interface IEvaluationStep {
  expression: string;
  result: unknown;
}

/**
 * Formula evaluation details
 */
export interface IFormulaEvaluation {
  formula: string;
  variables: Record<string, unknown>;
  steps: IEvaluationStep[];
  result: unknown;
  error?: string;
}

/**
 * Batch processing statistics
 */
export interface IBatchStatistics {
  totalRecords: number;
  processedRecords: number;
  successfulMatches: number;
  failedMatches: number;
  processingTimeMs: number;
  averageTimePerRecordMs: number;
}

/**
 * Complete diagnostic information
 */
export interface IDiagnosticInfo {
  matchAttempts: IMatchAttempt[];
  formulaEvaluations: IFormulaEvaluation[];
  batchStatistics: IBatchStatistics;
}

/**
 * Creates an empty diagnostic info object
 */
export function createEmptyDiagnosticInfo(): IDiagnosticInfo {
  return {
    matchAttempts: [],
    formulaEvaluations: [],
    batchStatistics: {
      totalRecords: 0,
      processedRecords: 0,
      successfulMatches: 0,
      failedMatches: 0,
      processingTimeMs: 0,
      averageTimePerRecordMs: 0,
    },
  };
}

/**
 * Log a message with the specified level
 */
export function log(
  this: { getNode?: () => { name: string } },
  level: LogLevel,
  message: string,
  data?: unknown,
  options: Partial<ILogOptions> = {},
): void {
  const logOptions = { ...DEFAULT_LOG_OPTIONS, ...options };

  // If the specified level is higher than the configured level, don't log
  if (level > logOptions.level) {
    return;
  }

  // Format the message with optional timestamp and node name
  let formattedMessage = '';

  if (logOptions.includeTimestamp) {
    formattedMessage += `[${new Date().toISOString()}] `;
  }

  if (logOptions.includeNodeName && this?.getNode) {
    formattedMessage += `[${this.getNode().name}] `;
  }

  // Add level prefix
  const levelPrefix = LogLevel[level] || 'LOG';
  formattedMessage += `[${levelPrefix}] ${message}`;

  // Log to console
  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage, data || '');
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage, data || '');
      break;
    case LogLevel.INFO:
      console.info(formattedMessage, data || '');
      break;
    case LogLevel.DEBUG:
      console.debug(formattedMessage, data || '');
      break;
    default:
      console.log(formattedMessage, data || '');
  }
}

/**
 * Record a match attempt for diagnostic purposes
 */
export function recordMatchAttempt(
  usageRecord: Record<string, unknown>,
  matchFields: string[],
  matchValues: unknown[],
  priceListItem?: Record<string, unknown>,
  success = false,
  reason?: string,
): IMatchAttempt {
  return {
    usageRecord: { ...usageRecord },
    matchFields,
    matchValues,
    priceListItem: priceListItem ? { ...priceListItem } : undefined,
    success,
    reason,
  };
}

/**
 * Record a formula evaluation for diagnostic purposes
 */
export function recordFormulaEvaluation(
  formula: string,
  variables: Record<string, unknown>,
  steps: IEvaluationStep[],
  result: unknown,
  error?: string,
): IFormulaEvaluation {
  return {
    formula,
    variables: { ...variables },
    steps,
    result,
    error,
  };
}

/**
 * Create a visualization of match attempts
 */
export function createMatchVisualization(matchAttempts: IMatchAttempt[]): string {
  if (matchAttempts.length === 0) {
    return '<p>No match attempts recorded.</p>';
  }

  let html =
    '<h3>Match Attempts</h3><table border="1" cellpadding="5" style="border-collapse: collapse;">';
  html +=
    '<tr><th>Usage Record</th><th>Match Fields</th><th>Match Values</th><th>Result</th><th>Reason</th></tr>';

  for (const attempt of matchAttempts) {
    const usageRecordStr = JSON.stringify(attempt.usageRecord);
    const fieldsStr = attempt.matchFields.join(', ');
    const valuesStr = attempt.matchValues.map((v) => JSON.stringify(v)).join(', ');
    const resultStr = attempt.success
      ? `✅ Matched: ${JSON.stringify(attempt.priceListItem)}`
      : '❌ Not matched';
    const reasonStr = attempt.reason || '';

    html += `<tr><td>${usageRecordStr}</td><td>${fieldsStr}</td><td>${valuesStr}</td><td>${resultStr}</td><td>${reasonStr}</td></tr>`;
  }

  html += '</table>';
  return html;
}

/**
 * Create a visualization of formula evaluations
 */
export function createFormulaVisualization(formulaEvaluations: IFormulaEvaluation[]): string {
  if (formulaEvaluations.length === 0) {
    return '<p>No formula evaluations recorded.</p>';
  }

  let html = '<h3>Formula Evaluations</h3>';

  for (const evaluation of formulaEvaluations) {
    html += `<div style="margin-bottom: 20px; border: 1px solid #ccc; padding: 10px;">`;
    html += `<div><strong>Formula:</strong> ${evaluation.formula}</div>`;
    html += `<div><strong>Variables:</strong> ${JSON.stringify(evaluation.variables)}</div>`;

    if (evaluation.steps.length > 0) {
      html += '<div><strong>Steps:</strong><ol>';
      for (const step of evaluation.steps) {
        html += `<li>${step.expression} = ${JSON.stringify(step.result)}</li>`;
      }
      html += '</ol></div>';
    }

    if (evaluation.error) {
      html += `<div style="color: red;"><strong>Error:</strong> ${evaluation.error}</div>`;
    } else {
      html += `<div><strong>Result:</strong> ${JSON.stringify(evaluation.result)}</div>`;
    }

    html += '</div>';
  }

  return html;
}

/**
 * Create a visualization of batch statistics
 */
export function createBatchStatisticsVisualization(batchStatistics: IBatchStatistics): string {
  let html = '<h3>Batch Processing Statistics</h3>';
  html += '<table border="1" cellpadding="5" style="border-collapse: collapse;">';
  html += '<tr><th>Metric</th><th>Value</th></tr>';

  html += `<tr><td>Total Records</td><td>${batchStatistics.totalRecords}</td></tr>`;
  html += `<tr><td>Processed Records</td><td>${batchStatistics.processedRecords}</td></tr>`;
  html += `<tr><td>Successful Matches</td><td>${batchStatistics.successfulMatches}</td></tr>`;
  html += `<tr><td>Failed Matches</td><td>${batchStatistics.failedMatches}</td></tr>`;
  html += `<tr><td>Processing Time (ms)</td><td>${batchStatistics.processingTimeMs}</td></tr>`;
  html += `<tr><td>Average Time per Record (ms)</td><td>${batchStatistics.averageTimePerRecordMs.toFixed(
    2,
  )}</td></tr>`;

  html += '</table>';
  return html;
}

/**
 * Create a comprehensive visualization of data flow
 */
export function createDataFlowVisualization(diagnosticInfo: IDiagnosticInfo): string {
  let html = '<h2>Billing Calculator Diagnostic Information</h2>';

  // Add batch statistics visualization
  html += createBatchStatisticsVisualization(diagnosticInfo.batchStatistics);

  // Add match visualization
  html += createMatchVisualization(diagnosticInfo.matchAttempts);

  // Add formula visualization
  html += createFormulaVisualization(diagnosticInfo.formulaEvaluations);

  return html;
}

/**
 * Create a diagnostic breakdown for single records
 */
export function createRecordDiagnostics(
  usageRecord: UsageRecord,
  match: MatchResult,
  matchConfig: MatchConfig | ResourceMapperMatchConfig,
): string {
  let html = '<h3>Record Diagnostic Information</h3>';

  // Usage record info
  html += '<h4>Usage Record</h4>';
  html += `<pre>${JSON.stringify(usageRecord, null, 2)}</pre>`;

  // Match configuration
  html += '<h4>Match Configuration</h4>';
  html += `<pre>${JSON.stringify(matchConfig, null, 2)}</pre>`;

  // Match result
  html += '<h4>Match Result</h4>';
  html += '<table border="1" cellpadding="5" style="border-collapse: collapse;">';
  html += `<tr><td>Match Found</td><td>${match.matched ? '✅ Yes' : '❌ No'}</td></tr>`;
  html += `<tr><td>Multiple Matches</td><td>${match.multipleMatches ? '⚠️ Yes' : 'No'}</td></tr>`;

  if (match.errorMessage) {
    html += `<tr><td>Error</td><td>${match.errorMessage}</td></tr>`;
  }

  html += '</table>';

  // Matched items
  if (match.matched && match.matchedItems.length > 0) {
    html += '<h4>Matched Price List Items</h4>';
    html += '<ol>';

    for (const item of match.matchedItems) {
      html += `<li><pre>${JSON.stringify(item, null, 2)}</pre></li>`;
    }

    html += '</ol>';
  }

  return html;
}
