# The Grain Terrarium

A fish tank drawn in text, inside the atlas (`#/terrarium`). It is a browser cousin of the
**Terrarium** that the living tree is planning ("the glass you look through into a living RISC-V
world", see `tablecloth/20261104-161857_terrarium-boot-journey` in
[xykj61/20260618-grain](https://github.com/xykj61/20260618-grain)). It is not the emulator, which is
not built yet; it borrows the premise and the boot order.

## Touching it

| Do | What happens |
|---|---|
| click the water | flakes drop; hold and drag to sprinkle |
| drag anything | moves it. Let go of a fish and it is tossed; loose scenery sinks back to the sand |
| tap a creature | a boop: it darts, a pufferfish swells |
| **Add** | arm a creature or scenery, then click the water to place it (Esc disarms) |
| **Scoop** | click a creature or a piece of scenery to lift it out |
| the chest | opens [grain-www](https://node777.github.io/grain-www/) |
| the bottle | opens the Terrarium.app download |
| **Keep** / **Reboot** | commit the tank to this browser / replay the boot |

The doors' addresses live in `src/plugins/terrarium/links.ts`. The grain-www address follows the
GitHub Pages rule for `node777/grain-www`; the download points at the releases page of the tree that
plans the app, until the macOS app ships.

## The boot

The first visit plays the plan's boot sequence on a cold glass, and each stage brings up its own
creatures:

| Stage | In the tank |
|---|---|
| 0 The Pill | a lone capsule sinks through dark water |
| 1 Self-compile | it copies itself; the copy scatters into plankton |
| 2 Tally | bounded sand and kelp; the snails carry the budget |
| 3 Aurora | the glass lights; jellies and a lantern fish glow |
| 4 Mantra | seahorses keep the log; the bubbler's bubbles rise in order |
| 5 Caravan | the schools, the angelfish, the manta and the Steward crab arrive; the two doors appear |

Like the Mantrapod, the tank is **RAM only**: it forgets when you leave unless you deliberately
**Keep** it.

## The ecosystem

```
kelp and coral shed plankton -> tetras, jellies and seahorses eat it
you drop flakes              -> fish eat them; a well-fed pair raises fry, up to a ceiling per kind
uneaten flakes               -> settle as algae; the water greens and breeding pauses
snails, crabs, starfish      -> graze the algae and clear the water
```

Nothing dies. A hungry creature goes sleepy and slow, and wakes when food drifts by. Fish steer with
a small boids model (separation, alignment, cohesion for schooling kinds) plus wandering, soft walls,
a preferred depth band, hunger-driven food seeking and a current. It is written in
`src/plugins/terrarium/engine.ts` rather than taken from a library: the behaviours are specific to
the tank (hunger, food, depth bands, fry), and the steering core is a few dozen lines.

## Credits

A terrarium by DJINN, part of the Grain Atlas.
