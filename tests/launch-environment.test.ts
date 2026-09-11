import { expect, test } from 'vitest';
import * as THREE from 'three';
import { buildEnvironment } from '../web/launch-environment.js';
import { cameraFrame, CLOUD_LAYERS, sceneryAt, SPACE_REFERENCE_M } from '../web/scene-scale.js';

function disposeEnvironment(environment: ReturnType<typeof buildEnvironment>) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  for (const root of [environment.world, environment.sky, environment.stars]) root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
      geometry.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      if (node instanceof THREE.InstancedMesh) node.dispose();
    }
  });
  materials.forEach(material => { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); });
  geometry.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
}

test.each([0, 8, 194.381, 750, 3000, 20000, 100000, 1000000000])('landscape camera retains pad and rocket at %s m on desktop and mobile', altitude => {
  for (const aspect of [0.55, 1, 1.8]) {
    const frame = cameraFrame(altitude, 0.52, 0.26, aspect, 'landscape');
    const camera = new THREE.PerspectiveCamera(38, aspect, 0.001, Math.max(32000000, frame.distance * 10));
    const target = new THREE.Vector3(0, frame.targetY, 0);
    camera.position.copy(target).addScaledVector(new THREE.Vector3(1.7, .7, 3).normalize(), frame.distance);
    camera.lookAt(target); camera.updateMatrixWorld();
    for (const point of [new THREE.Vector3(0, -altitude, 0), new THREE.Vector3(0, .52, 0)]) {
      const screen = point.project(camera);
      expect(Math.abs(screen.x)).toBeLessThan(0.85);
      expect(Math.abs(screen.y)).toBeLessThan(0.7);
      expect(screen.z).toBeLessThan(1);
    }
  }
});
test('close-up camera preserves inspection scale at any altitude', () => {
  expect(cameraFrame(0, .52, .26, 1.5, 'closeup')).toEqual(cameraFrame(100000, .52, .26, 1.5, 'closeup'));
});
test('sky remains daylight for a C6 and changes only at actual high altitudes', () => {
  expect(sceneryAt(194.381)).toMatchObject({ skyDarkness: 0, starsOpacity: 0, label: 'Below the clouds' });
  expect(sceneryAt(800).label).toBe('Through lower clouds');
  expect(sceneryAt(2000).label).toBe('Above lower clouds');
  expect(sceneryAt(3200).label).toBe('Through higher clouds');
  expect(sceneryAt(SPACE_REFERENCE_M)).toMatchObject({ skyDarkness: 1, starsOpacity: 1, label: 'Beyond the 100 km space reference' });
  expect(sceneryAt(35000).skyDarkness).toBeLessThan(sceneryAt(60000).skyDarkness);
});
test('ground and clouds retain fixed world heights across flight and backward scrubbing', () => {
  const e = buildEnvironment(-0.0126);
  const camera = new THREE.PerspectiveCamera();
  for (const altitude of [0, 50, 2000, 100000, 194, 0]) {
    e.update(altitude, camera); e.world.updateMatrixWorld(true);
    expect(e.world.visible).toBe(true);
    expect(e.world.position.y).toBe(-altitude);
    for (const layer of CLOUD_LAYERS) {
      const group = e.world.getObjectByName(`cloud-base-${layer.baseM}m`)!;
      expect(group.getWorldPosition(new THREE.Vector3()).y + altitude).toBe(layer.baseM);
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.min.y + altitude).toBeGreaterThanOrEqual(layer.baseM - 0.01);
      expect(bounds.max.y + altitude).toBeLessThanOrEqual(layer.baseM + layer.depthM + 0.01);
    }
    expect(e.stars.visible).toBe(sceneryAt(altitude).starsOpacity > 0);
  }
  const person = e.world.getObjectByName('1.8-metre-observer')!;
  expect(new THREE.Box3().setFromObject(person).getSize(new THREE.Vector3()).y).toBeCloseTo(1.8, 5);
  expect(e.world.getObjectByName('grassland')).toBeDefined();
  expect(e.world.getObjectByName('earth-curvature')).toBeDefined();
  disposeEnvironment(e);
});
