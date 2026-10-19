import type { Notification } from '@mo-transfer/generated/notification-client/types';

let nextId = 1;

/** Test data builder of the shared notification-client: an unread booking notification, override what the test cares about. */
export function aNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: `notification-${nextId++}`,
    topic: 'booking',
    message: 'Booking b-100 confirmed',
    read: false,
    createdAt: '2026-10-01T09:00:00Z',
    ...overrides,
  };
}
