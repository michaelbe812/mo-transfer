import { describe, expect, test } from 'vitest';
import { formatDate } from './format-date';

describe(formatDate.name, () => {
  test('formats an ISO date German style, without leading zeros', () => {
    expect(formatDate('2026-08-01')).toBe('1.8.2026');
    expect(formatDate('2026-12-24')).toBe('24.12.2026');
  });

  test('accepts a full ISO timestamp', () => {
    expect(formatDate('2026-10-01T09:30:00.000Z')).toBe('1.10.2026');
  });
});
