// Dimension types (T-*) für Hey API (@hey-api/openapi-ts 0.99.0, client-angular, flache SDK-Funktionen).
// Aufruf-Ergebnis der SDK-Funktionen: Promise<{ data; error: undefined; … } | { data: undefined; error; … }>
// (throwOnError: false = Default). "Response-Typ" = data im Erfolgs-Zweig.
import { describe, expectTypeOf, test } from 'vitest';
import {
  createPet,
  deletePet,
  downloadFile,
  getInventory,
  getKebabSnakeOp,
  getNamingNoOperationId,
  getPet,
  getPrimitiveArray,
  headerAndCookieParams,
  inlineSchemas,
  listEvents,
  listPets,
  multiPathParams,
  multiStatus,
  optionalBody,
  patchPet,
  pay,
  postText,
  queryStyles,
  reportByAccept,
  reservedParamNames,
  submitForm,
  untaggedOperation,
  uploadBinary,
  uploadFiles,
} from '../client/sdk.gen';
import {
  Priority,
  type Category,
  type Circle,
  type CreatedEvent,
  type CreatePetError,
  type DateHolder,
  type Job,
  type PageMeta,
  type Pet,
  type PetFilter,
  type PetPage,
  type PetStatus,
  type PetWritable,
  type Primitives,
  type Problem,
  type Report,
  type Settings,
  type Shape,
  type Tag,
  type TreeNode,
  type UnreferencedModel,
  type UserProfile,
  type ValidationProblem,
  type WeirdEnum,
  type WeirdNames,
} from '../client/types.gen';
import type { HeaderAndCookieParamsData, QueryStylesData, MultiPathParamsData, PaymentRequest } from '../client/types.gen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<unknown>;
/** data-Typ im Erfolgs-Zweig des Default-Aufrufs. */
type DataOf<F extends AnyFn> = Exclude<Awaited<ReturnType<F>>, { data: undefined }>['data'];
/** error-Typ im Fehler-Zweig des Default-Aufrufs. */
type ErrorOf<F extends AnyFn> = Extract<Awaited<ReturnType<F>>, { data: undefined }>['error'];

const pet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] };

describe('models', () => {
  test('[T-PRIM-STRING] string', () => {
    expectTypeOf<Primitives['str']>().toEqualTypeOf<string>();
  });
  test('[T-PRIM-INT] integer → number', () => {
    expectTypeOf<Primitives['int32']>().toEqualTypeOf<number>();
  });
  test('[T-PRIM-NUMBER] float/double → number', () => {
    expectTypeOf<Primitives['float']>().toEqualTypeOf<number>();
    expectTypeOf<Primitives['double']>().toEqualTypeOf<number>();
  });
  test('[T-PRIM-BOOLEAN] boolean', () => {
    expectTypeOf<Primitives['bool']>().toEqualTypeOf<boolean>();
  });
  test('[T-FORMAT-INT64] int64 → number (kein bigint-Transformer aktiv)', () => {
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
  test('[T-FORMAT-DATE] date/date-time → string (ohne Transformer, konsistent zu R-RESP-DATE-CONSISTENT)', () => {
    expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
    expectTypeOf<DateHolder['date']>().toEqualTypeOf<string>();
    expectTypeOf<DateHolder['dateTime']>().not.toBeAny();
  });

  test('[T-ENUM-STRING] closed string enum', () => {
    const ok: Pet['status'] = 'sold';
    // @ts-expect-error 'foo' ist kein PetStatus
    const bad: Pet['status'] = 'foo';
    expectTypeOf<PetStatus>().toEqualTypeOf<'available' | 'pending' | 'sold'>();
    void ok;
    void bad;
  });
  test('[T-ENUM-INT] closed integer enum', () => {
    const ok: Priority = 3;
    // @ts-expect-error 4 ist kein Priority-Wert
    const bad: Priority = 4;
    expectTypeOf<Priority>().toEqualTypeOf<1 | 2 | 3>();
    void ok;
    void bad;
  });
  test('[T-ENUM-VARNAMES] x-enum-varnames → Priority.LOW/MEDIUM/HIGH', () => {
    expectTypeOf(Priority.LOW).toEqualTypeOf<1>();
    expectTypeOf(Priority.MEDIUM).toEqualTypeOf<2>();
    expectTypeOf(Priority.HIGH).toEqualTypeOf<3>();
  });
  test('[T-ENUM-NULLABLE] nullable enum', () => {
    const okNull: Pet['color'] = null;
    const okRed: Pet['color'] = 'red';
    // @ts-expect-error 'pink' ist kein NullableColor
    const bad: Pet['color'] = 'pink';
    void okNull;
    void okRed;
    void bad;
  });
  test('[T-ENUM-SPECIAL-VALUES] enum values unchanged', () => {
    expectTypeOf<WeirdEnum>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
  });

  test('[T-REQUIRED] required props not optional', () => {
    expectTypeOf<Pet['name']>().toEqualTypeOf<string>();
    expectTypeOf<Pet['status']>().toEqualTypeOf<PetStatus>();
    expectTypeOf<Pet['photoUrls']>().toEqualTypeOf<string[]>();
    const ok: Pet = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
    // @ts-expect-error name fehlt
    const bad: Pet = { id: 1, status: 'sold', photoUrls: [] };
    void ok;
    void bad;
  });
  test('[T-OPTIONAL] tags optional', () => {
    const ok: Pet = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
    expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
    void ok;
  });
  test('[T-NULLABLE] nickname nullable, name not', () => {
    const ok: Pet['nickname'] = null;
    const okStr: Pet['nickname'] = 'x';
    // @ts-expect-error name erlaubt kein null
    const bad: Pet['name'] = null;
    void ok;
    void okStr;
    void bad;
  });
  test('[T-READONLY] createPet ohne id/createdAt', () => {
    void createPet({ body: { name: 'a', status: 'available', photoUrls: [] } });
    expectTypeOf<PetWritable>().not.toHaveProperty('id');
    expectTypeOf<PetWritable>().not.toHaveProperty('createdAt');
  });
  test('[T-WRITEONLY] secretChipCode nicht im Response-Typ', () => {
    expectTypeOf<DataOf<typeof getPet>>().toEqualTypeOf<Pet>();
    expectTypeOf<Pet>().not.toHaveProperty('secretChipCode');
    expectTypeOf<PetWritable>().toHaveProperty('secretChipCode');
  });
  test('[T-DEFAULTS] vaccinated optional boolean im Request', () => {
    expectTypeOf<PetWritable['vaccinated']>().toEqualTypeOf<boolean | undefined>();
    const ok: PetWritable = { name: 'a', status: 'sold', photoUrls: [] };
    void ok;
  });
  test('[T-ARRAY-REF] tags: Tag[]', () => {
    expectTypeOf<NonNullable<Pet['tags']>>().toEqualTypeOf<Tag[]>();
    expectTypeOf<NonNullable<Pet['tags']>[number]['name']>().toEqualTypeOf<string>();
  });
  test('[T-ARRAY-NESTED] matrix number[][]', () => {
    expectTypeOf<Settings['matrix']>().toEqualTypeOf<number[][] | undefined>();
  });
  test('[T-ARRAY-UNIQUE] uniqueTags string[]', () => {
    expectTypeOf<Settings['uniqueTags']>().toEqualTypeOf<string[] | undefined>();
  });
  test('[T-ADDPROPS-SCHEMA] counters Record<string, number>', () => {
    expectTypeOf<NonNullable<Settings['counters']>>().toEqualTypeOf<{ [key: string]: number }>();
    const ok: Settings['counters'] = { a: 1 };
    // @ts-expect-error Wert string statt number
    const bad: Settings['counters'] = { a: 'x' };
    void ok;
    void bad;
  });
  test('[T-ADDPROPS-FALSE] strict ohne Index-Signatur', () => {
    const ok: Settings['strict'] = { a: 'x' };
    // @ts-expect-error excess property b
    const bad: Settings['strict'] = { a: 'x', b: 1 };
    void ok;
    void bad;
  });
  test('[T-ADDPROPS-TRUE] freeForm Record<string, unknown>', () => {
    expectTypeOf<NonNullable<Settings['freeForm']>>().toEqualTypeOf<{ [key: string]: unknown }>();
    expectTypeOf<NonNullable<Settings['freeForm']>[string]>().toBeUnknown();
  });
  test('[T-ADDPROPS-WITH-PROPS] mixed: known + string index', () => {
    type Mixed = NonNullable<Settings['mixed']>;
    expectTypeOf<Mixed['known']>().toEqualTypeOf<string>();
    const ok: Mixed = { known: 'k', extra: 'e' };
    // @ts-expect-error known fehlt
    const bad: Mixed = { extra: 'e' };
    void ok;
    void bad;
  });
  test('[T-ALLOF-COMPOSE] PetPage = PageMeta & items', () => {
    expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
    expectTypeOf<PetPage>().toMatchTypeOf<PageMeta>();
  });
  test('[T-ONEOF-DISC] Shape narrowbar über kind', () => {
    const area = (s: Shape): number => {
      switch (s.kind) {
        case 'circle':
          expectTypeOf(s.radius).toEqualTypeOf<number>();
          return s.radius;
        case 'rect':
          // @ts-expect-error radius existiert nicht auf Rectangle
          void s.radius;
          return s.width * s.height;
        default:
          return 0;
      }
    };
    void area;
  });
  test('[T-ONEOF-DISC-MAPPING] Circle.kind ist literal circle', () => {
    expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
    // @ts-expect-error Circle mit kind 'rect' muss Fehler sein
    const bad: Circle = { kind: 'rect', radius: 1 };
    void bad;
  });
  test('[T-ALLOF-DISC-INHERITANCE] CreatedEvent hat BaseEvent-Felder + eventType literal', () => {
    expectTypeOf<CreatedEvent['eventType']>().toEqualTypeOf<'created'>();
    expectTypeOf<CreatedEvent['occurredAt']>().toEqualTypeOf<string>();
    expectTypeOf<CreatedEvent['petId']>().toEqualTypeOf<number>();
    // Response von listEvents selbst ist nur BaseEvent[] (nicht narrowbar) – zweite Alternative der Erwartung greift.
    expectTypeOf<DataOf<typeof listEvents>>().toBeArray();
  });
  test('[T-ONEOF-PLAIN] method: CardPayment | SepaPayment', () => {
    const card: PaymentRequest = { amount: 1, method: { cardNumber: '1', cvc: '2' } };
    const sepa: PaymentRequest = { amount: 1, method: { iban: 'DE' } };
    // @ts-expect-error {} ist weder Card noch Sepa
    const bad1: PaymentRequest = { amount: 1, method: {} };
    // @ts-expect-error {foo:1} ist weder Card noch Sepa
    const bad2: PaymentRequest = { amount: 1, method: { foo: 1 } };
    expectTypeOf<PaymentRequest['method']>().not.toBeAny();
    void pay({ body: card });
    void sepa;
    void bad1;
    void bad2;
  });
  test('[T-ANYOF] note: string | number', () => {
    expectTypeOf<PaymentRequest['note']>().toEqualTypeOf<string | number | undefined>();
    const ok: PaymentRequest = { amount: 1, method: { iban: 'x' }, note: 3 };
    // @ts-expect-error boolean nicht erlaubt
    const bad: PaymentRequest = { amount: 1, method: { iban: 'x' }, note: true };
    void ok;
    void bad;
  });
  test('[T-RECURSIVE] TreeNode.children', () => {
    expectTypeOf<TreeNode['children']>().toEqualTypeOf<TreeNode[] | undefined>();
    const t = {} as TreeNode;
    expectTypeOf(t.children![0]!.children![0]!.value).toEqualTypeOf<string>();
  });
  test('[T-CIRCULAR] TreeNode ↔ TreeParentRef, Category.parent', () => {
    const t = {} as TreeNode;
    expectTypeOf(t.parent?.node?.value).toEqualTypeOf<string | undefined>();
    const c = {} as Category;
    expectTypeOf(c.parent?.parent?.name).toEqualTypeOf<string | undefined>();
  });
  test('[T-INLINE-OBJECT] inlineSchemas typisiert', () => {
    type Res = DataOf<typeof inlineSchemas>;
    expectTypeOf<Res['accepted']>().toEqualTypeOf<boolean>();
    expectTypeOf<Res['id']>().toEqualTypeOf<string>();
    type Body = Parameters<typeof inlineSchemas>[0]['body'];
    expectTypeOf<NonNullable<Body['nested']>['depth']>().toEqualTypeOf<number | undefined>();
  });
  test('[T-INLINE-ENUM] mode fast|slow', () => {
    void inlineSchemas({ body: { mode: 'fast' } });
    // @ts-expect-error 'medium' ist kein mode
    void inlineSchemas({ body: { mode: 'medium' } });
  });
});

describe('params', () => {
  test('[T-PARAM-PATH-REQUIRED] petId Pflicht und number', () => {
    void getPet({ path: { petId: 1 } });
    // @ts-expect-error path fehlt
    void getPet({});
    // @ts-expect-error petId string statt number
    void getPet({ path: { petId: '1' } });
  });
  test('[T-PARAM-PATH-TYPES] multiPathParams', () => {
    type P = MultiPathParamsData['path'];
    expectTypeOf<P['intId']>().toEqualTypeOf<number>();
    expectTypeOf<P['enumId']>().toEqualTypeOf<PetStatus>();
    expectTypeOf<P['stringId']>().toEqualTypeOf<string>();
    expectTypeOf<P['uuidId']>().toEqualTypeOf<string>();
    void multiPathParams({ path: { stringId: 'a', intId: 1, uuidId: 'u', enumId: 'sold' } });
    // @ts-expect-error ungültiger enumId
    void multiPathParams({ path: { stringId: 'a', intId: 1, uuidId: 'u', enumId: 'nope' } });
  });
  test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
    void listPets();
    void listPets({ query: { limit: 10 } });
    expectTypeOf<NonNullable<NonNullable<Parameters<typeof listPets>[0]>['query']>['limit']>().toEqualTypeOf<number | undefined>();
  });
  test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required = Fehler', () => {
    void queryStyles({ query: { required: 'r' } });
    // @ts-expect-error required fehlt
    void queryStyles({ query: {} });
  });
  test('[T-PARAM-QUERY-ENUM] sort/status geschlossen', () => {
    void queryStyles({ query: { required: 'r', sort: 'asc' } });
    // @ts-expect-error 'up' ist kein sort-Wert
    void queryStyles({ query: { required: 'r', sort: 'up' } });
    void listPets({ query: { status: 'sold' } });
    // @ts-expect-error 'gone' ist kein PetStatus
    void listPets({ query: { status: 'gone' } });
  });
  test('[T-PARAM-QUERY-ARRAY] Array-/deepObject-Query typisiert', () => {
    type Q = QueryStylesData['query'];
    expectTypeOf<Q['tagsExplode']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<Q['tagsSpace']>().toEqualTypeOf<number[] | undefined>();
    expectTypeOf<Q['filter']>().toEqualTypeOf<PetFilter | undefined>();
  });
  test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
    void headerAndCookieParams({ headers: { 'X-Request-Id': 'id', 'X-Retry-Count': 3 } });
    // @ts-expect-error X-Request-Id fehlt
    void headerAndCookieParams({ headers: { 'X-Retry-Count': 3 } });
    expectTypeOf<HeaderAndCookieParamsData['headers']['X-Retry-Count']>().toEqualTypeOf<number | undefined>();
  });
  test('[T-NAME-RESERVED-PARAM] class/default/page-size/filter.name aufrufbar', () => {
    void reservedParamNames({ path: { class: 'x' }, query: { default: 'd', 'page-size': 5, 'filter.name': 'n' } });
  });
});

describe('bodies', () => {
  test('[T-BODY-REQUIRED] createPet Body Pflicht & typisiert', () => {
    void createPet({ body: { name: 'a', status: 'sold', photoUrls: [] } });
    // @ts-expect-error body fehlt
    void createPet({});
    // @ts-expect-error name: 123
    void createPet({ body: { name: 123, status: 'sold', photoUrls: [] } });
  });
  test('[T-BODY-OPTIONAL] optionalBody ohne/mit Body', () => {
    void optionalBody();
    void optionalBody({ body: { name: 't' } });
  });
  test('[T-PARTIAL-BODY] patchPet merge-patch', () => {
    void patchPet({ path: { petId: 1 }, body: { nickname: null } });
    // @ts-expect-error status 'x' ungültig
    void patchPet({ path: { petId: 1 }, body: { status: 'x' } });
  });
  test('[T-BODY-FORM] submitForm typisiert', () => {
    type B = Parameters<typeof submitForm>[0]['body'];
    expectTypeOf<B['username']>().toEqualTypeOf<string>();
    expectTypeOf<B['password']>().toEqualTypeOf<string>();
    expectTypeOf<B['remember']>().toEqualTypeOf<boolean | undefined>();
    // @ts-expect-error password fehlt
    void submitForm({ body: { username: 'u' } });
  });
  test('[T-BODY-MULTIPART] uploadFiles typisiert', () => {
    type B = Parameters<typeof uploadFiles>[0]['body'];
    expectTypeOf<B['file']>().toMatchTypeOf<Blob>();
    expectTypeOf<B['title']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<B['attachments']>[number]>().toMatchTypeOf<Blob>();
    void uploadFiles({ body: { title: 't', file: new Blob() } });
    // @ts-expect-error file als string
    void uploadFiles({ body: { title: 't', file: 'string' } });
  });
  test('[T-BODY-OCTET] uploadBinary Blob', () => {
    void uploadBinary({ body: new Blob() });
    // @ts-expect-error {} ist kein Blob
    void uploadBinary({ body: {} });
  });
});

describe('responses', () => {
  test('[T-RESP-200] getPet → Pet, listPets → PetPage', () => {
    expectTypeOf<DataOf<typeof getPet>>().toEqualTypeOf<Pet>();
    expectTypeOf<DataOf<typeof listPets>>().toEqualTypeOf<PetPage>();
    // throwOnError: true → data direkt Pet
    expectTypeOf<Awaited<ReturnType<typeof getPet<true>>>['data']>().toEqualTypeOf<Pet>();
    void pet;
  });
  test('[T-RESP-204] deletePet → void', () => {
    expectTypeOf<DataOf<typeof deletePet>>().not.toBeAny();
    expectTypeOf<DataOf<typeof deletePet>>().toEqualTypeOf<void>();
  });
  test('[T-RESP-MULTI-2XX] multiStatus → Pet | Job', () => {
    expectTypeOf<DataOf<typeof multiStatus>>().toEqualTypeOf<Pet | Job>();
  });
  test('[T-RESP-BINARY] downloadFile → Blob', () => {
    expectTypeOf<DataOf<typeof downloadFile>>().not.toBeAny();
    expectTypeOf<DataOf<typeof downloadFile>>().toMatchTypeOf<Blob>();
    expectTypeOf<DataOf<typeof downloadFile>>().not.toBeString();
  });
  test('[T-RESP-TEXT] postText → string', () => {
    expectTypeOf<DataOf<typeof postText>>().toEqualTypeOf<string>();
  });
  test('[T-RESP-PRIMITIVE-ARRAY] number[]', () => {
    expectTypeOf<DataOf<typeof getPrimitiveArray>>().toEqualTypeOf<number[]>();
  });
  test('[T-RESP-MAP] Record<string, number>', () => {
    expectTypeOf<DataOf<typeof getInventory>>().toEqualTypeOf<{ [key: string]: number }>();
  });
  test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF wählbar → Blob', () => {
    // Hey API kennt keinen Accept-/Variant-Parameter; nur die JSON-Variante ist typisiert.
    expectTypeOf<DataOf<typeof reportByAccept>>().toEqualTypeOf<Report | Blob>();
  });
  test('[T-ERROR-MODEL] Fehler-Body typisiert an Operation gebunden', () => {
    expectTypeOf<ErrorOf<typeof getPet>>().toEqualTypeOf<Problem>();
    expectTypeOf<ErrorOf<typeof createPet>>().toEqualTypeOf<ValidationProblem>();
    expectTypeOf<CreatePetError>().toEqualTypeOf<ValidationProblem>();
  });
});

describe('naming', () => {
  test('[T-NAME-SPECIAL-PROPS] Property-Namen exakt', () => {
    expectTypeOf<WeirdNames['x-request-id']>().toEqualTypeOf<string>();
    expectTypeOf<WeirdNames['@type']>().toEqualTypeOf<string>();
    expectTypeOf<WeirdNames['$ref']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['1stPlace']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<WeirdNames['with space']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['snake_case_prop']>().toEqualTypeOf<string | undefined>();
  });
  test('[T-NAME-RESERVED-PROPS] class/default/delete/constructor', () => {
    expectTypeOf<WeirdNames['class']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['default']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['delete']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<WeirdNames['constructor']>().toEqualTypeOf<string | undefined>();
  });
  test('[T-NAME-SCHEMA-COLLISION] birthday = Schema Date, raw = Schema Object', () => {
    expectTypeOf<NonNullable<UserProfile['birthday']>>().toEqualTypeOf<{ value?: string }>();
    expectTypeOf<NonNullable<UserProfile['raw']>>().toEqualTypeOf<{ value?: string }>();
  });
  test('[T-NAME-SCHEMA-SANITIZE] UserProfile', () => {
    expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
  });
  test('[T-NAME-OPERATION-ID-SANITIZE] getKebabSnakeOp', () => {
    expectTypeOf(getKebabSnakeOp).toBeFunction();
    void getKebabSnakeOp();
  });
  test('[T-NO-OPERATION-ID] getNamingNoOperationId → Tag', () => {
    expectTypeOf<DataOf<typeof getNamingNoOperationId>>().toEqualTypeOf<Tag>();
  });
  test('[T-UNTAGGED-OP] untaggedOperation aufrufbar', () => {
    expectTypeOf(untaggedOperation).toBeFunction();
    void untaggedOperation();
  });
  test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
    expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
  });
});
