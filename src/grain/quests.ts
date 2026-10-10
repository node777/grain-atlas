// Journeys through the tree, drawn from the reading orders grain itself recommends.
// grain's own calendar nests Chapter > Equinox > Journey > Quest > Round > Lap; here a
// journey is a walk of several stops, and reading each stop plants a seed in your field.
//
// The house rule this follows, from grain's lesson 4: fun that tells the truth and then lets
// you walk away. No streaks, no timers, no guilt -- progress waits for you.

import type { ElementRow } from '@/core/settings'

export interface QuestStop {
  path: string
  note: string            // why this stop, in a line
  run?: string            // a command to try at this stop, copied from grain's own pages
}

export interface Journey {
  id: string
  title: string
  source: string          // the grain page that recommends this order
  element: ElementRow
  invitation: string
  stops: QuestStop[]
  benediction: string
}

export const JOURNEYS: Journey[] = [
  {
    id: 'three-doors',
    title: 'Three Doors',
    source: 'MAP.md',
    element: 'earth',
    invitation: 'If you only open three doors. The map itself says start here.',
    stops: [
      { path: 'README.md', note: 'What Grain is, and what actually runs today.' },
      { path: 'MAP.md', note: 'The seven rooms of the house, held in one glance.' },
      { path: 'manual/grain-os/README.md', note: 'The guided rooms, with a welcome you can send a friend.' },
    ],
    benediction: 'May you find the door you came for on the first try.',
  },
  {
    id: 'first-hour',
    title: 'The First Hour',
    source: 'docs-geode/tutorials/the-first-hour.md',
    element: 'fire',
    invitation: 'Clone the tree, run one witness, read the green line it prints, then write five lines of your own.',
    stops: [
      { path: 'docs-geode/tutorials/the-first-hour.md', note: 'One page, one path, before any map.' },
      { path: 'tools/f/fetch-toolchain.sh', note: 'Fetch the pinned toolchain.', run: 'sh tools/f/fetch-toolchain.sh' },
      { path: 'rishi/tests/hello.rish', note: 'Your first Rishi script.', run: 'rishi/bin/rishi run rishi/tests/hello.rish' },
      { path: 'tools/r/rish_exit_codes_witness.rish', note: 'A witness: watch for the GREEN line.', run: 'rishi/bin/rishi run tools/r/rish_exit_codes_witness.rish' },
      { path: 'rishi/README.md', note: 'The shell you just used, explained.' },
      { path: 'ORGANIZING.md', note: 'Where each kind of work lives.' },
      { path: 'CONTRIBUTING.md', note: 'How a contribution arrives: small, signed, written like prose.' },
    ],
    benediction: 'May the first green line you see be the first of many.',
  },
  {
    id: 'evening-walks',
    title: 'Eight Evening Walks',
    source: 'docs-geode/lessons/README.md',
    element: 'water',
    invitation: 'In order, one an evening. Each lesson hands you to the next.',
    stops: [
      { path: 'docs-geode/lessons/20260910-060225_lesson-1-the-house-from-above.md', note: 'The house from above.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-2-the-front-door.md', note: 'The front door.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-3-the-why.md', note: 'The why.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-4-joy-has-a-rank.md', note: 'Joy has a rank -- green is the first toy.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-5-the-order-itself.md', note: 'The order itself.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-6-two-pockets.md', note: 'Two pockets.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-7-dawn-and-kernels.md', note: 'Dawn and kernels.' },
      { path: 'docs-geode/lessons/20260910-060225_lesson-8-the-painted-face.md', note: 'The painted face.' },
    ],
    benediction: 'May each evening leave the house a little more your own.',
  },
  {
    id: 'compass-rose',
    title: 'The Day-One Rose',
    source: 'docs/COMPASS.md',
    element: 'air',
    invitation: 'The compass walk: from the map to the reasons, the disciplines, and one witness run.',
    stops: [
      { path: 'docs/COMPASS.md', note: 'The one-page orientation.' },
      { path: 'foundations/README.md', note: 'The room with the comfortable chairs.' },
      { path: 'foundations/20260826-024943_follow-our-compass.md', note: 'The walk back to direction when it frays.' },
      { path: 'foundations/20260826-024942_the-grain-and-the-crossing.md', note: 'Does this cut clean?' },
      { path: 'foundations/20260703-182612_sameness-is-the-macro.md', note: 'Sameness is the macro.' },
      { path: 'foundations/20260826-194850_the-happy-zone-and-the-thin-edge.md', note: 'The happy zone and the thin edge.' },
      { path: 'context/TWO_ROOMS.md', note: 'Why every page says whether it is proven or proposed.' },
      { path: 'context/GAUGE_STYLE.md', note: "How the prose reads: don't be too smart about it." },
      { path: 'context/TAME_GUIDANCE.md', note: 'How the code stays safe -- a bound on everything.' },
      { path: 'tools/g/glow_expr_witness.rish', note: 'Run one witness.', run: 'rishi/bin/rishi run tools/g/glow_expr_witness.rish' },
    ],
    benediction: 'May every GREEN you meet be one a machine spoke first.',
  },
  {
    id: 'five-rows',
    title: 'The Five Rows of the Rota',
    source: 'foundations/README.md',
    element: 'aether',
    invitation: 'Aether hears, air feels, fire sees, water tastes, earth breathes in. The senses wake one at a time.',
    stops: [
      { path: 'foundations/20260826-021731_aether-the-row-that-hears.md', note: 'Mind and mystery, sound and silence, dream and hush.' },
      { path: 'foundations/20260826-021732_air-the-row-that-feels.md', note: 'Arc and spiral, touch and presence.' },
      { path: 'foundations/20260826-021733_fire-the-row-that-sees.md', note: 'Rockstar by day, hermit by night.' },
      { path: 'foundations/20260826-021734_water-the-row-that-tastes.md', note: 'River and tide, love and longing.' },
      { path: 'foundations/20260826-021735_earth-the-row-that-breathes-in.md', note: 'Grain and mist, harvest and fallow.' },
    ],
    benediction: 'May all five rows wake in you, one sense at a time.',
  },
  {
    id: 'star-room',
    title: 'The Star Room',
    source: 'classical-vedic-astrology/README.md',
    element: 'aether',
    invitation: 'The calendar the chapters are named from: how a chart is cast, and the twenty-seven seats of the Moon.',
    stops: [
      { path: 'classical-vedic-astrology/README.md', note: 'The reading craft, and its privacy kept by design.' },
      { path: 'classical-vedic-astrology/20260810_nakshatra-outfits-and-the-sundial-face.md', note: 'The twenty-seven outfits, counted from Krittika.' },
      { path: 'classical-vedic-astrology/cast_a_chart.py', note: 'The caster: tropical signs, sidereal stars, whole-sign houses.' },
      { path: 'classical-vedic-astrology/studies/nakshatras/asvini.md', note: 'A nakshatra study.' },
      { path: 'cubist-bhakti-astrology/README.md', note: 'The same sky read again, at an angle, by devotion.' },
      { path: 'cubist-bhakti-astrology/20260826-044214_ardra-the-star-of-rudra.md', note: 'Ardra, wearing fire\'s cardinal seat.' },
    ],
    benediction: 'May every sky here be cast twice and written once.',
  },
  {
    id: 'four-questions',
    title: 'Four Questions, Four Rooms',
    source: 'docs-geode/study/README.md',
    element: 'earth',
    invitation: 'What is it for? How do I use it? Why is it built this way? Each question has a room.',
    stops: [
      { path: 'docs-geode/study/README.md', note: 'How to read this tree.' },
      { path: 'foundations/20260823-034321_the-return-that-feeds-everyone.md', note: 'What it is for, all prose.' },
      { path: 'docs-geode/api/rishi-language-reference.md', note: 'How to use it: the language reference.' },
      { path: 'docs-geode/libraries/README.md', note: 'A generated index of every library.' },
      { path: 'active-designing/README.md', note: 'Why it is built this way: the hot bench.' },
    ],
    benediction: 'May each answer open the next good question.',
  },
]

export const journeyById = (id: string) => JOURNEYS.find((j) => j.id === id)
