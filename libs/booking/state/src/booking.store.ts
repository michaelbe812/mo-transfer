import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { CheckSummary } from '@mo-transfer/booking/types';
import { isConfirmed } from '@mo-transfer/booking/utils';
import { BookingApi } from '@mo-transfer/booking/data-access';
import { tap } from 'rxjs';
import { BookingConfirmed } from './booking.events';

/** Domain-shared store: usable by feature containers, never by ui. */
@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly api = inject(BookingApi);
  // own state instead of the resource value: a failed reload keeps the last list (resource value would throw)
  private readonly bookings = signal<Booking[]>([]);
  /** Set by the first feat that opens the slice; until then the resource stays idle (no request). */
  private readonly requested = signal(false);
  /** Loading lifecycle only (status, error, reload, cancel); every successful load replaces `bookings`. */
  private readonly bookingsResource = rxResource({
    params: () => (this.requested() ? {} : undefined),
    stream: () => this.api.loadBookings().pipe(tap((bookings) => this.bookings.set(bookings))),
  });

  readonly all = this.bookings.asReadonly();
  readonly confirmed = computed(() => this.bookings().filter(isConfirmed));
  readonly isLoading = this.bookingsResource.isLoading;
  /** Message of the last failed load, null once a load succeeds. */
  readonly loadError = computed(() => this.bookingsResource.error()?.message ?? null);
  /** Last confirmed booking — slice root state, so every feat of the slice sees it (feats never import each other). */
  readonly lastCheck = signal<CheckSummary | null>(null);

  /**
   * Loads once when the slice opens; later calls (other feats of the slice) keep the loaded list, so local changes
   * survive navigation between them. A failure ends up in `loadError`, the next call retries.
   */
  ensureLoaded(): void {
    if (!this.requested()) this.requested.set(true);
    else if (this.bookingsResource.status() === 'error') this.bookingsResource.reload();
  }

  /** Fetches the list again; replaces local changes with the backend state. */
  reload(): void {
    if (this.requested()) this.bookingsResource.reload();
    else this.requested.set(true);
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
