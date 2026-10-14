# Phase Shift — prototype breakdown

## Design question

Can a platforming puzzle be solved by changing the behavior of the same material,
rather than exchanging three preset character shapes?

The player is one collection of 128 persistent particles. The rooms introduce
buoyancy, flowing through real gaps, settling into a mold and freezing the current
arrangement. Optional sparks invite another route without preventing completion.

## The model

`physics.mjs` owns the material state and collision rules. Each phase changes the
forces and constraints applied to the particles:

- Liquid uses local pressure, separation, cohesion, viscosity and gravity.
- Gas adds buoyancy, repulsion, drag, bounded confinement and turbulent motion.
- Solid records the current arrangement as shape-matched rigid pieces. Separate
  pools become separate ice pieces, rather than one invisible connecting body.

Changing phase preserves particle identities, mass, positions and velocities.
The visible color/surface transition takes 0.65 seconds. A transition can be
rejected when the material is inside a liquid-only filter.

The controller advances fixed 1/120-second substeps. Per-particle terrain contact
determines what fits through a gap; there is no replacement rectangular player
collider. Freezing a shallow puddle captures shallow ice, which can slide through
a low tunnel. The mold releases its clamps when the matter freezes.

## Architecture

| File | Responsibility |
| --- | --- |
| `game-core.mjs` | Room data, phase names and the Game wrapper. |
| `physics.mjs` | Material simulation, collisions, actions and state. |
| `matter-renderer.mjs` | Visible liquid, vapor and ice from particle state. |
| `main.mjs` | Input, camera, HUD, sound, overlays and fixed-step loop. |
| `viewport.mjs` | Maps pointer positions through scaling/fullscreen letterboxing. |

Liquid is drawn from its density surface, vapor from overlapping kernels and
wisps, and ice from captured bonds. The particle-inspection mode exposes the
underlying points to help connect the presentation to the model.

## First-play and feedback

An opening panel explains the goal and phase controls before the simulation
starts. A help dialog pauses active play and restores it only when it was running
before help opened. Room hints describe possible routes. Tabs show completed
rooms, and active phase buttons expose their state to assistive technology.

Touch controls remain inside the fullscreen game element. The input mapping
accounts for empty letterbox space so grabbing the visible material remains
accurate. The keyboard does not hijack Space when a button has focus. Sound is
opt-in and the app pauses when the window loses focus.

## Validation and limits

Run `node --test tests/*.test.mjs`. The suite checks conservation and phase
continuity, liquid spreading, vapor behavior, frozen shapes, rotation, physical
pores, blocked transitions, dragging, timestep consistency, sustained stability,
reset and a complete route through each of the three rooms. Additional viewport
checks cover fullscreen letterboxing and a phone-sized, scrolled view.

This is a coarse game-oriented particle model. It does not simulate molecular
chemistry, thermodynamic phase equilibrium or engineering-grade fluid dynamics.
Steering and gas confinement help make the material playable. Rendering and
simulation still need profiling across more devices; this release has not been
tested on physical Android/iOS hardware.

## Development attribution

This is an AI-assisted prototype. The creator supplied the concept, creative
direction and iteration requests; implementation, polish and verification used
substantial AI assistance. The source, tests and this breakdown make the work
inspectable. Understanding and modifying the implementation is an ongoing part
of the learning process.

## A five-minute code walkthrough

Start with the three entries in `LEVELS` in `game-core.mjs`. Follow `shift`, the
force/update code and the solid shape-capture code in `physics.mjs`, then follow
one frame in `main.mjs`. Explain why liquid can cross the blue grate but gas
cannot, and why freezing early can create ice too tall for the tunnel.

For an experiment, compare the same initial material frozen immediately and
after settling. Change one physical parameter at a time and rerun the relevant
checks. Future work includes more rooms, additional controller support and
device performance profiling.
