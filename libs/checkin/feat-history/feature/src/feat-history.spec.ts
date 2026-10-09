import { TestBed } from '@angular/core/testing';
import { checkinHandlers } from '@mo-transfer/checkin/testing';
import { CheckinStore } from '@mo-transfer/checkin/state';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page } from 'vitest/browser';
import { FeatHistory } from './feat-history';

/** Real container + real CheckinStore (shared with the sibling feat via the slice root); backend via MSW. */
function renderHistory(): void {
  TestBed.createComponent(FeatHistory);
}

describe('FeatHistory (rendered in Chromium, backend via MSW)', () => {
  beforeEach(() => worker.use(...checkinHandlers));

  test('reports a clear desk and no check-ins in a fresh session', async () => {
    renderHistory();

    await expect.element(page.getByRole('heading', { name: 'Check-in history' })).toBeVisible();
    await expect.element(page.getByText('Desk clear — no open arrivals')).toBeVisible();
    await expect.element(page.getByRole('listitem')).not.toBeInTheDocument();
  });

  test('lists the check-ins the slice loaded, with guest, booking and time', async () => {
    // arrange through the store's public API: the history only shows what the slice holds
    await TestBed.inject(CheckinStore).load();

    renderHistory();

    await expect
      .element(page.getByRole('listitem'))
      .toHaveTextContent('Katherine Johnson (b-100) — 2026-10-01T14:00:00.000Z');
  });
});
