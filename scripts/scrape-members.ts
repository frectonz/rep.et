import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { basename, extname } from "node:path";

const BASE_URL = "https://www.hopr.gov.et/web/guest/members";
const PORTLET_ID =
  "com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_dyyw";
const DELTA = 20;
const MAX_PAGES = 23;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 10_000;
const PAGE_DELAY_MS = 5_000;

const CACHE_DIR = `${import.meta.dir}/../.cache/members`;
const IMAGES_DIR = `${import.meta.dir}/../.cache/members/images`;
const DETAILS_DIR = `${import.meta.dir}/../.cache/members/details`;
const OUTPUT_DIR = `${import.meta.dir}/../election-6`;

function archiveUrl(originalUrl: string): string {
  return `https://web.archive.org/web/20250814054056id_/${originalUrl}`;
}

function buildPageUrl(page: number): string {
  const params = new URLSearchParams({
    p_p_id: PORTLET_ID,
    p_p_lifecycle: "0",
    p_p_state: "normal",
    p_p_mode: "view",
    [`_${PORTLET_ID}_delta`]: String(DELTA),
    p_r_p_resetCur: "false",
    [`_${PORTLET_ID}_cur`]: String(page),
  });
  return `${BASE_URL}?${params.toString()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  retries = RETRY_COUNT,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,image/*",
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (resp.status === 429) {
        const wait = RETRY_DELAY_MS * attempt;
        console.log(
          `  Rate limited (429). Waiting ${wait / 1000}s before retry ${attempt}/${retries}...`,
        );
        await sleep(wait);
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      return resp;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = RETRY_DELAY_MS * attempt;
      console.log(
        `  Error: ${err}. Waiting ${wait / 1000}s before retry ${attempt}/${retries}...`,
      );
      await sleep(wait);
    }
  }
  throw new Error("Exhausted retries");
}

async function fetchTextWithRetry(
  url: string,
  retries = RETRY_COUNT,
): Promise<string> {
  const resp = await fetchWithRetry(url, retries);
  return resp.text();
}

// ─── Phase 1: Download list pages ─────────────────────────────────────────────

async function download() {
  mkdirSync(CACHE_DIR, { recursive: true });

  console.log("Downloading members pages from Wayback Machine...\n");

  for (let page = 1; page <= MAX_PAGES; page++) {
    const cachePath = `${CACHE_DIR}/page-${page}.html`;
    if (existsSync(cachePath)) {
      console.log(`Page ${page} already cached.`);
      continue;
    }

    const pageUrl = buildPageUrl(page);
    const url = archiveUrl(pageUrl);
    console.log(`Fetching page ${page}/${MAX_PAGES}...`);

    try {
      const html = await fetchTextWithRetry(url);

      if (html.length < 500 || html.includes("<title>429")) {
        console.log(`  Page ${page} returned an error response, stopping.`);
        break;
      }

      await Bun.write(cachePath, html);
      console.log(`  Saved (${html.length} bytes)`);
    } catch (err) {
      console.error(`  Failed page ${page}: ${err}`);
      break;
    }

    await sleep(PAGE_DELAY_MS);
  }

  console.log("\nDownload complete.");
}

// ─── Phase 2: Parse member cards ──────────────────────────────────────────────

interface Member {
  name: string;
  party: string;
  region: string;
  constituency: string;
  role: string;
  image_url: string;
  detail_url: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function parseMembersFromPage(html: string): Member[] {
  const members: Member[] = [];

  // Each member card is a <div class="card-flyer border-light"> inside an <a> tag
  // Pattern: <a href="..."><div class="card-flyer border-light">...<div class="text-container">
  //   <h6>Name</h6>
  //   <hr>
  //   <p>Party</p>
  //   <p>Region</p>
  //   <p>Constituency</p>

  // Find the MEMBERS OF THE PARLIAMENT section (portlet dyyw)
  const portletStart = html.indexOf(
    'id="p_p_id_com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_dyyw_"',
  );
  if (portletStart === -1) return members;

  // Also parse the featured sections (speaker, deputy speaker, gov whip)
  const sections = [
    { id: "speaker_current", defaultRole: "" },
    { id: "member_govwhip", defaultRole: "" },
  ];

  for (const section of sections) {
    const sectionStart = html.indexOf(`id="${section.id}"`);
    if (sectionStart === -1) continue;
    const sectionEnd = html.indexOf("</style>", sectionStart);
    const sectionHtml = html.substring(sectionStart, sectionEnd);
    const sectionMembers = extractCards(sectionHtml);
    members.push(...sectionMembers);
  }

  // Parse the main paginated member list
  const memberSectionStart = html.indexOf("MEMBERS OF THE PARLIAMENT");
  if (memberSectionStart !== -1) {
    // Find the end of the member grid (before the pagination)
    const paginationStart = html.indexOf(
      "taglib-page-iterator",
      memberSectionStart,
    );
    const memberHtml = html.substring(
      memberSectionStart,
      paginationStart !== -1 ? paginationStart : undefined,
    );
    const mainMembers = extractCards(memberHtml);
    members.push(
      ...mainMembers.map((m) => ({
        ...m,
        role: m.role || "Member",
      })),
    );
  }

  return members;
}

function extractCards(html: string): Member[] {
  const members: Member[] = [];

  // Match each card-flyer block with its parent <a> link
  const cardPattern =
    /<a\s+href="([^"]+)"[^>]*>\s*<div class="card-flyer border-light">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/a>/gi;

  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const detailUrl = decodeHtmlEntities(match[1]);
    const cardHtml = match[2];

    // Extract image
    const imgMatch = cardHtml.match(/<img\s+src="([^"]+)"\s+alt="([^"]+)"/i);
    const imageUrl = imgMatch ? decodeHtmlEntities(imgMatch[1]) : "";
    const altName = imgMatch ? cleanText(imgMatch[2]) : "";

    // Extract text-container content
    const containerMatch = cardHtml.match(
      /<div class="text-container">([\s\S]*?)<\/div>/i,
    );
    if (!containerMatch) continue;

    const container = containerMatch[1];

    // Extract role from <h4> if present (for featured members)
    const roleMatch = container.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const role = roleMatch ? cleanText(roleMatch[1]) : "";

    // Extract name from <h6>
    const nameMatch = container.match(/<h6>([\s\S]*?)<\/h6>/i);
    const name = nameMatch ? cleanText(nameMatch[1]) : altName;

    if (!name) continue;

    // Extract <p> tags (party, region, constituency)
    const paragraphs = [...container.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(
      (m) => cleanText(m[1]),
    );

    members.push({
      name,
      party: paragraphs[0] || "",
      region: paragraphs[1] || "",
      constituency: paragraphs[2] || "",
      role,
      image_url: imageUrl,
      detail_url: detailUrl,
    });
  }

  return members;
}

async function parse() {
  const files = readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });

  if (files.length === 0) {
    console.error("No cached HTML files found. Run 'download' first.");
    return;
  }

  console.log(`Parsing ${files.length} cached HTML file(s)...\n`);

  const allMembers: Member[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const html = await Bun.file(`${CACHE_DIR}/${file}`).text();
    const members = parseMembersFromPage(html);

    let newCount = 0;
    for (const member of members) {
      const key = member.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        allMembers.push(member);
        newCount++;
      }
    }

    console.log(
      `  ${file}: found ${members.length} entries, ${newCount} new (total: ${allMembers.length})`,
    );
  }

  console.log(`\nTotal unique members: ${allMembers.length}`);

  const outputPath = `${CACHE_DIR}/members.json`;
  await Bun.write(outputPath, JSON.stringify(allMembers, null, 2));
  console.log(`Written to ${outputPath}`);

  // Print summary by region
  const byRegion = new Map<string, number>();
  for (const m of allMembers) {
    byRegion.set(m.region, (byRegion.get(m.region) || 0) + 1);
  }
  console.log("\nMembers by region:");
  for (const [region, count] of [...byRegion.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${region || "(no region)"}: ${count}`);
  }
}

// ─── Phase 3: Download images ─────────────────────────────────────────────────

async function downloadImages() {
  mkdirSync(IMAGES_DIR, { recursive: true });

  const membersPath = `${CACHE_DIR}/members.json`;
  if (!existsSync(membersPath)) {
    console.error("No members.json found. Run 'parse' first.");
    return;
  }

  const members: Member[] = await Bun.file(membersPath).json();
  console.log(`Downloading images for ${members.length} members...\n`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    if (!member.image_url) {
      skipped++;
      continue;
    }

    // Create a safe filename from the member name
    const safeName = member.name
      .replace(/[^a-zA-Z0-9\u1200-\u137F]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    // Get the file extension from the URL
    const urlPath = new URL(member.image_url).pathname;
    const ext = extname(urlPath).split("?")[0] || ".jpg";
    const filename = `${safeName}${ext}`;
    const filePath = `${IMAGES_DIR}/${filename}`;

    if (existsSync(filePath)) {
      skipped++;
      continue;
    }

    const archiveImageUrl = archiveUrl(member.image_url);
    console.log(`  [${i + 1}/${members.length}] ${member.name}...`);

    try {
      const resp = await fetchWithRetry(archiveImageUrl);
      const buffer = await resp.arrayBuffer();
      await Bun.write(filePath, buffer);
      downloaded++;

      // Update member with local image path
      member.image_url = `images/${filename}`;
    } catch (err) {
      console.error(`    Failed: ${err}`);
      failed++;
    }

    // Small delay between image downloads
    await sleep(1_000);
  }

  // Save updated members with local image paths
  await Bun.write(membersPath, JSON.stringify(members, null, 2));

  console.log(
    `\nImages: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`,
  );
}

// ─── Phase 4: Download and parse detail pages ─────────────────────────────────

async function downloadDetails() {
  mkdirSync(DETAILS_DIR, { recursive: true });

  const membersPath = `${CACHE_DIR}/members.json`;
  if (!existsSync(membersPath)) {
    console.error("No members.json found. Run 'parse' first.");
    return;
  }

  const members: Member[] = await Bun.file(membersPath).json();
  console.log(`Downloading detail pages for ${members.length} members...\n`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    if (!member.detail_url) {
      skipped++;
      continue;
    }

    const safeName = member.name
      .replace(/[^a-zA-Z0-9\u1200-\u137F]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const filePath = `${DETAILS_DIR}/${safeName}.html`;

    if (existsSync(filePath)) {
      skipped++;
      continue;
    }

    const archiveDetailUrl = archiveUrl(member.detail_url);
    console.log(`  [${i + 1}/${members.length}] ${member.name}...`);

    try {
      const html = await fetchTextWithRetry(archiveDetailUrl);

      if (html.length < 500 || html.includes("<title>429")) {
        console.log(`    Got error page, skipping.`);
        failed++;
        continue;
      }

      await Bun.write(filePath, html);
      downloaded++;
    } catch (err) {
      console.error(`    Failed: ${err}`);
      failed++;
    }

    await sleep(PAGE_DELAY_MS);
  }

  console.log(
    `\nDetail pages: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`,
  );
}

async function parseDetails() {
  const membersPath = `${CACHE_DIR}/members.json`;
  if (!existsSync(membersPath)) {
    console.error("No members.json found. Run 'parse' first.");
    return;
  }

  const members: Member[] = await Bun.file(membersPath).json();
  const detailFiles = readdirSync(DETAILS_DIR).filter((f) =>
    f.endsWith(".html"),
  );

  console.log(`Parsing ${detailFiles.length} detail pages for extra data...\n`);

  // Build a lookup from safe name to member
  const nameToMember = new Map<string, Member>();
  for (const member of members) {
    const safeName = member.name
      .replace(/[^a-zA-Z0-9\u1200-\u137F]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    nameToMember.set(safeName, member);
  }

  let enriched = 0;
  for (const file of detailFiles) {
    const safeName = file.replace(".html", "");
    const member = nameToMember.get(safeName);
    if (!member) continue;

    const html = await Bun.file(`${DETAILS_DIR}/${file}`).text();

    // Extract additional info from the detail page
    // Look for a profile section with more details
    const extraData = parseDetailPage(html);
    if (extraData) {
      Object.assign(member, extraData);
      enriched++;
    }
  }

  console.log(`Enriched ${enriched} members with detail page data.`);

  await Bun.write(membersPath, JSON.stringify(members, null, 2));
  console.log(`Updated ${membersPath}`);
}

function parseDetailPage(html: string): Record<string, string> | null {
  const data: Record<string, string> = {};

  // Look for the detail content area
  // The detail page likely has a similar card-flyer structure but with more info
  const containerMatch = html.match(
    /<div class="text-container">([\s\S]*?)<\/div>/i,
  );
  if (!containerMatch) return null;

  const container = containerMatch[1];

  // Extract all paragraphs as key-value pairs or just values
  const paragraphs = [...container.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((m) =>
    cleanText(m[1]),
  );

  // Try to extract structured data from the detail page
  // Common patterns: "Label: Value" or just values in order
  for (const p of paragraphs) {
    const kvMatch = p.match(/^(.+?):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      data[`detail_${key}`] = kvMatch[2].trim();
    }
  }

  // Also look for any additional structured content outside text-container
  const bioMatch = html.match(
    /<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (bioMatch) {
    data.bio = cleanText(bioMatch[1]);
  }

  // Look for any additional text blocks
  const contentMatch = html.match(
    /<div[^>]*class="[^"]*journal-content-article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (contentMatch) {
    data.content = cleanText(contentMatch[1]);
  }

  return Object.keys(data).length > 0 ? data : null;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const command = process.argv[2] || "help";

switch (command) {
  case "download":
    await download();
    break;
  case "parse":
    await parse();
    break;
  case "download-images":
    await downloadImages();
    break;
  case "download-details":
    await downloadDetails();
    break;
  case "parse-details":
    await parseDetails();
    break;
  case "all":
    await download();
    await parse();
    await downloadImages();
    await downloadDetails();
    await parseDetails();
    break;
  default:
    console.log(`Usage: bun run scrape-members.ts <command>

Commands:
  download          Fetch paginated list pages from the Wayback Machine
  parse             Parse downloaded HTML and extract member data to JSON
  download-images   Download member photos from the Wayback Machine
  download-details  Download individual member detail pages
  parse-details     Parse detail pages for additional data
  all               Run all phases sequentially
`);
}
