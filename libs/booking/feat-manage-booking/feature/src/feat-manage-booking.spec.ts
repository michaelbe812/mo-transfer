import { TestBed } from '@angular/core/testing';
import { test } from '@mo-transfer/shared/testing';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FeatManageBooking } from './feat-manage-booking';

/** Real container + real BookingStore. No HTTP: an unexpected request turns red (MSW). */
function renderManageBooking(): void {
  TestBed.createComponent(FeatManageBooking);
}

describe('FeatManageBooking (rendered in Chromium)', () => {
  // time is not ours: the last-check line shows "now" — fake only Date
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  test('lists only the confirmed bookings', async () => {
    renderManageBooking();

    await expect.element(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Grace Hopper – 3.8.2026' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: /^Ada Lovelace/ })).not.toBeInTheDocument();
  });

  test('shows the last booking check with its time', async () => {
    renderManageBooking();

    await expect.element(page.getByText('Booking b2 checked at 2026-10-01T08:30:00.000Z')).toBeVisible();
  });
});
