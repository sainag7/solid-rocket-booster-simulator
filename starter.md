# Solid Rocket Booster Explorer — Build Spec

A single-page web app for exploring how solid rocket motor selection, thrust
characteristics, and airframe geometry affect flight performance. Audience is
hobby and collegiate rocketry, covering NAR/Tripoli impulse classes A through O.

This is an intuition and teaching tool, not a replacement for OpenRocket. The
priority is a clean, friendly, immediately-legible interface where cause and
effect are obvious. When a design tradeoff comes up between numerical
sophistication and clarity, choose clarity and document the simplification.

---

## 1. Stack

- Vite + React 18 + TypeScript (strict mode)
- Tailwind CSS
- Zustand for state — there are enough coupled parameters that prop drilling
  will get painful
- Recharts for the analysis plots
- Canvas or SVG (your choice) for the launch animation and the rocket diagram
- Vitest for physics unit tests
- No backend, no database, no `localStorage` / `sessionStorage`. All state in
  memory. Persistence is via explicit JSON export/import only.

---

## 2. The central design problem

Impulse class A to class O spans roughly 16,000× in total impulse. Anything
linear — sliders, axis scales, motor lists — works fine for a C motor and falls
apart completely at an M. **Log scaling is not optional.** Impulse and thrust
sliders must be logarithmic, chart axes need to auto-range sensibly, and the
launch animation needs an adaptive vertical scale.

The second thing to get right: **total impulse and average thrust are separate
knobs.** Total impulse is how much push you get. Average thrust is how fast you
spend it. Holding impulse fixed and raising thrust gives a shorter burn, higher
peak acceleration, faster off the rail, and more drag loss at low altitude. That
tradeoff is the interesting part of the app. Everything else is supporting it.

---

## 3. Domain model

### 3.1 Impulse classes

Total impulse doubles each letter. Encode this table as the source of truth:

| Class | Total impulse (N·s) | Tier | Cert required |
|---|---|---|---|
| A | 1.26–2.5 | model | none |
| B | 2.5–5 | model | none |
| C | 5–10 | model | none |
| D | 10–20 | model | none |
| E | 20–40 | mid-power | none |
| F | 40–80 | mid-power | none |
| G | 80–160 | mid-power | none |
| H | 160–320 | high power | L1 |
| I | 320–640 | high power | L1 |
| J | 640–1280 | high power | L2 |
| K | 1280–2560 | high power | L2 |
| L | 2560–5120 | high power | L2 |
| M | 5120–10240 | high power | L3 |
| N | 10240–20480 | high power | L3 |
| O | 20480–40960 | high power | L3 |

Motor designation convention: class letter + average thrust in newtons +
propellant code. `H128W` is a class H motor with 128 N average thrust. Generate
a live designation string from the current parameters and display it.

### 3.2 Motor parameters (user-editable)

- Impulse class (A–O) — constrains the impulse slider to that band
- Total impulse (N·s)
- Average thrust (N) — burn time is derived: `burnTime = totalImpulse / avgThrust`
- Thrust curve shape: `progressive` | `neutral` | `regressive`
- Propellant mass (kg)
- Total motor mass (kg)
- Motor diameter (mm) and length (mm) — needed for the rocket diagram

Derived and displayed read-only: burn time, peak thrust, specific impulse
(`Isp = totalImpulse / (propMass · g0)`), propellant mass fraction.

Do **not** model internal ballistics, grain geometry, propellant chemistry, or
combustion. Curve shape is a presentation-level preset only.

### 3.3 Airframe parameters

- Dry mass (kg), excluding motor
- Body diameter (mm)
- Body tube length (mm)
- Nose cone: shape (`conical` | `ogive` | `parabolic`), length (mm)
- Fins: count (3 or 4), root chord, tip chord, sweep length, semi-span, and
  distance from the aft end (all mm)
- Drag coefficient Cd (default 0.45, user-adjustable 0.2–1.0)
- Launch rail length (m), default 1.8 m for model/mid-power, 2.4 m for high power

---

## 4. Motor data: presets plus editing

Two sources, both feeding the same editable parameter set.

### 4.1 Bundled presets

Ship 7–8 representative motors spanning the range, roughly: an A-class Estes
motor, a C6, an E-class, an F32, an H128, a J350, a K-class, and an M-class.
Each preset populates every motor field, after which the user can edit freely
(editing detaches from the preset and shows a "modified" indicator).

Source the actual numbers from RASP `.eng` files rather than hardcoding values
from memory — see below. If you do hardcode approximate values as a fallback,
mark them clearly in a comment as approximate and needing verification against
ThrustCurve.org.

### 4.2 `.eng` file import

Support importing standard RASP `.eng` files, which is the format ThrustCurve.org
distributes and which every hobby sim tool reads. Format:

```
; optional comment lines start with semicolon
<designation> <diameter_mm> <length_mm> <delays> <propMass_kg> <totalMass_kg> <manufacturer>
<time_s> <thrust_N>
<time_s> <thrust_N>
...
```

The data block ends with a point at zero thrust. Parse it, integrate the
tabulated curve to get total impulse, derive average thrust and burn time, and
populate the motor fields. When a `.eng` curve is loaded, use the **tabulated
curve directly** rather than a synthesized shape, and disable the shape selector
with a note explaining why. The user can revert to synthesized mode at any time.

Handle malformed files gracefully with a readable error, not a crash.

### 4.3 Synthesized thrust curves

When not using imported data, generate F(t) over [0, burnTime] and normalize
numerically so that ∫F dt equals the specified total impulse to within 0.1%.

- `neutral` — roughly flat body with a short ignition spike and a tail-off
- `progressive` — thrust rises through the burn, peaking near the end
- `regressive` — peaks early, decays through the burn

All three include a brief ignition transient over the first 2–5% of burn time.

---

## 5. Flight simulation

Vertical 1-DOF, fixed-step RK4, dt = 0.001 s.

```
m(t) · a = F(t) − D(v) − m(t) · g
```

- **Mass depletion proportional to impulse delivered**, not linear in time.
  This matters for non-neutral curves:
  ```
  m(t) = dryMass + motorMass − propMass · (∫₀ᵗ F dτ / totalImpulse)
  ```
- **Drag**: `D = ½ · ρ(h) · v² · Cd · A`, opposing velocity, where A is the body
  tube frontal area.
- **Atmosphere**: ISA model. Troposphere (0–11 km) with the standard lapse rate,
  then the isothermal stratosphere layer above. Constant density is not
  acceptable — an M motor will comfortably exceed 3 km and the error becomes large.
- **Speed of sound** from ISA temperature, for the Mach readout.
- g = 9.80665, constant is fine at these altitudes.
- Integrate from ignition through burnout to apogee (v crosses zero). Do not
  simulate recovery or descent.

### 5.1 Outputs — headline stat cards

- Apogee
- Max velocity, and Mach at max velocity
- Max acceleration, in g
- Burn time, burnout altitude, burnout velocity
- Time to apogee
- Liftoff thrust-to-weight ratio
- Rail exit velocity (velocity at the moment the rocket has travelled one rail length)

Metric/imperial toggle affecting all displayed values.

### 5.2 Warnings

Friendly, inline, non-blocking. Never prevent the user from running a
configuration — explain instead.

- T/W < 5:1 — "Low thrust-to-weight. Rockets generally want around 5:1 to leave
  the rail with enough airspeed for the fins to work."
- Rail exit velocity < 15 m/s — "Slow off the rail, which makes the rocket
  sensitive to wind on departure."
- Max acceleration > 30 g — flag as structurally demanding on airframe and recovery.
- Mach > 0.8 — "Constant-Cd drag and Barrowman stability both lose accuracy
  transonic. Treat these numbers as rough."
- Static margin outside 1–2 calibers — see stability section.
- Display the certification level implied by the selected class (none / L1 / L2 / L3).

---

## 6. Stability (build this last — see §9)

Compute center of pressure using the **Barrowman equations**, the same subsonic
method OpenRocket uses as its base.

- Nose cone contributes `CNα = 2` at a shape-dependent centroid.
- Body tube contributes negligible normal force under Barrowman.
- Conical transitions contribute per the standard diameter-ratio term.
- Fin set contributes per the standard fin term, with the body-fin interference
  factor applied.

Compute CG from component masses: nose cone, body tube, fin set, and motor,
each at its own centroid. **The motor's contribution changes during the burn**
as propellant depletes, so CG shifts forward and static margin generally
increases through the burn. Show margin at both ignition and burnout — this is
the interesting result and most simple tools omit it.

```
staticMargin = (CP − CG) / bodyDiameter        [calibers]
```

Target band is 1–2 calibers. Below 1 is marginally stable, above about 2.5 the
rocket tends to weathercock into wind. Say this in plain language in the UI.

State clearly in the UI that Barrowman is valid subsonic and degrades above
roughly Mach 0.8.

---

## 7. UI

Two-column layout filling the viewport. Controls on the left at roughly 380 px,
visualization on the right. No modals. Responsive down to ~900 px, then stack to
a single column.

### 7.1 Controls panel

- **Class selector** — horizontal strip of letter chips A→O, grouped visually
  into model / mid-power / high-power tiers. Selected chip highlighted.
- **Preset row** — buttons that populate all motor fields, plus an import
  button for `.eng` files.
- **Sliders** for impulse, average thrust, masses, diameter, Cd, rail length.
  Impulse and thrust sliders are logarithmic. Every slider shows its live
  numeric value and accepts direct numeric entry.
- **"Hold total impulse constant" toggle** — with this on, moving the thrust
  slider adjusts burn time and leaves total impulse fixed. This is the key
  interaction of the whole app. Make it visually prominent and give it a one-line
  inline explanation, not a tooltip.
- **Curve shape** — three-way segmented control.
- **Geometry section** — collapsible, containing nose/body/fin parameters.

### 7.2 Visualization panel

Tabs or a vertical stack, all live-updating as sliders move (debounce ~50 ms if
the sim can't keep up at 60 fps):

1. **Thrust curve** — thrust vs time, area under the curve shaded, total impulse
   annotated on the plot.
2. **Altitude vs time** — burnout and apogee marked.
3. **Velocity and acceleration vs time** — dual axis, clearly distinguished.
4. **Launch animation** — scrubbable timeline with play/pause and speed control
   (0.25× / 1× / 4×). Rocket rises against an altitude-scaled backdrop with
   tick marks; adaptive scale so an A motor and an O motor both read well.
   Exhaust plume intensity tracks instantaneous thrust. Burnout is visually
   distinct. Scrubbing the timeline moves a synchronized cursor on all three
   plots above.
5. **Rocket diagram** — side elevation drawn to scale from the geometry
   parameters, with CP and CG marked and the static margin shown as a labelled
   span between them. Updates live as fin and body parameters change.

**Ghost overlay**: retain the previous configuration as a faded line on all
plots so the user can see exactly what their last change did. This single
feature does more for the "change thrust, see the effect" goal than anything
else in the app. Include a toggle and a "clear ghost" action.

### 7.3 Visual design

- Light and dark mode
- One accent color. No gradients, no drop shadows, no glassmorphism.
- Generous whitespace. Let the charts breathe.
- Tabular-figure font for all numeric readouts so values don't jitter while
  dragging a slider
- Consistent color language for thrust / altitude / velocity / acceleration
  across every chart
- Shared time axis across plots 1–3

### 7.4 Export

- Save the full configuration as JSON; load it back.
- Export the simulation timeseries as CSV.

---

## 8. Acceptance criteria

Write tests for the physics core. The UI can be verified by hand.

- Selecting class O and dragging every slider to both extremes never produces
  `NaN`, `Infinity`, an empty chart, or a broken axis range.
- Numerically integrated thrust curve matches specified total impulse within 0.5%.
- With "hold impulse constant" on, doubling average thrust roughly halves burn
  time and roughly doubles peak acceleration.
- Drag has a large effect: for a small model rocket, apogee with drag enabled
  should be dramatically lower than the drag-free case. If it isn't, the drag
  term is wrong.
- A C-class motor on a ~60 g airframe produces an apogee in the low hundreds of
  metres. Check this against published manufacturer altitude figures for a
  comparable kit rather than trusting the number on its own.
- ISA density at sea level is ~1.225 kg/m³ and decreases monotonically with altitude.
- Static margin at burnout is greater than at ignition for a conventional
  aft-mounted motor.
- Slider dragging stays smooth. If the sim can't hold 60 fps, move it to a Web
  Worker rather than degrading dt.

---

## 9. Build order

Do not build this all at once. Stop at each checkpoint and confirm before
continuing.

1. **Physics core, headless.** Impulse class table, thrust curve generator,
   `.eng` parser, ISA atmosphere, RK4 integrator. Unit tests for every
   acceptance criterion in §8 that doesn't involve the UI. No React yet.
2. **Static charts.** Plots 1–3 wired to a hardcoded configuration.
3. **Controls and live updating.** Sliders, class selector, the hold-impulse
   toggle. This is the point where the app becomes useful — pause here.
4. **Presets, `.eng` import, warnings, ghost overlay, export.**
5. **Launch animation.**
6. **Stability.** Geometry inputs, rocket diagram, Barrowman CP, CG tracking
   through the burn. This is substantially more work than it looks — it means
   building a geometry editor, not adding a number — so treat it as its own
   phase and don't start it until 1–5 are solid.

---

## 10. Explicit non-goals

Say so rather than silently approximating:

- No 6-DOF, no wind, no off-vertical launch angle
- No recovery, descent, or drift modelling
- No staging or clustered motors
- No supersonic drag modelling — Cd is constant and the app says so
- No internal ballistics, grain design, or propellant formulation
- No motor manufacturing guidance of any kind