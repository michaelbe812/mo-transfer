import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

/** Self-contained example component: a labelled input filtering a list (signals, zoneless). */
@Component({
  selector: 'app-guest-search',
  template: `
    <label for="guest-search">Search guest</label>
    <input id="guest-search" type="search" [value]="query()" (input)="query.set($any($event.target).value)" />
    <ul aria-label="Guests">
      @for (guest of matches(); track guest) {
        <li>{{ guest }}</li>
      }
    </ul>
    <p role="status">{{ matches().length }} found</p>
  `,
})
class GuestSearch {
  protected readonly query = signal('');
  protected readonly matches = computed(() =>
    ['Ada Lovelace', 'Grace Hopper', 'Margaret Hamilton'].filter((guest) =>
      guest.toLowerCase().includes(this.query().toLowerCase()),
    ),
  );
}

describe('GuestSearch', () => {
  test('filters while the user types', async () => {
    TestBed.createComponent(GuestSearch);
    const search = page.getByLabelText('Search guest');

    await userEvent.fill(search, 'ho');

    await expect.element(search).toHaveValue('ho');
    await expect.element(page.getByRole('status')).toHaveTextContent('1 found');
    await expect.element(page.getByRole('list', { name: 'Guests' }).getByRole('listitem')).toHaveTextContent('Grace Hopper');
  });

  test('typing appends key by key, clear resets', async () => {
    TestBed.createComponent(GuestSearch);
    const search = page.getByLabelText('Search guest');

    await userEvent.type(search, 'a');
    await expect.element(page.getByRole('status')).toHaveTextContent('3 found');

    await userEvent.type(search, 'da');
    await expect.element(page.getByRole('status')).toHaveTextContent('1 found');

    await userEvent.clear(search);
    await expect.element(page.getByRole('status')).toHaveTextContent('3 found');
  });
});
