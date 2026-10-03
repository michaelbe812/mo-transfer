import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import { PetServiceRequests } from '@mo-transfer/generated/pet-client/api';
import type { FindPetsByStatusResponse, Pet } from '@mo-transfer/generated/pet-client/types';
import { filter, firstValueFrom, map } from 'rxjs';

/** A pet guests can book a pet-friendly room for — the shared model, not the generated DTO. */
export interface PetSummary {
  id: number;
  name: string;
}

/**
 * Shared data-access layer over the generated pet-client (libs/generated/pet-client, adapter hey-api):
 * Promise instead of Observable, own model, errors as `Error` with the status. Consumers never
 * see the generated service — swapping the adapter changes this file only.
 */
@Injectable({ providedIn: 'root' })
export class PetApi {
  private readonly http = inject(HttpClient);
  private readonly petRequests = inject(PetServiceRequests);
  private readonly injector = inject(EnvironmentInjector);

  async availablePets(): Promise<PetSummary[]> {
    try {
      // HttpClient completes WITHOUT a value only when the request was cancelled (injector destroyed)
      // hey-api (@angular/common): the generated class builds the HttpRequest, HttpClient sends it (interceptors apply).
      // requestOptions() injects the client config → needs an injection context outside the constructor
      const request = runInInjectionContext(this.injector, () =>
        this.petRequests.findPetsByStatus({ query: { status: 'available' } }),
      );
      const pets$ = this.http.request<FindPetsByStatusResponse>(request).pipe(
        filter((event) => event instanceof HttpResponse),
        map((response) => response.body ?? []),
      );
      const pets: Pet[] = await firstValueFrom(pets$, { defaultValue: [] });
      return pets
        .filter((pet): pet is Pet & { id: number } => pet.id !== undefined)
        .map(({ id, name }) => ({ id, name }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) throw new Error(`GET /pet/findByStatus failed: ${error.status}`);
      throw error;
    }
  }
}
