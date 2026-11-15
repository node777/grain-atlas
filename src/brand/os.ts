/* The three interface sketches. Plain HTML, so the tuning dock reaches every pixel of them. */

type Ink = { grain: (size: number) => string; pixel: (size: number) => string; upright: (size: number) => string }

const bar = (ink: Ink, name: string, mid: string, right: string) => `
  <div class="os-bar console">
    <span class="os-brand">${ink.pixel(14)}<b>${name}</b></span>
    <span>${mid}</span>
    <span>${right}</span>
  </div>`

export function furrow(ink: Ink): string {
  const days = [
    { d: 'wed 11', items: [['reading: Fukuoka', 1], ['tax letter', 1]] },
    { d: 'thu 12', items: [['garden plan', 0.9], ['call Ines', 1], ['sketches', 0.5]] },
    { d: 'fri 13', items: [['term outline', 0.7], ['bread', 1]] },
    { d: 'sat 14', items: [['notes → essay', 0.45], ['repair bench', 0.25], ['letters', 0.8]] },
    { d: 'today', items: [['lesson 04', 0.35], ['essay draft', 0.6], ['seed order', 0.1], ['walk', 0]] },
  ] as const
  const rows = days
    .map((r, i) => {
      const s = 0.62 + i * 0.095
      const plants = r.items
        .map(([label, h]) => {
          const height = Math.max(6, Math.round((h as number) * 100))
          return `<div class="plant ${h === 0 ? 'seed' : ''}" style="--h:${height}%">
            <span class="stalk"></span>${h ? `<span class="ear">${ink.grain(14)}</span>` : `<span class="ear">${ink.pixel(10)}</span>`}
            <span class="pl">${label}</span></div>`
        })
        .join('')
      return `<div class="furrow-row ${r.d === 'today' ? 'today' : ''}" style="--s:${s.toFixed(3)}">
        <span class="fday console">${r.d}</span><div class="plants">${plants}</div></div>`
    })
    .join('')
  return `
    ${bar(ink, 'furrow', 'sunday 15 november', 'late autumn · 06:40')}
    <div class="furrow-field">${rows}</div>
    <div class="os-prompt console"><span class="pp">${ink.grain(16)}</span><span>sow into today</span><span class="caret"></span><span class="os-hint">↑ walk back a row &nbsp; ⏎ sow</span></div>`
}

export function sheaf(ink: Ink): string {
  const granary = [
    ['Winter term', 14, true],
    ['Kitchen garden', 9, false],
    ['Letters, 2026', 31, false],
    ['The bench', 6, false],
    ['Reading: soil', 12, false],
  ] as const
  const g = granary
    .map(
      ([n, c, on]) => `<li class="${on ? 'on' : ''}"><span class="bundle"><i></i><i></i><i></i><b></b></span>
        <span class="gn">${n}</span><span class="gc console">${c}</span></li>`,
    )
    .join('')
  return `
    ${bar(ink, 'sheaf', 'Winter term', '14 stalks · tied 3 days ago')}
    <div class="sheaf-body">
      <aside class="granary"><p class="console gh">granary</p><ul>${g}</ul><p class="console gh2">+ bind a new sheaf</p></aside>
      <div class="stalks">
        <article class="stalk-col">
          <header class="console">note · syllabus</header>
          <h5>Six weeks of keeping</h5>
          <p>1. A single file<br>2. Rows and dates<br>3. Links that survive<br>4. Sowing in rows<br>5. Threshing<br>6. The granary</p>
        </article>
        <article class="stalk-col">
          <header class="console">person · Ines</header>
          <p class="msg them">Can week four move after the holiday?</p>
          <p class="msg me">Yes, I’ll swap it with five.</p>
          <p class="msg them">Lovely. Bread on Friday?</p>
        </article>
        <article class="stalk-col">
          <header class="console">file · reading-list.txt</header>
          <pre class="console">fukuoka   one-straw
berry     the unsettling
kimmerer  braiding
scott     seeing like</pre>
        </article>
        <article class="stalk-col tool">
          <header class="console">tool · calendar</header>
          <div class="cal console">${Array.from({ length: 35 }, (_, i) => {
            const d = i - 2
            const mark = [7, 14, 21, 28].includes(d) ? ' w' : d === 15 ? ' t' : ''
            return `<span class="${mark}">${d > 0 && d <= 30 ? d : ''}</span>`
          }).join('')}</div>
        </article>
      </div>
    </div>
    <div class="os-foot console"><span>⌁ tie off</span><span>⇥ next stalk</span><span>+ add to this sheaf</span></div>`
}

export function sieve(ink: Ink): string {
  return `
    ${bar(ink, 'sieve', '', 'nothing open · 06:41')}
    <div class="sieve-body">
      <div class="sieve-line"><span class="pp">${ink.grain(22)}</span><span class="sq">letters from march</span><span class="caret"></span></div>
      <div class="mesh m1"><span class="mesh-l console">coarse · do</span>
        <span class="chip">Write a letter</span><span class="chip">Open the March row</span><span class="chip">Remind me to reply</span></div>
      <div class="mesh m2"><span class="mesh-l console">middling · go</span>
        <span class="path console">granary / letters, 2026 / march</span><span class="path console">furrow / 2026.03</span></div>
      <div class="mesh m3"><span class="mesh-l console">fine · files</span>
        <span class="file"><b>to Ines</b> <i class="console">03.02</i></span><span class="file"><b>to the council, re: allotments</b> <i class="console">03.11</i></span><span class="file"><b>from my brother</b> <i class="console">03.19 · unanswered</i></span><span class="file"><b>to G.</b> <i class="console">03.28 · unanswered</i></span></div>
      <div class="mesh m4 flour"><span class="mesh-l console">flour · answer</span>
        <p>Four letters in March. Two are still waiting on you, the one from your brother and the one to G.</p></div>
      <div class="falling" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i style="--x:${8 + i * 10.5}%;--d:${(i * 0.37) % 2.4}s">${ink.pixel(8)}</i>`).join('')}</div>
    </div>`
}
