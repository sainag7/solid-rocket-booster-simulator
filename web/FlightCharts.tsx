import { memo } from 'react';
import type { CSSProperties } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisLabel } from './chart-data.js';
import type { FlightView } from './flight-view.js';

type PlotKind = 'thrust' | 'altitude' | 'motion';
const value = (number: number, decimals = 2) => (number !== 0 && Math.abs(number) < 10 ** -decimals) || Math.abs(number) >= 1e6 ? number.toExponential(2) : number.toFixed(decimals);
const metadata = {
  thrust: { title: 'Thrust & impulse delivery', unit: 'Force (N)', key: 'thrustN', color: 'var(--thrust)', description: 'Shaded area is total impulse. The dashed line tracks impulse delivered since ignition.' },
  altitude: { title: 'Altitude', unit: 'Height (m)', key: 'altitudeM', color: 'var(--altitude)', description: 'The motor stops at burnout. Momentum carries the rocket to apogee.' },
  motion: { title: 'Velocity & acceleration', unit: 'Velocity (m/s)', key: 'velocityMS', color: 'var(--velocity)', description: 'Velocity stays positive while the rocket climbs. Negative acceleration means it is slowing down.' },
} as const;

function ChartTooltip({ active, label, payload, kind, totalImpulseNs }: {
  active?: boolean | undefined; label?: unknown;
  payload?: readonly { value?: unknown; dataKey?: unknown }[] | undefined; kind: PlotKind; totalImpulseNs: number;
}) {
  if (!active || label === undefined || !payload?.length) return null;
  const read = (key: string) => {
    const result = payload.find(item => item.dataKey === key)?.value;
    return typeof result === 'number' ? value(result) : '—';
  };
  const delivered = payload.find(item => item.dataKey === 'cumulativeImpulseNs')?.value;
  const percent = typeof delivered === 'number' ? value(Math.min(100, 100 * delivered / totalImpulseNs), 1) : '—';
  return <div className="plot-tooltip">
    <span className="tooltip-time">{value(Number(label), 3)} s after ignition</span>
    {kind === 'thrust' && <><p>Thrust <strong>{read('thrustN')} N</strong></p><p>Delivered impulse <strong>{read('cumulativeImpulseNs')} N·s</strong></p><p>Of total impulse <strong>{percent}%</strong></p></>}
    {kind === 'altitude' && <p>Altitude <strong>{read('altitudeM')} m</strong></p>}
    {kind === 'motion' && <><p>Velocity <strong>{read('velocityMS')} m/s</strong></p><p>Acceleration <strong>{read('accelerationG')} g</strong></p></>}
  </div>;
}

const Plot = memo(function Plot({ kind, reference }: { kind: PlotKind; reference: FlightView }) {
  const meta = metadata[kind];
  const { data, axes, flight, motor, metrics } = reference;
  const mainAxis = kind === 'motion' ? axes.velocity : axes[kind];
  const secondaryAxis = kind === 'thrust' ? axes.impulse : axes.acceleration;
  const burnout = flight.events.burnout;
  const apogee = flight.events.apogee;
  const headingId = `${kind}-title`;
  const descriptionId = `${kind}-description`;
  const accessibleSummary = kind === 'thrust'
    ? `${motor.profileLabel}. Total impulse ${value(motor.curve.totalImpulseNs)} newton seconds; ${value(reference.halfwayImpulsePercent, 1)} percent delivered halfway through the full motor burn. Solid thrust uses the left force axis; dashed cumulative impulse uses the right impulse axis.`
    : kind === 'altitude'
      ? `${burnout ? `Burnout at ${value(burnout.timeS)} seconds.` : 'Burnout not reached.'} ${apogee ? `Apogee ${value(apogee.altitudeM)} metres at ${value(apogee.timeS)} seconds.` : 'Apogee not reached.'}`
      : metrics ? `Maximum velocity ${value(metrics.maxVelocityMS)} metres per second and maximum net acceleration ${value(metrics.maxAccelerationG)} g.` : 'Motion unavailable.';
  return <section className="plot-section" aria-labelledby={headingId}>
    <div className="plot-heading">
      <div className="flex items-center gap-3"><span className={`series-mark ${kind}`} aria-hidden="true" /><h2 id={headingId}>{meta.title}</h2></div>
      {kind === 'thrust' && <span className="plot-highlight"><strong>{value(motor.curve.totalImpulseNs)} N·s</strong> total impulse</span>}
      {kind === 'altitude' && <span className="plot-highlight">{apogee ? <><strong>{value(apogee.altitudeM, 1)} m</strong> at apogee</> : 'Apogee not reached'}</span>}
      {kind === 'motion' && <div className="series-legend"><span><i className="velocity" />Velocity</span><span><i className="acceleration" />Acceleration</span></div>}
    </div>
    {kind === 'thrust' && <div className="impulse-summary"><p>{motor.profileLabel}</p><div className="series-legend"><span><i className="thrust" />Thrust</span><span><i className="impulse" />Cumulative impulse</span></div></div>}
    <div className="axis-titles"><span>{meta.unit}</span>{kind === 'motion' && <span>Acceleration (g)</span>}{kind === 'thrust' && <span>Cumulative impulse (N·s)</span>}</div>
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 180 }}>
        <ComposedChart data={data} syncId="reference-flight" syncMethod="value" margin={{ top: 26, right: 8, bottom: 2, left: 8 }}
          accessibilityLayer title={`${meta.title} versus time`} desc={`${meta.description} ${accessibleSummary}`}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="2 5" vertical={false} />
          {kind === 'altitude' && <ReferenceArea x1={0} x2={Math.min(motor.curve.burnTimeS, reference.lastTimeS)} yAxisId="primary" fill="var(--accent)" fillOpacity={0.035} strokeOpacity={0} />}
          <XAxis type="number" dataKey="timeS" domain={axes.time.domain} ticks={axes.time.ticks} allowDataOverflow
            height={28} tickFormatter={axisLabel} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} tickMargin={10} />
          <YAxis yAxisId="primary" type="number" domain={mainAxis.domain} ticks={mainAxis.ticks} width={48}
            tickFormatter={axisLabel} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={10} />
          {/* Reserve the same right-axis width in all three plots to align time. */}
          <YAxis yAxisId="secondary" orientation="right" domain={secondaryAxis.domain} ticks={secondaryAxis.ticks}
            width={48} tick={kind !== 'altitude' ? { fill: 'var(--muted)', fontSize: 12 } : false}
            tickFormatter={axisLabel} tickLine={false} axisLine={false} tickMargin={10} />
          {burnout && <ReferenceLine x={motor.curve.burnTimeS} yAxisId="primary" stroke="var(--event)" strokeDasharray="4 4"
            label={{ value: kind === 'thrust' ? `Burn duration ${value(motor.curve.burnTimeS)} s` : 'Burnout', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 12, offset: 7 }} />}
          {kind === 'motion' && <ReferenceLine y={0} yAxisId="secondary" stroke="var(--event)" strokeDasharray="2 4" />}
          {kind === 'thrust' && <Area yAxisId="primary" type="linear" dataKey="thrustN" name="Thrust" unit=" N" stroke={meta.color}
            fill={meta.color} fillOpacity={0.13} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />}
          {kind === 'thrust' && <Line yAxisId="secondary" type="linear" dataKey="cumulativeImpulseNs" name="Cumulative impulse" unit=" N·s" stroke="var(--velocity)"
            strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />}
          {kind === 'thrust' && <ReferenceDot x={axes.time.domain[1] * 0.57} y={axes.thrust.domain[1] * 0.55}
            yAxisId="primary" r={0} stroke="none" fill="none"
            label={{ value: `Area${reference.fullBurnShown ? '' : ' shown'} = ${value(reference.shownImpulseNs)} N·s`, position: 'center', fill: 'var(--thrust)', fontSize: 12 }} />}
          {kind === 'altitude' && <Line yAxisId="primary" type="linear" dataKey="altitudeM" name="Altitude" unit=" m" stroke={meta.color}
            strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />}
          {kind === 'motion' && <><Line yAxisId="primary" type="linear" dataKey="velocityMS" name="Velocity" unit=" m/s" stroke="var(--velocity)"
            strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            <Line yAxisId="secondary" type="linear" dataKey="accelerationG" name="Acceleration" unit=" g" stroke="var(--acceleration)"
              strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} /></>}
          {kind === 'altitude' && burnout && <ReferenceDot x={burnout.timeS} y={burnout.altitudeM} yAxisId="primary" r={3.5} fill="var(--altitude)" stroke="var(--surface)" strokeWidth={2} />}
          {kind === 'altitude' && apogee && <ReferenceDot x={apogee.timeS} y={apogee.altitudeM} yAxisId="primary" r={4} fill="var(--altitude)" stroke="var(--surface)" strokeWidth={2}
              label={{ value: `Apogee ${value(apogee.timeS)} s`, position: 'top', fill: 'var(--altitude)', fontSize: 12, offset: 10 }} />}
          <Tooltip cursor={{ stroke: 'var(--cursor)', strokeDasharray: '3 3' }} isAnimationActive={false}
            content={props => <ChartTooltip {...props} kind={kind} totalImpulseNs={motor.curve.totalImpulseNs} />} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="playback-chart-cursor" aria-hidden="true" />
    </div>
    <div className="plot-caption"><p id={descriptionId}>{kind === 'thrust' && !reference.fullBurnShown ? 'Partial burn shown over the simulated interval. Total motor impulse is listed above.' : meta.description}</p><span>Time (s)</span></div>
    {kind === 'thrust' && <div className="impulse-halfway"><span>Impulse delivered halfway through burn</span><strong>{value(reference.halfwayImpulsePercent, 1)}%</strong></div>}
  </section>;
});

export const FlightCharts = memo(function FlightCharts({ reference, playbackTimeS = 0 }: { reference: FlightView; playbackTimeS?: number }) {
  const [start, end] = reference.axes.time.domain;
  const fraction = Math.max(0, Math.min(1, (playbackTimeS - start) / (end - start)));
  return <div className="chart-stack" style={{ '--playback-progress': fraction } as CSSProperties}><Plot kind="thrust" reference={reference} /><Plot kind="altitude" reference={reference} /><Plot kind="motion" reference={reference} /></div>;
});
