import { createStore, useStore } from '@/core/store'

const toasts = createStore<{ list: Array<{ id: number; text: string }> }>({ list: [] })
let n = 0

export function toast(text: string, ms = 3600): void {
  const id = ++n
  toasts.set((s) => ({ list: [...s.list, { id, text }] }))
  setTimeout(() => toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms)
}

export function Toasts() {
  const list = useStore(toasts, (s) => s.list)
  if (!list.length) return null
  const t = list[list.length - 1]
  return <div className="toast" role="status">{t.text}</div>
}
