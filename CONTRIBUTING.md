# Contributing to Canopy

Use Node 24 for the documented development environment. Runtime and test dependencies are included; there is no installation or bundling step.

## Work locally

1. Clone the repository and open a terminal at its root.
2. Run `node serve.mjs` and open `http://localhost:8080`.
3. Edit `dist/src/`, `dist/index.html`, or `dist/style.css`.
4. Run `npm run check` before submitting a change.

Keep changes focused. For a solver, geometry, or data-format change, add an independent check of the affected physical invariant or observable behavior. Update documentation when defaults, units, definitions, formats, or model limitations change.

## Repository contents

Commit source, required assets, small presets, tests, and documentation. `dist/` is the live source tree and must remain tracked. Keep generated STL files, movies, experiment datasets, browser profiles, credentials, and reports out of source commits. The ignore rules cover the standard output locations.

Retain vendored notices and corresponding encoder sources. Update `THIRD_PARTY.md` when a dependency changes. Test-only dependencies belong under `tests/vendor/` and must not be loaded by the app.

## Verification

`npm run validate` checks syntax, local modules and workers, assets, and control identities. Hosted-project metadata is optional; a standalone checkout needs no hosting account or configuration.

`npm test` runs numerical and behavioral checks. FFmpeg/ffprobe enable an additional MP4 decode check. Passing tests does not establish physical specimen validity.

For user-control changes, exercise the relevant browser flow. Useful checks include running/pausing an experiment, replaying and returning to live mode, dataset import/export, and displacement amplification with unchanged physical measurements.

CI uses the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) actions. It needs no repository secrets or deployment credentials and runs the same `npm run check` command used locally.

## Issues and pull requests

Report the version, browser/OS, exact steps, material/load settings, and convergence messages. A small design JSON can reproduce many geometry or solver issues. State any display amplification shown in a screenshot. Share experiment records only when appropriate to make them public.

Explain the problem, resulting behavior, and verification performed. For mechanics changes, identify affected equations, assumptions, and boundaries. For replay/data changes, describe compatibility with existing files. Preserve offline operation and the existing licenses.
