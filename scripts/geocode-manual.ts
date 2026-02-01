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

// Approximate coordinates for the last 15 entries that couldn't be found
// in any data source. These are best-effort placements based on
// regional context and transliteration analysis.
const approxMap: Record<string, [number, number, string]> = {
  // Gerchech - likely small woreda in North Shewa, Amhara
  Gerchech: [10.59, 39.6, "Gishe Rabel area, North Shewa"],
  // Kui - possibly around East Gojam
  Kui: [10.87, 37.73, "Bibugn area, East Gojam"],
  // Yeed Wha - unknown, placing in Wag Hamra based on naming pattern
  "Yeed Wha": [12.44, 38.67, "Dehana area, Wag Hamra"],
  // Rebel - possibly related to Gishe Rabel, North Shewa
  Rebel: [10.59, 39.6, "Gishe Rabel area, North Shewa"],
  // Qilaj - placing near Kalu, South Wello
  Qilaj: [11.1, 39.89, "Kalu area, South Wello"],
  // Yechereqa - likely in East Gojam
  Yechereqa: [10.2, 37.34, "Debre Elias area, East Gojam"],
  // Yejuba - likely in West Gojam
  Yejuba: [10.66, 37.17, "Jabi Tehnan area, West Gojam"],
  // Meranga - possibly near Merawi, West Gojam
  Meranga: [11.42, 37.16, "Merawi area, West Gojam"],
  // Degwa Tsyon - placing near Tenta, South Wello
  "Degwa Tsyon": [11.21, 39.23, "Tenta area, South Wello"],
  // Agulicho - placing in Arsi zone
  Agulicho: [7.59, 39.54, "Shirka/Arsi area"],
  // Harewecha - likely West Hararge
  Harewecha: [9.08, 40.75, "Chiro Zuria area, West Hararge"],
  // Wolen Chiti - likely Wuchale + Enchini compound, West Shewa
  "Wolen Chiti": [8.79, 37.66, "Tikur Enchini area, West Shewa"],
  // Lemon - possibly Limu area, Jimma
  Lemon: [8.39, 36.91, "Limu Seka area, Jimma"],
  // Belela - small area in Sidama
  Belela: [6.55, 38.4, "central Sidama area"],
  // Birber - SNNPR, possibly Azenet Berbere area, Siltie
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
