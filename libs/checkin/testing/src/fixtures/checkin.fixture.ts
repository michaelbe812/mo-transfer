import type { Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';

let nextId = 1;

/** Test data builder: the generated DTO (snake_case, as the backend sends it and the app uses it). */
export function aCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: `checkin-${nextId++}`,
    booking_id: 'b-100',
    guest_name: 'Katherine Johnson',
    checked_in_at: '2026-10-01T14:00:00.000Z',
    ...overrides,
  };
}
