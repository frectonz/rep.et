const dir = `${import.meta.dir}/../election-6`;

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

const FETCH_TIMEOUT = 10_000;
const RATE_LIMIT_MS = 1100;

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

async function tryGeocode(query: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=et`;
  console.log(`    [${timestamp()}] fetching: ${query}`);
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    const data: { lat: string; lon: string }[] = await res.json();
    if (data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    console.log(`    [${timestamp()}] no results`);
  } catch (err) {
    console.log(
      `    [${timestamp()}] ERROR: ${err instanceof Error ? err.message : err}`,
    );
  }
  return null;
}

// Strip trailing numbers and common suffixes for retry variations
function locationVariants(location: string, region: string): string[] {
  const queries: string[] = [];

  // 1. Just location + Ethiopia (no region)
  queries.push(`${location}, Ethiopia`);

  // 2. Strip trailing number: "Goma 1" → "Goma"
  const noNum = location.replace(/[\s-]+\d+$/, "").trim();
  if (noNum !== location) {
    queries.push(`${noNum}, ${region}, Ethiopia`);
    queries.push(`${noNum}, Ethiopia`);
  }

  // 3. Strip leading zero numbers: "Soro 02" → "Soro 2" → "Soro"
  const noLeadingZero = location.replace(/\b0(\d)/, "$1");
  if (noLeadingZero !== location) {
    queries.push(`${noLeadingZero}, Ethiopia`);
  }

  // 4. Strip suffixes like "Ketema", "Liyu", "Zuria", "Medebegna", "medebenga"
  const noSuffix = location
    .replace(
      /\s+(Ketema|Liyu|lyu|Zuria|Medebegna|medebenga|Medebegna|Special)\b/gi,
      "",
    )
    .trim();
  if (noSuffix !== location && noSuffix.length > 0) {
    queries.push(`${noSuffix}, ${region}, Ethiopia`);
    queries.push(`${noSuffix}, Ethiopia`);
  }

  // 5. Split compound names on "/" or " And " or "ena" and try first part
  const parts = location.split(/\s*[\/]\s*|\s+And\s+|\s+ina\s+|\s+ena\s+/i);
  if (parts.length > 1) {
    const firstPart = parts[0].replace(/[\s-]+\d+$/, "").trim();
    if (firstPart.length > 0) {
      queries.push(`${firstPart}, ${region}, Ethiopia`);
      queries.push(`${firstPart}, Ethiopia`);
    }
  }

  // Dedupe while preserving order
  return [...new Set(queries)];
}

async function main() {
  const startTime = Date.now();
  const entries: GeocodedEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();

  const failed = entries.filter((e) => e.geocode_source === "failed");
  console.log(
    `[${timestamp()}] Retrying ${failed.length} failed entries with fallback strategies...\n`,
  );

  let recovered = 0;
  let stillFailed = 0;

  for (let i = 0; i < failed.length; i++) {
    const entry = failed[i];
    const progress = `[${i + 1}/${failed.length}]`;
    console.log(`${progress} ${entry.location} (${entry.region})`);

    const variants = locationVariants(entry.location, entry.region);
    let found = false;

    for (const query of variants) {
      await sleep(RATE_LIMIT_MS);
      const coords = await tryGeocode(query);
      if (coords) {
        entry.lat = coords[0];
        entry.lng = coords[1];
        entry.geocode_source = "nominatim_retry";
        console.log(
          `  ${progress} ✓ → ${coords[0]}, ${coords[1]} (via "${query}")`,
        );
        recovered++;
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`  ${progress} ✗ all variants exhausted`);
      stillFailed++;
    }

    // Progress every 25
    if ((i + 1) % 25 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `\n--- Progress: ${i + 1}/${failed.length} | Recovered: ${recovered} | Still failed: ${stillFailed} | Elapsed: ${elapsed}s ---\n`,
      );
    }
  }

  await Bun.write(
    `${dir}/coordinates.json`,
    JSON.stringify(entries, null, 2) + "\n",
  );

  const totalSuccess = entries.filter(
    (e) => e.geocode_source !== "failed",
  ).length;
  const totalFailed = entries.filter(
    (e) => e.geocode_source === "failed",
  ).length;
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\n=== Retry Summary ===`);
  console.log(`Retried:      ${failed.length}`);
  console.log(`Recovered:    ${recovered}`);
  console.log(`Still failed: ${stillFailed}`);
  console.log(`Elapsed:      ${totalElapsed}s`);
  console.log(`\n=== Overall ===`);
  console.log(`Total entries:  ${entries.length}`);
  console.log(`With coords:    ${totalSuccess}`);
  console.log(`Without coords: ${totalFailed}`);
  console.log(`Output: election-6/coordinates.json`);
}

main();
