/**
 * OpenAPI Overlay 1.0 (https://spec.openapis.org/overlay/v1.0.0): actions applied in order to the parsed spec.
 *
 *   overlay: 1.0.0
 *   info: { title: …, version: … }
 *   actions:
 *     - target: $.paths['/bookings'].get        JSONPath (subset, jsonpath.ts)
 *       update: { description: … }               objects merged recursively, arrays: appended
 *     - target: $.paths['/internal']
 *       remove: true
 *
 * A target that selects nothing is an error (a renamed path would otherwise silently drop the change).
 */
import { queryJsonPath } from './jsonpath';

interface OverlayAction {
  target?: string;
  description?: string;
  update?: unknown;
  remove?: boolean;
}

export interface OverlayDocument {
  overlay?: string;
  actions?: OverlayAction[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Overlay merge: properties of `update` replace/extend the target, nested objects recursively. */
function merge(target: Record<string, unknown>, update: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(update)) {
    if (isObject(target[key]) && isObject(value)) merge(target[key], value);
    else target[key] = structuredClone(value);
  }
}

/** Applies one overlay to `document` (mutated). `name` labels errors. */
export function applyOverlay(document: unknown, overlay: OverlayDocument, name: string): void {
  if (!/^1\./.test(String(overlay?.overlay ?? ''))) throw new Error(`${name}: not an OpenAPI Overlay 1.x document (overlay: 1.0.0)`);
  if (!Array.isArray(overlay.actions) || !overlay.actions.length) throw new Error(`${name}: no actions`);
  overlay.actions.forEach((action, index) => {
    const label = `${name} → actions[${index}]`;
    if (typeof action.target !== 'string') throw new Error(`${label}: target missing`);
    const nodes = queryJsonPath(document, action.target);
    if (!nodes.length) throw new Error(`${label}: target ${action.target} selects nothing`);
    if (action.remove) {
      // from the back: array indices of later siblings stay valid
      for (const { parent, key } of [...nodes].reverse()) {
        if (Array.isArray(parent)) parent.splice(key as number, 1);
        else if (parent) delete parent[key as string];
        else throw new Error(`${label}: the document root cannot be removed`);
      }
      return;
    }
    if (action.update === undefined) throw new Error(`${label}: neither update nor remove`);
    for (const { value } of nodes) {
      if (Array.isArray(value)) value.push(...(Array.isArray(action.update) ? action.update : [action.update]).map((item) => structuredClone(item)));
      else if (isObject(value) && isObject(action.update)) merge(value, action.update);
      else throw new Error(`${label}: update needs an object or array target (got ${JSON.stringify(value)})`);
    }
  });
}
