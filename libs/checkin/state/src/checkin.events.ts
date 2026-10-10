/** Domain events (state layer): feature containers create them, stores handle them; ui never sees them. */
export interface GuestArrived {
  readonly type: 'checkin.guestArrived';
  readonly bookingId: string;
  readonly guestName: string;
}

export function guestArrived(bookingId: string, guestName: string): GuestArrived {
  return { type: 'checkin.guestArrived', bookingId, guestName };
}

/** The desk's open arrivals changed (feat-checkin) — the slice root keeps the count for every feat (history). */
export interface DeskUpdated {
  readonly type: 'checkin.deskUpdated';
  readonly openArrivals: number;
}

export function deskUpdated(openArrivals: number): DeskUpdated {
  return { type: 'checkin.deskUpdated', openArrivals };
}

export type CheckinEvent = GuestArrived | DeskUpdated;
