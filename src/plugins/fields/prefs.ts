// How the Fields are drawn, kept in this browser only. Map, the default, lays the tree out as an
// old atlas: towns, farmland, rivers and ranges; Bubbles is the plot-and-furrow chart the view
// first drew. The other choices apply to whichever view is up.

import { createStore } from '@/core/store'

export type FieldsView = 'bubbles' | 'map'
export type FieldsNames = 'all' | 'places' | 'none'

export interface FieldsPrefs {
  view: FieldsView
  /** all names; places only (regions, rooms, settlements, no single files); or a bare map */
  names: FieldsNames
  /** the warm mist over rooms not yet walked */
  mist: boolean
  /** map only: mountains, hills and woods in the land between settlements */
  relief: boolean
  /** map only: rhumb lines, the compass rose and the title cartouche */
  sea: boolean
}

export const FIELDS_DEFAULTS: FieldsPrefs = { view: 'map', names: 'all', mist: true, relief: true, sea: true }

export const fieldsPrefs = createStore<FieldsPrefs>({ ...FIELDS_DEFAULTS }, 'grain-atlas:fields-v2')
