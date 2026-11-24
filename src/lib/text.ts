/** Splits a string at backticks: odd parts are code. "On Linux, `/afs` is" → text, code, text. */
export function codeSpans(text: string): { code: boolean; text: string }[] {
  return text.split('`').map((part, i) => ({ code: i % 2 === 1, text: part })).filter(part => part.text !== '');
}
