import { readFileSync } from 'node:fs';
import snapshotFile from './milestones.snapshot.json' with { type: 'json' };
import { pill } from '../content/story.ts';

// The committed snapshot: { fetchedAt: 'YYYY-MM-DD', milestones: [...] } (written by tools/milestones.mjs).
const snapshot = snapshotFile as { fetchedAt: string; milestones: unknown };

export type Milestone = {
  number: number;
  title: string;
  open: boolean;
  openItems: number;
  closedItems: number;
  url: string;
};

const API = 'https://api.github.com/repos/ironafs/ironafs/milestones?state=all&sort=due_on';
const URL_PATTERN = /^https:\/\/github\.com\/ironafs\/ironafs\/milestone\/\d+$/;

/**
 * GitHub API array (or the snapshot, same shape) to Milestone[]. Throws on a missing field, a state other than
 * 'open' or 'closed', a count that is not a non-negative integer, or a foreign URL: malformed data fails the build
 * rather than publishing a false completion or an impossible count.
 */
export function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) throw new Error('milestones: expected an array');
  return raw.map((entry, index) => {
    const at = `milestones[${index}]`;
    const m = (entry ?? {}) as Record<string, unknown>;
    const need = (field: string, type: 'string' | 'number') => {
      if (typeof m[field] !== type) throw new Error(`${at}: missing or invalid ${field}`);
      return m[field];
    };
    const number = need('number', 'number') as number;
    const title = need('title', 'string') as string;
    const state = need('state', 'string') as string;
    if (state !== 'open' && state !== 'closed') throw new Error(`${at}: state must be open or closed, got ${state}`);
    const count = (field: string) => {
      const n = need(field, 'number') as number;
      if (!Number.isInteger(n) || n < 0) throw new Error(`${at}: ${field} must be a non-negative integer, got ${n}`);
      return n;
    };
    const openItems = count('open_issues');
    const closedItems = count('closed_issues');
    const url = need('html_url', 'string') as string;
    if (!URL_PATTERN.test(url)) throw new Error(`${at}: html_url must match ${URL_PATTERN}, got ${url}`);
    return { number, title, open: state === 'open', openItems, closedItems, url };
  });
}

/** "M2a: core and Linux, read-only" → "M2a"; a title that does not start with a milestone code → null. */
export function milestoneCode(title: string): string | null {
  return /^(M\d+[a-z]?)(?=:|$)/.exec(title)?.[1] ?? null;
}

/** Sort key: M2 < M2a < M2b < M3 < M10 (the number numerically, then the letter). */
function codeKey(code: string): [number, string] {
  const match = /^M(\d+)([a-z]?)$/.exec(code) as RegExpExecArray;
  return [Number(match[1]), match[2]];
}

function byCode(a: Milestone, b: Milestone): number {
  const [an, al] = codeKey(milestoneCode(a.title) as string);
  const [bn, bl] = codeKey(milestoneCode(b.title) as string);
  return an - bn || (al < bl ? -1 : al > bl ? 1 : 0) || a.number - b.number;
}

/** The milestones with a code, in code order. */
function coded(items: Milestone[]): Milestone[] {
  return items.filter(m => milestoneCode(m.title) !== null).sort(byCode);
}

/** The track: every milestone in code order; titles without a code last, in GitHub order. */
export function trackOrder(items: Milestone[]): Milestone[] {
  const unknown = items.filter(m => milestoneCode(m.title) === null).sort((a, b) => a.number - b.number);
  return [...coded(items), ...unknown];
}

/**
 * The earliest open milestone after M0, by code; when none is open, the last by code.
 * Titles without a code never count. Null when no milestone has a code.
 */
export function currentMilestone(items: Milestone[]): Milestone | null {
  const known = coded(items);
  const open = known.find(m => m.open && milestoneCode(m.title) !== 'M0');
  return open ?? known.at(-1) ?? null;
}

/** The first open milestone after `current` by code (a closed one is skipped); null at the end. */
export function nextMilestone(items: Milestone[], current: Milestone | null): Milestone | null {
  if (!current) return null;
  const known = coded(items);
  const at = known.findIndex(m => m.number === current.number);
  if (at < 0) return null;
  return known.slice(at + 1).find(m => m.open) ?? null;
}

/** The shell's `cat status` and `afs status` (scripts/shell.ts): the current milestone's code and state, the next one's code. */
export type ShellStatus = { code: string | null; open: boolean; next: string | null };

export function shellStatus(items: Milestone[]): ShellStatus {
  const current = currentMilestone(items);
  const next = nextMilestone(items, current);
  return { code: current && milestoneCode(current.title), open: current?.open ?? false, next: next && milestoneCode(next.title) };
}

/** The hero pill and the menu's status line. Plain text: Astro escapes it. */
export function statusPill(current: Milestone | null): string {
  if (!current) return pill.none;
  const code = milestoneCode(current.title);
  if (code === 'M1') return pill.m1;
  const display = code && pill.display[code];
  if (current.open && display && display.title === current.title) return `${pill.progressPrefix}${display.label}`;
  return `${current.open ? pill.nowPrefix : pill.closedPrefix}${current.title}`;
}

async function fetchRaw(fetchImpl: typeof fetch): Promise<unknown> {
  // Test hook: a path is read as if it were the API response; "unreachable" behaves as if fetch threw.
  const fixture = process.env.MILESTONES_FIXTURE;
  if (fixture === 'unreachable') throw new Error('MILESTONES_FIXTURE=unreachable');
  const timeoutMs = Number(process.env.MILESTONES_TIMEOUT_MS) || 8000;
  const signal = AbortSignal.timeout(timeoutMs);
  // Test hook: a fetch that never resolves on its own; only the timeout ends it.
  if (fixture === 'hang') {
    // AbortSignal.timeout's timer is unref'd (a real socket keeps the process alive; this stub has none), so hold a ref'd one.
    fetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        const keepAlive = setInterval(() => {}, 1000);
        init?.signal?.addEventListener('abort', () => {
          clearInterval(keepAlive);
          reject(init.signal?.reason);
        });
      });
  } else if (fixture) {
    return JSON.parse(readFileSync(fixture, 'utf8'));
  }
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetchImpl(API, { headers, signal });
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`);
  return response.json();
}

/**
 * Milestones from GitHub at build time. A failed fetch (network, HTTP status, bad JSON) falls back to the
 * committed snapshot with a warning; data that arrives but does not validate fails the build.
 */
type Loaded = { items: Milestone[]; asOf: string; fromSnapshot: boolean };
let shared: Promise<Loaded> | undefined;

/** Memoised per build (one API call, one warning) when called with the default fetch. */
export function loadMilestones(fetchImpl?: typeof fetch): Promise<Loaded> {
  if (fetchImpl) return load(fetchImpl);
  return (shared ??= load(fetch));
}

async function load(fetchImpl: typeof fetch): Promise<Loaded> {
  const asOf = new Date().toISOString().slice(0, 10);
  let raw: unknown;
  try {
    raw = await fetchRaw(fetchImpl);
  } catch (error) {
    console.warn(`milestones: GitHub fetch failed (${(error as Error).message}); using the committed snapshot`);
    return { items: parseMilestones(snapshot.milestones), asOf: snapshot.fetchedAt, fromSnapshot: true };
  }
  return { items: parseMilestones(raw), asOf, fromSnapshot: false };
}
