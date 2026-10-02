import { describe, expectTypeOf, test } from 'vitest';
import type { Observable } from 'rxjs';
import type { Event31, Item31 } from '../client-31/model';
import type { DefaultService } from '../client-31/default/default.service';

declare const api: DefaultService;
declare const blob: Blob;

describe('openapi 3.1', () => {
  test('[T31-TYPE-NULL-UNION] nickname string | null (required), count number | null', () => {
    expectTypeOf<Item31['nickname']>().toEqualTypeOf<string | null>();
    // count ist optional → undefined ausgeklammert:
    expectTypeOf<Exclude<Item31['count'], undefined>>().toEqualTypeOf<number | null>();
  });
  test('[T31-CONST] kind exakt item', () => {
    expectTypeOf<Item31['kind']>().toEqualTypeOf<'item'>();
    const control: Item31['kind'] = 'item';
    void control;
    // @ts-expect-error other ist nicht const item
    const bad: Item31['kind'] = 'other';
    void bad;
  });
  test('[T31-ENUM-NULL] level low | high | null (optional)', () => {
    expectTypeOf<Item31['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
  });
  test('[T31-PREFIX-ITEMS] coords [number, number]', () => {
    expectTypeOf<Item31['coords']>().toEqualTypeOf<[number, number]>();
  });
  test('[T31-REF-SIBLINGS] label string (required)', () => {
    expectTypeOf<Item31['label']>().toEqualTypeOf<string>();
  });
  test('[T31-ONEOF-CONST-DISC] Event31 narrowt über type', () => {
    const f = (e: Event31): string => (e.type === 'start' ? e.startedAt : e.reason);
    expectTypeOf(f).returns.toEqualTypeOf<string>();
    expectTypeOf(api.listEvents31()).toEqualTypeOf<Observable<Event31[]>>();
  });
  test('[T31-EXAMPLES] tags string[] optional', () => {
    expectTypeOf<Item31['tags']>().toEqualTypeOf<string[] | undefined>();
  });
  test('[T31-DEPENDENT-REQUIRED] creditCard/billingAddress optionale strings', () => {
    expectTypeOf<Item31['creditCard']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Item31['billingAddress']>().toEqualTypeOf<string | undefined>();
  });
  test('[T31-BINARY-CONTENT-MEDIA-TYPE] upload31 akzeptiert Blob', () => {
    expectTypeOf(api.upload31(blob)).toEqualTypeOf<Observable<void>>();
  });
  test('[T31-WEBHOOKS] Webhook-Payload-Typ (Item31) existiert, Generierung bricht nicht', () => {
    // Orval ignoriert webhooks (kein onItemChanged-Typ/-Handler), der Payload-Typ Item31 existiert aber.
    expectTypeOf<Item31['id']>().toEqualTypeOf<string>();
  });
});
