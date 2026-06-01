/** Safely single-quote a value for bash -c (escapes internal single quotes). */
export function shQuote(v: string): string {
  return `'${v.replace(/'/g, `'"'"'`)}'`
}
