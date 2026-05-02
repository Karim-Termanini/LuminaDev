/** Extract paths from `git checkout` dirty-tree stderr (with or without our `[GIT_VCS_CHECKOUT_DIRTY]` prefix). */
export function parseCheckoutDirtyFileList(raw: string): string[] {
  const body = raw.replace(/^\[[A-Z0-9_]+\]\s*/i, '').trim()
  const m = body.match(/overwritten by checkout:\s*([\s\S]+?)\s*Please commit/is)
  if (!m) return []
  const blob = m[1].trim()
  const lines = blob.split(/\n/).flatMap((line) => {
    const t = line.replace(/^\t+/, '').trim()
    if (!t) return []
    return t.split(/\s+/).filter((p) => p.length > 0 && !p.startsWith('error:'))
  })
  return [...new Set(lines)]
}
