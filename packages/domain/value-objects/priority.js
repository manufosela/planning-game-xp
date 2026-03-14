/**
 * Priority value object — calculate and validate task priority.
 *
 * Priority = (businessPoints / devPoints) * 100
 * Higher value = higher priority.
 */

/**
 * Validate that a points value is a valid integer in the 1-5 range.
 * @param {unknown} points
 * @returns {boolean}
 */
export function validatePoints(points) {
  return (
    typeof points === 'number' &&
    Number.isInteger(points) &&
    points >= 1 &&
    points <= 5
  );
}

/**
 * Calculate priority from dev and business points.
 * @param {number} devPoints - Technical effort (1-5)
 * @param {number} businessPoints - Business value (1-5)
 * @returns {number} Priority score
 */
export function calculate(devPoints, businessPoints) {
  if (!validatePoints(devPoints)) {
    throw new Error(`Invalid devPoints: ${devPoints}. Must be an integer between 1 and 5.`);
  }
  if (!validatePoints(businessPoints)) {
    throw new Error(`Invalid businessPoints: ${businessPoints}. Must be an integer between 1 and 5.`);
  }
  return (businessPoints / devPoints) * 100;
}
