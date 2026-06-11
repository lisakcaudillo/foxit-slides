# Design decisions log (`design-decisions.csv`)

**Your review artifact.** One row per slide, recording how the two "brains" reason —
so you can read their judgment **before** they're ever wired to act on each other.

- **`design-decisions.csv`** lives in this folder and is **gitignored** (it's local
  generated data — it never travels via git, so it can't churn or conflict).
- It's **observe-only**: the Judge here only *looks and logs*. It does **not** force
  the Designer to redo anything, and it does **not** change any guidelines. Wiring
  those loops is a later, separate step you opt into after reviewing this log.
- The file is created automatically on the first generation; open it in any
  spreadsheet tool.

## Columns

| column | who fills it | meaning |
|---|---|---|
| `timestamp` | system | when the slide was designed (ISO) |
| `deckId` | system | the deck |
| `slideId` | system | the slide |
| `slideType` | system | the slide's role/type (e.g. `cover`, `process`) |
| `designer_decision` | **Designer** | what it chose — form, anchor, elements, image y/n |
| `designer_reasoning` | **Designer** | *why* — which rules/signals drove the choice |
| `result` | **Judge** | **PASS** / **FAIL** |
| `judge_reasoning` | **Judge** | why it passed/failed, vs which standard rule |
| `judge_recommendation` | **Judge** | how to resolve a FAIL |

The Designer fills its two columns; the observe-only Judge appends the last three.
A blank `result` means the Judge hasn't run on that row yet.

## Notes
- Logging records **design** reasoning (why a form/anchor/treatment), **not** your
  slide prose.
- Disable entirely with the env var `DESIGN_LOG=off`.
- The schema is defined in code at `app/src/lib/card-engine/design-log.ts`
  (`DESIGN_LOG_COLUMNS`) — keep this table in sync with it.
