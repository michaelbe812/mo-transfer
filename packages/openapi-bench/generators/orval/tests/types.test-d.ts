import { describe, expectTypeOf, test } from 'vitest';
import type { HttpErrorResponse, HttpResourceRef } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type {
  BaseEvent,
  CardPayment,
  Category,
  Circle,
  CreatedEvent,
  DateHolder,
  Echo,
  InlineSchemasBody,
  Job,
  KitchenSink,
  PaymentRequest,
  Pet,
  PetFilter,
  PetPage,
  PetPatch,
  Primitives,
  Problem,
  Report,
  SepaPayment,
  Settings,
  Shape,
  SubmitFormBody,
  Tag,
  TreeNode,
  UnreferencedModel,
  UploadFilesBody,
  UserProfile,
  WeirdEnum,
  WeirdNames,
} from '../client/model';
import { Priority } from '../client/model';
import type { BodiesService } from '../client/bodies/bodies.service';
import type { DefaultService } from '../client/default/default.service';
import type { NamingService } from '../client/naming/naming.service';
import type { ParamsService } from '../client/params/params.service';
import type { PetsService } from '../client/pets/pets.service';
import type { PolymorphismService } from '../client/polymorphism/polymorphism.service';
import type { ResponsesService } from '../client/responses/responses.service';
import type { getPetResource } from '../client/pets/pets.resource';

// Nur für Typprüfung (vitest typecheck, kein Runtime).
declare const pets: PetsService;
declare const params: ParamsService;
declare const bodies: BodiesService;
declare const responses: ResponsesService;
declare const poly: PolymorphismService;
declare const naming: NamingService;
declare const untagged: DefaultService;
declare const blob: Blob;

const validPet = { id: 1, name: 'Bello', status: 'available', photoUrls: [] } satisfies Pet;
const newPet = { name: 'Bello', status: 'available' as const, photoUrls: [] };

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
  test('[T-FORMAT-DATE] date-time ist string (passt zu Runtime ohne Transformer)', () => {
    expectTypeOf<DateHolder['dateTime']>().toEqualTypeOf<string>();
    expectTypeOf<DateHolder['date']>().toEqualTypeOf<string>();
    expectTypeOf<DateHolder['nullableDateTime']>().toEqualTypeOf<string | null | undefined>();
  });

  test('[T-ENUM-STRING] Pet.status Literal-Union', () => {
    const ok: Pet['status'][] = ['available', 'pending', 'sold'];
    expectTypeOf(ok).toEqualTypeOf<Pet['status'][]>();
    expectTypeOf<Pet['status']>().toEqualTypeOf<'available' | 'pending' | 'sold'>();
    const control: Pet['status'] = 'sold';
    expectTypeOf(control).toBeString();
    // @ts-expect-error ungültiger Enum-Wert
    const bad: Pet['status'] = 'foo';
    void bad;
  });
  test('[T-ENUM-INT] Priority 1|2|3', () => {
    expectTypeOf<Priority>().toEqualTypeOf<1 | 2 | 3>();
    const control: Priority = 3;
    expectTypeOf(control).toBeNumber();
    // @ts-expect-error 4 ist kein Priority-Wert
    const bad: Priority = 4;
    void bad;
  });
  test('[T-ENUM-VARNAMES] Priority.LOW/MEDIUM/HIGH', () => {
    expectTypeOf(Priority.LOW).toEqualTypeOf<1>();
    expectTypeOf(Priority.MEDIUM).toEqualTypeOf<2>();
    expectTypeOf(Priority.HIGH).toEqualTypeOf<3>();
  });
  test('[T-ENUM-NULLABLE] Pet.color null | red, nicht pink', () => {
    expectTypeOf<null>().toExtend<Pet['color']>();
    const control: Pet['color'] = 'red';
    void control;
    // @ts-expect-error pink ist kein Farbwert
    const bad: Pet['color'] = 'pink';
    void bad;
  });
  test('[T-ENUM-SPECIAL-VALUES] WeirdEnum exakt', () => {
    expectTypeOf<WeirdEnum>().toEqualTypeOf<
      'with space' | 'kebab-case' | '1starts-with-digit' | 'UPPER' | 'lower' | ''
    >();
  });

  test('[T-REQUIRED] name/status/photoUrls Pflicht', () => {
    expectTypeOf<Pet['name']>().toEqualTypeOf<string>();
    expectTypeOf<Pet>().toHaveProperty('photoUrls').toEqualTypeOf<string[]>();
    const control: Pet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
    expectTypeOf(control).toEqualTypeOf<Pet>();
    // @ts-expect-error name fehlt
    const bad: Pet = { id: 1, status: 'sold', photoUrls: [] };
    void bad;
  });
  test('[T-OPTIONAL] Pet.tags optional', () => {
    const p: Pet = { id: 1, name: 'x', status: 'sold', photoUrls: [] };
    expectTypeOf(p).toEqualTypeOf<Pet>();
    expectTypeOf<Pet['tags']>().toEqualTypeOf<Tag[] | undefined>();
  });
  test('[T-NULLABLE] nickname null erlaubt, name nicht', () => {
    expectTypeOf<null>().toExtend<Pet['nickname']>();
    expectTypeOf<string>().toExtend<Pet['nickname']>();
    expectTypeOf<null>().not.toExtend<Pet['name']>();
  });
  test('[T-READONLY] createPet ohne id/createdAt', () => {
    expectTypeOf(pets.createPet(newPet)).toEqualTypeOf<Observable<Pet>>();
  });
  test('[T-WRITEONLY] getPet-Response ohne secretChipCode', () => {
    expectTypeOf(pets.getPet(1)).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf<'secretChipCode' extends keyof Pet ? true : false>().toEqualTypeOf<false>();
  });
  test('[T-DEFAULTS] vaccinated optional boolean im Request', () => {
    expectTypeOf(pets.createPet({ ...newPet })).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf<Parameters<PetsService['createPet']>[0]['vaccinated']>().toEqualTypeOf<boolean | undefined>();
  });
  test('[T-ARRAY-REF] tags Array<Tag>', () => {
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
    const control: Settings['counters'] = { a: 1 };
    expectTypeOf(control).toEqualTypeOf<{ [key: string]: number }>();
    // @ts-expect-error string-Wert
    const bad: Settings['counters'] = { a: 'x' };
    void bad;
  });
  test('[T-ADDPROPS-FALSE] strict ohne Index-Signatur', () => {
    const control: Settings['strict'] = { a: 'x' };
    expectTypeOf(control).toEqualTypeOf<Settings['strict']>();
    // @ts-expect-error excess property b
    const bad: Settings['strict'] = { a: 'x', b: 1 };
    void bad;
  });
  test('[T-ADDPROPS-TRUE] freeForm Record<string, unknown>', () => {
    expectTypeOf<NonNullable<Settings['freeForm']>>().toEqualTypeOf<{ [key: string]: unknown }>();
  });
  test('[T-ADDPROPS-WITH-PROPS] mixed.known + weitere string-Keys', () => {
    expectTypeOf<NonNullable<Settings['mixed']>['known']>().toEqualTypeOf<string>();
    const m: NonNullable<Settings['mixed']> = { known: 'k', extra: 'e' };
    expectTypeOf(m.known).toEqualTypeOf<string>();
  });

  test('[T-ALLOF-COMPOSE] PetPage', () => {
    expectTypeOf<PetPage['total']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['limit']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['offset']>().toEqualTypeOf<number>();
    expectTypeOf<PetPage['items']>().toEqualTypeOf<Pet[]>();
    // @ts-expect-error items fehlt
    const bad: PetPage = { total: 0, limit: 1, offset: 0 };
    void bad;
  });
  test('[T-ONEOF-DISC] Shape narrowt über kind', () => {
    const area = (s: Shape): number => {
      switch (s.kind) {
        case 'circle':
          return s.radius;
        case 'rect':
          // @ts-expect-error radius existiert nicht auf Rectangle
          return s.radius;
        default:
          return 0;
      }
    };
    expectTypeOf(area).returns.toBeNumber();
  });
  test('[T-ONEOF-DISC-MAPPING] Circle.kind ist circle', () => {
    expectTypeOf<Circle['kind']>().toEqualTypeOf<'circle'>();
    const control: Circle = { kind: 'circle', radius: 1 };
    expectTypeOf(control).toEqualTypeOf<Circle>();
    // @ts-expect-error kind rect für Circle
    const bad: Circle = { kind: 'rect', radius: 1 };
    void bad;
  });
  test('[T-ALLOF-DISC-INHERITANCE] CreatedEvent erbt BaseEvent, eventType literal', () => {
    expectTypeOf(poly.listEvents()).toEqualTypeOf<Observable<BaseEvent[]>>();
    expectTypeOf<CreatedEvent['eventType']>().toEqualTypeOf<'created'>();
    expectTypeOf<CreatedEvent['occurredAt']>().toEqualTypeOf<string>();
    expectTypeOf<CreatedEvent['petId']>().toEqualTypeOf<number>();
  });
  test('[T-ONEOF-PLAIN] method Card | Sepa', () => {
    expectTypeOf<PaymentRequest['method']>().toEqualTypeOf<CardPayment | SepaPayment>();
    const control: PaymentRequest = { amount: 1, method: { iban: 'DE' } };
    expectTypeOf(control).toEqualTypeOf<PaymentRequest>();
    // @ts-expect-error leeres Objekt ist keine Zahlungsart
    const bad1: PaymentRequest = { amount: 1, method: {} };
    // @ts-expect-error foo ist keine Zahlungsart
    const bad2: PaymentRequest = { amount: 1, method: { foo: 1 } };
    void bad1;
  });
  test('[T-ANYOF] note string | number', () => {
    expectTypeOf<PaymentRequest['note']>().toEqualTypeOf<string | number | undefined>();
    const control: PaymentRequest = { amount: 1, method: { iban: 'DE' }, note: 1 };
    expectTypeOf(control).toEqualTypeOf<PaymentRequest>();
    // @ts-expect-error boolean nicht erlaubt
    const bad: PaymentRequest = { amount: 1, method: { iban: 'DE' }, note: true };
    void bad;
  });
  test('[T-RECURSIVE] TreeNode.children', () => {
    expectTypeOf<TreeNode['children']>().toEqualTypeOf<TreeNode[] | undefined>();
    const n = {} as TreeNode;
    expectTypeOf(n.children![0]!.children![0]!.value).toEqualTypeOf<string>();
  });
  test('[T-CIRCULAR] TreeParentRef / Category.parent', () => {
    const n = {} as TreeNode;
    expectTypeOf(n.parent?.node?.value).toEqualTypeOf<string | undefined>();
    const c = {} as Category;
    expectTypeOf(c.parent?.parent?.name).toEqualTypeOf<string | undefined>();
  });
  test('[T-INLINE-OBJECT] inlineSchemas Response + nested.depth', () => {
    expectTypeOf(bodies.inlineSchemas({ mode: 'fast' })).toEqualTypeOf<Observable<{ accepted: boolean; id: string }>>();
    expectTypeOf<NonNullable<InlineSchemasBody['nested']>['depth']>().toEqualTypeOf<number | undefined>();
  });
  test('[T-INLINE-ENUM] mode fast|slow', () => {
    expectTypeOf(bodies.inlineSchemas({ mode: 'slow' })).toEqualTypeOf<Observable<{ accepted: boolean; id: string }>>();
    // @ts-expect-error medium ist kein Modus
    bodies.inlineSchemas({ mode: 'medium' });
  });
});

describe('operations', () => {
  test('[T-PARAM-PATH-REQUIRED] getPet(petId: number)', () => {
    expectTypeOf(pets.getPet(1)).toEqualTypeOf<Observable<Pet>>();
    // @ts-expect-error petId fehlt
    pets.getPet();
    // @ts-expect-error petId als string
    pets.getPet('1');
  });
  test('[T-PARAM-PATH-TYPES] multiPathParams', () => {
    expectTypeOf(params.multiPathParams('a', 1, 'u', 'sold')).toEqualTypeOf<Observable<Echo>>();
    expectTypeOf(params.multiPathParams).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(params.multiPathParams).parameter(1).toEqualTypeOf<number>();
    expectTypeOf(params.multiPathParams).parameter(2).toEqualTypeOf<string>();
    expectTypeOf(params.multiPathParams).parameter(3).toEqualTypeOf<'available' | 'pending' | 'sold'>();
    // @ts-expect-error ungültiger Enum-Pfadparameter
    params.multiPathParams('a', 1, 'u', 'foo');
  });
  test('[T-PARAM-QUERY-OPTIONAL] listPets() ohne Parameter', () => {
    expectTypeOf(pets.listPets()).toEqualTypeOf<Observable<PetPage>>();
    expectTypeOf<NonNullable<Parameters<PetsService['listPets']>[0]>['limit']>().toEqualTypeOf<number | undefined>();
  });
  test('[T-PARAM-QUERY-REQUIRED] queryStyles ohne required', () => {
    expectTypeOf(params.queryStyles({ required: 'r' })).toEqualTypeOf<Observable<Echo>>();
    // @ts-expect-error required fehlt
    params.queryStyles({});
  });
  test('[T-PARAM-QUERY-ENUM] sort asc ok, up Fehler', () => {
    expectTypeOf(params.queryStyles({ required: 'r', sort: 'asc' })).toEqualTypeOf<Observable<Echo>>();
    // @ts-expect-error up ist kein Sortierwert
    params.queryStyles({ required: 'r', sort: 'up' });
  });
  test('[T-PARAM-QUERY-ARRAY] tagsExplode string[], tagsSpace number[], filter PetFilter', () => {
    type P = Parameters<ParamsService['queryStyles']>[0];
    expectTypeOf<P['tagsExplode']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<P['tagsSpace']>().toEqualTypeOf<number[] | undefined>();
    expectTypeOf<P['filter']>().toEqualTypeOf<PetFilter | undefined>();
  });
  test('[T-PARAM-HEADER] X-Request-Id Pflicht, X-Retry-Count number', () => {
    expectTypeOf(params.headerAndCookieParams({ 'X-Request-Id': 'id' })).toEqualTypeOf<Observable<Echo>>();
    expectTypeOf<Parameters<ParamsService['headerAndCookieParams']>[0]['X-Retry-Count']>().toEqualTypeOf<number | undefined>();
    // @ts-expect-error X-Request-Id fehlt
    params.headerAndCookieParams({ 'X-Retry-Count': 3 });
  });
  test('[T-NAME-RESERVED-PARAM] reservedParamNames mit allen 4 Parametern', () => {
    expectTypeOf(
      params.reservedParamNames('x', { default: 'd', 'page-size': 5, 'filter.name': 'n' }),
    ).toEqualTypeOf<Observable<Echo>>();
  });
  test('[T-BODY-REQUIRED] createPet ohne Body / name: 123', () => {
    expectTypeOf(pets.createPet(newPet)).toEqualTypeOf<Observable<Pet>>();
    // @ts-expect-error Body fehlt
    pets.createPet();
    // @ts-expect-error name als number
    pets.createPet({ ...newPet, name: 123 });
  });
  test('[T-BODY-OPTIONAL] optionalBody mit/ohne Body', () => {
    expectTypeOf(bodies.optionalBody()).toEqualTypeOf<Observable<void>>();
    expectTypeOf(bodies.optionalBody({ name: 't' })).toEqualTypeOf<Observable<void>>();
  });
  test('[T-PARTIAL-BODY] patchPet', () => {
    expectTypeOf(pets.patchPet(1, { nickname: null })).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf<PetPatch['nickname']>().toEqualTypeOf<string | null | undefined>();
    // @ts-expect-error ungültiger Status
    pets.patchPet(1, { status: 'x' });
  });
  test('[T-BODY-FORM] submitForm', () => {
    expectTypeOf<SubmitFormBody['username']>().toEqualTypeOf<string>();
    expectTypeOf<SubmitFormBody['password']>().toEqualTypeOf<string>();
    expectTypeOf<SubmitFormBody['remember']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf(bodies.submitForm).parameter(0).toEqualTypeOf<SubmitFormBody>();
  });
  test('[T-BODY-MULTIPART] uploadFiles', () => {
    expectTypeOf<Blob>().toExtend<UploadFilesBody['file']>();
    expectTypeOf<UploadFilesBody['file']>().toExtend<Blob>();
    expectTypeOf<UploadFilesBody['title']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<UploadFilesBody['attachments']>[number]>().toExtend<Blob>();
    expectTypeOf(bodies.uploadFiles({ title: 't', file: blob })).toEqualTypeOf<Observable<import('../client/model').UploadResult>>();
    // @ts-expect-error file als string
    bodies.uploadFiles({ title: 't', file: 'string' });
  });
  test('[T-BODY-OCTET] uploadBinary Blob', () => {
    expectTypeOf(bodies.uploadBinary(blob)).toEqualTypeOf<Observable<void>>();
    // @ts-expect-error Objekt statt Blob
    bodies.uploadBinary({});
  });

  test('[T-RESP-200] getPet → Pet, listPets → PetPage', () => {
    expectTypeOf(pets.getPet(1)).toEqualTypeOf<Observable<Pet>>();
    expectTypeOf(pets.listPets()).toEqualTypeOf<Observable<PetPage>>();
    expectTypeOf<ReturnType<typeof getPetResource>>().toEqualTypeOf<HttpResourceRef<Pet | undefined>>();
  });
  test('[T-RESP-204] deletePet → void', () => {
    expectTypeOf(pets.deletePet(1)).toEqualTypeOf<Observable<void>>();
  });
  test('[T-RESP-MULTI-2XX] multiStatus Pet | Job', () => {
    expectTypeOf(responses.multiStatus()).toEqualTypeOf<Observable<Pet | Job>>();
  });
  test('[T-RESP-BINARY] downloadFile Blob', () => {
    expectTypeOf(responses.downloadFile()).toEqualTypeOf<Observable<Blob>>();
  });
  test('[T-RESP-TEXT] postText string', () => {
    expectTypeOf(bodies.postText('x')).toEqualTypeOf<Observable<string>>();
  });
  test('[T-RESP-PRIMITIVE-ARRAY] number[]', () => {
    expectTypeOf(responses.getPrimitiveArray()).toEqualTypeOf<Observable<number[]>>();
  });
  test('[T-RESP-MAP] getInventory Record<string, number>', () => {
    expectTypeOf(responses.getInventory()).toEqualTypeOf<Observable<{ [key: string]: number }>>();
  });
  test('[T-RESP-CONTENT-NEGOTIATION] JSON → Report, PDF → Blob', () => {
    expectTypeOf(responses.reportByAccept('application/json')).toEqualTypeOf<Observable<Report>>();
    expectTypeOf(responses.reportByAccept('application/pdf')).toEqualTypeOf<Observable<Blob>>();
  });
  // Audit: expect sagt explizit "Nur generisches HttpErrorResponse.error:any = fail" → fail statt unsupported.
  test('[T-ERROR-MODEL] operationsgebundener Fehlertyp (Angular-Client: nur HttpErrorResponse.error: any, keine Error-Typen pro Operation)', () => {
    expectTypeOf<HttpErrorResponse['error']>().toEqualTypeOf<Problem>();
  });
});

describe('naming', () => {
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
  test('[T-NAME-SCHEMA-COLLISION] birthday = Schema-Date, nicht global', () => {
    expectTypeOf<NonNullable<UserProfile['birthday']>>().toEqualTypeOf<{ value?: string }>();
    expectTypeOf<NonNullable<UserProfile['birthday']>>().not.toEqualTypeOf<globalThis.Date>();
    expectTypeOf<NonNullable<UserProfile['raw']>>().toEqualTypeOf<{ value?: string }>();
  });
  test('[T-NAME-SCHEMA-SANITIZE] UserProfile', () => {
    expectTypeOf<UserProfile['displayName']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NonNullable<KitchenSink['profile']>>().toEqualTypeOf<UserProfile>();
  });
  test('[T-NAME-OPERATION-ID-SANITIZE] getKebabSnakeOp', () => {
    expectTypeOf(naming.getKebabSnakeOp()).toEqualTypeOf<Observable<void>>();
  });
  test('[T-NO-OPERATION-ID] getNamingNoOperationId → Tag', () => {
    expectTypeOf(naming.getNamingNoOperationId()).toEqualTypeOf<Observable<Tag>>();
  });
  test('[T-UNTAGGED-OP] untaggedOperation', () => {
    expectTypeOf(untagged.untaggedOperation()).toEqualTypeOf<Observable<void>>();
  });
  test('[T-UNREFERENCED-SCHEMA] UnreferencedModel', () => {
    expectTypeOf<UnreferencedModel['marker']>().toEqualTypeOf<'unreferenced'>();
  });
});

// validPet nur, damit satisfies-Prüfung des Fixtures aktiv bleibt.
expectTypeOf(validPet.name).toBeString();
