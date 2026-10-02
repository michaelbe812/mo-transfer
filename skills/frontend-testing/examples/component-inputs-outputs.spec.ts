import { inputBinding, outputBinding, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GuestArrived } from '@myorg/checkin/events';
import type { CheckinRecord } from '@myorg/checkin/types';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ArrivalList } from './arrival-list';

const grace: CheckinRecord = { id: 'c-1', bookingId: 'b-7', guestName: 'Grace Hopper', checkedInAt: '2026-10-01T14:00:00.000Z' };

/** Isolated component test: inputs via a signal, outputs captured — no host component, no detectChanges(). */
function renderList(initial: CheckinRecord[]) {
  const records = signal(initial);
  const arrived: GuestArrived[] = [];
  TestBed.createComponent(ArrivalList, {
    bindings: [inputBinding('records', records), outputBinding<GuestArrived>('arrived', (event) => arrived.push(event))],
  });
  return { records, arrived };
}

describe('ArrivalList', () => {
  test('renders one entry per record', async () => {
    renderList([grace]);

    await expect.element(page.getByRole('listitem')).toHaveTextContent('Grace Hopper (b-7)');
  });

  test('re-renders when the input signal changes', async () => {
    const { records } = renderList([]);

    records.set([grace, { ...grace, id: 'c-2', bookingId: 'b-8', guestName: 'Ada Lovelace' }]);

    await expect.element(page.getByText('Ada Lovelace (b-8)')).toBeVisible();
    expect(page.getByRole('listitem').elements()).toHaveLength(2);
  });

  test('emits a walk-in arrival on click', async () => {
    const { arrived } = renderList([]);

    await userEvent.click(page.getByRole('button', { name: 'Walk-in guest' }));

    expect(arrived).toEqual([{ type: 'checkin.guestArrived', bookingId: 'walk-in', guestName: 'Walk-in guest' }]);
  });
});
