import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";

function pwa() {
  return AstroPWA({
    registerType: "autoUpdate",
    injectRegister: "script",
    workbox: {
      globPatterns: ["offline/index.html", "manifest.webmanifest"],
      navigateFallback: undefined,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === "navigate",
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "repet-pages",
            precacheFallback: { fallbackURL: "/offline" },
          },
        },
        {
          urlPattern: ({ sameOrigin }) => sameOrigin,
          handler: "StaleWhileRevalidate",
          options: { cacheName: "repet-assets" },
        },
      ],
    },
    manifest: {
      id: "/",
      name: "rep.et — Find Your Representative",
      short_name: "rep.et",
      description:
        "Find your representative in Ethiopia's House of Peoples' Representatives (HOPR). Search elected members of parliament by name, region, party, or location.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#3d2b1f",
      theme_color: "#3d2b1f",
      lang: "en",
      categories: ["government", "education", "reference"],
      icons: [
        {
          src: "/icons/icon.svg",
          type: "image/svg+xml",
          sizes: "512x512",
          purpose: "any",
        },
        {
          src: "/icons/icon-192.png",
          type: "image/png",
          sizes: "192x192",
          purpose: "any",
        },
        {
          src: "/icons/icon-512.png",
          type: "image/png",
          sizes: "512x512",
          purpose: "any",
        },
        {
          src: "/icons/icon-maskable-512.png",
          type: "image/png",
          sizes: "512x512",
          purpose: "maskable",
        },
      ],
      screenshots: [
        {
          src: "/screenshots/desktop.png",
          type: "image/png",
          sizes: "1280x800",
          form_factor: "wide",
          label: "Home — find your representative",
        },
        {
          src: "/screenshots/desktop-parties.png",
          type: "image/png",
          sizes: "1280x800",
          form_factor: "wide",
          label: "Parliament seat distribution by party",
        },
        {
          src: "/screenshots/desktop-representatives.png",
          type: "image/png",
          sizes: "1280x800",
          form_factor: "wide",
          label: "Search and filter all representatives",
        },
        {
          src: "/screenshots/mobile.png",
          type: "image/png",
          sizes: "540x1170",
          form_factor: "narrow",
          label: "Home — find your representative",
        },
        {
          src: "/screenshots/mobile-parties.png",
          type: "image/png",
          sizes: "540x1170",
          form_factor: "narrow",
          label: "Parliament seat distribution by party",
        },
        {
          src: "/screenshots/mobile-representatives.png",
          type: "image/png",
          sizes: "540x1170",
          form_factor: "narrow",
          label: "Search and filter all representatives",
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  });
}

const representatives = (region: string, prefix = "") =>
  `${prefix}/representatives?region=${encodeURIComponent(region)}`;

const redirects = {
  "/stats": "/",
  "/regions": "/representatives",
  "/regions/addis-ababa": representatives("Addis Ababa"),
  "/regions/afar": representatives("Afar"),
  "/regions/amhara": representatives("Amhara"),
  "/regions/benishangul-gumuz": representatives("Benishangul-Gumuz"),
  "/regions/central-ethiopia": representatives("Central Ethiopia"),
  "/regions/dire-dawa": representatives("Dire Dawa"),
  "/regions/gambella": representatives("Gambella"),
  "/regions/harari": representatives("Harari"),
  "/regions/oromia": representatives("Oromia"),
  "/regions/sidama": representatives("Sidama"),
  "/regions/snnpr": representatives("SNNPR", "/6th"),
  "/regions/somali": representatives("Somali"),
};

export default defineConfig({
  site: "https://rep.et",
  redirects,
  integrations: [
    icon(),
    sitemap({
      filter: (page) =>
        !/\/(offline|404)\/?$/.test(page) &&
        !/\/(stats|regions)(\/|$)/.test(new URL(page).pathname),
    }),
    pwa(),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
