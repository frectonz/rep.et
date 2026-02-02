import { OGImageRoute } from "astro-og-canvas";
import {
  representatives,
  regions,
  regionSlug,
  getByRegion,
  parties,
  partySlug,
  getPartyStats,
} from "../../lib/data";

const pages = Object.fromEntries([
  // Static pages
  [
    "index",
    {
      title: "rep.et — Find Your Representative",
      description:
        "Find your HOPR representative in Ethiopia. Browse 471 elected members by region, party, or location.",
    },
  ],
  [
    "about",
    {
      title: "About — rep.et",
      description:
        "About rep.et — your guide to Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "map",
    {
      title: "Map — rep.et",
      description: "Interactive map of Ethiopia's 471 elected representatives.",
    },
  ],
  [
    "parties",
    {
      title: "Parties — rep.et",
      description:
        "Political parties in Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "regions",
    {
      title: "Regions — rep.et",
      description: "Browse representatives by region across Ethiopia.",
    },
  ],
  [
    "representatives",
    {
      title: "All Representatives — rep.et",
      description:
        "All 471 elected members of Ethiopia's House of Peoples' Representatives.",
    },
  ],
  [
    "stats",
    {
      title: "Statistics — rep.et",
      description:
        "Charts and statistics about Ethiopia's House of Peoples' Representatives.",
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
    fonts: [
      "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf",
      "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf",
    ],
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
