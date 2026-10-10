#!/usr/bin/env node
// The Grain Atlas bridge: run this beside your own grain checkout and the atlas can read and
// write it, and hand tasks to Claude Code on your machine (your login, your tools, your repo).
//
//   node scripts/bridge.mjs ~/grain            # or: GRAIN_DIR=~/grain npm run bridge
//   node scripts/bridge.mjs ~/grain --port 7351
//
// Safety: listens on 127.0.0.1 only; every request must carry the token printed at start-up;
// file paths are confined to the grain directory; Claude Code runs with the permission mode
// you pass (default "acceptEdits": it may edit files in the checkout, and asks before shell
// commands outside its allow-list as Claude Code normally does in headless mode).

import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, join, relative, sep, dirname } from 'node:path'

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.BRIDGE_PORT ?? 7351)
const ROOT = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? process.env.GRAIN_DIR ?? '.')
const TOKEN = process.env.BRIDGE_TOKEN ?? randomBytes(18).toString('base64url')
const ORIGINS = (process.env.BRIDGE_ORIGINS ?? '*').split(',')
const SKIP = new Set(['.git', 'node_modules', '.zig-cache', 'zig-out', '.cache', 'dist', 'target'])

function inside(p) {
  const full = resolve(ROOT, p)
  if (full !== ROOT && !full.startsWith(ROOT + sep)) throw Object.assign(new Error('path escapes the grain directory'), { status: 400 })
  return full
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (out.length >= 40000) break
    if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(join(dir, e.name), out) }
    else if (e.isFile()) {
      const full = join(dir, e.name)
      out.push({ path: relative(ROOT, full).split(sep).join('/'), size: (await stat(full)).size })
    }
  }
  return out
}

function git(...a) {
  try { return execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim() } catch { return '' }
}

function claudeVersion() {
  try { return execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim() } catch { return null }
}

function cors(req, res) {
  const origin = req.headers.origin ?? '*'
  const allow = ORIGINS.includes('*') || ORIGINS.includes(origin) ? origin : ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allow)
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Vary', 'Origin')
}

async function body(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

const server = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end('token required'); return }
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, root: ROOT, claude: claudeVersion(), version: 'grain-atlas-bridge-1' }))
    } else if (url.pathname === '/fs/list') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(await walk(ROOT)))
    } else if (url.pathname === '/fs/read') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(await readFile(inside(url.searchParams.get('path') ?? ''), 'utf8'))
    } else if (url.pathname === '/fs/raw') {
      // bytes as they are, for images and other binary files
      res.setHeader('Content-Type', 'application/octet-stream')
      res.end(await readFile(inside(url.searchParams.get('path') ?? '')))
    } else if (url.pathname === '/fs/write' && req.method === 'POST') {
      const { path, content } = await body(req)
      const full = inside(path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, content, 'utf8')
      res.end('ok')
    } else if (url.pathname === '/git') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'), head: git('rev-parse', 'HEAD'),
        subject: git('log', '-1', '--format=%s'), status: git('status', '--short').split('\n').slice(0, 200).join('\n'),
        remote: git('remote', 'get-url', 'origin'),
      }))
    } else if (url.pathname === '/claude' && req.method === 'POST') {
      const b = await body(req)
      const cli = ['-p', String(b.prompt ?? ''), '--output-format', 'stream-json', '--verbose']
      if (b.resume) cli.push('--resume', String(b.resume))
      if (b.model) cli.push('--model', String(b.model))
      if (b.appendSystemPrompt) cli.push('--append-system-prompt', String(b.appendSystemPrompt))
      cli.push('--permission-mode', String(b.permissionMode ?? 'acceptEdits'))
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
      const child = spawn('claude', cli, { cwd: ROOT, env: process.env })
      child.stdout.on('data', (d) => res.write(d))
      child.stderr.on('data', (d) => res.write(JSON.stringify({ type: 'stderr', text: d.toString() }) + '\n'))
      child.on('error', (e) => { res.write(JSON.stringify({ type: 'error', text: e.message }) + '\n'); res.end() })
      child.on('close', (code) => { res.write(JSON.stringify({ type: 'exit', code }) + '\n'); res.end() })
      req.on('close', () => { if (!child.killed && child.exitCode === null) child.kill('SIGINT') })
    } else {
      res.writeHead(404).end('no such door')
    }
  } catch (e) {
    res.writeHead(e.status ?? 500).end(String(e.message ?? e))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`grain-atlas bridge on http://127.0.0.1:${PORT}`)
  console.log(`grain directory: ${ROOT}`)
  console.log(`claude code: ${claudeVersion() ?? 'not found on PATH (agents can still read and write files)'}`)
  console.log(`token (paste into the atlas, Settings > Versions > Bridge): ${TOKEN}`)
})
