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

interface WikidataPlace {
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}

// Query Wikidata for Ethiopian places with coordinates
async function fetchWikidataPlaces(): Promise<WikidataPlace[]> {
  // Broad query: anything located in Ethiopia (P17=Q115) with coordinates
  // Including woredas, towns, cities, villages, zones, etc.
  const query = `
    SELECT ?item ?itemLabel ?coord ?altLabel WHERE {
      ?item wdt:P17 wd:Q115 .
      ?item wdt:P625 ?coord .
      OPTIONAL { ?item skos:altLabel ?altLabel . FILTER(LANG(?altLabel) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
  `;

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  console.log("Fetching Ethiopian places from Wikidata...");

  const res = await fetch(url, {
    headers: {
      "User-Agent": "rep.et-geocoder/1.0",
      Accept: "application/sparql-results+json",
    },
  });

  if (!res.ok) {
    throw new Error(`Wikidata query failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const bindings = data.results.bindings;

  // Group by item to collect aliases
  const itemMap = new Map<
    string,
    { name: string; lat: number; lng: number; aliases: Set<string> }
  >();

  for (const b of bindings) {
    const id = b.item.value;
    const name = b.itemLabel.value;
    const coordStr = b.coord.value; // "Point(lng lat)"
    const match = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
    if (!match) continue;
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    if (!itemMap.has(id)) {
      itemMap.set(id, { name, lat, lng, aliases: new Set() });
    }
    if (b.altLabel?.value) {
      itemMap.get(id)!.aliases.add(b.altLabel.value);
    }
  }

  const places: WikidataPlace[] = [];
  for (const [, v] of itemMap) {
    places.push({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      aliases: [...v.aliases],
    });
  }

  console.log(`Fetched ${places.length} places from Wikidata\n`);
  return places;
}

// Normalize a name for matching
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_\/]+/g, " ")
    .replace(/\d+/g, "")
    .replace(
      /\b(ketema|liyu|lyu|zuria|zuriya|medebegna|medebenga|special|woreda|wereda)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Strip common transliteration variants
function transliterationVariants(s: string): string[] {
  const base = normalize(s);
  const variants = new Set<string>([base]);

  // Q/K swap
  variants.add(base.replace(/q/g, "k"));
  variants.add(base.replace(/k/g, "q"));

  // Ch/Tch
  variants.add(base.replace(/ch/g, "tch"));
  variants.add(base.replace(/tch/g, "ch"));

  // W/U/O
  variants.add(base.replace(/w/g, "u"));
  variants.add(base.replace(/ou/g, "u"));

  // Ts/Tz/Z
  variants.add(base.replace(/ts/g, "tz"));
  variants.add(base.replace(/tz/g, "ts"));
  variants.add(base.replace(/ts/g, "z"));

  // Double consonants
  variants.add(base.replace(/(.)\1/g, "$1"));

  // E/I swap
  variants.add(base.replace(/e/g, "i"));
  variants.add(base.replace(/i/g, "e"));

  // Ph/F
  variants.add(base.replace(/ph/g, "f"));

  return [...variants];
}

// Try to match a location against the Wikidata places
function findMatch(
  location: string,
  _region: string,
  places: WikidataPlace[],
  normalizedIndex: Map<string, WikidataPlace>,
): WikidataPlace | null {
  // 1. Direct normalized match
  const norm = normalize(location);
  if (normalizedIndex.has(norm)) {
    return normalizedIndex.get(norm)!;
  }

  // 2. Transliteration variants
  for (const variant of transliterationVariants(location)) {
    if (normalizedIndex.has(variant)) {
      return normalizedIndex.get(variant)!;
    }
  }

  // 3. Try first word only (for compound names like "Gechi Borecha")
  const words = norm.split(" ").filter((w) => w.length > 2);
  for (const word of words) {
    if (normalizedIndex.has(word)) {
      return normalizedIndex.get(word)!;
    }
  }

  // 4. Try first word with transliteration
  for (const word of words) {
    for (const variant of transliterationVariants(word)) {
      if (normalizedIndex.has(variant)) {
        return normalizedIndex.get(variant)!;
      }
    }
  }

  // 5. Substring match — check if any place name contains our location or vice versa
  for (const place of places) {
    const placeNorm = normalize(place.name);
    if (placeNorm.length > 3 && norm.length > 3) {
      if (placeNorm.includes(norm) || norm.includes(placeNorm)) {
        return place;
      }
    }
    // Check aliases too
    for (const alias of place.aliases) {
      const aliasNorm = normalize(alias);
      if (aliasNorm === norm) return place;
      for (const variant of transliterationVariants(location)) {
        if (aliasNorm === variant) return place;
      }
    }
  }

  return null;
}

async function main() {
  const places = await fetchWikidataPlaces();

  // Build normalized index
  const normalizedIndex = new Map<string, WikidataPlace>();
  for (const place of places) {
    const norm = normalize(place.name);
    if (!normalizedIndex.has(norm)) {
      normalizedIndex.set(norm, place);
    }
    // Also index aliases
    for (const alias of place.aliases) {
      const aliasNorm = normalize(alias);
      if (!normalizedIndex.has(aliasNorm)) {
        normalizedIndex.set(aliasNorm, place);
      }
    }
  }

  console.log(`Index has ${normalizedIndex.size} normalized entries\n`);

  // Load coordinates.json
  const entries: GeocodedEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();
  const failed = entries.filter((e) => e.geocode_source === "failed");

  console.log(`Matching ${failed.length} failed entries against Wikidata...\n`);

  let recovered = 0;
  let stillFailed = 0;

  for (const entry of failed) {
    const match = findMatch(
      entry.location,
      entry.region,
      places,
      normalizedIndex,
    );
    if (match) {
      entry.lat = match.lat;
      entry.lng = match.lng;
      entry.geocode_source = "wikidata";
      console.log(
        `✓ ${entry.location} (${entry.region}) → ${match.name} [${match.lat}, ${match.lng}]`,
      );
      recovered++;
    } else {
      console.log(`✗ ${entry.location} (${entry.region})`);
      stillFailed++;
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

  console.log(`\n=== Wikidata Match Summary ===`);
  console.log(`Attempted:    ${failed.length}`);
  console.log(`Recovered:    ${recovered}`);
  console.log(`Still failed: ${stillFailed}`);
  console.log(`\n=== Overall ===`);
  console.log(`Total entries:  ${entries.length}`);
  console.log(`With coords:    ${totalSuccess}`);
  console.log(`Without coords: ${totalFailed}`);
}

main();
