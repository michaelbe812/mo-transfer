import { aCheckin } from '@mo-transfer/checkin/testing';
import { describe, expect, test } from 'vitest';
import { checkinLabel, describeDesk } from './checkin.utils';

/** Unit tests: pure logic on the generated Checkin DTO, built with the slice's builder. */
describe(checkinLabel.name, () => {
  test('shows guest and booking', () => {
    expect(checkinLabel(aCheckin({ booking_id: 'b-7', guest_name: 'Grace Hopper' }))).toBe('Grace Hopper (b-7)');
  });
});

describe(describeDesk.name, () => {
  test('a clear desk without open arrivals', () => {
    expect(describeDesk({ openArrivals: 0 })).toBe('Desk clear — no open arrivals');
  });

  test('counts the open arrivals', () => {
    expect(describeDesk({ openArrivals: 3 })).toBe('4 open arrivals at the desk');
  });
});
