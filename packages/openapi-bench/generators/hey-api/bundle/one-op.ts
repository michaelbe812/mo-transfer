// Minimaler App-Code: nur getPet (Tree-Shaking-Messung A-TREESHAKE).
import { getPet } from '../client/sdk.gen';

export async function loadPet(petId: number) {
  const { data } = await getPet({ path: { petId }, throwOnError: true });
  return data;
}
