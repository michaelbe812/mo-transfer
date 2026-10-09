import { computed, inject, Injectable, signal } from '@angular/core';
import { CheckinApi } from '@mo-transfer/checkin/data-access';
import { CheckinStore, guestArrived } from '@mo-transfer/checkin/state';
import type { Arrival } from '@mo-transfer/checkin/generated/checkin-client/types';

// boundary-violation-example: import { BookingApi } from '@mo-transfer/booking/data-access'; // foreign slice (never, no port)

/** Feat-private store: orchestrates the desk — arrivals in, check-ins out. */
@Injectable({ providedIn: 'root' })
export class CheckinDeskStore {
  private readonly api = inject(CheckinApi);
  private readonly checkinStore = inject(CheckinStore);

  readonly arrivals = signal<Arrival[]>([]);
  readonly openArrivals = computed(() => this.arrivals().length);

  async loadArrivals(): Promise<void> {
    this.arrivals.set(await this.api.loadArrivals());
  }

  checkIn(arrival: Arrival): void {
    this.checkinStore.handle(guestArrived(arrival.bookingId, arrival.guestName));
    this.arrivals.update((arrivals) => arrivals.filter((a) => a.bookingId !== arrival.bookingId));
  }
}
