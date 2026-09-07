# Fine meshes and adaptive simplification — Canopy 2.1

Fine voxel spacing defines the initial printable surface. Adaptive simplification then reduces redundant triangles on smoother regions while retaining more triangles where geometry, curvature, or protected junctions require them. Initial volume sampling is uniform; surface triangle density becomes adaptive during simplification.

## Controls in Print

| Control | Default | Meaning |
| --- | --- | --- |
| Starting voxel size | 0.28 mm | Sampling spacing; enter values down to 0.06 mm. Smaller values capture finer detail and create more initial triangles. |
| Simplify smooth surfaces | On | Run normal-aware quadric edge collapse after the original mesh is complete. |
| Target remaining triangles | 20% | A goal, not a forced reduction. Error and detail protection take priority. |
| Surface error target | 0.03 mm | Approximate simplifier error in absolute units. Automatically capped at 10% of the smallest actual strut diameter. |
| Curvature retention | Curvature-aware | Uses surface-normal variation to preserve curved regions. Strong retention preserves more normal detail; Position only relies on geometric error. |
| Protect junctions & tips | On | Lock original surface vertices near branch junctions and free ends, including notch/fracture tips. |
| Raw triangle limit | 8 million | Options from 2 million to 16 million. Applies before simplification. |
| Grid sample budget | 128 million | Options from 22 million to 512 million. Applies to total computational work; samples are streamed in slices. |

For a fine 32 mm Canopy cell, start with **0.12 mm voxels, a 0.03 mm error target, 20% remaining triangles, Curvature-aware retention, and junction protection on**. The default budgets handle the included example. For finer or larger specimens, raise the raw triangle and grid budgets as needed. The print summary displays the grid sample count before export.

The triangle goal cannot prevent a raw-budget error: simplification requires the complete initial surface. A selected high budget also does not guarantee that every browser/device has sufficient memory. An unsimplified binary STL uses about 50 MB per million triangles; a 16M-triangle file is about 800 MB.

## How memory use was reduced

The mesher stores two adjacent scalar planes instead of the entire 3D scalar field. Shared grid edges are cached only for the current and next plane, preserving matching vertices at slice boundaries. Geometry grows in typed buffers. Topology checking uses compact sorted numeric edge records instead of a large map of string keys. Empty cubes are rejected before their tetrahedra are constructed.

These changes reduce intermediate overhead; the final mesh, simplifier workspace, and STL buffer still need memory. The sample budget controls work over the complete volume, while the triangle budget controls the initial surface size. Export remains in a background worker and can be cancelled using the export dialog.

A sample within 0.001 voxel spacing of zero is perturbed slightly to avoid collapsed Float32 facets at exact grid coincidences. This is much smaller than the sampling spacing and is included in the starting-surface approximation.

## Adaptive surface reduction

The app bundles [meshoptimizer 0.25](https://github.com/zeux/meshoptimizer/tree/v0.25), including its WebAssembly payload and MIT license. Its [simplifier API](https://github.com/zeux/meshoptimizer/blob/v0.25/js/README.md#simplifier) supports absolute error targets, weighted vertex attributes, and locked vertices. Canopy supplies area-weighted surface normals as attributes and keeps selected vertices from the original sampled mesh. It uses neither component pruning nor the library's aggressive/sloppy simplifier.

Curvature raises the cost of collapses that change surface normals. Narrow curved struts therefore tend to retain more triangles per surface area than broad smooth regions. Additional locks preserve vertices within 1.35 times the largest incident radius of junctions and tips; subdivision points of degree two are not locked just because they are beam discretization nodes. Normal retention and explicit locks supplement the geometric error target.

Every candidate is checked against the original mesh for:

- Closed manifold edges and consistent winding.
- The same connected-component count and Euler characteristic.
- No increase in zero-area/degenerate facets.
- At most 1% change in total signed volume.
- A finite reported error estimate within the effective target.

If simplification creates a problematic local connection or collapsed facet, the original neighborhoods around those vertices receive additional locks and the reduction restarts from the original mesh. A volume failure can also reduce the error target. There are at most four attempts. If no candidate passes, the original surface is exported with an explanatory message. The exporter does not close a bad candidate by deleting facets.

The error target is an approximate quadric metric, including normal-attribute error. It is not a certified Hausdorff distance or a guaranteed local wall-thickness tolerance. Total-volume and topology checks complement that metric; no exact global self-intersection or maximum-distance check is performed. The grid approximation also precedes simplification. The viewport remains an analytic print-geometry preview; final triangle counts and checks refer to the exported STL.

## Measured fine-mesh example

The release benchmark used the default hierarchical 3D Canopy graph at 32 mm nominal centerline width, 0.8 mm minimum diameter, and 0.12 mm voxels. It exceeds both former limits: **2,397,648 initial triangles and 22,665,187 grid samples**.

| Quantity | Initial mesh | Simplified mesh |
| --- | ---: | ---: |
| Triangles | 2,397,648 | 515,614 |
| Vertices | 1,198,632 | 257,615 |
| Connected components | 1 | 1 |
| Euler characteristic | −192 | −192 |
| Nonmanifold edges | 0 | 0 |
| Orientation errors | 0 | 0 |
| Degenerate facets | 0 | 0 |
| Volume | 857.6313 mm³ | 851.2068 mm³ |
| Binary STL size | 119.88 MB | 25.78 MB |

This is **78.50% fewer triangles** and **0.749% total volume change**, with a reported error estimate of **0.02998 mm** against a 0.03 mm target. The 20% triangle goal was not forced: detail/error protection stopped at approximately 21.5%. There were 43,417 locked vertices.

The scalar slices occupy 0.641 MB, compared with approximately 90.7 MB for a full scalar grid at the same resolution. These figures describe scalar storage only. The complete Node.js benchmark process peaked near 600 MiB RSS. On the build machine it took approximately 2.74 seconds to mesh/check and 4.66 seconds to simplify/check; browser timing and memory differ by device.

The source distribution omits generated print files and measurements. The following command creates `examples/prints/canopy_3d_adaptive_fine_32mm.stl` and `docs/results/meshing-summary.json`:

```bash
node scripts/mesh-benchmark.mjs
```

Run `node scripts/generate-examples.mjs` to generate the separate unsimplified round, reinforced-node, and square reference prints and their measurements.

## Verification

The original meshing release passed 28 numerical/geometry checks. Run the expanded current suite with `node --test tests/*.test.mjs`. The added checks measure a simplified capsule against its analytical surface at triangle centers and edge midpoints, verify that protected junction/tip vertices survive in all three profiles, preserve a thin connected neck and a separate small component, confirm the original-mesh option, and exercise adjustable budgets. The capsule test requires sampled deviation below 0.025 mm at a 0.02 mm simplifier target and 0.12 mm initial grid.

The fine benchmark independently verifies a surface above the former 2M triangle and 22M sample limits. Mechanical equations and beam discretization are unchanged by print simplification. No browser automation or physical printing was performed for this update.
