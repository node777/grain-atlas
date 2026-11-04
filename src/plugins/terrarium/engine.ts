// The Terrarium's living world: a small ecosystem stepped in plain TypeScript, no DOM.
//
// Coordinates are isotropic: x is in text columns, y is in "half rows" (a text row is two y
// units), so a character cell is roughly square and distances mean the same thing both ways.
//
// The loop that keeps it alive:
//   plants shed plankton  ->  small fish and jellies eat plankton
//   you feed flakes       ->  fish eat flakes, well-fed fish raise fry (up to a ceiling)
//   uneaten flakes        ->  settle as algae on the sand (the water greens)
//   snails, crabs, stars  ->  graze the algae
// Nothing dies: a hungry creature goes sleepy and slow, and wakes when food drifts by.
//
// The first boot follows the Terrarium plan: a cold hart, the Pill, then Tally, Aurora, Mantra,
// Caravan and Steward each bring their creatures up in order. The tank forgets (RAM only) unless
// it is deliberately kept; see snapshot() and restore().

import { creatureRows, decorRows, rowsWidth } from './art'

export type SpeciesId = 'tetra' | 'angel' | 'betta' | 'puffer' | 'ray' | 'seahorse' | 'jelly' | 'angler' | 'crab' | 'snail' | 'star'
export type DecorId = 'kelp' | 'coral' | 'brain' | 'rock' | 'shell' | 'castle' | 'vent' | 'pill' | 'www' | 'app'
export type Mode = 'swim' | 'drift' | 'crawl'
export type FoodKind = 'flake' | 'plankton'

export interface Spec {
  id: SpeciesId
  name: string
  blurb: string
  mode: Mode
  speed: number            // cruising speed, units per second
  depth: [number, number]  // preferred band, 0 = surface, 1 = sand
  school?: boolean
  diet: FoodKind[]
  grazes?: boolean         // eats algae off the sand
  max: number              // most of this species the tank will raise by itself
  hunger: number           // belly lost per second
  color: string            // palette name, see render.ts
}

export const SPECIES: Record<SpeciesId, Spec> = {
  tetra:    { id: 'tetra',    name: 'Ember tetra',  blurb: 'small, quick, never alone',            mode: 'swim',  speed: 7,   depth: [0.2, 0.6],  school: true, diet: ['plankton', 'flake'], max: 12, hunger: 0.008, color: 'annatto' },
  angel:    { id: 'angel',    name: 'Angelfish',    blurb: 'tall and unhurried',                   mode: 'swim',  speed: 4,   depth: [0.3, 0.65], diet: ['flake', 'plankton'],     max: 4,  hunger: 0.006, color: 'weld' },
  betta:    { id: 'betta',    name: 'Betta',        blurb: 'a flame in a long coat',               mode: 'swim',  speed: 4.5, depth: [0.15, 0.45], diet: ['flake'],                max: 3,  hunger: 0.007, color: 'madder' },
  puffer:   { id: 'puffer',   name: 'Pufferfish',   blurb: 'round; swells when startled',          mode: 'swim',  speed: 2.8, depth: [0.4, 0.8],  diet: ['flake', 'plankton'],     max: 3,  hunger: 0.006, color: 'sage' },
  ray:      { id: 'ray',      name: 'Manta',        blurb: 'a slow wing in the middle water',      mode: 'swim',  speed: 3,   depth: [0.35, 0.7], diet: ['plankton', 'flake'],     max: 2,  hunger: 0.004, color: 'elder' },
  seahorse: { id: 'seahorse', name: 'Seahorse',     blurb: 'holds to kelp and keeps the log',      mode: 'swim',  speed: 2,   depth: [0.35, 0.8], diet: ['plankton'],              max: 4,  hunger: 0.005, color: 'gold' },
  jelly:    { id: 'jelly',    name: 'Jelly',        blurb: 'a lamp that pulses',                   mode: 'drift', speed: 2,   depth: [0.1, 0.7],  diet: ['plankton'],              max: 5,  hunger: 0.004, color: 'elder' },
  angler:   { id: 'angler',   name: 'Lantern fish', blurb: 'fishes with its own light',            mode: 'swim',  speed: 2.4, depth: [0.6, 0.92], diet: ['plankton', 'flake'],     max: 2,  hunger: 0.004, color: 'brass' },
  crab:     { id: 'crab',     name: 'Steward crab', blurb: 'walks the sand, root of the floor',    mode: 'crawl', speed: 3,   depth: [1, 1],      diet: ['flake'], grazes: true,       max: 3,  hunger: 0.005, color: 'madder' },
  snail:    { id: 'snail',    name: 'Tally snail',  blurb: 'carries a bounded budget on its back', mode: 'crawl', speed: 0.9, depth: [1, 1],      diet: ['flake'], grazes: true,       max: 5,  hunger: 0.004, color: 'sand' },
  star:     { id: 'star',     name: 'Starfish',     blurb: 'moves when nobody watches',            mode: 'crawl', speed: 0.35, depth: [1, 1],     diet: [],       grazes: true,       max: 3,  hunger: 0.003, color: 'annatto' },
}

export interface DecorSpec { id: DecorId; name: string; floats?: boolean; fixed?: boolean; max: number }
export const DECOR: Record<DecorId, DecorSpec> = {
  kelp:   { id: 'kelp',   name: 'Kelp',        max: 10 },
  coral:  { id: 'coral',  name: 'Fan coral',   max: 8 },
  brain:  { id: 'brain',  name: 'Brain coral', max: 6 },
  rock:   { id: 'rock',   name: 'Rock',        max: 8 },
  shell:  { id: 'shell',  name: 'Shell',       max: 8 },
  castle: { id: 'castle', name: 'Castle',      max: 2 },
  vent:   { id: 'vent',   name: 'Bubbler',     max: 3 },
  pill:   { id: 'pill',   name: 'The Pill',    max: 1, fixed: true },
  www:    { id: 'www',    name: 'grain-www',   max: 1, fixed: true },
  app:    { id: 'app',    name: 'Terrarium.app', floats: true, max: 1, fixed: true },
}

export interface Creature {
  id: number; kind: 'creature'; sp: SpeciesId
  x: number; y: number; vx: number; vy: number
  face: 1 | -1
  belly: number            // 0 empty .. 1 full
  age: number              // seconds; fry until FRY_SECONDS
  ph: number               // animation phase
  wa: number               // wander heading
  layCd: number            // seconds until it may raise fry again
  hold: number             // seahorse: seconds left holding a kelp stem
  startle: number          // seconds left startled (puffer swells, everyone darts)
  eatCd: number
  grabbed: boolean
}
export interface Decor {
  id: number; kind: 'decor'; d: DecorId
  x: number; y: number     // y is the bottom edge
  h: number                // rows tall (kelp)
  seed: number
  vy: number
  grabbed: boolean
}
export interface Food { id: number; k: FoodKind; x: number; y: number; vy: number; rest: number; life: number }
export interface Bubble { x: number; y: number; vy: number; ph: number }
export interface Ripple { x: number; t: number }
export type Entity = Creature | Decor

export interface World {
  t: number
  W: number; H: number
  rng: () => number
  creatures: Creature[]
  decor: Decor[]
  food: Food[]
  bubbles: Bubble[]
  ripples: Ripple[]
  algae: number            // 0 clear .. 1 bloom
  light: number            // 0 cold hart .. 1 lit (Aurora)
  boot: { t: number; stage: number } | null
  nextId: number
  dirty: boolean           // the tank changed since it was last kept
  currentX: number
}

export const MAX_CREATURES = 40
export const MAX_FOOD = 160
export const FRY_SECONDS = 45
export const FLOOR_UNITS = 4

export const BOOT_AT = [0, 1.7, 3.4, 5.1, 6.8, 8.5]
export const BOOT_END = 10.5
export const BOOT_STAGES = [
  { name: 'The Pill', line: 'A cold hart. One capsule, and nothing beneath it.' },
  { name: 'Self-compile', line: 'The capsule copies itself; the copy is identical, and scatters into plankton.' },
  { name: 'Tally', line: 'Bounded sand, bounded water. The snails carry the budget.' },
  { name: 'Aurora', line: 'The glass lights. Now the boot can be seen.' },
  { name: 'Mantra', line: 'Seahorses keep the log; bubbles rise in the order they were made.' },
  { name: 'Caravan', line: 'Steward opens the glass. Everything runs under supervision from here.' },
]

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createWorld(W: number, H: number, seed = 20261104): World {
  return {
    t: 0, W, H, rng: mulberry32(seed),
    creatures: [], decor: [], food: [], bubbles: [], ripples: [],
    algae: 0, light: 1, boot: null, nextId: 1, dirty: false, currentX: 0,
  }
}

export const floorTop = (w: World) => w.H - FLOOR_UNITS
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const rand = (w: World, a: number, b: number) => a + (b - a) * w.rng()

export const isFry = (c: Creature) => c.age < FRY_SECONDS

// ---------------------------------------------------------------- geometry

export interface Bounds { c0: number; r0: number; w: number; h: number }

export function boundsOf(w: World, e: Entity): Bounds {
  if (e.kind === 'creature') {
    const rows = creatureRows(e, w.t)
    const cw = rowsWidth(rows)
    return { c0: Math.round(e.x - cw / 2), r0: Math.round(e.y / 2 - rows.length / 2), w: cw, h: rows.length }
  }
  const rows = decorRows(e, w.t)
  const cw = rowsWidth(rows)
  return { c0: Math.round(e.x - cw / 2), r0: Math.round(e.y / 2) - rows.length, w: cw, h: rows.length }
}

/** The entity under a point (in x, y units), links and creatures before scenery. */
export function hitTest(w: World, x: number, y: number): Entity | null {
  const col = Math.floor(x), row = Math.floor(y / 2)
  const inside = (e: Entity) => {
    const b = boundsOf(w, e)
    return col >= b.c0 - 1 && col < b.c0 + b.w + 1 && row >= b.r0 && row < b.r0 + b.h
  }
  for (const d of w.decor) if ((d.d === 'www' || d.d === 'app') && inside(d)) return d
  for (let i = w.creatures.length - 1; i >= 0; i--) if (inside(w.creatures[i])) return w.creatures[i]
  for (let i = w.decor.length - 1; i >= 0; i--) if (inside(w.decor[i])) return w.decor[i]
  return null
}

// ---------------------------------------------------------------- making things

export function addCreature(w: World, sp: SpeciesId, x?: number, y?: number, opts: { fry?: boolean } = {}): Creature | null {
  if (w.creatures.length >= MAX_CREATURES) return null
  const s = SPECIES[sp]
  const ft = floorTop(w)
  const cx = x ?? rand(w, 6, Math.max(7, w.W - 6))
  const cy = y ?? (s.mode === 'crawl' ? ft : rand(w, 4 + s.depth[0] * ft, 4 + s.depth[1] * ft))
  const c: Creature = {
    id: w.nextId++, kind: 'creature', sp, x: clamp(cx, 2, w.W - 2), y: cy, vx: 0, vy: 0,
    face: w.rng() < 0.5 ? 1 : -1, belly: 0.6 + w.rng() * 0.3, age: opts.fry ? 0 : FRY_SECONDS + w.rng() * 60,
    ph: w.rng() * 10, wa: w.rng() * Math.PI * 2, layCd: 40 + w.rng() * 60, hold: 0, startle: 0, eatCd: 0, grabbed: false,
  }
  if (s.mode === 'crawl') c.y = crawlY(w, c)
  w.creatures.push(c)
  w.dirty = true
  return c
}

export function addDecor(w: World, d: DecorId, x?: number, y?: number): Decor | null {
  const spec = DECOR[d]
  if (w.decor.filter((e) => e.d === d).length >= spec.max) return null
  const e: Decor = {
    id: w.nextId++, kind: 'decor', d, x: clamp(x ?? rand(w, 8, Math.max(9, w.W - 8)), 3, w.W - 3),
    y: spec.floats ? 10 : floorTop(w), h: d === 'kelp' ? 4 + Math.floor(w.rng() * 6) : 0, seed: w.rng() * 100, vy: 0, grabbed: false,
  }
  if (y !== undefined && !spec.floats && d !== 'pill') e.y = y
  if (d === 'pill') e.y = y ?? 3
  w.decor.push(e)
  w.dirty = true
  return e
}

export function feed(w: World, x: number, y: number, n = 4): void {
  for (let i = 0; i < n; i++) {
    if (w.food.filter((f) => f.k === 'flake').length >= MAX_FOOD) break
    w.food.push({ id: w.nextId++, k: 'flake', x: clamp(x + (w.rng() - 0.5) * 5, 1, w.W - 1), y: Math.max(1, y - w.rng() * 3), vy: 2 + w.rng() * 1.5, rest: 0, life: 0 })
  }
  w.ripples.push({ x, t: 0 })
}

export function removeEntity(w: World, id: number): boolean {
  const ci = w.creatures.findIndex((c) => c.id === id)
  if (ci >= 0) { w.creatures.splice(ci, 1); w.dirty = true; return true }
  const di = w.decor.findIndex((d) => d.id === id)
  if (di >= 0 && !DECOR[w.decor[di].d].fixed) { w.decor.splice(di, 1); w.dirty = true; return true }
  return false
}

/** A boop: the creature startles; a puffer swells, the rest dart. */
export function boop(w: World, c: Creature, fromX: number): void {
  c.startle = 2.2
  const dir = c.x >= fromX ? 1 : -1
  c.vx = dir * SPECIES[c.sp].speed * 2.2
  c.vy = (w.rng() - 0.5) * 4
  w.bubbles.push({ x: c.x, y: c.y, vy: -5, ph: w.rng() * 6 }, { x: c.x + 1, y: c.y - 1, vy: -6, ph: w.rng() * 6 })
}

export function resize(w: World, W: number, H: number): void {
  if (W === w.W && H === w.H) return
  const sx = W / w.W, sy = H / w.H
  w.creatures.forEach((c) => { c.x *= sx; c.y *= sy })
  w.decor.forEach((d) => { d.x *= sx; d.y = DECOR[d.d].floats ? Math.min(d.y, H - 12) : d.d === 'pill' ? d.y * sy : H - FLOOR_UNITS })
  w.food.forEach((f) => { f.x *= sx; f.y *= sy })
  w.bubbles.forEach((b) => { b.x *= sx; b.y *= sy })
  w.W = W; w.H = H
}

// ---------------------------------------------------------------- keeping

export interface Snapshot {
  v: 1
  creatures: { s: SpeciesId; fx: number; fy: number; belly: number; age: number }[]
  decor: { d: DecorId; fx: number; fy: number; h: number; seed: number }[]
  algae: number
}

export function snapshot(w: World): Snapshot {
  return {
    v: 1,
    creatures: w.creatures.map((c) => ({ s: c.sp, fx: c.x / w.W, fy: c.y / w.H, belly: c.belly, age: c.age })),
    decor: w.decor.filter((d) => d.d !== 'pill').map((d) => ({ d: d.d, fx: d.x / w.W, fy: d.y / w.H, h: d.h, seed: d.seed })),
    algae: w.algae,
  }
}

export function restore(w: World, s: Snapshot): void {
  w.creatures = []; w.decor = []; w.food = []; w.bubbles = []; w.boot = null; w.light = 1
  w.algae = clamp(Number(s.algae) || 0, 0, 1)
  for (const d of s.decor ?? []) {
    if (!(d.d in DECOR)) continue
    const e = addDecor(w, d.d, d.fx * w.W, DECOR[d.d].floats ? undefined : d.fy * w.H)
    if (e) { e.h = d.h; e.seed = d.seed; if (!DECOR[d.d].floats) e.y = clamp(d.fy * w.H, 4, floorTop(w)) }
  }
  for (const c of s.creatures ?? []) {
    if (!(c.s in SPECIES)) continue
    const n = addCreature(w, c.s, c.fx * w.W, c.fy * w.H)
    if (n) { n.belly = clamp(c.belly, 0, 1); n.age = Math.max(0, c.age) }
  }
  ensureLinks(w)
  w.dirty = false
}

/** The two doors are part of the glass: they cannot be scooped out, and are always present. */
export function ensureLinks(w: World): void {
  if (!w.decor.some((d) => d.d === 'www')) addDecor(w, 'www', w.W * 0.78)
  if (!w.decor.some((d) => d.d === 'app')) addDecor(w, 'app', w.W * 0.62)
}

/** A roomier glass holds more of the small, social things. */
const roomy = (w: World) => clamp((w.W * w.H) / 9000, 0.8, 1.7)

export function populate(w: World): void {
  const plants: [DecorId, number][] = [['kelp', 0.07], ['kelp', 0.13], ['rock', 0.2], ['coral', 0.3], ['kelp', 0.43], ['castle', 0.5], ['brain', 0.6], ['kelp', 0.68], ['shell', 0.72], ['coral', 0.85], ['kelp', 0.92], ['vent', 0.38]]
  for (const [d, f] of plants) addDecor(w, d, f * w.W)
  const k = roomy(w)
  const crowd: [SpeciesId, number][] = [['tetra', Math.round(7 * k)], ['angel', 2], ['betta', 1], ['puffer', 1], ['ray', 1], ['seahorse', 2], ['jelly', Math.round(3 * k)], ['angler', 1], ['crab', 1], ['snail', Math.round(2 * k)], ['star', 1]]
  for (const [sp, n] of crowd) for (let i = 0; i < n; i++) addCreature(w, sp)
  ensureLinks(w)
  w.dirty = false
}

// ---------------------------------------------------------------- the first boot

export function startBoot(w: World): void {
  w.creatures = []; w.decor = []; w.food = []; w.bubbles = []; w.algae = 0
  w.light = 0.12
  w.boot = { t: 0, stage: -1 }
  w.dirty = false
}

function bootStage(w: World, stage: number): void {
  const n = (sp: SpeciesId, k: number) => { for (let i = 0; i < k; i++) addCreature(w, sp) }
  switch (stage) {
    case 0: addDecor(w, 'pill', w.W / 2, 3); break
    case 1: {
      const p = w.decor.find((d) => d.d === 'pill')
      if (p) { for (let i = 0; i < 16; i++) w.food.push({ id: w.nextId++, k: 'plankton', x: p.x + (w.rng() - 0.5) * 6, y: p.y + (w.rng() - 0.5) * 4, vy: 0, rest: 0, life: 0 }); w.decor = w.decor.filter((d) => d !== p) }
      break
    }
    case 2: {
      for (const f of [0.1, 0.45, 0.75, 0.9]) addDecor(w, 'kelp', f * w.W)
      addDecor(w, 'rock', 0.25 * w.W); addDecor(w, 'rock', 0.6 * w.W); addDecor(w, 'shell', 0.55 * w.W)
      n('snail', Math.round(2 * roomy(w))); n('star', 1); break
    }
    case 3: n('jelly', Math.round(3 * roomy(w))); n('angler', 1); addDecor(w, 'coral', 0.33 * w.W); addDecor(w, 'brain', 0.8 * w.W); break
    case 4: n('seahorse', 2); addDecor(w, 'vent', 0.4 * w.W); addDecor(w, 'castle', 0.5 * w.W); addDecor(w, 'coral', 0.88 * w.W); break
    case 5: n('tetra', Math.round(7 * roomy(w))); n('angel', 2); n('betta', 1); n('puffer', 1); n('ray', 1); n('crab', 1); ensureLinks(w); break
  }
}

export function skipBoot(w: World): void {
  if (!w.boot) return
  startBoot(w)
  populate(w)
  w.boot = null
  w.light = 1
}

// ---------------------------------------------------------------- stepping

function crawlY(w: World, c: Creature): number {
  const rows = creatureRows(c, w.t)
  return floorTop(w) - rows.length
}

function nearestFood(w: World, c: Creature, spec: Spec, radius: number): Food | null {
  let best: Food | null = null, bd = radius * radius
  for (const f of w.food) {
    if (!spec.diet.includes(f.k)) continue
    if (spec.mode === 'crawl' && f.rest <= 0) continue          // crawlers wait for it to land
    const dx = f.x - c.x, dy = (f.y - c.y) * (spec.mode === 'crawl' ? 0 : 1)
    const d = dx * dx + dy * dy
    if (d < bd) { bd = d; best = f }
  }
  return best
}

function eat(w: World, c: Creature, f: Food): void {
  const i = w.food.indexOf(f)
  if (i >= 0) w.food.splice(i, 1)
  c.belly = Math.min(1, c.belly + (f.k === 'flake' ? 0.34 : 0.12))
  c.eatCd = 0.35
  if (w.rng() < 0.25) w.bubbles.push({ x: c.x + c.face * 2, y: c.y - 1, vy: -5, ph: w.rng() * 6 })
}

function spawnFry(w: World, c: Creature, spec: Spec): void {
  if (c.layCd > 0 || c.belly < 0.9 || isFry(c)) return
  if (w.creatures.length >= MAX_CREATURES - 2 || w.algae > 0.6) return
  const kin = w.creatures.filter((o) => o.sp === c.sp)
  if (kin.length < 2 || kin.length >= spec.max) return
  c.layCd = 70 + w.rng() * 60
  c.belly -= 0.3
  addCreature(w, c.sp, c.x, c.y, { fry: true })
  for (let i = 0; i < 3; i++) w.bubbles.push({ x: c.x + (w.rng() - 0.5) * 3, y: c.y, vy: -4 - w.rng() * 3, ph: w.rng() * 6 })
}

export function step(w: World, dtRaw: number): void {
  const dt = Math.min(dtRaw, 0.05)
  w.t += dt
  w.currentX = Math.sin(w.t * 0.07) * 0.9 + Math.sin(w.t * 0.031 + 2) * 0.5
  const ft = floorTop(w)

  // the first boot
  if (w.boot) {
    w.boot.t += dt
    while (w.boot.stage + 1 < BOOT_AT.length && w.boot.t >= BOOT_AT[w.boot.stage + 1]) { w.boot.stage++; bootStage(w, w.boot.stage) }
    w.light = w.boot.stage >= 3 ? Math.min(1, w.light + dt * 0.6) : 0.12 + 0.04 * Math.min(w.boot.stage + 1, 3)
    if (w.boot.t >= BOOT_END) { w.boot = null; w.light = 1 }
  }

  // plants shed plankton
  const plants = w.decor.filter((d) => d.d === 'kelp' || d.d === 'coral' || d.d === 'brain')
  const plankton = w.food.filter((f) => f.k === 'plankton').length
  const cap = Math.min(70, 8 + plants.length * 4)
  if (plants.length && plankton < cap && w.rng() < dt * (0.35 + plants.length * 0.05) * (1 - w.algae * 0.7)) {
    const p = plants[Math.floor(w.rng() * plants.length)]
    w.food.push({ id: w.nextId++, k: 'plankton', x: p.x + (w.rng() - 0.5) * 3, y: Math.max(3, p.y - (p.h || 3) * 2), vy: 0, rest: 0, life: 0 })
  }

  // food
  for (let i = w.food.length - 1; i >= 0; i--) {
    const f = w.food[i]
    f.life += dt
    if (f.k === 'plankton') {
      f.x += (Math.sin(w.t * 0.8 + f.id) * 0.8 + w.currentX) * dt
      f.y += Math.cos(w.t * 0.6 + f.id * 1.7) * 0.6 * dt
      f.y = clamp(f.y, 2, ft - 1)
      f.x = clamp(f.x, 1, w.W - 1)
      if (f.life > 150) w.food.splice(i, 1)
    } else if (f.rest > 0) {
      f.rest -= dt
      if (f.rest <= 0) { w.algae = Math.min(1, w.algae + 0.018); w.food.splice(i, 1) }
    } else {
      f.y += f.vy * dt
      f.x += (Math.sin(w.t * 2 + f.id) * 0.9 + w.currentX * 0.5) * dt
      f.x = clamp(f.x, 1, w.W - 1)
      if (f.y >= ft - 1) { f.y = ft - 1; f.rest = 25 }
    }
  }

  // bubbles and ripples
  for (let i = w.bubbles.length - 1; i >= 0; i--) {
    const b = w.bubbles[i]
    b.y += b.vy * dt
    b.ph += dt * 3
    b.x += Math.sin(b.ph) * 0.8 * dt
    if (b.y < 0.5) w.bubbles.splice(i, 1)
  }
  if (w.bubbles.length > 140) w.bubbles.splice(0, w.bubbles.length - 140)
  for (let i = w.ripples.length - 1; i >= 0; i--) { w.ripples[i].t += dt; if (w.ripples[i].t > 1.4) w.ripples.splice(i, 1) }

  // scenery: bubblers breathe, loose things fall to the sand, the bottle rides the surface
  for (const d of w.decor) {
    const spec = DECOR[d.d]
    if (d.d === 'vent' && w.rng() < dt * 2.2) w.bubbles.push({ x: d.x + (w.rng() - 0.5), y: d.y - 2, vy: -7 - w.rng() * 3, ph: w.rng() * 6 })
    if (d.grabbed) continue
    if (spec.floats) {
      d.y = 10 + Math.sin(w.t * 0.9 + d.seed) * 0.9
      d.x = clamp(d.x + Math.sin(w.t * 0.13 + d.seed) * 0.5 * dt, 6, w.W - 6)
    } else if (d.d === 'pill') {
      d.y = Math.min(w.H * 0.5, d.y + 2.5 * dt)
      d.x += Math.sin(w.t * 1.3) * 0.6 * dt
    } else if (d.y < ft) {
      d.vy += 14 * dt
      d.y = Math.min(ft, d.y + d.vy * dt)
      if (d.y >= ft) d.vy = 0
    }
  }

  // creatures
  const list = w.creatures
  for (const c of list) {
    if (c.grabbed) continue
    const s = SPECIES[c.sp]
    c.age += dt; c.ph += dt; c.layCd -= dt; c.startle -= dt; c.eatCd -= dt
    c.belly = Math.max(0, c.belly - s.hunger * dt)
    const sleepy = c.belly < 0.08
    const fry = isFry(c)
    const speedMul = (sleepy ? 0.4 : 1) * (c.startle > 0 ? 2.2 : 1) * (fry ? 0.8 : 1)
    const cruise = s.speed * speedMul

    if (s.mode === 'crawl') {
      stepCrawler(w, c, s, dt, cruise)
      continue
    }

    let ax = 0, ay = 0
    // wander
    c.wa += (w.rng() - 0.5) * dt * 3
    ax += Math.cos(c.wa) * 0.5
    ay += Math.sin(c.wa) * 0.25
    // soft walls and the surface
    const m = 7
    if (c.x < m) ax += (m - c.x) / m * 2
    if (c.x > w.W - m) ax -= (c.x - (w.W - m)) / m * 2
    if (c.y < 5) ay += (5 - c.y) / 5 * 2
    if (c.y > ft - 4) ay -= (c.y - (ft - 4)) / 4 * 2
    // preferred depth
    const lo = 4 + s.depth[0] * (ft - 4), hi = 4 + s.depth[1] * (ft - 4)
    if (c.y < lo) ay += (lo - c.y) * 0.05
    if (c.y > hi) ay -= (c.y - hi) * 0.05
    // others
    let cx = 0, cy = 0, avx = 0, avy = 0, kin = 0
    for (const o of list) {
      if (o === c) continue
      const dx = o.x - c.x, dy = o.y - c.y
      const d2 = dx * dx + dy * dy
      if (d2 < 0.0001) continue
      if (SPECIES[o.sp].mode === 'crawl') continue
      if (d2 < 9) { const d = Math.sqrt(d2); ax -= dx / d * (3 - d) * 0.9; ay -= dy / d * (3 - d) * 0.9 }
      if (s.school && o.sp === c.sp && d2 < 200) { cx += dx; cy += dy; avx += o.vx; avy += o.vy; kin++ }
      // a manta in the water makes the small ones keep their distance
      if (o.sp === 'ray' && c.sp !== 'ray' && d2 < 40 && SPECIES[c.sp].speed > 3) { const d = Math.sqrt(d2); ax -= dx / d * 0.4; ay -= dy / d * 0.4 }
    }
    if (kin) {
      ax += (cx / kin) * 0.05 + (avx / kin - c.vx) * 0.08
      ay += (cy / kin) * 0.05 + (avy / kin - c.vy) * 0.08
    }

    // food
    let chasing = false
    if (c.belly < 0.92 && c.eatCd <= 0) {
      const f = nearestFood(w, c, s, 10 + (1 - c.belly) * 30)
      if (f) {
        const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy)
        if (d < 1.6) eat(w, c, f)
        else { ax += dx / d * 2.4; ay += dy / d * 2.4; chasing = true }
      }
    }

    if (c.sp === 'jelly') {
      stepJelly(w, c, dt, ax, ay)
    } else if (c.sp === 'seahorse') {
      stepSeahorse(w, c, s, dt, ax, ay, chasing, plants)
    } else {
      const mag = Math.hypot(ax, ay) || 1
      const want = cruise * (chasing ? 1.6 : 1)
      const k = Math.min(1, dt * 2.2)
      c.vx += (ax / mag * want * Math.min(1, mag) - c.vx) * k
      c.vy += (ay / mag * want * Math.min(1, mag) - c.vy) * k
      if (c.sp === 'ray') c.vy += Math.sin(c.ph * 0.9) * 0.5 * dt
    }
    c.x += c.vx * dt
    c.y += c.vy * dt
    const rows = creatureRows(c, w.t)
    const hw = rowsWidth(rows) / 2
    c.x = clamp(c.x, hw + 1, w.W - hw - 1)
    c.y = clamp(c.y, rows.length + 2, ft - rows.length - 1)
    if (Math.abs(c.vx) > 0.5) c.face = c.vx > 0 ? 1 : -1
    spawnFry(w, c, s)
    if (w.rng() < dt * 0.04) w.bubbles.push({ x: c.x + c.face * 2, y: c.y - 1, vy: -5, ph: w.rng() * 6 })
  }

  // algae greens the water and sand; grazers keep it down (see stepCrawler)
  w.algae = Math.max(0, w.algae - dt * 0.0006)
}

function stepJelly(w: World, c: Creature, dt: number, ax: number, ay: number): void {
  const period = 2.4
  const phase = (c.ph % period) / period
  if (phase < dt / period + 0.001) c.vy = -4.2          // the pulse
  c.vy += 1.1 * dt + ay * dt * 0.5                       // sink between pulses
  c.vx += (ax * 0.6 + w.currentX * 1.4 - c.vx) * dt * 0.8
  c.vx = clamp(c.vx, -3, 3); c.vy = clamp(c.vy, -5, 2)
}

function stepSeahorse(w: World, c: Creature, s: Spec, dt: number, ax: number, ay: number, chasing: boolean, plants: Decor[]): void {
  if (c.hold > 0) {
    c.hold -= dt
    c.vx *= 1 - Math.min(1, dt * 4); c.vy *= 1 - Math.min(1, dt * 4)
    c.y += Math.sin(c.ph * 1.3) * 0.2 * dt
    if (chasing) c.hold = 0
    return
  }
  // look for a stem to hold
  let stem: Decor | null = null, bd = 30
  for (const p of plants) {
    if (p.d !== 'kelp') continue
    const d = Math.abs(p.x - c.x)
    if (d < bd) { bd = d; stem = p }
  }
  if (stem && !chasing && w.rng() < dt * 0.15) {
    const top = stem.y - stem.h * 2
    const ty = clamp(top + 3 + w.rng() * Math.max(1, stem.h * 2 - 5), 5, stem.y - 3)
    ax += (stem.x + 1 - c.x) * 0.3; ay += (ty - c.y) * 0.3
    if (Math.abs(stem.x + 1 - c.x) < 1.5 && Math.abs(ty - c.y) < 3) c.hold = 12 + w.rng() * 25
  }
  const mag = Math.hypot(ax, ay) || 1
  const want = s.speed * (chasing ? 1.8 : 1)
  const k = Math.min(1, dt * 1.6)
  c.vx += (ax / mag * want * Math.min(1, mag) - c.vx) * k
  c.vy += (ay / mag * want * Math.min(1, mag) - c.vy) * k
  if (stem && bd < 2.2 && !chasing && c.hold <= 0 && w.rng() < dt * 0.3) c.hold = 8 + w.rng() * 20
}

function stepCrawler(w: World, c: Creature, s: Spec, dt: number, cruise: number): void {
  c.y = crawlY(w, c)
  c.hold -= dt
  let target: number | null = null
  if (c.belly < 0.95 && c.eatCd <= 0) {
    const f = nearestFood(w, c, s, 40)
    if (f) {
      if (Math.abs(f.x - c.x) < 1.4) eat(w, c, f)
      else target = f.x
    } else if (s.grazes && w.algae > 0.04 && w.rng() < dt * 0.5) {
      // graze: a little algae becomes a full belly
      w.algae = Math.max(0, w.algae - 0.012)
      c.belly = Math.min(1, c.belly + 0.05)
      c.eatCd = 0.8
    }
  }
  if (target !== null) {
    c.face = target > c.x ? 1 : -1
    c.vx = c.face * cruise * 1.4
  } else if (c.hold > 0) {
    c.vx = 0
  } else {
    if (w.rng() < dt * 0.35) { c.hold = 1 + w.rng() * 5; c.face = w.rng() < 0.5 ? 1 : -1 }
    c.vx = c.face * cruise
    if (c.x < 4) c.face = 1
    if (c.x > w.W - 4) c.face = -1
  }
  c.x = clamp(c.x + c.vx * dt, 3, w.W - 3)
  spawnFry(w, c, s)
}

// ---------------------------------------------------------------- dragging

export function grab(c: Entity): void { c.grabbed = true }
export function dragTo(w: World, e: Entity, x: number, y: number): void {
  e.x = clamp(x, 2, w.W - 2)
  if (e.kind === 'creature') {
    e.y = clamp(y, 3, floorTop(w) - 1)
    e.vx = 0; e.vy = 0
  } else {
    e.y = DECOR[e.d].floats ? clamp(y + 4, 9, floorTop(w) - 2) : clamp(y + 2, 4, floorTop(w))
    e.vy = 0
  }
  w.dirty = true
}
export function release(w: World, e: Entity, vx = 0, vy = 0): void {
  e.grabbed = false
  if (e.kind === 'creature') {
    e.vx = clamp(vx, -20, 20); e.vy = clamp(vy, -20, 20)
    if (SPECIES[e.sp].mode === 'crawl') e.y = crawlY(w, e)
  }
  w.dirty = true
}
