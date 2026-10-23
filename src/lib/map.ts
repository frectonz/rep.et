import * as maplibregl from "maplibre-gl";
import type { MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);

export const ETHIOPIA_CENTER: [number, number] = [39.5, 9.0];
export const ETHIOPIA_ZOOM = 5.2;

export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function createMap(
  container: HTMLElement,
  options: Omit<MapOptions, "container" | "style"> = {},
) {
  const isDark = isDarkMode();
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
        cartoDark: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
            "https://d.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          layout: { visibility: isDark ? "none" : "visible" },
        },
        {
          id: "cartoDark",
          type: "raster",
          source: "cartoDark",
          layout: { visibility: isDark ? "visible" : "none" },
        },
      ],
    },
    maxZoom: 18,
    ...options,
  });

  const onThemeChange = () => {
    const darkNow = isDarkMode();
    if (map.getLayer("osm")) {
      map.setLayoutProperty("osm", "visibility", darkNow ? "none" : "visible");
    }
    if (map.getLayer("cartoDark")) {
      map.setLayoutProperty(
        "cartoDark",
        "visibility",
        darkNow ? "visible" : "none",
      );
    }
  };

  window.addEventListener("theme-change", onThemeChange);
  map.on("remove", () => {
    window.removeEventListener("theme-change", onThemeChange);
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  return map;
}

export { maplibregl };
