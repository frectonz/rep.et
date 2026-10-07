import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transliterate } from "./lib/ethiopic.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const EW = resolve(
  process.env.ELECTIONWATCH_DIR ?? join(ROOT, "..", "electionwatch.et"),
);
const OUT_DIR = join(ROOT, "election-7");

if (!existsSync(EW)) {
  console.error(`electionwatch.et checkout not found at ${EW}`);
  process.exit(1);
}

const read = <T>(...parts: string[]): T =>
  JSON.parse(readFileSync(join(...parts), "utf-8")) as T;

interface ElectedRow {
  region_slug: string;
  constituency: string;
  constituency_slug: string;
  candidate: string;
  candidate_id: string;
  party: string;
  party_name_en: string | null;
}

interface VoteRow {
  constituency_slug: string | null;
  candidate: string;
  candidate_id: string | null;
  party_name_en: string | null;
  votes: number | null;
  elected: boolean;
  rank: number;
}

interface Candidate {
  candidate_id: string;
  full_name: string;
  gender: "Male" | "Female";
  disability: boolean;
  education: string;
}

interface CandidateRegion {
  slug: string;
  name: string;
}

interface CandidatesIndex {
  hopr_constituency_count: number;
}

interface CandidateConstituency {
  slug: string;
  polling_station_codes: string[];
}

interface Station {
  hopr_constituency_code: string;
  latitude: number | null;
  longitude: number | null;
  coordinate_source: "nebe" | "woreda_centroid";
}

interface ResultsIndex {
  source_url: string;
  published: string;
}

interface Overrides {
  candidate: Record<string, string>;
  location: Record<string, string>;
  stations: Record<string, string[]>;
}

interface Rep6 {
  region: string;
  location: string;
  candidate: string;
  image: string | null;
  lat: number;
  lng: number;
}

const RESULTS = join(EW, "results", "data", "json");
const CANDIDATES = join(EW, "candidates", "data", "json");
const STATIONS = join(EW, "polling-stations", "data", "json");

const elected = read<{ hopr: ElectedRow[] }>(RESULTS, "elected.json").hopr;
const resultsIndex = read<ResultsIndex>(RESULTS, "index.json");
const regions = read<CandidateRegion[]>(CANDIDATES, "regions.json");
const candidatesIndex = read<CandidatesIndex>(CANDIDATES, "index.json");
const constituencies = read<{ hopr: CandidateConstituency[] }>(
  CANDIDATES,
  "constituencies.json",
).hopr;
const overrides = read<Overrides>(OUT_DIR, "overrides.json");
const house6 = read<Rep6[]>(ROOT, "election-6", "coordinates.json");

const candidateById = new Map<string, Candidate>();
for (const file of readdirSync(join(CANDIDATES, "candidates"))) {
  if (!file.endsWith("_hopr.json")) continue;
  for (const c of read<Candidate[]>(CANDIDATES, "candidates", file)) {
    candidateById.set(c.candidate_id, c);
  }
}

const votesByConstituency = new Map<string, VoteRow[]>();
for (const file of readdirSync(join(RESULTS, "votes"))) {
  if (!file.endsWith("_hopr.json")) continue;
  for (const row of read<VoteRow[]>(RESULTS, "votes", file)) {
    if (!row.constituency_slug || row.votes === null) continue;
    const list = votesByConstituency.get(row.constituency_slug) ?? [];
    list.push(row);
    votesByConstituency.set(row.constituency_slug, list);
  }
}

const stationsByCode = new Map<string, Station[]>();
for (const file of readdirSync(join(STATIONS, "stations"))) {
  if (!file.endsWith(".json")) continue;
  for (const s of read<Station[]>(STATIONS, "stations", file)) {
    if (!s.hopr_constituency_code || s.latitude === null) continue;
    const list = stationsByCode.get(s.hopr_constituency_code) ?? [];
    list.push(s);
    stationsByCode.set(s.hopr_constituency_code, list);
  }
}

const stationCodesByConstituency = new Map(
  constituencies.map((c) => [c.slug, c.polling_station_codes]),
);
const regionBySlug = new Map(regions.map((r) => [r.slug, r]));

const REGION_NAMES: Record<string, string> = {
  Gambela: "Gambella",
};

const partyName = (name: string | null): string =>
  name ? name.replace(/\s*\([^)]*\)\s*$/, "") : "Independent";

const regionName = (slug: string): string => {
  const name = regionBySlug.get(slug)?.name ?? slug;
  return REGION_NAMES[name] ?? name;
};

const LOCATION_WORDS: Record<string, string> = {
  Zuriya: "Zuria",
  Ena: "ena",
};

function locationName(native: string): string {
  const parts = native.split("/").map((p) => p.trim());
  const latin = parts.filter((p) => /[A-Za-z]/.test(p));
  if (latin.length > 0) return latin.join(" / ");

  const addis = native.match(/^የምርጫ ክልል\s+(\d+)(?:\s+እና\s+(\d+))?$/);
  if (addis) {
    return addis[2]
      ? `Constituency ${addis[1]} and ${addis[2]}`
      : `Constituency ${addis[1]}`;
  }

  return transliterate(native)
    .split(" ")
    .map((w) => LOCATION_WORDS[w] ?? w)
    .join(" ");
}

function nativeLocation(native: string): string {
  const parts = native.split("/").map((p) => p.trim());
  const ethiopic = parts.filter((p) => !/[A-Za-z]/.test(p));
  return (ethiopic.length > 0 ? ethiopic : parts).join(" / ");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Coordinates {
  lat: number;
  lng: number;
  source: "polling_stations_gps" | "polling_stations_woreda";
  stations: number;
  stationsWithGps: number;
}

function locate(constituencySlug: string): Coordinates | null {
  const codes =
    overrides.stations[constituencySlug] ??
    stationCodesByConstituency.get(constituencySlug) ??
    [];
  const stations = codes.flatMap((code) => stationsByCode.get(code) ?? []);
  if (stations.length === 0) return null;

  const gps = stations.filter((s) => s.coordinate_source === "nebe");
  const sample = gps.length > 0 ? gps : stations;
  return {
    lat: Number(median(sample.map((s) => s.latitude!)).toFixed(5)),
    lng: Number(median(sample.map((s) => s.longitude!)).toFixed(5)),
    source: gps.length > 0 ? "polling_stations_gps" : "polling_stations_woreda",
    stations: stations.length,
    stationsWithGps: gps.length,
  };
}

const TITLE =
  /^(dr|eng|engr|prof|amb|ambassador|ambaasaaddar|ass|asst|deacon|sheikh|haji|hon|ato|w\/ro|w\/rt|w\/r|w\/t)\.?$/i;

function nameKey(name: string): string {
  return name
    .split(/\s+/)
    .filter((t) => !TITLE.test(t))
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/(.)\1+/g, "$1")
    .trim();
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(b.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!bFlags[j] && a[i] === b[j]) {
        aFlags[i] = bFlags[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const COMPATIBLE_REGIONS: Record<string, string[]> = {
  "South Ethiopia": ["SNNPR", "South Ethiopia"],
  "Central Ethiopia": ["SNNPR", "Central Ethiopia"],
  "South West Ethiopia": ["SNNPR", "South West Ethiopia"],
  "Benishangul-Gumuz": ["Benishangul Gumuz"],
};

const MATCH_THRESHOLD = 0.9;

function findPredecessor(
  name: string,
  region: string,
): { rep: Rep6; score: number } | null {
  const key = nameKey(name);
  if (key.split(" ").length < 2) return null;
  const allowed = COMPATIBLE_REGIONS[region] ?? [region];
  let best: { rep: Rep6; score: number } | null = null;
  for (const rep of house6) {
    if (!allowed.includes(rep.region)) continue;
    const score = jaroWinkler(key, nameKey(rep.candidate));
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { rep, score };
    }
  }
  return best;
}

interface Representative {
  region: string;
  location: string;
  locationNative: string;
  candidate: string;
  candidateNative: string;
  candidateId: string;
  constituencySlug: string;
  party: string;
  partyNative: string;
  gender: "Male" | "Female";
  education: string | null;
  disability: boolean;
  votes: number | null;
  voteShare: number | null;
  constituencyVotes: number | null;
  candidates: number | null;
  runnerUp: { candidate: string; party: string; votes: number } | null;
  lat: number;
  lng: number;
  geocodeSource: Coordinates["source"];
  stations: number;
  stationsWithGps: number;
  image: string | null;
  predecessorSlug: string | null;
}

const reps: Representative[] = [];
const problems: string[] = [];
const matches: string[] = [];

for (const row of elected) {
  const candidate = candidateById.get(row.candidate_id);
  if (!candidate) {
    problems.push(
      `no candidate record for ${row.candidate} (${row.candidate_id})`,
    );
    continue;
  }

  const coords = locate(row.constituency_slug);
  if (!coords) {
    problems.push(
      `no polling stations for ${row.constituency} (${row.constituency_slug})`,
    );
    continue;
  }

  const region = regionName(row.region_slug);
  const candidateName =
    overrides.candidate[row.candidate_id] ?? transliterate(row.candidate);
  const location =
    overrides.location[row.constituency_slug] ?? locationName(row.constituency);

  const field = (votesByConstituency.get(row.constituency_slug) ?? []).sort(
    (a, b) => (b.votes ?? 0) - (a.votes ?? 0),
  );
  const own = field.find((v) => v.candidate_id === row.candidate_id);
  const total = field.reduce((n, v) => n + (v.votes ?? 0), 0);
  const runnerUp = field.find((v) => v.candidate_id !== row.candidate_id);
  if (!own) problems.push(`no vote row for ${candidateName} (${location})`);

  const predecessor = findPredecessor(candidateName, region);
  if (predecessor) {
    matches.push(
      `${predecessor.score.toFixed(3)}  ${candidateName} [${location}, ${region}]  ↔  ${predecessor.rep.candidate} [${predecessor.rep.location}, ${predecessor.rep.region}]`,
    );
  }

  reps.push({
    region,
    location,
    locationNative: nativeLocation(row.constituency),
    candidate: candidateName,
    candidateNative: row.candidate,
    candidateId: row.candidate_id,
    constituencySlug: row.constituency_slug,
    party: partyName(row.party_name_en),
    partyNative: row.party,
    gender: candidate.gender,
    education:
      candidate.education === "Not Specified" ? null : candidate.education,
    disability: candidate.disability,
    votes: own?.votes ?? null,
    voteShare:
      own?.votes != null && total > 0
        ? Number(((own.votes / total) * 100).toFixed(1))
        : null,
    constituencyVotes: field.length > 0 ? total : null,
    candidates: field.length > 0 ? field.length : null,
    runnerUp:
      runnerUp && runnerUp.votes !== null
        ? {
            candidate: transliterate(runnerUp.candidate),
            party: partyName(runnerUp.party_name_en),
            votes: runnerUp.votes,
          }
        : null,
    lat: coords.lat,
    lng: coords.lng,
    geocodeSource: coords.source,
    stations: coords.stations,
    stationsWithGps: coords.stationsWithGps,
    image: predecessor?.rep.image ?? null,
    predecessorSlug: predecessor ? slugify(predecessor.rep.location) : null,
  });
}

const slugCounts = new Map<string, number>();
for (const rep of reps) {
  const slug = slugify(rep.location);
  slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
}
for (const [slug, count] of slugCounts) {
  if (count > 1)
    problems.push(`duplicate slug "${slug}" (${count} constituencies)`);
}

reps.sort(
  (a, b) =>
    a.region.localeCompare(b.region) || a.location.localeCompare(b.location),
);

const summary = {
  election: "7th General Election",
  published: resultsIndex.published,
  sourceUrl: resultsIndex.source_url,
  councilSeats: candidatesIndex.hopr_constituency_count,
  decidedSeats: reps.length,
};

writeFileSync(
  join(OUT_DIR, "representatives.json"),
  JSON.stringify(reps, null, 2) + "\n",
);
writeFileSync(
  join(OUT_DIR, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);

console.log(`wrote ${reps.length} representatives`);
const bySource = new Map<string, number>();
for (const r of reps)
  bySource.set(r.geocodeSource, (bySource.get(r.geocodeSource) ?? 0) + 1);
console.log("coordinates:", Object.fromEntries(bySource));
console.log(`returning members matched to the 6th House: ${matches.length}`);
for (const m of matches.sort()) console.log("  " + m);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log("  " + p);
}
