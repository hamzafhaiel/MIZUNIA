import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const BasinNames = ['Bassin 1', 'Bassin 2', 'Bassin 3'];
export const basinReading = (state, id) =>
  state?.basins?.find(basin => basin.id === id) ?? (id === 1 ? state : undefined);

const container = document.querySelector('#app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcde4e6);
scene.fog = new THREE.Fog(0xcde4e6, 76, 130);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.replaceChildren(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-7, -0.4, -7);
camera.position.set(1, 39, 51);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 72;
controls.maxPolarAngle = Math.PI * 0.55;

const skyLight = new THREE.HemisphereLight(0xfff2da, 0x7c6762, 2.1);
scene.add(skyLight);
const sun = new THREE.DirectionalLight(0xffe4bc, 3);
sun.position.set(-16, 24, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 22, bottom: -22, far: 68 });
sun.shadow.normalBias = 0.04;
scene.add(sun);

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...options });
const limestone = [0xa98e70, 0xc0a281, 0xd2b493, 0xb99a76, 0xd8bc9a].map(color => material(color));
const coping = material(0xe7cda6);
const soil = material(0x80634b);
const plaster = material(0xbaa084);
const copper = material(0x508782, { metalness: 0.55, roughness: 0.4 });
const brass = material(0xb47743, { metalness: 0.55, roughness: 0.4 });
const grate = material(0x33352d, { metalness: 0.4 });
const sensorBoard = material(0x285964);
const sensorMetal = material(0xb5c4c3, { metalness: 0.55, roughness: 0.3 });
const bark = material(0x745845);
const foliage = [0x5c713f, 0x778252, 0x879862].map(color => material(color, { flatShading: true }));
const particleMat = new THREE.MeshBasicMaterial({ color: 0x9afff5, depthTest: false, depthWrite: false });
const dropMat = new THREE.MeshBasicMaterial({ color: 0x5dabc8, transparent: true, opacity: 0.68, depthWrite: false });
const particleGeometry = new THREE.SphereGeometry(0.067, 8, 6);
const dropGeometry = new THREE.CylinderGeometry(0.024, 0.024, 0.39, 5);
const irrigationWater = new THREE.MeshBasicMaterial({ color: 0x34b8de });
const irrigationDrop = new THREE.SphereGeometry(0.075, 8, 6);
const irrigationTube = material(0x2a5350);
const walkway = material(0xcbab80);
const parkSoil = material(0x877257);
const lawn = material(0x668744);
const solarCell = material(0x214a76, { metalness: 0.42, roughness: 0.34, emissive: 0x174061 });
const solarFrame = material(0xb1c6c5, { metalness: 0.48, roughness: 0.44 });
const powerCable = material(0xb88435);
const treatmentMotor = material(0x23777d, { metalness: 0.35, roughness: 0.42 });
const sackFabric = material(0xd1b58b);
const wellZ = -3.95;
const asphalt = material(0x5d6361);
const houseWall = material(0xede3c7);
const roofTile = material(0xbd7856);
const shutters = material(0x457586);
const backupPipe = material(0x41809f, { metalness: 0.3, roughness: 0.44 });
const backupFlow = new THREE.MeshBasicMaterial({ color: 0xa6efff, depthWrite: false });
const runoffFlow = new THREE.MeshBasicMaterial({ color: 0x2ba7cf, depthWrite: false });
const runoffDropGeometry = new THREE.SphereGeometry(0.094, 8, 6);
const plazaInletAngle = 5.2;

function mesh(parent, geometry, surface, x, y, z) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent, w, h, d, x, y, z, surface) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), surface, x, y, z);
}

function cylinder(parent, radius, height, x, y, z, surface, sides = 36) {
  return mesh(parent, new THREE.CylinderGeometry(radius, radius, height, sides), surface, x, y, z);
}

function stoneCourse(group, radius, height, y, front, surface) {
  const blocks = 28;
  const step = Math.PI * 2 / blocks;
  const thickness = radius > 3 ? 0.46 : 0.28;
  for (let i = 0; i < blocks; i++) {
    const angle = (i + (front ? 0 : (Math.round(y * 10) % 2) * 0.5)) * step;
    if (!front && Math.sin(angle) > 0.28) continue;
    const shade = (i * 7 + Math.abs(Math.round(y * 20))) % limestone.length;
    const block = box(group, thickness, height, 2 * radius * Math.tan(step / 2) - 0.035,
      Math.cos(angle) * radius, y, Math.sin(angle) * radius, surface || limestone[shade]);
    block.rotation.y = -angle;
  }
}

function label(parent, name, x = 0, y = -1.95, z = 4.8) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#173c3c';
  ctx.roundRect(6, 14, 500, 100, 26);
  ctx.fill();
  ctx.font = '600 42px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff3de';
  ctx.fillText(name, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(4.8, 1.2, 1);
  sprite.renderOrder = 3;
  parent.add(sprite);
  return sprite;
}

const floor = -2.45;
const waterDepth = 2.25;
const rippleTime = { value: 0 };
const waterSurface = new THREE.ShaderMaterial({
  uniforms: { time: rippleTime },
  vertexShader: `
    varying vec2 surfacePoint;
    void main() {
      surfacePoint = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float time;
    varying vec2 surfacePoint;
    void main() {
      vec2 p = surfacePoint;
      float wave = sin(p.x*5.0 + sin(p.y*4.0)*1.9 + time*1.5)
        * sin(p.y*6.0 - p.x*2.0 - time*1.1);
      float glint = pow(max(0.0, wave), 5.0);
      vec3 color = mix(vec3(0.04,0.37,0.40), vec3(0.20,0.74,0.69), 0.42 + wave*0.23 + glint*0.32);
      gl_FragColor = vec4(color, 0.76);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
});
const waterSide = material(0x389a9d, { transparent: true, opacity: 0.64, depthWrite: false });

function apronPoint(angle, radius, height) {
  return new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
}

function runoffChannel(group, points, count = 3) {
  const drops = Array.from({ length: count }, (_, index) => {
    const drop = mesh(group, runoffDropGeometry, runoffFlow, 0, 0, 0);
    drop.castShadow = false;
    drop.visible = false;
    return { drop, offset: index / count };
  });
  return { path: new THREE.CatmullRomCurve3(points, false, 'centripetal'),
    exit: points.at(-1), drops };
}

function createCatchment(group) {
  // Leave the front open so the water and pump remain visible in section.
  const start = Math.PI - 0.18;
  const arc = Math.PI + 0.62;
  const inner = 4.22;
  const outer = 5.55;
  const innerHeight = 0.24;
  const outerHeight = 0.49;
  for (let index = 0; index < 20; index++) {
    const a = start + index * arc / 20 + 0.004;
    const b = start + (index + 1) * arc / 20 - 0.004;
    const vertices = [
      apronPoint(a, inner, innerHeight), apronPoint(b, inner, innerHeight),
      apronPoint(a, outer, outerHeight), apronPoint(b, outer, outerHeight),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    geometry.computeVertexNormals();
    mesh(group, geometry, limestone[(index + 2) % limestone.length], 0, 0, 0);
  }
  const angles = [Math.PI * 1.09, Math.PI * 1.9];
  for (const angle of [...angles, plazaInletAngle]) {
    const inlet = new THREE.Group();
    inlet.position.copy(apronPoint(angle, inner - 0.12, 0.24));
    inlet.rotation.y = -angle;
    group.add(inlet);
    const bed = box(inlet, 1.67, 0.11, 0.48, 0.01, 0.027, 0, plaster);
    bed.rotation.z = 0.13;
    for (const side of [-1, 1]) {
      const curb = box(inlet, 1.67, 0.14, 0.09, 0.01, 0.115, side * 0.28, coping);
      curb.rotation.z = 0.13;
    }
  }

  return Array.from({ length: 12 }, (_, index) => {
    const landing = start + (index + 0.5) * arc / 12;
    const inlet = angles[index < 6 ? 0 : 1];
    const exit = apronPoint(inlet, inner - 0.94, 0.03);
    const channel = runoffChannel(group, [
      apronPoint(landing, outer - 0.09, outerHeight + 0.04),
      apronPoint(landing, 4.93, 0.4),
      apronPoint(THREE.MathUtils.lerp(landing, inlet, 0.45), 4.45, 0.32),
      apronPoint(inlet, inner - 0.12, 0.33),
      exit,
    ]);
    for (const drop of channel.drops) drop.offset += index * 0.071;
    return channel;
  });
}

function createBasin(x, z, name) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  cylinder(group, 4.4, 0.5, 0, floor - 0.3, 0, soil, 28);
  cylinder(group, 4.09, 0.16, 0, floor - 0.08, 0, plaster, 28);
  for (let course = 0; course < 6; course++) {
    stoneCourse(group, 4.08, 0.38, floor + 0.2 + course * 0.4, course === 0);
  }
  stoneCourse(group, 4.08, 0.2, 0.06, false, coping);
  const runoff = createCatchment(group);

  // The rear terrace supports a raised wellhead. The front arc is open in section.
  for (const [xOffset, zOffset, width, depth] of [
    [-1.395, -5.02, 1.76, 3.28], [1.395, -5.02, 1.76, 3.28], [0, -5.56, 1.03, 2.2],
  ]) {
    box(group, width, 0.33, depth, xOffset, -0.11, zOffset, plaster);
    box(group, width, 0.14, depth, xOffset, 0.12, zOffset, coping);
  }
  for (let course = 0; course < 4; course++) stoneCourseAtWell(group, course);
  const rim = mesh(group, new THREE.TorusGeometry(0.76, 0.13, 10, 36, Math.PI * 2 - 1.26),
    coping, 0, 1.33, wellZ);
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.63);
  const lifter = installWellLifter(group);
  box(group, 0.48, 0.13, 0.38, -1.45, 0.24, -3.37, sensorBoard);
  for (const dx of [-0.105, 0.105]) {
    cylinder(group, 0.086, 0.12, -1.45 + dx, 0.15, -3.31, sensorMetal, 16);
  }

  const body = mesh(group, new THREE.CylinderGeometry(3.83, 3.83, 1, 56, 1, true), waterSide, 0, floor, 0);
  const surface = mesh(group, new THREE.CircleGeometry(3.83, 64), waterSurface, 0, floor, 0);
  surface.rotation.x = -Math.PI / 2;
  for (const water of [body, surface]) {
    water.castShadow = false;
    water.visible = false;
  }
  surface.renderOrder = 1;

  const pumpMaterial = material(0xc08749, { metalness: 0.45, roughness: 0.38 });
  cylinder(group, 0.28, 0.65, 0, floor + 0.34, -2.45, pumpMaterial);
  box(group, 0.53, 0.12, 0.42, 0, floor + 0.68, -2.45, pumpMaterial);
  const path = new THREE.CatmullRomCurve3([
    [0, -1.79, -2.45], [0, -1.25, -2.45], [0, -0.88, -2.9],
    [0, -0.58, -3.91], [0, 0.38, -3.95], [0, 1.27, -3.95],
    [0.24, 1.64, -3.95], [0.85, 1.64, -3.95], [1.6, 1.34, -4.22],
    [2.6, 0.81, -5.15], [3.15, 0.72, -5.75],
  ].map(point => new THREE.Vector3(...point)), false, 'centripetal');
  mesh(group, new THREE.TubeGeometry(path, 72, 0.115, 12, false), copper, 0, 0, 0);
  for (const t of [0.16, 0.69, 0.8, 0.96]) {
    const collar = mesh(group, new THREE.TorusGeometry(0.117, 0.03, 8, 16), brass, 0, 0, 0);
    collar.position.copy(path.getPointAt(t));
    collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangentAt(t));
  }
  const particles = Array.from({ length: 26 }, (_, index) => {
    const object = mesh(group, particleGeometry, particleMat, 0, 0, 0);
    object.castShadow = false;
    object.renderOrder = 2;
    object.visible = false;
    return { object, progress: index / 26 };
  });
  label(group, name);
  return { group, body, surface, pumpMaterial, path, particles, runoff, lifter, level: 0, target: 0,
    pumping: false, raining: false, irrigationMode: 'drip' };
}

function stoneCourseAtWell(group, course) {
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const angle = (i + course * 0.5) * Math.PI * 2 / segments;
    if (Math.sin(angle) > 0.62) continue;
    const stone = box(group, 0.28, 0.27, 0.38, Math.cos(angle) * 0.72,
      0.28 + course * 0.275, wellZ + Math.sin(angle) * 0.72, limestone[(i + course) % limestone.length]);
    stone.rotation.y = -angle;
  }
}

const siteBack = -23.1;
const siteFront = 7.3;
const siteLeft = -35;
const siteRight = 18.5;
box(scene, siteRight - siteLeft, 0.42, siteFront - siteBack,
  (siteLeft + siteRight) / 2, floor - 0.68, (siteFront + siteBack) / 2, soil);
const pathStone = material(0xd9c09b);
for (let i = 0; i < 37; i++) {
  box(scene, 0.85, 0.13, 1.05, -15.3 + i * 0.85, floor - 0.4, 5.15, i % 3 ? pathStone : coping);
}
const basins = [[-11.6, 0.55], [0, -1], [11.6, 0.55]].map(([x, z], index) => createBasin(x, z, BasinNames[index]));
const garden = material(0x84935d);
const parkOffset = -6.6;
const parkFront = -7.3 + parkOffset;
box(scene, 34, 2.69, 9, 0, -1.575, -11.8 + parkOffset, parkSoil);
box(scene, 33.85, 0.12, 8.85, 0, -0.17, -11.8 + parkOffset, lawn);
box(scene, 34, 0.13, 0.84, 0, -0.09, -12.3 + parkOffset, walkway);
const plazaDepth = 6.5;
const plazaFront = parkFront + plazaDepth;
const plazaRearHeight = 0.83;
const plazaFrontHeight = 0.54;
const plazaHeight = z => THREE.MathUtils.lerp(plazaRearHeight, plazaFrontHeight, (z - parkFront) / plazaDepth);

function pavedSlope(parent, x, zStart, zEnd, width, upper, lower, rows, columns) {
  const depth = zEnd - zStart;
  const mid = (upper + lower) / 2;
  const geometry = new THREE.BoxGeometry(width, 1, depth);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, vertices.getY(i) > 0
      ? THREE.MathUtils.lerp(upper, lower, vertices.getZ(i) / depth + 0.5) - mid - 0.07
      : floor - 0.47 - mid);
  }
  geometry.computeVertexNormals();
  mesh(parent, geometry, plaster, x, mid, (zStart + zEnd) / 2);
  const angle = Math.atan2(upper - lower, depth);
  for (let row = 0; row < rows; row++) {
    const progress = (row + 0.5) / rows;
    for (let column = 0; column < columns; column++) {
      const tile = box(parent, width / columns - 0.02, 0.11, depth / rows - 0.018,
        x + ((column + 0.5) / columns - 0.5) * width,
        THREE.MathUtils.lerp(upper, lower, progress) - 0.056,
        THREE.MathUtils.lerp(zStart, zEnd, progress),
        limestone[(column + row * 2) % limestone.length]);
      tile.rotation.x = angle;
    }
  }
}
pavedSlope(scene, 0, parkFront, plazaFront, 33.75, plazaRearHeight, plazaFrontHeight, 5, 24);

const apronJoinRadius = 5.39;
const apronJoinHeight = 0.46;
function terraceEdge(x) {
  for (const { group } of basins) {
    const dx = x - group.position.x;
    if (Math.abs(dx) < apronJoinRadius) {
      return group.position.z - Math.sqrt(apronJoinRadius ** 2 - dx ** 2);
    }
  }
  return 0.55;
}

function transitionPoint(x, progress, offset = 0) {
  return new THREE.Vector3(x, THREE.MathUtils.lerp(plazaFrontHeight, apronJoinHeight, progress) + offset,
    THREE.MathUtils.lerp(plazaFront, terraceEdge(x), progress));
}

// Continue the terrace as a single paved surface. Its leading edge follows the cistern rims.
const transitionWidth = 33.75;
const stoneColumns = 32;
const stoneRows = 4;
const stoneWidth = transitionWidth / stoneColumns;
const edgeSamples = stoneColumns * 5;
const terraceBase = [];
function addQuad(points, a, b, c, d) {
  for (const point of [a, b, c, a, c, d]) points.push(point.x, point.y, point.z);
}
function stoneMesh(points, surface) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return mesh(scene, geometry, surface, 0, 0, 0);
}
for (let i = 0; i < edgeSamples; i++) {
  const left = (i / edgeSamples - 0.5) * transitionWidth;
  const right = ((i + 1) / edgeSamples - 0.5) * transitionWidth;
  const a = transitionPoint(left, 0, -0.047);
  const b = transitionPoint(left, 1, -0.047);
  const c = transitionPoint(right, 1, -0.047);
  const d = transitionPoint(right, 0, -0.047);
  addQuad(terraceBase, a, b, c, d);
  addQuad(terraceBase, b, b.clone().setY(floor - 0.46), c.clone().setY(floor - 0.46), c);
  if (i === 0) addQuad(terraceBase, a, a.clone().setY(floor - 0.46), b.clone().setY(floor - 0.46), b);
  if (i === edgeSamples - 1) addQuad(terraceBase, d, c, c.clone().setY(floor - 0.46), d.clone().setY(floor - 0.46));
}
stoneMesh(terraceBase, plaster);
for (let column = 0; column < stoneColumns; column++) {
  const startX = column * stoneWidth - transitionWidth / 2 + 0.009;
  for (let row = 0; row < stoneRows; row++) {
    const stone = [];
    const start = row / stoneRows + 0.003;
    const end = (row + 1) / stoneRows - 0.003;
    for (let i = 0; i < 5; i++) {
      const left = startX + i / 5 * (stoneWidth - 0.018);
      const right = startX + (i + 1) / 5 * (stoneWidth - 0.018);
      addQuad(stone, transitionPoint(left, start), transitionPoint(left, end),
        transitionPoint(right, end), transitionPoint(right, start));
    }
    stoneMesh(stone, limestone[(column + row * 2) % limestone.length]);
  }
}

for (const basin of basins) {
  const { group } = basin;
  const apron = apronPoint(plazaInletAngle, apronJoinRadius, 0.49);
  const inlet = apronPoint(plazaInletAngle, 4.12, 0.36);
  const exit = apronPoint(plazaInletAngle, 3.3, 0.03);
  const rearZ = plazaFront - group.position.z;
  const landingZ = parkFront - group.position.z + 0.45;
  for (const offset of [-0.86, -0.40, 0.36, 0.82]) {
    basin.runoff.push(runoffChannel(group, [
      new THREE.Vector3(apron.x + offset * 3.15, plazaHeight(parkFront + 0.45) + 0.08, landingZ),
      new THREE.Vector3(apron.x + offset * 2, plazaHeight(parkFront + 3.1) + 0.08, landingZ + 2.65),
      new THREE.Vector3(apron.x + offset * 0.44, plazaFrontHeight + 0.075, rearZ),
      new THREE.Vector3(apron.x, apron.y + 0.05, apron.z),
      inlet, exit,
    ], 9));
  }
}
label(scene, 'Parc hydraulique', 0, 0.26, -12.5 + parkOffset);
label(scene, 'Msatha', -16.3, 0.62, -2.3);
function installSolar(x, y, z) {
  const panel = new THREE.Group();
  panel.position.set(x, y, z);
  panel.rotation.x = Math.PI / 6;
  scene.add(panel);
  box(panel, 3.5, 0.13, 1.75, 0, 0, 0, solarFrame);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 8; column++) {
      box(panel, 0.407, 0.045, 0.398, (column - 3.5) * 0.425, 0.08, (row - 1.5) * 0.42, solarCell);
    }
  }
}

function installWellLifter(group) {
  const x = 0.1;
  const z = wellZ + 0.38;
  const cableTop = 1.33;
  box(group, 1.23, 0.08, 0.16, 0, cableTop - 0.24, z, grate);
  const motor = cylinder(group, 0.205, 0.39, -0.28, cableTop, z, treatmentMotor, 20);
  motor.rotation.z = Math.PI / 2;
  for (const finX of [-0.42, -0.29, -0.16]) {
    const fin = cylinder(group, 0.216, 0.026, finX, cableTop, z, solarFrame, 20);
    fin.rotation.z = Math.PI / 2;
  }
  box(group, 0.17, 0.1, 0.2, -0.27, cableTop + 0.23, z, treatmentMotor);
  const drum = new THREE.Group();
  drum.position.set(x, cableTop, z);
  group.add(drum);
  for (const [radius, height, offset] of [[0.13, 0.16, 0], [0.17, 0.03, -0.09], [0.17, 0.03, 0.09]]) {
    cylinder(drum, radius, height, 0, offset, 0, brass, 18);
  }
  drum.rotation.z = Math.PI / 2;
  box(drum, 0.09, 0.13, 0.03, 0, 0, 0.125, grate);

  const cableZ = z + 0.105;
  const cable = cylinder(group, 0.014, 1, x, 0, cableZ, grate, 8);
  const sack = new THREE.Group();
  sack.position.set(x, 0.89, cableZ);
  const pouch = mesh(sack, new THREE.SphereGeometry(0.18, 12, 8), sackFabric, 0, -0.19, 0);
  pouch.scale.set(1, 1.26, 0.84);
  cylinder(sack, 0.073, 0.08, 0, 0.005, 0, sackFabric, 12);
  cylinder(sack, 0.078, 0.022, 0, -0.004, 0, grate, 12);
  group.add(sack);
  return { cableTop, cable, drum, sack };
}

const mulch = material(0x746145);
const dampSoil = material(0x554d34);
const bloom = [material(0xc68d84), material(0xd8b757), material(0xebd7b7)];
const leafCluster = new THREE.IcosahedronGeometry(1, 2);
const blossom = new THREE.IcosahedronGeometry(0.065, 0);

function plantTree(x, z) {
  cylinder(scene, 0.83, 0.075, x, -0.038, z, mulch, 24);
  addConduit([[x, -0.02, z], [x - 0.08, 0.69, z + 0.04], [x + 0.12, 1.26, z]], bark, 0.12);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + x * 0.3;
    const width = 0.55 + (i % 3) * 0.17;
    const dx = Math.cos(angle) * width;
    const dz = Math.sin(angle) * width;
    const y = 1.82 + (i % 3) * 0.16;
    addConduit([[x, 0.95, z], [x + dx * 0.45, 1.36, z + dz * 0.55], [x + dx, y, z + dz]], bark, 0.055);
    for (let j = 0; j < 3; j++) {
      const cluster = mesh(scene, leafCluster, foliage[(i + j) % foliage.length],
        x + dx + Math.cos(angle + j * 1.7) * 0.22, y + 0.16 + j * 0.14, z + dz * 0.82);
      cluster.scale.set(0.52, 0.34, 0.5);
      cluster.rotation.y = angle + j;
    }
  }
}

for (const basin of basins) {
  const x = basin.group.position.x;
  const z = basin.group.position.z;
  const feedX = x + 3.15;
  const feedZ = z - 5.75;
  const rowZ = -10.6 + parkOffset;
  const row = [-2.55, 0, 2.55].map(dx => x + dx);
  box(scene, 8.5, 0.17, 2.35, x, -0.22, rowZ, garden);
  for (const treeX of row) {
    plantTree(treeX, rowZ - 0.22);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      if (Math.sin(angle) > 0.55) continue;
      const flowerX = treeX + Math.cos(angle) * 0.96;
      const flowerZ = rowZ - 0.22 + Math.sin(angle) * 0.76;
      cylinder(scene, 0.017, 0.19, flowerX, 0.04, flowerZ, foliage[i % foliage.length], 5);
      mesh(scene, blossom, bloom[i % bloom.length], flowerX, 0.16, flowerZ);
    }
  }
  const branch = new THREE.CatmullRomCurve3([
    [feedX, 0.72, feedZ], [feedX, 0.74, -7.7], [feedX, 0.94, parkFront + 0.45],
    [feedX, 0.94, parkFront - 0.08], [feedX, 0.20, rowZ + 1.35], [feedX, 0.06, rowZ + 1],
    [x, 0.03, rowZ + 1.1], [row[0] - 0.3, 0.03, rowZ + 1.1],
  ].map(point => new THREE.Vector3(...point)));
  mesh(scene, new THREE.TubeGeometry(branch, 36, 0.062, 8, false), irrigationTube, 0, 0, 0);
  basin.gardenFlow = {
    path: branch,
    particles: Array.from({ length: 16 }, () => {
      const object = mesh(scene, particleGeometry, particleMat, 0, 0, 0);
      object.visible = false;
      object.castShadow = false;
      return object;
    }),
  };
  basin.emitters = row.map(treeX => {
    box(scene, 0.105, 0.08, 0.54, treeX, 0.04, rowZ + 0.86, irrigationTube);
    cylinder(scene, 0.105, 0.19, treeX, 0.13, rowZ + 0.59, brass, 12);
    box(scene, 0.072, 0.07, 0.52, treeX, 0.06, rowZ + 0.29, irrigationTube);
    const wetPatch = cylinder(scene, 0.21, 0.015, treeX, 0.008, rowZ + 0.04, dampSoil, 18);
    wetPatch.visible = false;
    const drops = Array.from({ length: 24 }, () => {
      const drop = mesh(scene, irrigationDrop, irrigationWater, treeX, 0, rowZ);
      drop.castShadow = false;
      drop.visible = false;
      return drop;
    });
    return { x: treeX, z: rowZ + 0.59, drops, wetPatch };
  });
}

const shrubGeometry = new THREE.IcosahedronGeometry(0.35, 1);
for (let index = 0; index < 32; index++) {
  const shrub = mesh(scene, shrubGeometry, foliage[index % foliage.length],
    -16 + index * 1.035, 0.13, -15.84 + parkOffset + (index % 3) * 0.15);
  shrub.scale.set(1.3, 0.75, 1);
}
for (const x of [-5.8, 5.8]) {
  box(scene, 1.4, 0.11, 0.44, x, 0.31, -11.6 + parkOffset, bark);
  box(scene, 1.4, 0.28, 0.1, x, 0.51, -11.78 + parkOffset, bark);
  for (const dx of [-0.51, 0.51]) box(scene, 0.1, 0.36, 0.3, x + dx, 0.12, -11.6 + parkOffset, grate);
}
box(scene, 0.17, 0.47, 0.065, -0.93, 0.09, -10.36 + parkOffset, sensorBoard);
box(scene, 0.24, 0.13, 0.16, -0.93, 0.37, -10.36 + parkOffset, sensorMetal);
const soilPosition = new THREE.Vector3(-0.93, 0.22, -10.36 + parkOffset);
const station = basins[0].group;
const temperaturePosition = new THREE.Vector3(-2.2, 0.65, -4.1).add(station.position);
const turbidityPosition = new THREE.Vector3(1.5, 0.3, -3.86).add(station.position);
box(scene, 0.09, 0.62, 0.09, temperaturePosition.x, 0.3, temperaturePosition.z, solarFrame);
box(scene, 0.26, 0.2, 0.19, temperaturePosition.x, 0.64, temperaturePosition.z, sensorBoard);
cylinder(scene, 0.04, 0.17, temperaturePosition.x, 0.79, temperaturePosition.z, brass, 10);
box(scene, 0.32, 0.16, 0.24, turbidityPosition.x, 0.3, turbidityPosition.z, sensorBoard);
cylinder(scene, 0.058, 0.82, turbidityPosition.x, -0.16, turbidityPosition.z + 0.11, sensorMetal, 10);

const weatherPosition = new THREE.Vector3(-14.6, 0.83, parkFront - 1.1);
const weatherStation = new THREE.Group();
weatherStation.position.set(weatherPosition.x, -0.11, weatherPosition.z);
scene.add(weatherStation);
box(weatherStation, 1.38, 0.13, 0.83, 0, 0.065, 0, plaster);
cylinder(weatherStation, 0.055, 1.48, 0, 0.84, 0, solarFrame, 12);
box(weatherStation, 1.15, 0.06, 0.06, 0, 0.86, 0, solarFrame);
cylinder(weatherStation, 0.17, 0.22, -0.48, 0.98, 0, sensorBoard, 20);
const gaugeRim = mesh(weatherStation, new THREE.TorusGeometry(0.148, 0.028, 8, 24), solarFrame, -0.48, 1.1, 0);
gaugeRim.rotation.x = Math.PI / 2;
for (const y of [0.91, 0.99, 1.07, 1.15]) {
  cylinder(weatherStation, 0.144, 0.034, 0.48, y, 0, solarFrame, 16);
}
cylinder(weatherStation, 0.067, 0.23, 0.48, 1.01, 0, sensorBoard, 12);
box(weatherStation, 0.51, 0.06, 0.39, 0, 1.58, 0, solarFrame).rotation.x = Math.PI / 6;
const referenceCell = new THREE.MeshStandardMaterial({ color: 0x195275, emissive: 0x288ab3 });
box(weatherStation, 0.42, 0.018, 0.3, 0, 1.613, 0.016, referenceCell).rotation.x = Math.PI / 6;

const sensorChoice = document.querySelector('#sensor-choice');
const sensorValue = document.querySelector('#sensor-focus-reading');
let weather;
let activeTelemetry;
let readingSource;
const sensorHalo = mesh(scene, new THREE.TorusGeometry(0.38, 0.018, 6, 28),
  new THREE.MeshBasicMaterial({ color: 0xe6a148, depthTest: false, depthWrite: false }), 0, 0, 0);
sensorHalo.rotation.x = Math.PI / 2;
sensorHalo.visible = false;
sensorHalo.castShadow = false;
sensorHalo.renderOrder = 4;

export function selectedBasinIndex() {
  return Number(document.querySelector('[data-basin][aria-pressed="true"]').dataset.basin) - 1;
}

function updateSensorReading() {
  const id = sensorChoice.value;
  if (id === 'weather') {
    if (weather) {
      sensorValue.textContent = `Station simulée · ${weather.rain} mm/h · ${weather.irradiance} W/m² · ${weather.temperature} °C`;
    }
    return;
  }
  const basin = basinReading(activeTelemetry, selectedBasinIndex() + 1);
  const reading = {
    level: [basin?.distanceCm, 'cm'],
    temperature: [activeTelemetry?.temperatureC, '°C'],
    turbidity: [activeTelemetry?.turbidityPct, '%'],
    soil: [activeTelemetry?.soilMoisturePct, '%'],
  }[id];
  sensorValue.textContent = Number.isFinite(reading[0]) ? `${readingSource} · ${reading[0]} ${reading[1]}`
    : 'Mesure indisponible';
}

function addConduit(points, surface, radius = 0.093) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  mesh(scene, new THREE.TubeGeometry(curve, 72, radius, 8, false), surface, 0, 0, 0);
  return curve;
}

const districtY = floor + 0.16;
box(scene, 16, 0.68, 27.6, -26.75, districtY - 0.39, -8, plaster);
box(scene, 2.25, 0.12, 26, -22.6, districtY, -7.9, asphalt);
const homes = [[-27.1, 2.2], [-30.4, -4.5], [-27.6, -11.1]];
for (const [x, z] of homes) {
  box(scene, 3.35, 2.05, 2.65, x, districtY + 1.08, z, houseWall);
  const roof = mesh(scene, new THREE.CylinderGeometry(0, 2.45, 1.26, 4, 1), roofTile,
    x, districtY + 2.72, z);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.81;
  box(scene, 0.62, 1.08, 0.075, x, districtY + 0.61, z + 1.35, shutters);
  for (const dx of [-0.98, 0.98]) {
    box(scene, 0.62, 0.59, 0.075, x + dx, districtY + 1.32, z + 1.35, shutters);
    box(scene, 0.69, 0.07, 0.14, x + dx, districtY + 0.99, z + 1.38, coping);
  }
  cylinder(scene, 0.145, 0.49, x + 1.97, districtY + 0.29, z + 1.43, backupPipe, 12);
}
label(scene, 'Habitations', -28.6, districtY + 2.65, 5.3);

const publicX = -29.3;
const publicZ = -18.4;
box(scene, 6.2, 2.65, 4.7, publicX, districtY + 1.35, publicZ, houseWall);
box(scene, 6.4, 0.21, 4.9, publicX, districtY + 2.72, publicZ, coping);
for (const dx of [-2.25, -1.18, 1.18, 2.25]) {
  box(scene, 0.67, 0.83, 0.07, publicX + dx, districtY + 1.58, publicZ + 2.39, shutters);
}
box(scene, 0.92, 1.46, 0.075, publicX, districtY + 0.77, publicZ + 2.39, shutters);
installSolar(publicX, districtY + 3.16, publicZ);
label(scene, 'Toit public solaire', publicX, districtY + 4.22, publicZ + 0.8);

const parkingX = -20.1;
const parkingZ = -18.7;
box(scene, 4.9, 0.13, 7.8, parkingX, districtY + 0.06, parkingZ, asphalt);
for (const z of [parkingZ - 1.88, parkingZ + 1.88]) {
  for (const dx of [-1.6, 1.6]) cylinder(scene, 0.072, 2.12, parkingX + dx, districtY + 1.14, z - 0.6, solarFrame, 8);
  installSolar(parkingX, districtY + 2.26, z);
  box(scene, 3.8, 0.021, 0.068, parkingX, districtY + 0.14, z + 1.14, coping);
  box(scene, 1.18, 0.41, 0.65, parkingX - 0.85, districtY + 0.37, z, shutters);
  box(scene, 0.61, 0.21, 0.59, parkingX - 0.89, districtY + 0.66, z, solarFrame);
}
label(scene, 'Parking solaire', parkingX, districtY + 3.45, parkingZ);

const pumpX = -18.95;
const pumpZ = 5.82;
const pipeY = floor + 0.4;
const rescuePump = material(0x296e87, { metalness: 0.43, roughness: 0.35 });
box(scene, 1.64, 0.24, 1.15, pumpX, pipeY - 0.29, pumpZ, coping);
const rescueMotor = cylinder(scene, 0.33, 1.07, pumpX, pipeY, pumpZ, rescuePump, 24);
rescueMotor.rotation.z = Math.PI / 2;
for (const dx of [-0.28, -0.08, 0.12, 0.32]) {
  const fin = cylinder(scene, 0.35, 0.043, pumpX + dx, pipeY, pumpZ, solarFrame, 24);
  fin.rotation.z = Math.PI / 2;
}
label(scene, 'Pompe de secours', pumpX + 0.15, pipeY + 1.02, pumpZ + 0.4);

const generatorGroup = new THREE.Group();
generatorGroup.visible = false;
scene.add(generatorGroup);
const generatorX = -20.35;
const generatorZ = 2.4;
const generatorHousing = material(0xc88e37, { metalness: 0.22, roughness: 0.5 });
const generatorLamp = material(0x825649, { emissive: 0x000000 });
const generatorCable = material(0x8f7a52, { emissive: 0x000000 });
box(generatorGroup, 2.35, 0.17, 1.37, generatorX, districtY + 0.12, generatorZ, shutters);
box(generatorGroup, 2.15, 0.9, 1.22, generatorX, districtY + 0.65, generatorZ, generatorHousing);
box(generatorGroup, 0.57, 0.47, 0.055, generatorX + 0.66, districtY + 0.72, generatorZ + 0.63, shutters);
box(generatorGroup, 0.14, 0.13, 0.055, generatorX + 0.66, districtY + 0.79, generatorZ + 0.67, generatorLamp);
for (const height of [0.45, 0.56, 0.67, 0.78, 0.89]) {
  box(generatorGroup, 1.06, 0.045, 0.045, generatorX - 0.29, districtY + height, generatorZ + 0.63, shutters);
}
cylinder(generatorGroup, 0.065, 0.34, generatorX - 0.7, districtY + 1.25, generatorZ - 0.34, solarFrame, 12);
label(generatorGroup, 'Groupe électrogène', generatorX - 0.48, districtY + 2.03, generatorZ);
const generatorRoute = new THREE.CatmullRomCurve3([
  new THREE.Vector3(generatorX + 0.85, districtY + 0.4, generatorZ - 0.17),
  new THREE.Vector3(generatorX + 1.15, districtY + 0.12, generatorZ + 0.7),
  new THREE.Vector3(pumpX - 0.22, pipeY - 0.06, 4.5),
  new THREE.Vector3(pumpX, pipeY + 0.24, pumpZ),
]);
mesh(generatorGroup, new THREE.TubeGeometry(generatorRoute, 30, 0.063, 8, false), generatorCable, 0, 0, 0);

export function setSceneGenerator(status) {
  generatorGroup.visible = Boolean(status);
  generatorLamp.color.setHex(status?.running ? 0x89ec6c : 0x825649);
  generatorLamp.emissive.setHex(status?.running ? 0x73cb4d : 0x000000);
  generatorCable.emissive.setHex(status?.suppliedW > 0 ? 0xeab130 : 0x000000);
}

const branches = basins.map(({ group }) => {
  const { x, z } = group.position;
  return addConduit([[x, floor + 0.24, z + 3.38], [x, pipeY, z + 4.34],
    [x, pipeY, pumpZ - 0.34], [x - 0.39, pipeY, pumpZ]], backupPipe);
});
const collector = addConduit([[11.21, pipeY, pumpZ], [0, pipeY, pumpZ], [pumpX + 0.54, pipeY, pumpZ]], backupPipe);
const distribution = addConduit([[pumpX - 0.54, pipeY, pumpZ], [-22.65, pipeY, pumpZ], [-23.6, pipeY, 5.2],
  [-23.8, districtY + 0.18, 3.6], [-23.8, districtY + 0.18, -12.6]], backupPipe);
function pressureStation(position, name) {
  const { x, y, z } = position;
  cylinder(scene, 0.07, 0.61, x, y + 0.3, z, solarFrame, 10);
  box(scene, 0.38, 0.27, 0.24, x, y + 0.68, z, shutters);
  label(scene, name, x, y + 1.72, z).scale.set(2.65, 0.66, 1);
}
pressureStation(distribution.getPointAt(0), 'A · 0 m');
pressureStation(distribution.getPointAt(1), 'B · 100 m');
const testLeak = distribution.getPointAt(0.5);
const leakLabel = label(scene, 'Fuite · 50 m', testLeak.x, testLeak.y + 2.1, testLeak.z);
const testDrops = Array.from({ length: 30 }, () => {
  const drop = mesh(scene, runoffDropGeometry, runoffFlow, 0, 0, 0);
  drop.castShadow = false;
  drop.visible = false;
  return drop;
});
let pressureTest = { running: false, leaking: false, duringSupply: false };
const outlets = homes.map(([x, z]) => addConduit([[-23.8, districtY + 0.18, z + 1.43],
  [x + 2.4, districtY + 0.18, z + 1.43], [x + 1.97, districtY + 0.25, z + 1.43]], backupPipe, 0.068));
addConduit([[publicX + 1.1, districtY + 3.05, publicZ], [publicX + 2.8, districtY + 0.05, publicZ],
  [parkingX - 0.65, districtY + 0.12, parkingZ], [parkingX + 0.8, districtY + 0.12, -11],
  [pumpX - 0.2, pipeY - 0.07, 3.9], [pumpX, pipeY + 0.27, pumpZ]], powerCable, 0.045);
addConduit([[parkingX + 1.1, districtY + 2.08, parkingZ - 1.88], [parkingX + 1.55, districtY + 0.1, parkingZ],
  [-17.7, districtY + 0.11, -15.7], [-16.7, 0.04, -14.2], [15.8, 0.04, -14.2]], powerCable, 0.048);
for (const { group } of basins) {
  const { x, z } = group.position;
  addConduit([[x + 4.1, 0.04, -14.2], [x + 4.1, 0.06, -8.0], [x + 2, 0.25, z - 5.1],
    [x + 0.72, 0.68, z + wellZ]], powerCable, 0.043);
}
const rescueParticles = Array.from({ length: 72 }, () => {
  const drop = mesh(scene, particleGeometry, backupFlow, 0, 0, 0);
  drop.castShadow = false;
  drop.visible = false;
  return drop;
});
let backupBasin = 0;

const rainColumns = 24;
const rainRows = 18;
const siteRain = new THREE.InstancedMesh(dropGeometry, dropMat, rainColumns * rainRows);
siteRain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
siteRain.frustumCulled = false;
siteRain.visible = false;
scene.add(siteRain);
const rainMatrix = new THREE.Matrix4();
const raindrops = Array.from({ length: siteRain.count }, (_, index) => {
  const x = siteLeft + (index % rainColumns + Math.random()) * (siteRight - siteLeft) / rainColumns;
  const z = siteBack + (Math.floor(index / rainColumns) + Math.random()) * (siteFront - siteBack) / rainRows;
  const basin = basins.find(({ group }) => Math.hypot(x - group.position.x, z - group.position.z) < 3.83);
  return { x, z, basin, offset: Math.random(), densitySample: Math.random() };
});

export function setSceneWeather(reading) {
  weather = reading;
  const darkness = 0.79 * (1 - Math.min(reading.irradiance / 950, 1)) ** 1.45;
  sun.intensity = 3 * (1 - darkness);
  skyLight.intensity = 2.1 * (1 - darkness * 0.61);
  scene.background.setHex(0xcde4e6).lerp(new THREE.Color(0x65798f), darkness);
  scene.fog.color.copy(scene.background);
  referenceCell.emissiveIntensity = reading.irradiance / 1100;
  solarCell.emissiveIntensity = reading.watts / 900;
  updateSensorReading();
}

export function setSceneTelemetry(state, { online, label, openings }) {
  activeTelemetry = state;
  readingSource = label;
  const backupId = state?.backupBasin || 0;
  backupBasin = online && (openings?.[backupId] ?? 100) > 0 ? backupId : 0;
  basins.forEach((basin, index) => {
    const reading = basinReading(state, index + 1);
    basin.target = Number.isFinite(reading?.levelPct)
      ? THREE.MathUtils.clamp(reading.levelPct / 100, 0, 1) * waterDepth : 0;
    basin.pumping = online && reading?.pumpOn === true && (openings?.[index + 1] ?? 100) > 0;
    basin.raining = online && reading?.rainOn === true;
    basin.irrigationMode = reading?.irrigationMode ?? 'drip';
    basin.pumpMaterial.emissive.setHex(online && reading?.pumpOn ? 0x704218 : 0x000000);
  });
  updateSensorReading();
  return backupBasin;
}

export function setScenePressure(result) {
  pressureTest = result;
}

let lastFrame = performance.now();
let lifterStarted = -Infinity;
const lifterButton = document.querySelector('#show-lifters');
lifterButton.addEventListener('click', () => { lifterStarted = performance.now(); });
const inletButton = document.querySelector('#show-inlet');
const pressureButton = document.querySelector('#show-pressure');
const gardenButton = document.querySelector('#show-garden');
const sensorButton = document.querySelector('#show-sensor');
let overview = null;
let detailView = null;
function focusView(view, retarget = false) {
  if (view === detailView && !retarget) {
    if (!overview) return;
    camera.position.copy(overview.position);
    controls.target.copy(overview.target);
    overview = null;
    detailView = null;
  } else if (view === 'inlet' || view === 'garden' || view === 'sensor') {
    const basin = basins[selectedBasinIndex()];
    overview ??= { position: camera.position.clone(), target: controls.target.clone() };
    if (view === 'inlet') {
      controls.target.copy(apronPoint(plazaInletAngle, 4.25, 0.32).add(basin.group.position));
      camera.position.copy(controls.target).add(new THREE.Vector3(6, 7.7, 6.7));
    } else if (view === 'garden') {
      controls.target.set(basin.group.position.x, 0.62, -10.6 + parkOffset);
      camera.position.copy(controls.target).add(new THREE.Vector3(2.2, 5.8, 8.4));
    } else {
      const target = {
        level: new THREE.Vector3(-1.45, 0.24, -3.37).add(basin.group.position),
        temperature: temperaturePosition, turbidity: turbidityPosition, soil: soilPosition, weather: weatherPosition,
      }[sensorChoice.value];
      controls.target.copy(target);
      camera.position.copy(target).add(new THREE.Vector3(1.6, 3.1, 3.75));
      sensorHalo.position.copy(target);
      sensorHalo.position.y += 0.17;
    }
    detailView = view;
  } else {
    overview ??= { position: camera.position.clone(), target: controls.target.clone() };
    controls.target.copy(distribution.getPointAt(0.5));
    camera.position.copy(controls.target).add(new THREE.Vector3(13, 19, 13));
    detailView = view;
  }
  for (const [button, mode, labelText] of [
    [inletButton, 'inlet', 'Zoom sur l’entrée d’eau'], [pressureButton, 'pressure', 'Zoom sur la conduite'],
    [gardenButton, 'garden', 'Zoom sur l’arrosage'],
    [sensorButton, 'sensor', 'Zoom sur le capteur'],
  ]) {
    const active = detailView === mode;
    button.textContent = active ? 'Revenir à la vue d’ensemble' : labelText;
    button.setAttribute('aria-pressed', String(active));
  }
  sensorHalo.visible = detailView === 'sensor';
  controls.update();
}
inletButton.addEventListener('click', () => focusView('inlet'));
pressureButton.addEventListener('click', () => focusView('pressure'));
gardenButton.addEventListener('click', () => focusView('garden'));
sensorButton.addEventListener('click', () => focusView('sensor'));
sensorChoice.addEventListener('change', () => {
  updateSensorReading();
  if (detailView === 'sensor') focusView('sensor', true);
});
export function refreshSelectedBasin() {
  updateSensorReading();
  if (detailView === 'sensor' && sensorChoice.value === 'level') focusView('sensor', true);
}

export function closePressureView() {
  if (detailView === 'pressure') focusView('pressure');
}

function animate(now) {
  const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.05);
  lastFrame = now;
  rippleTime.value = now / 1000;
  leakLabel.visible = pressureTest.leaking;
  testDrops.forEach((drop, index) => {
    drop.visible = pressureTest.running && (index < 20 ? !pressureTest.duringSupply : pressureTest.leaking);
    if (!drop.visible) return;
    if (index < 20) {
      drop.position.copy(distribution.getPointAt((now / 3200 + index / 20) % 1));
      drop.position.y += 0.11;
    } else {
      const phase = (now / 820 + index / 10) % 1;
      drop.position.set(testLeak.x + phase * 0.86, testLeak.y + 1.44 * Math.sin(Math.PI * phase), testLeak.z + phase * 0.56);
    }
  });
  rescuePump.emissive.setHex(backupBasin ? 0x174454 : 0x000000);
  const route = backupBasin && [branches[backupBasin - 1], collector, distribution, ...outlets];
  rescueParticles.forEach((drop, index) => {
    drop.visible = Boolean(route);
    if (!route) return;
    const segment = route[Math.floor(index / 12)];
    const phase = (now / 2200 + (index % 12) / 12) % 1;
    // Begin the collector's flow at the tap of the selected cistern.
    const start = segment === collector ? (12 - basins[backupBasin - 1].group.position.x) / 30 : 0;
    drop.position.copy(segment.getPointAt(THREE.MathUtils.lerp(start, 1, phase)));
  });
  const rainIntensity = weather?.rain ?? 0;
  const weatherRain = rainIntensity > 0;
  const collectionRain = basins.some(basin => basin.raining);
  siteRain.visible = weatherRain || collectionRain;
  if (siteRain.visible) {
    const density = weatherRain ? Math.min(1, 0.24 + rainIntensity / 18) : 1;
    let drawn = 0;
    for (const { x, z, basin, offset, densitySample } of raindrops) {
      if (densitySample > density) continue;
      const onTransition = Math.abs(x) < transitionWidth / 2 && z >= plazaFront && z <= terraceEdge(x);
      const ground = basin ? floor + basin.level
        : x < -18.5 ? districtY : z <= parkFront ? -0.1 : z < plazaFront ? plazaHeight(z)
        : onTransition ? apronJoinHeight : floor;
      const y = THREE.MathUtils.lerp(7.8, ground, (now / 1150 + offset) % 1);
      siteRain.setMatrixAt(drawn++, rainMatrix.makeTranslation(x, y, z));
    }
    siteRain.count = drawn;
    siteRain.instanceMatrix.needsUpdate = true;
  }
  const lifterProgress = THREE.MathUtils.clamp((now - lifterStarted) / 5000, 0, 1);
  const descent = Math.sin(lifterProgress * Math.PI) ** 2;
  lifterButton.disabled = lifterProgress < 1;
  for (const basin of basins) {
    const { cableTop, cable, drum, sack } = basin.lifter;
    sack.position.y = THREE.MathUtils.lerp(0.89, -1.48, descent);
    const cableLength = cableTop - sack.position.y;
    cable.scale.y = cableLength;
    cable.position.y = cableTop - cableLength / 2;
    drum.rotation.y = descent * 12;
    basin.level = THREE.MathUtils.damp(basin.level, basin.target, 5, dt);
    basin.body.visible = basin.surface.visible = basin.level > 0.012;
    basin.body.scale.y = basin.level;
    basin.body.position.y = floor + basin.level / 2;
    basin.surface.position.y = floor + basin.level;
    for (const particle of basin.particles) {
      particle.object.visible = basin.pumping;
      if (basin.pumping) {
        particle.progress = (particle.progress + dt * 0.55) % 1;
        particle.object.position.copy(basin.path.getPointAt(particle.progress));
      }
    }
    const gardenFlow = basin.gardenFlow;
    gardenFlow.particles.forEach((object, index) => {
      object.visible = basin.pumping;
      if (basin.pumping) {
        object.position.copy(gardenFlow.path.getPointAt((now / 2500 + index / gardenFlow.particles.length) % 1));
      }
    });
    for (const channel of basin.runoff) {
      for (const { drop, offset } of channel.drops) {
        drop.visible = basin.raining || weatherRain;
        if (!drop.visible) continue;
        const phase = (now / 1650 + offset) % 1;
        if (phase < 0.84) {
          drop.position.copy(channel.path.getPointAt(phase / 0.84));
        } else {
          drop.position.copy(channel.exit);
          const fall = ((phase - 0.84) / 0.16) ** 2;
          drop.position.y = THREE.MathUtils.lerp(channel.exit.y, floor + basin.level, fall);
        }
      }
    }
    for (const emitter of basin.emitters) {
      const sprinkling = basin.irrigationMode === 'sprinkler';
      emitter.wetPatch.visible = basin.pumping && !sprinkling;
      emitter.drops.forEach((drop, index) => {
        drop.visible = basin.pumping && (sprinkling || index < 4);
        if (!drop.visible) return;
        const phase = (now / (sprinkling ? 910 : 610) + index / (sprinkling ? 8 : 4)) % 1;
        const angle = now / 590 + Math.floor(index / 8) * Math.PI * 2 / 3;
        const distance = sprinkling ? phase * 1.56 : 0;
        drop.scale.setScalar(sprinkling ? 1.06 : 0.77);
        drop.position.set(
          emitter.x + Math.cos(angle) * distance,
          sprinkling ? 0.21 * (1 - phase) + 1.35 * Math.sin(Math.PI * phase) : 0.21 * (1 - phase),
          emitter.z + (sprinkling ? Math.sin(angle) * distance : -0.55),
        );
      });
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  const { clientWidth: width, clientHeight: height } = container;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.clamp(42 * 1.48 / camera.aspect, 42, 78);
  if (container.hasAttribute('data-controls-overlay') && width >= 1000) {
    camera.setViewOffset(width, height, -Math.min(145, width * 0.105), 0, width, height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

new ResizeObserver(resize).observe(container);
resize();
renderer.setAnimationLoop(animate);
