import { lazy, Suspense, useState, Component } from 'react';
import type { ReactNode } from 'react';
import type { Configuration } from './configuration.js';
import type { FlightView } from './flight-view.js';
import type { Playback } from './use-playback.js';
import { flightPhase } from './playback.js';
import { geometryIssues } from './geometry.js';
import { altitudeLabel, sceneryAt } from './scene-scale.js';
import type { CameraMode } from './scene-scale.js';
import { motorPresets } from './motor-presets.js';
const RocketScene = lazy(() => import('./RocketScene.js'));
const number = (n: number, digits = 2) => n.toLocaleString('en-US', { maximumFractionDigits: digits });

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <div className="scene-fallback">3D could not load. The launch timeline, telemetry, and charts are still available.</div> : this.props.children; }
}

export function LaunchView({ configuration, view, pending, dark, playback }: {
  configuration: Configuration; view: FlightView | null; pending: boolean; dark: boolean; playback: Playback;
}) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('landscape');
  const [cutaway, setCutaway] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const preset = motorPresets[configuration.impulseClass];
  const state = playback.state;
  const duration = view?.motor.curve.burnTimeS ?? 0;
  const end = view?.lastTimeS ?? 0;
  const phase = pending ? 'Calculating flight' : view ? flightPhase(playback.timeS, view.flight, end, duration) : 'Waiting for flight';
  const totalImpulse = view?.motor.curve.totalImpulseNs ?? configuration.totalImpulseNs;
  const maxAltitude = Math.max(1, view?.metrics?.apogeeM ?? view?.playback.reduce((a, b) => Math.max(a, b.altitudeM), 0) ?? 1);
  const issues = geometryIssues(configuration);
  const altitude = pending ? 0 : state?.altitudeM ?? 0;
  const scenery = sceneryAt(altitude);
  return <section className="launch-panel" aria-labelledby="launch-title">
    <div className="launch-heading"><div><span className="eyebrow">FLIGHT SIMULATOR</span><h2 id="launch-title">{pending ? 'Preparing your flight.' : playback.timeS === 0 ? 'Ready for liftoff.' : playback.timeS >= end ? 'Flight complete.' : playback.playing ? 'Flight in progress.' : 'Flight paused.'}</h2></div><div className="launch-motor"><strong>{configuration.source === 'synthesized' ? `Custom class ${configuration.impulseClass}` : preset.name}</strong><span>{configuration.modified ? 'Modified configuration' : 'Sourced motor · example airframe'}</span></div></div>
    <div className={`launch-viewport${dark ? ' night' : ''}${scenery.skyDarkness > 0.5 ? ' space-view' : ''}`}>
      <SceneBoundary><Suspense fallback={<div className="scene-fallback">Loading 3D rocket…</div>}><RocketScene configuration={configuration} playback={playback} cutaway={cutaway} resetCamera={resetCamera} dark={dark} pending={pending} cameraMode={cameraMode} /></Suspense></SceneBoundary>
      <div className="scene-status"><span className={`phase-pill${playback.playing ? ' active' : ''}`} role="status">{phase}</span><strong className="scene-height">{altitudeLabel(altitude)}<small>above launch pad</small></strong><span className="scene-clock">T+ {number(playback.timeS, 2)} s · {scenery.label}</span></div>
      <div className="scene-toolbar"><div className="camera-modes" role="group" aria-label="Camera view"><button aria-pressed={cameraMode === 'landscape'} onClick={() => setCameraMode('landscape')}>Landscape</button><button aria-pressed={cameraMode === 'closeup'} onClick={() => setCameraMode('closeup')}>Rocket close-up</button></div><div className="scene-options"><button onClick={() => setCutaway(value => !value)} aria-pressed={cutaway}>Motor cutaway</button><button onClick={() => setResetCamera(value => value + 1)}>Reset camera</button></div></div>
      <div className="altitude-tape" aria-hidden="true"><span>{number(maxAltitude, 0)} m</span><div className="altitude-track">{[0.25, 0.5, 0.75].map(fraction => <span className="altitude-tick" key={fraction} style={{ bottom: `${fraction * 100}%` }}>{altitudeLabel(maxAltitude * fraction)}</span>)}<i style={{ bottom: `${Math.max(0, Math.min(100, (state?.altitudeM ?? 0) / maxAltitude * 100))}%` }} /></div><span>0 m</span></div>
      <div className="scene-dimensions"><strong>{cameraMode === 'landscape' ? 'Landscape · true distance scale' : 'Following rocket'}</strong><span>{cameraMode === 'landscape' ? 'Orange line leads back to the launch pad' : 'Switch to Landscape to see the ground below'}</span>{cameraMode === 'closeup' && <><strong>{number(configuration.bodyLengthM + configuration.noseLengthM, 2)} m rocket</strong><span>Motor Ø {number(configuration.motorDiameterM * 1000, 1)} × {number(configuration.motorLengthM * 1000, 1)} mm</span></>}<span>Observer 1.8 m · reference tree 8 m</span></div>
    </div>
    <div className="launch-console">
      <div className="playback-controls">
        <button className="launch-button" disabled={!playback.valid} onClick={playback.toggle}>{playback.playing ? 'Ⅱ Pause' : playback.timeS >= end && end > 0 ? '↻ Launch again' : playback.timeS > 0 ? '▶ Resume' : '↑ Launch'}</button>
        <button className="replay-button" disabled={!playback.valid} onClick={playback.replay}>Replay</button>
        <label className="playback-speed">Speed<select value={playback.speed} onChange={event => playback.setSpeed(Number(event.target.value))}><option value={0.25}>0.25×</option><option value={1}>1× · real time</option><option value={4}>4×</option></select></label>
        <span className="burn-summary">{pending ? 'Updating…' : `${number(duration, 3)} s burn · ${number(totalImpulse)} N·s`}</span>
      </div>
      <div className="timeline-heading"><label htmlFor="launch-timeline">Flight timeline</label><span>{number(playback.timeS)} / {number(end)} s</span></div>
      <input id="launch-timeline" className="launch-timeline" type="range" min={0} max={end || 1} step="any" value={playback.timeS} disabled={!playback.valid} onChange={event => playback.seek(Number(event.target.value))} aria-valuetext={`${number(playback.timeS)} seconds, ${phase}`} />
      <div className="timeline-events"><span>Ignition</span>{view?.flight.events.burnout && <button disabled={!playback.valid} onClick={() => playback.seek(duration)}>Burnout {number(duration, 3)} s</button>}<span>{view?.flight.status === 'apogee' ? 'Apogee' : view?.flight.status === 'no-liftoff' ? 'Burn complete' : 'Calculated endpoint'}</span></div>
      <dl className="flight-telemetry">
        <div><dt>Altitude</dt><dd>{number(state?.altitudeM ?? 0, 1)} <span>m</span></dd></div>
        <div><dt>Velocity</dt><dd>{number(state?.velocityMS ?? 0, 1)} <span>m/s</span></dd></div>
        <div><dt>Thrust</dt><dd>{number(state?.thrustN ?? 0, 1)} <span>N</span></dd></div>
        <div><dt>Delivered impulse</dt><dd>{number(state?.impulseNs ?? 0)} <span>N·s</span></dd></div>
      </dl>
      <div className="burn-progress"><label htmlFor="burn-progress">Burn elapsed <strong>{number(Math.min(100, duration > 0 ? playback.timeS / duration * 100 : 0), 0)}%</strong></label><progress id="burn-progress" max={duration || 1} value={Math.min(duration, playback.timeS)} /></div>
      {issues.length > 0 && <div className="geometry-notice" role="status"><strong>Check the rocket dimensions</strong>{issues.map(issue => <p key={issue}>{issue}</p>)}<p>Flight still uses entered mass and diameter; this is not a fit or stability validation.</p></div>}
      <p className="scenery-note">Illustrative landscape: lower clouds at 750 m, higher clouds at 3 km. Sky and stars change with actual altitude; the <a href="https://www.jpl.nasa.gov/edu/resources/lesson-plan/how-far-away-is-space/" target="_blank" rel="noreferrer">100 km space reference</a> appears only if reached. Drag or use arrow keys to orbit; scroll or +/− to zoom.</p>
      <p className="launch-footnote">Vertical ascent to apogee · example airframe · entered mass and Cd. <a href={preset.sourceUrl} target="_blank" rel="noreferrer">{configuration.source === 'synthesized' ? 'Original motor data' : 'Motor data source'} ↗</a></p>
    </div>
  </section>;
}
