import { inputBinding, outputBinding, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Booking } from '@mo-transfer/booking/generated/booking-client/types';
import { aBooking } from '@mo-transfer/booking/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { BookingCard } from './booking-card';

/** Isolated component test (reused by feat-check-booking and feat-manage-booking): input via signal, output captured. */
function renderCard(initial: Booking) {
  const booking = signal(initial);
  const confirmed: string[] = [];
  TestBed.createComponent(BookingCard, {
    bindings: [inputBinding('booking', booking), outputBinding<string>('confirmed', (id) => confirmed.push(id))],
  });
  return { booking, confirmed };
}

const ada = aBooking({ id: 'b-1', guestName: 'Ada Lovelace', checkinDate: '2026-10-01', status: 'pending' });
const heading = () => page.getByRole('heading', { name: 'Ada Lovelace – 1.10.2026' });
const confirmButton = () => page.getByRole('button', { name: 'Confirm' });

describe('BookingCard', () => {
  test('shows guest and date, details only after opening', async () => {
    renderCard(ada);
    await expect.element(heading()).toBeVisible();
    await expect.element(page.getByText('Status: pending')).not.toBeInTheDocument();

    await userEvent.click(heading());

    await expect.element(page.getByText('Status: pending')).toBeVisible();
  });

  test('emits the booking id on confirm — a plain value, the container makes the event — and stays open', async () => {
    const { confirmed } = renderCard(ada);
    await userEvent.click(heading());

    await userEvent.click(confirmButton());

    expect(confirmed).toEqual(['b-1']);
    await expect.element(confirmButton()).toBeVisible();
  });

  test('re-renders when the booking input changes', async () => {
    const { booking } = renderCard(ada);
    await userEvent.click(heading());

    booking.set({ ...ada, status: 'confirmed' });

    await expect.element(page.getByText('Status: confirmed')).toBeVisible();
  });
});
