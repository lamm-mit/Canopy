# Experiment replay and MP4

Replay displays saved mechanical states without rerunning the solver. It supports both the spatial 6-DOF beam model and the original planar model.

## Use

1. Run an experiment. Once a load step has been recorded, **Pause to replay** stops the solver and starts playback after it acknowledges the pause. Alternatively, let the run complete.
2. In **Experiment replay**, click the green **Play replay** button. Click **Pause replay**, choose ¼×–4× speed, use the previous/next buttons, or scrub the slider. A slider position selects an exact recorded state. The chart cursor and measurements follow that state. At the end, **Play replay** starts again from the beginning.
3. Orbit, zoom, choose stress/strain coloring, and optionally apply a cutaway. These remain view controls.
4. **Return to live** appears while replaying the current experiment and returns to its latest solver state. It is an exit from playback, not the playback button. The **Live experiment** label means you are already in live mode. Replay never changes the solver's plasticity, damage, or load history. Loading/unloading continues from the actual live state.
5. Use **Save replay** for a `.canopy-replay` file. **Open replay** or **Results → Open replay** loads the saved specimen and its recording, ready for **Play replay**. Saved recordings show **New experiment** instead of Return to live: this starts an unloaded solve using the saved design and keeps earlier results. Imported replays are not constitutive restart checkpoints.

If Play replay is disabled, read the message immediately below the timeline: playback requires at least two recorded states, and cannot begin during MP4 export or while waiting for the solver to pause. A saved experiment containing only its initial state has no motion to replay. Measurements-only JSON imports do not contain replay geometry; import the complete data ZIP or a `.canopy-replay` file.

The entire run, including subsequent unloading and reloading, remains one recording until Reset or a change to design, material, mode, or numerical resolution. The experiment collection preserves its previous result automatically. Save design remains a parameter/graph export; use Results or Save replay for time-ordered geometry.

## Displacement exaggeration

The general **Displacement scale** control below the measurement tiles ranges from **1× to 100×**, using either a slider or a numeric factor. **1× actual** restores physical deformation. The setting is shared by live solving, paused states, saved replay, stress/strain views, and PNG/MP4 exports; changing it never resets an experiment or modifies recorded data. It stays selected across design changes and imported recordings in the current session.

For every mechanical mesh node, the displayed point is `X + factor * (x - X)`, where `X` is its unloaded position and `x` is its physical position in the solver or selected replay frame. All three displacement components are scaled; strut radii and the undeformed outline keep their original size. Moving grips follow the exaggerated displacement. Replay interpolation happens in physical coordinates before this view transform, and fracture events keep their recorded topology.

Changing the factor or using **Fit specimen** fits the current pose together with the available recorded poses. The camera stays fixed through playback. During an ongoing solve, click Fit again as additional states arrive if a larger deformation leaves the frame. The WebGL view retains the chosen viewing direction when changing scale; the canvas fallback uses the same displacement formula and fixed framing during playback.

Readouts, stress/strain colors, curves, experiment exports, and replay files retain physical values. The magnified shape is a visual aid, not another equilibrium solution. **Print** temporarily disables this view control and shows the physical geometry used by STL export. Returning to the experiment restores the chosen scale.

PNG snapshots and MP4 movies inherit the factor. Above 1×, they include a `Displacements ×… · view only` annotation. MP4 export retains that small annotation even when full experiment labels are switched off. A movie holds one factor throughout its frames and restores the selected replay pose when finished or canceled.

## What is recorded

- Initial unloaded geometry.
- Every converged load state, including equilibria immediately before strut failure.
- The discrete removal of each failed parent strut. Its state is labeled **fracture / equilibrium pending**, with forces and fields reassembled at the current positions. It is not falsely labeled as a converged result.
- Recovered equilibria, further fracture cascades, and unloading in solve order.

The response plot includes converged states only. A nonconverged final attempt is stored separately in the experiment data. An experiment that loses its load path may finish with damage events; an incomplete run is retained and labeled.

**Smooth display** linearly interpolates node positions between adjacent states with the same active topology. Measurements, field colors, and the chart cursor hold the preceding recorded state. The UI labels the interpolation. If topology changes, the previous geometry is held until the discrete event. Smoothing is a presentation choice, not another physical solve. Turn it off to display only recorded positions. A smoothed pose can be printed, but selecting an integer timeline state gives a recorded pose.

The replay budget is 128 MiB or 10,000 states per experiment. When reached, recording stops explicitly and the retained prefix is marked partial; scalar experiment measurements continue. There is no silent geometry downsampling or silent removal of rupture events. Normal small unit-cell experiments are far below the budget.

## Movie export

**Export MP4** renders an offscreen copy of the current camera at:

| Setting | Choices |
| --- | --- |
| Resolution | 854×480, 1280×720, 1920×1080 |
| Frame rate | 15, 24, or 30 fps |
| Desired duration | 2–120 seconds |
| Labels | Specimen dimension, material class, load mode/axis, color field, strain, reaction, failed struts, state index/status |
| Smoothing | Optional, with the same discrete fracture behavior as replay |

The output is a **silent H.264 video in an actual MP4 container**. The bundled h264-mp4-encoder WebAssembly codec runs in a dedicated worker; no FFmpeg installation, browser-native H.264 encoder, CDN, or upload service is needed. WebGL2 gives a 3D movie; without WebGL2, the canvas fallback exports its 2D projection.

Frames are generated deterministically and acknowledged one at a time. Slow rendering affects export time, not movie duration or frame count. The schedule uses at least one video frame for every recorded state, so it may extend a requested short duration to retain all events. Large exports may take longer than real time. The encoded output remains in memory until downloaded. Cancel, Escape, or closing the dialog terminates the encoder and disposes the capture target; the selected replay pose is restored.

No physical time integrator is present. Movie duration, replay speed, and wall-clock solve time do not represent material loading rate or inertial fracture dynamics.

## Binary replay format, version 1

The `.canopy-replay` file begins with 8 UTF-8 bytes `CANOPYR1`, a little-endian uint32 JSON-header length at offset 8, four reserved zero bytes, and the UTF-8 JSON header at offset 16. The header is padded to an 8-byte boundary. It includes exact graph and mechanical mesh connectivity, design/material/experiment/print parameters, scalar frame rows, and committed response history.

For each frame, in order, the data blocks are:

1. `positions`: `3 * nodeCount` Float64 values, XYZ in mm.
2. `stresses`: `elementCount` Float32 peak member tensile stresses in MPa.
3. `strains`: `elementCount` Float32 axial engineering strains as fractions.
4. `active`: `elementCount` uint8 values, 0 or 1.

Each block is padded to 8-byte alignment. Numeric arrays use the little-endian layout of supported browser/Node platforms. A frame's `historyCount` refers to committed response rows. Fracture event rows can share a history count with the preceding equilibrium. This replay format stores visualization fields, not all constitutive internal variables or nodal rotations. The dataset's final attempted state additionally includes the solver's generalized coordinates `q`.

Imports check format/version, bounds, mesh indices, finite fields, parameters, and array lengths before replacing the current replay. The maximum replay file size is 144 MiB, allowing 16 MiB for metadata in addition to the recording budget.

## Verification

Handler unit tests cover live/saved replay controls, pause acknowledgment and completion races, timeline stepping, and restart. Node worker tests cover exact saved fields, loading/unloading order, discrete failure, pending-equilibrium labeling, recording limits, and event-preserving movie timing. The actual bundled movie worker is exercised to produce an MP4. When ffprobe/FFmpeg are available, tests verify H.264, frame dimensions/count, duration, and successful decoding. These checks do not constitute browser rendering QA or validation of physical printed specimens.

Codec source: [h264-mp4-encoder](https://github.com/TrevorSundberg/h264-mp4-encoder/tree/6d177fd043157606224cef4702e134dd31f6adfa). Notices and source provenance are in `THIRD_PARTY.md`.
