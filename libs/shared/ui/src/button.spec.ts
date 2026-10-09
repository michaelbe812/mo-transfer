import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { AppButton } from './button';

/** Test host: the shared button as every slice uses it — projected label, disabled input, clicked output. */
@Component({
  imports: [AppButton],
  template: `<app-button [disabled]="disabled()" (clicked)="clicks.set(clicks() + 1)">Save</app-button>
    <p role="status">{{ clicks() }} clicks</p>`,
})
class ButtonHost {
  readonly disabled = signal(false);
  protected readonly clicks = signal(0);
}

function render(): ButtonHost {
  return TestBed.createComponent(ButtonHost).componentInstance;
}

const saveButton = () => page.getByRole('button', { name: 'Save' });

describe('AppButton (isolated: reused by every slice)', () => {
  test('shows the projected label and reports every click', async () => {
    render();

    await userEvent.click(saveButton());
    await userEvent.click(saveButton());

    await expect.element(page.getByRole('status')).toHaveTextContent('2 clicks');
  });

  test('a disabled button cannot be clicked', async () => {
    const host = render();

    host.disabled.set(true);

    await expect.element(saveButton()).toBeDisabled();
  });
});
