import { TestBed } from '@angular/core/testing';
import { anArrival, checkinHandlers, checkinScenarios } from '@mo-transfer/checkin/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page } from 'vitest/browser';
import { FeatCheckin } from './feat-checkin';

function renderDesk(): void {
  TestBed.createComponent(FeatCheckin);
}

describe('FeatCheckin (rendered in Chromium, backend via MSW)', () => {
  // the desk loads arrivals through checkin's own data-access layer (CheckinApi) — no booking import.
  // Slice defaults: curated check-ins + the generated baseline (arrivals: media example of the checkin-client spec)
  beforeEach(() => worker.use(...checkinHandlers));

  test('loads the default arrivals on click and renders one check-in button per guest', async () => {
    renderDesk();

    await page.getByRole('button', { name: 'Load arrivals' }).click();

    await expect.element(page.getByText('2 arrivals')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Check in Katherine Johnson' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Check in Margaret Hamilton' })).toBeVisible();
  });

  test('checking a guest in moves them from arrivals to today’s list', async ({ worker }) => {
    worker.use(
      checkinScenarios.withArrivals([
        anArrival({ bookingId: 'b-7', guestName: 'Grace Hopper' }),
        anArrival({ bookingId: 'b-8', guestName: 'Ada Lovelace' }),
      ]),
    );
    renderDesk();
    await page.getByRole('button', { name: 'Load arrivals' }).click();

    await page.getByRole('button', { name: 'Check in Grace Hopper' }).click();

    await expect.element(page.getByText('1 arrival', { exact: true })).toBeVisible();
    // the loaded check-in of the slice defaults + the new one
    await expect.element(page.getByText('Checked in today (2)')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Check in Grace Hopper' })).not.toBeInTheDocument();
  });

  test('shows no arrivals when the backend has none', async ({ worker }) => {
    worker.use(checkinScenarios.noArrivals());
    renderDesk();

    await page.getByRole('button', { name: 'Load arrivals' }).click();

    await expect.element(page.getByText('0 arrivals')).toBeVisible();
  });
});
