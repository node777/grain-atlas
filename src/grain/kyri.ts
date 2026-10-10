// A reader for grain's line notations -- Kyri (.kyri), Brix (.brix), and the root course
// descriptor -- for the playground. It is the atlas's own light reading, not grain's parser.

export interface KyriLine { n: number; key: string; value: string; raw: string }
export interface KyriDoc { format?: string; lines: KyriLine[]; comments: number; keys: Map<string, number> }

export function parseKyri(text: string): KyriDoc {
  const lines: KyriLine[] = []
  const keys = new Map<string, number>()
  let comments = 0
  let format: string | undefined
  text.split('\n').forEach((raw, i) => {
    const t = raw.trim()
    if (!t) return
    if (t.startsWith('#') || t.startsWith('::')) { comments++; return }
    const m = /^(\S+)\s*(.*)$/.exec(t)!
    const key = m[1], value = m[2]
    if (key === 'format' && !format) format = value
    keys.set(key, (keys.get(key) ?? 0) + 1)
    lines.push({ n: i + 1, key, value, raw })
  })
  return { format, lines, comments, keys }
}
export const KYRI_SAMPLE = `# my_first_card.kyri -- a reading order of my own
format reading-card-v1
stamp 20261010.093000
voice Kyri
purpose the three doors, then the stars
read README.md
read MAP.md
read manual/grain-os/README.md
read classical-vedic-astrology/README.md
`
