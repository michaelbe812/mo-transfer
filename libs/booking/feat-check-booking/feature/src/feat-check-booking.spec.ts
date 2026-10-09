import { TestBed } from '@angular/core/testing';
import { test } from '@mo-transfer/shared/testing';
import { describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FeatCheckBooking } from './feat-check-booking';

/** Real container, real BookingStore + CheckBookingStore, real cards. No HTTP: an unexpected request turns red (MSW). */
function renderCheckBooking(): void {
  TestBed.createComponent(FeatCheckBooking);
}

const card = (guestName: string) => page.getByRole('heading', { name: new RegExp(`^${guestName} – `) });
const confirmButton = () => page.getByRole('button', { name: 'Confirm' });

describe('FeatCheckBooking (rendered in Chromium)', () => {
  test('lists every booking with guest and check-in date, nothing confirmed yet', async () => {
    renderCheckBooking();

    await expect.element(page.getByRole('heading', { name: 'Check bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Ada Lovelace – 1.8.2026' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Grace Hopper – 3.8.2026' })).toBeVisible();
    await expect.element(page.getByText('No booking confirmed yet.')).toBeVisible();
  });

  test('a card shows status and the confirm action only when opened', async () => {
    renderCheckBooking();
    await expect.element(confirmButton()).not.toBeInTheDocument();

    await userEvent.click(card('Ada Lovelace'));

    await expect.element(page.getByText('Status: pending')).toBeVisible();
    await expect.element(confirmButton()).toBeVisible();
  });

  test('confirming a booking updates its status and reports it as the last confirmed one', async () => {
    renderCheckBooking();
    await userEvent.click(card('Ada Lovelace'));

    await userEvent.click(confirmButton());

    await expect.element(page.getByText('Status: confirmed')).toBeVisible();
    await expect.element(page.getByText('Last confirmed booking: b1')).toBeVisible();
  });
});
