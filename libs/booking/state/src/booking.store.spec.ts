import { TestBed } from '@angular/core/testing';
import { BookingNotifications } from '@mo-transfer/booking/data-access';
import { aBooking, bookingHandlers, bookingScenarios, defaultBookings } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { bookingConfirmed } from './booking.events';
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
      topic: 'booking',
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

  test('ensureLoaded loads once — later calls keep local changes', async () => {
    const store = TestBed.inject(BookingStore);
    await store.ensureLoaded();
    store.handle(bookingConfirmed('b-100'));

    await store.ensureLoaded();

    expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-100', 'b-101']);
  });

  test('ensureLoaded never rejects: the failure lands in loadError, the next call retries', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());
    const store = TestBed.inject(BookingStore);

    await store.ensureLoaded();
    expect(store.loadError()).toBe('GET /api/bookings failed: 500');

    worker.resetHandlers(...bookingHandlers);
    await store.ensureLoaded();

    expect(store.loadError()).toBeNull();
    expect(store.all()).toEqual(defaultBookings);
  });

  describe('handle(BookingConfirmed)', () => {
    // time is not ours: fake only Date, keep real timers for MSW/fetch
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('confirms the booking and records it as the last check', async () => {
      const store = TestBed.inject(BookingStore);
      await store.load();

      store.handle(bookingConfirmed('b-100'));

      expect(store.confirmed().map((booking) => booking.id)).toContain('b-100');
      expect(store.lastCheck()).toEqual({ bookingId: 'b-100', checkedAt: '2026-10-01T08:30:00.000Z' });
    });
  });
});
