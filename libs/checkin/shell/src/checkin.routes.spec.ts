import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { anArrival, checkinHandlers, checkinScenarios } from '@mo-transfer/checkin/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { checkinRoutes } from './checkin.routes';

/** Integration test: start the checkin slice like a user — through its real routes (lazy feat containers). */
async function navigateTo(url: string): Promise<RouterTestingHarness> {
  TestBed.configureTestingModule({ providers: [provideRouter(checkinRoutes)] });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return harness;
}

describe('checkin slice (routed, backend via MSW)', () => {
  beforeEach(() => worker.use(...checkinHandlers));

  test('the default route is the check-in desk; a guest can be checked in', async ({ worker }) => {
    worker.use(checkinScenarios.withArrivals([anArrival({ bookingId: 'b-7', guestName: 'Grace Hopper' })]));
    await navigateTo('/');

    await expect.element(page.getByRole('heading', { name: 'Check-in desk' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Load arrivals' }));
    await userEvent.click(page.getByRole('button', { name: 'Check in Grace Hopper' }));

    // the loaded check-in of the slice defaults + the new one
    await expect.element(page.getByRole('heading', { name: 'Checked in today (2)' })).toBeVisible();
  });

  test('/history renders the check-in history', async () => {
    await navigateTo('/history');

    await expect.element(page.getByRole('heading', { name: 'Check-in history' })).toBeVisible();
  });

  test('a walk-in checked in at the desk shows up in the history (state of the slice root)', async () => {
    const harness = await navigateTo('/');
    await userEvent.click(page.getByRole('button', { name: 'Walk-in guest' }));

    await harness.navigateByUrl('/history');

    await expect.element(page.getByRole('heading', { name: 'Check-in history' })).toBeVisible();
    await expect.element(page.getByText(/^Walk-in guest \(walk-in\) — /)).toBeVisible();
    await expect.element(page.getByText(/^Katherine Johnson \(b-100\) — /)).toBeVisible();
  });
});
