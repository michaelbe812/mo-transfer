import { TestBed } from '@angular/core/testing';
import { BookingNotifications } from '@mo-transfer/booking/data-access';
import { aBooking, bookingHandlers, bookingScenarios, defaultBookings } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { BookingStore } from './booking.store';

describe('BookingStore', () => {
  // slice defaults: curated bookings on top of the generated baseline of booking-client + notification-client
  beforeEach(() => worker.use(...bookingHandlers));

  test('loads the curated bookings via the real BookingApi — they win over the generated example', async () => {
    const store = TestBed.inject(BookingStore);

    await store.load();

    // the generated booking-client example is b-100 *confirmed*; the curated default b-100 is pending
    expect(store.all()).toEqual(defaultBookings);
    expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-101']);
  });

  test('every other operation of the slice answers from the generated baseline (notifications)', async () => {
    const notifications = await TestBed.inject(BookingNotifications).load();

    expect(notifications[0]).toEqual({
      id: 'n-1',
      message: 'Booking b-101 confirmed',
      read: false,
      createdAt: '2026-10-01T09:00:00Z',
    });
  });

  test('replaces the list with whatever a single test serves', async ({ worker }) => {
    worker.use(bookingScenarios.withBookings([aBooking({ id: 'b-1', status: 'confirmed' })]));
    const store = TestBed.inject(BookingStore);

    await store.load();

    expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-1']);
  });

  test('keeps the current bookings when the backend fails', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());
    const store = TestBed.inject(BookingStore);
    const before = store.all();

    await expect(store.load()).rejects.toThrow('500');

    expect(store.all()).toBe(before);
  });
});
