/* Downloads: single files, PNG renders of SVGs, and a plain (stored, uncompressed) zip for the kit. */

export function save(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

const fontCache = new Map<string, string>()

/** a woff2 as a data URI, so an SVG lockup carries its own letters */
export async function fontDataURI(url: string): Promise<string> {
  const hit = fontCache.get(url)
  if (hit) return hit
  const buf = await (await fetch(url)).arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const uri = `data:font/woff2;base64,${btoa(bin)}`
  fontCache.set(url, uri)
  return uri
}

export async function svgToPNG(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image()
  img.decoding = 'async'
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await img.decode()
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = !svg.includes('crispEdges')
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(img.src)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

/* ---------- zip (store only) ---------- */

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(d: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { name: string; data: Uint8Array | string | Blob }

export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const e of entries) {
    const data =
      typeof e.data === 'string' ? enc.encode(e.data) : e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data
    const name = enc.encode(e.name)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // utf-8 names
    local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, name, data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, dosTime, true)
    cd.setUint16(14, dosDate, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, data.length, true)
    cd.setUint32(24, data.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    const cdBytes = new Uint8Array(46 + name.length)
    cdBytes.set(new Uint8Array(cd.buffer), 0)
    cdBytes.set(name, 46)
    central.push(cdBytes)
    offset += 30 + name.length + data.length
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}
