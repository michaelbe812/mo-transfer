/**
 * dimension: types (T-*) — ng-openapi-gen 1.1.0, Konfiguration siehe ../ng-openapi-gen.json.
 * Idiomatische API: `inject(Api).invoke(fn, params, context?)` → Observable<Body> (promises: false).
 * Parameter-/Body-Typen werden über echte Aufrufe von `api.invoke(...)` geprüft.
 */
import { expectTypeOf, test } from 'vitest';
import type { Observable } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';
import type { Api } from '../client/api';
import type {
  Circle,
  CreatedEvent,
  DateHolder,
  NullableColor,
  PaymentRequest,
  Pet,
  PetFilter,
  PetPage,
  PetStatus,
  Primitives,
  Priority,
  Problem,
  Report,
  Settings,
  Shape,
  Tag,
  TreeNode,
  Category,
  UnreferencedModel,
  UserProfile,
  WeirdEnum,
  WeirdNames,
  Job,
} from '../client/models';
import { createPet } from '../client/fn/pets/create-pet';
import { getPet } from '../client/fn/pets/get-pet';
import { listPets } from '../client/fn/pets/list-pets';
import { deletePet } from '../client/fn/pets/delete-pet';
import { patchPet } from '../client/fn/pets/patch-pet';
import { multiPathParams } from '../client/fn/params/multi-path-params';
import { queryStyles, type QueryStyles$Params } from '../client/fn/params/query-styles';
import { headerAndCookieParams } from '../client/fn/params/header-and-cookie-params';
import { reservedParamNames } from '../client/fn/params/reserved-param-names';
import { submitForm, type SubmitForm$Params } from '../client/fn/bodies/submit-form';
import { uploadFiles, type UploadFiles$Params } from '../client/fn/bodies/upload-files';
import { uploadBinary } from '../client/fn/bodies/upload-binary';
import { optionalBody } from '../client/fn/bodies/optional-body';
import { inlineSchemas } from '../client/fn/bodies/inline-schemas';
import { postText } from '../client/fn/bodies/post-text';
import { multiStatus } from '../client/fn/responses/multi-status';
import { downloadFile } from '../client/fn/responses/download-file';
import { reportByAccept } from '../client/fn/responses/report-by-accept';
import { reportByAccept$Pdf } from '../client/fn/responses/report-by-accept-pdf';
import { getPrimitiveArray } from '../client/fn/responses/get-primitive-array';
import { getInventory } from '../client/fn/responses/get-inventory';
import { listEvents } from '../client/fn/polymorphism/list-events';
import { pay } from '../client/fn/polymorphism/pay';
import { getKebabSnakeOp } from '../client/fn/naming/get-kebab-snake-op';
import { namingNoOperationIdGet } from '../client/fn/naming/naming-no-operation-id-get';
import { untaggedOperation } from '../client/fn/operations/untagged-operation';

declare const api: Api;

const validPet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] } satisfies Pet;
const uuid = '7f9c3f0e-2c7c-4a43-9a43-3f6f3c1b2a10';

// ------------------------------------------------------------------ Modelle

test('[T-PRIM-STRING] string → string', () => {
  expectTypeOf<Primitives['str']>().toEqualTypeOf<string>();
});

test('[T-PRIM-INT] integer → number', () => {
  expectTypeOf<Primitives['int32']>().toEqualTypeOf<number>();
});

test('[T-PRIM-NUMBER] number → number', () => {
  expectTypeOf<Primitives['float']>().toEqualTypeOf<number>();
  expectTypeOf<Primitives['double']>().toEqualTypeOf<number>();
});

test('[T-PRIM-BOOLEAN] boolean → boolean', () => {
  expectTypeOf<Primitives['bool']>().toEqualTypeOf<boolean>();
});

test('[T-FORMAT-INT64] int64 → number (keine Konvertierung zur Laufzeit)', () => {
  expectTypeOf<Primitives['int64']>().toEqualTypeOf<number>();
});

test('[T-FORMAT-UUID] uuid/email/uri → string', () => {
  expectTypeOf<Primitives['uuid']>().toEqualTypeOf<string>();
  expectTypeOf<Primitives['email']>().toEqualTypeOf<string>();
  expectTypeOf<Primitives['uri']>().toEqualTypeOf<string>();
});

test('[T-FORMAT-BYTE] byte → string', () => {
  expectTypeOf<Primitives['byte']>().toEqualTypeOf<string>();
});

test('[T-FORMAT-DATE] date/date-time typisiert (string, passend zur Runtime)', () => {
  expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
  expectTypeOf<DateHolder['date']>().toEqualTypeOf<string>();
  expectTypeOf<DateHolder['dateTime']>().not.toBeAny();
});

test('[T-ENUM-STRING] String-Enum geschlossen', () => {
  expectTypeOf<Pet['status']>().toEqualTypeOf<'available' | 'pending' | 'sold'>();
  const ok: Pet['status'] = 'sold';
  // @ts-expect-error 'foo' ist kein PetStatus
  const bad: Pet['status'] = 'foo';
  void ok;
  void bad;
});

test('[T-ENUM-INT] Integer-Enum geschlossen', () => {
  const ok: Priority = 3;
  // @ts-expect-error 4 ist keine Priority
  const bad: Priority = 4;
  void ok;
  void bad;
  expectTypeOf<Priority>().toEqualTypeOf<1 | 2 | 3>();
});

test.skip('[T-ENUM-VARNAMES] x-enum-varnames — unsupported: ng-openapi-gen wertet x-enum-varnames nicht aus (nur x-enumNames, und nur mit enumStyle≠alias); Priority ist reiner Union-Typ 1|2|3 ohne benannte Member', () => {});

test('[T-ENUM-NULLABLE] Nullable Enum', () => {
  const asNull: Pet['color'] = null;
  const asRed: Pet['color'] = 'red';
  // @ts-expect-error 'pink' ist kein NullableColor-Wert
  const bad: Pet['color'] = 'pink';
  void asNull;
  void asRed;
  void bad;
  expectTypeOf<NullableColor>().toEqualTypeOf<'red' | 'green' | 'blue' | null>();
});

test('[T-ENUM-SPECIAL-VALUES] Enum-Werte mit Sonderzeichen unverändert', () => {
  expectTypeOf<WeirdEnum>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
});

test('[T-REQUIRED] required → nicht optional', () => {
  expectTypeOf<Pet['name']>().toEqualTypeOf<string>();
  expectTypeOf<Pet['photoUrls']>().toEqualTypeOf<string[]>();
  expectTypeOf<Pet['status']>().toEqualTypeOf<PetStatus>();
  const ok: Pet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
  // @ts-expect-error name fehlt
  const bad: Pet = { id: 1, status: 'sold', photoUrls: [] };
  void ok;
  void bad;
});

test('[T-OPTIONAL] optional → optional', () => {
  const withoutTags: Pet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
  void withoutTags;
  expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
});

test('[T-NULLABLE] nullable → | null', () => {
  const nullNick: Pet['nickname'] = null;
  const strNick: Pet['nickname'] = 'Bello';
  void nullNick;
  void strNick;
  const name: Pet['name'] = 'x';
  // @ts-expect-error name ist nicht nullable
  const nullName: Pet['name'] = null;
  void name;
  void nullName;
});

test('[T-READONLY] readOnly id/createdAt im Request nicht Pflicht', () => {
  // Erwartung: createPet akzeptiert einen Body OHNE id (readOnly). ng-openapi-gen nutzt dasselbe Pet-Interface
  // mit id als Pflichtfeld → Compile-Fehler hier = Test schlägt fehl.
  const result = api.invoke(createPet, { body: { name: 'Bello', status: 'available', photoUrls: [] } });
  void result;
});

test('[T-WRITEONLY] writeOnly nicht im Response-Typ', () => {
  // getPet liefert Pet — dasselbe Interface wie im Request, secretChipCode ist enthalten → fail.
  const response = api.invoke(getPet, { petId: 1 });
  type GetPetBody = typeof response extends Observable<infer B> ? B : never;
  expectTypeOf<'secretChipCode' extends keyof GetPetBody ? true : false>().toEqualTypeOf<false>();
});

test('[T-DEFAULTS] Property mit default optional im Request', () => {
  expectTypeOf<Pet['vaccinated']>().toEqualTypeOf<boolean | undefined>();
  const result = api.invoke(createPet, { body: validPet });
  void result;
});

test('[T-ARRAY-REF] Array von Refs', () => {
  expectTypeOf<NonNullable<Pet['tags']>>().toEqualTypeOf<Tag[]>();
  expectTypeOf<NonNullable<Pet['tags']>[number]['name']>().toEqualTypeOf<string>();
});

test('[T-ARRAY-NESTED] Verschachteltes Array', () => {
  expectTypeOf<Settings['matrix']>().toEqualTypeOf<number[][] | undefined>();
});

test('[T-ARRAY-UNIQUE] uniqueItems → string[]', () => {
  expectTypeOf<Settings['uniqueTags']>().toEqualTypeOf<string[] | undefined>();
});

test('[T-ADDPROPS-SCHEMA] additionalProperties: Schema → Record', () => {
  expectTypeOf<NonNullable<Settings['counters']>>().toEqualTypeOf<{ [key: string]: number }>();
  const ok: NonNullable<Settings['counters']> = { a: 1 };
  // @ts-expect-error Wert string statt number
  const bad: NonNullable<Settings['counters']> = { a: 'x' };
  void ok;
  void bad;
  expectTypeOf(api.invoke(getInventory)).toEqualTypeOf<Observable<{ [key: string]: number }>>();
});

test('[T-ADDPROPS-FALSE] additionalProperties: false → kein Index', () => {
  const ok: Settings['strict'] = { a: 'x' };
  // @ts-expect-error excess property b
  const bad: Settings['strict'] = { a: 'x', b: 1 };
  void ok;
  void bad;
});

test('[T-ADDPROPS-TRUE] Free-form Objekt → Werte unknown', () => {
  // Generiert: { [key: string]: any } → any = fail
  expectTypeOf<NonNullable<Settings['freeForm']>[string]>().toBeUnknown();
});

test('[T-ADDPROPS-WITH-PROPS] properties + additionalProperties', () => {
  type Mixed = NonNullable<Settings['mixed']>;
  expectTypeOf<Mixed['known']>().toEqualTypeOf<string>();
  const ok: Mixed = { known: 'k', extra: 'e' };
  // @ts-expect-error known fehlt (required)
  const bad: Mixed = { extra: 'e' };
  void ok;
  void bad;
});

test('[T-ALLOF-COMPOSE] allOf komponiert', () => {
  expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
  // @ts-expect-error items fehlt (required)
  const bad: PetPage = { total: 0, limit: 1, offset: 0 };
  const ok: PetPage = { total: 0, limit: 1, offset: 0, items: [] };
  void bad;
  void ok;
});

test('[T-ONEOF-DISC] oneOf + discriminator → narrowbare Union', () => {
  // ng-openapi-gen ignoriert discriminator: kind ist in allen Varianten `string` → kein Narrowing.
  const area = (shape: Shape): number => {
    switch (shape.kind) {
      case 'circle':
        return shape.radius;
      case 'rect':
        // @ts-expect-error radius existiert im rect-Zweig nicht
        return shape.radius;
      default:
        return 0;
    }
  };
  void area;
});

test('[T-ONEOF-DISC-MAPPING] Discriminator-Mapping-Werte als Literale', () => {
  expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
  const ok: Circle = { kind: 'circle', radius: 1 };
  // @ts-expect-error kind 'rect' in Circle
  const bad: Circle = { kind: 'rect', radius: 1 };
  void ok;
  void bad;
});

test('[T-ALLOF-DISC-INHERITANCE] allOf-Vererbung mit Discriminator am Parent', () => {
  // Variante A: Response narrowbar
  const events = api.invoke(listEvents);
  events.subscribe((list) => {
    const first = list[0];
    if (first && first.eventType === 'created') {
      const petId: number = first.petId;
      void petId;
    }
  });
  // Variante B: CreatedEvent.eventType ist Literal 'created'
  expectTypeOf<CreatedEvent['eventType']>().toEqualTypeOf<'created'>();
});

test('[T-ONEOF-PLAIN] oneOf ohne Discriminator → Union', () => {
  const card: PaymentRequest['method'] = { cardNumber: '1234567812345678', cvc: '123' };
  const sepa: PaymentRequest['method'] = { iban: 'DE00' };
  // @ts-expect-error leeres Objekt
  const empty: PaymentRequest['method'] = {};
  // @ts-expect-error unbekanntes Objekt
  const foo: PaymentRequest['method'] = { foo: 1 };
  void card;
  void sepa;
  void empty;
  void foo;
  expectTypeOf<PaymentRequest['method']>().not.toBeAny();
  void api.invoke(pay, { body: { amount: 1, method: sepa } });
});

test('[T-ANYOF] anyOf → Union', () => {
  expectTypeOf<PaymentRequest['note']>().toEqualTypeOf<string | number | undefined>();
  const s: PaymentRequest['note'] = 'x';
  const n: PaymentRequest['note'] = 1;
  // @ts-expect-error boolean nicht erlaubt
  const b: PaymentRequest['note'] = true;
  void s;
  void n;
  void b;
});

test('[T-RECURSIVE] Rekursive Typen', () => {
  expectTypeOf<NonNullable<TreeNode['children']>>().toEqualTypeOf<TreeNode[]>();
  const node = {} as TreeNode;
  expectTypeOf(node.children![0]!.children![0]!.value).toEqualTypeOf<string>();
});

test('[T-CIRCULAR] Zirkuläre Refs über mehrere Schemas', () => {
  const node = {} as TreeNode;
  expectTypeOf(node.parent?.node?.value).toEqualTypeOf<string | undefined>();
  const category = {} as Category;
  expectTypeOf(category.parent?.parent?.name).toEqualTypeOf<string | undefined>();
});

test('[T-INLINE-OBJECT] Inline-Schemas typisiert', () => {
  const result = api.invoke(inlineSchemas, { body: { mode: 'fast', nested: { depth: 2 } } });
  expectTypeOf(result).toEqualTypeOf<Observable<{ accepted: boolean; id: string }>>();
  result.subscribe((r) => {
    expectTypeOf(r.accepted).toEqualTypeOf<boolean>();
    expectTypeOf(r.id).toEqualTypeOf<string>();
  });
  // @ts-expect-error depth muss number sein
  void api.invoke(inlineSchemas, { body: { mode: 'fast', nested: { depth: 'deep' } } });
});

test('[T-INLINE-ENUM] Inline-Enum geschlossen', () => {
  void api.invoke(inlineSchemas, { body: { mode: 'slow' } });
  // @ts-expect-error 'medium' ist kein gültiger mode
  void api.invoke(inlineSchemas, { body: { mode: 'medium' } });
});

// ------------------------------------------------------------------ Operationen

test('[T-PARAM-PATH-REQUIRED] Pflicht-Pfadparameter erzwungen', () => {
  void api.invoke(getPet, { petId: 1 });
  // @ts-expect-error petId fehlt
  void api.invoke(getPet, {});
  // @ts-expect-error params fehlen komplett
  void api.invoke(getPet);
  // @ts-expect-error petId als string
  void api.invoke(getPet, { petId: '1' });
});

test('[T-PARAM-PATH-TYPES] Pfadparameter-Typen', () => {
  void api.invoke(multiPathParams, { stringId: 'a', intId: 1, uuidId: uuid, enumId: 'sold' });
  // @ts-expect-error enumId ungültiger String
  void api.invoke(multiPathParams, { stringId: 'a', intId: 1, uuidId: uuid, enumId: 'foo' });
  // @ts-expect-error intId als string
  void api.invoke(multiPathParams, { stringId: 'a', intId: '1', uuidId: uuid, enumId: 'sold' });
});

test('[T-PARAM-QUERY-OPTIONAL] Optionale Query-Parameter weglassbar', () => {
  expectTypeOf(api.invoke(listPets)).toEqualTypeOf<Observable<PetPage>>();
  void api.invoke(listPets, { limit: 10 });
  // @ts-expect-error limit als string
  void api.invoke(listPets, { limit: '10' });
});

test('[T-PARAM-QUERY-REQUIRED] Pflicht-Query-Parameter erzwungen', () => {
  void api.invoke(queryStyles, { required: 'r' });
  // @ts-expect-error required fehlt
  void api.invoke(queryStyles, { flag: true });
});

test('[T-PARAM-QUERY-ENUM] Enum-Query-Parameter geschlossen', () => {
  void api.invoke(queryStyles, { required: 'r', sort: 'asc' });
  // @ts-expect-error 'up' ist kein gültiger sort-Wert
  void api.invoke(queryStyles, { required: 'r', sort: 'up' });
  // @ts-expect-error listPets.status 'foo' ungültig
  void api.invoke(listPets, { status: 'foo' });
});

test('[T-PARAM-QUERY-ARRAY] Array-Query-Parameter typisiert', () => {
  expectTypeOf<QueryStyles$Params['tagsExplode']>().toEqualTypeOf<string[] | undefined>();
  expectTypeOf<QueryStyles$Params['tagsSpace']>().toEqualTypeOf<number[] | undefined>();
  expectTypeOf<QueryStyles$Params['filter']>().toEqualTypeOf<PetFilter | undefined>();
});

test('[T-PARAM-HEADER] Header-Parameter typisiert & Pflicht', () => {
  void api.invoke(headerAndCookieParams, { 'X-Request-Id': uuid, 'X-Retry-Count': 3 });
  // @ts-expect-error X-Request-Id fehlt
  void api.invoke(headerAndCookieParams, { 'X-Retry-Count': 3 });
  // @ts-expect-error X-Retry-Count als string
  void api.invoke(headerAndCookieParams, { 'X-Request-Id': uuid, 'X-Retry-Count': '3' });
});

test('[T-NAME-RESERVED-PARAM] Parameter class/default/page-size/filter.name aufrufbar', () => {
  void api.invoke(reservedParamNames, { class: 'x', default: 'd', 'page-size': 5, 'filter.name': 'n' });
});

test('[T-BODY-REQUIRED] Pflicht-Body erzwungen & typisiert', () => {
  void api.invoke(createPet, { body: validPet });
  // @ts-expect-error body fehlt
  void api.invoke(createPet, {});
  // @ts-expect-error name als number
  void api.invoke(createPet, { body: { ...validPet, name: 123 } });
});

test('[T-BODY-OPTIONAL] Optionaler Body weglassbar', () => {
  void api.invoke(optionalBody);
  void api.invoke(optionalBody, { body: { name: 'tag' } });
});

test('[T-PARTIAL-BODY] Merge-Patch-Body typisiert', () => {
  void api.invoke(patchPet, { petId: 1, body: { nickname: null } });
  // @ts-expect-error status 'x' ungültig
  void api.invoke(patchPet, { petId: 1, body: { status: 'x' } });
});

test('[T-BODY-FORM] form-urlencoded Body typisiert', () => {
  type Body = SubmitForm$Params['body'];
  expectTypeOf<Body['username']>().toEqualTypeOf<string>();
  expectTypeOf<Body['password']>().toEqualTypeOf<string>();
  expectTypeOf<Body['remember']>().toEqualTypeOf<boolean | undefined>();
  void api.invoke(submitForm, { body: { username: 'u', password: 'p', remember: true } });
  // @ts-expect-error password fehlt
  void api.invoke(submitForm, { body: { username: 'u' } });
});

test('[T-BODY-MULTIPART] multipart Body typisiert', () => {
  type Body = UploadFiles$Params['body'];
  expectTypeOf<Body['file']>().toEqualTypeOf<Blob>();
  expectTypeOf<Body['title']>().toEqualTypeOf<string>();
  expectTypeOf<Body['attachments']>().toEqualTypeOf<Blob[] | undefined>();
  const blob = new Blob(['x']);
  void api.invoke(uploadFiles, { body: { title: 't', file: blob } });
  // @ts-expect-error file als string
  void api.invoke(uploadFiles, { body: { title: 't', file: 'string' } });
});

test('[T-BODY-OCTET] Binary Body = Blob', () => {
  void api.invoke(uploadBinary, { body: new Blob(['x']) });
  // @ts-expect-error Objekt ist kein Blob
  void api.invoke(uploadBinary, { body: {} });
});

test('[T-RESP-200] Response-Typ korrekt', () => {
  expectTypeOf(api.invoke(getPet, { petId: 1 })).toEqualTypeOf<Observable<Pet>>();
  expectTypeOf(api.invoke(listPets)).toEqualTypeOf<Observable<PetPage>>();
});

test('[T-RESP-204] 204 → void', () => {
  expectTypeOf(api.invoke(deletePet, { petId: 1 })).toEqualTypeOf<Observable<void>>();
});

test('[T-RESP-MULTI-2XX] Mehrere 2xx → Union', () => {
  // Generiert: Observable<Pet> (202/Job fehlt) → fail
  expectTypeOf(api.invoke(multiStatus)).toEqualTypeOf<Observable<Pet | Job>>();
});

test('[T-RESP-BINARY] Binary Response = Blob', () => {
  expectTypeOf(api.invoke(downloadFile)).toEqualTypeOf<Observable<Blob>>();
});

test('[T-RESP-TEXT] text/plain Response = string', () => {
  expectTypeOf(api.invoke(postText, { body: 'hello' })).toEqualTypeOf<Observable<string>>();
});

test('[T-RESP-PRIMITIVE-ARRAY] Array<number> Response', () => {
  expectTypeOf(api.invoke(getPrimitiveArray)).toEqualTypeOf<Observable<number[]>>();
});

test('[T-RESP-MAP] Map Response', () => {
  expectTypeOf(api.invoke(getInventory)).toEqualTypeOf<Observable<Record<string, number>>>();
});

test('[T-RESP-CONTENT-NEGOTIATION] Mehrere Content-Types wählbar & typisiert', () => {
  expectTypeOf(api.invoke(reportByAccept)).toEqualTypeOf<Observable<Report>>();
  expectTypeOf(api.invoke(reportByAccept$Pdf)).toEqualTypeOf<Observable<Blob>>();
});

test('[T-ERROR-MODEL] Fehler-Modelle typisiert erreichbar', () => {
  // ng-openapi-gen generiert keinen operationsgebundenen Fehlertyp; einziger Weg ist HttpErrorResponse.error (any).
  expectTypeOf<HttpErrorResponse['error']>().toEqualTypeOf<Problem>();
});

// ------------------------------------------------------------------ Namen

test('[T-NAME-SPECIAL-PROPS] Property-Namen exakt erhalten', () => {
  expectTypeOf<WeirdNames['x-request-id']>().toEqualTypeOf<string>();
  expectTypeOf<WeirdNames['@type']>().toEqualTypeOf<string>();
  expectTypeOf<WeirdNames['$ref']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<WeirdNames['1stPlace']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<WeirdNames['with space']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<WeirdNames['snake_case_prop']>().toEqualTypeOf<string | undefined>();
});

test('[T-NAME-RESERVED-PROPS] Reservierte Wörter als Properties', () => {
  expectTypeOf<WeirdNames['class']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<WeirdNames['default']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<WeirdNames['delete']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<WeirdNames['constructor']>().toEqualTypeOf<string | undefined>();
});

test('[T-NAME-SCHEMA-COLLISION] Schema-Namen kollidieren nicht mit TS-Globals', () => {
  type Birthday = NonNullable<UserProfile['birthday']>;
  type Raw = NonNullable<UserProfile['raw']>;
  expectTypeOf<Birthday>().toEqualTypeOf<{ value?: string }>();
  expectTypeOf<Birthday>().not.toEqualTypeOf<globalThis.Date>();
  expectTypeOf<Raw>().toEqualTypeOf<{ value?: string }>();
  expectTypeOf<Raw>().not.toEqualTypeOf<globalThis.Object>();
});

test('[T-NAME-SCHEMA-SANITIZE] Schema-Name mit Bindestrich', () => {
  expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
});

test('[T-NAME-OPERATION-ID-SANITIZE] operationId mit Sonderzeichen', () => {
  expectTypeOf(api.invoke(getKebabSnakeOp)).toEqualTypeOf<Observable<void>>();
});

test('[T-NO-OPERATION-ID] Operation ohne operationId', () => {
  expectTypeOf(api.invoke(namingNoOperationIdGet)).toEqualTypeOf<Observable<Tag>>();
});

test('[T-UNTAGGED-OP] Operation ohne Tag', () => {
  expectTypeOf(api.invoke(untaggedOperation)).toEqualTypeOf<Observable<void>>();
});

test('[T-UNREFERENCED-SCHEMA] Nicht referenziertes Schema generiert', () => {
  expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
});
