/**
 * Generic timestamp type for domain entities.
 * Adapters map this to their concrete implementation (e.g. Firebase Timestamp).
 */
export type Timestamp = {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
};
