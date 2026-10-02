/** Typ-Tests (T31-*) für openapi-typescript + openapi-fetch, generiert aus der 3.1-Spec (client-31/). */
import { describe, expectTypeOf, test } from 'vitest';
import createClient from 'openapi-fetch';
import type { components, paths, webhooks } from '../client-31/schema';

type S = components['schemas'];
type Item = S['Item31'];

const client = createClient<paths>({ baseUrl: 'http://test.local/api' });

describe('types-31', () => {
  test('[T31-TYPE-NULL-UNION] nickname string|null (required), count number|null', () => {
    expectTypeOf<Item['nickname']>().toEqualTypeOf<string | null>();
    // count ist nicht required → zusätzlich undefined
    expectTypeOf<Item['count']>().toEqualTypeOf<number | null | undefined>();
    // @ts-expect-error nickname ist required
    const noNick: Item = { id: 'i', kind: 'item', coords: [1, 2], label: 'l' };
    void noNick;
  });

  test('[T31-CONST] kind exakt item', () => {
    expectTypeOf<Item['kind']>().toEqualTypeOf<'item'>();
    const ok: Item['kind'] = 'item';
    // @ts-expect-error 'other' ≠ const 'item'
    const bad: Item['kind'] = 'other';
    void [ok, bad];
  });

  test('[T31-ENUM-NULL] level low|high|null (optional)', () => {
    expectTypeOf<Item['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
  });

  test('[T31-PREFIX-ITEMS] coords [number, number]', () => {
    expectTypeOf<Item['coords']>().toEqualTypeOf<[number, number]>();
  });

  test('[T31-REF-SIBLINGS] label string (required)', () => {
    expectTypeOf<Item['label']>().toEqualTypeOf<string>();
  });

  test('[T31-ONEOF-CONST-DISC] Event31 narrowt über type', () => {
    function describeEvent(event: S['Event31']): string {
      if (event.type === 'start') {
        expectTypeOf(event.startedAt).toEqualTypeOf<string>();
        return event.startedAt;
      }
      // @ts-expect-error startedAt existiert nicht auf StopEvent31
      return event.startedAt;
    }
    void describeEvent;
  });

  test('[T31-EXAMPLES] tags string[] (optional)', () => {
    expectTypeOf<Item['tags']>().toEqualTypeOf<string[] | undefined>();
  });

  test('[T31-DEPENDENT-REQUIRED] creditCard/billingAddress optional string', () => {
    expectTypeOf<Item['creditCard']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Item['billingAddress']>().toEqualTypeOf<string | undefined>();
  });

  test('[T31-BINARY-CONTENT-MEDIA-TYPE] upload31 akzeptiert Blob', () => {
    // Body ist als `unknown` typisiert (octet-stream ohne Schema) → Blob passt, aber auch alles andere.
    void client.POST('/v31/upload', { body: new Blob(['x']) });
  });

  test('[T31-WEBHOOKS] Webhook-Payload Item31 typisiert', () => {
    type Payload = NonNullable<webhooks['itemChanged']['post']['requestBody']>['content']['application/json'];
    expectTypeOf<Payload>().toEqualTypeOf<Item>();
  });
});
