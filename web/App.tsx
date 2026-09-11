import { useState } from 'react';
import { useStore } from 'zustand';
import { Controls } from './Controls.js';
import { usePlayback } from './use-playback.js';
import { FlightCharts } from './FlightCharts.js';
import { labStore } from './reference.js';
import { useFlight } from './use-flight.js';

const number = (value: number | null | undefined, decimals = 1) => value == null ? '—' :
  Math.abs(value) >= 100000 || (value !== 0 && Math.abs(value) < 10 ** -decimals) ? value.toExponential(2) : value.toLocaleString('en-US', { maximumFractionDigits: decimals });
function Metric({ label, value, unit, detail }: { label: string; value: string; unit: string; detail: string }) {
  return <div className="metric"><dt>{label}</dt><dd>{value}<span>{unit}</span></dd><p>{detail}</p></div>;
}

export function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const configuration = useStore(labStore, state => state.configuration);
  const [retry, setRetry] = useState(0);
  const { view, pending, error } = useFlight(configuration, retry);
  const metrics = view?.metrics;
  const playback = usePlayback(view, pending);
  return <div className={`app-shell${dark ? ' dark' : ''}`}>
    <a className="skip-link" href="#flight-analysis">Skip to flight analysis</a>
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M5 22V6M5 22h18M8 19l5-4 4-7 5-4" /><path d="m17 4 5 0 0 5" /></svg></span><div><span className="brand-title">Solid Rocket Booster</span><span className="brand-subtitle">Explorer</span></div></div>
      <div className="header-actions"><span className="reference-badge">Interactive flight lab</span><button type="button" className="theme-button" onClick={() => setDark(current => !current)} aria-pressed={dark} aria-label="Dark mode">
        {dark ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>}<span>{dark ? 'Dark' : 'Light'}</span></button></div>
    </header>
    <div className="workspace">
      <Controls />
      <main id="flight-analysis" className="analysis-panel" tabIndex={-1}>
        <div className="analysis-heading"><div><h1>Build it. Launch it. Explore the flight.</h1><p>{view ? `${view.motor.designation} on a ${number(view.airframe.dryMassKg * 1000)} g airframe` : 'Choose a class and adjust the controls to explore a flight.'}</p></div><span className="unit-label">Metric units</span></div>
        <div className="calculation-status" role="status" aria-live="polite">{pending ? (view ? 'Updating flight… Showing the previous result until the new flight is ready.' : 'Calculating your flight…') : error ? 'Calculation unavailable' : 'Flight updated · adjust any control to recalculate'}</div>
        {error && !pending && <div className="result-notice" role="alert"><strong>The flight could not be calculated</strong><p>{error}</p><button className="text-button" onClick={() => setRetry(value => value + 1)}>Retry calculation</button></div>}
        {view && <div aria-busy={pending}>
          {view.flight.status !== 'apogee' && <div className="result-notice">
            <strong>{view.flight.status === 'no-liftoff' ? 'No liftoff' : view.flight.status === 'simulation-limit' ? 'Partial flight result' : 'Check this configuration'}</strong>
            <p>{view.flight.status === 'no-liftoff' ? 'Thrust never exceeded the rocket’s weight during this burn. Increase thrust or reduce mass to leave the pad.' :
              view.flight.status === 'simulation-limit' ? `Integration stopped at ${number(view.lastTimeS, 3)} s. The charts show that interval and only reached events are reported.` : 'Adjust the controls using the diagnostic below.'}</p>
          </div>}
          {view.flight.diagnostics.length > 0 && <div className="diagnostics">{view.flight.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.code}-${index}`}>{diagnostic.message}</p>)}</div>}
          <dl className="metrics-grid">
            <Metric label="Apogee" value={number(metrics?.apogeeM)} unit="m" detail={metrics?.timeToApogeeS == null ? 'Not reached' : `${number(metrics.timeToApogeeS, 2)} s after ignition`} />
            <Metric label="Max velocity" value={number(metrics?.maxVelocityMS)} unit="m/s" detail={`Mach ${number(metrics?.machAtMaxVelocity, 2)}`} />
            <Metric label="Max acceleration" value={number(metrics?.maxAccelerationG)} unit="g" detail="Net upward acceleration" />
            <Metric label="Rail exit velocity" value={number(metrics?.railExitVelocityMS)} unit="m/s" detail={metrics?.railExitVelocityMS == null ? 'Rail exit not reached' : `At ${number(view.flight.events.railExit?.timeS, 3)} s`} />
          </dl>
          <div className="plots-intro"><h2>Flight profile</h2><p>Hover a plot, or focus it and use the arrow keys, to compare a moment across the flight.</p></div>
          <FlightCharts reference={view} playbackTimeS={playback.timeS} />
          <footer className="analysis-footer"><p><strong>Burnout</strong> {metrics?.burnoutAltitudeM == null ? 'Not reached' : `${number(metrics.burnoutAltitudeM)} m altitude / ${number(metrics.burnoutVelocityMS)} m/s velocity`}</p><p><strong>Average thrust-to-weight</strong> {number(metrics?.averageThrustToWeight, 2)}:1</p><p>Constant-Cd estimates become rough above Mach 0.8.</p></footer>
        </div>}
      </main>
    </div>
  </div>;
}
