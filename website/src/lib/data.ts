import rawData from "../../../election-6/coordinates.json";

export interface Representative {
  region: string;
  location: string;
  candidate: string;
  party: string;
  gender: string;
  votes: number;
  lat: number;
  lng: number;
  slug: string;
}

function generateSlug(location: string): string {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const representatives: Representative[] = (
  rawData as Omit<Representative, "slug">[]
).map((entry) => ({
  ...entry,
  party: entry.party || "Independent",
  slug: generateSlug(entry.location),
}));

export const regions = [
  ...new Set(representatives.map((r) => r.region)),
].sort();

export const parties = [...new Set(representatives.map((r) => r.party))].sort();

export function getBySlug(slug: string): Representative | undefined {
  return representatives.find((r) => r.slug === slug);
}

export function getByRegion(region: string): Representative[] {
  return representatives.filter((r) => r.region === region);
}

export function getByParty(party: string): Representative[] {
  return representatives.filter((r) => r.party === party);
}

export function regionSlug(region: string): string {
  return generateSlug(region);
}

export function getRegionBySlug(slug: string): string | undefined {
  return regions.find((r) => regionSlug(r) === slug);
}

export interface RegionStats {
  name: string;
  slug: string;
  seats: number;
  totalVotes: number;
  parties: { name: string; seats: number }[];
  genderSplit: { male: number; female: number };
}

export function getRegionStats(region: string): RegionStats {
  const reps = getByRegion(region);
  const partyCounts = new Map<string, number>();
  let male = 0;
  let female = 0;

  for (const r of reps) {
    partyCounts.set(r.party, (partyCounts.get(r.party) || 0) + 1);
    if (r.gender === "Male") male++;
    else female++;
  }

  return {
    name: region,
    slug: regionSlug(region),
    seats: reps.length,
    totalVotes: reps.reduce((sum, r) => sum + r.votes, 0),
    parties: [...partyCounts.entries()]
      .map(([name, seats]) => ({ name, seats }))
      .sort((a, b) => b.seats - a.seats),
    genderSplit: { male, female },
  };
}

export interface PartyStats {
  name: string;
  seats: number;
  totalVotes: number;
  regions: { name: string; seats: number }[];
  genderSplit: { male: number; female: number };
}

export function getPartyStats(party: string): PartyStats {
  const reps = getByParty(party);
  const regionCounts = new Map<string, number>();
  let male = 0;
  let female = 0;

  for (const r of reps) {
    regionCounts.set(r.region, (regionCounts.get(r.region) || 0) + 1);
    if (r.gender === "Male") male++;
    else female++;
  }

  return {
    name: party,
    seats: reps.length,
    totalVotes: reps.reduce((sum, r) => sum + r.votes, 0),
    regions: [...regionCounts.entries()]
      .map(([name, seats]) => ({ name, seats }))
      .sort((a, b) => b.seats - a.seats),
    genderSplit: { male, female },
  };
}

export const totalVotes = representatives.reduce((sum, r) => sum + r.votes, 0);
