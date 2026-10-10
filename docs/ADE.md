# The Threshing Floor

The atlas's agent development environment: a place to work grain with its voices.

On a threshing floor the harvest is beaten and winnowed until the grain falls clean and the chaff
blows away. That is the job here too. Many agents do real work on grain, while the contexts stay
light and the spending stays inside limits you set.

## How the voices wake

| Backend | What it is | Tools | Cost is counted from |
|---|---|---|---|
| **Claude API, from the page** | Your Anthropic API key, kept in this browser; requests go straight to api.anthropic.com. | The atlas's **watering tools**, run on the version you are reading. | Each response's token usage times list price. |
| **Claude Code, through the bridge** | `node scripts/bridge.mjs ~/grain` runs beside your checkout, listens on 127.0.0.1 only, and needs a token. | Claude Code's own tools, in your checkout, under your Claude Code login. | Claude Code's reported `total_cost_usd`. |

The default model is Claude Opus 5.5 with adaptive thinking. Voices and hands each have their own
model and effort setting. The server-side refusal fallback is on by default and can be turned off
under Keys.

## Watering the grain: the tools

| Tool | Does |
|---|---|
| `map_tree` | Lists a folder, with sub-folder counts and each file's title and stamp. |
| `read_page` | Reads a file with line numbers, at most 400 lines a call. |
| `search_tree` | Finds files by words in their path or title, without reading them. |
| `grep_tree` | Searches inside files under a prefix, reading at most 120 files. |
| `recent_pages` | The newest pages by grain's one-clock stamps. |
| `write_page` / `edit_page` | Write into your own grain; on a read-only version they keep a **draft**. |
| `stamp_now` | The current one-clock stamp, its filename form, and its Vedic moment. |
| `bind_sheaf` / `recall_sheaves` | Long memory. |
| `send_hand` | Starts a subagent with its own fresh context; only its short report comes back. |
| `gauge` | Shows the spend against the limits. |

Every tool returns bounded text, so one call never floods a context.

## Context discipline, the cure for context bloat

1. **A stable, cached seed.** The system prompt is the voice's persona plus grain's seed context:
   - the regions and rooms, with file counts;
   - where grain asks newcomers to start;
   - the habits of the tree (stamps, headers, Two Rooms, its languages, the private field).

   It is byte-stable for a given version of the tree, so the prompt cache serves it on every request.
2. **Recall instead of replay.** A new task opens with where the reader is standing and the few
   sheaves that fit it, not every old word.
3. **Hands carry heavy reading.** A voice sends a hand to survey a room or draft a page. The hand's
   context is thrown away; only its report joins the voice's thread.
4. **Threshing.** When a thread's context passes your threshold (120k tokens by default), the meter
   turns amber. **Thresh** asks the voice to bind every durable fact, decision, plan and preference
   as sheaves and write a short summary. A fresh thread then begins from that summary. The old thread
   is kept, never edited: history stays append-only, which is also what the API's preserved-thinking
   checks require.

## Sowing, the autonomous mode

Plant a seed (an idea, a task, a direction) and choose four things: a voice, a spending cap, how
many hands may work at once, and the most plots to lay out. Then:

1. **Furrowing.** The voice reads just enough to lay out plots. Each plot is independent and
   concrete, with a definition of done.
2. **Tending.** Each plot gets a hand with a fresh context, several running at once. Hands follow
   grain's habits: headers, stamps, vision versus proven.
3. **Winnowing.** A reviewer reads the reports and every file written, checks them against grain's
   ethos, and fixes small things.
4. **Harvest.** A harvest note is written to `atlas-harvests/<stamp>_<seed>.md`, or kept as a
   draft, and bound as a sheaf.

The field is drawn as furrows. Each plot's stalk grows a grain for every few tool calls, turns gold
when the plot is grown, and greys if it withers.

## The Gauge

Limits are per day, per task or sowing, and per agent, plus a cap on hands at once. Before every
request an agent asks the Gauge whether it may spend. Past 80% of a limit the agent is told to wrap
up, and at the limit it rests and reports what it has. Your Anthropic console stays the record of
truth.

## Voices

Every grain voice can wake as an agent:
- Kyri, the standing voice;
- Kyli, the teacher;
- the elders: Riyo, Quin, Rio 3 and Reya 2;
- the nested voices: Trey and Trya;
- Kyri's four faculties: Lattice, Scribble, Lantern and Ember.

You can also seat voices of your own under Voices. Each has a face drawn from a few flat shapes
in the cloth's plant dyes, with one ink line and big, bright eyes (nearly white, tinted with the
voice's dye) whose small pupils follow the pointer. A few lit voices (Kyli, Quin, Lantern)
carry a sheen. The faces blink, breathe and talk.

### The companion

The current voice also lives in the **dock** at the corner of every view. Its window has:
- **Talk**, where the voice knows which page you have open, and any text you select on the page
  goes with your next message (toggle it on the context line).
- Quick asks for the open page: explain it, find related pages, keep a note, draft a change.
- Model and effort pickers, and today's spend against your daily limit.
- Copy the last answer, start a fresh conversation, a wider window, and a jump to the same
  conversation on the floor.
- **Notes**, the voice's sheaves, where you can keep one by hand.
- **Drafts**, changes waiting on a read-only version.

The companion starts tucked away. It comes out when you call it: the face button in the header,
the Companion toggle in Settings, or an **ask** button such as `[ ask Kyri ]` on any open page,
which brings the voice out with a question ready. Once only, after about five minutes of
exploring, it pops out by itself to say hello. The browser remembers this, so it happens once.

The face button in the header is the companion's burrow. Click it, or the tuck button in the
window, and the character leaps along an arc into the header, or back out to its corner. Still
motion skips the leap. It is also a toggle under Settings, Cloth.

## Safety notes

- **The API key** stays in browser local storage. Use a key with a spend limit, and clear it when
  you are done.
- **The bridge** binds to 127.0.0.1, requires its start-up token on every request, and confines
  file paths to the grain directory. It runs Claude Code with `--permission-mode acceptEdits` by
  default.
- **Writes** go only to a version you opened yourself (a local folder or the bridge). On GitHub
  versions they become drafts.

---

<sub>Part of the Grain Atlas, an atlas by DJINN.</sub>
