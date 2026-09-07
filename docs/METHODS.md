# Canopy v2 — Spatial geometry and mechanics

## Design language and connected 3D cells

The reference suggests open cellular pores, primary supports, finer internal bridges, nested scales, and variation between ordered and organic structures. It does not provide calibrated orthogonal views from which an exact solid can be reconstructed. Canopy generates a parameterized family inspired by that language.

Version 2 defaults to a volumetric cell. The Kelvin family uses truncated-octahedron edges on a body-centered cubic arrangement, clipped to the chosen tile box. Crystal retains its ordered geometry; Canopy perturbs its vertices; Venation adds bifurcated connections to inset cages. Mineral uses an octet graph on face-centered cubic points. The additional diamond option connects tetrahedral neighbors. Re-entrant uses inward-bowed cube edges. These names describe geometry; the app does not assume any topology has a measured negative Poisson ratio.

Width, height, and depth are independent. Cell counts divide a tile along X/Y/Z; repeat counts assemble copies of that tile. Hierarchy inserts progressively smaller cages with radius multiplied by `fineRatio` at each level. Disorder is seeded and deterministic, agrees on opposing tile faces, and preserves face-normal positions. Seam coordinates are merged to 1e-5 mm; coincident members are deduplicated. A member is split when an existing node lies on its centerline. Arbitrary crossing members or overlapping thick struts do not automatically gain a mechanical joint unless they share a graph node.

Thickness gradients use normalized X, Y, Z, or radial position. The minimum generated radius is 0.06 mm, a numerical guard rather than a printability claim. Up to 64 cubic boxes are allowed across cell counts and repeat counts combined. High hierarchy can still produce a large system. Geometrically repeated specimens use finite grip boundary conditions, not periodic homogenization conditions.

The selectable legacy planar mode retains the v1 generator and solver. Importing a v1 design selects that mode. Its original methods and design presets are preserved in `docs/legacy-planar/` and `examples/legacy-planar/designs/`. Generated reports and print files are omitted from this source distribution.

## Units and spatial degrees of freedom

Lengths are mm; forces N; stress and Young's modulus MPa = N/mm²; moments N mm; energies N mm = mJ. A spatial node carries three translations and a rotation vector: `(x, y, z, rx, ry, rz)`. Rotations transport a reference material frame using Rodrigues' formula. Circular reference sections use `A = πr²`, `I = πr⁴/4`, and `J = 2I`. The shear modulus is `G = E/[2(1+ν)]`, or `E/3` for the incompressible Neo-Hookean option. Junctions transmit bending and torsion through shared rotations. Each graph strut is subdivided into one to three elements.

## Objective director-beam energy

This is an independently implemented reduced-order spatial beam model. Let `L0` and `L` be reference and current element lengths, and `t` the current unit chord. Engineering axial strain is `ε = L/L0 − 1`. Rotating the reference tangent with the end-node rotations gives material tangents `u1` and `u2`. Their local bending vectors are the minimal rotations from `t` to each tangent:

`a = angle(t,u1) normalize(t × u1)` and `b = angle(t,u2) normalize(t × u2)`.

The zero-angle limit is evaluated by a series. Reference transverse material directors are similarly transported, then projected perpendicular to `t`. The signed angle between those projections gives the relative twist `ψ`. The element potential is

`U = A L0 W(ε) + (2EI/L0)(a·a + a·b + b·b) + (GJ/2L0) ψ²`.

This energy is invariant under a common rigid transformation of the nodal positions and material frames. At the undeformed state it recovers circular Euler–Bernoulli bending in both transverse directions, axial stiffness `EA/L0`, and torsional stiffness `GJ/L0`. Reference areas and bending/torsion stiffnesses are retained. Large common rotations are allowed, but local bending/twist remains a small-strain beam approximation. Directors can become singular at extreme local angles; the app reports an error rather than treating the result as equilibrium.

The 12 element forces are exact first derivatives of this discrete potential, computed with forward automatic differentiation. The quasi-Newton tangent contains the constitutive Jacobian terms and the exact axial geometric Hessian. It omits rotational geometric Hessian terms. It therefore equals the exact linearized stiffness at rest, but is **not** claimed to be the full Hessian at a deformed state. An energy line search controls each accepted update.

For background, the [OpenSees corotational documentation](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/geomTransf/Corotational02.html) describes the use of small-strain frame elements in large-deformation analysis. This implementation is not OpenSees' Corotational02 algorithm. The [FEniCSx 3D beam tour](https://bleyerj.github.io/comet-fenicsx/tours/beams/beams_3D/beams_3D.html) documents six-degree-of-freedom beam kinematics and axial, bending, and torsional stiffnesses; its Timoshenko formulation includes shear deformation, which Canopy omits.

## Material classes

All three laws affect axial behavior. Bending and torsion remain elastic with the reference section.

- **Linear elastic:** `σ = Eε`, `W = Eε²/2`. The global response can still be geometrically nonlinear.
- **Neo-Hookean axial:** with `λ = 1+ε` and `μ = E/3`, nominal stress is `P = μ(λ − λ⁻²)`, tangent `μ(1+2λ⁻³)`, and `W = μ(λ²+2/λ−3)/2`. The force uses reference area. Section contraction is not explicitly coupled to bending or twist. Compression below `λ = 0.08` is rejected by an energy barrier.
- **Elastoplastic axial:** uniaxial return mapping uses signed plastic strain `εp`, accumulated plastic strain `α`, and isotropic hardening `H = Eh/(1−h)`, where `h` is the UI post-yield tangent fraction. Trial stress is `E(ε−εp)`; the plastic increment is `max(0,(|σtrial|−σyield−Hα)/(E+H))`. The post-yield tangent is `EH/(E+H)`. No plastic bending hinges or torsional yielding are modeled.

Plastic history is committed only after convergence. The incremental line-search potential includes elastic and hardening storage plus yield dissipation. Reported plastic dissipation accumulates `σyield Δγ A L0`. Unloading to zero prescribed displacement can leave a nonzero compressive reaction because plastic strain remains; it is not a release to zero force.

## Boundary conditions and numerical solve

Choose a normal load axis X, Y, or Z. Nodes on its lower reference face fix all six degrees of freedom. Tension/compression prescribe the upper face's axial displacement and zero rotations while allowing the other two translations. Shear holds the upper face's normal displacement at zero, prescribes displacement along the selected perpendicular shear direction, and fixes rotations; the remaining transverse translation is free. Face membership is found to 1e-5 mm in the reference graph.

The solver uses displacement-controlled quasi-static increments, a sparse incomplete-Cholesky-preconditioned conjugate-gradient solve, quasi-Newton iterations, and a backtracking energy line search. Diagonal regularization and a descent fallback handle poorly conditioned or indefinite search directions. The default outer cap is 140 iterations per equilibrium attempt. It is a local equilibrium algorithm, without arc-length continuation or a global stability/eigenmode search. Perfect symmetry can prevent a bifurcation from being explored; seed disorder supplies a geometric imperfection but does not guarantee branch selection.

The relative residual is the largest free translational force or free rotational generalized force divided by a characteristic cell length, normalized by `max(|grip reaction|,0.001 N)`. Default tolerance is 1e-4, with an absolute floor of 1e-8 N. Only converged steps enter the response chart and CSV. Intermediate geometry, reaction, and colors are provisional; a stalled step is explicitly flagged and not committed. Free disconnected fragments have no contact or body force.

The background worker updates the frontend as iterations proceed. Animation is solver progress, not physical time: there is no mass, strain rate, damping, or dynamic fracture wave.

## Spatial notch and fracture

A notch is a constant-Y cut extending from the X=0 face to the requested X depth. Its Y position and centered Z span are adjustable. A 100% Z span makes a through-depth notch; a smaller span makes an internal partial-depth cut from the left. The cut orientation remains fixed to these design axes even when a different load axis is selected.

Original graph struts whose centerlines intersect the requested rectangle are removed in their entirety, including all their subdivisions. Near-coplanar segments are also checked within their radius. This is a discrete graph notch, not a machined slot. The view's dashed rectangle marks the requested cut; cutaway rendering only clips the display and never changes mechanics or export.

At each converged configuration, calculate circular-section bending moments

`M1 = (2EI/L0)(2a+b)` and `M2 = (2EI/L0)(a+2b)`.

With torque `T = GJ ψ/L0`, the tensile-side normal stress and torsional surface shear are approximated as

`σn = σaxial + max(|M1|,|M2|) r/I`, `τ = |T| r/J`.

The failure/color measure is the maximum tensile principal stress of that combined surface state:

`σpeak = max(0, σn/2 + sqrt((σn/2)² + τ²))`.

When enabled, brittle failure removes the worst parent strut exceeding the specified strength, then resolves equilibrium at the same displacement. The cascade continues until no remaining strut exceeds strength or the solver stalls. Whole-strut deletion reduces direct dependence on the number of subdivisions, but stress resolution, load increments, and the discrete graph still influence failure paths. Deleted stored energy is recorded for bookkeeping. There is no calibrated fracture-energy regularization, no `K_IC` or `G_c` prediction, and no dynamics. Pure axial compression alone does not trigger this tensile criterion.

## Readouts and exports

Reaction sums the constrained upper-face internal force along the active displacement direction. Compression is displayed with positive resisting force. Nominal stress divides by the initial envelope area perpendicular to the normal load axis. This is a specimen-level apparent stress, not solid strut area or a homogenized elastic tensor. The displayed strain is applied extension/compression magnitude or engineering shear displacement divided by normal specimen length.

Color fields show tensile principal-stress criterion or signed axial engineering strain. `max |ΔZ|` always means maximum global Z displacement, regardless of the chosen load axis; it is not a direction-independent measure of transverse deformation. Torsional energy is a subset of total stored energy. Design JSON v2 includes parameters, graph, six-DOF state, XYZ positions, and history. Opening it regenerates the design and starts a fresh solve. CSV includes converged reaction, nominal stress, stored/torsional/deleted energies, plastic dissipation, broken struts, and residual.

## Fused spatial STL

The complete XYZ graph is uniformly scaled by the nominal print width. Full 3D repeats are part of the design and mechanics. The legacy print-layer count is ignored in 3D mode. Circular thickening unions capsules and node spheres; junction reinforcement enlarges node spheres; the square profile unions oriented square-section prisms with extended ends. The square reference orientation is deterministic per strut. It is stored under the internal legacy key `ribbon`, whose meaning remains flat ribbon only for planar designs.

The exporter samples the implicit union and triangulates with marching tetrahedra using shared edge vertices. It checks closed edges, winding consistency, and connected components before writing binary STL. Coordinates are mm; outside dimensions include thickness beyond the nominal centerline width. Minimum-feature resolution requires at least 2.6 grid cells per minimum diameter, with default raw budgets of 128 million grid samples and 8 million triangles, adjustable to 512 million and 16 million. The volume is processed using two scalar slices, compact typed geometry buffers, and shared edge caches at slice boundaries. A notch or extensive fracture can create separate solids; the component count is reported.

The preview displays analytic primitives; the exported surface is their sampled union. Print thickening, minimum-wall overrides, square sections, and reinforced junctions are fabrication transformations: the mechanics retain the design's circular beam sections. Intersecting printed solids can also introduce extra joints absent from the graph. Match structural geometry and calibrate material properties before comparing a print to a computed response. Deformed printing uses available beam nodes; cutaway clipping is never exported.

## Adaptive export in version 2.1

After fine-grid meshing, a bundled meshoptimizer WebAssembly routine performs normal-aware quadric edge collapse. It preserves selected original surface vertices, with explicit locks at junctions/tips, an approximate error target in mm, and a target remaining-triangle fraction. Curvature influences the distribution of surviving triangles. The exporter verifies closed edges, consistent winding, component count, Euler characteristic, degenerate facets, and total volume change (at most 1%). Failed candidates trigger additional local protection or a smaller error target; an unresolved failure exports the original mesh. This changes print triangulation, not mechanical discretization. Read [MESHING.md](MESHING.md) for the complete method and measured benchmark.

## Verification and practical scope

`node --test tests/*.test.mjs` runs the current checks covering the legacy solver plus spatial energy gradients for all material classes, rest stiffness, rigid-motion invariance, axial loading on all axes, cantilever bending in both planes, analytical torsion, connectivity/repeat seams, partial-depth notch behavior, complete spatial export, closed STL profiles, and equilibrium force balance with nonzero Z deformation and torsional energy.

The original release validation included six spatial load histories and three fused STL checks. All six paths converged, including a notched example with 20 failed struts and complete loss of its spanning load path. These are implementation checks, not experimental material validation. Those release checks did not include browser automation or physical printing.

Use the model for exploratory slender-lattice mechanics. It omits shear deformation, self-contact, solid-junction stress concentrations, print defects, section warping/contraction coupling, plastic bending/torsion, and calibrated crack energetics. It captures spatial deformations permitted by the beam graph, but does not certify a global buckling load or stability branch. Large local rotations, extreme hierarchy, short thick members, and instabilities can exceed its approximation or numerical range. Compare smaller increments and refined struts when a quantitative result matters.
