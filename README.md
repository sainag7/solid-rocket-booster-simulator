# Solid Rocket Booster Explorer

The browser-independent TypeScript physics library, RASP importer, interactive
flight lab, A–O real motor presets, illustrative grain profiles, and 3D launch
playback are implemented. Import UI, exports, and stability remain future work
in [starter.md](starter.md).

## Run

Use Node 22.12+, 24.x, or 26+ in the version ranges in `package.json`. Dependencies
are pinned in `package-lock.json`; the physics core itself has no runtime dependencies.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run demo
npm run dev
```

`npm run test:watch` runs Vitest interactively. `npm run build` builds both the core
and the website; `npm run build:core` builds just the ESM JavaScript, TypeScript
declarations, and source maps into `dist/`. Vite emits the website separately into
`dist/client/`. `npm run preview` serves the built website. The demo reads the
bundled C6 fixture and prints its configuration and results. Simulation and
preference state stay in memory; the client fetches no motor data or external fonts.

## Interactive flight lab

Open the HTTP address printed by `npm run dev`, rather than opening `index.html`
with `file://`; Vite compiles the TypeScript and serves the worker. The React 18 /
Vite / Tailwind / Zustand / Recharts interface begins with the same measured C6
fixture and 70.9 g reference airframe as the headless demo. The controls are on
the left on desktop and above the charts below 900 px. All plots share a numeric
time axis and aligned bounds, with synchronized hover/keyboard tooltips:

- Thrust versus time, with the area shaded and integrated impulse annotated;
  dashed cumulative impulse uses the labeled right axis in N·s.
- Altitude versus time, with burnout and apogee markers.
- Velocity and net acceleration versus time, with separately labeled axes and a
  dashed acceleration line to distinguish it without relying on color alone.

Choose an A–O class, adjust logarithmic impulse/thrust sliders or enter numbers,
and select a grain profile or neutral, progressive, or regressive basic thrust.
Changing class loads a sourced motor and a matching example airframe. Impulse,
thrust, grain, and basic-shape edits use a synthesized teaching curve. A selected
grain profile remains active across class changes, using the new preset's impulse
and duration. Airframe and mass edits keep the current curve and mark the
configuration modified. “Reset to C6” restores all reference settings.

With **Hold total impulse constant** on, thrust changes keep impulse fixed and
change duration. With it off, thrust and impulse change together at fixed duration,
limited to the selected class. Explicit impulse edits always keep average thrust
fixed. Changing class replaces motor dimensions/masses, impulse, average thrust,
and the example airframe's dimensions/mass. It uses the selected real curve unless
a grain profile is active. Adjacent motor classes may share casing sizes.
The default rail follows tier (1.8 / 2.4 m) until explicitly edited.

The UI's minimum impulse is 0.001 N·s above a shared lower boundary (except A),
preserving the lower-class endpoint rule. Input ranges are displayed below each
slider. Numeric entries update on valid input; blank/nonfinite entries revert on
blur, and out-of-range entries clamp on blur. Propellant is capped at 99% of loaded
motor mass and is reduced if loaded mass is lowered past that limit. Zero propellant
is supported, with specific impulse shown as unavailable. Motor dimensions are
drawn to scale in the 3D view; body diameter sets drag in the one-dimensional flight model.

Each edit starts a background Web Worker after a 50 ms debounce. Superseded workers
are terminated and late results ignored. Integration stays at 0.001 s, with no
coarser fallback. Previous results remain visibly marked while a calculation is
pending. Rendering data retain bucket extrema for every plotted channel, exact
events, and every visible thrust knot; the core's full-resolution samples and
metrics are unchanged. Partial flights show only the simulated interval and label
the shaded area as delivered impulse, keeping very long burns from compressing
the charts. Unreached events appear as dashes; no-liftoff and simulation limits
have explicit explanations. Static plots are memoized; playback moves a separate cursor without rebuilding the chart series.

Light/dark mode and all configuration state use memory only. Fonts are bundled.
Presentation code lives in `web/` and is checked separately from the physics build.
The tests cover state transitions, both slider limits at class O, every class,
partial/no-liftoff results, event/extrema retention, and finite axis ranges.
Responsive layout and keyboard support are implemented; browser interaction and
visual QA have not been performed.

Where `document.modelContext` is supported, `read_flight_configuration`,
`configure_motor_class`, and `configure_grain_profile` expose the same in-memory
selection actions as the visible controls. Tool
definitions and valid/invalid state transitions have unit coverage; registration
and invocation in an actual supported WebMCP browser context remain unverified.

## 3D launch playback

The launch viewport shows a dimension-driven Three.js rocket with body, nose,
fins, motor casing, nozzle, launch pad, and rail. Drag to orbit, scroll/pinch to
zoom, use **Reset camera**, or enable **Motor cutaway** to inspect the casing.
Body/nose length, nose shape, and fin dimensions/count are editable. Fit problems
are reported without silently changing the geometry. Geometry does not infer Cd,
dry mass, stability, or a real kit specification.

**Launch** starts at 1× real time by default. Pause/resume, replay, the 0.25×/1×/4×
speed selector, the timeline, and the burnout jump share a single playback clock.
The default **Landscape** camera uses rocket-relative coordinates and pulls back
to frame both the vehicle and launch pad. An orange line connects the rocket to
the pad, and a small locator ring identifies the vehicle when its true size becomes
too small to see. **Rocket close-up** restores the inspection view. Both views
retain actual metre dimensions; the altitude tape and large height readout report
the same simulation altitude as the charts.

The field includes textured grass, a dirt clearing, gravel, a road, trees, a
building, a 30 m water tower, and a 1.8 m observer. A reference tree is 8 m tall.
Cloud layers are fixed at 750–930 m and 3,000–3,350 m; they are illustrative scenery,
not weather inputs. A C6 flight remains below them. The sky gradually darkens at
high altitude, stars fade in above 35 km, and a curved illustrative Earth remains
beneath the vehicle. The 100 km space reference follows
[NASA JPL's explanation](https://www.jpl.nasa.gov/edu/resources/lesson-plan/how-far-away-is-space/).
Scenery never rescales cloud heights or the space threshold to a flight's apogee.
These visual transitions do not change the existing atmospheric or flight model. The exhaust follows instantaneous
thrust and stops emitting at burnout; smoke is decorative. No animation starts
until requested. Hiding the tab pauses playback. Reduced-motion preference removes
smoke and exhaust flicker. A lost/unavailable WebGL context leaves the timeline,
telemetry, and charts usable.

The worker returns a dedicated motion stream at approximately 100 Hz, retaining
all thrust knots, exact events, and its final sample. Motion is interpolated from
that stream; thrust and cumulative impulse use the exact piecewise-linear curve
evaluator. The integrator and headless API are unchanged. Rendering runs at the
display refresh rate, while telemetry and the shared chart cursor update at 20 Hz.
Configuration edits stop playback at the pad, and Launch stays disabled until
the matching calculation completes. No-liftoff flights burn on the pad; normal
flights stop at apogee; partial flights stop at the actual simulation limit.
Recovery and descent are not simulated.

Real motor inputs are bundled in [web/motor-data.ts](web/motor-data.ts), with
original RASP comments, source IDs, URLs, and retrieval dates. See
[motor-sources.md](motor-sources.md) for provenance and the example-airframe rules.
The default C6 retains its original dimensions, masses, and reference flight.

## Grain profiles and impulse delivery

The grain selector uses six qualitative templates from the user-supplied reference:
tubular (progressive), rod and tube (neutral), double anchor (regressive), star
(near-neutral with a shallow dip), multi-fin (boost followed by lower sustain),
and dual composition (two pulses separated by a low positive-thrust interval).
Cross-sections are original SVG schematics. They are not dimensional models,
measurements, or calibrated predictions of real grains or propellant compositions.

Selecting a profile preserves total impulse, average thrust, burn duration, and
both motor and airframe masses, including when the hold-impulse toggle is off.
Peak thrust, impulse delivery timing, and flight results can change. Specific
impulse and average thrust-to-weight remain unchanged for that comparison.
The hold toggle still governs thrust-slider edits. Class, impulse, and thrust
edits keep the selected grain profile; selecting a basic shape clears it. When
class selection loads a new motor preset and example airframe, the selected grain
is applied to that motor's impulse and average thrust as a synthesized curve.
Reset restores the measured C6 and clears grain selection because the fixture
does not identify its grain geometry.

Dimensionless piecewise-linear templates are sampled at 1,001 points, including
every template knot, ignition, and terminal zero. Each curve is normalized to
the requested impulse; duration remains `totalImpulse / averageThrust`. This
models different external thrust schedules without computing internal ballistics,
burn rate, pressure, chemistry, or geometric burnback.

The dashed cumulative line uses the existing analytical integral within each
linear thrust segment. Its sampled values are exact; lines between plotted values
are a visual interpolation. Hover shows thrust, delivered impulse, and delivered
percentage. The half-burn readout reports the fraction delivered at half the full
motor burn, even if the flight simulation stops earlier. Partial flights display
only their integrated time interval and do not fabricate completion of impulse
delivery. This follows the definition of total impulse as the integral of thrust
over time ([NASA](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/)).

The grain tests cover all six profiles at both ends of every A–O band, normalization
within 0.1%, cumulative integrals, burnout mass, profile shape, scaling, selection
and reset behavior, changed flight results, no liftoff, simulation limits, and
invalid input.

## Use the core

```ts
import { generateThrustCurve, simulateFlight } from './src/index.js';

const generated = generateThrustCurve({
  totalImpulseNs: 8.8,
  averageThrustN: 6,
  shape: 'neutral',
});

if (generated.ok) {
  const flight = simulateFlight({
    curve: generated.value,
    motor: { totalMassKg: 0.0231, propellantMassKg: 0.0108 },
    airframe: {
      dryMassKg: 0.0709,
      bodyDiameterM: 0.042,
      dragCoefficient: 0.45,
      railLengthM: 1.8,
    },
  });
  console.log(flight.status, flight.metrics, flight.diagnostics);
}
```

The example is a synthesized teaching curve, not the measured Estes C6 curve.
Use `parseEng(text, sourceName?)` to load measured data; pass an imported motor's
`curve` and mass fields directly to `simulateFlight`. The demo does this.

Public entry points are exported from `src/index.ts`:

- `generateThrustCurve(request)` returns `Result<ThrustCurve>` for a synthesized
  neutral, progressive, or regressive curve. These presets describe external
  thrust only; they do not represent propellant chemistry or internal ballistics.
- `generateGrainThrustCurve({ profile, totalImpulseNs, averageThrustN })` returns
  `Result<ThrustCurve>` with the same SI convention. `GrainProfileId` accepts
  `tubular`, `rod-and-tube`, `double-anchor`, `star`, `multi-fin`, and
  `dual-composition`. `GRAIN_PROFILES` contains the immutable templates and labels;
  `grainProfileFor(id)` returns the matching definition or `null`.
- `parseEng(text, sourceName?)` returns `Result<readonly ImportedMotor[]>`.
  Every record is retained; selecting a motor from a multi-record file is the
  future UI's responsibility. Any malformed record rejects the complete import
  with a one-based line number and readable diagnostic.
- `createThrustCurve(points, source?)` validates custom time/thrust samples and
  derives impulse, average thrust, peak thrust, and burn time. It accepts nonzero
  initial thrust and internal zeroes for analytical fixtures; RASP import follows
  the stricter RASP termination rules.
- `createCurveEvaluator(validatedCurve)` returns a reusable function giving
  instantaneous thrust and cumulative delivered impulse. Build it once per curve.
- `motorPerformance(validatedCurve, motor)` returns burn time, peak thrust,
  specific impulse, and propellant mass fraction. Zero propellant is supported
  for constant-mass reference tests; its specific impulse is `null`.
- `atmosphereAt(altitudeM)` returns temperature, pressure, density, sound speed,
  and an atmosphere-extrapolation flag. A negative altitude uses sea-level values;
  a nonfinite altitude throws a descriptive `RangeError`. The curve evaluator
  likewise rejects nonfinite evaluation times with `RangeError`.
- `simulateFlight(configuration)` validates input and returns samples, events,
  metrics, status, and diagnostics. Derived curve metadata is recomputed from
  samples, so stale metadata cannot corrupt mass depletion. Caller data is not
  mutated, and returned data is serializable for the UI's Web Worker.
- `IMPULSE_CLASSES`, `classifyImpulse`, and `motorDesignation` provide class
  metadata and a computed designation. Imported designations are preserved;
  measured average thrust need not equal the thrust number in a marketed name.

All core lengths are **metres**, masses **kilograms**, times **seconds**, and
thrust **newtons**. The RASP importer converts header dimensions from millimetres.
Dry airframe mass excludes the whole loaded motor. Class endpoints belong to the
lower class: exactly 160 N·s is G. Following the brief, A begins at 1.26 N·s;
values outside A–O classify as `null` but can still be evaluated by the core.
Certification fields are the brief's class-based labels, not a complete rules engine.

## Model and numerical assumptions

The integrator models vertical flight from a sea-level pad to the first apogee.
Gravity is constant at 9.80665 m/s². Frontal area is `π (bodyDiameter / 2)²`;
drag is `0.5 ρ Cd A v |v|` and is subtracted from thrust. Cd remains constant.
There is no wind, tilt, recovery, descent, staging, clustered propulsion,
supersonic drag model, or stability calculation in this checkpoint.

Synthesized curves contain 1,001 points, a transient within the first 4% of burn,
and a tail-off over the last 8%. Their scale is normalized to requested impulse.
The definition `burnTime = totalImpulse / averageThrust` keeps impulse and thrust
independent. Actual imported samples are used without smoothing or rescaling.

Thrust is linear between samples; impulse is the exact integral of those linear
segments. Remaining mass is computed from the fraction of impulse delivered,
including while the rocket is still on the pad. The pad supplies the support force
until thrust exceeds the changing weight. Delayed liftoff is found within the
curve segments, including interior thresholds on falling-thrust segments.

Flight uses RK4 on a fixed **0.001 s grid**. Steps are shortened at thrust knots,
liftoff, and burnout; they are never made larger. This boundary handling prevents
a narrow imported pulse from being skipped. It is not an adaptive accuracy
integrator. Samples include the grid and these boundaries, plus rail exit and
apogee. Rail exit is interpolated within its bracketing step. Apogee uses the
velocity zero crossing and the integral of interpolated velocity for height.

Atmosphere uses standard sea-level temperature 288.15 K and pressure 101325 Pa,
air gas constant 287.05287 J/(kg·K), lapse rate −0.0065 K/m to 11 km, and an
isothermal layer above. Sound speed uses a heat-capacity ratio of 1.4. Continuing
the isothermal layer above 20 km is an explicit approximation; such flights return
an `atmosphere-extrapolation` diagnostic. The lower-atmosphere structure is
described in [NASA's atmosphere overview](https://www.grc.nasa.gov/www/k-12/airplane/atmosmet.html).
Extremely high flights also exceed the usefulness of constant gravity and this
one-dimensional teaching model.

Acceleration samples are net vertical acceleration, zero while supported on the
pad. `maxAccelerationG` is the greatest upward net acceleration divided by g₀,
not accelerometer proper acceleration or the largest absolute deceleration.
“Average thrust-to-weight” is average thrust divided by **initial loaded weight**.
Both maximum Mach and Mach at maximum velocity are returned; they may differ.

## Outcomes and limits

- `apogee`: the first positive-to-zero velocity crossing has been reached. If a
  long weak tail is still burning, burnout remains `null`; descent is not simulated.
- `no-liftoff`: the full burn completed without leaving the pad. Motion remains
  zero, and burnout is recorded. Apogee and rail exit remain `null`.
- `invalid-input`: invalid masses, dimensions, coefficients, curve samples, or
  unrepresentable derived quantities. Metrics are `null`, samples empty, and
  diagnostics explain the input problem.
- `simulation-limit`: 600 seconds or two million integration steps were reached,
  or an extreme configuration exceeded numerical range/stability. Finite partial
  samples and reached events are retained, and diagnostics distinguish the reason.
  An unreached apogee is never replaced by the greatest altitude so far.

Valid unusual configurations are not blocked by performance thresholds. The
core accepts positive dimensions/masses, propellant mass from zero up to but
excluding total motor mass, and nonnegative Cd (including zero for reference
tests). Extremely stiff drag can defeat a fixed-step explicit integrator; a
detected nonphysical reversal is reported as a numerical limit rather than as an
apogee. Unreached events and their associated metrics use `null`, not zero or NaN.
The UI's friendly performance warnings are deferred to checkpoint 4.

## C6 reference and verification

The fixture in `tests/fixtures/estes-c6.eng` retains the header and all 24
time/thrust pairs from page 2 of the [NAR C6 certification sheet](https://www.thrustcurve.org/motors/cert/62e14a0ad917b20004b6c840/C6.pdf).
The importer supplies the implicit origin. The original RASP data is dated
October 3, 2000; its loaded mass is 23.1 g and propellant mass 10.8 g. The PDF's
first page gives different delay-specific loaded masses. Those values have not
been silently substituted into the fixture.

The demonstration integrates 8.817238 N·s, with a 1.86 s burn, 4.740451 N average
thrust, and 14.09 N peak thrust. With a 70.9 g dry airframe, 42 mm diameter,
Cd 0.45, and a 1.8 m rail, the implemented model returns:

- Apogee **194.381 m**, versus **420.104 m** in the drag-free reference.
- Maximum velocity **66.363 m/s**, maximum net acceleration **14.473 g**.
- Burnout at **72.732 m**, rail exit at **17.598 m/s**, apogee at **6.399 s**.
- Average thrust-to-weight **5.142:1**.

[Estes currently lists Big Bertha](https://estesrockets.com/products/big-bertha)
at 70.9 g, 42 mm diameter, and a maximum altitude of 152 m, with C6-5 among its
recommended engines (source checked September 9, 2026). The demo assumes that
listed kit weight excludes the motor. The prediction is about **28% higher**:
it is a broad scale check, not a calibrated match or flight validation. Cd is the
brief's default, not a measured Big Bertha coefficient; fin/launch-lug drag,
build weight, launch equipment, actual atmosphere, and motor variation are not
separately represented. The published maximum is not accompanied by test conditions.

The Vitest cases cover class boundaries, synthesized impulse normalization
at both ends of every class, source-data parsing and malformed imports, exact
partial curve integrals, ISA reference values, analytical powered/coasting
motion, the ideal rocket equation, thrust/impulse tradeoffs, nonlinear mass
depletion, no/delayed liftoff, short pulses, early apogee, missing events, time
limits, numerical instability, and A–O extremes. Type checking, all tests, the
ESM build, and the demo passed on Node 24.5.0.

RASP parsing follows [ThrustCurve's format documentation](https://www.thrustcurve.org/info/raspformat.html).
It tolerates one explicit `(0, 0)` origin and more than 32 samples, preserves
comments and the raw header, and accepts multiple records. It does not fabricate
a missing terminal zero or silently sort, clamp, or repair invalid thrust data.

The flight lab now includes sourced presets and 3D playback. File import UI,
performance warnings, ghost comparison, exports, and stability remain deferred.
