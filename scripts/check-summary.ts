import { readdir } from "node:fs/promises";

const dir = `${import.meta.dir}/../election-6`;

interface Candidate {
  location: string;
  party: string | null;
  candidate: string;
  gender: string;
  votes: number;
}

interface SummaryResult {
  party_or_candidate: string;
  seats_won: number;
}

interface June14Results {
  constituencies_elected: number;
  results: SummaryResult[];
  recounting_constituencies: number;
  reelection_constituencies: number;
}

interface Sep30Results {
  registered_voters_voted: number;
  percent_voted: number;
  constituencies_elected: number;
  results: SummaryResult[];
  constituencies_with_complaints: number;
}

interface SummaryEntry {
  region: string;
  registered_voters: number;
  percent_voted: number;
  total_seats_hopr: number;
  results_june14: June14Results | null;
  results_sep30: Sep30Results | null;
}

const regionToFile: Record<string, string> = {
  "Addis Ababa": "addis-ababa.json",
  Afar: "afar.json",
  Amhara: "amhara.json",
  Oromia: "oromiya.json",
  Sidama: "sidama.json",
  SNNPR: "snnpr.json",
  Somali: "somaili.json",
  Harari: "harari.json",
  "Benishangul Gumuz": "benishangul.json",
  "Dire Dawa": "dire-dawa.json",
  Gambella: "gambella.json",
};

let passed = 0;
let failed = 0;

function check(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.log(`  ✗ ${description}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const summary: SummaryEntry[] = await Bun.file(`${dir}/summary.json`).json();

// Collect all regional JSON files (everything except summary.json)
const allFiles = await readdir(dir);
const regionalFiles = allFiles.filter(
  (f) => f.endsWith(".json") && f !== "summary.json",
);

// Check: every regional file has a mapping
console.log("=== Regional file coverage ===");
for (const file of regionalFiles) {
  const regionName = Object.entries(regionToFile).find(
    ([, v]) => v === file,
  )?.[0];
  check(`${file} has a known region mapping`, regionName !== undefined);
}

// Check: every summary region has a regional file
for (const entry of summary) {
  const file = regionToFile[entry.region];
  check(
    `Summary region "${entry.region}" has a regional file`,
    file !== undefined && regionalFiles.includes(file),
  );
}

// Check: regions in regional files but missing from summary
const summaryRegions = new Set(summary.map((e) => e.region));
for (const file of regionalFiles) {
  const regionName = Object.entries(regionToFile).find(
    ([, v]) => v === file,
  )?.[0];
  if (regionName && !summaryRegions.has(regionName)) {
    console.log(`  ⚠ ${file} (${regionName}) has no entry in summary`);
  }
}

// Validate each summary entry
for (const entry of summary) {
  console.log(`\n=== ${entry.region} ===`);

  const file = regionToFile[entry.region];
  if (!file) continue;

  const candidates: Candidate[] = await Bun.file(`${dir}/${file}`).json();

  // Count candidates by party
  const seatsByParty = new Map<string, number>();
  for (const c of candidates) {
    const key = c.party ?? c.candidate; // independents keyed by name
    seatsByParty.set(key, (seatsByParty.get(key) ?? 0) + 1);
  }

  // Total candidates in file
  const totalCandidates = candidates.length;

  // --- Internal summary consistency checks ---

  if (entry.results_june14) {
    const r = entry.results_june14;
    const seatsSum = r.results.reduce((s, x) => s + x.seats_won, 0);
    const expectedElected =
      seatsSum + r.recounting_constituencies + r.reelection_constituencies;

    check(
      `June 14: seats_won(${seatsSum}) + recounting(${r.recounting_constituencies}) + reelection(${r.reelection_constituencies}) = constituencies_elected(${r.constituencies_elected})`,
      expectedElected === r.constituencies_elected,
      `got ${expectedElected}`,
    );
  }

  if (entry.results_sep30) {
    const r = entry.results_sep30;
    const seatsSum = r.results.reduce((s, x) => s + x.seats_won, 0);
    const expectedElected = seatsSum + r.constituencies_with_complaints;

    check(
      `Sep 30: seats_won(${seatsSum}) + complaints(${r.constituencies_with_complaints}) = constituencies_elected(${r.constituencies_elected})`,
      expectedElected === r.constituencies_elected,
      `got ${expectedElected}`,
    );
  }

  // --- Cross-check: regional file vs summary ---

  // Total candidates should match constituencies_elected from the relevant round(s)
  // Some regions only have june14, some only sep30, some both.
  // The regional file contains the winners from whichever round(s) completed.
  const june14Seats = entry.results_june14
    ? entry.results_june14.results.reduce((s, x) => s + x.seats_won, 0)
    : 0;
  const sep30Seats = entry.results_sep30
    ? entry.results_sep30.results.reduce((s, x) => s + x.seats_won, 0)
    : 0;
  const expectedCandidates = june14Seats + sep30Seats;

  check(
    `Candidate count in file (${totalCandidates}) matches total seats_won in summary (${expectedCandidates})`,
    totalCandidates === expectedCandidates,
    `file has ${totalCandidates}, summary has ${expectedCandidates}`,
  );

  // Check per-party seat counts
  // Collect all results from both rounds, grouped by party
  const summaryByParty = new Map<string, number>();
  for (const round of [entry.results_june14, entry.results_sep30]) {
    if (!round) continue;
    for (const r of round.results) {
      // Normalize: "(Independent)" suffix means it's keyed by candidate name in the file
      let key = r.party_or_candidate;
      const indMatch = key.match(/^(.+?)\s*\(Independent\)$/);
      if (indMatch) {
        key = indMatch[1].trim();
      }
      summaryByParty.set(key, (summaryByParty.get(key) ?? 0) + r.seats_won);
    }
  }

  for (const [party, count] of seatsByParty) {
    const summaryCount = summaryByParty.get(party) ?? 0;
    check(
      `"${party}": file has ${count} seat(s), summary has ${summaryCount}`,
      count === summaryCount,
    );
  }

  // Check for parties in summary but not in file
  for (const [party, count] of summaryByParty) {
    if (!seatsByParty.has(party)) {
      check(
        `"${party}": in summary (${count} seats) but missing from file`,
        false,
      );
    }
  }
}

// Final report
console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
