import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { Highlight } from './highlight';

/** Test host: one element per variant of the directive (default, custom input). */
@Component({
  imports: [Highlight],
  template: `
    <p appHighlight>default</p>
    <p appHighlight="lightblue">custom</p>
  `,
})
class HighlightHost {}

function render(): void {
  TestBed.createComponent(HighlightHost);
}

describe('Highlight', () => {
  test('highlights yellow while hovered', async () => {
    render();
    const paragraph = page.getByText('default');

    await userEvent.hover(paragraph);
    await expect.element(paragraph).toHaveStyle({ backgroundColor: 'yellow' });

    await userEvent.unhover(paragraph);
    await expect.element(paragraph).not.toHaveStyle({ backgroundColor: 'yellow' });
  });

  test('uses the color passed as input', async () => {
    render();
    const paragraph = page.getByText('custom');

    await userEvent.hover(paragraph);

    await expect.element(paragraph).toHaveStyle({ backgroundColor: 'lightblue' });
  });
});
