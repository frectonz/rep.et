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

async function fetchWikidataPlaces(): Promise<WikidataPlace[]> {
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

  const itemMap = new Map<
    string,
    { name: string; lat: number; lng: number; aliases: Set<string> }
  >();

  for (const b of bindings) {
    const id = b.item.value;
    const name = b.itemLabel.value;
    const coordStr = b.coord.value;
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

function transliterationVariants(s: string): string[] {
  const base = normalize(s);
  const variants = new Set<string>([base]);

  variants.add(base.replace(/q/g, "k"));
  variants.add(base.replace(/k/g, "q"));

  variants.add(base.replace(/ch/g, "tch"));
  variants.add(base.replace(/tch/g, "ch"));

  variants.add(base.replace(/w/g, "u"));
  variants.add(base.replace(/ou/g, "u"));

  variants.add(base.replace(/ts/g, "tz"));
  variants.add(base.replace(/tz/g, "ts"));
  variants.add(base.replace(/ts/g, "z"));

  variants.add(base.replace(/(.)\1/g, "$1"));

  variants.add(base.replace(/e/g, "i"));
  variants.add(base.replace(/i/g, "e"));

  variants.add(base.replace(/ph/g, "f"));

  return [...variants];
}

function findMatch(
  location: string,
  _region: string,
  places: WikidataPlace[],
  normalizedIndex: Map<string, WikidataPlace>,
): WikidataPlace | null {
  const norm = normalize(location);
  if (normalizedIndex.has(norm)) {
    return normalizedIndex.get(norm)!;
  }

  for (const variant of transliterationVariants(location)) {
    if (normalizedIndex.has(variant)) {
      return normalizedIndex.get(variant)!;
    }
  }

  const words = norm.split(" ").filter((w) => w.length > 2);
  for (const word of words) {
    if (normalizedIndex.has(word)) {
      return normalizedIndex.get(word)!;
    }
  }

  for (const word of words) {
    for (const variant of transliterationVariants(word)) {
      if (normalizedIndex.has(variant)) {
        return normalizedIndex.get(variant)!;
      }
    }
  }

  for (const place of places) {
    const placeNorm = normalize(place.name);
    if (placeNorm.length > 3 && norm.length > 3) {
      if (placeNorm.includes(norm) || norm.includes(placeNorm)) {
        return place;
      }
    }
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

  const normalizedIndex = new Map<string, WikidataPlace>();
  for (const place of places) {
    const norm = normalize(place.name);
    if (!normalizedIndex.has(norm)) {
      normalizedIndex.set(norm, place);
    }
    for (const alias of place.aliases) {
      const aliasNorm = normalize(alias);
      if (!normalizedIndex.has(aliasNorm)) {
        normalizedIndex.set(aliasNorm, place);
      }
    }
  }

  console.log(`Index has ${normalizedIndex.size} normalized entries\n`);

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
