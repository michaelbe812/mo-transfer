/**
 * Frontend-own type (no backend contract): desk state — used by feat-checkin and feat-history (siblings share via
 * the slice root). Backend data uses the generated DTOs of checkin-client directly, never a copy here.
 */
export interface DeskSummary {
  openArrivals: number;
}
