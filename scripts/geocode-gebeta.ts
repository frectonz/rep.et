const dir = `${import.meta.dir}/../election-6`;

interface CoordEntry {
  region: string;
  location: string;
  candidate: string;
  party: string | null;
  gender: string;
  votes: number;
  lat: number | null;
  lng: number | null;
  geocode_source: string;
}

interface AddressEntry {
  lat: number;
  lng: number;
  response: unknown;
}

const API_KEY = process.env.GEBETA_API_KEY;
if (!API_KEY) {
  console.error("Missing GEBETA_API_KEY environment variable");
  process.exit(1);
}

const DELAY_MS = 200; // throttle between requests

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function key(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<unknown | null> {
  const url = `https://address.gebeta.app/v1/address/reverse-geocoding?lat=${lat}&lng=${lng}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    console.error(`  API error ${res.status}: ${res.statusText}`);
    return null;
  }

  return await res.json();
}

async function main() {
  const entries: CoordEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();

  // Load existing addresses if present (for re-runs)
  let addresses: Record<string, AddressEntry> = {};
  const addressesFile = Bun.file(`${dir}/addresses.json`);
  if (await addressesFile.exists()) {
    addresses = await addressesFile.json();
  }

  console.log(`Loaded ${entries.length} entries`);
  console.log(`Existing addresses: ${Object.keys(addresses).length}\n`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let noCoords = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip entries without coordinates
    if (entry.lat === null || entry.lng === null) {
      noCoords++;
      continue;
    }

    const k = key(entry.lat, entry.lng);

    // Skip entries already in addresses.json
    if (addresses[k]) {
      skipped++;
      continue;
    }

    const response = await reverseGeocode(entry.lat, entry.lng);

    if (response !== null) {
      addresses[k] = { lat: entry.lat, lng: entry.lng, response };
      processed++;
      console.log(`[${i + 1}/${entries.length}] ${entry.candidate} → OK`);
    } else {
      failed++;
      console.log(`[${i + 1}/${entries.length}] ${entry.candidate} → FAILED`);
    }

    await sleep(DELAY_MS);
  }

  await Bun.write(
    `${dir}/addresses.json`,
    JSON.stringify(addresses, null, 2) + "\n",
  );

  console.log(`\n=== Gebeta Reverse Geocoding Summary ===`);
  console.log(`Total entries:  ${entries.length}`);
  console.log(`Processed:      ${processed}`);
  console.log(`Skipped (done): ${skipped}`);
  console.log(`No coordinates: ${noCoords}`);
  console.log(`Failed:         ${failed}`);
}

main();
