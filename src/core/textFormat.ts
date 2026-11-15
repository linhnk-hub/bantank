/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const LIST_PREFIX_RE = /^(?:[•\-*]\s*)?(?:\d{1,2}|[A-Za-z])$/;
const ABBREVIATION_END_RE = /(?:^|[\s(])(?:TP|ThS|TS|GS|PGS|Mr|Mrs|Ms|Dr|St|No|vs|VD)$/i;

/**
 * Formats multi-sentence UI copy so that any sentence-ending period (`.`) followed by
 * another sentence breaks onto a new line (`\n`). Preserves decimals (`0.8`), emails
 * (`user@gmail.com`), file extensions (`.mp4`), ellipses (`...`), abbreviations (`VD.`),
 * and leading list prefixes (`1. `, `2. `, `A. `).
 */
export function formatSentenceLineBreaks(text: string): string {
  if (!text || typeof text !== 'string' || !text.includes('.')) {
    return text;
  }

  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('.')) return line;

      let result = '';
      let cursor = 0;
      const re = /\.([)"'\]»”]*)[ \t]+(?=\S)/g;
      let match: RegExpExecArray | null;

      while ((match = re.exec(line)) !== null) {
        const dotIdx = match.index;
        const closingChars = match[1] || '';
        const prevChar = dotIdx > 0 ? line[dotIdx - 1] : '';
        const beforeDot = line.slice(0, dotIdx);
        const trimmedBeforeDot = beforeDot.trim();

        const isEllipsis = prevChar === '.';
        const isLeadingListPrefix = LIST_PREFIX_RE.test(trimmedBeforeDot);
        const isAbbreviation = ABBREVIATION_END_RE.test(beforeDot);

        if (isEllipsis || isLeadingListPrefix || isAbbreviation) {
          continue;
        }

        result += line.slice(cursor, dotIdx) + '.' + closingChars + '\n';
        cursor = dotIdx + match[0].length;
      }

      result += line.slice(cursor);
      return result;
    })
    .join('\n');
}
