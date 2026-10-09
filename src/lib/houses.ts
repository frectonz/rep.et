import raw6 from "../../election-6/coordinates.json";
import raw7 from "../../election-7/representatives.json";
import summary7 from "../../election-7/summary.json";
import positions7 from "../../election-7/positions.json";
import {
  buildHouseData,
  slugify,
  type HouseData,
  type Representative,
} from "./data";

export interface HouseInfo {
  id: "7th" | "6th";
  number: number;
  name: string;
  fullName: string;
  term: string;
  election: string;
  prefix: string;
  param: string | undefined;
  councilSeats: number;
  current: boolean;
}

export type House = HouseInfo & HouseData;

interface Raw6 {
  region: string;
  location: string;
  candidate: string;
  party: string | null;
  gender: string;
  votes: number;
  lat: number;
  lng: number;
  province?: string;
  county?: string;
  municipality?: string;
  borough?: string;
  district?: string;
  image?: string | null;
  ministerPosition?: string;
}

interface Raw7 {
  region: string;
  location: string;
  locationNative: string;
  candidate: string;
  candidateNative: string;
  candidateId: string;
  constituencySlug: string;
  party: string;
  gender: string;
  education: string | null;
  votes: number | null;
  voteShare: number | null;
  constituencyVotes: number | null;
  candidates: number | null;
  runnerUp: { candidate: string; party: string; votes: number } | null;
  lat: number;
  lng: number;
  image: string | null;
  predecessorSlug: string | null;
}

interface Position {
  candidateId: string;
  position: string;
}

const info6: HouseInfo = {
  id: "6th",
  number: 6,
  name: "6th House",
  fullName: "6th House of Peoples' Representatives",
  term: "2021 – 2026",
  election: "6th General Election",
  prefix: "/6th",
  param: "6th",
  councilSeats: 547,
  current: false,
};

const info7: HouseInfo = {
  id: "7th",
  number: 7,
  name: "7th House",
  fullName: "7th House of Peoples' Representatives",
  term: "2026 – 2031",
  election: "7th General Election",
  prefix: "",
  param: undefined,
  councilSeats: summary7.councilSeats,
  current: true,
};

const representativeHref = (info: HouseInfo, slug: string) =>
  `${info.prefix}/representatives/${slug}`;

function make6(): House {
  const reps = (raw6 as Raw6[]).map((entry): Representative => {
    const slug = slugify(entry.location);
    return {
      region: entry.region,
      location: entry.location,
      candidate: entry.candidate,
      party: entry.party || "Independent",
      gender: entry.gender,
      votes: entry.votes,
      lat: entry.lat,
      lng: entry.lng,
      slug,
      href: representativeHref(info6, slug),
      province: entry.province,
      county: entry.county,
      municipality: entry.municipality,
      borough: entry.borough,
      district: entry.district,
      image: entry.image ?? null,
      position: entry.ministerPosition,
    };
  });
  return { ...info6, ...buildHouseData(reps) };
}

function make7(): House {
  const positionById = new Map(
    (positions7.positions as Position[]).map((p) => [
      p.candidateId,
      p.position,
    ]),
  );
  const reps = (raw7 as Raw7[]).map((entry): Representative => {
    const slug = slugify(entry.location);
    return {
      region: entry.region,
      location: entry.location,
      locationNative: entry.locationNative,
      candidate: entry.candidate,
      candidateNative: entry.candidateNative,
      party: entry.party,
      gender: entry.gender,
      education: entry.education ?? undefined,
      votes: entry.votes,
      voteShare: entry.voteShare,
      constituencyVotes: entry.constituencyVotes,
      candidates: entry.candidates,
      runnerUp: entry.runnerUp,
      lat: entry.lat,
      lng: entry.lng,
      slug,
      href: representativeHref(info7, slug),
      image: entry.image,
      position: positionById.get(entry.candidateId),
      predecessorSlug: entry.predecessorSlug,
      constituencySlug: entry.constituencySlug,
    };
  });
  return { ...info7, ...buildHouseData(reps) };
}

export const house7 = make7();
export const house6 = make6();
export const houses: House[] = [house7, house6];
export const currentHouse = house7;

export function getHouse(param: string | undefined): House {
  const house = houses.find((h) => h.param === param);
  if (!house) throw new Error(`Unknown house "${param}"`);
  return house;
}

export function housePaths<P extends Record<string, string>>(
  items: (house: House) => P[],
) {
  return houses.flatMap((house) =>
    items(house).map((params) => ({
      params: { house: house.param, ...params },
    })),
  );
}

export interface RepresentativeFilters {
  q?: string;
  region?: string;
  party?: string;
  gender?: string;
  education?: string;
  votesMin?: number;
  votesMax?: number;
  office?: boolean;
  returning?: boolean;
}

export function representativesHref(
  house: House,
  filters: RepresentativeFilters = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const query = search.toString();
  return `${house.prefix}/representatives${query ? `?${query}` : ""}`;
}
