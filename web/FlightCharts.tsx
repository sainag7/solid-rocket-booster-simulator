import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisLabel } from './chart-data.js';
import type { ReferenceFlight } from './reference.js';

type PlotKind = 'thrust' | 'altitude' | 'motion';
const value = (number: number, decimals = 2) => number.toFixed(decimals);
const metadata = {
  thrust: { title: 'Thrust', unit: 'Force (N)', key: 'thrustN', color: 'var(--thrust)', description: 'Area under the curve is the total impulse delivered by the motor.' },
  altitude: { title: 'Altitude', unit: 'Height (m)', key: 'altitudeM', color: 'var(--altitude)', description: 'The motor stops at burnout. Momentum carries the rocket to apogee.' },
  motion: { title: 'Velocity & acceleration', unit: 'Velocity (m/s)', key: 'velocityMS', color: 'var(--velocity)', description: 'Velocity stays positive while the rocket climbs. Negative acceleration means it is slowing down.' },
} as const;

function ChartTooltip({ active, label, payload, kind }: {
  active?: boolean | undefined; label?: unknown;
  payload?: readonly { value?: unknown; dataKey?: unknown }[] | undefined; kind: PlotKind;
}) {
  if (!active || label === undefined || !payload?.length) return null;
  const read = (key: string) => Number(payload.find(item => item.dataKey === key)?.value ?? 0);
  return <div className="plot-tooltip">
    <span className="tooltip-time">{value(Number(label), 3)} s after ignition</span>
    {kind === 'thrust' && <p>Thrust <strong>{value(read('thrustN'))} N</strong></p>}
    {kind === 'altitude' && <p>Altitude <strong>{value(read('altitudeM'))} m</strong></p>}
    {kind === 'motion' && <><p>Velocity <strong>{value(read('velocityMS'))} m/s</strong></p><p>Acceleration <strong>{value(read('accelerationG'))} g</strong></p></>}
  </div>;
}

function Plot({ kind, reference }: { kind: PlotKind; reference: ReferenceFlight }) {
  const meta = metadata[kind];
  const { data, axes, flight, motor, metrics } = reference;
  const mainAxis = kind === 'motion' ? axes.velocity : axes[kind];
  const burnout = flight.events.burnout!;
  const apogee = flight.events.apogee!;
  const headingId = `${kind}-title`;
  const descriptionId = `${kind}-description`;
  const accessibleSummary = kind === 'thrust'
    ? `Impulse ${value(motor.curve.totalImpulseNs)} newton seconds.`
    : kind === 'altitude'
      ? `Burnout ${value(burnout.altitudeM)} metres at ${value(burnout.timeS)} seconds; apogee ${value(apogee.altitudeM)} metres at ${value(apogee.timeS)} seconds.`
      : `Maximum velocity ${value(metrics.maxVelocityMS)} metres per second and maximum net acceleration ${value(metrics.maxAccelerationG)} g.`;
  return <section className="plot-section" aria-labelledby={headingId}>
    <div className="plot-heading">
      <div className="flex items-center gap-3"><span className={`series-mark ${kind}`} aria-hidden="true" /><h2 id={headingId}>{meta.title}</h2></div>
      {kind === 'thrust' && <span className="plot-highlight"><strong>{value(motor.curve.totalImpulseNs)} N·s</strong> total impulse</span>}
      {kind === 'altitude' && <span className="plot-highlight"><strong>{value(metrics.apogeeM!, 1)} m</strong> at apogee</span>}
      {kind === 'motion' && <div className="series-legend"><span><i className="velocity" />Velocity</span><span><i className="acceleration" />Acceleration</span></div>}
    </div>
    <div className="axis-titles"><span>{meta.unit}</span>{kind === 'motion' && <span>Acceleration (g)</span>}</div>
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 180 }}>
        <ComposedChart data={data} syncId="reference-flight" syncMethod="value" margin={{ top: 26, right: 8, bottom: 2, left: 8 }}
          accessibilityLayer title={`${meta.title} versus time`} desc={`${meta.description} ${accessibleSummary}`}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="2 5" vertical={false} />
          {kind === 'altitude' && <ReferenceArea x1={0} x2={burnout.timeS} yAxisId="primary" fill="var(--accent)" fillOpacity={0.035} strokeOpacity={0} />}
          <XAxis type="number" dataKey="timeS" domain={axes.time.domain} ticks={axes.time.ticks} allowDataOverflow
            height={28} tickFormatter={axisLabel} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} tickMargin={10} />
          <YAxis yAxisId="primary" type="number" domain={mainAxis.domain} ticks={mainAxis.ticks} width={48}
            tickFormatter={axisLabel} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={10} />
          {/* Reserve the same right-axis width in all three plots to align time. */}
          <YAxis yAxisId="secondary" orientation="right" domain={axes.acceleration.domain} ticks={axes.acceleration.ticks}
            width={48} tick={kind === 'motion' ? { fill: 'var(--muted)', fontSize: 12 } : false}
            tickFormatter={axisLabel} tickLine={false} axisLine={false} tickMargin={10} />
          <ReferenceLine x={burnout.timeS} yAxisId="primary" stroke="var(--event)" strokeDasharray="4 4"
            label={{ value: kind === 'thrust' ? `Burnout ${value(burnout.timeS)} s` : 'Burnout', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 12, offset: 7 }} />
          {kind === 'motion' && <ReferenceLine y={0} yAxisId="secondary" stroke="var(--event)" strokeDasharray="2 4" />}
          {kind === 'thrust' && <Area yAxisId="primary" type="linear" dataKey="thrustN" name="Thrust" unit=" N" stroke={meta.color}
            fill={meta.color} fillOpacity={0.13} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />}
          {kind === 'thrust' && <ReferenceDot x={axes.time.domain[1] * 0.57} y={axes.thrust.domain[1] * 0.55}
            yAxisId="primary" r={0} stroke="none" fill="none"
            label={{ value: `Area = ${value(motor.curve.totalImpulseNs)} N·s`, position: 'center', fill: 'var(--thrust)', fontSize: 12 }} />}
          {kind === 'altitude' && <Line yAxisId="primary" type="linear" dataKey="altitudeM" name="Altitude" unit=" m" stroke={meta.color}
            strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />}
          {kind === 'motion' && <><Line yAxisId="primary" type="linear" dataKey="velocityMS" name="Velocity" unit=" m/s" stroke="var(--velocity)"
            strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            <Line yAxisId="secondary" type="linear" dataKey="accelerationG" name="Acceleration" unit=" g" stroke="var(--acceleration)"
              strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} /></>}
          {kind === 'altitude' && <><ReferenceDot x={burnout.timeS} y={burnout.altitudeM} yAxisId="primary" r={3.5} fill="var(--altitude)" stroke="var(--surface)" strokeWidth={2} />
            <ReferenceDot x={apogee.timeS} y={apogee.altitudeM} yAxisId="primary" r={4} fill="var(--altitude)" stroke="var(--surface)" strokeWidth={2}
              label={{ value: `Apogee ${value(apogee.timeS)} s`, position: 'top', fill: 'var(--altitude)', fontSize: 12, offset: 10 }} /></>}
          <Tooltip cursor={{ stroke: 'var(--cursor)', strokeDasharray: '3 3' }} isAnimationActive={false}
            content={props => <ChartTooltip {...props} kind={kind} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <div className="plot-caption"><p id={descriptionId}>{meta.description}</p><span>Time (s)</span></div>
  </section>;
}

export function FlightCharts({ reference }: { reference: ReferenceFlight }) {
  return <div className="chart-stack"><Plot kind="thrust" reference={reference} /><Plot kind="altitude" reference={reference} /><Plot kind="motion" reference={reference} /></div>;
}
