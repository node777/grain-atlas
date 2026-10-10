#!/usr/bin/env node
// The almanac: a snapshot of the grain tree with each file's stamp, header and links, written
// to public/data/almanac.json at deploy time. The atlas runs without it (the GitHub API serves
// the tree live), but with it the whole map knows every stamp at once and spends no API calls.
//
//   npm run data:almanac                    # clones grain-ww/grain into .cache/grain
//   GRAIN_DIR=../grain npm run data:almanac # or reads an existing checkout
//   GRAIN_REPO=owner/repo GRAIN_BRANCH=main  # another grain (a fork, your own seed)

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseHeader, extractLinks, benediction } from '../src/grain/header.ts'

const REPO = process.env.GRAIN_REPO ?? 'grain-ww/grain'
const BRANCH = process.env.GRAIN_BRANCH ?? 'main'
let dir = process.env.GRAIN_DIR
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })

async function main() {
  if (!dir) {
    dir = '.cache/grain'
    if (!existsSync(join(dir, '.git'))) {
      await mkdir('.cache', { recursive: true })
      execFileSync('git', ['clone', '--depth', '1', '--branch', BRANCH, `https://github.com/${REPO}`, dir], {
        stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
      })
    } else {
      git('fetch', '--depth', '1', 'origin', BRANCH)
      git('reset', '--hard', 'FETCH_HEAD')
    }
  }
  const sha = git('rev-parse', 'HEAD').trim()
  const committed = git('log', '-1', '--format=%cI').trim()
  const subject = git('log', '-1', '--format=%s').trim()

  // mode, type, blob sha, size, path
  const rows = git('ls-tree', '-r', '-l', '--full-tree', 'HEAD').split('\n').filter(Boolean)
  const paths = []
  const files = []
  for (const row of rows) {
    const tab = row.indexOf('\t')
    const [mode, , blob, size] = row.slice(0, tab).trim().split(/\s+/)
    const path = row.slice(tab + 1)
    paths.push(path)
    files.push({ path, mode, blob, size: size === '-' ? 0 : Number(size) })
  }
  const index = new Map(paths.map((p, i) => [p, i]))
  const dirs = new Set()
  for (const p of paths) { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')) }

  const entries = []
  let stamped = 0
  for (const f of files) {
    const e = { p: f.path, s: f.size, b: f.blob.slice(0, 12) }
    if (f.mode === '120000') e.l = 1
    else if (f.mode === '160000') e.m = 1
    const isText = /\.(md|mdc|txt|kyri|brix|rish|rye|glow|brush|arbor|sh|manifest)$/i.test(f.path)
    if (isText && f.size < 2_000_000 && !e.l && !e.m) {
      const text = await readFile(join(dir, f.path), 'utf8').catch(() => '')
      if (f.path.endsWith('.md')) {
        const h = parseHeader(text)
        if (h.title) e.t = h.title.slice(0, 160)
        if (h.stampRaw) { e.st = h.stampRaw; e.sf = h.stampField }
        if (h.status) { e.r = h.status.room; e.sx = h.status.text.slice(0, 140) }
        for (const [k, key] of [['Voice', 'v'], ['Style', 'y'], ['Chapter', 'c'], ['Waymark', 'w']]) {
          if (h.fields[k]) e[key] = h.fields[k].replace(/`/g, '').slice(0, 80)
        }
        const links = extractLinks(f.path, text)
        const known = [], field = []
        for (const l of links) {
          const i = index.get(l) ?? index.get(l + '/README.md') ?? index.get(l.replace(/\/$/, '') + '/README.md')
          if (i !== undefined) known.push(i)
          else if (!dirs.has(l)) field.push(l)
        }
        if (known.length) e.k = [...new Set(known)]
        if (field.length) e.f = [...new Set(field)].slice(0, 40)
        const b = benediction(text)
        if (b) e.bn = b.slice(0, 280)
      } else {
        // code and notation files carry a version constant or a header stamp near the top
        const head = text.slice(0, 4000)
        const v = /(?:version|stamp)[^\n]{0,40}?\b(20\d{6}[.\-_]\d{6})\b/i.exec(head)
        if (v) { e.st = v[1]; e.sf = 'version' }
        const firstDoc = /^(?:\/\/!|::|#)\s*(.{8,160})$/m.exec(head)
        if (firstDoc) e.t = firstDoc[1].trim()
      }
    }
    if (e.st || /(^|\/)\d{8}[-_]\d{6}/.test(f.path)) stamped++
    entries.push(e)
  }

  const out = { format: 'grain-atlas-almanac-v1', repo: REPO, branch: BRANCH, sha, committed, subject, generated: new Date().toISOString(), entries }
  await mkdir('public/data', { recursive: true })
  await writeFile('public/data/almanac.json', JSON.stringify(out))
  console.log(`almanac: ${entries.length} entries, ${stamped} stamped, sha ${sha.slice(0, 10)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
