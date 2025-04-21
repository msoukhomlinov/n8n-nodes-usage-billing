/**
 * A simple logging utility for consistent output formatting and debug control
 *
 * Note: This is a standalone logger implementation that doesn't conflict with n8n's
 * built-in LoggerProxy. While n8n recommends using LoggerProxy for node development,
 * this simpler implementation works well for custom community nodes that need lightweight
 * logging without the additional complexity.
 *
 * If deeper integration with n8n logging is needed (e.g., log file output, advanced
 * log levels), consider switching to LoggerProxy from n8n-workflow.
 */

// Global debug flag to control detailed logging
// In a production environment, this would typically be false
export const DEBUG_ENABLED = false;

// Standard log prefix for easy identification in console
const LOG_PREFIX = '[UsageBilling]';

/**
 * Logger utility for standardised formatting and controlled debug output
 */
export const logger = {
  /**
   * Log debug message - only shown when DEBUG_ENABLED is true
   * @param message The message to log
   */
  debug: (message: string): void => {
    if (DEBUG_ENABLED) console.log(`[DEBUG] ${LOG_PREFIX} ${message}`);
  },

  /**
   * Log informational message - always shown
   * @param message The message to log
   */
  info: (message: string): void => {
    console.log(`[INFO] ${LOG_PREFIX} ${message}`);
  },

  /**
   * Log warning message - always shown
   * @param message The message to log
   */
  warn: (message: string): void => {
    console.warn(`[WARN] ${LOG_PREFIX} ${message}`);
  },

  /**
   * Log error message with optional Error object - always shown
   * @param message The message to log
   * @param error Optional Error object for stack trace
   */
  error: (message: string, error?: Error): void => {
    console.error(`[ERROR] ${LOG_PREFIX} ${message}`);
    if (error) console.error(error);
  },
};
