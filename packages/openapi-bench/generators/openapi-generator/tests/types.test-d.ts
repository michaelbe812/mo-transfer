import { expectTypeOf, test } from 'vitest';
import type { Observable, ObservedValueOf } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';
import type { Problem } from '../client/model/problem';
import type { PetsService, CreatePetRequestParams } from '../client/api/pets.service';
import type { ParamsService, MultiPathParamsRequestParams, QueryStylesRequestParams, HeaderAndCookieParamsRequestParams } from '../client/api/params.service';
import type { BodiesService, SubmitFormRequestParams, UploadFilesRequestParams } from '../client/api/bodies.service';
import type { ResponsesService } from '../client/api/responses.service';
import type { NamingService } from '../client/api/naming.service';
import type { DefaultService } from '../client/api/default.service';
import type { Pet } from '../client/model/pet';
import type { Tag } from '../client/model/tag';
import type { Primitives } from '../client/model/primitives';
import type { DateHolder } from '../client/model/date-holder';
import type { PetPage } from '../client/model/pet-page';
import type { PetFilter } from '../client/model/pet-filter';
import type { PetStatus } from '../client/model/pet-status';
import { Priority } from '../client/model/priority';
import type { WeirdEnum } from '../client/model/weird-enum';
import type { Settings } from '../client/model/settings';
import type { BaseEvent } from '../client/model/base-event';
import type { Circle } from '../client/model/circle';
import type { CardPayment } from '../client/model/card-payment';
import type { SepaPayment } from '../client/model/sepa-payment';
import type { PaymentRequest } from '../client/model/payment-request';
import type { TreeNode } from '../client/model/tree-node';
import type { Category } from '../client/model/category';
import type { Job } from '../client/model/job';
import type { Report } from '../client/model/report';
import type { WeirdNames } from '../client/model/weird-names';
import type { UserProfile } from '../client/model/user-profile';
import type { UnreferencedModel } from '../client/model/unreferenced-model';
import type { InlineSchemasRequest } from '../client/model/inline-schemas-request';

declare const pets: PetsService;
declare const params: ParamsService;
declare const bodies: BodiesService;
declare const responses: ResponsesService;
declare const naming: NamingService;
declare const defaults: DefaultService;
declare const blob: Blob;

/** Vollständiges Response-Pet (id Pflicht wegen readOnly+required). */
const fullPet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] };

// ------------------------------------------------------------------ Modelle: Primitive & Formate
test('[T-PRIM-STRING] string → string', () => {
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
test('[T-FORMAT-DATE] date-time → string (passt zu R-RESP-DATE-CONSISTENT)', () => {
  expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
  expectTypeOf<DateHolder['date']>().toEqualTypeOf<string>();
});

// ------------------------------------------------------------------ Enums
test('[T-ENUM-STRING] PetStatus geschlossen', () => {
  const a: Pet['status'] = 'available';
  const p: Pet['status'] = 'pending';
  const s: Pet['status'] = 'sold';
  // @ts-expect-error ungültiger Literal
  const bad: Pet['status'] = 'foo';
  void [a, p, s, bad];
});
test('[T-ENUM-INT] Priority 1|2|3', () => {
  const ok: Priority = 3;
  // @ts-expect-error 4 ist kein Enum-Wert
  const bad: Priority = 4;
  expectTypeOf<Priority>().toEqualTypeOf<1 | 2 | 3>();
  void [ok, bad];
});
test('[T-ENUM-VARNAMES] Priority.LOW/MEDIUM/HIGH', () => {
  expectTypeOf(Priority.LOW).toEqualTypeOf<1>();
  expectTypeOf(Priority.MEDIUM).toEqualTypeOf<2>();
  expectTypeOf(Priority.HIGH).toEqualTypeOf<3>();
});
test('[T-ENUM-NULLABLE] color nullable enum', () => {
  const n: Pet['color'] = null;
  const r: Pet['color'] = 'red';
  // @ts-expect-error 'pink' ist kein Wert
  const bad: Pet['color'] = 'pink';
  void [n, r, bad];
});
test('[T-ENUM-SPECIAL-VALUES] WeirdEnum exakte Union', () => {
  expectTypeOf<WeirdEnum>().toEqualTypeOf<'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''>();
});

// ------------------------------------------------------------------ required / optional / nullable / readOnly
test('[T-REQUIRED] name/status/photoUrls Pflicht', () => {
  expectTypeOf<Pet['name']>().toEqualTypeOf<string>();
  expectTypeOf<Pet['status']>().toEqualTypeOf<PetStatus>();
  expectTypeOf<Pet['photoUrls']>().toEqualTypeOf<string[]>();
  const ok: Pet = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
  // @ts-expect-error name fehlt
  const bad: Pet = { id: 1, status: 'sold', photoUrls: [] };
  void [ok, bad];
});
test('[T-OPTIONAL] tags optional', () => {
  const ok: Pet = { id: 1, name: 'a', status: 'sold', photoUrls: [] };
  expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
  void ok;
});
test('[T-NULLABLE] nickname nullable, name nicht', () => {
  const n: Pet['nickname'] = null;
  const s: Pet['nickname'] = 'x';
  // @ts-expect-error name ist nicht nullable
  const bad: Pet['name'] = null;
  void [n, s, bad];
});
test('[T-READONLY] createPet ohne id/createdAt', () => {
  // readOnly-Felder dürfen im Request fehlen
  pets.createPet({ pet: { name: 'x', status: 'sold', photoUrls: [] } });
});
test('[T-WRITEONLY] getPet-Response ohne secretChipCode', () => {
  expectTypeOf(pets.getPet({ petId: 1 })).toEqualTypeOf<Observable<Pet>>();
  expectTypeOf<Pet>().not.toHaveProperty('secretChipCode');
});
test('[T-DEFAULTS] vaccinated optional boolean im Request', () => {
  expectTypeOf<Pick<CreatePetRequestParams['pet'], 'vaccinated'>>().toEqualTypeOf<{ vaccinated?: boolean }>();
});

// ------------------------------------------------------------------ Arrays / Maps
test('[T-ARRAY-REF] tags: Array<Tag>', () => {
  expectTypeOf<NonNullable<Pet['tags']>>().toEqualTypeOf<Tag[]>();
  expectTypeOf<NonNullable<Pet['tags']>[number]['name']>().toEqualTypeOf<string>();
});
test('[T-ARRAY-NESTED] matrix number[][]', () => {
  expectTypeOf<Settings['matrix']>().toEqualTypeOf<number[][] | undefined>();
});
test('[T-ARRAY-UNIQUE] uniqueTags string[] (Set nur bei Runtime-Set)', () => {
  // Client konvertiert zur Laufzeit nicht in ein Set (JSON.parse liefert Array) → muss string[] sein
  expectTypeOf<Settings['uniqueTags']>().toEqualTypeOf<string[] | undefined>();
});
test('[T-ADDPROPS-SCHEMA] counters Record<string, number>', () => {
  expectTypeOf<NonNullable<Settings['counters']>>().toEqualTypeOf<{ [k: string]: number }>();
  expectTypeOf(responses.getInventory()).toEqualTypeOf<Observable<{ [k: string]: number }>>();
  const ok: Settings['counters'] = { a: 1 };
  // @ts-expect-error Wert string
  const bad: Settings['counters'] = { a: 'x' };
  void [ok, bad];
});
test('[T-ADDPROPS-FALSE] strict ohne Index-Signatur', () => {
  const ok: Settings['strict'] = { a: 'x' };
  // @ts-expect-error excess property b
  const bad: Settings['strict'] = { a: 'x', b: 1 };
  void [ok, bad];
});
test('[T-ADDPROPS-TRUE] freeForm-Werte unknown (nicht any)', () => {
  expectTypeOf<NonNullable<Settings['freeForm']>[string]>().toEqualTypeOf<unknown>();
});
test('[T-ADDPROPS-WITH-PROPS] mixed.known + weitere Keys', () => {
  expectTypeOf<NonNullable<Settings['mixed']>['known']>().toEqualTypeOf<string>();
  const ok: Settings['mixed'] = { known: 'k', extra: 'e' };
  // @ts-expect-error known fehlt
  const bad: Settings['mixed'] = { extra: 'e' };
  void [ok, bad];
});

// ------------------------------------------------------------------ Polymorphie
test('[T-ALLOF-COMPOSE] PetPage', () => {
  expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
  expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
  // @ts-expect-error items fehlt
  const bad: PetPage = { total: 0, limit: 1, offset: 0 };
  const ok: PetPage = { total: 0, limit: 1, offset: 0, items: [] };
  void [bad, ok];
});
/**
 * WICHTIG: client/model/shape.ts ist syntaktisch kaputt (`export type Shape = ;`, TS1110). Ein Import davon
 * (direkt oder über polymorphism.service.ts / index.ts) lässt tsc NUR noch Syntaxfehler melden und unterdrückt
 * alle semantischen Fehler im Programm → sämtliche Typ-Tests würden fälschlich grün. Daher wird Shape hier
 * nicht importiert; der Case schlägt dokumentiert fehl (es gibt keinen nutzbaren Shape-Typ).
 */
test('[T-ONEOF-DISC] Shape narrowt über kind', () => {
  type ShapeFileState = 'syntax-error: export type Shape = ;';
  expectTypeOf<ShapeFileState>().toEqualTypeOf<'valid discriminated union Circle | Rectangle | Triangle'>();
});
test('[T-ONEOF-DISC-MAPPING] Circle.kind = "circle"', () => {
  expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
  // @ts-expect-error kind 'rect' auf Circle
  const bad: Circle = { kind: 'rect', radius: 1 };
  void bad;
});
// listEvents() liefert laut polymorphism.service.ts Observable<Array<BaseEvent>>; der Service kann wegen shape.ts
// nicht importiert werden (s. o.), daher direkt über den Response-Typ BaseEvent.
test('[T-ALLOF-DISC-INHERITANCE] listEvents narrowt auf CreatedEvent', () => {
  const e = {} as BaseEvent;
  if (e.eventType === 'created') {
    expectTypeOf(e.petId).toEqualTypeOf<number>();
  }
  // @ts-expect-error petId nur auf CreatedEvent
  void e.petId;
});
test('[T-ONEOF-PLAIN] method: CardPayment | SepaPayment', () => {
  expectTypeOf<PaymentRequest['method']>().not.toBeAny();
  const card: CardPayment = { cardNumber: '1234123412341234', cvc: '123' };
  const sepa: SepaPayment = { iban: 'DE00' };
  const a: PaymentRequest['method'] = card;
  const b: PaymentRequest['method'] = sepa;
  // @ts-expect-error leeres Objekt
  const c: PaymentRequest['method'] = {};
  // @ts-expect-error fremdes Objekt
  const d: PaymentRequest['method'] = { foo: 1 };
  void [a, b, c, d];
});
test('[T-ANYOF] note: string | number', () => {
  expectTypeOf<PaymentRequest['note']>().toEqualTypeOf<string | number | undefined>();
  const s: PaymentRequest['note'] = 'x';
  const n: PaymentRequest['note'] = 1;
  // @ts-expect-error boolean
  const bad: PaymentRequest['note'] = true;
  void [s, n, bad];
});
test('[T-RECURSIVE] TreeNode.children', () => {
  expectTypeOf<NonNullable<TreeNode['children']>>().toEqualTypeOf<TreeNode[]>();
  const t = {} as TreeNode;
  expectTypeOf(t.children![0].children![0].value).toEqualTypeOf<string>();
});
test('[T-CIRCULAR] TreeNode ↔ TreeParentRef, Category.parent', () => {
  const t = {} as TreeNode;
  expectTypeOf(t.parent?.node?.value).toEqualTypeOf<string | undefined>();
  const c = {} as Category;
  expectTypeOf(c.parent?.parent?.name).toEqualTypeOf<string | undefined>();
});
test('[T-INLINE-OBJECT] inlineSchemas typisiert', () => {
  bodies.inlineSchemas({ inlineSchemasRequest: { mode: 'fast' } }).subscribe((r) => {
    expectTypeOf(r.accepted).toEqualTypeOf<boolean>();
    expectTypeOf(r.id).toEqualTypeOf<string>();
  });
  expectTypeOf<NonNullable<InlineSchemasRequest['nested']>['depth']>().toEqualTypeOf<number | undefined>();
});
test('[T-INLINE-ENUM] mode fast|slow', () => {
  const ok: InlineSchemasRequest['mode'] = 'slow';
  // @ts-expect-error 'medium'
  const bad: InlineSchemasRequest['mode'] = 'medium';
  void [ok, bad];
});

// ------------------------------------------------------------------ Operationen: Parameter
test('[T-PARAM-PATH-REQUIRED] getPet(petId: number)', () => {
  pets.getPet({ petId: 1 });
  // @ts-expect-error petId fehlt
  pets.getPet({});
  // @ts-expect-error petId string
  pets.getPet({ petId: '1' });
});
test('[T-PARAM-PATH-TYPES] multiPathParams', () => {
  expectTypeOf<MultiPathParamsRequestParams['intId']>().toEqualTypeOf<number>();
  expectTypeOf<MultiPathParamsRequestParams['enumId']>().toEqualTypeOf<PetStatus>();
  expectTypeOf<MultiPathParamsRequestParams['stringId']>().toEqualTypeOf<string>();
  expectTypeOf<MultiPathParamsRequestParams['uuidId']>().toEqualTypeOf<string>();
  params.multiPathParams({ stringId: 'a', intId: 1, uuidId: 'u', enumId: 'sold' });
  // @ts-expect-error ungültiger enumId
  params.multiPathParams({ stringId: 'a', intId: 1, uuidId: 'u', enumId: 'nope' });
});
test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
  pets.listPets();
  pets.listPets({ limit: 10 });
  expectTypeOf<NonNullable<Parameters<typeof pets.listPets>[0]>['limit']>().toEqualTypeOf<number | undefined>();
});
test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required', () => {
  params.queryStyles({ required: 'x' });
  // @ts-expect-error required fehlt
  params.queryStyles({});
});
test('[T-PARAM-QUERY-ENUM] sort asc|desc', () => {
  params.queryStyles({ required: 'x', sort: 'asc' });
  // @ts-expect-error 'up'
  params.queryStyles({ required: 'x', sort: 'up' });
  pets.listPets({ status: 'sold' });
  // @ts-expect-error ungültiger Status
  pets.listPets({ status: 'foo' });
});
test('[T-PARAM-QUERY-ARRAY] Array-/deepObject-Typen', () => {
  expectTypeOf<QueryStylesRequestParams['tagsExplode']>().toEqualTypeOf<string[] | undefined>();
  expectTypeOf<QueryStylesRequestParams['tagsSpace']>().toEqualTypeOf<number[] | undefined>();
  expectTypeOf<QueryStylesRequestParams['filter']>().toEqualTypeOf<PetFilter | undefined>();
});
test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
  params.headerAndCookieParams({ xRequestId: 'id' });
  // @ts-expect-error xRequestId fehlt
  params.headerAndCookieParams({ xRetryCount: 3 });
  expectTypeOf<HeaderAndCookieParamsRequestParams['xRetryCount']>().toEqualTypeOf<number | undefined>();
});
test('[T-NAME-RESERVED-PARAM] reservedParamNames mit 4 Parametern', () => {
  params.reservedParamNames({ _class: 'x', _default: 'd', pageSize: 5, filterName: 'n' });
});

// ------------------------------------------------------------------ Operationen: Bodies
test('[T-BODY-REQUIRED] createPet Body Pflicht + typisiert', () => {
  pets.createPet({ pet: fullPet });
  // @ts-expect-error Body fehlt
  pets.createPet({});
  // @ts-expect-error name: number
  pets.createPet({ pet: { ...fullPet, name: 123 } });
});
test('[T-BODY-OPTIONAL] optionalBody', () => {
  bodies.optionalBody();
  bodies.optionalBody({ tag: { name: 't' } });
});
test('[T-PARTIAL-BODY] patchPet', () => {
  pets.patchPet({ petId: 1, petPatch: { nickname: null } });
  // @ts-expect-error status 'x'
  pets.patchPet({ petId: 1, petPatch: { status: 'x' } });
});
test('[T-BODY-FORM] submitForm', () => {
  expectTypeOf<SubmitFormRequestParams['username']>().toEqualTypeOf<string>();
  expectTypeOf<SubmitFormRequestParams['password']>().toEqualTypeOf<string>();
  expectTypeOf<SubmitFormRequestParams['remember']>().toEqualTypeOf<boolean | undefined>();
  // @ts-expect-error password fehlt
  bodies.submitForm({ username: 'u' });
});
test('[T-BODY-MULTIPART] uploadFiles', () => {
  expectTypeOf<UploadFilesRequestParams['file']>().toEqualTypeOf<Blob>();
  expectTypeOf<UploadFilesRequestParams['title']>().toEqualTypeOf<string>();
  expectTypeOf<UploadFilesRequestParams['attachments']>().toEqualTypeOf<Blob[] | undefined>();
  bodies.uploadFiles({ title: 't', file: blob });
  // @ts-expect-error file: string
  bodies.uploadFiles({ title: 't', file: 'string' });
});
test('[T-BODY-OCTET] uploadBinary(Blob)', () => {
  bodies.uploadBinary({ body: blob });
  // @ts-expect-error Objekt statt Blob
  bodies.uploadBinary({ body: {} });
});

// ------------------------------------------------------------------ Operationen: Responses
test('[T-RESP-200] getPet → Pet, listPets → PetPage', () => {
  expectTypeOf(pets.getPet({ petId: 1 })).toEqualTypeOf<Observable<Pet>>();
  expectTypeOf(pets.listPets()).toEqualTypeOf<Observable<PetPage>>();
});
test('[T-RESP-204] deletePet nicht any', () => {
  type Body<T> = T extends Observable<infer B> ? B : never;
  expectTypeOf<Body<ReturnType<() => ReturnType<typeof pets.deletePet>>>>().not.toBeAny();
  const result = pets.deletePet({ petId: 1 });
  expectTypeOf<ObservedValueOf<typeof result>>().not.toBeAny();
});
test('[T-RESP-MULTI-2XX] multiStatus → Pet | Job', () => {
  expectTypeOf(responses.multiStatus()).toEqualTypeOf<Observable<Pet | Job>>();
});
test('[T-RESP-BINARY] downloadFile → Blob', () => {
  expectTypeOf(responses.downloadFile()).toEqualTypeOf<Observable<Blob>>();
});
test('[T-RESP-TEXT] postText → string', () => {
  expectTypeOf(bodies.postText({ body: 'x' })).toEqualTypeOf<Observable<string>>();
});
test('[T-RESP-PRIMITIVE-ARRAY] getPrimitiveArray → number[]', () => {
  expectTypeOf(responses.getPrimitiveArray()).toEqualTypeOf<Observable<number[]>>();
});
test('[T-RESP-MAP] getInventory → Record<string, number>', () => {
  expectTypeOf(responses.getInventory()).toEqualTypeOf<Observable<Record<string, number>>>();
});
test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF → Blob', () => {
  expectTypeOf(responses.reportByAccept('body', false, { httpHeaderAccept: 'application/json' })).toEqualTypeOf<Observable<Report>>();
  expectTypeOf(responses.reportByAccept('body', false, { httpHeaderAccept: 'application/pdf' })).toEqualTypeOf<Observable<Blob>>();
});
// Audit: expect sagt explizit "Nur generisches HttpErrorResponse.error:any = fail" → fail statt unsupported.
test('[T-ERROR-MODEL] typisierter Fehler-Body pro Operation (kein operationsgebundener Fehlertyp; nur HttpErrorResponse.error: any)', () => {
  expectTypeOf<HttpErrorResponse['error']>().toEqualTypeOf<Problem>();
});

// ------------------------------------------------------------------ Namen & Sonderfälle
test('[T-NAME-SPECIAL-PROPS] Original-Property-Namen', () => {
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
  expectTypeOf<Pick<WeirdNames, 'constructor'>>().toEqualTypeOf<{ constructor?: string }>();
});
test('[T-NAME-SCHEMA-COLLISION] birthday/raw sind Schema-Typen', () => {
  expectTypeOf<NonNullable<UserProfile['birthday']>>().toEqualTypeOf<{ value?: string }>();
  expectTypeOf<NonNullable<UserProfile['birthday']>>().not.toEqualTypeOf<Date>();
  expectTypeOf<NonNullable<UserProfile['raw']>>().toEqualTypeOf<{ value?: string }>();
});
test('[T-NAME-SCHEMA-SANITIZE] UserProfile', () => {
  expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
});
test('[T-NAME-OPERATION-ID-SANITIZE] get-kebab_snake.op aufrufbar', () => {
  expectTypeOf(naming.getKebabSnakeOp).toBeFunction();
  naming.getKebabSnakeOp();
});
test('[T-NO-OPERATION-ID] namingNoOperationIdGet → Tag', () => {
  expectTypeOf(naming.namingNoOperationIdGet()).toEqualTypeOf<Observable<Tag>>();
});
test('[T-UNTAGGED-OP] untaggedOperation aufrufbar', () => {
  expectTypeOf(defaults.untaggedOperation).toBeFunction();
  defaults.untaggedOperation();
});
test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
  expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
});
