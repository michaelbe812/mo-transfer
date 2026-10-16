import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BookingNotifications } from '@mo-transfer/booking/data-access';
import { aBooking, bookingHandlers, bookingScenarios, defaultBookings } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { bookingConfirmed } from './booking.events';
import { BookingStore } from './booking.store';

/**
 * Opens the slice and waits until the bookings resource settled (resolved or failed): a loading resource is a
 * pending task. Not `expect.poll` — it advances a faked Date by its interval.
 */
async function loadedStore(): Promise<BookingStore> {
  const store = TestBed.inject(BookingStore);
  store.ensureLoaded();
  await TestBed.inject(ApplicationRef).whenStable();
  return store;
}

describe('BookingStore', () => {
  // slice defaults: curated bookings on top of the generated baseline of booking-client + notification-client
  beforeEach(() => worker.use(...bookingHandlers));

  test('loads the curated bookings via the real BookingApi — they win over the generated example', async () => {
    const store = await loadedStore();

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

    const store = await loadedStore();

    expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-1']);
  });

  test('stays idle until the slice opens: no bookings, no error', () => {
    const store = TestBed.inject(BookingStore);

    expect(store.isLoading()).toBe(false);
    expect(store.all()).toEqual([]);
    expect(store.loadError()).toBeNull();
  });

  test('is loading while the request runs', () => {
    const store = TestBed.inject(BookingStore);

    store.ensureLoaded();

    expect(store.isLoading()).toBe(true);
  });

  test('ensureLoaded loads once — later calls keep local changes', async () => {
    const store = await loadedStore();
    store.handle(bookingConfirmed('b-100'));

    store.ensureLoaded();

    expect(store.isLoading()).toBe(false);
    expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-100', 'b-101']);
  });

  test('ensureLoaded never throws: the failure lands in loadError, the next call retries', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());
    const store = await loadedStore();
    expect(store.loadError()).toBe('GET /api/bookings failed: 500');

    worker.resetHandlers(...bookingHandlers);
    store.ensureLoaded();

    await expect.poll(() => store.all()).toEqual(defaultBookings);
    expect(store.loadError()).toBeNull();
  });

  describe('reload (resource update)', () => {
    test('updates the list with what the backend serves now', async ({ worker }) => {
      const store = await loadedStore();
      worker.use(bookingScenarios.withBookings([aBooking({ id: 'b-7', status: 'confirmed' })]));

      store.reload();

      await expect.poll(() => store.all().map((booking) => booking.id)).toEqual(['b-7']);
      expect(store.confirmed().map((booking) => booking.id)).toEqual(['b-7']);
    });

    test('keeps the current list while reloading', async () => {
      const store = await loadedStore();

      store.reload();

      expect(store.isLoading()).toBe(true);
      expect(store.all()).toEqual(defaultBookings);
    });

    test('replaces local changes with the backend state', async () => {
      const store = await loadedStore();
      store.handle(bookingConfirmed('b-100'));

      store.reload();

      await expect.poll(() => store.confirmed().map((booking) => booking.id)).toEqual(['b-101']);
    });

    test('a failed reload keeps the last bookings and reports the error; the next success clears it', async ({
      worker,
    }) => {
      const store = await loadedStore();
      worker.use(bookingScenarios.serverError());

      store.reload();

      await expect.poll(() => store.loadError()).toBe('GET /api/bookings failed: 500');
      expect(store.all()).toEqual(defaultBookings);

      worker.resetHandlers(...bookingHandlers);
      store.reload();

      await expect.poll(() => store.loadError()).toBeNull();
      expect(store.all()).toEqual(defaultBookings);
    });

    test('before the slice opened, reload loads like ensureLoaded', async () => {
      const store = TestBed.inject(BookingStore);

      store.reload();

      await expect.poll(() => store.all()).toEqual(defaultBookings);
    });
  });

  describe('handle(BookingConfirmed)', () => {
    // time is not ours: fake only Date, keep real timers for MSW/fetch
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('confirms the booking and records it as the last check', async () => {
      const store = await loadedStore();

      store.handle(bookingConfirmed('b-100'));

      expect(store.confirmed().map((booking) => booking.id)).toContain('b-100');
      expect(store.lastCheck()).toEqual({ bookingId: 'b-100', checkedAt: '2026-10-01T08:30:00.000Z' });
    });
  });
});
