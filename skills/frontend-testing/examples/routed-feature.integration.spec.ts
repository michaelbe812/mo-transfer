import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AUTH_API, type AuthApi } from '@myorg/auth/api';
import { aBooking, bookingScenarios } from '@myorg/booking/testing';
import { test, worker } from '@myorg/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { checkinRoutes } from './checkin.routes';

const signedInAgent: AuthApi = { user: signal({ id: 'u-1', name: 'Test Agent' }), isAuthenticated: signal(true) };

/** Integration test: start the slice like a user — through its real routes (lazy components included). */
async function navigateTo(url: string): Promise<void> {
  TestBed.configureTestingModule({
    providers: [provideRouter(checkinRoutes), { provide: AUTH_API, useValue: signedInAgent }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
}

describe('checkin slice (routed)', () => {
  beforeEach(() => worker.use(bookingScenarios.withBookings([aBooking({ id: 'b-7', guestName: 'Grace Hopper' })])));

  test('the default route is the check-in desk; a guest can be checked in', async () => {
    await navigateTo('/');

    await expect.element(page.getByRole('heading', { name: 'Check-in desk' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Load arrivals' }));
    await userEvent.click(page.getByRole('button', { name: 'Check in Grace Hopper' }));

    await expect.element(page.getByRole('heading', { name: 'Checked in today (1)' })).toBeVisible();
  });

  test('/history renders the history feature', async () => {
    await navigateTo('/history');

    await expect.element(page.getByRole('heading', { name: 'Check-in history' })).toBeVisible();
  });
});
