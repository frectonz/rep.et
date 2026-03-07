import rawData from "../../election-6/coordinates.json";

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
  province?: string;
  county?: string;
  municipality?: string;
  borough?: string;
  district?: string;
  image?: string;
  ministerPosition?: string;
}

export function formatPlace(rep: Representative): string | null {
  const parts = [
    rep.province,
    rep.county,
    rep.municipality,
    rep.borough,
    rep.district,
  ];
  const deduped: string[] = [];
  for (const part of parts) {
    if (part && part !== deduped[deduped.length - 1]) {
      deduped.push(part);
    }
  }
  return deduped.length > 0 ? deduped.join(", ") : null;
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

export function partySlug(party: string): string {
  return generateSlug(party);
}

export function getPartyBySlug(slug: string): string | undefined {
  return parties.find((p) => partySlug(p) === slug);
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
  slug: string;
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
    slug: partySlug(party),
    seats: reps.length,
    totalVotes: reps.reduce((sum, r) => sum + r.votes, 0),
    regions: [...regionCounts.entries()]
      .map(([name, seats]) => ({ name, seats }))
      .sort((a, b) => b.seats - a.seats),
    genderSplit: { male, female },
  };
}

export const totalVotes = representatives.reduce((sum, r) => sum + r.votes, 0);

export interface OverallStats {
  totalSeats: number;
  totalVotes: number;
  totalFemale: number;
  totalMale: number;
  avgVotesPerSeat: number;
  medianVotes: number;
  highestVote: Representative;
  lowestVote: Representative;
  regionStats: RegionStats[];
  partyStats: PartyStats[];
  femaleByParty: { name: string; female: number; total: number }[];
  femaleByRegion: { name: string; female: number; total: number }[];
}

export function getOverallStats(): OverallStats {
  const allRegionStats = regions
    .map((r) => getRegionStats(r))
    .sort((a, b) => b.seats - a.seats);

  const allPartyStats = parties
    .map((p) => getPartyStats(p))
    .sort((a, b) => b.seats - a.seats);

  const sorted = [...representatives].sort((a, b) => a.votes - b.votes);
  const mid = Math.floor(sorted.length / 2);
  const medianVotes =
    sorted.length % 2 !== 0
      ? sorted[mid].votes
      : Math.round((sorted[mid - 1].votes + sorted[mid].votes) / 2);

  const totalFemale = representatives.filter(
    (r) => r.gender === "Female",
  ).length;
  const totalMale = representatives.length - totalFemale;

  return {
    totalSeats: representatives.length,
    totalVotes,
    totalFemale,
    totalMale,
    avgVotesPerSeat: Math.round(totalVotes / representatives.length),
    medianVotes,
    highestVote: sorted[sorted.length - 1],
    lowestVote: sorted[0],
    regionStats: allRegionStats,
    partyStats: allPartyStats,
    femaleByParty: allPartyStats.map((p) => ({
      name: p.name,
      female: p.genderSplit.female,
      total: p.seats,
    })),
    femaleByRegion: allRegionStats.map((r) => ({
      name: r.name,
      female: r.genderSplit.female,
      total: r.seats,
    })),
  };
}
