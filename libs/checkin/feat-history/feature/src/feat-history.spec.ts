import { TestBed } from '@angular/core/testing';
import { checkinHandlers, checkinScenarios } from '@mo-transfer/checkin/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page } from 'vitest/browser';
import { FeatHistory } from './feat-history';

/** Real container + real CheckinStore (shared with the sibling feat via the slice root); backend via MSW. */
function renderHistory(): void {
  TestBed.createComponent(FeatHistory);
}

describe('FeatHistory (rendered in Chromium, backend via MSW)', () => {
  // slice defaults: curated check-ins (c-1 Katherine Johnson, b-100)
  beforeEach(() => worker.use(...checkinHandlers));

  test('loads and lists the check-ins with guest, booking and time', async () => {
    renderHistory();

    await expect.element(page.getByRole('heading', { name: 'Check-in history' })).toBeVisible();
    await expect
      .element(page.getByRole('listitem'))
      .toHaveTextContent('Katherine Johnson (b-100) — 2026-10-01T14:00:00.000Z');
  });

  test('shows an empty history when the backend has no check-ins', async ({ worker }) => {
    worker.use(checkinScenarios.empty());
    renderHistory();

    await expect.element(page.getByText('Desk clear — no open arrivals')).toBeVisible();
    await expect.element(page.getByRole('listitem')).not.toBeInTheDocument();
  });

  test('reports a failed load', async ({ worker }) => {
    worker.use(checkinScenarios.serverError());
    renderHistory();

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Check-ins could not be loaded: GET /api/checkins failed: 500');
  });
});
