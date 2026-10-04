import type { Tree } from '@nx/devkit';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintTree, read } from '@mo-transfer/tooling-conventions/testing';
import { writeClientsJson } from '@mo-transfer/tooling-openapi/clients';
import { testingGenerator } from './generator';

const HANDLERS = 'libs/booking/testing/src/handlers/booking.handlers.ts';

/** A generated client of the slice as `nx g @mo-transfer/tooling-openapi:client` lays out its testing lib. */
function addTestingClient(tree: Tree, clientPath: string): void {
  tree.write(`libs/${clientPath}/testing/src/index.ts`, "export * from './generated';\n");
}

describe('testing generator', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createBlueprintTree();
  });

  describe('default: scaffold only (no examples, no fake data)', () => {
    it('writes empty-but-typed handlers + scenarios wired to shared/testing — no fixtures, no data', async () => {
      await testingGenerator(tree, { domain: 'booking', skipFormat: true });

      expect(read(tree, 'libs/booking/testing/src/index.ts')).toBe("export * from './handlers/booking.handlers';\n");
      expect(tree.exists('libs/booking/testing/src/fixtures')).toBe(false);
      const handlers = read(tree, HANDLERS);
      expect(handlers).toContain("import { type Scenarios, withBaseline } from '@mo-transfer/shared/testing';");
      expect(handlers).toContain("import type { HttpHandler } from 'msw';");
      expect(handlers).toContain('const curatedBookingHandlers: HttpHandler[] = [];');
      expect(handlers).toContain('export const bookingHandlers: HttpHandler[] = withBaseline(curatedBookingHandlers);');
      expect(handlers).toContain('export const bookingScenarios = {} satisfies Scenarios;');
      // no example data, no raw msw handlers
      expect(handlers).not.toMatch(/HttpResponse|aBooking|Example|'\/api\//);
    });

    it('layers the generated baseline of the slice\'s own clients: <client>Handlers for a faking engine, only <client>Http hint for mocks none', async () => {
      writeClientsJson(tree, {
        settings: { testing: { mocks: 'schema-faker' } },
        clients: {
          'booking/generated/booking-client': {},
          'booking/generated/lean-client': { pipeline: { testing: { mocks: 'none' } } },
          'generated/pet-client': {},
        },
      });
      for (const clientPath of ['booking/generated/booking-client', 'booking/generated/lean-client', 'generated/pet-client']) {
        addTestingClient(tree, clientPath);
      }

      await testingGenerator(tree, { domain: 'booking', skipFormat: true });

      const handlers = read(tree, HANDLERS);
      expect(handlers).toContain(
        "import { bookingClientHandlers } from '@mo-transfer/booking/generated/booking-client/testing';",
      );
      expect(handlers).toContain(
        'export const bookingHandlers: HttpHandler[] = withBaseline(curatedBookingHandlers, bookingClientHandlers);',
      );
      // typed curated handlers / scenarios: hint on every client's <client>Http
      expect(handlers).toContain('bookingClientHttp');
      expect(handlers).toContain('leanClientHttp');
      expect(handlers).not.toContain('leanClientHandlers');
      // shared clients are no slice baseline (the slice picks what it uses by hand)
      expect(handlers).not.toContain('petClient');
    });
  });

  describe('--examples: example fixtures, handlers and scenarios', () => {
    it('scaffolds fixtures + handlers + scenarios on top of the domain types', async () => {
      await testingGenerator(tree, { domain: 'booking', examples: true });

      expect(read(tree, 'libs/booking/testing/src/fixtures/booking.fixture.ts')).toContain(
        "import { Booking } from '@mo-transfer/booking/types';",
      );
      const handlers = read(tree, HANDLERS);
      expect(handlers).toContain("import { http, HttpResponse } from 'msw';");
      expect(handlers).toContain('export const bookingHandlers');
      expect(handlers).toContain('serverError: () =>');
    });

    it('declares the backend shape itself when the types lib has no entity', async () => {
      tree.write('libs/layout/types/src/index.ts', 'export {};\n');

      await testingGenerator(tree, { domain: 'layout', examples: true });

      const fixture = read(tree, 'libs/layout/testing/src/fixtures/layout.fixture.ts');
      expect(fixture).toContain('export interface Layout {');
      expect(fixture).not.toContain("from '@mo-transfer/layout/types'");
    });
  });

  it('keeps an existing testing lib and rejects unknown domains', async () => {
    tree.write('libs/booking/testing/src/index.ts', '// mine\n');
    await testingGenerator(tree, { domain: 'booking' });
    expect(read(tree, 'libs/booking/testing/src/index.ts')).toBe('// mine\n');

    await expect(testingGenerator(tree, { domain: 'bokking' })).rejects.toThrow('Unknown scope "bokking"');
  });
});
