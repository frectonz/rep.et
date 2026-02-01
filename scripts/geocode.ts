const dir = `${import.meta.dir}/../election-6`;

interface Candidate {
  location: string;
  party: string | null;
  candidate: string;
  gender: string;
  votes: number;
}

interface GeocodedEntry {
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

const regionToFile: Record<string, string> = {
  "Addis Ababa": "addis-ababa.json",
  Afar: "afar.json",
  Amhara: "amhara.json",
  Oromia: "oromiya.json",
  Sidama: "sidama.json",
  SNNPR: "snnpr.json",
  Somali: "somaili.json",
  Harari: "harari.json",
  "Benishangul Gumuz": "benishangul.json",
  "Dire Dawa": "dire-dawa.json",
  Gambella: "gambella.json",
};

// Addis Ababa constituency approximate centroids derived from
// the NEBE electoral constituency map (WGS 1984 Web Mercator).
// Positioned relative to known sub-city boundaries.
const addisAbabaCoords: Record<string, [number, number]> = {
  "Constituency 1 and 9": [9.065, 38.735], // Gulele, northwest
  "Constituency 2 and 14": [9.03, 38.765], // Arada
  "Constituency 3": [9.025, 38.75], // Arada / Lideta
  "Constituency 4": [9.02, 38.755], // Lideta / Kirkos
  "Constituency 5": [9.035, 38.76], // Arada
  "Constituency 6": [9.035, 38.755], // Arada / Addis Ketema
  "Constituency 7": [9.035, 38.745], // Addis Ketema
  "Constituency 8": [9.05, 38.76], // Gulele / Yeka border, north
  "Constituency 10": [9.055, 38.79], // Yeka, north-central
  "Constituency 11": [9.06, 38.815], // Yeka, northeast
  "Constituency 12 and 13": [9.05, 38.8], // Yeka, north-central/east
  "Constituency 15": [9.03, 38.81], // Bole, north
  "Constituency 16": [9.025, 38.79], // Kirkos / Bole border
  "Constituency 17": [9.01, 38.82], // Bole, large eastern area
  "Constituency 18": [9.015, 38.765], // Nifas Silk / Kirkos
  "Constituency 19": [8.93, 38.77], // Akaki Kality, large southern area
  "Constituency 20": [8.98, 38.755], // Nifas Silk / Akaki border
  "Constituency 21 and 22": [9.02, 38.77], // Kirkos
  "Constituency 23": [8.995, 38.755], // Nifas Silk, south-central
  "Constituency 24": [9.0, 38.73], // Nifas Silk / Kolfe, southwest
  "Constituency 25": [9.035, 38.725], // Addis Ketema / Kolfe, west
  "Constituency 26 and 27": [8.92, 38.81], // Akaki Kality, southeast
  "Constituency 28": [9.03, 38.84], // Bole, far east
};

const FETCH_TIMEOUT = 10_000; // 10 second timeout per request
const RATE_LIMIT_MS = 1100; // Nominatim: max 1 req/sec

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "rep.et-geocoder/1.0" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeNominatim(
  location: string,
  region: string,
): Promise<[number, number] | null> {
  const query = `${location}, ${region}, Ethiopia`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=et`;

  console.log(`    [${timestamp()}] fetching: ${query}`);

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    const data: { lat: string; lon: string }[] = await res.json();

    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    console.log(`    [${timestamp()}] no results for "${query}"`);
  } catch (err) {
    console.log(
      `    [${timestamp()}] ERROR for "${query}": ${err instanceof Error ? err.message : err}`,
    );
  }

  // Retry: strip trailing numbers ("Goma 1" → "Goma")
  const baseName = location.replace(/\s+\d+$/, "");
  if (baseName !== location) {
    const retryQuery = `${baseName}, ${region}, Ethiopia`;
    const retryUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(retryQuery)}&format=json&limit=1&countrycodes=et`;
    console.log(`    [${timestamp()}] retrying without number: ${retryQuery}`);
    await sleep(RATE_LIMIT_MS);
    try {
      const retryRes = await fetchWithTimeout(retryUrl, FETCH_TIMEOUT);
      const retryData: { lat: string; lon: string }[] = await retryRes.json();
      if (retryData.length > 0) {
        return [parseFloat(retryData[0].lat), parseFloat(retryData[0].lon)];
      }
      console.log(`    [${timestamp()}] retry also returned no results`);
    } catch (err) {
      console.log(
        `    [${timestamp()}] retry ERROR: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return null;
}

async function main() {
  const startTime = Date.now();
  const results: GeocodedEntry[] = [];
  let success = 0;
  let failed = 0;
  let totalProcessed = 0;
  const totalCandidates = 471; // known total

  console.log(`[${timestamp()}] Starting geocoding...`);

  for (const [region, file] of Object.entries(regionToFile)) {
    const candidates: Candidate[] = await Bun.file(`${dir}/${file}`).json();
    console.log(
      `\n[${timestamp()}] === ${region} === (${candidates.length} candidates)`,
    );

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      totalProcessed++;

      const progress = `[${totalProcessed}/${totalCandidates}]`;

      // Addis Ababa: use map-derived coordinates
      if (region === "Addis Ababa") {
        const coords = addisAbabaCoords[c.location];
        if (coords) {
          results.push({
            region,
            location: c.location,
            candidate: c.candidate,
            party: c.party,
            gender: c.gender,
            votes: c.votes,
            lat: coords[0],
            lng: coords[1],
            geocode_source: "manual_map",
          });
          console.log(
            `  ${progress} ✓ ${c.location} → ${coords[0]}, ${coords[1]} (map)`,
          );
          success++;
        } else {
          results.push({
            region,
            location: c.location,
            candidate: c.candidate,
            party: c.party,
            gender: c.gender,
            votes: c.votes,
            lat: null,
            lng: null,
            geocode_source: "failed",
          });
          console.log(`  ${progress} ✗ ${c.location} — not in map lookup`);
          failed++;
        }
        continue;
      }

      // All other regions: geocode via Nominatim
      await sleep(RATE_LIMIT_MS);
      const coords = await geocodeNominatim(c.location, region);

      if (coords) {
        results.push({
          region,
          location: c.location,
          candidate: c.candidate,
          party: c.party,
          gender: c.gender,
          votes: c.votes,
          lat: coords[0],
          lng: coords[1],
          geocode_source: "nominatim",
        });
        console.log(
          `  ${progress} ✓ ${c.location} → ${coords[0]}, ${coords[1]}`,
        );
        success++;
      } else {
        results.push({
          region,
          location: c.location,
          candidate: c.candidate,
          party: c.party,
          gender: c.gender,
          votes: c.votes,
          lat: null,
          lng: null,
          geocode_source: "failed",
        });
        console.log(`  ${progress} ✗ ${c.location} — FAILED`);
        failed++;
      }
    }

    // Progress summary after each region
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(
      `[${timestamp()}] Region done. Progress: ${totalProcessed}/${totalCandidates} | Success: ${success} | Failed: ${failed} | Elapsed: ${elapsed}s`,
    );
  }

  await Bun.write(
    `${dir}/coordinates.json`,
    JSON.stringify(results, null, 2) + "\n",
  );

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== Final Summary ===`);
  console.log(`Total:   ${results.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Elapsed: ${totalElapsed}s`);
  console.log(`Output:  election-6/coordinates.json`);
}

main();
