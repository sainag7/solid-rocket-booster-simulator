import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Configuration } from './configuration.js';
import { buildEnvironment } from './launch-environment.js';
import { cameraFrame } from './scene-scale.js';
import type { CameraMode } from './scene-scale.js';
import { buildRocket } from './rocket-model.js';
import type { Playback } from './use-playback.js';

interface Props { configuration: Configuration; playback: Playback; cutaway: boolean; resetCamera: number; dark: boolean; pending: boolean; cameraMode: CameraMode }


export default function RocketScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    setError(null);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true }); }
    catch { setError('3D is unavailable in this browser. Launch, timeline, telemetry, and charts still work.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(props.dark ? '#10233a' : '#c9e2f2');
    container.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '3D rocket. Drag or use arrow keys to orbit. Scroll or use plus and minus to zoom. Home resets the camera.');
    const c = props.configuration, height = c.bodyLengthM + c.noseLengthM;
    const rocket = buildRocket(c, props.cutaway);
    const bounds = new THREE.Box3().setFromObject(rocket);
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    const centerY = bounds.getCenter(new THREE.Vector3()).y;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, Math.max(0.0005, extent / 2000), 32000000);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true; orbit.dampingFactor = 0.09;
    orbit.enablePan = false; orbit.maxPolarAngle = Math.PI * 0.49;
    let cameraMode = props.cameraMode;
    let previousDistance = 1;
    const frame = () => cameraFrame(latest.current.pending ? 0 : latest.current.playback.evaluate?.(latest.current.playback.clock.current)?.altitudeM ?? 0, extent, centerY, camera.aspect, cameraMode);
    const reset = () => {
      const framing = frame(); previousDistance = framing.distance;
      const direction = new THREE.Vector3(1.7, 0.7, 3).normalize();
      orbit.target.set(0, framing.targetY, 0);
      camera.position.copy(orbit.target).addScaledVector(direction, framing.distance);
      orbit.minDistance = framing.distance * 0.18; orbit.maxDistance = framing.distance * 6;
      orbit.update();
    };
    reset();
    const keyboard = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { reset(); return; }
      const offset = camera.position.clone().sub(orbit.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
      if (event.key === 'ArrowRight') spherical.theta += 0.12;
      if (event.key === 'ArrowUp') spherical.phi -= 0.12;
      if (event.key === 'ArrowDown') spherical.phi += 0.12;
      if (event.key === '+' || event.key === '=') spherical.radius *= 0.88;
      if (event.key === '-') spherical.radius /= 0.88;
      spherical.phi = Math.max(0.05, Math.min(orbit.maxPolarAngle, spherical.phi));
      spherical.radius = Math.max(orbit.minDistance, Math.min(orbit.maxDistance, spherical.radius));
      camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical)); orbit.update();
    };
    renderer.domElement.addEventListener('keydown', keyboard);
    scene.add(new THREE.HemisphereLight('#e2f3ff', '#526355', 2.6));
    const sun = new THREE.DirectionalLight('#fff0d5', 3.3); sun.position.set(4, 8, 5); scene.add(sun);
    const rim = new THREE.DirectionalLight('#93c9ff', 1.8); rim.position.set(-3, 2, -4); scene.add(rim);
    scene.add(rocket);
    const groundY = -c.motorDiameterM * 0.7;
    const environment = buildEnvironment(groundY);
    scene.add(environment.world, environment.sky, environment.stars);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(c.bodyDiameterM * 3, c.bodyDiameterM * 3.2, c.bodyDiameterM * 0.4, 48), new THREE.MeshStandardMaterial({ color: '#455467', metalness: 0.5, roughness: 0.6 }));
    pad.position.y = groundY; environment.world.add(pad);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(c.bodyDiameterM * 0.08, c.railLengthM, c.bodyDiameterM * 0.08), new THREE.MeshStandardMaterial({ color: '#9cacbb', metalness: 0.8, roughness: 0.3 }));
    rail.position.set(-c.bodyDiameterM * 0.7, c.railLengthM / 2, -c.bodyDiameterM * 0.6); environment.world.add(rail);
    const pathPositions = new Float32Array(6);
    const pathGeometry = new THREE.BufferGeometry(); pathGeometry.setAttribute('position', new THREE.BufferAttribute(pathPositions, 3));
    const flightPath = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: '#e89242', transparent: true, opacity: 0.75 }));
    flightPath.frustumCulled = false; scene.add(flightPath);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffac56', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    marker.renderOrder = 10; marker.position.y = centerY; scene.add(marker);
    const plume = new THREE.Group(); plume.position.y = -c.motorDiameterM * 0.5; rocket.add(plume);
    const fireMaterial = new THREE.MeshBasicMaterial({ color: '#ff8533', transparent: true, opacity: 0.82, depthWrite: false });
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff2b4', transparent: true, opacity: 0.95, depthWrite: false });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(c.motorDiameterM * 0.42, 1, 24), fireMaterial);
    fire.rotation.z = Math.PI; fire.position.y = -0.5; plume.add(fire);
    const core = new THREE.Mesh(new THREE.ConeGeometry(c.motorDiameterM * 0.21, 0.65, 24), coreMaterial);
    core.rotation.z = Math.PI; core.position.y = -0.325; plume.add(core);
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#e4e5df', transparent: true, opacity: 0.18, depthWrite: false });
    const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), smokeMaterial, 48); smoke.frustumCulled = false; scene.add(smoke);
    const dummy = new THREE.Object3D();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cameraRevision = props.resetCamera;
    const render = () => {
      const p = latest.current;
      if (cameraRevision !== p.resetCamera || cameraMode !== p.cameraMode) { cameraRevision = p.resetCamera; cameraMode = p.cameraMode; reset(); }
      const time = p.pending ? 0 : p.playback.clock.current;
      const state = p.playback.evaluate?.(time);
      const altitude = p.pending ? 0 : state?.altitudeM ?? 0;
      // The rocket and world use true metres. Pull back to keep pad and vehicle in the same frame.
      const framing = cameraFrame(altitude, extent, centerY, camera.aspect, cameraMode);
      camera.position.y += framing.targetY - orbit.target.y;
      orbit.target.y = framing.targetY;
      camera.position.sub(orbit.target).multiplyScalar(framing.distance / previousDistance).add(orbit.target);
      previousDistance = framing.distance;
      orbit.minDistance = framing.distance * 0.18; orbit.maxDistance = framing.distance * 6;
      const requiredFar = Math.max(32000000, framing.distance * 8 + altitude * 2);
      if (Math.abs(camera.far - requiredFar) > camera.far * 0.02) { camera.far = requiredFar; camera.updateProjectionMatrix(); }
      environment.sky.scale.setScalar(camera.far * 0.3);
      environment.stars.scale.setScalar(camera.far / 32000000);
      environment.update(altitude, camera);
      pathPositions.set([0, groundY - altitude, 0, 0, 0, 0]); pathGeometry.attributes.position!.needsUpdate = true;
      flightPath.visible = cameraMode === 'landscape' && altitude > extent;
      const markerDistance = camera.position.distanceTo(marker.position);
      marker.visible = markerDistance > extent * 12;
      marker.quaternion.copy(camera.quaternion);
      marker.scale.setScalar(markerDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 18 / Math.max(1, container.clientHeight));
      const thrust = p.pending ? 0 : state?.thrustN ?? 0;
      // Bounded display scaling uses thrust/initial loaded weight, not a fabricated burn clock.
      const strength = Math.min(2.8, Math.sqrt(thrust / Math.max(0.01, (c.totalMassKg + c.dryMassKg) * 9.80665)) / 2);
      plume.visible = thrust > 0 && time > 0;
      plume.scale.y = Math.max(c.motorDiameterM, height * 0.65 * strength) * (reduced.matches ? 1 : 1 + 0.035 * Math.sin(time * 83));
      smoke.visible = !reduced.matches && time > 0;
      for (let i = 0; i < 48; i++) {
        const age = (i + 1) * 0.035;
        const earlier = time >= age ? p.playback.evaluate?.(time - age) : null;
        const visible = !p.pending && earlier && earlier.thrustN > 0;
        const size = visible ? c.motorDiameterM * (0.4 + age * 2) : 0;
        dummy.position.set(Math.sin(i * 2.39) * c.motorDiameterM * age, (earlier?.altitudeM ?? altitude) - altitude - c.motorDiameterM - age * height * 0.3, Math.cos(i * 4.17) * c.motorDiameterM * age);
        dummy.scale.setScalar(size); dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
      orbit.update(); renderer.render(scene, camera);
    };
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth, h = container.clientHeight;
      if (!width || !h) return;
      renderer.setSize(width, h); camera.aspect = width / h; camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const visibility = () => renderer.setAnimationLoop(document.hidden ? null : render);
    document.addEventListener('visibilitychange', visibility); visibility();
    const contextLost = (event: Event) => { event.preventDefault(); setError('The 3D graphics context was lost. Reload to restore it; telemetry and charts remain available.'); renderer.setAnimationLoop(null); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    return () => {
      renderer.setAnimationLoop(null); resize.disconnect(); orbit.dispose();
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('keydown', keyboard);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
      materials.forEach(material => { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); });
      textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose());
      scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [props.configuration, props.cutaway, props.dark]);
  return <div className="rocket-scene" ref={host}>{error && <div className="scene-fallback" role="status">{error}</div>}</div>;
}
