# Solid Rocket Booster Explorer

Checkpoints 1 and 2 are implemented: a browser-independent TypeScript physics
library, RASP importer, deterministic command-line demo, and a React chart view
of a fixed C6 reference flight. Editable controls, the preset catalog, exports,
animation, and stability belong to later checkpoints in [starter.md](starter.md).

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

## Chart view

The React 18 / Vite / Tailwind / Recharts interface uses the same measured C6
fixture and 70.9 g reference airframe as the headless demo. Configuration is
read-only for checkpoint 2. All three plots share a numeric 0–7 s time axis and
aligned plot bounds, with synchronized hover/keyboard tooltips:

- Thrust versus time, with the area shaded and integrated impulse annotated.
- Altitude versus time, with burnout and apogee markers.
- Velocity and net acceleration versus time, with separately labeled axes and a
  dashed acceleration line to distinguish it without relying on color alone.

The view preserves all 6,405 physics/event samples, including the ignition peak.
The simulation runs once when the reference module loads. A light/dark toggle
uses memory only; its initial setting follows the system preference. The layout
stacks below 900 px. Fonts are bundled locally. Presentation code lives in `web/`
and is checked separately, leaving the physics build free of browser types.

The chart-data tests check unit conversion, event retention, the thrust peak,
and finite, legible axis ranges. Responsive layout and keyboard support are
implemented; browser interaction and visual QA have not been performed.

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
  mutated, and returned data is serializable for a future Web Worker.
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

The 180 Vitest cases cover class boundaries, synthesized impulse normalization
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

Checkpoint 2 stops at these static-reference charts. Checkpoint 3 adds the class
selector, editable parameters, hold-impulse interaction, and live updating; it has
not been started.
