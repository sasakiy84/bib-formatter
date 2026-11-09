export function japaneseAuthorList(value: string): string[] {
  const parts = value.split(/[,、，]\s*/);
  const japaneseFullName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+[\s　]+[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々]+$/u;
  if (parts.length > 1 && parts.every(part => japaneseFullName.test(part.trim()))) return parts.map(part => part.trim().replace(/[\s　]+/u, ', '));
  if (japaneseFullName.test(value.trim())) return [value.trim().replace(/[\s　]+/u, ', ')];
  return [value];
}
