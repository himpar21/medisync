import { fetchMedicines } from "./orderService";

export async function getMedicines(filters = {}) {
  return fetchMedicines(filters);
}
