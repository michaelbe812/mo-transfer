import { inputBinding, outputBinding, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Arrival, Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { aCheckin } from '@mo-transfer/checkin/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ArrivalList } from './arrival-list';

// the generated DTO is the model in every layer, ui included (snake_case as the backend sends it)
const grace = aCheckin({ id: 'c-1', booking_id: 'b-7', guest_name: 'Grace Hopper' });

/** Isolated component test: inputs via a signal, outputs captured — no host component, no detectChanges(). */
function renderList(initial: Checkin[]) {
  const checkins = signal(initial);
  const arrived: Arrival[] = [];
  TestBed.createComponent(ArrivalList, {
    bindings: [inputBinding('checkins', checkins), outputBinding<Arrival>('arrived', (value) => arrived.push(value))],
  });
  return { checkins, arrived };
}

describe('ArrivalList', () => {
  test('renders one entry per check-in', async () => {
    renderList([grace]);

    await expect.element(page.getByRole('listitem')).toHaveTextContent('Grace Hopper (b-7)');
  });

  test('re-renders when the input signal changes', async () => {
    const { checkins } = renderList([]);

    checkins.set([grace, aCheckin({ id: 'c-2', booking_id: 'b-8', guest_name: 'Ada Lovelace' })]);

    await expect.element(page.getByText('Ada Lovelace (b-8)')).toBeVisible();
    expect(page.getByRole('listitem').elements()).toHaveLength(2);
  });

  test('emits a plain walk-in value on click — the container makes the domain event', async () => {
    const { arrived } = renderList([]);

    await userEvent.click(page.getByRole('button', { name: 'Walk-in guest' }));

    expect(arrived).toEqual([{ bookingId: 'walk-in', guestName: 'Walk-in guest' }]);
  });
});
