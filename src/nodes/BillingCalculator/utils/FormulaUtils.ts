/**
 * Formula validation result
 */
export interface FormulaValidationResult {
  valid: boolean;
  error?: string;
  tokens?: string[];
}

/**
 * Formula evaluation result
 */
export interface FormulaEvaluationResult {
  success: boolean;
  value?: number | string | boolean;
  error?: string;
}

/**
 * Validates a formula for syntax errors
 */
export function validateFormula(formula: string): { valid: boolean; error?: string } {
  try {
    // Prepare and compile the formula to check for syntax errors
    const preparedFormula = prepareFormula(formula);
    compileFormula(preparedFormula);

    return { valid: true };
  } catch (error: unknown) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown formula validation error',
    };
  }
}

/**
 * Prepares a formula by replacing convenience shortcuts with their full notation
 */
export function prepareFormula(formula: string): string {
  // Replace shorthand usage with full notation
  let prepared = formula.replace(/\busage\b(?!\s*\.\s*[a-zA-Z_])/g, 'usage_record.usage');

  // Replace shorthand unitPrice with full notation
  prepared = prepared.replace(/\bunitPrice\b(?!\s*\.\s*[a-zA-Z_])/g, 'price.unitPrice');

  // Add more shortcuts as needed for Phase 3

  return prepared;
}

/**
 * Compiles a formula into a function for execution
 */
export function compileFormula(formula: string): (context: Record<string, unknown>) => unknown {
  try {
    // Create a function that takes a context object with variables
    // The context will contain all variables needed for evaluation
    return new Function(
      'context',
      `
      with(context) {
        try {
          return ${formula};
        } catch(e) {
          e.message = 'Error evaluating formula "${formula.replace(/"/g, '\\"')}": ' + e.message;
          throw e;
        }
      }
    `,
    ) as (context: Record<string, unknown>) => unknown;
  } catch (error: unknown) {
    throw new Error(
      `Error compiling formula "${formula}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Creates a simple multiplication formula (usage * price)
 */
export function createMultiplicationFormula(): string {
  return 'usage_record.usage * price.unitPrice';
}

/**
 * Calculates a value based on a formula and variables from usage and price list
 */
export function calculateWithFormula(
  formula: string,
  usageRecord: Record<string, unknown>,
  priceItem: Record<string, unknown>,
  diagnosticInfo?: {
    formulaEvaluations: {
      formula: string;
      variables: Record<string, unknown>;
      steps: { expression: string; result: unknown }[];
      result: unknown;
      error?: string;
    }[];
  },
): number | string | boolean {
  // Prepare variables
  const variables = prepareVariables(usageRecord, priceItem);

  // Create a record for diagnostic information if requested
  const evaluationSteps: { expression: string; result: unknown }[] = [];

  try {
    // Validate and prepare the formula
    const preparedFormula = prepareFormula(formula);

    if (diagnosticInfo) {
      evaluationSteps.push({
        expression: 'Prepared formula',
        result: preparedFormula,
      });
    }

    // Compile the formula
    const compiledFormula = compileFormula(preparedFormula);

    if (diagnosticInfo) {
      evaluationSteps.push({
        expression: 'Compiled formula',
        result: compiledFormula.toString(),
      });
    }

    // Evaluate the formula with variables
    const result = evaluateFormula(compiledFormula, variables, evaluationSteps);

    // Record the evaluation result for diagnostics if requested
    if (diagnosticInfo) {
      diagnosticInfo.formulaEvaluations.push({
        formula,
        variables: { ...variables },
        steps: evaluationSteps,
        result,
      });
    }

    return result as number | string | boolean;
  } catch (error: unknown) {
    // Record the evaluation error for diagnostics if requested
    if (diagnosticInfo) {
      diagnosticInfo.formulaEvaluations.push({
        formula,
        variables: { ...variables },
        steps: evaluationSteps,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error during formula evaluation',
      });
    }

    throw error;
  }
}

/**
 * Prepares variables for formula evaluation, flattening nested objects
 * and providing easy access to usage and price fields
 */
function prepareVariables(
  usageRecord: Record<string, unknown>,
  priceItem: Record<string, unknown>,
): Record<string, unknown> {
  const variables: Record<string, unknown> = {
    // Convenience variables
    usage: usageRecord.usage,
    unitPrice: priceItem.unitPrice,

    // Object access
    price: { ...priceItem },
    usage_record: { ...usageRecord },
  };

  return variables;
}

/**
 * Evaluates a compiled formula with the given variables
 */
export function evaluateFormula(
  compiledFormula: (context: Record<string, unknown>) => unknown,
  variables: Record<string, unknown>,
  evaluationSteps?: { expression: string; result: unknown }[],
): unknown {
  try {
    // Create a function context with the variables
    const context: Record<string, unknown> = { ...variables };

    // Common math functions
    context.Math = Math;
    context.min = Math.min;
    context.max = Math.max;
    context.round = Math.round;
    context.floor = Math.floor;
    context.ceil = Math.ceil;
    context.abs = Math.abs;

    // Custom utility functions
    context.isNull = (value: unknown) => value === null || value === undefined;
    context.ifNull = (value: unknown, defaultValue: unknown) =>
      value === null || value === undefined ? defaultValue : value;
    context.isNumber = (value: unknown) => typeof value === 'number' && !Number.isNaN(value);

    // Execute the formula
    const result = compiledFormula(context);

    // Record the evaluation step if requested
    if (evaluationSteps) {
      evaluationSteps.push({
        expression: 'Final evaluation',
        result,
      });
    }

    return result;
  } catch (error: unknown) {
    // Record the error step if requested
    if (evaluationSteps) {
      evaluationSteps.push({
        expression: 'Error',
        result: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
}
