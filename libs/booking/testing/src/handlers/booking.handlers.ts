import { bookingClientHandlers, bookingClientHttp } from '@mo-transfer/booking/generated/booking-client/testing';
import { notificationClientHandlers } from '@mo-transfer/generated/notification-client/testing';
import { Booking } from '@mo-transfer/booking/types';
import { type Scenarios, withBaseline } from '@mo-transfer/shared/testing';
import { aBooking } from '../fixtures/booking.fixture';

/**
 * Backend contract of the booking domain = the specs of its generated clients (booking-client, the shared
 * notification-client). `bookingClientHttp` (openapi-msw) only accepts their paths, status codes and bodies — a
 * spec change breaks these handlers at compile time.
 */
export const defaultBookings: Booking[] = [
  aBooking({ id: 'b-100', guestName: 'Katherine Johnson', status: 'pending' }),
  aBooking({ id: 'b-101', guestName: 'Margaret Hamilton', status: 'confirmed' }),
];

/** Curated: the backend returns the default bookings (hand-written fixtures in the domain model). */
const curatedBookingHandlers = [
  bookingClientHttp.get('/bookings', ({ response }) => response(200).json(defaultBookings)),
];

/**
 * Slice defaults, set per spec: `beforeEach(() => worker.use(...bookingHandlers))`. Curated handlers win; every
 * other operation of the slice's clients answers from the generated baseline (spec examples, seeded faker).
 */
export const bookingHandlers = withBaseline(curatedBookingHandlers, bookingClientHandlers, notificationClientHandlers);

/** Deviations for a single test: `worker.use(bookingScenarios.serverError())`. */
export const bookingScenarios = {
  withBookings: (bookings: Booking[]) =>
    bookingClientHttp.get('/bookings', ({ response }) => response(200).json(bookings)),
  empty: () => bookingClientHttp.get('/bookings', ({ response }) => response(200).json([])),
  serverError: () =>
    bookingClientHttp.get('/bookings', ({ response }) =>
      response('default').json({ message: 'boom' }, { status: 500 }),
    ),
} satisfies Scenarios;
