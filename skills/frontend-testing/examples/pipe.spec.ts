import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { FormatPipe, FormatType } from './format-pipe';

// Intl puts a (narrow) no-break space before € and %.
const normalize = (text: string) => text.replace(/[  ]/g, ' ');

// Unit test: the transform matrix, no TestBed.
describe('FormatPipe', () => {
  const pipe = new FormatPipe();
  const format = (...args: Parameters<FormatPipe['transform']>) => normalize(pipe.transform(...args));

  test('formats German style by default', () => {
    expect(format(1234.567)).toBe('1.234,57');
    expect(format(1234.5, 'currency')).toBe('1.234,50 €');
  });

  test('returns an empty string for empty or invalid input', () => {
    expect(format(null)).toBe('');
    expect(format('abc')).toBe('');
  });
});

/** Test host: the pipe used in a template, driven through form fields like a user would. */
@Component({
  imports: [FormatPipe],
  template: `
    <label>
      Amount
      <input [value]="amount()" (input)="amount.set($any($event.target).value)" />
    </label>
    <label>
      Format
      <select (change)="type.set($any($event.target).value)">
        <option value="number">Number</option>
        <option value="currency">Currency</option>
      </select>
    </label>
    <output>{{ amount() | format: type() }}</output>
  `,
})
class FormatHost {
  protected readonly amount = signal('');
  protected readonly type = signal<FormatType>('number');
}

function render(): void {
  TestBed.createComponent(FormatHost);
}

const amountInput = () => page.getByRole('textbox', { name: 'Amount' });
const formatSelect = () => page.getByRole('combobox', { name: 'Format' });
const result = () => page.getByRole('status');

// UI test: pipe in a template, via the page API.
describe('FormatPipe (template)', () => {
  test('formats the typed amount', async () => {
    render();

    await userEvent.fill(amountInput(), '1000000');

    await expect.element(result()).toHaveTextContent('1.000.000,00');
  });

  test('re-formats when the user picks another format', async () => {
    render();
    await userEvent.fill(amountInput(), '1000000');

    await userEvent.selectOptions(formatSelect(), 'Currency');

    await expect.element(result()).toHaveTextContent('1.000.000,00 €');
  });
});
