const CONSONANTS: Record<string, string> = {
  ሀ: "h",
  ለ: "l",
  ሐ: "h",
  መ: "m",
  ሠ: "s",
  ረ: "r",
  ሰ: "s",
  ሸ: "sh",
  ቀ: "k",
  ቈ: "kw",
  ቐ: "k",
  ቘ: "kw",
  በ: "b",
  ቨ: "v",
  ተ: "t",
  ቸ: "ch",
  ኀ: "h",
  ኈ: "hw",
  ነ: "n",
  ኘ: "ny",
  አ: "",
  ከ: "k",
  ኰ: "kw",
  ኸ: "h",
  ዀ: "hw",
  ወ: "w",
  ዐ: "",
  ዘ: "z",
  ዠ: "zh",
  የ: "y",
  ደ: "d",
  ዸ: "d",
  ጀ: "j",
  ገ: "g",
  ጐ: "gw",
  ጘ: "g",
  ጠ: "t",
  ጨ: "ch",
  ጰ: "p",
  ጸ: "ts",
  ፀ: "ts",
  ፈ: "f",
  ፐ: "p",
  ፘ: "ry",
};

const FAMILIES = new Map(
  Object.entries(CONSONANTS).map(([ch, latin]) => [ch.codePointAt(0)!, latin]),
);

const LABIALISED = new Set(["ቈ", "ቘ", "ኈ", "ኰ", "ዀ", "ጐ"].map(codeOf));
const GLOTTAL = new Set(["አ", "ዐ"].map(codeOf));
const LARYNGEAL = new Set(["ሀ", "ሐ", "ኀ"].map(codeOf));

const VOWELS = ["e", "u", "i", "a", "e", null, "o", "wa"] as const;

const PUNCTUATION: Record<string, string> = {
  "፡": " ",
  "።": ".",
  "፣": ",",
  "፤": ";",
  "፥": ":",
  "፦": ":",
  "፧": "?",
  "፨": "",
};

const WORDS: Record<string, string> = {
  መሀመድ: "Mohammed",
  መሃመድ: "Mohammed",
  መሐመድ: "Mohammed",
  ሙሀመድ: "Muhammed",
  ሙሐመድ: "Muhammed",
  እብራሂም: "Ibrahim",
  ኢብራሂም: "Ibrahim",
  ሁሴን: "Hussein",
  ሑሴን: "Hussein",
};

interface Syllable {
  consonant: string;
  vowel: string | null;
  glottal: boolean;
}

function codeOf(ch: string): number {
  return ch.codePointAt(0)!;
}

function isEthiopic(code: number): boolean {
  return code >= 0x1200 && code <= 0x137f;
}

function decode(code: number): Syllable | null {
  const family = code & ~0x7;
  const consonant = FAMILIES.get(family);
  if (consonant === undefined) return null;
  const order = code & 0x7;
  const vowel = VOWELS[order];

  if (LABIALISED.has(family)) {
    return { consonant, vowel: vowel === "wa" ? "a" : vowel, glottal: false };
  }
  if (GLOTTAL.has(family)) {
    const first = order === 0 || order === 7;
    return { consonant: "", vowel: first ? "a" : vowel, glottal: true };
  }
  if (LARYNGEAL.has(family) && order === 0) {
    return { consonant, vowel: "a", glottal: false };
  }
  return { consonant, vowel, glottal: false };
}

function isSixthOrder(s: Syllable | undefined): boolean {
  return s !== undefined && s.vowel === null && !s.glottal;
}

function doublesInto(s: Syllable, next: Syllable): boolean {
  return next.consonant !== "" && s.consonant.endsWith(next.consonant[0]);
}

function clusterBreak(syllables: Syllable[], i: number): boolean {
  let start = i;
  while (start > 0 && isSixthOrder(syllables[start - 1])) start--;
  let end = i;
  while (isSixthOrder(syllables[end + 1])) end++;
  const length = end - start + 1;
  const position = i - start + 1;
  if (end === syllables.length - 1) return (length - position) % 2 === 1;
  return position % 2 === 0 && position < length;
}

function sixthOrderVowel(syllables: Syllable[], i: number): string {
  const s = syllables[i];
  const prev = syllables[i - 1];
  const next = syllables[i + 1];
  const first = i === 0;
  const last = i === syllables.length - 1;

  if (s.glottal) return first ? "e" : "";
  if (first) return s.consonant === "w" ? "u" : last ? "" : "i";
  if (last) return "";
  if (next.glottal) return "i";
  if (next.consonant === "y" && (next.vowel === "a" || next.vowel === null))
    return "i";
  if (doublesInto(s, next)) return "i";
  if (s.consonant === "y" && prev.vowel) return "";
  return clusterBreak(syllables, i) ? "i" : "";
}

function renderSyllable(syllables: Syllable[], i: number): string {
  const s = syllables[i];
  if (s.vowel !== null) return s.consonant + s.vowel;
  const prev = syllables[i - 1];
  if (s.consonant === "y" && prev?.vowel && i > 0) {
    const last = i === syllables.length - 1;
    const next = syllables[i + 1];
    if (last || !next.glottal) return "i";
  }
  return s.consonant + sixthOrderVowel(syllables, i);
}

function transliterateWord(syllables: Syllable[]): string {
  let out = "";
  for (let i = 0; i < syllables.length; i++)
    out += renderSyllable(syllables, i);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function transliterate(text: string): string {
  let out = "";
  let word: Syllable[] = [];
  let raw = "";

  const flush = () => {
    if (word.length === 0) return;
    out += WORDS[raw] ?? transliterateWord(word);
    word = [];
    raw = "";
  };

  for (const ch of text) {
    const code = codeOf(ch);
    if (!isEthiopic(code)) {
      flush();
      out += ch;
      continue;
    }
    const syllable = decode(code);
    if (syllable) {
      word.push(syllable);
      raw += ch;
      continue;
    }
    flush();
    out += PUNCTUATION[ch] ?? "";
  }
  flush();

  return out.replace(/\s+/g, " ").trim();
}
