// Where the platforms are going (#platforms): the timeline's events and its date scale. The strings
// live in one place, story.platforms (src/content/story.ts); this module re-exports them as `timeline` and `lanes`, and
// places every event, tick and scale break by `xFor(date)`, never by hand.
import { story } from '../content/story.ts';
import type { Lane, TimelineEvent } from '../lib/types.ts';

export type { Lane, TimelineEvent };

export const lanes = story.platforms.lanes;
export const timeline: TimelineEvent[] = story.platforms.events;

/** A YYYY or YYYY-MM date in years (January is .0). */
function years(date: string): number {
  const [y, m = '1'] = date.split('-');
  return Number(y) + (Number(m) - 1) / 12;
}

/**
 * The scale's knots, [date, position]: each span is linear, and the spans with few or no sourced events are
 * compressed so the sliding track always shows events. The early events are spread out, and the two Windows events a
 * year apart (1709, 1809) each get a card's width; the gaps after Vista, after 1809 and from 2021 to 2023 are
 * compressed.
 */
const KNOTS: [string, number][] = [
  ['2005', 0], ['2007', 0.11], ['2017-10', 0.26], ['2018-10', 0.4], ['2019-10', 0.43], ['2021', 0.46], ['2024', 0.53],
  ['2026-12', 1],
];
const K = KNOTS.map(([d, x]) => [years(d), x] as const);

/** The default scale's position of `t` (in years), extended linearly past its ends by the end spans' slopes. */
function scale(t: number): number {
  let i = 1;
  while (i < K.length - 1 && t > K[i][0]) i++;
  const [t0, x0] = K[i - 1], [t1, x1] = K[i];
  return x0 + (x1 - x0) * (t - t0) / (t1 - t0);
}

/**
 * Where `date` sits on the track, from 0 (`from`) to 1 (`to`), on the compressed scale above, normalised to the
 * supplied bounds (and clamped to them).
 */
export function xFor(date: string, from = '2005', to = '2026-12'): number {
  const a = scale(years(from)), b = scale(years(to));
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (scale(years(date)) - a) / (b - a)));
}

/** The year ticks under the track: the event years before 2019 and every fifth year there; every year from 2019,
 *  except inside the compressed 2021 to 2023 span, which shows its ends and a break mark between them. */
export const ticks: string[] = (() => {
  const early = [...timeline.map(e => Math.floor(years(e.date))).filter(y => y < 2019), 2005, 2010, 2015];
  return [...new Set([...early, 2019, 2020, 2021, 2023, 2024, 2025, 2026])].sort((x, y) => x - y).map(String);
})();

/** The scale breaks on the axis ("≈"), one inside each compressed span: between the 2010 and 2015 ticks, and
 *  between the 2021 and 2023 ticks. */
export const breaks: string[] = ['2012-07', '2022-07'];
