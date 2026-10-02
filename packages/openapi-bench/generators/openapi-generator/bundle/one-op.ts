// Minimaler App-Code: nur getPet (PetsService, providedIn: 'root').
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PetsService } from '../client/api/pets.service';
import { Pet } from '../client/model/pet';

export function loadPet(petId: number): Observable<Pet> {
  return inject(PetsService).getPet({ petId });
}
