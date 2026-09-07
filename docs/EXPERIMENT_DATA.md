# Experimental results and research data

The Results collection records numerical experiments automatically, with fixed input snapshots and an ordered measurement history. It is intended to make comparisons and future automated exploration reproducible. It does not implement an autonomous research loop yet.

## Experiment lifecycle

The first Run starts a new UUID-identified experiment. Pause/resume, changing target strain, and unloading append to that experiment. The loading-segment list records target changes. Reset, loading another design, or changing geometry/material/mode/resolution finalizes the old result and starts a fresh solver. Resetting the solver preserves the collection.

Measurements arrive from the simulation worker at equilibria and fracture events, independently of live animation frames. Automatic checkpoints save at most every two seconds while data arrives, and immediately at pause, completion, nonconvergence, reset, or when the page becomes hidden. Closing a browser abruptly can lose work since the last completed checkpoint. A saved `running` record from an earlier session remains an explicitly partial checkpoint.

**Results → Reset results → Clear experiments** clears both record and replay stores and resets the current experiment. Imports and clearing use transactions; a failed import does not partially replace the collection. Ordinary data import merges new IDs and skips IDs already present. **Keep imported copies** creates new IDs for collisions and retains the original ID as provenance. To restore a backup as the whole collection, clear the results and then import the backup.

## Stored content

| Content | Fields |
| --- | --- |
| Identity | UUID, name, notes, tags, created/updated timestamps, app/schema versions, completion status |
| Exact inputs | Topology, seed, hierarchy, disorder, dimensions, gradients, repeats, notch, material class/constants, loading axis/mode, increment, subdivisions, solver tolerances, initial print settings |
| Geometry | Exact graph and connectivity; the replay includes subdivided mechanical nodes/elements |
| Load protocol | Ordered target changes, including loading/unloading segments |
| Each measurement | Sequence, kind/status, convergence, elapsed wall-clock ms, applied strain, displacement, reaction, nominal stress, member stress/strain statistics, maximum torque, energy terms, damage, connectivity, global Z displacement, beam rotation, residual, iteration count |
| Failure event | Failed parent IDs and element indices, their pre-failure stresses/axial strains, applied strain and specimen force/stress immediately before removal |
| Final attempt | Scalar measures plus XYZ positions, per-element stress/strain/activity, and generalized coordinates `q`; it can be nonconverged |
| Replay | Initial state, equilibria, and discrete removals, with per-node XYZ positions and per-element stress/strain/activity |

Schema version 1 uses mm, N, MPa, mJ, radians, and strain fractions. UI plots convert strain to percent. `elapsedWallMs` measures wall-clock time since worker initialization (including pauses), not physical simulation time. `q` contains absolute node coordinates followed by rotations: `[x,y,θ]` in 2D and `[x,y,z,θx,θy,θz]` in 3D. It is not a vector of translational displacement increments.

## Summary definitions

- **Peak reaction / nominal stress**: maximum absolute value over converged states, including equilibria before failure. Nonconverged final attempts do not contaminate these maxima.
- **Nominal stress**: reaction divided by full specimen envelope area perpendicular to the normal load axis in 3D. In 2D the assumed area is width × primary strut diameter. Compression uses the solver's positive compression magnitude convention; unloading may produce signed negative reaction.
- **Peak member stress**: maximum tensile failure-criterion stress among active elements, including bending and, in 3D, torsion. It differs from nominal specimen stress. The 95th percentile is an unweighted active-element statistic, so changing element subdivisions can affect it.
- **Member strain statistics**: maximum tensile, minimum compressive, maximum absolute, and arithmetic mean axial engineering strain of active elements. These do not include bending surface strain. Inactive elements are excluded rather than counted as zero.
- **First / last / maximum rupture strain**: applied strain at observed discrete parent-strut deletion events, in recorded order. They are `null` if no strut has failed, including cases where failure is disabled. The first-rupture force/stress and failed-member strain are taken immediately before removal.
- **Separation strain**: first fracture event after which the active graph has no spanning path between the selected grips. This is a connectivity measure, not a toughness measurement or a continuum fracture criterion.
- **Initial secant stiffness / nominal slope**: force/displacement and nominal-stress/applied-strain at the first positive converged load step. `initialSlopeAtStrain` gives that step. This is not a fitted tangent modulus, a homogenized tensor, or an automatically validated linear interval.
- **Net input work**: trapezoidal integral of reaction against applied displacement along the recorded converged path, starting from rest. Unloading contributes negative work. Units are N·mm = mJ. Instability jumps and coarse load steps can make this an approximation.
- **Stored, torsional, plastic, and deleted elastic energy**: the quantities reported by the beam solver. Deleted elastic energy is an accounting term for removed members, not calibrated fracture toughness.

No observed event is represented by zero unless its measured value is actually zero. Missing metrics remain `null` in JSON, empty in CSV, and `—` in the UI. Scatter plots omit points whose selected axis is missing. Curves retain solve order, so unloading loops are not sorted away by strain.

## Export and import

**Export data ZIP** defaults to all experiments; selected batches are available for large studies. The archive contains:

| File | Purpose |
| --- | --- |
| `dataset.json` | Canonical versioned records, every scalar measurement, exact parameters and graph, failure details, final attempted arrays |
| `summary.csv` | One row per experiment, machine-readable summary keys and raw strain fractions |
| `measurements.csv` | One row per recorded state, including explicit equilibrium/fracture/rest kind and convergence flag |
| `schema.json` | Column definitions, units, and key scientific interpretations |
| `replays/<id>.canopy-replay` | Available detailed geometry/field histories, with the original experiment ID |

Names/notes remain ordinary JSON text; CSV formula-leading text is escaped for spreadsheet use. No plot images or MP4 files are required to recreate the plots or movies: the underlying data and replay geometry are retained.

Import accepts this ZIP or its `dataset.json`. JSON alone cannot restore replay geometry; it is marked unavailable instead of inventing frames. Files are validated before writes. Each archive is limited to 512 MiB expanded data and one million measurement rows across at most 10,000 experiments. Export selected batches when needed. The replay has its own 128 MiB / 10,000-state budget. Scalar measurements continue after that budget and a partial replay is flagged. Browser disk quota, device memory, and plotting cost are practical limits on large collections.

IndexedDB is specific to the browser and origin. Hosted and local installations, different ports, and `localhost` versus `127.0.0.1` have separate data. Export/import is the portable backup mechanism. If persistence is unavailable or quota is exhausted, the app reports it and retains the current data in the tab for export. The browser may evict stored data; the suite ZIP itself does not include experiments subsequently created on your computer.

## Future autoresearch integration

The data structure and controls are available now; no external service or autonomous loop has been started. A future computer-use controller can change a candidate, run it, wait for an explicit terminal status, and collect the resulting dataset.

Stable control IDs include `run`, `reset`, `unload`, `results-open`, `results-plot`, `results-export`, `results-import`, `results-reset`, and `results-clear-confirm`. Structure/material controls use `data-key` and `data-scope`; they have visible labels. Results rows have `data-result-select` and `data-result-detail` containing the experiment ID.

The local page also exposes a read-only helper:

```js
window.canopyResearch.getStatus();
// {appVersion, running, solverStatus, activeExperimentId,
//  recordedStates, importedReplay, saving}

const experiments = await window.canopyResearch.listExperiments();
const fullRecord = await window.canopyResearch.getExperiment(experiments[0].id);
```

The async read methods flush the current checkpoint before returning. There are no hidden state-changing controls in this helper. The `canopy:experiment-saved` DOM event carries `{id, status, persistent}` after a checkpoint. A research controller should treat `not-converged`, `error`, and `interrupted` as distinct outcomes and use IDs rather than names to associate measurements with candidates.

A straightforward external analysis reads standard ZIP/JSON without running the app:

```python
import json, zipfile
with zipfile.ZipFile("Canopy_Experiment_Data.zip") as z:
    data = json.loads(z.read("dataset.json"))
for run in data["experiments"]:
    s = run["summary"]
    print(run["id"], run["status"], s["maxForceN"], s["firstRuptureStrain"])
```

The same exact settings, units, convergence gates, and failure definitions should remain part of any future optimization objective. The model's scope remains the reduced-order beam mechanics described in `METHODS.md`.

As of 2.2.1, `getStatus()` also returns `replayPlaying`, `replayCursor` (null for live view), and `replayPending` (waiting for a solver pause). A saved replay is explicitly labeled in the UI; **New experiment** begins a fresh solve using its design, while **Return to live** only applies to the current solver session.

Version 2.2.2 adds `displacementScale` to `getStatus()`. This is a shared view preference (1–100), excluded from the physical experiment parameters and stored measurements. Experiment data and replay files always keep physical coordinates; displacement exaggeration is applied when viewing them.
