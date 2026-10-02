/**
 * Minimaler App-Code: ruft NUR getPet über den generierten Api-Service auf (fn-basiert → tree-shakeable).
 */
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Api } from '../client/api';
import { getPet } from '../client/fn/pets/get-pet';
import type { Pet } from '../client/models/pet';

export function loadPet(petId: number): Observable<Pet> {
  return inject(Api).invoke(getPet, { petId });
}
