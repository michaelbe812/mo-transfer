/**
 * Typ-Tests (T-*) für den NSwag-Angular-Client (typeStyle Interface, dateTimeType String, enumStyle StringLiteral).
 * Fehlende Typen werden per inline `import('../client/api').X` referenziert, damit der Fehler im jeweiligen Test landet.
 */
import { describe, expectTypeOf, test } from 'vitest';
import type { Observable } from 'rxjs';
import type {
  ApiException,
  BodiesClient,
  Body,
  Body2,
  Category,
  Client,
  CreatedEvent,
  DateHolder,
  NamingClient,
  ParamsClient,
  Pet,
  PetFilter,
  PetPage,
  PetsClient,
  PetStatus,
  PaymentRequest,
  PolymorphismClient,
  Primitives,
  Priority,
  ResponsesClient,
  Settings,
  Shape,
  Tag,
  TreeNode,
  UnreferencedModel,
  UserProfile,
  WeirdEnum,
  WeirdNames,
} from '../client/api';

/** Wert-Typ eines Observables. */
type Emitted<T> = T extends Observable<infer U> ? U : never;
/** Ergebnis-Typ einer Client-Methode. */
type ResultOf<F extends (...args: never[]) => unknown> = Emitted<ReturnType<F>>;

declare const pets: PetsClient;
declare const params: ParamsClient;
declare const bodies: BodiesClient;
declare const responses: ResponsesClient;
declare const polymorphism: PolymorphismClient;
declare const naming: NamingClient;
declare const untagged: Client;
declare const blob: Blob;

const validPet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] };

describe('nswag types: models', () => {
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

  test('[T-FORMAT-INT64] int64 → number', () => {
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

  test('[T-FORMAT-DATE] date-time → string (dateTimeType String, Runtime liefert string)', () => {
    expectTypeOf<DateHolder['dateTime']>().not.toBeAny();
    expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
  });

  test('[T-ENUM-STRING] PetStatus geschlossen', () => {
    const ok: Pet['status'] = 'sold';
    // @ts-expect-error 'foo' ist kein PetStatus
    const bad: Pet['status'] = 'foo';
    expectTypeOf<PetStatus>().toEqualTypeOf<'available' | 'pending' | 'sold'>();
    void ok;
    void bad;
  });

  test('[T-ENUM-INT] Priority 1|2|3', () => {
    const ok: Priority = 3;
    // @ts-expect-error 4 ist keine Priority
    const bad: Priority = 4;
    void ok;
    void bad;
  });

  // Audit: kein Wert-Export Priority (StringLiteral-Stil) = keine benannten Konstanten überhaupt → unsupported
  // (analog ng-openapi-gen); fail nur, wenn benannte Member existieren, aber falsch heißen (z. B. _1/_2/_3).
  test.skip('[T-ENUM-VARNAMES] Priority.LOW/MEDIUM/HIGH — unsupported: x-enum-varnames ignoriert, Priority ist reiner Union-Typ ohne Wert-Export/benannte Member', () => {});

  test('[T-ENUM-NULLABLE] color: null | red, nicht pink', () => {
    const okNull: Pet['color'] = null;
    const okRed: Pet['color'] = 'red';
    // @ts-expect-error 'pink' ist keine NullableColor
    const bad: Pet['color'] = 'pink';
    void okNull;
    void okRed;
    void bad;
  });

  test('[T-ENUM-SPECIAL-VALUES] WeirdEnum exakte Union', () => {
    expectTypeOf<WeirdEnum>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
  });

  test('[T-REQUIRED] name/status/photoUrls Pflicht', () => {
    type ResponsePet = ResultOf<PetsClient['getPet']>;
    const ok: ResponsePet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
    // @ts-expect-error name fehlt
    const bad: ResponsePet = { id: 1, status: 'sold', photoUrls: [] };
    expectTypeOf<ResponsePet['name']>().toEqualTypeOf<string>();
    expectTypeOf<ResponsePet['status']>().toEqualTypeOf<PetStatus>();
    expectTypeOf<ResponsePet['photoUrls']>().toEqualTypeOf<string[]>();
    void ok;
    void bad;
  });

  test('[T-OPTIONAL] tags optional', () => {
    const p: Pet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
    expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
    void p;
  });

  test('[T-NULLABLE] nickname null erlaubt, name nicht', () => {
    const nick: Pet['nickname'] = null;
    const nickStr: Pet['nickname'] = 'x';
    const name: Pet['name'] = 'x';
    // @ts-expect-error name ist nicht nullable
    const badName: Pet['name'] = null;
    void nick;
    void nickStr;
    void name;
    void badName;
  });

  test('[T-READONLY] createPet ohne id/createdAt', () => {
    // Erwartet: kompiliert. NSwag nutzt dasselbe Pet-Interface für Request und Response (id: required, nur readonly-Modifier).
    pets.createPet({ name: 'Bello', status: 'available', photoUrls: [] });
  });

  test('[T-WRITEONLY] getPet-Response ohne secretChipCode', () => {
    type ResponsePet = ResultOf<PetsClient['getPet']>;
    expectTypeOf<ResponsePet>().not.toHaveProperty('secretChipCode');
  });

  test('[T-DEFAULTS] vaccinated optional boolean im Request', () => {
    type CreateBody = Parameters<PetsClient['createPet']>[0];
    expectTypeOf<CreateBody['vaccinated']>().toEqualTypeOf<boolean | undefined>();
    const withoutVaccinated: CreateBody = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
    void withoutVaccinated;
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
    const ok: NonNullable<Settings['counters']> = { a: 1 };
    // @ts-expect-error Wert string nicht erlaubt
    const bad: NonNullable<Settings['counters']> = { a: 'x' };
    expectTypeOf<ResultOf<ResponsesClient['getInventory']>>().toEqualTypeOf<{ [key: string]: number }>();
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

  test('[T-ADDPROPS-TRUE] freeForm Record<string, unknown>, nicht any', () => {
    expectTypeOf<Settings['freeForm']>().not.toBeAny();
    expectTypeOf<NonNullable<Settings['freeForm']>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test('[T-ADDPROPS-WITH-PROPS] mixed.known string + weitere Keys', () => {
    type Mixed = NonNullable<Settings['mixed']>;
    expectTypeOf<Mixed['known']>().toEqualTypeOf<string>();
    const ok: Mixed = { known: 'k', extra: 'e' };
    // @ts-expect-error known ist Pflicht
    const bad: Mixed = { extra: 'e' };
    void ok;
    void bad;
  });

  test('[T-ALLOF-COMPOSE] PetPage = PageMeta & items', () => {
    expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
    // @ts-expect-error items fehlt
    const bad: PetPage = { total: 0, limit: 1, offset: 0 };
    void bad;
  });
});

describe('nswag types: polymorphism', () => {
  test('[T-ONEOF-DISC] Shape narrowt über kind', () => {
    // Shape ist bei NSwag `interface Shape { [key: string]: any }` → kein Narrowing (kind ist Index-Zugriff → TS4111).
    const narrow = (shape: Shape): number => {
      switch (shape.kind) {
        case 'circle':
          expectTypeOf(shape.radius).toEqualTypeOf<number>();
          return shape.radius;
        default:
          return 0;
      }
    };
    void narrow;
  });

  test('[T-ONEOF-DISC-MAPPING] Circle.kind = circle', () => {
    // Circle wird von NSwag gar nicht generiert (Schema verschwindet, listShapes referenziert undefiniertes Anonymous2).
    type Circle = import('../client/api').Circle;
    expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
  });

  test('[T-ALLOF-DISC-INHERITANCE] CreatedEvent: eventType literal created + BaseEvent-Felder', () => {
    expectTypeOf<CreatedEvent['eventType']>().toEqualTypeOf<'created'>();
    expectTypeOf<CreatedEvent['occurredAt']>().toEqualTypeOf<string>();
    expectTypeOf<CreatedEvent['petId']>().toEqualTypeOf<number>();
  });

  test('[T-ONEOF-PLAIN] method: CardPayment | SepaPayment', () => {
    const card: PaymentRequest['method'] = { cardNumber: '1234123412341234', cvc: '123' };
    const sepa: PaymentRequest['method'] = { iban: 'DE00' };
    // @ts-expect-error leeres Objekt ist keine Zahlungsart
    const bad: PaymentRequest['method'] = {};
    expectTypeOf<PaymentRequest['method']>().not.toBeAny();
    void card;
    void sepa;
    void bad;
  });

  test('[T-ANYOF] note: string | number', () => {
    const s: PaymentRequest['note'] = 'x';
    const n: PaymentRequest['note'] = 1;
    // @ts-expect-error boolean nicht erlaubt
    const bad: PaymentRequest['note'] = true;
    void s;
    void n;
    void bad;
  });

  test('[T-RECURSIVE] TreeNode.children: TreeNode[]', () => {
    expectTypeOf<NonNullable<TreeNode['children']>>().toEqualTypeOf<TreeNode[]>();
    const deep = (node: TreeNode) => node.children![0]!.children![0]!.value;
    expectTypeOf(deep).returns.toEqualTypeOf<string>();
  });

  test('[T-CIRCULAR] TreeNode ↔ TreeParentRef, Category.parent', () => {
    const viaParent = (node: TreeNode) => node.parent?.node?.value;
    expectTypeOf(viaParent).returns.toEqualTypeOf<string | undefined>();
    const categoryName = (category: Category) => category.parent?.parent?.name;
    expectTypeOf(categoryName).returns.toEqualTypeOf<string | undefined>();
  });
});

describe('nswag types: operations', () => {
  test('[T-INLINE-OBJECT] inlineSchemas typisiert', () => {
    type Result = ResultOf<BodiesClient['inlineSchemas']>;
    expectTypeOf<Result['accepted']>().toEqualTypeOf<boolean>();
    expectTypeOf<Result['id']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<Body2['nested']>['depth']>().toEqualTypeOf<number | undefined>();
  });

  test('[T-INLINE-ENUM] mode fast|slow', () => {
    bodies.inlineSchemas({ mode: 'fast' });
    // @ts-expect-error 'medium' ist kein Modus
    bodies.inlineSchemas({ mode: 'medium' });
  });

  test('[T-PARAM-PATH-REQUIRED] getPet(petId: number)', () => {
    pets.getPet(1);
    // @ts-expect-error petId fehlt
    pets.getPet();
    // @ts-expect-error string statt number
    pets.getPet('1');
  });

  test('[T-PARAM-PATH-TYPES] multiPathParams', () => {
    expectTypeOf<Parameters<ParamsClient['multiPathParams']>[0]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<ParamsClient['multiPathParams']>[1]>().toEqualTypeOf<number>();
    expectTypeOf<Parameters<ParamsClient['multiPathParams']>[2]>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<ParamsClient['multiPathParams']>[3]>().toEqualTypeOf<PetStatus>();
    params.multiPathParams('a', 1, 'u', 'sold');
    // @ts-expect-error ungültiger Status
    params.multiPathParams('a', 1, 'u', 'gone');
  });

  test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
    pets.listPets();
    expectTypeOf<Parameters<PetsClient['listPets']>[0]>().toEqualTypeOf<number | undefined>();
  });

  test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required = Fehler', () => {
    params.queryStyles('r');
    // @ts-expect-error required fehlt
    params.queryStyles();
  });

  test('[T-PARAM-QUERY-ENUM] sort asc|desc', () => {
    params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'asc');
    // @ts-expect-error 'up' ist kein sort-Wert
    params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'up');
    pets.listPets(undefined, undefined, 'sold');
  });

  test('[T-PARAM-QUERY-ARRAY] tagsExplode string[], tagsSpace number[], filter PetFilter', () => {
    type Args = Parameters<ParamsClient['queryStyles']>;
    expectTypeOf<Args[1]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<Args[4]>().toEqualTypeOf<number[] | undefined>();
    expectTypeOf<Args[5]>().toEqualTypeOf<PetFilter | undefined>();
  });

  test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
    params.headerAndCookieParams('id');
    // @ts-expect-error X-Request-Id fehlt
    params.headerAndCookieParams();
    expectTypeOf<Parameters<ParamsClient['headerAndCookieParams']>[2]>().toEqualTypeOf<number | undefined>();
  });

  test('[T-NAME-RESERVED-PARAM] reservedParamNames mit 4 Parametern aufrufbar', () => {
    // NSwag erzeugt `reservedParamNames(class: string, default?: string, …)` → Syntaxfehler (TS1390), die ganze Datei
    // bricht. Operation musste per excludedOperationIds ausgeschlossen werden → Methode fehlt.
    params.reservedParamNames('x', 'd', 5, 'n');
  });

  test('[T-BODY-REQUIRED] createPet Body Pflicht + typisiert', () => {
    pets.createPet(validPet);
    // @ts-expect-error Body fehlt
    pets.createPet();
    // @ts-expect-error name: number
    pets.createPet({ ...validPet, name: 123 });
  });

  test('[T-BODY-OPTIONAL] optionalBody() / optionalBody(tag)', () => {
    bodies.optionalBody();
    bodies.optionalBody({ name: 'x' });
  });

  test('[T-PARTIAL-BODY] patchPet', () => {
    pets.patchPet({ nickname: null }, 1);
    // @ts-expect-error status 'x' ungültig
    pets.patchPet({ status: 'x' }, 1);
  });

  test('[T-BODY-FORM] submitForm', () => {
    expectTypeOf<Body['username']>().toEqualTypeOf<string>();
    expectTypeOf<Body['password']>().toEqualTypeOf<string>();
    expectTypeOf<Body['remember']>().toEqualTypeOf<boolean | undefined>();
    bodies.submitForm({ username: 'u', password: 'p' });
    // @ts-expect-error password fehlt
    bodies.submitForm({ username: 'u' });
  });

  test('[T-BODY-MULTIPART] file Blob, title Pflicht, attachments Blob[]', () => {
    type Args = Parameters<BodiesClient['uploadFiles']>;
    // NSwag: (title?: string, file?: FileParameter, attachments?: FileParameter[], …) — title optional, file {data:any}
    expectTypeOf<Args[0]>().toEqualTypeOf<string>();
    expectTypeOf<Args[1]>().toEqualTypeOf<Blob>();
    expectTypeOf<Args[2]>().toEqualTypeOf<Blob[] | undefined>();
  });

  test('[T-BODY-OCTET] uploadBinary(Blob)', () => {
    bodies.uploadBinary(blob);
    // @ts-expect-error Objekt ist kein Blob
    bodies.uploadBinary({});
  });

  test('[T-RESP-200] getPet → Pet, listPets → PetPage', () => {
    expectTypeOf(pets.getPet(1)).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf(pets.listPets()).toEqualTypeOf<Observable<PetPage>>();
  });

  test('[T-RESP-204] deletePet → void', () => {
    expectTypeOf<ResultOf<PetsClient['deletePet']>>().not.toBeAny();
    expectTypeOf<ResultOf<PetsClient['deletePet']>>().toEqualTypeOf<void>();
  });

  test('[T-RESP-MULTI-2XX] multiStatus → Pet | Job', () => {
    type Job = import('../client/api').Job;
    expectTypeOf<ResultOf<ResponsesClient['multiStatus']>>().toEqualTypeOf<Pet | Job>();
  });

  test('[T-RESP-BINARY] downloadFile → Blob', () => {
    // NSwag liefert FileResponse { data: Blob; status; fileName?; headers? } statt Blob.
    expectTypeOf<ResultOf<ResponsesClient['downloadFile']>>().toEqualTypeOf<Blob>();
  });

  test('[T-RESP-TEXT] postText → string', () => {
    expectTypeOf<ResultOf<BodiesClient['postText']>>().toEqualTypeOf<string>();
  });

  test('[T-RESP-PRIMITIVE-ARRAY] getPrimitiveArray → number[]', () => {
    expectTypeOf<ResultOf<ResponsesClient['getPrimitiveArray']>>().toEqualTypeOf<number[]>();
  });

  test('[T-RESP-MAP] getInventory → Record<string, number>', () => {
    expectTypeOf<ResultOf<ResponsesClient['getInventory']>>().toEqualTypeOf<Record<string, number>>();
  });

  test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF → Blob wählbar', () => {
    type Report = import('../client/api').Report;
    expectTypeOf<ResultOf<ResponsesClient['reportByAccept']>>().toEqualTypeOf<Report>();
    // PDF-Variante: es gibt keinen Parameter / keine Überladung zur Auswahl → erwarteter Aufruf existiert nicht.
    expectTypeOf(responses.reportByAccept).parameter(0).toEqualTypeOf<'application/json' | 'application/pdf'>();
  });

  test('[T-ERROR-MODEL] typisierter Fehler-Body (Problem/ValidationProblem) an Operation gebunden', () => {
    // NSwag: ApiException.result ist any, Fehler-Typ nicht an Operation gebunden.
    expectTypeOf<ApiException['result']>().not.toBeAny();
  });
});

describe('nswag types: naming', () => {
  test('[T-NAME-SPECIAL-PROPS] Original-Property-Namen', () => {
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

  test('[T-NAME-SCHEMA-COLLISION] birthday ist Schema-Date, raw nicht globales Object', () => {
    type Birthday = NonNullable<UserProfile['birthday']>;
    expectTypeOf<Birthday>().not.toEqualTypeOf<Date>();
    expectTypeOf<Birthday['value']>().toEqualTypeOf<string | undefined>();
    type Raw = NonNullable<UserProfile['raw']>;
    expectTypeOf<Raw>().not.toEqualTypeOf<object>();
    expectTypeOf<Raw['value']>().toEqualTypeOf<string | undefined>();
  });

  test('[T-NAME-SCHEMA-SANITIZE] UserProfile', () => {
    expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
  });

  test('[T-NAME-OPERATION-ID-SANITIZE] get-kebab_snake.op aufrufbar', () => {
    expectTypeOf(naming.getKebab_snake_op()).toEqualTypeOf<Observable<void>>();
  });

  test('[T-NO-OPERATION-ID] Name aus Methode+Pfad, liefert Tag', () => {
    expectTypeOf(naming.noOperationId()).toEqualTypeOf<Observable<Tag>>();
  });

  test('[T-UNTAGGED-OP] untaggedOperation aufrufbar', () => {
    expectTypeOf(untagged.untaggedOperation()).toEqualTypeOf<Observable<void>>();
  });

  test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
    expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
  });
});

void polymorphism;
