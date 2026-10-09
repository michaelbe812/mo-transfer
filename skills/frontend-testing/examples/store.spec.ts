import { TestBed } from '@angular/core/testing';
import { aCheckin, checkinHandlers, checkinScenarios, defaultCheckins } from '@mo-transfer/checkin/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { guestArrived } from './checkin.events';
import { CheckinStore } from './checkin.store';

/** Real store + real CheckinApi (data-access) + real generated client; only the network is mocked (MSW). */
describe('CheckinStore', () => {
  // slice defaults: curated check-ins on top of the generated baseline of checkin-client + notification-client
  beforeEach(() => worker.use(...checkinHandlers));

  test('holds the curated backend DTOs as they are (no mapping)', async () => {
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.all()).toEqual(defaultCheckins);
  });

  test('counts whatever a single test serves', async ({ worker }) => {
    worker.use(checkinScenarios.withCheckins([aCheckin(), aCheckin(), aCheckin()]));
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.count()).toBe(3);
  });

  test('rejects and keeps its state when the backend fails', async ({ worker }) => {
    worker.use(checkinScenarios.serverError());
    const store = TestBed.inject(CheckinStore);

    await expect(store.load()).rejects.toThrow('GET /api/checkins failed: 500');

    expect(store.count()).toBe(0);
  });

  describe('handle(GuestArrived)', () => {
    // time is not ours: fake only Date, keep real timers for MSW/fetch
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('records the arrival as a check-in DTO with the current time', () => {
      const store = TestBed.inject(CheckinStore);

      store.handle(guestArrived('b-7', 'Grace Hopper'));

      expect(store.all()).toEqual([
        { id: 'c1', booking_id: 'b-7', guest_name: 'Grace Hopper', checked_in_at: '2026-10-01T08:30:00.000Z' },
      ]);
    });
  });
});
