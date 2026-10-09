import { computed, inject, Injectable, signal } from '@angular/core';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { CheckSummary } from '@mo-transfer/booking/types';
import { isConfirmed } from '@mo-transfer/booking/utils';
import { BookingApi } from '@mo-transfer/booking/data-access';
import { BookingConfirmed } from './booking.events';

/** Domain-shared store: usable by feature containers, never by ui. */
@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly api = inject(BookingApi);
  private readonly bookings = signal<Booking[]>([]);
  private loading?: Promise<void>;

  readonly all = this.bookings.asReadonly();
  readonly confirmed = computed(() => this.bookings().filter(isConfirmed));
  /** Message of the last failed load, null once a load succeeds. */
  readonly loadError = signal<string | null>(null);
  /** Last confirmed booking — slice root state, so every feat of the slice sees it (feats never import each other). */
  readonly lastCheck = signal<CheckSummary | null>(null);

  async load(): Promise<void> {
    this.bookings.set(await this.api.loadBookings());
    this.loadError.set(null);
  }

  /**
   * Loads once when the slice opens; later calls (other feats of the slice) reuse it, so local changes survive
   * navigation between them. Never rejects: a failure ends up in `loadError`, the next call retries.
   */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.load().catch((error: unknown) => {
      this.loading = undefined;
      this.loadError.set(error instanceof Error ? error.message : String(error));
    });
    return this.loading;
  }

  handle(event: BookingConfirmed): void {
    this.bookings.update((bookings) =>
      bookings.map((booking) =>
        booking.id === event.bookingId ? { ...booking, status: 'confirmed' as const } : booking,
      ),
    );
    this.lastCheck.set({ bookingId: event.bookingId, checkedAt: new Date().toISOString() });
  }
}
