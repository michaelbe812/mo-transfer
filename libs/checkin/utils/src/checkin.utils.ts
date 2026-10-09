import type { Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { DeskSummary } from '@mo-transfer/checkin/types';
import { pluralize } from '@mo-transfer/shared/utils';

export function checkinLabel(checkin: Checkin): string {
  return `${checkin.guest_name} (${checkin.booking_id})`;
}

/** Used by feat-checkin and feat-history (siblings share via the slice root, no feat-port). */
export function describeDesk(summary: DeskSummary): string {
  return summary.openArrivals === 0
    ? 'Desk clear — no open arrivals'
    : `${summary.openArrivals} open ${pluralize(summary.openArrivals, 'arrival', 'arrivals')} at the desk`;
}
