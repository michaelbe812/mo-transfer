import { TestBed } from '@angular/core/testing';
import { bookingClientHandlers, bookingClientHttp } from '@mo-transfer/booking/generated/booking-client/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, vi } from 'vitest';
import { BookingApi } from './booking-api';

describe('BookingApi without a matching MSW handler', () => {
  // no default handlers (no `beforeEach(() => worker.use(...))`): nothing is mocked for this spec
  test('fails the request instead of hitting a real backend (onUnhandledFrame: error)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = TestBed.inject(BookingApi);

    // MSW logs the unhandled request and answers it with a 500 instead of passing it through
    await expect(firstValueFrom(api.loadBookings())).rejects.toThrow('500');

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[MSW\] Error: intercepted a request without a matching request handler:\s+• GET \/api\/bookings/,
      ),
    );
    consoleError.mockRestore();
  });
});

describe('BookingApi with the generated default handlers of the booking-client', () => {
  // generated baseline: every operation of the booking-client answers with the spec examples
  beforeEach(() => worker.use(...bookingClientHandlers));

  test('emits the spec examples as generated DTOs', async () => {
    const bookings = await firstValueFrom(TestBed.inject(BookingApi).loadBookings());

    expect(bookings.length).toBeGreaterThan(0);
    // `example` values of the Booking schema in openapi.yaml
    expect(bookings[0]).toEqual({
      id: 'b-100',
      guestName: 'Katherine Johnson',
      checkinDate: '2026-10-01',
      status: 'confirmed',
    });
  });

  test('is cold: no request before subscribing, a fresh one per subscription (what a resource reload relies on)', async ({
    worker,
  }) => {
    let requests = 0;
    worker.use(
      bookingClientHttp.get('/bookings', ({ response }) => {
        requests += 1;
        return response(200).json([]);
      }),
    );
    const bookings$ = TestBed.inject(BookingApi).loadBookings();
    expect(requests).toBe(0);

    await firstValueFrom(bookings$);
    await firstValueFrom(bookings$);

    expect(requests).toBe(2);
  });

  test('a typed override wins over the baseline: the documented error response becomes an Error', async ({
    worker,
  }) => {
    worker.use(
      bookingClientHttp.get('/bookings', ({ response }) =>
        response('default').json({ message: 'boom' }, { status: 503 }),
      ),
    );

    await expect(firstValueFrom(TestBed.inject(BookingApi).loadBookings())).rejects.toThrow(
      'GET /api/bookings failed: 503',
    );
  });
});
