import { parseVerbatim } from '@retorquere/bibtex-parser/js';

// Repair whitespace only in entry keys, keeping field values and special directives verbatim.
export function parseBibInput(input: string): ReturnType<typeof parseVerbatim> {
  const header = /@([a-z][\w-]*)\s*([({])/iy;
  let normalized = '', copied = 0, depth = 0, parentheses = 0;
  let closing = '', quoted = false, comment = false;
  for (let index = 0; index < input.length; index++) {
    const character = input.charAt(index);
    if (character === '\\') { index++; continue; }
    const outerDepth = closing === '}' ? 1 : 0;
    if (character === '%' && !quoted && !comment && depth === outerDepth) {
      const newline = input.indexOf('\n', index);
      if (newline === -1) break;
      index = newline;
      continue;
    }
    if (!closing && character === '@') {
      header.lastIndex = index;
      const match = header.exec(input);
      if (!match) continue;
      const type = match[1]!.toLowerCase();
      closing = match[2] === '{' ? '}' : ')';
      depth = closing === '}' ? 1 : 0;
      parentheses = closing === ')' ? 1 : 0;
      quoted = false;
      comment = type === 'comment';
      const start = header.lastIndex;
      if (!['comment', 'string', 'preamble'].includes(type)) {
        const end = input.indexOf(',', start);
        const key = end === -1 ? '' : input.slice(start, end);
        if (end !== -1 && !/[{}()="%@\\]/u.test(key) && /\s/u.test(key)) {
          normalized += input.slice(copied, start) + key.replace(/\s+/gu, '');
          copied = end;
        }
      }
      index = start - 1;
      continue;
    }
    if (!closing) continue;
    if (character === '"' && depth === outerDepth && !comment) quoted = !quoted;
    if (character === '{') depth++;
    else if (character === '}') depth--;
    if (closing === ')' && depth === 0 && !quoted) {
      if (character === '(') parentheses++;
      else if (character === ')') parentheses--;
    }
    if ((comment || !quoted) && depth === 0 && (closing === '}' || parentheses === 0)) {
      closing = '';
      comment = false;
    }
  }
  return parseVerbatim(normalized + input.slice(copied));
}
