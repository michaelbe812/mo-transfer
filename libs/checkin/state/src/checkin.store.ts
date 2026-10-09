import { computed, inject, Injectable, signal } from '@angular/core';
import type { Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { CheckinApi } from '@mo-transfer/checkin/data-access';
import { GuestArrived } from './checkin.events';
import { nextCheckinId } from './internal/next-checkin-id';

/** Domain-shared store: handles domain events, owns the checkin state. */
@Injectable({ providedIn: 'root' })
export class CheckinStore {
  private readonly api = inject(CheckinApi);
  private readonly checkins = signal<Checkin[]>([]);

  readonly all = this.checkins.asReadonly();
  readonly count = computed(() => this.checkins().length);

  async load(): Promise<void> {
    this.checkins.set(await this.api.loadCheckins());
  }

  handle(event: GuestArrived): void {
    this.checkins.update((checkins) => [
      ...checkins,
      {
        id: nextCheckinId(checkins.length),
        booking_id: event.bookingId,
        guest_name: event.guestName,
        checked_in_at: new Date().toISOString(),
      },
    ]);
  }
}
