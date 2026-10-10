// Each view is a plugin. The compass lists them in `order`, clockwise from the north point.
import type { AtlasPlugin } from '@/core/registry'
import { Fields } from './fields/Fields'
import { Ledger } from './ledger/Ledger'
import { Heavens } from './heavens/Heavens'
import { Sky } from './sky/Sky'
import { Journeys } from './journeys/Journeys'
import { Bench } from './bench/Bench'
import { Intro } from './intro/Intro'
import { navigate } from '@/core/router'

export const fieldsPlugin: AtlasPlugin = {
  id: 'fields', title: 'Fields', description: 'The freeform map: regions, rooms, folders and files as land.',
  views: [{ id: 'fields', title: 'Fields', hint: 'the tree as land, one grain per file', kind: 'freeform', glyph: '❦', order: 0, component: Fields }],
  commands: [{ id: 'go-fields', title: 'Open the fields', run: () => navigate('fields') }],
}
export const heavensPlugin: AtlasPlugin = {
  id: 'heavens', title: 'Heavens', description: 'grain\'s history as a sky: pages set where the Moon stood when they were written.',
  views: [{ id: 'heavens', title: 'Heavens', hint: 'the history of the tree as a sky', kind: 'sky', glyph: '✧', order: 1, component: Heavens }],
}
export const skyPlugin: AtlasPlugin = {
  id: 'sky', title: 'Sky', description: 'The astrolabe and the dome: the real sky of any moment, with its readings.',
  views: [{ id: 'sky', title: 'Sky', hint: 'the astrolabe, and the stars of any moment', kind: 'sky', glyph: '✺', order: 2, component: Sky }],
  commands: [{ id: 'sky-now', title: 'Open the sky now', run: () => navigate('sky') }],
}
export const benchPlugin: AtlasPlugin = {
  id: 'bench', title: 'Bench', description: 'Format playgrounds, run lines, notes, and the plan for Rishi in the page.',
  views: [{ id: 'bench', title: 'Bench', hint: 'try formats, copy run lines, keep notes', kind: 'tool', glyph: '⚒', order: 3, component: Bench }],
}
export const ledgerPlugin: AtlasPlugin = {
  id: 'ledger', title: 'Ledger', description: 'The structured view: folders, files, moments, search.',
  views: [{ id: 'ledger', title: 'Ledger', hint: 'folders and files, sorted and searchable', kind: 'structured', glyph: '☰', order: 4, component: Ledger }],
}
export const journeysPlugin: AtlasPlugin = {
  id: 'journeys', title: 'Journeys', description: 'Walks through the tree in the orders grain recommends.',
  views: [{ id: 'journeys', title: 'Journeys', hint: 'walks grain itself recommends', kind: 'freeform', glyph: '⚑', order: 5, component: Journeys }],
}
export const introPlugin: AtlasPlugin = {
  id: 'intro', title: 'Opening', description: 'Stars become seeds become grain become the map.',
  views: [{ id: 'intro', title: 'Opening', hint: '', kind: 'freeform', glyph: '', order: 99, component: Intro, hidden: true }],
}
