/** Dimension "types" (T31-*) für ng-openapi 0.4.1, Client aus spec/bench.openapi-3.1.yaml (client-31/). */
import { describe, expectTypeOf, test } from 'vitest';
import type { Event31, Item31 } from '../client-31/models';
import type { UploadService } from '../client-31/services';

declare const upload: UploadService;
declare const blob: Blob;

describe('ng-openapi types: OpenAPI 3.1', () => {
  test('[T31-TYPE-NULL-UNION] nickname string | null (required), count number | null', () => {
    expectTypeOf<Item31['nickname']>().toEqualTypeOf<string | null>();
    // @ts-expect-error nickname ist required
    const missingNickname: Item31 = { id: 'i', kind: 'item', coords: [1, 2], label: 'l' };
    expectTypeOf<NonNullable<Item31['count']> | null>().toEqualTypeOf<number | null>();
    const nullCount: Item31['count'] = null;
    void [missingNickname, nullCount];
  });

  test('[T31-CONST] kind exakt item', () => {
    expectTypeOf<Item31['kind']>().toEqualTypeOf<'item'>();
    const ok: Item31['kind'] = 'item';
    // @ts-expect-error 'other' ist nicht const 'item'
    const other: Item31['kind'] = 'other';
    void [ok, other];
  });

  test('[T31-ENUM-NULL] level low|high|null optional', () => {
    expectTypeOf<Item31['level']>().toEqualTypeOf<'low' | 'high' | null | undefined>();
  });

  test('[T31-PREFIX-ITEMS] coords [number, number]', () => {
    expectTypeOf<Item31['coords']>().toEqualTypeOf<[number, number]>();
  });

  test('[T31-REF-SIBLINGS] label string required', () => {
    expectTypeOf<Item31['label']>().toEqualTypeOf<string>();
  });

  test('[T31-ONEOF-CONST-DISC] Event31 narrowt über type', () => {
    const startedAt = (event: Event31): string | undefined => {
      if (event.type === 'start') {
        expectTypeOf(event.startedAt).toEqualTypeOf<string>();
        return event.startedAt;
      }
      return undefined;
    };
    void startedAt;
  });

  test('[T31-EXAMPLES] tags string[] optional', () => {
    expectTypeOf<Item31['tags']>().toEqualTypeOf<string[] | undefined>();
  });

  test('[T31-DEPENDENT-REQUIRED] creditCard/billingAddress optionale strings', () => {
    expectTypeOf<Item31['creditCard']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Item31['billingAddress']>().toEqualTypeOf<string | undefined>();
  });

  test('[T31-BINARY-CONTENT-MEDIA-TYPE] upload31 akzeptiert Blob', () => {
    // ng-openapi verwirft den schemalosen octet-stream-Body → upload31 hat keinen Body-Parameter.
    upload.upload31(blob);
  });

  test('[T31-WEBHOOKS] Typ für Webhook-Payload (Item31) existiert', () => {
    expectTypeOf<Item31>().toHaveProperty('id');
    expectTypeOf<Item31['id']>().toEqualTypeOf<string>();
  });
});
