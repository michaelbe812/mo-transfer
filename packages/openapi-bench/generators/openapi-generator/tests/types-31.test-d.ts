import { expectTypeOf, test } from 'vitest';
import type { Item31 } from '../client-31/model/item31';
import type { Event31 } from '../client-31/model/event31';
import type { DefaultService, OnItemChangedRequestParams } from '../client-31/api/default.service';

declare const api31: DefaultService;
declare const blob: Blob;

test('[T31-TYPE-NULL-UNION] nickname string|null (required), count number|null', () => {
  expectTypeOf<Item31['nickname']>().toEqualTypeOf<string | null>();
  // count ist nicht required → zusätzlich undefined
  expectTypeOf<Item31['count']>().toEqualTypeOf<number | null | undefined>();
});
test('[T31-CONST] kind exakt "item"', () => {
  expectTypeOf<Item31['kind']>().toEqualTypeOf<'item'>();
  // @ts-expect-error 'other' ist nicht const
  const bad: Item31['kind'] = 'other';
  void bad;
});
test('[T31-ENUM-NULL] level low|high|null (optional)', () => {
  expectTypeOf<Item31['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
});
test('[T31-PREFIX-ITEMS] coords [number, number]', () => {
  expectTypeOf<Item31['coords']>().toEqualTypeOf<[number, number]>();
});
test('[T31-REF-SIBLINGS] label string required', () => {
  expectTypeOf<Item31['label']>().toEqualTypeOf<string>();
});
test('[T31-ONEOF-CONST-DISC] Event31 narrowt über type', () => {
  const e = {} as Event31;
  if (e.type === 'start') {
    expectTypeOf(e.startedAt).toEqualTypeOf<string>();
  } else {
    expectTypeOf(e.reason).toEqualTypeOf<string>();
    // @ts-expect-error startedAt existiert nur auf StartEvent31
    void e.startedAt;
  }
});
test('[T31-EXAMPLES] tags string[] optional', () => {
  expectTypeOf<Item31['tags']>().toEqualTypeOf<string[] | undefined>();
});
test('[T31-DEPENDENT-REQUIRED] creditCard/billingAddress optionale strings', () => {
  expectTypeOf<Item31['creditCard']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Item31['billingAddress']>().toEqualTypeOf<string | undefined>();
});
test('[T31-BINARY-CONTENT-MEDIA-TYPE] upload31 akzeptiert Blob', () => {
  // DefaultService (Pfade) wird vom Webhook-DefaultService überschrieben (Duplicate file path) → upload31 fehlt
  api31.upload31({ body: blob });
});
test('[T31-WEBHOOKS] Webhook-Payload-Typ existiert', () => {
  expectTypeOf<NonNullable<OnItemChangedRequestParams['item31']>>().toEqualTypeOf<Item31>();
});
