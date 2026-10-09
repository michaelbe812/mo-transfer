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
  private loading?: Promise<void>;

  readonly all = this.checkins.asReadonly();
  readonly count = computed(() => this.checkins().length);
  /** Message of the last failed load, null once a load succeeds. */
  readonly loadError = signal<string | null>(null);

  async load(): Promise<void> {
    this.checkins.set(await this.api.loadCheckins());
    this.loadError.set(null);
  }

  /**
   * Loads once when the slice opens; later calls (other feats of the slice) reuse it, so local check-ins survive
   * navigation between them. Never rejects: a failure ends up in `loadError`, the next call retries.
   */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.load().catch((error: unknown) => {
      this.loading = undefined;
      this.loadError.set(error instanceof Error ? error.message : String(error));
    });
    return this.loading;
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
