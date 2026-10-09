import { describe, expect, test } from 'vitest';
import { pluralize } from './pluralize';

describe(pluralize.name, () => {
  test('singular for exactly one', () => {
    expect(pluralize(1, 'arrival', 'arrivals')).toBe('arrival');
  });

  test('plural for zero, many and negative counts', () => {
    expect(pluralize(0, 'arrival', 'arrivals')).toBe('arrivals');
    expect(pluralize(2, 'arrival', 'arrivals')).toBe('arrivals');
    expect(pluralize(-1, 'arrival', 'arrivals')).toBe('arrivals');
  });
});
