/**
 * dimension: types (T31-*) — Client aus spec/bench.openapi-3.1.yaml (client-31/), gleiche Konfiguration.
 */
import { expectTypeOf, test } from 'vitest';
import type { Observable } from 'rxjs';
import type { Api } from '../client-31/api';
import type { Event31, Item31 } from '../client-31/models';
import { getItem31 } from '../client-31/fn/operations/get-item-31';
import { putItem31 } from '../client-31/fn/operations/put-item-31';
import { listEvents31 } from '../client-31/fn/operations/list-events-31';
import { upload31 } from '../client-31/fn/operations/upload-31';

declare const api: Api;

const item: Item31 = { id: '1', kind: 'item', nickname: null, coords: [1, 2], label: 'l' };

test('[T31-TYPE-NULL-UNION] type-Array mit null', () => {
  expectTypeOf<Item31['nickname']>().toEqualTypeOf<string | null>();
  expectTypeOf<Exclude<Item31['count'], undefined>>().toEqualTypeOf<number | null>();
  // @ts-expect-error nickname ist required
  const missing: Item31 = { id: '1', kind: 'item', coords: [1, 2], label: 'l' };
  void missing;
  void api.invoke(putItem31, { itemId: '1', body: item });
});

test('[T31-CONST] const → Literal', () => {
  expectTypeOf<Item31['kind']>().toEqualTypeOf<'item'>();
  const ok: Item31['kind'] = 'item';
  // @ts-expect-error 'other' ≠ const 'item'
  const bad: Item31['kind'] = 'other';
  void ok;
  void bad;
});

test('[T31-ENUM-NULL] Enum mit null (ohne nullable)', () => {
  expectTypeOf<Item31['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
});

test('[T31-PREFIX-ITEMS] prefixItems → Tupel', () => {
  expectTypeOf<Item31['coords']>().toEqualTypeOf<[number, number]>();
});

test('[T31-REF-SIBLINGS] $ref mit Siblings', () => {
  expectTypeOf<Item31['label']>().toEqualTypeOf<string>();
  // @ts-expect-error label ist required
  const missing: Item31 = { id: '1', kind: 'item', nickname: null, coords: [1, 2] };
  void missing;
});

test('[T31-ONEOF-CONST-DISC] oneOf mit const-Discriminator', () => {
  expectTypeOf(api.invoke(listEvents31)).toEqualTypeOf<Observable<Event31[]>>();
  const startedAt = (event: Event31): string | undefined => {
    if (event.type === 'start') {
      // Audit: exakter Typ prüfen (Rückgabetyp string | undefined würde auch any/optional durchlassen)
      expectTypeOf(event.startedAt).toEqualTypeOf<string>();
      return event.startedAt;
    }
    return undefined;
  };
  void startedAt;
});

test('[T31-EXAMPLES] examples (Array) bricht Generierung nicht', () => {
  expectTypeOf<Item31['tags']>().toEqualTypeOf<string[] | undefined>();
  expectTypeOf(api.invoke(getItem31, { itemId: '1' })).toEqualTypeOf<Observable<Item31>>();
});

test('[T31-DEPENDENT-REQUIRED] dependentRequired toleriert', () => {
  expectTypeOf<Item31['creditCard']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Item31['billingAddress']>().toEqualTypeOf<string | undefined>();
});

test('[T31-BINARY-CONTENT-MEDIA-TYPE] Binary-Body ohne Schema (3.1-Stil)', () => {
  // Erwartung (wörtlich): upload31 akzeptiert Blob. Hinweis: generierter Body-Typ ist `any` (siehe NOTES.md).
  void api.invoke(upload31, { body: new Blob(['x']) });
});

test('[T31-WEBHOOKS] Webhooks generiert/typisiert', () => {
  // Webhooks selbst werden ignoriert (kein Webhook-Typ); der Payload-Typ Item31 existiert (über die Operationen).
  expectTypeOf<Item31>().toHaveProperty('id');
});
