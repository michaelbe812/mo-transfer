import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { anArrival, checkinHandlers, checkinScenarios } from '@mo-transfer/checkin/testing';
import { AuthStore } from '@mo-transfer/shared/state';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FeatCheckin } from './feat-checkin';

/** Auth is not ours: fake the shared AuthStore by its class (no tokens, no ports). */
const signedInAgent: Pick<AuthStore, 'user' | 'isAuthenticated'> = {
  user: signal({ id: 'u-1', name: 'Test Agent' }),
  isAuthenticated: signal(true),
};

/** Renders the real container with real stores and data-access; only auth is faked, HTTP goes through MSW. */
function renderDesk(): void {
  TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: signedInAgent }] });
  TestBed.createComponent(FeatCheckin);
}

// Locators read the page as a user does (role + accessible name). expect.element retries
// until the DOM matches, so there is no detectChanges(), whenStable() or manual waiting.
const loadArrivalsButton = () => page.getByRole('button', { name: 'Load arrivals' });
const checkInButton = (guestName: string) => page.getByRole('button', { name: `Check in ${guestName}` });

describe('FeatCheckin', () => {
  // the desk loads arrivals through checkin's own data-access (CheckinApi → checkin-client) — no booking import.
  // Slice defaults: curated check-ins + the generated baseline of the slice's clients
  beforeEach(() => worker.use(...checkinHandlers));

  test('shows the signed-in agent', async () => {
    renderDesk();

    await expect.element(page.getByText('Agent: Test Agent')).toBeVisible();
  });

  test('loads arrivals and offers one check-in per guest', async ({ worker }) => {
    worker.use(
      checkinScenarios.withArrivals([
        anArrival({ bookingId: 'b-7', guestName: 'Grace Hopper' }),
        anArrival({ bookingId: 'b-8', guestName: 'Ada Lovelace' }),
      ]),
    );
    renderDesk();

    await userEvent.click(loadArrivalsButton());

    await expect.element(page.getByText('2 arrivals')).toBeVisible();
    await expect.element(checkInButton('Grace Hopper')).toBeVisible();
    await expect.element(checkInButton('Ada Lovelace')).toBeVisible();
  });

  test('checking a guest in moves them from arrivals to today’s list', async ({ worker }) => {
    worker.use(checkinScenarios.withArrivals([anArrival({ bookingId: 'b-7', guestName: 'Grace Hopper' })]));
    renderDesk();
    await userEvent.click(loadArrivalsButton());

    await userEvent.click(checkInButton('Grace Hopper'));

    await expect.element(page.getByText('0 arrivals')).toBeVisible();
    // the loaded check-in of the slice defaults + the new one
    await expect.element(page.getByText('Checked in today (2)')).toBeVisible();
    await expect.element(checkInButton('Grace Hopper')).not.toBeInTheDocument();
  });

  test('shows no arrivals when the backend has none', async ({ worker }) => {
    worker.use(checkinScenarios.noArrivals());
    renderDesk();

    await userEvent.click(loadArrivalsButton());

    await expect.element(page.getByText('0 arrivals')).toBeVisible();
    await expect.element(page.getByRole('button', { name: /^Check in / })).not.toBeInTheDocument();
  });
});
