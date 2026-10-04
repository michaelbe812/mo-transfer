import { checkinClientHandlers, checkinClientHttp } from '@mo-transfer/checkin/generated/checkin-client/testing';
import { notificationClientHandlers } from '@mo-transfer/generated/notification-client/testing';
import { Arrival, CheckinDto } from '@mo-transfer/checkin/types';
import { type Scenarios, withBaseline } from '@mo-transfer/shared/testing';
import { aCheckinDto } from '../fixtures/checkin.fixture';

/**
 * Backend contract of the checkin domain = the specs of its generated clients (checkin-client, the shared
 * notification-client). `checkinClientHttp` (openapi-msw) only accepts their paths, status codes and bodies — a
 * spec change breaks these handlers at compile time.
 */
export const defaultCheckinDtos: CheckinDto[] = [
  aCheckinDto({ id: 'c-1', booking_id: 'b-100', guest_name: 'Katherine Johnson' }),
];

/** Curated: the backend returns the default check-ins (hand-written fixtures in the raw backend shape). */
const curatedCheckinHandlers = [
  checkinClientHttp.get('/checkins', ({ response }) => response(200).json(defaultCheckinDtos)),
];

/**
 * Slice defaults, set per spec: `beforeEach(() => worker.use(...checkinHandlers))`. Curated handlers win; every
 * other operation answers from the generated baseline — arrivals with the media example of the checkin-client spec,
 * notifications with the notification-client's examples.
 */
export const checkinHandlers = withBaseline(curatedCheckinHandlers, checkinClientHandlers, notificationClientHandlers);

/** Deviations for a single test: `worker.use(checkinScenarios.empty())`. */
export const checkinScenarios = {
  withCheckins: (dtos: CheckinDto[]) => checkinClientHttp.get('/checkins', ({ response }) => response(200).json(dtos)),
  empty: () => checkinClientHttp.get('/checkins', ({ response }) => response(200).json([])),
  serverError: () =>
    checkinClientHttp.get('/checkins', ({ response }) =>
      response('default').json({ message: 'boom' }, { status: 500 }),
    ),
  withArrivals: (arrivals: Arrival[]) =>
    checkinClientHttp.get('/arrivals', ({ response }) => response(200).json(arrivals)),
  noArrivals: () => checkinClientHttp.get('/arrivals', ({ response }) => response(200).json([])),
} satisfies Scenarios;
