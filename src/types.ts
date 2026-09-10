export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly line?: number;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly Diagnostic[] };

export type CurveShape = 'neutral' | 'progressive' | 'regressive';
export interface ThrustPoint {
  readonly timeS: number;
  readonly thrustN: number;
}

/** Plain, serializable data; derived fields are recomputed when simulating. */
export interface ThrustCurve {
  readonly source: 'synthesized' | 'imported' | 'custom';
  readonly points: readonly ThrustPoint[];
  readonly totalImpulseNs: number;
  readonly averageThrustN: number;
  readonly peakThrustN: number;
  readonly burnTimeS: number;
}

export interface MotorMass {
  readonly propellantMassKg: number;
  readonly totalMassKg: number;
}

export interface ImportedMotor extends MotorMass {
  readonly designation: string;
  readonly manufacturer: string;
  readonly diameterM: number;
  readonly lengthM: number;
  readonly delays: string;
  readonly curve: ThrustCurve;
  readonly metadata: {
    readonly sourceName: string | null;
    readonly headerLine: number;
    readonly rawHeader: string;
    readonly comments: readonly string[];
  };
}

export interface Atmosphere {
  readonly temperatureK: number;
  readonly pressurePa: number;
  readonly densityKgM3: number;
  readonly speedOfSoundMS: number;
  readonly extrapolated: boolean;
}

export interface FlightConfiguration {
  readonly curve: ThrustCurve;
  readonly motor: MotorMass;
  readonly airframe: {
    /** Excludes the entire loaded motor. */
    readonly dryMassKg: number;
    readonly bodyDiameterM: number;
    /** Zero enables analytical drag-free reference cases. */
    readonly dragCoefficient: number;
    readonly railLengthM: number;
  };
}

export interface FlightSample {
  readonly timeS: number;
  readonly altitudeM: number;
  readonly velocityMS: number;
  /** Net vertical acceleration, not accelerometer proper acceleration. */
  readonly accelerationMS2: number;
  readonly thrustN: number;
  readonly massKg: number;
  readonly densityKgM3: number;
  readonly mach: number;
}

export interface FlightEvents {
  readonly liftoff: FlightSample | null;
  readonly railExit: FlightSample | null;
  readonly burnout: FlightSample | null;
  readonly apogee: FlightSample | null;
}

export interface FlightMetrics {
  readonly apogeeM: number | null;
  readonly maxVelocityMS: number;
  readonly machAtMaxVelocity: number;
  readonly maxMach: number;
  readonly maxAccelerationG: number;
  readonly burnTimeS: number;
  readonly burnoutAltitudeM: number | null;
  readonly burnoutVelocityMS: number | null;
  readonly timeToApogeeS: number | null;
  readonly averageThrustToWeight: number;
  readonly railExitVelocityMS: number | null;
}

export type SimulationStatus = 'apogee' | 'no-liftoff' | 'invalid-input' | 'simulation-limit';
export interface SimulationResult {
  readonly status: SimulationStatus;
  readonly samples: readonly FlightSample[];
  readonly events: FlightEvents;
  /** Null only when input validation fails before integration begins. */
  readonly metrics: FlightMetrics | null;
  readonly diagnostics: readonly Diagnostic[];
}
