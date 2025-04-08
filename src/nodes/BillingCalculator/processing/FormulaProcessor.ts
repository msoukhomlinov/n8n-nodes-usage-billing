import type { PriceListItem, UsageRecord, FormulaProcessorOptions } from '../interfaces';
import { calculateWithFormula, LogLevel, log } from '../utils';

/**
 * Calculates a field value based on a formula
 */
export function calculateField(
  usageRecord: UsageRecord,
  priceItem: PriceListItem,
  formula: string,
  options?: FormulaProcessorOptions,
): number | string | boolean {
  const { diagnosticInfo, logLevel = LogLevel.NONE, execFunctions } = options || {};

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
