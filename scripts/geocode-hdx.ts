const dir = `${import.meta.dir}/../election-6`;
const hdxPath = `${import.meta.dir}/hdx/eth_admin3.geojson`;

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

interface HdxWoreda {
  name: string;
  region: string;
  zone: string;
  lat: number;
  lng: number;
}

interface HdxFeature {
  properties: {
    adm1_name: string;
    adm2_name: string;
    adm3_name: string;
    center_lat: number | null;
    center_lon: number | null;
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_\/]+/g, " ")
    .replace(/\d+/g, "")
    .replace(
      /\b(ketema|liyu|lyu|zuria|zuriya|medebegna|medebenga|special|woreda|wereda|town)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function nameVariants(s: string): string[] {
  const norm = normalize(s);
  const variants = new Set<string>([norm]);

  variants.add(norm.replace(/q/g, "k"));
  variants.add(norm.replace(/k/g, "q"));

  variants.add(norm.replace(/ch/g, "tch"));
  variants.add(norm.replace(/tch/g, "ch"));

  variants.add(norm.replace(/w/g, "u"));

  variants.add(norm.replace(/ts/g, "z"));
  variants.add(norm.replace(/tz/g, "z"));

  variants.add(norm.replace(/(.)\1/g, "$1"));

  variants.add(norm.replace(/e/g, "i"));
  variants.add(norm.replace(/i/g, "e"));

  variants.add(norm.replace(/ey/g, "ay"));
  variants.add(norm.replace(/ay/g, "ey"));

  const words = norm.split(" ").filter((w) => w.length > 2);
  for (const w of words) {
    variants.add(w);
    variants.add(w.replace(/q/g, "k"));
    variants.add(w.replace(/k/g, "q"));
    variants.add(w.replace(/e/g, "i"));
    variants.add(w.replace(/i/g, "e"));
  }

  return [...variants];
}

const regionMap: Record<string, string[]> = {
  Amhara: ["Amhara"],
  Oromia: ["Oromia"],
  SNNPR: [
    "SNNP",
    "South West Ethiopia",
    "Central Ethiopia",
    "South Ethiopia",
    "Sidama",
  ],
  Sidama: ["Sidama", "SNNP", "South Ethiopia"],
  Somali: ["Somali"],
  Afar: ["Afar"],
  Gambella: ["Gambella"],
  Harari: ["Harari"],
  Tigray: ["Tigray"],
  "Benishangul Gumuz": ["Benishangul Gumuz"],
  "Dire Dawa": ["Dire Dawa"],
  "Addis Ababa": ["Addis Ababa"],
};

async function main() {
  const geojson = await Bun.file(hdxPath).json();
  const woredas: HdxWoreda[] = geojson.features
    .filter(
      (f: HdxFeature) => f.properties.center_lat && f.properties.center_lon,
    )
    .map((f: HdxFeature) => ({
      name: f.properties.adm3_name,
      region: f.properties.adm1_name,
      zone: f.properties.adm2_name,
      lat: f.properties.center_lat,
      lng: f.properties.center_lon,
    }));

  console.log(`Loaded ${woredas.length} woredas from HDX\n`);

  const index = new Map<string, HdxWoreda[]>();
  for (const w of woredas) {
    const norm = normalize(w.name);
    if (!index.has(norm)) index.set(norm, []);
    index.get(norm)!.push(w);

    const words = norm.split(" ").filter((word) => word.length > 2);
    for (const word of words) {
      if (!index.has(word)) index.set(word, []);
      index.get(word)!.push(w);
    }
  }

  console.log(`Index has ${index.size} entries\n`);

  const entries: GeocodedEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();
  const failed = entries.filter((e) => e.geocode_source === "failed");
  console.log(`Matching ${failed.length} failed entries...\n`);

  let recovered = 0;
  let stillFailed = 0;

  for (const entry of failed) {
    const allowedRegions = regionMap[entry.region] || [entry.region];
    const variants = nameVariants(entry.location);

    let bestMatch: HdxWoreda | null = null;

    for (const variant of variants) {
      const candidates = index.get(variant);
      if (!candidates) continue;

      const regionMatch = candidates.find((c) =>
        allowedRegions.some((r) => r.toLowerCase() === c.region.toLowerCase()),
      );
      if (regionMatch) {
        bestMatch = regionMatch;
        break;
      }

      if (!bestMatch && candidates.length > 0) {
        bestMatch = candidates[0];
      }
    }

    if (bestMatch) {
      entry.lat = bestMatch.lat;
      entry.lng = bestMatch.lng;
      entry.geocode_source = "hdx";
      console.log(
        `✓ ${entry.location} (${entry.region}) → ${bestMatch.name} [${bestMatch.region}] (${bestMatch.lat}, ${bestMatch.lng})`,
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

  console.log(`\n=== HDX Match Summary ===`);
  console.log(`Attempted:    ${failed.length}`);
  console.log(`Recovered:    ${recovered}`);
  console.log(`Still failed: ${stillFailed}`);
  console.log(`\n=== Overall ===`);
  console.log(`Total entries:  ${entries.length}`);
  console.log(`With coords:    ${totalSuccess}`);
  console.log(`Without coords: ${totalFailed}`);
}

main();
