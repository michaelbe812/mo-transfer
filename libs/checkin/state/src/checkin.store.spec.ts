import { TestBed } from '@angular/core/testing';
import { CheckinNotifications } from '@mo-transfer/checkin/data-access';
import { aCheckin, checkinHandlers, checkinScenarios, defaultCheckins } from '@mo-transfer/checkin/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { CheckinStore } from './checkin.store';

describe('CheckinStore', () => {
  // slice defaults: curated check-ins on top of the generated baseline of checkin-client + notification-client
  beforeEach(() => worker.use(...checkinHandlers));

  test('holds the curated backend DTOs as they are (no mapping) — they win over the generated example', async () => {
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.all()).toEqual(defaultCheckins);
  });

  test('counts every check-in', async ({ worker }) => {
    worker.use(checkinScenarios.withCheckins([aCheckin(), aCheckin(), aCheckin()]));
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.count()).toBe(3);
  });

  test('stays empty when the backend has no check-ins', async ({ worker }) => {
    worker.use(checkinScenarios.empty());
    const store = TestBed.inject(CheckinStore);

    await store.load();

    expect(store.count()).toBe(0);
  });

  test('keeps the check-ins when the backend fails', async ({ worker }) => {
    worker.use(checkinScenarios.serverError());
    const store = TestBed.inject(CheckinStore);

    await expect(store.load()).rejects.toThrow('GET /api/checkins failed: 500');

    expect(store.count()).toBe(0);
  });

  test('every other operation of the slice answers from the generated baseline (notifications)', async () => {
    const notifications = await TestBed.inject(CheckinNotifications).load();

    expect(notifications[0]).toMatchObject({ id: 'n-1', read: false });
  });
});
