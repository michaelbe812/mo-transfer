import { computed, inject, Injectable, signal } from '@angular/core';
import type { Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { CheckinApi } from '@mo-transfer/checkin/data-access';
import { DeskSummary } from '@mo-transfer/checkin/types';
import { CheckinEvent, GuestArrived } from './checkin.events';
import { nextCheckinId } from './internal/next-checkin-id';

/** Domain-shared store: handles domain events, owns the checkin state. */
@Injectable({ providedIn: 'root' })
export class CheckinStore {
  private readonly api = inject(CheckinApi);
  private readonly checkins = signal<Checkin[]>([]);
  private readonly deskSummary = signal<DeskSummary>({ openArrivals: 0 });
  private loading?: Promise<void>;

  readonly all = this.checkins.asReadonly();
  readonly count = computed(() => this.checkins().length);
  /** Desk state reported by feat-checkin — slice root, so sibling feats (history) see it without importing it. */
  readonly desk = this.deskSummary.asReadonly();
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

  handle(event: CheckinEvent): void {
    switch (event.type) {
      case 'checkin.guestArrived':
        return this.recordArrival(event);
      case 'checkin.deskUpdated':
        return this.deskSummary.set({ openArrivals: event.openArrivals });
    }
  }

  private recordArrival(event: GuestArrived): void {
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
