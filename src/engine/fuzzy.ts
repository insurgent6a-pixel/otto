// Fuzzy text helpers: task matching for duplicates and dependencies, and a fixer for misheard names.

export interface Candidate {
  id: string;
  title: string;
}

export interface Match extends Candidate {
  similarity: number;
}

export const KNOWN_NAMES = ["Sultan", "Pak Arief", "Navaho", "Sundari", "Demian", "Rumahati", "Teba", "IVG"];

const ALIASES: Record<string, string> = { dp: "down payment" };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter(Boolean)
    .flatMap((t) => (ALIASES[t] ?? t).split(" "));
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(g, c - 1);
    }
  }
  return (2 * shared) / (a.length + b.length - 2);
}

const tokenEq = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && dice(a, b) >= 0.8);

/** Sum of Dice over greedy one-to-one token pairs, so 'payment' vs 'payments' counts 0.92, not 1. */
function matchedTokens(a: string[], b: string[]): number {
  const used = new Set<number>();
  let m = 0;
  for (const x of a) {
    const j = b.findIndex((y, k) => !used.has(k) && tokenEq(x, y));
    if (j >= 0) {
      used.add(j);
      m += dice(x, b[j]);
    }
  }
  return m;
}

/** 0..1. Max of character-bigram Dice (typos) and token Dice (word order). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const chars = dice(ta.join(""), tb.join(""));
  const words = (2 * matchedTokens(ta, tb)) / (ta.length + tb.length);
  return Math.max(chars, words);
}

/** Best task for a short query. A query fully contained in a title scores 0.9 even when the title is long. */
export function findBestMatch(query: string, candidates: Candidate[]): Match | null {
  const q = tokens(query);
  let best: Match | null = null;
  let bestSim = -1;
  for (const c of candidates) {
    const sim = similarity(query, c.title);
    const coverage = q.length ? matchedTokens(q, tokens(c.title)) / q.length : 0;
    const score = Math.max(sim, coverage >= 0.9 ? 0.9 : 0.8 * coverage);
    if (score > 0 && (!best || score > best.similarity || (score === best.similarity && sim > bestSim))) {
      best = { id: c.id, title: c.title, similarity: score };
      bestSim = sim;
    }
  }
  return best;
}

/** Symmetric similarity only, so a short title doesn't claim every long task that contains it. */
export function findDuplicate(title: string, openTasks: Candidate[], threshold = 0.8): Match | null {
  let best: Match | null = null;
  for (const t of openTasks) {
    const sim = similarity(title, t.title);
    if (sim > threshold && (!best || sim > best.similarity)) best = { id: t.id, title: t.title, similarity: sim };
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const EDGE = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u;

/** Distance of a word window to a name, or null when it is not a safe match. */
function nameDistance(cores: string[], name: string): number | null {
  const n = name.toLowerCase();
  if (cores.join("") === n.replace(/ /g, "")) return 0; // 'demi an', 'i v g', 'rumah ati'
  const spaced = cores.join(" ");
  // Fuzzy only for same word count, 5+ chars and same first letter, so 'send' or 'demand' survive.
  if (cores.length !== n.split(" ").length || spaced.length < 5 || n.length < 5 || spaced[0] !== n[0]) return null;
  if (spaced.startsWith(n)) return null; // 'sultana', 'sultans' are other words
  const d = levenshtein(spaced, n);
  return d <= (n.length >= 8 ? 2 : 1) ? d : null;
}

/** Replaces misheard known names in free text: 'navajo' to 'Navaho', 'demi an' to 'Demian'. */
export function fixNames(text: string, names: string[] = KNOWN_NAMES): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let done = false;
    for (let n = 3; n >= 1 && !done; n--) {
      if (i + n > words.length) continue;
      const parts = words.slice(i, i + n).map((w) => EDGE.exec(w)!);
      const cores = parts.map((p) => p[2].toLowerCase());
      if (cores.some((c) => !c)) continue;
      // Inner punctuation means the window crosses a phrase boundary.
      if (parts.some((p, k) => (k > 0 && p[1]) || (k < n - 1 && p[3]))) continue;
      let best: { name: string; d: number } | null = null;
      for (const name of names) {
        const d = nameDistance(cores, name);
        if (d !== null && (!best || d < best.d)) best = { name, d };
      }
      if (best) {
        out.push(parts[0][1] + best.name + parts[n - 1][3]);
        i += n;
        done = true;
      }
    }
    if (!done) out.push(words[i++]);
  }
  return out.join(" ");
}
