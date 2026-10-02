/**
 * Dimension "types" (T-*) für ng-openapi 0.4.1 (Config: openapi.config.ts — enumStyle union, dateType string,
 * positionale Parameter). Reine Compile-Zeit-Tests (vitest typecheck). Services werden nur als `declare const`
 * verwendet; es wird nichts ausgeführt.
 */
import { describe, expectTypeOf, test } from 'vitest';
import type { Observable, ObservedValueOf } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';
import {
  Priority,
  type Category,
  type Circle,
  type CreatedEvent,
  type DateHolder,
  type Job,
  type KitchenSink,
  type PaymentRequest,
  type PaymentResult,
  type Pet,
  type PetFilter,
  type PetPage,
  type PetStatus,
  type Primitives,
  type Problem,
  type Report,
  type Settings,
  type Shape,
  type Tag,
  type TreeNode,
  type UnreferencedModel,
  type UserProfile,
  type WeirdEnum,
  type WeirdNames,
} from '../client/models';
import type {
  BodiesService,
  DefaultService,
  NamingService,
  ParamsService,
  PetsService,
  PolymorphismService,
  ResponsesService,
} from '../client/services';

declare const pets: PetsService;
declare const params: ParamsService;
declare const bodies: BodiesService;
declare const responses: ResponsesService;
declare const polymorphism: PolymorphismService;
declare const naming: NamingService;
declare const defaults: DefaultService;
declare const blob: Blob;

/** Ein vollständiges, gültiges Pet (wie es der Server liefert). */
const fullPet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] };

describe('ng-openapi types: models', () => {
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

  test('[T-FORMAT-DATE] date-time ist string (dateType: string), nicht any', () => {
    expectTypeOf<DateHolder['dateTime']>().not.toBeAny();
    expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
    expectTypeOf<DateHolder['date']>().toEqualTypeOf<string>();
  });

  test('[T-ENUM-STRING] Pet.status closed enum', () => {
    const available: Pet['status'] = 'available';
    const pending: Pet['status'] = 'pending';
    const sold: Pet['status'] = 'sold';
    // @ts-expect-error 'foo' ist kein PetStatus
    const invalid: Pet['status'] = 'foo';
    void [available, pending, sold, invalid];
  });

  test('[T-ENUM-INT] Priority 1|2|3', () => {
    const one: Priority = 1;
    const three: Priority = 3;
    // @ts-expect-error 4 ist kein Priority-Wert
    const four: Priority = 4;
    void [one, three, four];
  });

  test('[T-ENUM-VARNAMES] Priority.LOW/MEDIUM/HIGH aus x-enum-varnames', () => {
    // ng-openapi ignoriert x-enum-varnames und erzeugt Priority._1/_2/_3 → Property LOW existiert nicht.
    const low: 1 = Priority.LOW;
    const medium: 2 = Priority.MEDIUM;
    const high: 3 = Priority.HIGH;
    void [low, medium, high];
  });

  test('[T-ENUM-NULLABLE] Pet.color akzeptiert null und red, lehnt pink ab', () => {
    const red: Pet['color'] = 'red';
    const none: Pet['color'] = null;
    // @ts-expect-error 'pink' ist keine Farbe
    const pink: Pet['color'] = 'pink';
    void [red, none, pink];
  });

  test('[T-ENUM-SPECIAL-VALUES] WeirdEnum exakt die Union', () => {
    expectTypeOf<WeirdEnum>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
  });

  test('[T-REQUIRED] name/status/photoUrls Pflicht', () => {
    const ok: Pet = { id: 1, name: 'n', status: 'sold', photoUrls: [] };
    // @ts-expect-error name fehlt
    const missingName: Pet = { id: 1, status: 'sold', photoUrls: [] };
    expectTypeOf<Pet['name']>().toEqualTypeOf<string>();
    expectTypeOf<Pet['status']>().toEqualTypeOf<PetStatus>();
    expectTypeOf<Pet['photoUrls']>().toEqualTypeOf<string[]>();
    void [ok, missingName];
  });

  test('[T-OPTIONAL] tags optional', () => {
    const withoutTags: Pet = { id: 1, name: 'n', status: 'sold', photoUrls: [] };
    void withoutTags;
  });

  test('[T-NULLABLE] nickname nullable, name nicht', () => {
    const nullNick: Pet['nickname'] = null;
    const stringNick: Pet['nickname'] = 'x';
    // @ts-expect-error name ist nicht nullable
    const nullName: Pet['name'] = null;
    void [nullNick, stringNick, nullName];
  });

  test('[T-READONLY] createPet akzeptiert Body ohne id/createdAt', () => {
    // ng-openapi nutzt dasselbe Pet-Interface für Request und Response: id ist (readonly) Pflicht → Compile-Fehler.
    pets.createPet({ name: 'n', status: 'sold', photoUrls: [] });
  });

  test('[T-WRITEONLY] getPet-Response ohne secretChipCode', () => {
    const result = pets.getPet(1);
    expectTypeOf(result).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf<Pet>().not.toHaveProperty('secretChipCode');
  });

  test('[T-DEFAULTS] vaccinated optional boolean im Request', () => {
    expectTypeOf<Pet['vaccinated']>().toEqualTypeOf<boolean | undefined>();
    const withoutVaccinated: Pick<Pet, 'vaccinated'> = {};
    void withoutVaccinated;
    // Request-Typ von createPet ist Pet
    expectTypeOf<Parameters<PetsService['createPet']>[0]>().toEqualTypeOf<Pet>();
  });

  test('[T-ARRAY-REF] tags: Array<Tag>', () => {
    expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
    expectTypeOf<NonNullable<Pet['tags']>[number]['name']>().toEqualTypeOf<string>();
  });

  test('[T-ARRAY-NESTED] matrix: number[][]', () => {
    expectTypeOf<Settings['matrix']>().toEqualTypeOf<number[][] | undefined>();
  });

  test('[T-ARRAY-UNIQUE] uniqueTags: string[]', () => {
    expectTypeOf<Settings['uniqueTags']>().toEqualTypeOf<string[] | undefined>();
  });

  test('[T-ADDPROPS-SCHEMA] counters: Record<string, number>', () => {
    expectTypeOf<NonNullable<Settings['counters']>>().toEqualTypeOf<Record<string, number>>();
    const ok: Settings['counters'] = { a: 1 };
    // @ts-expect-error Wert string nicht erlaubt
    const bad: Settings['counters'] = { a: 'x' };
    void [ok, bad];
  });

  test('[T-ADDPROPS-FALSE] strict ohne Index-Signatur', () => {
    const ok: Settings['strict'] = { a: 'x' };
    // @ts-expect-error excess property b
    const bad: Settings['strict'] = { a: 'x', b: 1 };
    void [ok, bad];
  });

  test('[T-ADDPROPS-TRUE] freeForm Record<string, unknown>', () => {
    type FreeForm = NonNullable<Settings['freeForm']>;
    expectTypeOf<FreeForm[string]>().not.toBeAny();
    expectTypeOf<FreeForm[string]>().toEqualTypeOf<unknown>();
  });

  test('[T-ADDPROPS-WITH-PROPS] mixed.known + weitere string-Keys', () => {
    type Mixed = NonNullable<Settings['mixed']>;
    expectTypeOf<Mixed['known']>().toEqualTypeOf<string>();
    // ng-openapi verwirft additionalProperties neben properties → extra-Key ist excess property.
    const withExtra: Mixed = { known: 'k', extra: 'e' };
    void withExtra;
  });

  test('[T-ALLOF-COMPOSE] PetPage = PageMeta & items', () => {
    expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
    // @ts-expect-error items fehlt
    const missingItems: PetPage = { total: 0, limit: 1, offset: 0 };
    void missingItems;
  });
});

describe('ng-openapi types: polymorphism', () => {
  test('[T-ONEOF-DISC] Shape narrowt über kind', () => {
    const describeShape = (shape: Shape): number => {
      switch (shape.kind) {
        case 'circle':
          // kind ist bei ng-openapi nur string → kein Narrowing, radius existiert nicht auf der Union.
          return shape.radius;
        case 'rect':
          // @ts-expect-error radius existiert im rect-Zweig nicht
          return shape.radius;
        default:
          return 0;
      }
    };
    void describeShape;
  });

  test('[T-ONEOF-DISC-MAPPING] Circle.kind ist literal circle', () => {
    expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
  });

  test('[T-ALLOF-DISC-INHERITANCE] listEvents narrowbar bzw. CreatedEvent.eventType literal', () => {
    type EventItem = ObservedValueOf<ReturnType<typeof listEventsBody>>[number];
    function listEventsBody() {
      return polymorphism.listEvents();
    }
    // Variante A: Element-Union narrowt auf created → petId
    type Narrowed = Extract<EventItem, { eventType: 'created' }>;
    type VariantA = [Narrowed] extends [never] ? false : Narrowed extends { petId: number } ? true : false;
    // Variante B: CreatedEvent hat alle BaseEvent-Felder und eventType ist literal 'created'
    type VariantB = string extends CreatedEvent['eventType'] ? false : CreatedEvent['eventType'] extends 'created' ? true : false;
    expectTypeOf<true extends VariantA | VariantB ? true : false>().toEqualTypeOf<true>();
  });

  test('[T-ONEOF-PLAIN] PaymentRequest.method Card | Sepa (über Operation pay)', () => {
    expectTypeOf<PaymentRequest['method']>().not.toBeAny();
    const card: PaymentRequest['method'] = { cardNumber: '1234123412341234', cvc: '123' };
    const sepa: PaymentRequest['method'] = { iban: 'DE00' };
    // @ts-expect-error {} ist weder Card noch Sepa
    const empty: PaymentRequest['method'] = {};
    // @ts-expect-error {foo:1} ist weder Card noch Sepa
    const foo: PaymentRequest['method'] = { foo: 1 };
    // Operation: pay() muss das Modell PaymentRequest akzeptieren. ng-openapi importiert PaymentRequest im Service nicht
    // → Parameter-Typ ist das globale DOM-PaymentRequest (Payment Request API) → Compile-Fehler.
    const body: PaymentRequest = { amount: 1, method: sepa };
    polymorphism.pay(body);
    void [card, empty, foo];
  });

  test('[T-ANYOF] note string | number, PaymentResult', () => {
    expectTypeOf<PaymentRequest['note']>().toEqualTypeOf<string | number | undefined>();
    const n: PaymentRequest['note'] = 'x';
    const m: PaymentRequest['note'] = 1;
    // @ts-expect-error boolean nicht erlaubt
    const b: PaymentRequest['note'] = true;
    // Nur Rückgabetyp prüfen (Parameter-Typ-Bug von pay() gehört zu T-ONEOF-PLAIN).
    const payBody = {} as Parameters<PolymorphismService['pay']>[0];
    expectTypeOf(polymorphism.pay(payBody)).toEqualTypeOf<Observable<PaymentResult>>();
    const ok: PaymentResult = { ok: true };
    const problem: PaymentResult = { type: 't', title: 'x', status: 400 };
    void [n, m, b, ok, problem];
  });

  test('[T-RECURSIVE] TreeNode.children', () => {
    expectTypeOf<TreeNode['children']>().toEqualTypeOf<TreeNode[] | undefined>();
    const tree = {} as TreeNode;
    expectTypeOf(tree.children![0]!.children![0]!.value).toEqualTypeOf<string>();
  });

  test('[T-CIRCULAR] TreeNode ↔ TreeParentRef, Category.parent', () => {
    const node = {} as TreeNode;
    expectTypeOf(node.parent?.node?.value).toEqualTypeOf<string | undefined>();
    const category = {} as Category;
    expectTypeOf(category.parent?.parent?.name).toEqualTypeOf<string | undefined>();
  });
});

describe('ng-openapi types: operations', () => {
  test('[T-INLINE-OBJECT] inlineSchemas Response/Request typisiert', () => {
    type InlineResponse = ObservedValueOf<ReturnType<typeof inlineCall>>;
    function inlineCall() {
      return bodies.inlineSchemas({ mode: 'fast' });
    }
    expectTypeOf<InlineResponse['accepted']>().not.toBeAny();
    expectTypeOf<InlineResponse['accepted']>().toEqualTypeOf<boolean>();
    expectTypeOf<InlineResponse['id']>().toEqualTypeOf<string>();
    type InlineRequest = Parameters<BodiesService['inlineSchemas']>[0];
    expectTypeOf<NonNullable<InlineRequest['nested']>['depth']>().toEqualTypeOf<number | undefined>();
  });

  test('[T-INLINE-ENUM] mode fast|slow', () => {
    bodies.inlineSchemas({ mode: 'fast' });
    bodies.inlineSchemas({ mode: 'slow' });
    // @ts-expect-error 'medium' ist kein gültiger mode
    bodies.inlineSchemas({ mode: 'medium' });
  });

  test('[T-PARAM-PATH-REQUIRED] getPet(petId: number)', () => {
    pets.getPet(1);
    // @ts-expect-error petId fehlt
    pets.getPet();
    // @ts-expect-error petId muss number sein
    pets.getPet('1');
  });

  test('[T-PARAM-PATH-TYPES] multiPathParams', () => {
    params.multiPathParams('abc', 42, '6f1c2a4e-0000-4000-8000-000000000000', 'sold');
    // @ts-expect-error intId muss number sein
    params.multiPathParams('abc', '42', '6f1c2a4e-0000-4000-8000-000000000000', 'sold');
    // @ts-expect-error enumId muss PetStatus sein
    params.multiPathParams('abc', 42, '6f1c2a4e-0000-4000-8000-000000000000', 'foo');
    type P = Parameters<ParamsService['multiPathParams']>;
    expectTypeOf<P[0]>().toEqualTypeOf<string>();
    expectTypeOf<P[1]>().toEqualTypeOf<number>();
    expectTypeOf<P[2]>().toEqualTypeOf<string>();
    expectTypeOf<P[3]>().toEqualTypeOf<PetStatus>();
  });

  test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
    pets.listPets();
    pets.listPets(10);
    // @ts-expect-error limit muss number sein
    pets.listPets('10');
  });

  test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required', () => {
    params.queryStyles('r');
    // @ts-expect-error required fehlt
    params.queryStyles();
  });

  test('[T-PARAM-QUERY-ENUM] sort asc|desc, status PetStatus', () => {
    params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'asc');
    // @ts-expect-error 'up' ist kein gültiger sort
    params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'up');
    pets.listPets(undefined, undefined, 'sold');
    // @ts-expect-error 'foo' ist kein PetStatus
    pets.listPets(undefined, undefined, 'foo');
  });

  test('[T-PARAM-QUERY-ARRAY] tagsExplode string[], tagsSpace number[], filter PetFilter', () => {
    type P = Parameters<ParamsService['queryStyles']>;
    expectTypeOf<P[1]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<P[4]>().toEqualTypeOf<number[] | undefined>();
    expectTypeOf<P[5]>().toEqualTypeOf<PetFilter | undefined>();
  });

  test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
    // ng-openapi generiert für headerAndCookieParams KEINE Parameter (Header-Parameter werden verworfen).
    // Positive Kontrolle (X-Request-Id übergeben) ist daher selbst ein Compile-Fehler.
    params.headerAndCookieParams('6f1c2a4e-0000-4000-8000-000000000000', undefined, 3);
    // @ts-expect-error X-Request-Id fehlt
    params.headerAndCookieParams();
  });

  test('[T-NAME-RESERVED-PARAM] reservedParamNames mit allen 4 Parametern', () => {
    params.reservedParamNames('x', 'd', 5, 'n');
    type P = Parameters<ParamsService['reservedParamNames']>;
    expectTypeOf<P[0]>().toEqualTypeOf<string>();
    expectTypeOf<P[2]>().toEqualTypeOf<number | undefined>();
  });

  test('[T-BODY-REQUIRED] createPet Body Pflicht und typisiert', () => {
    pets.createPet(fullPet);
    // @ts-expect-error Body fehlt
    pets.createPet();
    // @ts-expect-error name muss string sein
    pets.createPet({ id: 1, name: 123, status: 'sold', photoUrls: [] });
  });

  test('[T-BODY-OPTIONAL] optionalBody', () => {
    bodies.optionalBody();
    bodies.optionalBody({ name: 't' });
  });

  test('[T-PARTIAL-BODY] patchPet merge-patch', () => {
    // ng-openapi erkennt application/merge-patch+json nicht als Body → patchPet(petId) hat keinen Body-Parameter.
    pets.patchPet(1, { nickname: null });
    // @ts-expect-error status 'x' ungültig
    pets.patchPet(1, { status: 'x' });
  });

  test('[T-BODY-FORM] submitForm', () => {
    bodies.submitForm('u', 'p', true);
    // @ts-expect-error password fehlt
    bodies.submitForm('u');
    // @ts-expect-error remember muss boolean sein
    bodies.submitForm('u', 'p', 'yes');
    type P = Parameters<BodiesService['submitForm']>;
    expectTypeOf<P[0]>().toEqualTypeOf<string>();
    expectTypeOf<P[1]>().toEqualTypeOf<string>();
    expectTypeOf<P[2]>().toEqualTypeOf<boolean | undefined>();
  });

  test('[T-BODY-MULTIPART] uploadFiles', () => {
    bodies.uploadFiles('t', blob, [blob, blob]);
    // @ts-expect-error file muss Blob sein
    bodies.uploadFiles('t', 'string');
    type P = Parameters<BodiesService['uploadFiles']>;
    expectTypeOf<P[0]>().toEqualTypeOf<string>();
    expectTypeOf<P[1]>().toEqualTypeOf<Blob>();
    expectTypeOf<P[2]>().toEqualTypeOf<Blob[] | undefined>();
  });

  test('[T-BODY-OCTET] uploadBinary(Blob)', () => {
    // ng-openapi verwirft octet-stream-Bodies → uploadBinary hat keinen Body-Parameter.
    bodies.uploadBinary(blob);
    // @ts-expect-error {} ist kein Blob
    bodies.uploadBinary({});
  });

  test('[T-RESP-200] getPet → Observable<Pet>, listPets → Observable<PetPage>', () => {
    expectTypeOf(pets.getPet(1)).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf(pets.listPets()).toEqualTypeOf<Observable<PetPage>>();
  });

  test('[T-RESP-204] deletePet → leeres Ergebnis, nicht any', () => {
    expectTypeOf<ObservedValueOf<ReturnType<typeof deleteCall>>>().not.toBeAny();
    function deleteCall() {
      return pets.deletePet(1);
    }
  });

  test('[T-RESP-MULTI-2XX] multiStatus → Pet | Job', () => {
    expectTypeOf(responses.multiStatus()).toEqualTypeOf<Observable<Pet | Job>>();
  });

  test('[T-RESP-BINARY] downloadFile → Blob', () => {
    expectTypeOf(responses.downloadFile()).toEqualTypeOf<Observable<Blob>>();
  });

  test('[T-RESP-TEXT] postText → string', () => {
    expectTypeOf(bodies.postText()).toEqualTypeOf<Observable<string>>();
  });

  test('[T-RESP-PRIMITIVE-ARRAY] getPrimitiveArray → number[]', () => {
    expectTypeOf(responses.getPrimitiveArray()).toEqualTypeOf<Observable<number[]>>();
  });

  test('[T-RESP-MAP] getInventory → Record<string, number>', () => {
    expectTypeOf(responses.getInventory()).toEqualTypeOf<Observable<Record<string, number>>>();
  });

  test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF → Blob', () => {
    // JSON-Variante: ng-openapi importiert Report im Service nicht → Rückgabetyp ist das globale DOM-Report.
    expectTypeOf(responses.reportByAccept()).toEqualTypeOf<Observable<Report>>();
    // PDF-Variante: keine Auswahl möglich (RequestOptions<'json'>).
    expectTypeOf(responses.reportByAccept('body', { responseType: 'blob' })).toEqualTypeOf<Observable<Blob>>();
  });

  // Audit: expect sagt explizit "Nur generisches HttpErrorResponse.error:any = fail" → fail statt unsupported.
  test('[T-ERROR-MODEL] typisierter Fehler-Body (kein operationsgebundener Fehler-Typ, nur HttpErrorResponse.error: any)', () => {
    expectTypeOf<HttpErrorResponse['error']>().toEqualTypeOf<Problem>();
  });
});

describe('ng-openapi types: naming', () => {
  test('[T-NAME-SPECIAL-PROPS] exakte Property-Namen', () => {
    expectTypeOf<WeirdNames>().toHaveProperty('x-request-id');
    expectTypeOf<WeirdNames>().toHaveProperty('@type');
    expectTypeOf<WeirdNames>().toHaveProperty('$ref');
    expectTypeOf<WeirdNames>().toHaveProperty('1stPlace');
    expectTypeOf<WeirdNames>().toHaveProperty('with space');
    expectTypeOf<WeirdNames>().toHaveProperty('snake_case_prop');
    expectTypeOf<WeirdNames['x-request-id']>().toEqualTypeOf<string>();
    expectTypeOf<WeirdNames['@type']>().toEqualTypeOf<string>();
  });

  test('[T-NAME-RESERVED-PROPS] class/default/delete/constructor', () => {
    expectTypeOf<WeirdNames['class']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['default']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WeirdNames['delete']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<WeirdNames['constructor']>().toEqualTypeOf<string | undefined>();
  });

  test('[T-NAME-SCHEMA-COLLISION] birthday/raw sind Schema-Typen, nicht global Date/Object', () => {
    expectTypeOf<NonNullable<UserProfile['birthday']>>().toEqualTypeOf<{ value?: string }>();
    expectTypeOf<NonNullable<UserProfile['raw']>>().toEqualTypeOf<{ value?: string }>();
    expectTypeOf<NonNullable<UserProfile['birthday']>>().not.toHaveProperty('getTime');
  });

  test('[T-NAME-SCHEMA-SANITIZE] UserProfile existiert', () => {
    expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NonNullable<KitchenSink['profile']>>().toEqualTypeOf<UserProfile>();
  });

  test('[T-NAME-OPERATION-ID-SANITIZE] get-kebab_snake.op aufrufbar', () => {
    naming.getKebabSnakeOp();
  });

  test('[T-NO-OPERATION-ID] Operation ohne operationId → Tag', () => {
    expectTypeOf(naming.namingNoOperationIdGet()).toEqualTypeOf<Observable<Tag>>();
  });

  test('[T-UNTAGGED-OP] untaggedOperation aufrufbar', () => {
    defaults.untaggedOperation();
  });

  test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
    expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
  });
});
