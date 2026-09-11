import * as THREE from 'three';
import { CLOUD_LAYERS, sceneryAt } from './scene-scale.js';

/** Stable scenery makes replay and backwards scrubbing spatially consistent. */
function random(seed: number) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function noiseTexture(seed: number, repeats: number) {
  const rand = random(seed), size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = 160 + Math.floor(rand() * 95);
    data.set([value, value, value, 255], i * 4);
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeats, repeats);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
  return map;
}
export function terrainHeight(x: number, z: number) {
  const distance = Math.hypot(x, z);
  const envelope = Math.min(1, Math.max(0, (distance - 350) / 1400));
  return envelope * (70 + 60 * Math.sin(x / 1100) * Math.cos(z / 1400) + 35 * Math.sin((x + z) / 700));
}
function place(mesh: THREE.Object3D, x: number, y: number, z: number, group: THREE.Group) {
  mesh.position.set(x, y, z); group.add(mesh); return mesh;
}

export function buildEnvironment(groundY: number) {
  const world = new THREE.Group(); world.name = 'altitude-reference-world';
  const earthRadius = 6371000;
  const groundGeometry = new THREE.PlaneGeometry(24000, 24000, 128, 128); groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.attributes.position!;
  const colours = new Float32Array(positions.count * 3);
  const green = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, terrainHeight(x, z) + groundY);
    const patch = Math.sin(x / 410) * Math.cos(z / 300);
    green.setHSL(0.23 + patch * 0.025, 0.30, 0.24 + patch * 0.065);
    colours.set([green.r, green.g, green.b], i * 3);
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3)); groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: noiseTexture(23, 4000), roughness: 1 }));
  ground.name = 'grassland'; world.add(ground);
  const lift = Math.min(0.002, Math.abs(groundY) * 0.1);
  const dirtMaterial = new THREE.MeshStandardMaterial({ color: '#99836a', roughness: 1, map: noiseTexture(51, 6) });
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), dirtMaterial); dirt.rotation.x = -Math.PI / 2;
  place(dirt, 0, groundY + lift, 0, world); dirt.name = 'dirt-launch-clearing';
  const roadMaterial = new THREE.MeshStandardMaterial({ color: '#a49a87', roughness: 1 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(440, 4), roadMaterial); road.rotation.x = -Math.PI / 2;
  place(road, 0, groundY + lift * 2, -32, world);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 32), dirtMaterial); path.rotation.x = -Math.PI / 2;
  place(path, 0, groundY + lift * 2, -16, world);
  // Sample the same triangles as the ground mesh, so trees cannot float above hill slopes.
  const surfaceY = (x: number, z: number) => {
    const gx = (x + 12000) / 187.5, gz = (z + 12000) / 187.5;
    const col = Math.max(0, Math.min(127, Math.floor(gx))), row = Math.max(0, Math.min(127, Math.floor(gz)));
    const u = gx - col, v = gz - row;
    const a = row * 129 + col, b = a + 129, d = a + 1, c = b + 1;
    return u + v <= 1 ? positions.getY(a) * (1 - u - v) + positions.getY(d) * u + positions.getY(b) * v :
      positions.getY(c) * (u + v - 1) + positions.getY(d) * (1 - v) + positions.getY(b) * (1 - u);
  };
  const rand = random(912);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.23, 3, 6), new THREE.MeshStandardMaterial({ color: '#65503a', roughness: 1 }), 150);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 7), new THREE.MeshStandardMaterial({ color: '#365f40', roughness: 1 }), 150);
  const dummy = new THREE.Object3D(), colour = new THREE.Color();
  for (let i = 0; i < 150; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = i === 0 ? 15 : 25 + rand() ** 1.6 * 1500;
    const x = i === 0 ? -9 : Math.cos(angle) * radius, z = i === 0 ? -12 : Math.sin(angle) * radius;
    const scale = i === 0 ? 1 : 0.7 + rand() * 0.7;
    const y = surfaceY(x, z);
    dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.setScalar(scale);
    dummy.position.set(x, y + 1.5 * scale, z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 4.5 * scale; dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    colour.setHSL(0.28 + rand() * 0.08, 0.27 + rand() * 0.15, 0.23 + rand() * 0.12); crowns.setColorAt(i, colour);
  }
  trunks.name = 'tree-trunks'; crowns.name = 'eight-metre-reference-trees'; world.add(trunks, crowns);
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.035,0,0, .035,0,0, .015,.22,0, 0,0,-.035, 0,0,.035, 0,.18,.01], 3));
  grassGeometry.computeVertexNormals();
  const grass = new THREE.InstancedMesh(grassGeometry, new THREE.MeshStandardMaterial({ color: '#71854a', roughness: 1, side: THREE.DoubleSide }), 700);
  for (let i = 0; i < 700; i++) {
    const a = rand() * Math.PI * 2, radius = 4 + rand() ** 0.7 * 22;
    dummy.position.set(Math.cos(a) * radius, groundY + 0.02, Math.sin(a) * radius);
    dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.setScalar(0.6 + rand() * 1.1); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
  }
  world.add(grass);
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#aba18f', roughness: 1 }), 75);
  for (let i = 0; i < 75; i++) {
    const a = rand() * 6.28, r = 0.8 + rand() * 3;
    dummy.position.set(Math.sin(a) * r, groundY + 0.015, Math.cos(a) * r);
    dummy.scale.set(0.025 + rand() * 0.05, 0.015 + rand() * 0.03, 0.02 + rand() * 0.04); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  world.add(stones);
  // A fixed-size field building and water tower remain useful as the camera pulls back.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 5), new THREE.MeshStandardMaterial({ color: '#d9cbb3', roughness: 0.9 }));
  place(cabin, 26, groundY + 2, -45, world);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#665f56', roughness: 0.9 })); roof.rotation.y = Math.PI / 4;
  place(roof, 26, groundY + 5.1, -45, world);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), new THREE.MeshStandardMaterial({ color: '#3d514b' }));
  place(door, 26, groundY + 1.1, -42.45, world);
  const steel = new THREE.MeshStandardMaterial({ color: '#b8c7ce', metalness: 0.45, roughness: 0.55 });
  for (const x of [-3, 3]) for (const z of [-3, 3]) place(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 23, 8), steel), 95 + x, groundY + 11.5, -125 + z, world);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), steel); tank.scale.set(6, 5, 6); tank.name = 'thirty-metre-water-tower';
  place(tank, 95, groundY + 25, -125, world);
  // A 1.8 m observer provides a nearby, familiar scale reference.
  const person = new THREE.Group(); person.name = '1.8-metre-observer';
  const clothing = new THREE.MeshStandardMaterial({ color: '#df9735', roughness: 0.85 });
  const trousers = new THREE.MeshStandardMaterial({ color: '#314655' });
  place(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 3, 8), clothing), 0, 1.1, 0, person);
  place(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: '#c99c7b' })), 0, 1.66, 0, person);
  for (const x of [-0.10, 0.10]) place(new THREE.Mesh(new THREE.CylinderGeometry(.065, .07, .77, 8), trousers), x, .385, 0, person);
  place(person, -2, groundY, -1, world);
  const cloudGroups: THREE.Group[] = [];
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 2);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: '#f6f8fa', roughness: 1, transparent: true, opacity: 0.88, depthWrite: false, flatShading: false });
  for (const layer of CLOUD_LAYERS) {
    const group = new THREE.Group(); group.position.y = layer.baseM; group.name = `cloud-base-${layer.baseM}m`;
    const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 110);
    for (let i = 0; i < 110; i++) {
      const cluster = Math.floor(i / 5), a = cluster * 2.39996;
      const r = cluster === 0 ? 180 : 400 + (cluster % 7) * 750;
      const puffHeight = layer.depthM * (0.25 + rand() * 0.25);
      dummy.position.set(Math.cos(a) * r + (rand() - 0.5) * 200, puffHeight, Math.sin(a) * r + (rand() - 0.5) * 200);
      dummy.rotation.set(0, rand() * 6.28, 0); dummy.scale.set(100 + rand() * 100, puffHeight, 75 + rand() * 100);
      dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
    }
    group.add(clouds); cloudGroups.push(group); world.add(group);
  }
  // Curvature only becomes perceptible at actual high altitudes. This is an illustrative globe.
  const earthGeometry = new THREE.SphereGeometry(earthRadius, 192, 128);
  const ep = earthGeometry.attributes.position!;
  const earthColours = new Float32Array(ep.count * 3);
  for (let i = 0; i < ep.count; i++) {
    const x = ep.getX(i) / earthRadius, y = ep.getY(i) / earthRadius, z = ep.getZ(i) / earthRadius;
    const land = Math.sin(x * 12 + z * 7) + Math.cos(z * 10 - y * 8) + Math.sin(y * 16 + x * 5) * 0.5;
    colour.set(y > 0.997 ? '#567d56' : land > 0.35 ? '#577b52' : '#1b5076');
    earthColours.set([colour.r, colour.g, colour.b], i * 3);
  }
  earthGeometry.setAttribute('color', new THREE.BufferAttribute(earthColours, 3));
  const earth = new THREE.Mesh(earthGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  earth.position.y = -earthRadius + groundY - 15; earth.name = 'earth-curvature'; world.add(earth);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(earthRadius + 70000, 96, 64), new THREE.MeshBasicMaterial({ color: '#6ebdff', transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false }));
  atmosphere.position.copy(earth.position); world.add(atmosphere);

  const skyGeometry = new THREE.SphereGeometry(1, 32, 24);
  const skyPositions = skyGeometry.attributes.position!;
  const skyColours = new Float32Array(skyPositions.count * 3);
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColours, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  sky.renderOrder = -100; sky.scale.setScalar(10000000); sky.frustumCulled = false;
  const starPositions = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i++) {
    const y = rand() * 2 - 1, angle = rand() * Math.PI * 2, r = Math.sqrt(1 - y * y) * 9000000;
    starPositions.set([Math.cos(angle) * r, y * 9000000, Math.sin(angle) * r], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#e5edff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); stars.frustumCulled = false;
  const top = new THREE.Color(), horizon = new THREE.Color();
  const dayTop = new THREE.Color('#4d96cc'), dayHorizon = new THREE.Color('#dae9ee');
  const spaceTop = new THREE.Color('#030714'), spaceHorizon = new THREE.Color('#172b48');
  let lastDarkness = -1;
  return {
    world, sky, stars,
    update(altitudeM: number, camera: THREE.Camera) {
      const visual = sceneryAt(altitudeM);
      world.position.y = -altitudeM;
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      // Quantize colour updates; all geometry stays allocated once.
      const darkness = Math.round(visual.skyDarkness * 200) / 200;
      if (darkness !== lastDarkness) {
        lastDarkness = darkness;
        top.copy(dayTop).lerp(spaceTop, darkness); horizon.copy(dayHorizon).lerp(spaceHorizon, darkness);
        for (let i = 0; i < skyPositions.count; i++) {
          const blend = Math.pow(Math.max(0, skyPositions.getY(i)), 0.45);
          colour.copy(horizon).lerp(top, blend);
          skyColours.set([colour.r, colour.g, colour.b], i * 3);
        }
        skyGeometry.attributes.color!.needsUpdate = true;
      }
      stars.material.opacity = visual.starsOpacity; stars.visible = visual.starsOpacity > 0;
      atmosphere.material.opacity = visual.atmosphereOpacity * 0.14; atmosphere.visible = altitudeM > 15000;
      // Ground and clouds remain at fixed world coordinates; only tiny foreground details are culled.
      grass.visible = altitudeM < 500; stones.visible = altitudeM < 150; person.visible = altitudeM < 1500;
    },
  };
}
