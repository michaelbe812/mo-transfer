import { aCheckin } from '@mo-transfer/checkin/testing';
import { describe, expect, test } from 'vitest';
import { checkinLabel } from './checkin.utils';

/** Unit test: pure logic, no TestBed, no MSW. Input is the generated DTO, built with the slice's builder. */
describe(checkinLabel.name, () => {
  test('shows guest and booking', () => {
    expect(checkinLabel(aCheckin({ booking_id: 'b-7', guest_name: 'Grace Hopper' }))).toBe('Grace Hopper (b-7)');
  });
});
