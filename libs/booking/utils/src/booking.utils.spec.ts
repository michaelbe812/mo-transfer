import { aBooking } from '@mo-transfer/booking/testing';
import { describe, expect, test } from 'vitest';
import { bookingLabel, describeCheck, isConfirmed } from './booking.utils';

/** Unit tests: pure logic on the generated Booking DTO, built with the slice's builder. */
describe(bookingLabel.name, () => {
  test('shows guest and German check-in date', () => {
    expect(bookingLabel(aBooking({ guestName: 'Grace Hopper', checkinDate: '2026-08-03' }))).toBe(
      'Grace Hopper – 3.8.2026',
    );
  });
});

describe(isConfirmed.name, () => {
  test('only the status confirmed counts', () => {
    expect(isConfirmed(aBooking({ status: 'confirmed' }))).toBe(true);
    expect(isConfirmed(aBooking({ status: 'pending' }))).toBe(false);
    expect(isConfirmed(aBooking({ status: 'checked-in' }))).toBe(false);
  });
});

describe(describeCheck.name, () => {
  test('names booking and time of the check', () => {
    expect(describeCheck({ bookingId: 'b-7', checkedAt: '2026-10-01T08:30:00.000Z' })).toBe(
      'Booking b-7 checked at 2026-10-01T08:30:00.000Z',
    );
  });
});
