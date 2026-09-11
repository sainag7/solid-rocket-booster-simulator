import { useId } from 'react';
import { GRAIN_PROFILES } from '../src/grain.js';
import type { GrainProfileDefinition, GrainProfileId } from '../src/grain.js';

// Schematic port silhouettes only; no dimensions are used by the flight model.
function radialPort(points: number, root: number, tip: number, flat: boolean): string {
  const vertices: string[] = [];
  for (let point = 0; point < points; point++) {
    const step = 2 * Math.PI / points;
    const offsets = flat ? [[-0.44, root], [-0.12, tip], [0.12, tip], [0.44, root]] : [[0, tip], [0.5, root]];
    for (const [offset, radius] of offsets) {
      const angle = (point + offset!) * step - Math.PI / 2;
      vertices.push(`${32 + Math.cos(angle) * radius!},${32 + Math.sin(angle) * radius!}`);
    }
  }
  return vertices.join(' ');
}

function GrainSection({ profile }: { profile: GrainProfileId }) {
  const pattern = useId();
  return <svg className="grain-section-icon" viewBox="0 0 64 64" aria-hidden="true">
    <defs><pattern id={pattern} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0V5" stroke="currentColor" strokeWidth="1" opacity=".4" /></pattern></defs>
    <circle cx="32" cy="32" r="28" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="1.4" />
    {profile === 'dual-composition' && <><circle cx="32" cy="32" r="27" fill={`url(#${pattern})`} /><circle cx="32" cy="32" r="22" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="1" /></>}
    {(profile === 'tubular' || profile === 'rod-and-tube') && <circle cx="32" cy="32" r={profile === 'tubular' ? 14 : 18} fill="var(--surface)" stroke="currentColor" strokeWidth="1.2" />}
    {profile === 'rod-and-tube' && <circle cx="32" cy="32" r="9" fill="var(--accent-soft)" stroke="currentColor" strokeWidth="1.2" />}
    {profile === 'double-anchor' && <path d="M28 12H36V23C47 16 53 23 50 33L42 30C42 26 39 27 36 30V52H28V41C17 48 11 41 14 31L22 34C22 38 25 37 28 34Z" fill="var(--surface)" stroke="currentColor" strokeWidth="1.2" />}
    {(profile === 'star' || profile === 'multi-fin' || profile === 'dual-composition') && <polygon
      points={radialPort(profile === 'star' ? 5 : profile === 'multi-fin' ? 12 : 10, profile === 'star' ? 9 : 10, profile === 'star' ? 23 : 21, profile !== 'star')}
      fill="var(--surface)" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />}
  </svg>;
}

function ProfilePreview({ profile }: { profile: GrainProfileDefinition }) {
  const peak = Math.max(...profile.knots.map(point => point[1]));
  const points = profile.knots.map(([time, thrust]) => `${4 + time * 100},${34 - thrust / peak * 28}`).join(' ');
  return <svg className="grain-curve-preview" viewBox="0 0 112 40" aria-hidden="true">
    <path d="M4 3V34H108" fill="none" stroke="var(--event)" strokeWidth="1" />
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}

export function GrainSelector({ selected, onSelect }: { selected: GrainProfileId | null; onSelect: (profile: GrainProfileId) => void }) {
  const noteId = useId();
  return <fieldset className="grain-selector" aria-describedby={noteId}>
    <legend>Grain profile <span>Illustrative</span></legend>
    <div className="grain-options">{GRAIN_PROFILES.map(profile => <button key={profile.id} type="button" className="grain-option"
      aria-pressed={selected === profile.id} aria-label={`${profile.name}: ${profile.behavior}`} onClick={() => onSelect(profile.id)}>
      <span className="grain-pictures"><GrainSection profile={profile.id} /><ProfilePreview profile={profile} /></span>
      <span className="grain-name">{profile.name}</span><span className="grain-behavior">{profile.behavior}</span>
      {selected === profile.id && <span className="grain-check" aria-hidden="true">✓</span>}
    </button>)}</div>
    <p id={noteId} className="grain-explanation">Same total impulse and burn duration; a different thrust schedule. These schematics illustrate profiles, not physical grain dimensions.</p>
  </fieldset>;
}
