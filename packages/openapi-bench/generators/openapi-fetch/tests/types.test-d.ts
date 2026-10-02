/**
 * Typ-Tests (T-*) für openapi-typescript + openapi-fetch.
 * Idiomatische Nutzung: Modelle über components['schemas'] (bzw. Root-Types), Operationen über createClient<paths>().
 * Response-Sicht = Readable<Model> (so liefert openapi-fetch `data`), Request-Sicht = Writable<Model>.
 * Regel (s. NOTES.md): keine manuelle Wire-Konfiguration pro Aufruf (kein parseAs/bodySerializer/Media-Generic),
 * außer der Case verlangt explizit eine Auswahl.
 */
import { describe, expectTypeOf, test } from 'vitest';
import createClient from 'openapi-fetch';
import { Priority } from '../client/schema';
import type { components, operations, paths, Readable, SchemaUserProfile, Writable } from '../client/schema';

type S = components['schemas'];
type PetResponse = Readable<S['Pet']>;
type PetRequest = Writable<S['Pet']>;

const client = createClient<paths>({ baseUrl: 'http://test.local/api' });

describe('types-models', () => {
  test('[T-PRIM-STRING] string → string', () => {
    expectTypeOf<S['Primitives']['str']>().toEqualTypeOf<string>();
  });

  test('[T-PRIM-INT] integer → number', () => {
    expectTypeOf<S['Primitives']['int32']>().toEqualTypeOf<number>();
  });

  test('[T-PRIM-NUMBER] float/double → number', () => {
    expectTypeOf<S['Primitives']['float']>().toEqualTypeOf<number>();
    expectTypeOf<S['Primitives']['double']>().toEqualTypeOf<number>();
  });

  test('[T-PRIM-BOOLEAN] boolean → boolean', () => {
    expectTypeOf<S['Primitives']['bool']>().toEqualTypeOf<boolean>();
  });

  test('[T-FORMAT-INT64] int64 → number', () => {
    expectTypeOf<S['Primitives']['int64']>().toEqualTypeOf<number>();
  });

  test('[T-FORMAT-UUID] uuid/email/uri → string', () => {
    expectTypeOf<S['Primitives']['uuid']>().toEqualTypeOf<string>();
    expectTypeOf<S['Primitives']['email']>().toEqualTypeOf<string>();
    expectTypeOf<S['Primitives']['uri']>().toEqualTypeOf<string>();
  });

  test('[T-FORMAT-BYTE] byte → string', () => {
    expectTypeOf<S['Primitives']['byte']>().toEqualTypeOf<string>();
  });

  test('[T-FORMAT-DATE] date/date-time → string (kein any)', () => {
    expectTypeOf<S['DateHolder']['dateTime']>().toEqualTypeOf<string>();
    expectTypeOf<S['DateHolder']['date']>().toEqualTypeOf<string>();
    expectTypeOf<S['DateHolder']['dateTime']>().not.toBeAny();
  });

  test('[T-ENUM-STRING] PetStatus geschlossen', () => {
    const ok: S['Pet']['status'] = 'sold';
    // @ts-expect-error 'foo' ist kein PetStatus
    const bad: S['Pet']['status'] = 'foo';
    void ok;
    void bad;
  });

  test('[T-ENUM-INT] Priority 1|2|3 geschlossen', () => {
    const p1: S['Priority'] = 1;
    const p2: S['Priority'] = 2;
    const p3: S['Priority'] = 3;
    // @ts-expect-error 4 ist kein Priority-Wert
    const p4: S['Priority'] = 4;
    void [p1, p2, p3, p4];
  });

  test('[T-ENUM-VARNAMES] Priority.LOW/MEDIUM/HIGH', () => {
    const low: S['Priority'] = Priority.LOW;
    const medium: S['Priority'] = Priority.MEDIUM;
    const high: S['Priority'] = Priority.HIGH;
    const one: 1 = Priority.LOW;
    const three: 3 = Priority.HIGH;
    void [low, medium, high, one, three];
  });

  test('[T-ENUM-NULLABLE] color null | red, nicht pink', () => {
    const n: S['Pet']['color'] = null;
    const r: S['Pet']['color'] = 'red';
    // @ts-expect-error 'pink' ist kein NullableColor
    const p: S['Pet']['color'] = 'pink';
    void [n, r, p];
  });

  test('[T-ENUM-SPECIAL-VALUES] WeirdEnum exakt', () => {
    expectTypeOf<S['WeirdEnum']>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
  });

  test('[T-REQUIRED] name/status/photoUrls Pflicht in Response-Pet', () => {
    const ok: PetResponse = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
    // @ts-expect-error name fehlt
    const noName: PetResponse = { id: 1, status: 'sold', photoUrls: [] };
    // @ts-expect-error status fehlt
    const noStatus: PetResponse = { id: 1, name: 'a', photoUrls: [] };
    // @ts-expect-error photoUrls fehlt
    const noPhotos: PetResponse = { id: 1, name: 'a', status: 'sold' };
    expectTypeOf<PetResponse['name']>().toEqualTypeOf<string>();
    void [ok, noName, noStatus, noPhotos];
  });

  test('[T-OPTIONAL] tags optional', () => {
    const withoutTags: PetResponse = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
    expectTypeOf<S['Pet']['tags']>().toEqualTypeOf<S['Tag'][] | undefined>();
    void withoutTags;
  });

  test('[T-NULLABLE] nickname | null, name nicht null', () => {
    const n: S['Pet']['nickname'] = null;
    const s: S['Pet']['nickname'] = 'x';
    const name: S['Pet']['name'] = 'x';
    // @ts-expect-error name ist nicht nullable
    const nullName: S['Pet']['name'] = null;
    void [n, s, name, nullName];
  });

  test('[T-READONLY] createPet ohne id/createdAt', () => {
    // Body ohne readOnly-Felder id/createdAt kompiliert (Writable<Pet> macht sie zu `?: never`).
    void client.POST('/pets', { body: { name: 'Bello', status: 'available', photoUrls: [] } });
  });

  test('[T-WRITEONLY] getPet-Response ohne secretChipCode', async () => {
    const { data } = await client.GET('/pets/{petId}', { params: { path: { petId: 1 } } });
    expectTypeOf<NonNullable<typeof data>>().not.toHaveProperty('secretChipCode');
    expectTypeOf<PetRequest>().toHaveProperty('secretChipCode');
  });

  test('[T-DEFAULTS] vaccinated optional im Request, boolean', () => {
    void client.POST('/pets', { body: { name: 'Bello', status: 'available', photoUrls: [] } });
    expectTypeOf<PetRequest['vaccinated']>().toEqualTypeOf<boolean | undefined>();
  });

  test('[T-ARRAY-REF] tags: Tag[]', () => {
    expectTypeOf<NonNullable<S['Pet']['tags']>>().toEqualTypeOf<S['Tag'][]>();
    expectTypeOf<NonNullable<S['Pet']['tags']>[number]['name']>().toEqualTypeOf<string>();
  });

  test('[T-ARRAY-NESTED] matrix: number[][]', () => {
    expectTypeOf<S['Settings']['matrix']>().toEqualTypeOf<number[][] | undefined>();
  });

  test('[T-ARRAY-UNIQUE] uniqueTags: string[]', () => {
    expectTypeOf<S['Settings']['uniqueTags']>().toEqualTypeOf<string[] | undefined>();
  });

  test('[T-ADDPROPS-SCHEMA] counters: Record<string, number>', async () => {
    expectTypeOf<NonNullable<S['Settings']['counters']>>().toEqualTypeOf<Record<string, number>>();
    const ok: S['Settings']['counters'] = { a: 1 };
    // @ts-expect-error Wert string statt number
    const bad: S['Settings']['counters'] = { a: 'x' };
    void [ok, bad];
    const { data } = await client.GET('/responses/map');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<Record<string, number>>();
  });

  test('[T-ADDPROPS-FALSE] strict ohne Index-Signatur', () => {
    const ok: S['Settings']['strict'] = { a: 'x' };
    // @ts-expect-error excess property b
    const bad: S['Settings']['strict'] = { a: 'x', b: 1 };
    void [ok, bad];
  });

  test('[T-ADDPROPS-TRUE] freeForm: Record<string, unknown>', () => {
    expectTypeOf<NonNullable<S['Settings']['freeForm']>>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<NonNullable<S['Settings']['freeForm']>[string]>().toBeUnknown();
  });

  test('[T-ADDPROPS-WITH-PROPS] mixed.known + weitere string-Keys', () => {
    type Mixed = NonNullable<S['Settings']['mixed']>;
    expectTypeOf<Mixed['known']>().toEqualTypeOf<string>();
    const ok: Mixed = { known: 'k', extra: 'e' };
    // @ts-expect-error known fehlt
    const noKnown: Mixed = { extra: 'e' };
    void [ok, noKnown];
  });
});

describe('types-poly', () => {
  test('[T-ALLOF-COMPOSE] PetPage = PageMeta & items', () => {
    expectTypeOf<S['PetPage']['total']>().toEqualTypeOf<number>();
    expectTypeOf<S['PetPage']['limit']>().toEqualTypeOf<number>();
    expectTypeOf<S['PetPage']['offset']>().toEqualTypeOf<number>();
    expectTypeOf<S['PetPage']['items']>().toEqualTypeOf<S['Pet'][]>();
    const ok: S['PetPage'] = { total: 0, limit: 1, offset: 0, items: [] };
    // @ts-expect-error total fehlt
    const noTotal: S['PetPage'] = { limit: 1, offset: 0, items: [] };
    // @ts-expect-error items fehlt
    const noItems: S['PetPage'] = { total: 0, limit: 1, offset: 0 };
    void [ok, noTotal, noItems];
  });

  test('[T-ONEOF-DISC] Shape narrowt über kind', () => {
    function area(shape: S['Shape']): number {
      switch (shape.kind) {
        case 'circle':
          expectTypeOf(shape.radius).toEqualTypeOf<number>();
          return shape.radius;
        case 'rect':
          // @ts-expect-error radius existiert nicht auf Rectangle
          return shape.radius;
        default:
          return 0;
      }
    }
    void area;
  });

  test('[T-ONEOF-DISC-MAPPING] Circle.kind = circle', () => {
    expectTypeOf<S['Circle']['kind']>().toEqualTypeOf<'circle'>();
    const ok: S['Circle'] = { kind: 'circle', radius: 1 };
    // @ts-expect-error kind 'rect' passt nicht zu Circle
    const bad: S['Circle'] = { kind: 'rect', radius: 1 };
    void [ok, bad];
  });

  test('[T-ALLOF-DISC-INHERITANCE] CreatedEvent erbt BaseEvent, eventType literal', () => {
    expectTypeOf<S['CreatedEvent']['eventType']>().toEqualTypeOf<'created'>();
    expectTypeOf<S['CreatedEvent']['occurredAt']>().toEqualTypeOf<string>();
    expectTypeOf<S['CreatedEvent']['petId']>().toEqualTypeOf<number>();
  });

  test('[T-ONEOF-PLAIN] method: CardPayment | SepaPayment', () => {
    type Method = S['PaymentRequest']['method'];
    expectTypeOf<Method>().toEqualTypeOf<S['CardPayment'] | S['SepaPayment']>();
    const card: Method = { cardNumber: '1234123412341234', cvc: '123' };
    const sepa: Method = { iban: 'DE00' };
    // @ts-expect-error leeres Objekt ist keine Zahlungsart
    const empty: Method = {};
    // @ts-expect-error unbekanntes Objekt ist keine Zahlungsart
    const foo: Method = { foo: 1 };
    void [card, sepa, empty, foo];
  });

  test('[T-ANYOF] note: string | number', () => {
    expectTypeOf<S['PaymentRequest']['note']>().toEqualTypeOf<string | number | undefined>();
    // @ts-expect-error boolean nicht erlaubt
    const bad: S['PaymentRequest']['note'] = true;
    void bad;
  });

  test('[T-RECURSIVE] TreeNode.children: TreeNode[]', () => {
    expectTypeOf<NonNullable<S['TreeNode']['children']>>().toEqualTypeOf<S['TreeNode'][]>();
    const node = {} as S['TreeNode'];
    const deep = node.children?.[0]?.children?.[0]?.value;
    expectTypeOf(deep).toEqualTypeOf<string | undefined>();
  });

  test('[T-CIRCULAR] TreeNode ↔ TreeParentRef, Category.parent', () => {
    const node = {} as S['TreeNode'];
    expectTypeOf(node.parent?.node?.value).toEqualTypeOf<string | undefined>();
    const category = {} as S['Category'];
    expectTypeOf(category.parent?.parent?.name).toEqualTypeOf<string | undefined>();
  });
});

describe('types-ops', () => {
  test('[T-INLINE-OBJECT] inlineSchemas typisiert', async () => {
    const { data } = await client.POST('/bodies/inline', { body: { mode: 'fast' } });
    expectTypeOf<NonNullable<typeof data>['accepted']>().toEqualTypeOf<boolean>();
    expectTypeOf<NonNullable<typeof data>['id']>().toEqualTypeOf<string>();
    type Body = operations['inlineSchemas']['requestBody']['content']['application/json'];
    expectTypeOf<NonNullable<NonNullable<Body['nested']>['depth']>>().toEqualTypeOf<number>();
  });

  test('[T-INLINE-ENUM] mode fast|slow', () => {
    void client.POST('/bodies/inline', { body: { mode: 'slow' } });
    // @ts-expect-error 'medium' ist kein mode
    void client.POST('/bodies/inline', { body: { mode: 'medium' } });
  });

  test('[T-PARAM-PATH-REQUIRED] petId Pflicht, number', () => {
    void client.GET('/pets/{petId}', { params: { path: { petId: 1 } } });
    // @ts-expect-error init (mit petId) fehlt
    void client.GET('/pets/{petId}');
    // @ts-expect-error petId fehlt
    void client.GET('/pets/{petId}', { params: { path: {} } });
    // @ts-expect-error petId string statt number
    void client.GET('/pets/{petId}', { params: { path: { petId: '1' } } });
  });

  test('[T-PARAM-PATH-TYPES] intId number, enumId PetStatus, string/uuid', () => {
    type Path = operations['multiPathParams']['parameters']['path'];
    expectTypeOf<Path>().toEqualTypeOf<{ stringId: string; intId: number; uuidId: string; enumId: S['PetStatus'] }>();
    const path = { stringId: 'a', intId: 1, uuidId: 'u', enumId: 'sold' } as const;
    void client.GET('/params/path/{stringId}/{intId}/{uuidId}/{enumId}', { params: { path } });
    // @ts-expect-error enumId 'foo' ist kein PetStatus
    void client.GET('/params/path/{stringId}/{intId}/{uuidId}/{enumId}', { params: { path: { ...path, enumId: 'foo' } } });
  });

  test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
    void client.GET('/pets');
    type Query = NonNullable<operations['listPets']['parameters']['query']>;
    expectTypeOf<Query['limit']>().toEqualTypeOf<number | undefined>();
  });

  test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required = Fehler', () => {
    void client.GET('/params/query', { params: { query: { required: 'x' } } });
    // @ts-expect-error required fehlt
    void client.GET('/params/query', { params: { query: {} } });
  });

  test('[T-PARAM-QUERY-ENUM] sort asc|desc', () => {
    void client.GET('/params/query', { params: { query: { required: 'x', sort: 'asc' } } });
    // @ts-expect-error 'up' ist kein sort-Wert
    void client.GET('/params/query', { params: { query: { required: 'x', sort: 'up' } } });
  });

  test('[T-PARAM-QUERY-ARRAY] tagsExplode string[], tagsSpace number[], filter PetFilter', () => {
    type Query = operations['queryStyles']['parameters']['query'];
    expectTypeOf<Query['tagsExplode']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<Query['tagsSpace']>().toEqualTypeOf<number[] | undefined>();
    expectTypeOf<Query['filter']>().toEqualTypeOf<S['PetFilter'] | undefined>();
  });

  test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
    void client.GET('/params/header-cookie', { params: { header: { 'X-Request-Id': 'id', 'X-Retry-Count': 3 } } });
    // @ts-expect-error X-Request-Id fehlt
    void client.GET('/params/header-cookie', { params: { header: { 'X-Retry-Count': 3 } } });
    type Header = operations['headerAndCookieParams']['parameters']['header'];
    expectTypeOf<Header['X-Retry-Count']>().toEqualTypeOf<number | undefined>();
  });

  test('[T-NAME-RESERVED-PARAM] class/default/page-size/filter.name aufrufbar', () => {
    void client.GET('/params/reserved/{class}', {
      params: { path: { class: 'x' }, query: { default: 'd', 'page-size': 5, 'filter.name': 'n' } },
    });
  });

  test('[T-BODY-REQUIRED] createPet Body Pflicht & typisiert', () => {
    void client.POST('/pets', { body: { name: 'a', status: 'sold', photoUrls: [] } });
    // @ts-expect-error Body fehlt
    void client.POST('/pets', {});
    // @ts-expect-error name: number statt string
    void client.POST('/pets', { body: { name: 123, status: 'sold', photoUrls: [] } });
  });

  test('[T-BODY-OPTIONAL] optionalBody mit/ohne Body', () => {
    void client.POST('/bodies/optional');
    void client.POST('/bodies/optional', { body: { name: 't' } });
  });

  test('[T-PARTIAL-BODY] patchPet merge-patch', () => {
    void client.PATCH('/pets/{petId}', { params: { path: { petId: 1 } }, body: { nickname: null } });
    // @ts-expect-error status 'x' ungültig
    void client.PATCH('/pets/{petId}', { params: { path: { petId: 1 } }, body: { status: 'x' } });
  });

  test('[T-BODY-FORM] submitForm username/password Pflicht, remember boolean', () => {
    type Body = operations['submitForm']['requestBody']['content']['application/x-www-form-urlencoded'];
    expectTypeOf<Body['username']>().toEqualTypeOf<string>();
    expectTypeOf<Body['password']>().toEqualTypeOf<string>();
    expectTypeOf<Body['remember']>().toEqualTypeOf<boolean | undefined>();
    void client.POST('/bodies/form-urlencoded', { body: { username: 'u', password: 'p', remember: true } });
    // @ts-expect-error password fehlt
    void client.POST('/bodies/form-urlencoded', { body: { username: 'u' } });
  });

  test('[T-BODY-MULTIPART] file Blob, title Pflicht, attachments Blob[]', () => {
    type Body = operations['uploadFiles']['requestBody']['content']['multipart/form-data'];
    expectTypeOf<Body['file']>().toEqualTypeOf<Blob>();
    expectTypeOf<Body['title']>().toEqualTypeOf<string>();
    expectTypeOf<Body['attachments']>().toEqualTypeOf<Blob[] | undefined>();
    void client.POST('/bodies/multipart', { body: { title: 't', file: new Blob(['x']), attachments: [new Blob(['a'])] } });
    // @ts-expect-error file: string statt Blob
    void client.POST('/bodies/multipart', { body: { title: 't', file: 'string' } });
  });

  test('[T-BODY-OCTET] uploadBinary Blob, {} = Fehler', () => {
    void client.PUT('/bodies/binary', { body: new Blob(['x']) });
    // @ts-expect-error {} ist kein Blob
    void client.PUT('/bodies/binary', { body: {} });
  });

  test('[T-RESP-200] getPet → Pet, listPets → PetPage', async () => {
    const pet = await client.GET('/pets/{petId}', { params: { path: { petId: 1 } } });
    expectTypeOf<NonNullable<typeof pet.data>>().toEqualTypeOf<Readable<S['Pet']>>();
    expectTypeOf<NonNullable<typeof pet.data>['id']>().toEqualTypeOf<number>();
    const page = await client.GET('/pets');
    expectTypeOf<NonNullable<typeof page.data>>().toEqualTypeOf<Readable<S['PetPage']>>();
    expectTypeOf<NonNullable<typeof page.data>['items'][number]['name']>().toEqualTypeOf<string>();
  });

  test('[T-RESP-204] deletePet → leeres Ergebnis, nicht any', async () => {
    const { data } = await client.DELETE('/pets/{petId}', { params: { path: { petId: 1 } } });
    expectTypeOf(data).not.toBeAny();
    expectTypeOf(data).toEqualTypeOf<undefined>();
  });

  test('[T-RESP-MULTI-2XX] multiStatus → Pet | Job', async () => {
    const { data } = await client.POST('/responses/multi-status');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<Readable<S['Pet']> | Readable<S['Job']>>();
  });

  test('[T-RESP-BINARY] downloadFile → Blob', async () => {
    const { data } = await client.GET('/responses/download');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<Blob>();
  });

  test('[T-RESP-TEXT] postText → string', async () => {
    const { data } = await client.POST('/bodies/text', { body: 'hello' });
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<string>();
  });

  test('[T-RESP-PRIMITIVE-ARRAY] getPrimitiveArray → number[]', async () => {
    const { data } = await client.GET('/responses/primitives');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<number[]>();
  });

  test('[T-RESP-MAP] getInventory → Record<string, number>', async () => {
    const { data } = await client.GET('/responses/map');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<Record<string, number>>();
  });

  test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF wählbar → Blob', async () => {
    // Auswahl nur client-weit über das Media-Generic von createClient (nicht pro Aufruf).
    const jsonClient = createClient<paths, 'application/json'>();
    const pdfClient = createClient<paths, 'application/pdf'>();
    const json = await jsonClient.GET('/responses/pdf-or-json');
    const pdf = await pdfClient.GET('/responses/pdf-or-json');
    expectTypeOf<NonNullable<typeof json.data>>().toEqualTypeOf<Readable<S['Report']>>();
    expectTypeOf<NonNullable<typeof pdf.data>>().toEqualTypeOf<Blob>();
  });

  test('[T-ERROR-MODEL] Fehler-Body pro Operation typisiert', async () => {
    const get = await client.GET('/pets/{petId}', { params: { path: { petId: 1 } } });
    expectTypeOf<NonNullable<typeof get.error>>().toEqualTypeOf<Readable<S['Problem']>>();
    const create = await client.POST('/pets', { body: { name: 'a', status: 'sold', photoUrls: [] } });
    expectTypeOf<NonNullable<typeof create.error>>().toEqualTypeOf<Readable<S['ValidationProblem']>>();
  });
});

describe('types-naming', () => {
  test('[T-NAME-SPECIAL-PROPS] Property-Namen exakt', () => {
    expectTypeOf<keyof S['WeirdNames']>().toEqualTypeOf<
      | 'x-request-id'
      | '@type'
      | '$ref'
      | '1stPlace'
      | 'snake_case_prop'
      | 'with space'
      | 'class'
      | 'default'
      | 'delete'
      | 'constructor'
      | '__proto_like'
    >();
    expectTypeOf<S['WeirdNames']['x-request-id']>().toEqualTypeOf<string>();
    expectTypeOf<S['WeirdNames']['@type']>().toEqualTypeOf<string>();
  });

  test('[T-NAME-RESERVED-PROPS] class/default/delete/constructor', () => {
    expectTypeOf<S['WeirdNames']['class']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<S['WeirdNames']['default']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<S['WeirdNames']['delete']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<S['WeirdNames']['constructor']>().toEqualTypeOf<string | undefined>();
  });

  test('[T-NAME-SCHEMA-COLLISION] Schema Date/Object ≠ Globals', () => {
    expectTypeOf<SchemaUserProfile['birthday']>().toEqualTypeOf<{ value?: string } | undefined>();
    expectTypeOf<SchemaUserProfile['birthday']>().not.toEqualTypeOf<Date | undefined>();
    expectTypeOf<SchemaUserProfile['raw']>().toEqualTypeOf<{ value?: string } | undefined>();
  });

  test('[T-NAME-SCHEMA-SANITIZE] user-profile → SchemaUserProfile', () => {
    expectTypeOf<SchemaUserProfile['displayName']>().toEqualTypeOf<string | undefined>();
  });

  // Audit: expect verlangt einen generierten Methoden-/Funktionsnamen; openapi-fetch erzeugt keine benannten Callables
  // (Aufruf über Methode + Pfad) → keine API → unsupported (Code bleibt als Nachweis der Aufrufbarkeit).
  test.skip('[T-NAME-OPERATION-ID-SANITIZE] get-kebab_snake.op aufrufbar — unsupported: pfadbasierter Client, keine generierten Methoden-/Funktionsnamen', async () => {
    // Kein Methodenname: openapi-fetch ist pfadbasiert; Aufruf = Methode + Pfad, operationId nur als Typ-Key.
    const { data } = await client.GET('/naming/kebab-op-id');
    expectTypeOf(data).toEqualTypeOf<undefined>();
    expectTypeOf<operations>().toHaveProperty('get-kebab_snake.op');
  });

  // Audit: expect verlangt einen aus Methode+Pfad generierten Namen; openapi-fetch generiert keine Namen → unsupported.
  test.skip('[T-NO-OPERATION-ID] ohne operationId → Tag — unsupported: pfadbasierter Client, es wird kein Name generiert', async () => {
    const { data } = await client.GET('/naming/no-operation-id');
    expectTypeOf<NonNullable<typeof data>>().toEqualTypeOf<Readable<S['Tag']>>();
    expectTypeOf<NonNullable<typeof data>['name']>().toEqualTypeOf<string>();
  });

  test('[T-UNTAGGED-OP] untaggedOperation aufrufbar', () => {
    void client.GET('/untagged');
    expectTypeOf<operations>().toHaveProperty('untaggedOperation');
  });

  test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
    expectTypeOf<S['UnreferencedModel']['marker']>().toEqualTypeOf<'unreferenced'>();
  });
});
