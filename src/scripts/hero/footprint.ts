// Where a letter rests on the chip. Pure: no three.js, so a node test imports it as it is.

/**
 * The highest point of the chip's top surface under a letter's footprint (`x` ± `half`), clipped to the chip
 * (`±chipHalf`): `topAt` is sampled `samples` times across it. 0 when the footprint misses the chip.
 */
export function chipTopUnder(
  letter: { x: number; half: number },
  chipHalf: number,
  topAt: (x: number) => number,
  samples = 7,
): number {
  const left = Math.max(letter.x - letter.half, -chipHalf);
  const right = Math.min(letter.x + letter.half, chipHalf);
  if (right <= left) return 0;
  let top = 0;
  for (let k = 0; k < samples; k++) top = Math.max(top, topAt(left + ((right - left) * k) / (samples - 1)));
  return top;
}
