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
        "Find your representative in Ethiopia's House of Peoples' Representatives (HOPR). Search 471 elected members of parliament by name, region, party, or location.",
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
          label: "Search and filter all 480 representatives",
        },
        {
          src: "/screenshots/desktop-stats.png",
          type: "image/png",
          sizes: "1280x800",
          form_factor: "wide",
          label: "Statistics and seats by region",
        },
        {
          src: "/screenshots/desktop-regions.png",
          type: "image/png",
          sizes: "1280x800",
          form_factor: "wide",
          label: "Browse representatives by region",
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
          label: "Search and filter all 480 representatives",
        },
        {
          src: "/screenshots/mobile-stats.png",
          type: "image/png",
          sizes: "540x1170",
          form_factor: "narrow",
          label: "Statistics and seats by region",
        },
        {
          src: "/screenshots/mobile-regions.png",
          type: "image/png",
          sizes: "540x1170",
          form_factor: "narrow",
          label: "Browse representatives by region",
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  });
}

// https://astro.build/config
export default defineConfig({
  site: "https://rep.et",
  integrations: [
    icon(),
    sitemap({ filter: (page) => !/\/(offline|404)\/?$/.test(page) }),
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
