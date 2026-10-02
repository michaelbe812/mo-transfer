// Minimaler App-Code: nutzt NUR getPet (Tree-Shaking-Messung A-TREESHAKE).
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PetsService } from '../client/services/pets.service';
import type { Pet } from '../client/models';

export function loadPet(petId: number): Observable<Pet> {
  return inject(PetsService).getPet(petId);
}
