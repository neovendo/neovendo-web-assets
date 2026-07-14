// Generates jobs/data/plz-data.json for the website location filter from the
// dashboard's authoritative PLZ_STREETCODE_FINAL.csv (single source of truth).
//
// The CSV lives in the ba-admin-dashboard repo:
//   public/data/PLZ_STREETCODE_FINAL.csv
// Columns: postcode;city;suburb;display_name;longitude;latitude;state
//
// Usage:
//   node jobs/build/generate-plz-data.mjs /path/to/PLZ_STREETCODE_FINAL.csv
//
// Output entry shape: { plz, city, ort, lat, lon }
//   - city = clean city ("Neumünster")   -> PLZ-independent city search
//   - ort  = display name ("Neumünster, Holstein" / "Neumünster-Innenstadt")
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2] || resolve(here, "PLZ_STREETCODE_FINAL.csv");
const outPath = resolve(here, "../data/plz-data.json");

const text = readFileSync(csvPath, "utf8");
const out = [];
let skipped = 0;

for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const cells = trimmed.split(";").map((v) => v.replace(/^"|"$/g, "").trim());
  if (cells.length < 5) { skipped += 1; continue; }
  const [postcode, city, suburb = "", displayName = "", longitude = "", latitude = ""] = cells;
  if (!postcode || !city) { skipped += 1; continue; }
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) { skipped += 1; continue; }
  const ort = displayName || [city, suburb].filter(Boolean).join("-") || city;
  out.push({ plz: postcode, city, ort, lat, lon });
}

writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${out.length} entries (skipped ${skipped}) -> ${outPath}`);
