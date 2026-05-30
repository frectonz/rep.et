import { createRequire } from "node:module";
import { OGImageRoute } from "astro-og-canvas";
import {
  getByRegion,
  getPartyStats,
  parties,
  partySlug,
  regions,
  regionSlug,
  representatives,
} from "../../lib/data";

interface OgPage {
  title: string;
  description: string;
}

// Fonts: read from the @fontsource package at build time (no CDN fetch).
const require = createRequire(import.meta.url);
const playfairRegular =
  require.resolve("@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff");
const playfairBold =
  require.resolve("@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff");

const pages: Record<string, OgPage> = Object.fromEntries([
  // Static pages
  [
    "index",
    {
      title: "Find Your Representative",
      description:
        "Find your HOPR representative in Ethiopia. Browse 471 elected members by region, party, or location.",
    },
  ],
  [
    "about",
    {
      title: "About",
      description:
        "Your guide to Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "map",
    {
      title: "Map",
      description: "Interactive map of Ethiopia's 471 elected representatives.",
    },
  ],
  [
    "parties",
    {
      title: "Parties",
      description:
        "Political parties in Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "regions",
    {
      title: "Regions",
      description: "Browse representatives by region across Ethiopia.",
    },
  ],
  [
    "representatives",
    {
      title: "All Representatives",
      description:
        "All 471 elected members of Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "stats",
    {
      title: "Statistics",
      description:
        "Charts and statistics about Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "offline",
    {
      title: "Offline",
      description: "You are offline.",
    },
  ],
  [
    "404",
    {
      title: "Page not found",
      description: "That page doesn't exist, or it may have moved.",
    },
  ],

  // Dynamic: each representative
  ...representatives.map((r) => [
    `representatives/${r.slug}`,
    {
      title: r.candidate,
      description: `${r.location} · ${r.region} · ${r.party}`,
    },
  ]),

  // Dynamic: each region
  ...regions.map((region) => [
    `regions/${regionSlug(region)}`,
    {
      title: region,
      description: `${getByRegion(region).length} seats in ${region}`,
    },
  ]),

  // Dynamic: each party
  ...parties.map((party) => {
    const stats = getPartyStats(party);
    return [
      `parties/${partySlug(party)}`,
      {
        title: party,
        description: `${stats.seats} seats across ${stats.regions.length} regions`,
      },
    ];
  }),
]);

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "route",
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgImage: {
      path: "./src/assets/og-bg.png",
      fit: "cover",
    },
    logo: {
      path: "./src/assets/og-logo.png",
      size: [80],
    },
    padding: 70,
    fonts: [playfairRegular, playfairBold],
    font: {
      title: {
        color: [200, 150, 45],
        families: ["Playfair Display"],
        weight: "Bold",
      },
      description: {
        color: [245, 240, 235],
        families: ["Playfair Display"],
      },
    },
    border: {
      color: [200, 150, 45],
      width: 10,
      side: "inline-start",
    },
  }),
});
