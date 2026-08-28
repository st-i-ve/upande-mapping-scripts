# Segments → Bands → Triads, and feeding upande_scp

## The pipeline

1. **Load** a GeoJSON. It lands in **Shapes** as one shape. Selectable immediately.
2. **Slice** it. Slicing works on a *duplicate*; the original is hidden in Shapes
   with an eye icon to show/hide it, and is never mutated.
3. Each cut adds pieces to a transient **Segments** list. Cutting a segment again
   replaces it with its own pieces — the hierarchy goes as deep as needed.
4. **Finish slicing** (button at the top of the segments panel) opens a
   confirmation that:
   - states the segments are about to be ported into Shapes ("verified"),
   - shows the naming convention and lets every name be edited,
   - refuses to continue while any two names collide, or a name is already taken
     in Shapes.
5. On confirm the segments are promoted into **Shapes**. The original stays,
   hidden.
6. In Shapes, each row has a checkbox. A selection can be **deleted**, or sent to
   **Generate triads**.
7. **Generate triads** opens the triad dialog: side length, band direction, triad
   direction. Generate runs the selection **sequentially, one block at a time**,
   with a **Stop** button. Each completed block produces **its own output**
   holding that block's bands and triads. A block interrupted mid-way produces
   no output and is not listed.

## Numbering and direction

- Band numbers **restart at 1 for every block** — `Bed` names itself
  `{block} - Band {n}`, so they only have to be unique within the block.
- Triad numbers run **within a band**, because `Triad` is named
  `{row} - Triad {triad}` and `triad` is a mandatory Int.
- **Band direction**: north→south (default) or south→north.
- **Triad direction**: west→east (default), east→west, or north→south.

## What the ERP already provides (verified 2026-08-28)

`Field Unit Automation` (upande_scp) is one generator for three crops:

| `unit_type` | Crop | Warehouse | Holds |
|---|---|---|---|
| Bed | roses | Greenhouse | Zone |
| Row | avocado | Block | Orchard Tree |
| Band | coffee | Block | Triad |

- A **Band is not a new doctype** — it is a `Bed` with `unit_type = "Band"`.
  `field_unit_types.py` appends that option to `Bed.unit_type` via a Property
  Setter on every migrate.
- **Triad** already exists in `upande_core`: `row`→Bed, `triad` Int (mandatory,
  names the doc), `block`, `farm`, `geojson`.
- Nothing needs building on the ERP side.

### The export contract

`_extract_numbers` accepts, most explicit first:

| unit | child | source |
|---|---|---|
| `unit_id` | `child_id` | what the tool documents — **we emit this** |
| `row_id` | `tree_id` | avocado exports |
| `line_id` | `zone_id` | rose exports |

…or a `properties.name` ending `_ROW<n>_T<n>`. Input is one FeatureCollection or
one per line.

So each triad feature carries `unit_id` = its band number, `child_id` = its
number within that band. Output per block goes to the existing outputs store and
is fed to `Field Unit Automation` (Block + unit_type Band + paste), the same
route the beds/zones export already uses via `_to_frappe_ndjson`.

## Gap on our side

`triad.ts` already tags each triad with `band`, `hex` and `tri`. Missing:
- a per-band running triad number (`tri` is 1–6 within a *hexagon*, not unique
  within a band),
- band/triad ordering honouring the direction settings,
- the `unit_id`/`child_id` export,
- per-block sequential generation with interrupt.

## Stages

1. **Shapes / Segments model** — the two lists, eye toggle, rename with
   collision warning, delete, finish-slicing confirmation. Foundation for the
   rest.
2. **Direction-aware numbering** — band and triad ordering, per-band triad
   numbers, in `triad.ts`, pure and unit-tested.
3. **Sequential generation + outputs** — the loop over selected shapes, Stop
   button, one output per block.
4. **ERP export** — `unit_id`/`child_id` FeatureCollection per block.
