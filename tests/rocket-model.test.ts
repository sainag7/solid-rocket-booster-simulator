import { expect, test } from 'vitest';
import * as THREE from 'three';
import { buildRocket } from '../web/rocket-model.js';
import { initialConfiguration, selectClass } from '../web/configuration.js';
import { c6 } from './helpers.js';

function dispose(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(node => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}

test.each(['A', 'C', 'H', 'O'] as const)('class %s meshes use the configured metres without display scaling', letter => {
  const c = selectClass(initialConfiguration(c6), letter);
  const rocket = buildRocket(c, false);
  const motor = rocket.getObjectByName('motor')!;
  const motorSize = new THREE.Box3().setFromObject(motor).getSize(new THREE.Vector3());
  expect(motorSize.y).toBeCloseTo(c.motorLengthM, 6);
  expect(motorSize.x).toBeCloseTo(c.motorDiameterM, 6);
  const body = rocket.getObjectByName('body')!;
  const bodySize = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  expect(bodySize.y).toBeCloseTo(c.bodyLengthM, 6);
  expect(bodySize.x).toBeCloseTo(c.bodyDiameterM, 6);
  const nose = rocket.getObjectByName('nose')!;
  const noseBounds = new THREE.Box3().setFromObject(nose);
  expect(noseBounds.max.y).toBeCloseTo(c.bodyLengthM + c.noseLengthM, 6);
  expect(rocket.children.filter(node => node.name.startsWith('fin-'))).toHaveLength(c.finCount);
  dispose(rocket);
});
test.each(['conical', 'ogive', 'parabolic'] as const)('nose %s and three fins remain finite for short and long custom geometry', noseShape => {
  for (const noseLengthM of [0.01, 10]) {
    const rocket = buildRocket({ ...initialConfiguration(c6), noseShape, noseLengthM, finCount: 3 }, true);
    const body = rocket.getObjectByName('body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(body.material.transparent).toBe(true);
    expect(body.material.depthWrite).toBe(false);
    expect(body.material.opacity).toBeLessThan(0.2);
    expect(rocket.children.filter(node => node.name.startsWith('fin-'))).toHaveLength(3);
    rocket.traverse(node => {
      if (node instanceof THREE.Mesh) expect(Array.from(node.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true);
    });
    dispose(rocket);
  }
});
