# Mechanics and geometry methods

## Interpretation of the reference

The four supplied images are treated as visual evidence of a design language: interconnected cellular pores, thick primary supports, finer branching bridges, nested length scales, spatial variation, and organic departure from regular order. They are not assumed to be calibrated or registered orthogonal projections of a physical object. The application generates a parameterized family rather than tracing one image.

Cellular networks come from half-plane-clipped Voronoi cells of periodic, seeded, jittered points. Zero jitter is ordered. Branching variants place bifurcations between primary and inner cell rings. Hierarchy adds progressively smaller, thinner rings. Triangulated and re-entrant alternatives expose distinct connectivity and concavity. Re-entrant is a geometric description; a negative measured Poisson ratio is not assumed. Cell fragments at the boundary are clipped and bounded; very small fragments do not receive inner rings. A tile with an odd number of staggered seed rows can introduce an order mismatch at its periodic boundary.

Nodes merge by coordinates to 1e-5 mm. Repeated tiles share seam nodes and coincident members; collinear seam segments split at existing nodes. No periodic mechanical boundary conditions are imposed: the assembled array is one finite specimen with grips. Gradients multiply member radii using the normalized X, Y, or radial coordinate. The minimum generator radius is 0.06 mm. This guard is a numerical floor, not a claim of printability.

## Units and degrees of freedom

Length: mm. Force: N. Stress/Young's modulus: MPa = N/mm². Moment: N mm. Energy: N mm = mJ. Each planar node carries (x, y, θ). Circular strut sections use A = πr² and I = πr⁴/4. A graph strut is subdivided into one to three beam elements. Geometric junctions transmit moments through their shared rotational degree of freedom.

## Corotational beam

For a reference length L₀, reference chord angle φ₀, current length L, and current chord angle φ, define engineering axial strain ε = L/L₀ − 1, and relative end rotations α = θ₁ − (φ − φ₀), β = θ₂ − (φ − φ₀). Angles use a principal wrapped representation. Reference sections and reference bending stiffness are retained.

The element potential is

U = A L₀ W(ε) + (2EI/L₀)(α² + αβ + β²).

The axial force is N = Aσ. End moments are M₁ = (2EI/L₀)(2α + β), M₂ = (2EI/L₀)(α + 2β). Global resisting forces are the exact derivatives of U with respect to the six nodal coordinates. The tangent includes the material and rotational terms plus the geometric Hessians of current chord length and angle. This formulation is invariant to rigid translation and rotation within its angle representation. It retains small local elastic bending strains; large rotations do not make the underlying beam law a full finite-strain 3D solid law.

The solver is an independent implementation, not an embedded copy of OpenSees. The general corotational transformation concept is described in the [OpenSees documentation](https://opensees.berkeley.edu/OpenSees/manuals/usermanual/243.htm).

## Material classes

### Linear elastic

σ = Eε; W = Eε²/2. Geometric kinematics remain corotational, so the global structure may respond nonlinearly despite linear material behavior.

### Neo-Hookean axial with elastic bending

For λ = 1 + ε and μ = E/3, nominal axial stress P = μ(λ − λ⁻²), tangent dP/dε = μ(1 + 2λ⁻³), and W = μ(λ² + 2/λ − 3)/2. This is the incompressible uniaxial Neo-Hookean relation. Axial force uses reference area A; bending retains reference EI. Lateral area contraction is implicit only in the nominal axial law, not a fully coupled contracting beam section. Compression below λ = 0.08 is rejected through a large energy barrier. General hyperelastic constitutive relations and their finite-strain context are discussed in [Bower, Applied Mechanics of Solids](https://solidmechanics.org/text/Chapter3_5/Chapter3_5.htm).

### Elastoplastic axial with elastic bending

History variables are signed plastic strain εᵖ and accumulated plastic strain a. For the UI post-yield tangent fraction h, the isotropic hardening modulus is H = Eh/(1−h). Form trial stress σᵗ = E(ε−εᵖ), yield excess f = |σᵗ| − σᵧ − Ha, and plastic multiplier Δγ = max(0, f/(E+H)). Return mapping updates εᵖ by sign(σᵗ)Δγ and a by Δγ. The returned stress is E(ε−εᵖ_new). The algorithmic tangent is E in elasticity and EH/(E+H) after yielding.

The line-search incremental potential includes elastic energy, hardening energy, and σᵧΔγ. History is committed only at converged configurations. The reported stored energy includes elastic axial/bending and isotropic-hardening storage. Plastic dissipation accumulates σᵧΔγ A L₀. Bending remains elastic and does not form a plastic hinge; use this law within that stated approximation.

## Boundary conditions and solver

Bottom boundary nodes fix x, y, and θ. Tension/compression prescribe top-boundary y and θ = 0 while allowing lateral x motion. Shear prescribes top x and θ, keeping top y at its reference value. All boundaries are found in the reference graph to 1e-5 mm. Interior disconnected nodes with no active members carry zero force. Free fragments have no imposed body force or contact.

Displacement-controlled quasi-static Newton iterations assemble forces and tangents, solve for free degrees of freedom with diagonally scaled incomplete-Cholesky-preconditioned conjugate gradients, and use a backtracking energy line search. The incomplete factorization uses a diagonal floor for stability; a descent fallback handles indefinite search directions. This is a local equilibrium solver, not a global minimum search or an arc-length continuation method. Severe instabilities may stop convergence. No physical mass, damping, time integration, or strain rate is assigned to animation frames.

The relative equilibrium error is the largest absolute free translational residual or free moment divided by one characteristic cell length, normalized by max(|grip reaction|, 0.001 N). Default convergence is 1e-4 relative, with an absolute residual floor of 1e-8 N. Only converged load steps enter history. The default outer-iteration cap is 140. A step that fails is flagged and is not committed; it is not silently relabeled equilibrium. Displayed snapshots during iterations are provisional.

## Notches and fracture

A horizontal cut begins at the left edge. Every original strut whose centerline crosses the cut is removed in its entirety, including all subdivisions. Near-horizontal members lying within their own radius of the line are also removed. Consequently this is a discrete graph notch, not an exact machined slot of continuous geometry. The visual dashed cut marks its requested position.

When fracture is enabled, a converged strut fails when its greatest element/end criterion exceeds the chosen strength:

σ_peak = max(0, σ_axial) + max(|M₁|, |M₂|) r/I > σ_strength.

Only the worst offending parent strut is removed per cascade iteration. Equilibrium is resolved at the same displacement until no remaining member exceeds the criterion. Whole-strut deletion reduces direct dependence on the number of beam subdivisions, but the bending stress field and failure sequence still depend on discretization and load increments. Fracture resistance is not regularized by a critical energy release rate; the result is not a K_IC or G_c prediction. Compression-induced bending can trigger tensile-side failure. Pure axial compression alone does not trigger this tensile criterion.

Deleted elastic/stored energy is tracked at deletion as a bookkeeping quantity, including hardening storage where present. It is not automatically an experimentally calibrated fracture energy or a full dynamic energy balance. Sudden failure dissipates/releases energy without resolving a stress wave. Plastic states are committed at equilibria encountered during a fracture cascade.

## Measured quantities

The grip reaction is the summed internal force at prescribed top translation degrees of freedom. Compression signs are reversed in the UI so positive reaction represents the resisting compressive load. Axial strain on the right is the magnitude of imposed specimen extension/compression or engineering shear γ = Δx/H. The CSV includes a nominal apparent stress obtained by dividing reaction by initial width × twice the primary reference strut radius. This envelope thickness is a convention for the planar lattice, not true solid section area. Do not compare nominal stresses across altered thickness conventions without renormalizing.

The color stress is the nonnegative maximum tensile-plus-bending criterion; it is not von Mises stress and does not display pure axial compression magnitude. The strain color is signed member axial engineering strain. Legends autoscale to the current field. Zero force–strain points are measured through converged solves; curves do not contain synthetic trajectories.

## STL geometry

The fabrication model scales in-plane centerlines, thickens each strut by the selected multiplier, and enforces the requested minimum diameter. Profiles are circular capsule unions, the same with larger spherical junctions, or flat ribbons with rounded in-plane ends. Additional layers repeat the graph along Z and connect corresponding nodes by circular vertical struts. These connectors and layers are fabrication-only. Deformed export uses the current nodal chord geometry and retains reference radii modified by print parameters.

An implicit signed field is the exact minimum distance union of the primitive solids before sampling. A conforming six-tetrahedron split of each grid cube extracts the zero surface. Global grid-edge vertex identities ensure shared faces agree. The final mesh is checked for exactly two incident faces per edge, opposing winding across edges, connected components, signed volume, and bounds, then serialized as binary STL with outward normals. The included source preserves enough information to refine the grid.

The mesh is watertight at its sampled resolution. The exporter rejects under-resolved minimum diameters, over-large grids, and invalid edge topology/orientation. Features narrower than the grid, near-tangencies, and two closely spaced surfaces can merge or disappear. Closed-edge topology is not a complete manufacturing certification or proof against every vertex-level singularity. Verify the mesh and printer supports in a slicer. Minimum-diameter clamps may change hierarchy ratios. The live preview depicts analytic primitives; the STL is their grid-resolved union.

## Model boundaries

This model omits self-contact, friction, out-of-plane buckling, 3D torsion, shear deformation, material transverse contraction in the reference beam section, nonlinear bending constitutive laws, finite junction solids, rate dependence, temperature, printing anisotropy, and process defects. There are no claims of full 3D continuum accuracy. Thick/short struts, crowded deep hierarchies, severe local bending, and large compression require a higher-fidelity model. Print layers are not represented by a mechanically equivalent 2D calculation. Material and strength defaults are illustrative; external physical calibration is needed.

This document describes the original planar model. Its analytical checks remain in the current test suite; historical generated reports and results are omitted from the source distribution. Numerical validation is not physical specimen validation.
