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
  province?: string;
  county?: string;
  municipality?: string;
  borough?: string;
  district?: string;
}

interface AddressResponse {
  data: {
    name: {
      country: { AM: string; EN: string };
      province: { AM: string; EN: string };
      county: { AM: string; EN: string };
      municipality: { AM: string; EN: string };
      borough: { AM: string; EN: string };
      district: { AM: string; EN: string };
    };
  };
}

interface AddressEntry {
  lat: number;
  lng: number;
  response: AddressResponse;
}

function key(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

async function main() {
  const entries: CoordEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();

  const addresses: Record<string, AddressEntry> = await Bun.file(
    `${dir}/addresses.json`,
  ).json();

  console.log(`Loaded ${entries.length} coordinates`);
  console.log(`Loaded ${Object.keys(addresses).length} addresses\n`);

  let enriched = 0;
  let noCoords = 0;
  let noAddress = 0;

  for (const entry of entries) {
    if (entry.lat === null || entry.lng === null) {
      noCoords++;
      continue;
    }

    const addr = addresses[key(entry.lat, entry.lng)];
    if (!addr) {
      noAddress++;
      console.log(
        `No address for ${entry.candidate} (${entry.lat},${entry.lng})`,
      );
      continue;
    }

    const name = addr.response.data.name;
    entry.province = name.province?.EN;
    entry.county = name.county?.EN;
    entry.municipality = name.municipality?.EN;
    entry.borough = name.borough?.EN;
    entry.district = name.district?.EN;
    enriched++;
  }

  await Bun.write(
    `${dir}/coordinates.json`,
    JSON.stringify(entries, null, 2) + "\n",
  );

  console.log(`\n=== Enrichment Summary ===`);
  console.log(`Total:      ${entries.length}`);
  console.log(`Enriched:   ${enriched}`);
  console.log(`No coords:  ${noCoords}`);
  console.log(`No address: ${noAddress}`);
}

main();
