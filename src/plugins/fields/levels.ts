// Which level of map tiles to show, which to build, and which tiles a full cache may let go.
// Kept apart from the canvases so the rules can be tested on their own.
//
// The rules, and why:
//   - The target level follows the zoom with hysteresis, so holding still (or zooming by a hair)
//     never changes it.
//   - The shown level is always complete. It stays put until the target is complete, then the
//     target takes over at once; it never steps down while it is still whole. Choosing the shown
//     level only from what is complete, never from what is merely wanted, is what keeps a frame
//     from ever mixing levels or bouncing between them.
//   - The build level climbs from just above the shown level toward the target, a level at a
//     time: each step is a quarter of the work of the next, so a long zoom sharpens steadily.
//   - Eviction never touches the tiles of the shown, target, build or fading levels. Letting a
//     full cache drop the level on screen was what made the map loop: the shown level went
//     incomplete, the view fell back to the overview, rebuilding evicted the target's tiles, and
//     round it went.

/** The level a zoom asks for. `ideal` is log2 of device pixels per world unit. A level is held
 *  until the screen would blow it up by more than a tenth, or shrink it nearly twice over. */
export function targetLevel(ideal: number, prev: number | null): number {
  if (prev !== null && ideal - prev <= 0.15 && ideal - prev >= -0.9) return prev
  return Math.ceil(ideal - 0.15)
}

/** The level to show: the complete level nearest the target (on a tie the finer, as shrinking
 *  stays crisp), else the overview, which is always kept. The level already shown is kept unless
 *  a complete level nearer the target exists, so the choice only ever moves toward the target. */
export function shownLevel(target: number, prev: number | null, base: number, complete: (z: number) => boolean): number {
  const nearest = [target, target + 1, target - 1, target + 2]
  for (let z = target - 2; z > base; z--) nearest.push(z)
  const best = nearest.find(complete) ?? base
  if (prev === null || prev === best || !complete(prev)) return best
  const off = (z: number) => Math.abs(z - target) + (z < target ? 0.5 : 0)
  return off(best) < off(prev) ? best : prev
}

/** The level to build next: the first incomplete level above the shown one, up to the target. */
export function buildLevel(target: number, shown: number, complete: (z: number) => boolean): number {
  for (let z = Math.min(shown + 1, target); z < target; z++) if (!complete(z)) return z
  return target
}

/** A least-recently-used store that can be told which keys it must keep. */
export class LruStore<T> {
  private m = new Map<string, T>()
  get size() { return this.m.size }
  has(key: string) { return this.m.has(key) }
  peek(key: string) { return this.m.get(key) }
  /** Read a value and mark it recently used. */
  use(key: string): T | undefined {
    const v = this.m.get(key)
    if (v !== undefined) { this.m.delete(key); this.m.set(key, v) }
    return v
  }
  set(key: string, v: T) { this.m.delete(key); this.m.set(key, v) }
  /** Drop least recently used values until at most `cap` remain, never one whose key `keep`
   *  holds. Returns what was dropped, for recycling. */
  evict(cap: number, keep: (key: string) => boolean): T[] {
    const out: T[] = []
    if (this.m.size <= cap) return out
    for (const [k, v] of this.m) {
      if (this.m.size <= cap) break
      if (keep(k)) continue
      this.m.delete(k)
      out.push(v)
    }
    return out
  }
  clear(): T[] {
    const out = [...this.m.values()]
    this.m.clear()
    return out
  }
}
