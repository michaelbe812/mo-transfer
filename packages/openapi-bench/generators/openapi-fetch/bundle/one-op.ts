// Minimaler App-Code: nur getPet über den openapi-fetch-Client.
import createClient from 'openapi-fetch';
import type { paths } from '../client/schema';

export async function loadPet(baseUrl: string, petId: number) {
  const client = createClient<paths>({ baseUrl });
  const { data, error } = await client.GET('/pets/{petId}', { params: { path: { petId } } });
  if (error) throw error;
  return data;
}
