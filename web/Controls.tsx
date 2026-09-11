import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { IMPULSE_CLASSES } from '../src/impulse.js';
import { G0 } from '../src/constants.js';
import { grainProfileFor } from '../src/grain.js';
import { GrainSelector } from './GrainSelector.js';
import { bandFor, boundsFor, clamp, fromSlider, toSlider } from './configuration.js';
import type { NumericParameter } from './configuration.js';
import { configuredMotor } from './flight-view.js';
import { labStore, referenceMotor } from './reference.js';
import { motorPresets } from './motor-presets.js';
import { axisLabel } from './chart-data.js';

const display = (value: number) => Number(value.toPrecision(12)).toString();
const format = (value: number | null | undefined, digits = 2) => value == null ? '—' :
  (value !== 0 && Math.abs(value) < 10 ** -digits) || Math.abs(value) >= 1e6 ? value.toExponential(2) :
    Number(value.toPrecision(digits + 3)).toLocaleString('en-US', { maximumFractionDigits: digits });

function NumericControl({ parameter, label, unit, scale = 1, logarithmic = false }: {
  parameter: NumericParameter; label: string; unit: string; scale?: number; logarithmic?: boolean;
}) {
  const { configuration, setNumber } = useStore(labStore);
  const id = useId();
  const bounds = boundsFor(parameter, configuration);
  const min = Number(display(bounds[0] * scale)), max = Number(display(bounds[1] * scale));
  const value = configuration[parameter] * scale;
  const [draft, setDraft] = useState(display(value));
  const ownChange = useRef<number | null>(null);
  useEffect(() => {
    // Keep a typed decimal intact; slider/class changes still refresh the entry.
    if (ownChange.current !== configuration[parameter]) setDraft(display(value));
    ownChange.current = null;
  }, [value, configuration, parameter]);
  const invalid = draft.trim() === '' || !Number.isFinite(Number(draft)) || Number(draft) < min || Number(draft) > max;
  const commit = () => {
    const entered = draft.trim() === '' ? NaN : Number(draft);
    const committed = Number.isFinite(entered) ? clamp(entered, [min, max]) : value;
    setDraft(display(committed));
    if (committed !== value) setNumber(parameter, committed / scale);
  };
  return <div className="numeric-control">
    <div className="control-heading"><label htmlFor={id}>{label}</label><div className="number-entry">
      <input id={id} type="number" inputMode="decimal" min={min} max={max} step="any" value={draft}
        aria-invalid={invalid} aria-describedby={`${id}-range`} onChange={event => {
          const text = event.target.value;
          setDraft(text);
          const next = Number(text);
          if (text.trim() !== '' && Number.isFinite(next) && next >= min && next <= max) {
            ownChange.current = clamp(next / scale, bounds);
            setNumber(parameter, next / scale);
          }
        }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} />
      <span>{unit}</span></div></div>
    <input className="parameter-slider" type="range" min={0} max={1000} step={1}
      value={clamp(toSlider(configuration[parameter], bounds, logarithmic), [0, 1000])}
      aria-label={`${label} slider`} aria-valuetext={`${display(value)} ${unit}`} aria-describedby={`${id}-range`}
      onChange={event => setNumber(parameter, fromSlider(Number(event.target.value), bounds, logarithmic))} />
    <div className="control-range" id={`${id}-range`}><span>{axisLabel(min)}–{axisLabel(max)} {unit}</span><span>{invalid ? 'Enter a value in this range' : logarithmic ? 'Log scale' : ''}</span></div>
  </div>;
}

export const Controls = memo(function Controls() {
  const { configuration, selectClass, setShape, setGrainProfile, setHoldImpulse, setGeometryChoice, reset } = useStore(labStore);
  const band = bandFor(configuration.impulseClass);
  const preset = motorPresets[configuration.impulseClass];
  const derived = useMemo(() => {
    try { return { data: configuredMotor(configuration, referenceMotor), error: null }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : 'Motor properties could not be calculated.' }; }
  }, [configuration]);
  const performance = derived.data?.performance;
  return <aside className="reference-panel controls-panel" aria-label="Flight controls">
    <div className="panel-top"><h2>Flight controls</h2><button className="text-button" onClick={reset}>Reset to C6</button></div>
    <a className="jump-to-launch" href="#launch-title">View 3D launch ↓</a>
    <fieldset className="class-selector"><legend>Motor class</legend>
      {(['model', 'mid-power', 'high power'] as const).map(tier => <div className="class-group" key={tier}>
        <span className="tier-label">{tier === 'model' ? 'Model · A–D' : tier === 'mid-power' ? 'Mid-power · E–G' : 'High power · H–O'}</span>
        <div className="class-buttons">{IMPULSE_CLASSES.filter(item => item.tier === tier).map(item =>
          <button type="button" key={item.letter} aria-pressed={configuration.impulseClass === item.letter}
            aria-label={`Class ${item.letter}, ${item.minNs} to ${item.maxNs} newton seconds`}
            onClick={() => selectClass(item.letter)}>{item.letter}</button>)}</div>
      </div>)}
    </fieldset>
    <div className="selected-class"><strong>Class {band.letter}</strong><span>{band.minNs}–{band.maxNs.toLocaleString()} N·s · {band.certification === 'none' ? 'No certification' : `${band.certification} certification`}</span></div>
    <p className="control-note">Changing class loads a real motor and a matched example airframe, replacing their dimensions and masses. Adjacent classes may share a casing size.</p>
    <div className="hold-control"><label><input type="checkbox" checked={configuration.holdImpulse} onChange={event => setHoldImpulse(event.target.checked)} /><span>Hold total impulse constant</span></label>
      <p>{configuration.holdImpulse ? 'More thrust, shorter burn. Total impulse stays fixed as you adjust thrust.' : 'Thrust and impulse change together at the same burn duration, within this class.'}</p></div>
    <section className="motor-section" aria-label="Motor performance controls">
      <NumericControl parameter="totalImpulseNs" label="Total impulse" unit="N·s" logarithmic />
      <NumericControl parameter="averageThrustN" label="Average thrust" unit="N" logarithmic />
      <GrainSelector selected={configuration.source === 'synthesized' ? configuration.grainProfile : null} onSelect={setGrainProfile} />
      <fieldset className="shape-selector"><legend>Basic curve shapes</legend><div className="shape-buttons">
        {(['neutral', 'progressive', 'regressive'] as const).map(shape => <button key={shape} type="button"
          aria-pressed={configuration.source === 'synthesized' && configuration.grainProfile === null && configuration.shape === shape}
          onClick={() => setShape(shape)}>{shape}</button>)}</div></fieldset>
      <p className="control-note">{configuration.source !== 'synthesized' ? <>Using the sourced <a href={preset.sourceUrl} target="_blank" rel="noreferrer">{preset.name} curve</a>{configuration.modified ? ' with modified configuration' : ''}; its grain is unknown. Choose a grain profile, basic shape, or edit thrust/impulse to create a teaching curve.</> : configuration.grainProfile ? grainProfileFor(configuration.grainProfile)?.description : 'Synthesized teaching curve with ignition and tail-off. Neutral stays level, progressive rises, and regressive falls.'}</p>
      <dl className="derived-values">
        <div><dt>Burn time</dt><dd>{format(performance?.burnTimeS)} <span>s</span></dd></div>
        <div><dt>Peak thrust</dt><dd>{format(performance?.peakThrustN)} <span>N</span></dd></div>
        <div><dt>Specific impulse</dt><dd>{format(performance?.specificImpulseS)} <span>s</span></dd></div>
        <div><dt>Propellant fraction</dt><dd>{format(configuration.propellantMassKg / configuration.totalMassKg * 100, 1)} <span>%</span></dd></div>
      </dl>
      {derived.error && <p className="control-note" role="alert">{derived.error}</p>}
      <div className="tw-readout"><span>Average thrust-to-weight</span><strong>{format(configuration.averageThrustN / ((configuration.totalMassKg + configuration.dryMassKg) * G0))}:1</strong></div>
    </section>
    <details className="control-details" open><summary>Airframe & launch</summary>
      <p className="control-note">Dry mass excludes the motor. Body diameter sets frontal area for drag.</p>
      <NumericControl parameter="dryMassKg" label="Dry airframe mass" unit="g" scale={1000} logarithmic />
      <NumericControl parameter="bodyDiameterM" label="Body diameter" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="dragCoefficient" label="Drag coefficient" unit="Cd" />
      <NumericControl parameter="railLengthM" label="Launch rail" unit="m" logarithmic />
    </details>
    <details className="control-details"><summary>Motor mass & dimensions</summary>
      <p className="control-note">Loaded mass includes propellant. Reducing loaded mass also reduces propellant if needed to keep casing mass positive.</p>
      <NumericControl parameter="totalMassKg" label="Loaded motor mass" unit="g" scale={1000} logarithmic />
      <NumericControl parameter="propellantMassKg" label="Propellant mass" unit="g" scale={1000} />
      <NumericControl parameter="motorDiameterM" label="Motor diameter" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="motorLengthM" label="Motor length" unit="mm" scale={1000} logarithmic />
      <p className="control-note">Motor dimensions set the 3D casing size. Entered mass and thrust determine flight performance.</p>
    </details>
    <details className="control-details"><summary>Rocket geometry</summary>
      <p className="control-note">Example geometry, drawn to scale. Changing shape does not automatically recalculate mass, Cd, or stability.</p>
      <NumericControl parameter="bodyLengthM" label="Body length" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="noseLengthM" label="Nose length" unit="mm" scale={1000} logarithmic />
      <label className="geometry-select">Nose shape<select value={configuration.noseShape} onChange={event => setGeometryChoice('noseShape', event.target.value as 'conical' | 'ogive' | 'parabolic')}><option value="conical">Conical</option><option value="ogive">Ogive</option><option value="parabolic">Parabolic</option></select></label>
      <label className="geometry-select">Fin count<select value={configuration.finCount} onChange={event => setGeometryChoice('finCount', Number(event.target.value) as 3 | 4)}><option value={3}>3 fins</option><option value={4}>4 fins</option></select></label>
      <NumericControl parameter="finRootM" label="Fin root chord" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="finTipM" label="Fin tip chord" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="finSweepM" label="Fin sweep" unit="mm" scale={1000} />
      <NumericControl parameter="finSpanM" label="Fin span" unit="mm" scale={1000} logarithmic />
      <NumericControl parameter="finOffsetM" label="Fin distance from tail" unit="mm" scale={1000} />
    </details>
    <a className="jump-to-results" href="#flight-analysis">View flight results ↓</a>
    <div className="model-note"><strong>A model for intuition</strong><p>Vertical flight in still air, with constant Cd. Recovery, descent, and stability are not simulated.</p></div>
  </aside>;
});
