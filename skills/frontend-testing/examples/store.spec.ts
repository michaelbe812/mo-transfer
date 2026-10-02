import { TestBed } from '@angular/core/testing';
import { guestArrived } from '@myorg/checkin/events';
import { aCheckinDto, checkinHandlers, checkinScenarios } from '@myorg/checkin/testing';
import { test, worker } from '@myorg/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { CheckinStore } from './checkin.store';

/** Real store + real port (CheckinApi → ApiHttp → fetch); only the network is mocked (MSW). */
describe('CheckinStore', () => {
  beforeEach(() => worker.use(...checkinHandlers));

  test('maps backend DTOs (snake_case) to CheckinRecords', async () => {
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.all()).toEqual([
      { id: 'c-1', bookingId: 'b-100', guestName: 'Katherine Johnson', checkedInAt: '2026-10-01T14:00:00.000Z' },
    ]);
  });

  test('counts whatever a single test serves', async ({ worker }) => {
    worker.use(checkinScenarios.withCheckins([aCheckinDto(), aCheckinDto(), aCheckinDto()]));
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

    test('records the arrival with the current time', () => {
      const store = TestBed.inject(CheckinStore);

      store.handle(guestArrived('b-7', 'Grace Hopper'));

      expect(store.all()).toEqual([
        { id: 'c1', bookingId: 'b-7', guestName: 'Grace Hopper', checkedInAt: '2026-10-01T08:30:00.000Z' },
      ]);
    });
  });
});
