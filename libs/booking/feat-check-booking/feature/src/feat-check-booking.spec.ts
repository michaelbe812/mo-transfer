import { TestBed } from '@angular/core/testing';
import { aBooking, bookingHandlers, bookingScenarios } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FeatCheckBooking } from './feat-check-booking';

/** Real container, real BookingStore + CheckBookingStore, real cards; the backend is served by MSW. */
function renderCheckBooking(): void {
  TestBed.createComponent(FeatCheckBooking);
}

const card = (guestName: string) => page.getByRole('heading', { name: new RegExp(`^${guestName} – `) });
const confirmButton = () => page.getByRole('button', { name: 'Confirm' });

describe('FeatCheckBooking (rendered in Chromium, backend via MSW)', () => {
  // slice defaults: curated bookings (b-100 Katherine Johnson pending, b-101 Margaret Hamilton confirmed)
  beforeEach(() => worker.use(...bookingHandlers));

  test('loads and lists every booking with guest and check-in date, nothing confirmed yet', async () => {
    renderCheckBooking();

    await expect.element(page.getByRole('heading', { name: 'Check bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Katherine Johnson – 1.10.2026' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Margaret Hamilton – 1.10.2026' })).toBeVisible();
    await expect.element(page.getByText('No booking confirmed yet.')).toBeVisible();
  });

  test('a card shows status and the confirm action only when opened', async () => {
    renderCheckBooking();
    await expect.element(card('Katherine Johnson')).toBeVisible();
    await expect.element(confirmButton()).not.toBeInTheDocument();

    await userEvent.click(card('Katherine Johnson'));

    await expect.element(page.getByText('Status: pending')).toBeVisible();
    await expect.element(confirmButton()).toBeVisible();
  });

  test('confirming a booking updates its status and reports it as the last confirmed one', async () => {
    renderCheckBooking();
    await userEvent.click(card('Katherine Johnson'));

    await userEvent.click(confirmButton());

    await expect.element(page.getByText('Status: confirmed')).toBeVisible();
    await expect.element(page.getByText('Last confirmed booking: b-100')).toBeVisible();
  });

  test('shows whatever the backend serves', async ({ worker }) => {
    worker.use(bookingScenarios.withBookings([aBooking({ guestName: 'Grace Hopper', checkinDate: '2026-08-03' })]));
    renderCheckBooking();

    await expect.element(page.getByRole('heading', { name: 'Grace Hopper – 3.8.2026' })).toBeVisible();
    await expect.element(card('Katherine Johnson')).not.toBeInTheDocument();
  });

  test('reports a failed load', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());
    renderCheckBooking();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Bookings could not be loaded: GET /api/bookings failed: 500');
  });
});
