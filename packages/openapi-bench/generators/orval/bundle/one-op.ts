// Minimaler App-Code: nur getPet (HttpClient-Service, tags-split → nur PetsService wird gezogen).
import { inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Pet } from '../client/model';
import { PetsService } from '../client/pets/pets.service';

export function loadPet(petId: number): Observable<Pet> {
  return inject(PetsService).getPet(petId);
}
