# How grain names its versions

Research notes, 2026-10-10, from a read of grain-ww/grain at seed `incense` (commit 9ac1198).
Paths are grain paths. Several pages they cite (construction/, context/LEXICON.md,
template-manifest.kyri, session-logs/) live only in the maintainer's private field.

## The model

- **The field and the seed ("the Two Grains", MAP.md).**
  - The **field** is the maintainer's private working tree, with signed history and tens of
    thousands of commits. It pushes to remote `xy`, named `acme-owner/grain`; that name is very
    likely the seed's scrubbed placeholder for the real handle.
  - The **seed** is projected from the field by `tools/s/sow.rish`, letting through only what
    `template-manifest.kyri` allows. It is published by wiping `seed/.git` and force-pushing a single
    parentless commit to `grain-ww/grain` (`publish-seed.template.sh`).
  - The seed is meant to be re-published every fifth round.
- **The seed's name is its root commit subject.** It is one word, chosen by hand, and never reused:
  - `Grain OS -- ` and `grain-ww -- `, retired 20260828-20260830;
  - then `crashed-meteor`;
  - then `crashed-wave`, from 20260912;
  - then **`incense`**, from 20261007, "to match the living domain".

  The same word names the project's phase. The CHANGELOG says "Grain is in its incense phase",
  SECURITY.md says the same, and the README carries a `status-incense` badge.
- **`grain-os/grain` is a pointer.** Its whole README is "The public seed is
  https://github.com/grain-ww/grain. This repository is a pointer to that seed."
- **Ships of the Earth fleet are full working copies of the field.** Each is named for an aroma,
  because earth's sense is smell, and is checked out as `grain-<ship>`:

  | Ship | Lane |
  |---|---|
  | **incense** | captain; law, design and review |
  | pheromone | the Glow language |
  | petrichor | docs-geode prose |
  | bakery | core infrastructure |
  | diffuser | moonshots and research |
  | grass | auditing |
  | copal | amphora vessels and sealing |
  | patchouli | mantra and tally |

  New ships are born with `tools/b/birth_a_clone.rish`. The aether row once flew six bodies
  (Mind/Mystery, Sound/Silence, Dream/Hush) plus Choir; they are parked now.
- **A pier is a machine and its home checkout.** The home pier is `~/grain`.
  - Its identity lives in two gitignored files, made from the committed templates.
  - `GLOW_HOST.kyri` holds `os`, `arch`, `zig_version` and `checked`.
  - `GLOW_PROFILE.kyri` holds `name`, `handle_github`, `timezone`, `voice`, `editor` and `model`. It
    also holds the keeper's own seed: `seed_root_subject` and `seed_remote_primary`.
  - Neither file has a "pier name" field; a pier is named by its folder.
- **The git nib** is the 10-character HEAD commit. The **.brix descriptor** carries `version
  20260810.145743`, a descriptor date bumped by hand rather than per publish.
- **Not versions of the tree:**
  - the five or six OS variants (Reya, Riyo, Trey, Triz, Quin, Trya), which are boot images whose
    names double as voice names;
  - the four-letter waymarks that name stretches of work (CION, VOLS, SOON…);
  - equinox bundle manifests, which do snapshot the field (`format equinox-bundle-manifest-v1`).

## What the atlas shows

- **grain-ww/grain:** the seed name (`incense`), the git nib and the commit date.
- **grain-os/grain:** marked as a pointer, with a button to follow it to the seed.
- **A fork:** the root subject if it is a single word, else the short hash.
- **A local folder:** the label is picked in this order:
  1. `seed "<subject>"` when the checkout is a single parentless commit;
  2. `ship <name>` when the folder is `grain-<ship>`;
  3. otherwise `pier <folder>`.

  It adds the branch, "cloned from the public seed" when the remote is grain-ww/grain, and the
  `voice` and `seed_root_subject` from `GLOW_PROFILE.kyri`.
- **The bridge:** the same rules applied to the bridge's directory, plus a count of files changed
  in the working tree.

The code is in `src/sources/versions.ts`.
