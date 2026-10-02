/**
 * Typ-Tests (T31-*) für die OpenAPI-3.1-Spec. NSwag 14.7.1 bricht bei der Generierung ab
 * (`items: false` in Item31.coords → NJsonSchema JsonSerializationException), client-31/ enthält keinen Code
 * (siehe client-31/GENERATION-FAILED.txt).
 * Audit: T31-DEPENDENT-REQUIRED und T31-WEBHOOKS verlangen im expect wörtlich "Generierung bricht nicht" → fail.
 * Übrige Cases: kein Client → unsupported. Titel bewusst ohne Template-Literal (vitest typecheck liest Titel statisch).
 */
import { expectTypeOf, test } from 'vitest';

/** Zustand von client-31/ (kein generierter Code). */
type Generation31 = 'failed: NJsonSchema kann items: false nicht lesen';

test.skip('[T31-TYPE-NULL-UNION] type: [string, null] — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-CONST] const — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-ENUM-NULL] enum mit null — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-PREFIX-ITEMS] prefixItems → Tupel — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-REF-SIBLINGS] $ref mit Siblings — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-ONEOF-CONST-DISC] oneOf mit const-Discriminator — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test.skip('[T31-EXAMPLES] examples — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test('[T31-DEPENDENT-REQUIRED] dependentRequired — Generierung muss durchlaufen (bricht ab → fail)', () => {
  expectTypeOf<Generation31>().toEqualTypeOf<'ok'>();
});
test.skip('[T31-BINARY-CONTENT-MEDIA-TYPE] octet-stream ohne Schema — unsupported: NSwag-Generierung der 3.1-Spec bricht ab, kein Client', () => {});
test('[T31-WEBHOOKS] webhooks — Generierung muss durchlaufen (bricht ab → fail)', () => {
  expectTypeOf<Generation31>().toEqualTypeOf<'ok'>();
});
