import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { test } from '@mo-transfer/shared/testing';
import { describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { bookingRoutes } from './booking.routes';

/** Integration test: start the booking slice like a user — through its real routes (lazy feat containers). */
async function navigateTo(url: string): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({ providers: [provideRouter(bookingRoutes)] });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return harness;
}

describe('booking slice (routed)', () => {
  test('the default route is the booking check', async () => {
    await navigateTo('/');

    await expect.element(page.getByRole('heading', { name: 'Check bookings' })).toBeVisible();
  });

  test('/manage renders the booking management', async () => {
    await navigateTo('/manage');

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
  });

  test('a booking confirmed in the check shows up in the management (state of the slice root)', async () => {
    const harness = await navigateTo('/');
    await userEvent.click(page.getByRole('heading', { name: /^Ada Lovelace – / }));
    await userEvent.click(page.getByRole('button', { name: 'Confirm' }));

    await harness.navigateByUrl('/manage');

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Ada Lovelace – 1.8.2026' })).toBeVisible();
  });
});
