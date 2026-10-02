import { describe, expect, test } from 'vitest';
import { checkinLabel } from './checkin.utils';

/** Unit test: pure logic, no TestBed, no MSW. */
describe(checkinLabel.name, () => {
  test('shows guest and booking', () => {
    expect(checkinLabel({ id: 'c-1', bookingId: 'b-7', guestName: 'Grace Hopper', checkedInAt: '' })).toBe('Grace Hopper (b-7)');
  });
});
