import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { bookingHandlers } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { bookingRoutes } from './booking.routes';

/** Integration test: start the booking slice like a user — through its real routes (lazy feat containers). */
async function navigateTo(url: string): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({ providers: [provideRouter(bookingRoutes)] });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return harness;
}

describe('booking slice (routed, backend via MSW)', () => {
  beforeEach(() => worker.use(...bookingHandlers));

  test('the default route is the booking check', async () => {
    await navigateTo('/');

    await expect.element(page.getByRole('heading', { name: 'Check bookings' })).toBeVisible();
  });

  test('/manage renders the booking management', async () => {
    await navigateTo('/manage');

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
  });

  test('a booking confirmed in the check shows up in the management, with the last check (slice root state)', async () => {
    const harness = await navigateTo('/');
    await userEvent.click(page.getByRole('heading', { name: /^Katherine Johnson – / }));
    await userEvent.click(page.getByRole('button', { name: 'Confirm' }));

    await harness.navigateByUrl('/manage');

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Katherine Johnson – 1.10.2026' })).toBeVisible();
    await expect.element(page.getByText(/^Booking b-100 checked at /)).toBeVisible();
  });
});
