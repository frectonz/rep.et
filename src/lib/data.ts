export interface Representative {
  region: string;
  location: string;
  locationNative?: string;
  candidate: string;
  candidateNative?: string;
  party: string;
  gender: string;
  education?: string;
  votes: number | null;
  voteShare?: number | null;
  constituencyVotes?: number | null;
  candidates?: number | null;
  runnerUp?: { candidate: string; party: string; votes: number } | null;
  lat: number;
  lng: number;
  slug: string;
  href: string;
  province?: string;
  county?: string;
  municipality?: string;
  borough?: string;
  district?: string;
  image?: string | null;
  position?: string;
  predecessorSlug?: string | null;
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
    if (part && part !== deduped[deduped.length - 1]) deduped.push(part);
  }
  return deduped.length > 0 ? deduped.join(", ") : null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const partySlug = slugify;

interface GenderSplit {
  male: number;
  female: number;
}

export interface RegionStats {
  name: string;
  seats: number;
  totalVotes: number;
  parties: { name: string; seats: number }[];
  genderSplit: GenderSplit;
}

export interface PartyStats {
  name: string;
  seats: number;
  totalVotes: number;
  regions: { name: string; seats: number }[];
  genderSplit: GenderSplit;
}

export interface OverallStats {
  totalSeats: number;
  totalFemale: number;
  avgVotesPerSeat: number;
  medianVotes: number;
  highestVote: Representative;
  lowestVote: Representative;
  regionStats: RegionStats[];
  partyStats: PartyStats[];
  education: { name: string; count: number }[];
  returningMembers: number;
}

export interface HouseData {
  representatives: Representative[];
  regions: string[];
  parties: string[];
  partyColors: Record<string, string>;
  getBySlug(slug: string): Representative | undefined;
  getByRegion(region: string): Representative[];
  getByParty(party: string): Representative[];
  getPartyBySlug(slug: string): string | undefined;
  getRegionStats(region: string): RegionStats;
  getPartyStats(party: string): PartyStats;
  getOverallStats(): OverallStats;
}

const KNOWN_PARTY_COLORS: Record<string, string> = {
  "Prosperity Party": "#4a7c59",
  "National Movement of Amhara": "#d4a84b",
  "Ethiopian Citizens for Social Justice": "#7b68a6",
  "Gedio People Democratic Organization": "#3d8b8b",
  "Gedeo Peoples Democratic Organization": "#3d8b8b",
  "Kucha People Democratic Party": "#c4854c",
  "Boro Democratic Party": "#a84573",
  "Gumuz People's Democratic Movement": "#d44e22",
  "Gumuz Peoples Democratic Movement": "#d44e22",
  Independent: "#2d5a7b",
};

const FALLBACK_PALETTE = [
  "#9b2c2c",
  "#2a6496",
  "#c06a30",
  "#5b7f3a",
  "#8e4a8b",
  "#1f7a8c",
  "#b5651d",
  "#6b4f9e",
  "#c2185b",
  "#00796b",
  "#8d6e63",
  "#455a64",
];

const sumVotes = (reps: Representative[]) =>
  reps.reduce((sum, r) => sum + (r.votes ?? 0), 0);

const countBy = (reps: Representative[], key: (r: Representative) => string) =>
  [
    ...reps.reduce(
      (counts, r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ]
    .map(([name, seats]) => ({ name, seats }))
    .sort((a, b) => b.seats - a.seats);

const genderSplit = (reps: Representative[]): GenderSplit => {
  const female = reps.filter((r) => r.gender === "Female").length;
  return { male: reps.length - female, female };
};

function assignPartyColors(parties: { name: string }[]) {
  const colors: Record<string, string> = {};
  let next = 0;
  for (const { name } of parties) {
    colors[name] =
      KNOWN_PARTY_COLORS[name] ??
      FALLBACK_PALETTE[next++ % FALLBACK_PALETTE.length];
  }
  return colors;
}

export function buildHouseData(representatives: Representative[]): HouseData {
  const regions = [...new Set(representatives.map((r) => r.region))].sort();
  const parties = [...new Set(representatives.map((r) => r.party))].sort();
  const partyColors = assignPartyColors(
    countBy(representatives, (r) => r.party),
  );

  const getByRegion = (region: string) =>
    representatives.filter((r) => r.region === region);
  const getByParty = (party: string) =>
    representatives.filter((r) => r.party === party);

  const getRegionStats = (region: string): RegionStats => {
    const reps = getByRegion(region);
    return {
      name: region,
      seats: reps.length,
      totalVotes: sumVotes(reps),
      parties: countBy(reps, (r) => r.party),
      genderSplit: genderSplit(reps),
    };
  };

  const getPartyStats = (party: string): PartyStats => {
    const reps = getByParty(party);
    return {
      name: party,
      seats: reps.length,
      totalVotes: sumVotes(reps),
      regions: countBy(reps, (r) => r.region),
      genderSplit: genderSplit(reps),
    };
  };

  const getOverallStats = (): OverallStats => {
    const withVotes = representatives
      .filter((r): r is Representative & { votes: number } => r.votes !== null)
      .sort((a, b) => a.votes - b.votes);
    const mid = Math.floor(withVotes.length / 2);
    const medianVotes =
      withVotes.length % 2 === 1
        ? withVotes[mid].votes
        : Math.round((withVotes[mid - 1].votes + withVotes[mid].votes) / 2);

    return {
      totalSeats: representatives.length,
      totalFemale: genderSplit(representatives).female,
      avgVotesPerSeat: Math.round(sumVotes(withVotes) / withVotes.length),
      medianVotes,
      highestVote: withVotes[withVotes.length - 1],
      lowestVote: withVotes[0],
      regionStats: regions
        .map(getRegionStats)
        .sort((a, b) => b.seats - a.seats),
      partyStats: parties.map(getPartyStats).sort((a, b) => b.seats - a.seats),
      education: countBy(
        representatives.filter((r) => r.education),
        (r) => r.education!,
      ).map(({ name, seats }) => ({ name, count: seats })),
      returningMembers: representatives.filter((r) => r.predecessorSlug).length,
    };
  };

  return {
    representatives,
    regions,
    parties,
    partyColors,
    getBySlug: (slug) => representatives.find((r) => r.slug === slug),
    getByRegion,
    getByParty,
    getPartyBySlug: (slug) => parties.find((p) => partySlug(p) === slug),
    getRegionStats,
    getPartyStats,
    getOverallStats,
  };
}
