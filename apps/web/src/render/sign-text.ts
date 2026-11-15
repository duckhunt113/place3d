// Fits a shop's name onto a sign board: one line if it fits, two if not, cut short as a last
// resort. Plain logic: measuring is passed in, so this needs no canvas and has tests.

export type SignLayout = {
  /** One or two lines of text. */
  lines: string[];
  /** Letter size in pixels. */
  sizePx: number;
};

/** Measures how wide a text is at a letter size, in pixels. */
export type Measure = (text: string, sizePx: number) => number;

/** Letter size as a share of the board's height: one line, and each of two lines. */
const ONE_LINE = 0.62;
const TWO_LINES = 0.4;
/** A single line may shrink to this share of its full size before the name is split in two. */
const SHRINK = 0.7;
/** Letters never get smaller than this share of the board's height. */
const SMALLEST = 0.26;
/** Text keeps this share of the board's width. */
const USABLE_WIDTH = 0.92;

/** The widest letter size (up to `most`) at which every line fits in `room` pixels. */
function sizeToFit(lines: string[], most: number, room: number, measure: Measure): number {
  const widest = Math.max(...lines.map((line) => measure(line, most)));
  return widest <= room ? most : (most * room) / widest;
}

/** Splits a name in two at the space nearest its middle. Undefined for a single word. */
function splitInTwo(text: string): [string, string] | undefined {
  let best: number | undefined;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") continue;
    if (best === undefined || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2)) {
      best = i;
    }
  }
  return best === undefined ? undefined : [text.slice(0, best), text.slice(best + 1)];
}

/** How a name is written on a board of the given size in pixels. */
export function layoutSignText(
  text: string,
  widthPx: number,
  heightPx: number,
  measure: Measure,
): SignLayout {
  const room = widthPx * USABLE_WIDTH;
  const oneLine = sizeToFit([text], heightPx * ONE_LINE, room, measure);
  if (oneLine >= heightPx * ONE_LINE * SHRINK) return { lines: [text], sizePx: oneLine };
  const halves = splitInTwo(text);
  if (halves) {
    const twoLines = sizeToFit(halves, heightPx * TWO_LINES, room, measure);
    // Two lines only when they come out bigger than the one squeezed line would.
    if (twoLines > oneLine) {
      if (twoLines >= heightPx * SMALLEST) return { lines: halves, sizePx: twoLines };
      // Still too long: cut each line short at the smallest size.
      const size = heightPx * SMALLEST;
      return { lines: halves.map((line) => cutToFit(line, size, room, measure)), sizePx: size };
    }
  }
  if (oneLine >= heightPx * SMALLEST) return { lines: [text], sizePx: oneLine };
  const size = heightPx * SMALLEST;
  return { lines: [cutToFit(text, size, room, measure)], sizePx: size };
}

/** Shortens a line, ending it with "…", until it fits. */
function cutToFit(line: string, sizePx: number, room: number, measure: Measure): string {
  if (measure(line, sizePx) <= room) return line;
  let kept = line;
  while (kept.length > 1 && measure(`${kept}…`, sizePx) > room) kept = kept.slice(0, -1).trimEnd();
  return `${kept}…`;
}
