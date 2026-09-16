/**
 * Manufacturer adapter — empty until this site has credentials.
 * Port a feed here (Aberdeen's stock-ingest-skoda-uk is the Škoda example).
 * Must return the same rows as parseWorkbook: { vin, vehicle, colour, type, site, price, miles, keys }.
 */
export async function pullManufacturer() {
  throw new Error("Manufacturer ingest is not wired for this site.");
}
