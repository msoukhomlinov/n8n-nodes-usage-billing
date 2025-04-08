import Decimal from 'decimal.js';

/**
 * Perform financially accurate multiplication
 */
export function multiply(a: number | string, b: number | string): number {
  return new Decimal(a).times(new Decimal(b)).toNumber();
}

/**
 * Perform financially accurate addition
 */
export function add(a: number | string, b: number | string): number {
  return new Decimal(a).plus(new Decimal(b)).toNumber();
}

/**
 * Perform financially accurate subtraction
 */
export function subtract(a: number | string, b: number | string): number {
  return new Decimal(a).minus(new Decimal(b)).toNumber();
}

/**
 * Perform financially accurate division
 */
export function divide(a: number | string, b: number | string): number {
  // Prevent division by zero
  if (new Decimal(b).isZero()) {
    throw new Error('Division by zero');
  }
  return new Decimal(a).dividedBy(new Decimal(b)).toNumber();
}

/**
 * Calculate percentage
 */
export function percentage(value: number | string, percent: number | string): number {
  const percentDecimal = divide(percent, 100);
  return multiply(value, percentDecimal);
}

/**
 * Round to specified number of decimal places
 */
export function round(value: number | string, decimalPlaces: number = 2): number {
  return new Decimal(value).toDecimalPlaces(decimalPlaces).toNumber();
}

/**
 * Calculate basic billing
 * Supports quantity * price with proper decimal precision
 */
export function calculateBasicBilling(quantity: number | string, price: number | string): number {
  return round(multiply(quantity, price), 2);
}

/**
 * Calculate tiered billing (simplified version)
 * This assumes a simple tiering structure where the entire quantity is billed at
 * the appropriate tier rate based on the quantity.
 *
 * @param quantity - The quantity to bill
 * @param tiers - Array of {threshold, rate} objects, sorted by threshold ascending
 */
export function calculateTieredBilling(
  quantity: number | string,
  tiers: Array<{ threshold: number; rate: number }>,
): number {
  const quantityDecimal = new Decimal(quantity);

  // Find the applicable tier
  const tier = [...tiers]
    .sort((a, b) => b.threshold - a.threshold) // Sort descending by threshold
    .find((tier) => quantityDecimal.greaterThanOrEqualTo(tier.threshold));

  if (!tier) {
    // If no tier matches, use the lowest tier
    const lowestTier = tiers.reduce(
      (lowest, current) => (current.threshold < lowest.threshold ? current : lowest),
      tiers[0],
    );
    return round(multiply(quantity, lowestTier.rate), 2);
  }

  return round(multiply(quantity, tier.rate), 2);
}

/**
 * Calculate graduated tiered billing
 * This calculates billing where each tier applies only to the quantity
 * within that tier's range.
 *
 * @param quantity - The quantity to bill
 * @param tiers - Array of {min, max, rate} objects, sorted by min ascending
 */
export function calculateGraduatedBilling(
  quantity: number | string,
  tiers: Array<{ min: number; max: number | null; rate: number }>,
): number {
  const quantityDecimal = new Decimal(quantity);
  let total = new Decimal(0);

  for (const tier of tiers) {
    const tierMin = new Decimal(tier.min);
    const tierMax = tier.max !== null ? new Decimal(tier.max) : null;

    // Skip tiers that don't apply
    if (quantityDecimal.lessThan(tierMin)) {
      continue;
    }

    // Calculate the quantity that falls in this tier
    let tierQuantity: Decimal;
    if (tierMax !== null && quantityDecimal.greaterThan(tierMax)) {
      // Quantity exceeds this tier's max, so use the full tier range
      tierQuantity = tierMax.minus(tierMin).plus(1);
    } else {
      // Quantity falls within or at the end of this tier
      tierQuantity = quantityDecimal.minus(tierMin).plus(1);
    }

    // Add the cost for this tier
    total = total.plus(tierQuantity.times(tier.rate));

    // If we've accounted for all quantity, we're done
    if (tierMax === null || quantityDecimal.lessThanOrEqualTo(tierMax)) {
      break;
    }
  }

  return round(total.toNumber(), 2);
}
