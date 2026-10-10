// The line you would type to run a file of grain from the root of your own clone.
// grain's scripts run on your machine (Rishi and Rye compile natively); the atlas hands you the
// exact words and tells you what a good answer looks like.

export function runLine(path: string): string | null {
  if (path.endsWith('.rish')) return `rishi/bin/rishi run ${path}`
  if (path.endsWith('.rye')) return `rye run ${path}`
  if (path.endsWith('.sh')) return `sh ${path}`
  if (path.endsWith('.py')) return `python3 ${path}`
  return null
}

export function expectation(path: string): string {
  if (/_witness\.rish$/.test(path)) return 'A witness answers with one line beginning GREEN when its promise holds, and RED with the reason when it does not.'
  if (path.endsWith('.rish')) return 'A Rishi script; it prints what it says, and asserts stop it early with the message after else.'
  if (path.endsWith('.rye')) return 'A Rye program or module; many carry a selftest that ends in a GREEN line.'
  if (path.endsWith('.sh')) return 'A POSIX shell seam, kept small on purpose.'
  return ''
}
