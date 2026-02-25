/**
 * Pretty-print text when applicable (e.g. JSON, XML).
 * Returns the formatted string or the original if formatting fails or isn't applicable.
 */
export function prettyPrint(text: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }

  if (ext === 'xml' || ext === 'html' || ext === 'htm') {
    return prettyPrintXml(text);
  }

  return text;
}

function prettyPrintXml(text: string): string {
  let formatted = '';
  let indent = 0;
  const tab = '  ';

  text
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1);
      }
      formatted += tab.repeat(indent) + trimmed + '\n';
      if (
        trimmed.startsWith('<') &&
        !trimmed.startsWith('</') &&
        !trimmed.endsWith('/>')
      ) {
        indent += 1;
      }
    });

  return formatted.trimEnd() || text;
}
