import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { test } from '@mo-transfer/shared/testing';
import { describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { LayoutShell } from './layout.shell';

// stand-ins for the slices the app composes into the layout — layout never imports a slice
@Component({ template: '<h1>Bookings page</h1>' })
class BookingsPage {}

@Component({ template: '<h1>Check-in page</h1>' })
class CheckinPage {}

/** Routed like in app.routes.ts: the layout shell hosts the slices as child routes. */
async function navigateTo(url: string): Promise<void> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: LayoutShell,
          children: [
            { path: 'bookings', component: BookingsPage },
            { path: 'checkin', component: CheckinPage },
          ],
        },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
}

describe('LayoutShell (routed)', () => {
  test('renders the navigation and the current slice in the main area', async () => {
    await navigateTo('/bookings');

    await expect.element(page.getByRole('link', { name: 'Bookings' })).toBeVisible();
    await expect.element(page.getByRole('link', { name: 'Check-in' })).toBeVisible();
    await expect.element(page.getByRole('main').getByRole('heading', { name: 'Bookings page' })).toBeVisible();
  });

  test('the navigation switches between the slices', async () => {
    await navigateTo('/bookings');

    await userEvent.click(page.getByRole('link', { name: 'Check-in' }));

    await expect.element(page.getByRole('heading', { name: 'Check-in page' })).toBeVisible();
    expect(TestBed.inject(Router).url).toBe('/checkin');
  });
});
