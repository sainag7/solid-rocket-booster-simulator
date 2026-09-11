import * as THREE from 'three';
import type { Configuration } from './configuration.js';

export function buildRocket(c: Configuration, cutaway: boolean) {
  const rocket = new THREE.Group();
  const radius = c.bodyDiameterM / 2;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#e8edf1', roughness: 0.38, metalness: 0.25, transparent: cutaway, opacity: cutaway ? 0.16 : 1, depthWrite: !cutaway, side: THREE.DoubleSide });
  const noseMaterial = new THREE.MeshStandardMaterial({ color: '#213958', roughness: 0.35, metalness: 0.35 });
  const finMaterial = new THREE.MeshStandardMaterial({ color: '#f06b39', roughness: 0.5, metalness: 0.15 });
  const motorMaterial = new THREE.MeshStandardMaterial({ color: '#bc873d', roughness: 0.45, metalness: 0.5 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#202c38', roughness: 0.65, metalness: 0.3 });
  const cylinder = (r: number, length: number, y: number, material: THREE.Material, parent = rocket) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 48), material);
    mesh.position.y = y; parent.add(mesh); return mesh;
  };
  cylinder(radius, c.bodyLengthM, c.bodyLengthM / 2, bodyMaterial).name = 'body';
  const points: THREE.Vector2[] = [];
  const rho = (radius * radius + c.noseLengthM ** 2) / (2 * radius);
  for (let i = 0; i <= 48; i++) {
    const f = i / 48, y = f * c.noseLengthM;
    const r = c.noseShape === 'conical' ? radius * (1 - f) : c.noseShape === 'parabolic' ? radius * (1 - f * f) :
      // Tangent ogive requires length >= radius. Short custom noses use a smooth elliptical profile.
      c.noseLengthM >= radius ? Math.max(0, Math.sqrt(Math.max(0, rho * rho - y * y)) + radius - rho) : radius * Math.sqrt(1 - f * f);
    points.push(new THREE.Vector2(i === 48 ? 0 : r, y));
  }
  const nose = new THREE.Mesh(new THREE.LatheGeometry(points, 48), noseMaterial);
  nose.name = 'nose'; nose.position.y = c.bodyLengthM; rocket.add(nose);
  if (!cutaway) {
    cylinder(radius * 1.008, c.bodyLengthM * 0.035, c.bodyLengthM * 0.83, finMaterial);
    cylinder(radius * 1.009, c.bodyLengthM * 0.012, c.bodyLengthM * 0.77, noseMaterial);
  }
  cylinder(c.motorDiameterM / 2, c.motorLengthM, c.motorLengthM / 2, motorMaterial).name = 'motor';
  cylinder(c.motorDiameterM * 0.53, Math.min(c.motorDiameterM * 0.2, c.motorLengthM * 0.08), 0, darkMaterial);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(c.motorDiameterM * 0.18, c.motorDiameterM * 0.35, c.motorDiameterM * 0.5, 32, 1, true), darkMaterial);
  nozzle.position.y = -c.motorDiameterM * 0.25; rocket.add(nozzle);
  const shape = new THREE.Shape();
  // Root leading edge is forward of the tip: finSweepM is aft sweep from that leading edge.
  shape.moveTo(radius * 0.97, c.finOffsetM);
  shape.lineTo(radius * 0.97, c.finOffsetM + c.finRootM);
  shape.lineTo(radius + c.finSpanM, c.finOffsetM + c.finRootM - c.finSweepM);
  shape.lineTo(radius + c.finSpanM, c.finOffsetM + c.finRootM - c.finSweepM - c.finTipM);
  shape.closePath();
  const thickness = Math.max(0.0008, c.bodyDiameterM * 0.035);
  const finGeometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  finGeometry.translate(0, 0, -thickness / 2);
  for (let i = 0; i < c.finCount; i++) {
    const fin = new THREE.Mesh(finGeometry, finMaterial); fin.name = `fin-${i + 1}`; fin.rotation.y = i * Math.PI * 2 / c.finCount; rocket.add(fin);
  }
  return rocket;
}

