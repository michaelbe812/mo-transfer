import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BookingsService } from '@mo-transfer/booking/generated/booking-client/api';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { catchError, type Observable, throwError } from 'rxjs';

/**
 * HTTP access of the booking domain (data-access layer) — no port: only booking's own stores and feats use it.
 *
 * Backed by the generated booking-client (libs/booking/generated/booking-client, adapter openapi-tools).
 * Returns the generated DTOs as they are (no mapping, no own model) as a cold Observable — every subscription
 * is a fresh request, so `rxResource` can reload it — and turns HTTP errors into an Error with status.
 */
@Injectable({ providedIn: 'root' })
export class BookingApi {
  private readonly bookings = inject(BookingsService);

  loadBookings(): Observable<Booking[]> {
    return this.bookings
      .listBookings()
      .pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof HttpErrorResponse ? new Error(`GET /api/bookings failed: ${error.status}`) : error,
          ),
        ),
      );
  }
}
