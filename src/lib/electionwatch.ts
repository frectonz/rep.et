import type { Representative } from "./data";

const base = "https://electionwatch.et";

const partySlugs: Record<string, string> = {
  "Coalition for Ethiopian Unity": "coalition-for-ethiopian-unity-party",
};

const partiesWithPositions = new Set([
  "afar-peoples-party",
  "amhara-democratic-force-movement",
  "coalition-for-ethiopian-unity-party",
  "ethiopian-citizens-for-social-justice",
  "ethiopian-federal-democratic-unity-forum",
  "freedom-and-equality-party",
  "national-movement-of-amhara",
  "new-generation-party",
  "peace-for-ethiopia-coalition",
  "prosperity-party",
]);

export interface ExternalLink {
  label: string;
  detail: string;
  href: string;
}

const partySlug = (party: string) =>
  partySlugs[party] ??
  party
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const regionSlug = (rep: Representative) =>
  rep.constituencySlug?.split("-hopr-")[0];

export const resultsLink: ExternalLink = {
  label: "Full election results",
  detail: "Seats, winners and the closest races of the 7th General Election",
  href: `${base}/results`,
};

export const positionsLink: ExternalLink = {
  label: "Party debate positions",
  detail: "What each party argued in the televised election debates",
  href: `${base}/parties`,
};

export function partyLinks(party: string): ExternalLink[] {
  const slug = partySlug(party);
  const links: ExternalLink[] = [
    {
      label: "Election results",
      detail: "Seats won and members elected, region by region",
      href: `${base}/results/party/${slug}`,
    },
    {
      label: "Candidates",
      detail: "Everyone who stood and the seats they contested",
      href: `${base}/data/candidates/party/${slug}`,
    },
  ];
  if (partiesWithPositions.has(slug)) {
    links.push({
      label: "Debate positions",
      detail: "Positions taken in the televised election debates",
      href: `${base}/parties/${slug}`,
    });
  }
  return links;
}

export function representativeLinks(rep: Representative): ExternalLink[] {
  const region = regionSlug(rep);
  if (!rep.constituencySlug || !region) return [];
  return [
    {
      label: "Constituency result",
      detail: `Every candidate in ${rep.location} with their votes and polling stations`,
      href: `${base}/data/candidates/c/${rep.constituencySlug}`,
    },
    {
      label: `${rep.region} results`,
      detail:
        "Seats won in the region for both the House and the Regional Council",
      href: `${base}/results/region/${region}`,
    },
    {
      label: `${rep.region} polling stations`,
      detail: "Where people in the region voted",
      href: `${base}/data/polling-stations/${region}`,
    },
  ];
}
