import { createRequire } from "node:module";
import { OGImageRoute } from "astro-og-canvas";
import { partySlug } from "../../lib/data";
import { houses } from "../../lib/houses";

interface OgPage {
  title: string;
  description: string;
}

const require = createRequire(import.meta.url);
const gelasioRegular =
  require.resolve("@fontsource/gelasio/files/gelasio-latin-400-normal.woff");
const gelasioBold =
  require.resolve("@fontsource/gelasio/files/gelasio-latin-700-normal.woff");

const entries: [string, OgPage][] = [
  [
    "about",
    {
      title: "About",
      description:
        "Your guide to Ethiopia's House of Peoples' Representatives.",
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
];

for (const house of houses) {
  const prefix = house.prefix ? `${house.prefix.slice(1)}/` : "";
  const key = (path: string) =>
    path === "" ? house.prefix.slice(1) || "index" : `${prefix}${path}`;
  const count = house.representatives.length;

  entries.push(
    [
      key(""),
      {
        title: `Find Your Representative · ${house.name}`,
        description: `Find your HOPR representative in Ethiopia. Browse ${count} members of the ${house.fullName} (${house.term}).`,
      },
    ],
    [
      key("map"),
      {
        title: `Map · ${house.name}`,
        description: `Interactive map of the ${count} constituencies of the ${house.fullName}.`,
      },
    ],
    [
      key("parties"),
      {
        title: `Parties · ${house.name}`,
        description: `Political parties in the ${house.fullName} (${house.term}).`,
      },
    ],
    [
      key("representatives"),
      {
        title: `All Representatives · ${house.name}`,
        description: `All ${count} elected members of the ${house.fullName}.`,
      },
    ],
    ...house.representatives.map((r): [string, OgPage] => [
      key(`representatives/${r.slug}`),
      {
        title: r.candidate,
        description: `${r.location} · ${r.region} · ${r.party} · ${house.name}`,
      },
    ]),
    ...house.parties.map((party): [string, OgPage] => {
      const stats = house.getPartyStats(party);
      return [
        key(`parties/${partySlug(party)}`),
        {
          title: party,
          description: `${stats.seats} seats across ${stats.regions.length} regions · ${house.fullName}`,
        },
      ];
    }),
  );
}

const pages: Record<string, OgPage> = Object.fromEntries(entries);

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
    fonts: [gelasioRegular, gelasioBold],
    font: {
      title: {
        color: [200, 150, 45],
        families: ["Gelasio"],
        weight: "Bold",
      },
      description: {
        color: [245, 240, 235],
        families: ["Gelasio"],
      },
    },
    border: {
      color: [200, 150, 45],
      width: 10,
      side: "inline-start",
    },
  }),
});
