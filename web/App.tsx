import { useState } from 'react';
import type { ReactNode } from 'react';
import { FlightCharts } from './FlightCharts.js';
import { reference } from './reference.js';
import type { ReferenceFlight } from './reference.js';

const number = (value: number, decimals = 1) => value.toFixed(decimals);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="data-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ReferencePanel({ data }: { data: ReferenceFlight }) {
  const { motor, airframe, performance } = data;
  return <aside className="reference-panel" aria-label="Reference configuration">
    <div className="panel-top"><h2>Reference configuration</h2><span className="read-only">Read-only</span></div>
    <section className="motor-section" aria-labelledby="motor-title">
      <div className="motor-identity"><span className="class-tile" aria-label="Impulse class C">C</span><div><h3 id="motor-title">Estes C6</h3><p>Model rocket motor</p></div></div>
      <p className="reference-description">Measured thrust. A familiar starting point for understanding a rocket’s flight.</p>
      <dl className="data-list">
        <Field label="Total impulse">{number(motor.curve.totalImpulseNs, 2)} <span>N·s</span></Field>
        <Field label="Average thrust">{number(motor.curve.averageThrustN, 2)} <span>N</span></Field>
        <Field label="Peak thrust">{number(motor.curve.peakThrustN, 2)} <span>N</span></Field>
        <Field label="Burn time">{number(motor.curve.burnTimeS, 2)} <span>s</span></Field>
      </dl>
      <div className="source-note"><span className="source-icon" aria-hidden="true">✓</span><div><strong>Measured thrust curve</strong><p>From the NAR certification data.</p><a href="https://www.thrustcurve.org/motors/cert/62e14a0ad917b20004b6c840/C6.pdf" target="_blank" rel="noreferrer">View source <span className="sr-only">(opens in a new tab)</span></a></div></div>
    </section>
    <section className="parameter-section" aria-labelledby="airframe-title"><h3 id="airframe-title">Reference airframe</h3><p className="section-note">Big Bertha-sized, with a fixed drag coefficient.</p>
      <dl className="data-list"><Field label="Dry mass">{number(airframe.dryMassKg * 1000)} <span>g</span></Field>
        <Field label="Body diameter">{number(airframe.bodyDiameterM * 1000, 0)} <span>mm</span></Field>
        <Field label="Drag coefficient">{number(airframe.dragCoefficient, 2)}</Field>
        <Field label="Launch rail">{number(airframe.railLengthM)} <span>m</span></Field></dl>
    </section>
    <section className="parameter-section" aria-labelledby="mass-title"><h3 id="mass-title">Motor properties</h3>
      <dl className="data-list"><Field label="Loaded motor mass">{number(motor.totalMassKg * 1000)} <span>g</span></Field>
        <Field label="Propellant mass">{number(motor.propellantMassKg * 1000)} <span>g</span></Field>
        <Field label="Motor dimensions">{number(motor.diameterM * 1000, 0)} × {number(motor.lengthM * 1000, 0)} <span>mm</span></Field>
        <Field label="Specific impulse">{number(performance.specificImpulseS!)} <span>s</span></Field></dl>
    </section>
    <div className="model-note"><strong>A model for intuition</strong><p>Vertical flight in still air. Drag varies with air density; Cd stays fixed. Recovery and descent are not simulated.</p></div>
  </aside>;
}

function Metric({ label, value, unit, detail }: { label: string; value: string; unit: string; detail: string }) {
  return <div className="metric"><dt>{label}</dt><dd>{value}<span>{unit}</span></dd><p>{detail}</p></div>;
}

export function App() {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return <div className={`app-shell${dark ? ' dark' : ''}`}>
    <a className="skip-link" href="#flight-analysis">Skip to flight analysis</a>
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M5 22V6M5 22h18M8 19l5-4 4-7 5-4" /><path d="m17 4 5 0 0 5" /></svg></span><div><span className="brand-title">Solid Rocket Booster</span><span className="brand-subtitle">Explorer</span></div></div>
      <div className="header-actions"><span className="reference-badge">Reference flight</span><button type="button" className="theme-button" onClick={() => setDark(current => !current)} aria-pressed={dark} aria-label="Dark mode">
        {dark ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>}<span>{dark ? 'Dark' : 'Light'}</span></button></div>
    </header>
    {!reference.ok ? <main className="error-state"><h1>The reference flight couldn’t load</h1><p>{reference.message}</p><button type="button" onClick={() => window.location.reload()}>Reload the reference flight</button></main> : <div className="workspace">
      <ReferencePanel data={reference.value} />
      <main id="flight-analysis" className="analysis-panel" tabIndex={-1}>
        <div className="analysis-heading"><div><h1>From thrust to altitude</h1><p>Estes C6 on a 70.9 g airframe</p></div><span className="unit-label">Metric units</span></div>
        <dl className="metrics-grid">
          <Metric label="Apogee" value={number(reference.value.metrics.apogeeM!)} unit="m" detail={`${number(reference.value.metrics.timeToApogeeS!, 2)} s after ignition`} />
          <Metric label="Max velocity" value={number(reference.value.metrics.maxVelocityMS)} unit="m/s" detail={`Mach ${number(reference.value.metrics.machAtMaxVelocity, 2)}`} />
          <Metric label="Max acceleration" value={number(reference.value.metrics.maxAccelerationG)} unit="g" detail="Net upward acceleration" />
          <Metric label="Rail exit velocity" value={number(reference.value.metrics.railExitVelocityMS!)} unit="m/s" detail={`${number(reference.value.metrics.averageThrustToWeight, 2)}:1 average thrust-to-weight`} />
        </dl>
        <div className="plots-intro"><h2>Flight profile</h2><p>Hover a plot, or focus it and use the arrow keys, to compare a moment across the flight.</p></div>
        <FlightCharts reference={reference.value} />
        <footer className="analysis-footer"><p><strong>Burnout</strong> {number(reference.value.metrics.burnoutAltitudeM!, 1)} m altitude / {number(reference.value.metrics.burnoutVelocityMS!, 1)} m/s velocity</p><p>Constant-Cd estimates become rough above Mach 0.8.</p></footer>
      </main>
    </div>}
  </div>;
}
