// The two doors in the glass. Kept in one place so they are easy to correct.
//
//   www  -- DJINN's grain-www, hosted as a GitHub Pages site (the repo is node777/grain-www, which
//           the grain tree carries as the gratitude/grain-www submodule). Pages for a user site
//           live at <owner>.github.io/<repo>/; this follows that rule and the atlas's own address.
//   app  -- where the macOS native Terrarium host will be downloaded. The app is not shipped yet
//           (see tablecloth/20261104-161857_terrarium-boot-journey in the living tree); until a
//           release exists, the bottle points at the releases page of the tree that plans it.
export const LINKS = {
  www: { url: 'https://node777.github.io/grain-www/', label: 'grain-www', note: 'DJINN\'s grain-www, hosted on GitHub Pages' },
  app: { url: 'https://github.com/xykj61/20260618-grain/releases', label: 'Terrarium.app', note: 'download the Terrarium for macOS (releases page)' },
} as const

export type LinkId = keyof typeof LINKS
