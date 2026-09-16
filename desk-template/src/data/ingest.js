/**
 * Core ingest: upsert-by-VIN. Excel is the default adapter.
 * Manufacturer feeds implement the same shape — do not fork Stock.jsx.
 */
import * as XLSX from "xlsx";

function cell(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => {
      const vin = cell(row, ["VIN", "vin", "Vin", "Chassis"]).toUpperCase();
      if (!vin) return null;
      const price = Number(String(cell(row, ["Price", "price", "RRP"])).replace(/[^0-9.]/g, "")) || 0;
      const milesRaw = cell(row, ["Miles", "Mileage", "miles"]);
      return {
        vin,
        vehicle: cell(row, ["Model", "Vehicle", "Description", "vehicle"]) || "Unknown",
        colour: cell(row, ["Colour", "Color", "colour"]) || "",
        type: /used/i.test(cell(row, ["Type", "New/Used", "Condition"])) ? "Used" : "New",
        site: cell(row, ["Site", "Location", "Branch"]) || "",
        price,
        miles: milesRaw === "" ? null : Number(String(milesRaw).replace(/[^0-9]/g, "")) || 0,
        keys: cell(row, ["Keys", "Key location"]) || "Unknown",
      };
    })
    .filter(Boolean);
}

export function upsertByVin(existing, incoming, siteFallback) {
  const map = new Map(existing.map((c) => [c.vin, { ...c }]));
  for (const row of incoming) {
    const prev = map.get(row.vin);
    map.set(row.vin, {
      id: prev?.id || `STK-${row.vin.slice(-6)}`,
      vehicle: row.vehicle,
      colour: row.colour,
      vin: row.vin,
      type: row.type,
      site: row.site || siteFallback || "Main",
      keys: row.keys || prev?.keys || "Unknown",
      days: prev?.days ?? 0,
      price: row.price,
      miles: row.miles,
      missing: (row.keys || prev?.keys) === "Unknown",
      matchedDealId: prev?.matchedDealId ?? null,
    });
  }
  return [...map.values()];
}
