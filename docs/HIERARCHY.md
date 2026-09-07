# Extended hierarchy in Canopy 2.3.0

**Structure → Hierarchy** now selects one through six geometric scales. The stored `hierarchy` value is the number of nested levels, 0–5; the primary network is level 0. Both planar inner rings and spatial inner cages use this setting.

For level h, the pore size follows `hierarchyScale^h` and the nominal member radius follows `radius * fineRatio^h`, followed by the selected spatial thickness gradient. These are nested copies linked to the preceding level. Independent topology or material laws at each level are not introduced.

The original constraints remain: radii are clamped to 0.06 mm; very short generated segments can be removed by the geometry rules; nearby nodes/edges are merged. Extremely deep or tightly spaced rings may therefore no longer represent cleanly separated structural scales. Inspect the actual graph and minimum features. More levels increase solver work and replay storage. Export minimum-diameter settings can further thicken or merge small features.

One to three beam elements per parent strut remains a separate numerical control. Adding geometric levels does not establish numerical convergence. The circular slender-beam model does not resolve overlapping printed solids, solid junctions, self-contact, or calibrated fracture energy.

Existing depth-0/1/2 designs retain the same generated graph and constitutive behavior. Older app versions clamp deeper design parameters on regeneration; use version 2.3.0 to edit these deeper designs. Exported replay files retain their explicit graph and states, but starting a new experiment in an older app can change the design.
