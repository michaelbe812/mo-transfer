// Dimension types (T31-*) – Client aus spec/bench.openapi-3.1.yaml.
import { expectTypeOf, test } from 'vitest';
import { listEvents31, upload31 } from '../client-31/sdk.gen';
import type { Event31, Item31, OnItemChangedWebhookPayload, OnItemChangedWebhookRequest } from '../client-31/types.gen';

test('[T31-TYPE-NULL-UNION] type: [string, null]', () => {
  expectTypeOf<Item31['nickname']>().toEqualTypeOf<string | null>();
  expectTypeOf<Item31['count']>().toEqualTypeOf<number | null | undefined>();
});

test('[T31-CONST] const → literal', () => {
  expectTypeOf<Item31['kind']>().toEqualTypeOf<'item'>();
  // @ts-expect-error 'other' ist nicht 'item'
  const bad: Item31['kind'] = 'other';
  void bad;
});

test('[T31-ENUM-NULL] enum mit null', () => {
  expectTypeOf<Item31['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
});

test('[T31-PREFIX-ITEMS] prefixItems → Tupel', () => {
  expectTypeOf<Item31['coords']>().toEqualTypeOf<[number, number]>();
});

test('[T31-REF-SIBLINGS] $ref mit Siblings', () => {
  expectTypeOf<Item31['label']>().toEqualTypeOf<string>();
});

test('[T31-ONEOF-CONST-DISC] Event31 narrowt über type', () => {
  const handle = (e: Event31) => {
    if (e.type === 'start') {
      expectTypeOf(e.startedAt).toEqualTypeOf<string>();
    }
  };
  void handle;
  void listEvents31();
});

test('[T31-EXAMPLES] tags string[]', () => {
  expectTypeOf<Item31['tags']>().toEqualTypeOf<string[] | undefined>();
});

test('[T31-DEPENDENT-REQUIRED] creditCard/billingAddress optional', () => {
  expectTypeOf<Item31['creditCard']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Item31['billingAddress']>().toEqualTypeOf<string | undefined>();
});

test('[T31-BINARY-CONTENT-MEDIA-TYPE] upload31 akzeptiert Blob', () => {
  void upload31({ body: new Blob() });
  // Hinweis: body ist `unknown` (akzeptiert alles) – Blob wird akzeptiert, aber nicht erzwungen.
});

test('[T31-WEBHOOKS] Webhook-Payload-Typ existiert', () => {
  expectTypeOf<OnItemChangedWebhookPayload>().toEqualTypeOf<Item31>();
  expectTypeOf<OnItemChangedWebhookRequest['body']>().toEqualTypeOf<Item31>();
});
