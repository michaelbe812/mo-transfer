import { TestBed } from '@angular/core/testing';
import { bookingClientHandlers, bookingClientHttp } from '@myorg/booking/generated/booking-client/testing';
import { aBooking } from '@myorg/booking/testing';
import { test, worker } from '@myorg/shared/testing';
import { describe, expect, vi } from 'vitest';
import { BookingApi } from './booking-api';

/** Port test: real port + real generated client + real HttpClient; MSW answers in the browser. */
describe('BookingApi', () => {
  test('maps the spec examples (generated default handlers) to domain bookings', async () => {
    worker.use(...bookingClientHandlers);

    const bookings = await TestBed.inject(BookingApi).loadBookings();

    // `example` values of the Booking schema in openapi.yaml — never faker output
    expect(bookings[0]).toEqual({ id: 'b-100', guestName: 'Katherine Johnson', checkinDate: '2026-10-01', status: 'confirmed' });
  });

  test('passes through what a typed handler serves', async ({ worker }) => {
    worker.use(bookingClientHttp.get('/bookings', ({ response }) => response(200).json([aBooking({ id: 'b-1' })])));

    const bookings = await TestBed.inject(BookingApi).loadBookings();

    expect(bookings.map((booking) => booking.id)).toEqual(['b-1']);
  });

  test('turns the documented error response into an Error', async ({ worker }) => {
    worker.use(
      bookingClientHttp.get('/bookings', ({ response }) => response('default').json({ message: 'boom' }, { status: 503 })),
    );

    await expect(TestBed.inject(BookingApi).loadBookings()).rejects.toThrow('GET /api/bookings failed: 503');
  });

  test('fails on a request no handler matches (onUnhandledFrame: error)', async () => {
    // no worker.use(...) at all: nothing is mocked, MSW must not let the request through
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(TestBed.inject(BookingApi).loadBookings()).rejects.toThrow('500');

    expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/without a matching request handler:\s+• GET \/api\/bookings/));
    consoleError.mockRestore();
  });
});
