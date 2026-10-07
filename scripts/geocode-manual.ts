const dir = `${import.meta.dir}/../election-6`;

interface GeocodedEntry {
  region: string;
  location: string;
  candidate: string;
  party: string | null;
  gender: string;
  votes: number;
  lat: number | null;
  lng: number | null;
  geocode_source: string;
}

const approxMap: Record<string, [number, number, string]> = {
  Gerchech: [10.59, 39.6, "Gishe Rabel area, North Shewa"],
  Kui: [10.87, 37.73, "Bibugn area, East Gojam"],
  "Yeed Wha": [12.44, 38.67, "Dehana area, Wag Hamra"],
  Rebel: [10.59, 39.6, "Gishe Rabel area, North Shewa"],
  Qilaj: [11.1, 39.89, "Kalu area, South Wello"],
  Yechereqa: [10.2, 37.34, "Debre Elias area, East Gojam"],
  Yejuba: [10.66, 37.17, "Jabi Tehnan area, West Gojam"],
  Merawi: [11.42, 37.16, "Merawi, West Gojam"],
  "Degwa Tsyon": [11.21, 39.23, "Tenta area, South Wello"],
  Agulicho: [7.59, 39.54, "Shirka/Arsi area"],
  Harewecha: [9.08, 40.75, "Chiro Zuria area, West Hararge"],
  "Wolen Chiti": [8.79, 37.66, "Tikur Enchini area, West Shewa"],
  Lemon: [8.39, 36.91, "Limu Seka area, Jimma"],
  Belela: [6.55, 38.4, "central Sidama area"],
  Birber: [7.8, 38.01, "Misrak Azenet Berbere area, Siltie"],
};

async function main() {
  const entries: GeocodedEntry[] = await Bun.file(
    `${dir}/coordinates.json`,
  ).json();

  let applied = 0;
  for (const entry of entries) {
    if (entry.geocode_source !== "failed") continue;
    const mapping = approxMap[entry.location];
    if (mapping) {
      entry.lat = mapping[0];
      entry.lng = mapping[1];
      entry.geocode_source = "manual_approx";
      applied++;
    }
  }

  await Bun.write(
    `${dir}/coordinates.json`,
    JSON.stringify(entries, null, 2) + "\n",
  );

  const totalSuccess = entries.filter(
    (e) => e.geocode_source !== "failed",
  ).length;
  const totalFailed = entries.filter(
    (e) => e.geocode_source === "failed",
  ).length;
  const bySource: Record<string, number> = {};
  for (const e of entries) {
    bySource[e.geocode_source] = (bySource[e.geocode_source] || 0) + 1;
  }

  console.log(`Applied approx coords: ${applied}`);
  console.log(`\n=== Final Summary ===`);
  console.log(`Total: ${entries.length}`);
  console.log(
    `With coords: ${totalSuccess} (${Math.round((totalSuccess / entries.length) * 100)}%)`,
  );
  console.log(`Without coords: ${totalFailed}`);
  console.log(`\nBy source:`);
  for (const [src, count] of Object.entries(bySource).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${src}: ${count}`);
  }
}

main();
