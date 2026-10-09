/**
 * Frontend-own type (no backend contract): result of a booking check — used by feat-check-booking and
 * feat-manage-booking (siblings share via the slice root). Backend data uses the generated DTOs of
 * booking-client directly, never a copy here.
 */
export interface CheckSummary {
  bookingId: string;
  checkedAt: string;
}
