// Minimaler App-Code: ruft NUR getPet auf (Tree-Shaking-Messung A-TREESHAKE).
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Pet, PetsClient } from '../client/api';

export function loadPet(petId: number): Observable<Pet> {
  return inject(PetsClient).getPet(petId);
}
