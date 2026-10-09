import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BookingsService } from '@mo-transfer/booking/generated/booking-client/api';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { firstValueFrom } from 'rxjs';

/**
 * HTTP access of the booking domain (data-access layer) — no port: only booking's own stores and feats use it.
 *
 * Backed by the generated booking-client (libs/booking/generated/booking-client, adapter openapi-tools).
 * Returns the generated DTOs as they are (no mapping, no own model) — it only turns the Observable into a
 * Promise and HTTP errors into an Error with status.
 */
@Injectable({ providedIn: 'root' })
export class BookingApi {
  private readonly bookings = inject(BookingsService);

  async loadBookings(): Promise<Booking[]> {
    try {
      // HttpClient completes WITHOUT a value only when the request was cancelled (injector destroyed:
      // app teardown, TestBed reset between specs) — nothing to load then, instead of an EmptyError
      return await firstValueFrom(this.bookings.listBookings(), { defaultValue: [] });
    } catch (error) {
      if (error instanceof HttpErrorResponse) throw new Error(`GET /api/bookings failed: ${error.status}`);
      throw error;
    }
  }
}
