/** Visual reference scenery only; these cloud layers do not affect flight physics. */
export const CLOUD_LAYERS = [
  { baseM: 750, depthM: 180, label: 'Lower clouds' },
  { baseM: 3000, depthM: 350, label: 'Higher clouds' },
] as const;
export const SPACE_REFERENCE_M = 100000;
export type CameraMode = 'landscape' | 'closeup';
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function sceneryAt(altitudeM: number) {
  const altitude = Math.max(0, Number.isFinite(altitudeM) ? altitudeM : 0);
  return {
    skyDarkness: smooth(12000, 85000, altitude),
    starsOpacity: smooth(35000, SPACE_REFERENCE_M, altitude),
    atmosphereOpacity: smooth(15000, 65000, altitude),
    label: altitude < 8 ? 'Launch field' : altitude < 100 ? 'Above the treetops' : altitude < 750 ? 'Below the clouds' :
      altitude < 930 ? 'Through lower clouds' : altitude < 3000 ? 'Above lower clouds' : altitude < 3350 ? 'Through higher clouds' :
      altitude < 12000 ? 'Above the cloud layers' : altitude < SPACE_REFERENCE_M ? 'Upper atmosphere' : 'Beyond the 100 km space reference',
  };
}
export function cameraFrame(altitudeM: number, rocketExtentM: number, centerY: number, aspect: number, mode: CameraMode) {
  const altitude = Math.max(0, altitudeM);
  const extent = Math.max(0.01, rocketExtentM);
  const closeDistance = extent * 3.5;
  // Leave space for controls and reference scenery, including on narrow viewports.
  const aspectAllowance = Math.max(1, 0.9 / Math.max(0.25, aspect));
  return mode === 'closeup'
    ? { targetY: centerY, distance: closeDistance * aspectAllowance }
    : { targetY: centerY - altitude * 0.5, distance: Math.max(4, closeDistance, (altitude + extent) * 2.7) * aspectAllowance };
}
export function altitudeLabel(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km` : `${metres.toLocaleString('en-US', { maximumFractionDigits: 0 })} m`;
}
