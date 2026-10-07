import * as maplibregl from "maplibre-gl";
import type { MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);

export const ETHIOPIA_CENTER: [number, number] = [39.5, 9.0];
export const ETHIOPIA_ZOOM = 5.2;

export function createMap(
  container: HTMLElement,
  options: Omit<MapOptions, "container" | "style"> = {},
) {
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
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
    maxZoom: 18,
    ...options,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  return map;
}

export { maplibregl };
