/**
 * Converts ANSI escape codes to HTML spans for terminal output in the browser.
 * Handles common SGR (Select Graphic Rendition) codes used by Terraform and similar tools.
 */

// Match ESC [ ... m (SGR sequences). ESC = U+001B
// eslint-disable-next-line no-control-regex -- ANSI escape character required for terminal output
const ANSI_RE = /[\u001b\u001B]\[([0-9;]*)m/g;

const SGR_TO_CLASS: Record<number, string> = {
  0: '', // reset
  1: 'font-semibold', // bold
  2: 'opacity-70', // dim
  31: 'text-red-500', // red fg
  32: 'text-green-500', // green fg
  33: 'text-yellow-500', // yellow fg
  34: 'text-blue-500', // blue fg
  35: 'text-purple-500', // magenta fg
  36: 'text-cyan-500', // cyan fg
  37: 'text-foreground', // default fg
  90: 'text-muted-foreground', // bright black
  91: 'text-red-400', // bright red
  92: 'text-green-400', // bright green
  93: 'text-yellow-400', // bright yellow
  94: 'text-blue-400', // bright blue
  95: 'text-purple-400', // bright magenta
  96: 'text-cyan-400', // bright cyan
  97: 'text-foreground', // bright white
};

function parseSgr(codes: string): string[] {
  if (!codes) return [];
  const parts = codes.split(';').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  const classes: string[] = [];
  for (const code of parts) {
    const c = SGR_TO_CLASS[code];
    if (c) classes.push(c);
  }
  return classes;
}

/**
 * Splits text by ANSI codes and returns segments with their CSS classes.
 * Use this to render React elements without dangerouslySetInnerHTML.
 */
export function ansiToSegments(text: string): Array<{ text: string; className: string }> {
  const segments: Array<{ text: string; className: string }> = [];
  let lastIndex = 0;
  let currentClass = '';

  const replacer = (match: string, codes: string, index: number) => {
    const before = text.slice(lastIndex, index);
    if (before) {
      segments.push({ text: before, className: currentClass });
    }
    const classes = parseSgr(codes);
    currentClass = codes === '0' || codes === '0;0' ? '' : classes.join(' ');
    lastIndex = index + match.length;
    return match;
  };

  text.replace(ANSI_RE, replacer);

  const rest = text.slice(lastIndex);
  if (rest) {
    segments.push({ text: rest, className: currentClass });
  }

  return segments;
}
