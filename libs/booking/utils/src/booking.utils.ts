import { formatDate } from '@mo-transfer/shared/utils';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { CheckSummary } from '@mo-transfer/booking/types';

export function bookingLabel(booking: Booking): string {
  return `${booking.guestName} – ${formatDate(booking.checkinDate)}`;
}

export function isConfirmed(booking: Booking): boolean {
  return booking.status === 'confirmed';
}

/** Used by feat-check-booking and feat-manage-booking (siblings share via the slice root). */

export function describeCheck(summary: CheckSummary): string {
  return `Booking ${summary.bookingId} checked at ${summary.checkedAt}`;
}
