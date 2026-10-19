import { TestBed } from '@angular/core/testing';
import {
  getFindPetsByStatusResponseMock,
  petClientHandlers,
  petClientHttp,
} from '@mo-transfer/generated/pet-client/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { PetApi } from './pet-api';

describe('PetApi (generated pet-client)', () => {
  // generated default handlers: every Petstore operation answers with the spec examples, faker fills the rest
  beforeEach(() => worker.use(...petClientHandlers));

  test('loads available pets through the generated handlers: stable data, no seed needed', async () => {
    const api = TestBed.inject(PetApi);

    const first = await api.availablePets();
    const second = await api.availablePets();

    expect(first.length).toBeGreaterThan(0);
    expect(first.every((pet) => pet.name === 'doggie')).toBe(true); // `example` of Pet.name in the spec
    expect(second).toEqual(first); // same data per request (values change only with the spec)
    // the factory returns exactly what the handler sends: derive expectations from it
    const expected = getFindPetsByStatusResponseMock().map(({ id, name }) => ({ id, name }));
    expect(first).toEqual(expected);
  });

  test('sends status=available (typed scenario: only documented paths, query and bodies compile)', async ({
    worker,
  }) => {
    worker.use(
      petClientHttp.get('/pet/findByStatus', ({ query, response }) =>
        response(200).json([
          { id: 7, name: query.get('status') === 'available' ? 'Rex' : 'wrong status', photoUrls: [] },
        ]),
      ),
    );

    expect(await TestBed.inject(PetApi).availablePets()).toEqual([{ id: 7, name: 'Rex' }]);
  });

  test('turns a documented error status into an Error', async ({ worker }) => {
    worker.use(petClientHttp.get('/pet/findByStatus', ({ response }) => response(400).empty()));

    await expect(TestBed.inject(PetApi).availablePets()).rejects.toThrow('GET /pet/findByStatus failed: 400');
  });
});
