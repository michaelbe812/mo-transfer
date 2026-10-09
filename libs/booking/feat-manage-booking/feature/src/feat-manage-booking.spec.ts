import { TestBed } from '@angular/core/testing';
import { bookingConfirmed, BookingStore } from '@mo-transfer/booking/state';
import { bookingHandlers, bookingScenarios } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FeatManageBooking } from './feat-manage-booking';

/** Real container + real BookingStore (slice root, shared with the sibling feat); the backend is served by MSW. */
function renderManageBooking(): void {
  TestBed.createComponent(FeatManageBooking);
}

describe('FeatManageBooking (rendered in Chromium, backend via MSW)', () => {
  // slice defaults: curated bookings (b-100 Katherine Johnson pending, b-101 Margaret Hamilton confirmed)
  beforeEach(() => worker.use(...bookingHandlers));

  test('loads and lists only the confirmed bookings', async () => {
    renderManageBooking();

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Margaret Hamilton – 1.10.2026' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: /^Katherine Johnson/ })).not.toBeInTheDocument();
  });

  test('says so when no booking was checked yet', async () => {
    renderManageBooking();

    await expect.element(page.getByText('No booking checked yet.')).toBeVisible();
  });

  describe('after a booking was confirmed in the slice', () => {
    // time is not ours: the last check carries "now" — fake only Date
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    test('shows the last check with booking and time', async () => {
      // arrange through the slice root's public API (in the app: feat-check-booking confirms)
      const store = TestBed.inject(BookingStore);
      await store.ensureLoaded();
      store.handle(bookingConfirmed('b-100'));

      renderManageBooking();

      await expect.element(page.getByText('Booking b-100 checked at 2026-10-01T08:30:00.000Z')).toBeVisible();
      await expect.element(page.getByRole('heading', { name: 'Katherine Johnson – 1.10.2026' })).toBeVisible();
    });
  });

  test('reports a failed load', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());
    renderManageBooking();

    await expect.element(page.getByRole('alert')).toHaveTextContent('Bookings could not be loaded');
  });
});
