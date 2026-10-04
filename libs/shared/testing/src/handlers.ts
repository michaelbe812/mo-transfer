import type { HttpHandler } from 'msw';

/**
 * Default handlers of a slice: its curated handlers (hand-written fixtures in the domain model) on top of the
 * generated baseline of its OpenAPI clients (`<client>Handlers`: one handler per operation, spec examples + faker).
 * MSW answers with the first matching handler, so curated ones win and the baseline covers every other
 * operation; a test's `worker.use(scenario)` is prepended and wins over both.
 *
 * `export const bookingHandlers = withBaseline(curatedBookingHandlers, bookingClientHandlers);`
 */
export function withBaseline(
  curated: readonly HttpHandler[],
  ...baselines: readonly (readonly HttpHandler[])[]
): HttpHandler[] {
  return [...curated, ...baselines.flat()];
}

/**
 * Named deviations of a slice for a single test (`worker.use(bookingScenarios.serverError())`); declare them with
 * `satisfies Scenarios` to keep their names and parameters.
 */
export type Scenarios = Record<string, (...args: never[]) => HttpHandler>;
