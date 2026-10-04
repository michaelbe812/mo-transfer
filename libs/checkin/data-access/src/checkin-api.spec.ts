import { TestBed } from '@angular/core/testing';
import {
  checkinClientHandlers,
  checkinClientHttp,
  getListCheckinsResponseMock,
} from '@mo-transfer/checkin/generated/checkin-client/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { CheckinApi } from './checkin-api';

describe('CheckinApi (generated checkin-client behind the checkin data-access layer)', () => {
  // generated baseline: every operation of the checkin-client answers with the spec examples
  beforeEach(() => worker.use(...checkinClientHandlers));

  test('loads the check-ins of the generated default handler (spec examples)', async () => {
    const checkins = await TestBed.inject(CheckinApi).loadCheckins();

    expect(checkins.length).toBeGreaterThan(0);
    expect(checkins[0]).toEqual({
      id: 'c-100',
      booking_id: 'b-101',
      guest_name: 'Margaret Hamilton',
      checked_in_at: '2026-10-01T09:30:00.000Z',
    });
  });

  test('loads the arrivals of the generated default handler (media example of the spec)', async () => {
    expect(await TestBed.inject(CheckinApi).loadArrivals()).toEqual([
      { bookingId: 'b-100', guestName: 'Katherine Johnson' },
      { bookingId: 'b-101', guestName: 'Margaret Hamilton' },
    ]);
  });

  test('a typed override wins over the baseline (generated factory as data)', async ({ worker }) => {
    const [example] = getListCheckinsResponseMock();
    worker.use(checkinClientHttp.get('/checkins', ({ response }) => response(200).json([{ ...example, id: 'c-7' }])));

    expect((await TestBed.inject(CheckinApi).loadCheckins()).map((checkin) => checkin.id)).toEqual(['c-7']);
  });

  test('turns the documented error response into an Error', async ({ worker }) => {
    worker.use(
      checkinClientHttp.get('/arrivals', ({ response }) =>
        response('default').json({ message: 'boom' }, { status: 503 }),
      ),
    );

    await expect(TestBed.inject(CheckinApi).loadArrivals()).rejects.toThrow('GET /api/arrivals failed: 503');
  });
});
