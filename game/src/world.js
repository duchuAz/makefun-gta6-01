// The renderer and the sky. A gradient shader sphere holds the time of day; the directional
// light below it throws long shadows across the grid; a warm fog ties the far hills, the
// water and the neon together. Each screenshot mood is a named palette here.
import * as THREE from 'three';
import { PALETTE } from './config.js';

const MOODS = {
  golden: {
    top: 0x2a1a5e, mid: 0xff7864, horizon: 0xffd9a3, sun: 0xfff2cc,
    fog: 0xffb08e, density: 0.00165, sunDir: [-0.72, 0.22, -0.26],
    sunIntensity: 3.1, hemi: 0.92, exposure: 1.2, cloud: 0xffb59d,
  },
  chase: {
    top: 0x2b5da8, mid: 0x9ed1ea, horizon: 0xffe8c8, sun: 0xfff8e0,
    fog: 0xcfe4ec, density: 0.0011, sunDir: [0.35, 0.72, 0.42],
    sunIntensity: 3.2, hemi: 1.05, exposure: 1.04, cloud: 0xfff0dc,
  },
  mission: {
    top: 0x38347a, mid: 0xff9a72, horizon: 0xffd6a8, sun: 0xfff0c8,
    fog: 0xffc3a0, density: 0.0014, sunDir: [-0.42, 0.34, 0.58],
    sunIntensity: 2.9, hemi: 0.9, exposure: 1.12, cloud: 0xffc0a2,
  },
  drive: {
    top: 0x221347, mid: 0xff5f6e, horizon: 0xffc17a, sun: 0xfff4c0,
    fog: 0xff9a70, density: 0.0013, sunDir: [1.0, 0.1, 0.02],
    sunIntensity: 3.4, hemi: 0.72, exposure: 1.18, cloud: 0xff9a86,
  },
  title: {
    top: 0x24144f, mid: 0xff6b64, horizon: 0xffc998, sun: 0xffefc0,
    fog: 0xffa17e, density: 0.0015, sunDir: [-0.8, 0.16, 0.28],
    sunIntensity: 3.0, hemi: 0.85, exposure: 1.18, cloud: 0xffa890,
  },
};

function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(MOODS.golden.top) },
      midColor: { value: new THREE.Color(MOODS.golden.mid) },
      horizonColor: { value: new THREE.Color(MOODS.golden.horizon) },
      sunColor: { value: new THREE.Color(MOODS.golden.sun) },
      sunDir: { value: new THREE.Vector3(...MOODS.golden.sunDir).normalize() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float uTime;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(-0.02, 0.24, h));
        col = mix(col, topColor, smoothstep(0.2, 0.78, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 420.0) * 1.5;
        col += sunColor * pow(s, 22.0) * 0.22;
        col += sunColor * pow(s, 4.0) * 0.07;
        // A few high cirrus streaks, tinted by the hour.
        float streak = sin(d.x * 19.0 + d.z * 11.0 + uTime * 0.006) * sin(d.z * 27.0 - d.x * 7.0);
        col += midColor * smoothstep(0.55, 1.0, streak) * smoothstep(0.03, 0.35, h) * 0.055;
        if (h < 0.0) col = mix(horizonColor, vec3(0.035, 0.045, 0.085), smoothstep(0.0, -0.35, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function makeCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const rnd = (i) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 22; i++) {
    const x = 40 + rnd(i) * 176;
    const y = 52 + rnd(i + 9) * 34;
    const r = 16 + rnd(i + 3) * 32;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,235,225,0.35)');
    grad.addColorStop(0.55, 'rgba(255,205,190,0.14)');
    grad.addColorStop(1, 'rgba(255,180,170,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.18, 'rgba(255,241,198,0.95)');
  grad.addColorStop(0.45, 'rgba(255,196,132,0.32)');
  grad.addColorStop(1, 'rgba(255,140,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0016);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1800);
  camera.position.set(-40, 18, 60);

  const skyMat = makeSkyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 20), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const sunSpriteMat = new THREE.SpriteMaterial({
    map: makeSunTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    opacity: 0.9,
  });
  const sunSprite = new THREE.Sprite(sunSpriteMat);
  sunSprite.scale.set(150, 150, 1);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  const cloudTexture = makeCloudTexture();
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false,
    });
    const cloud = new THREE.Sprite(mat);
    const a = (i / 7) * Math.PI * 2 + 0.6;
    cloud.position.set(Math.cos(a) * 520, 120 + (i % 3) * 42, Math.sin(a) * 520 - 140);
    cloud.scale.set(260 + (i % 2) * 90, 74 + (i % 3) * 16, 1);
    cloud.userData.drift = 0.9 + (i % 3) * 0.4;
    clouds.push(cloud);
    scene.add(cloud);
  }

  const hemi = new THREE.HemisphereLight(0xffd7b0, 0x4c3b56, 0.62);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe2c8, 0.32);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffd2a4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -135;
  sun.shadow.camera.right = 135;
  sun.shadow.camera.top = 135;
  sun.shadow.camera.bottom = -135;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.35;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x7fa8d8, 0.35);
  fill.position.set(-90, 70, 80);
  fill.intensity = 0.5;
  scene.add(fill);

  // A soft pink bounce from the strip, so the pastel walls keep colour in shadow.
  const bounce = new THREE.PointLight(0xff6fa8, 28, 190, 2);
  bounce.position.set(-24, 18, -96);
  scene.add(bounce);
  const bounceCyan = new THREE.PointLight(0x4fe3ff, 22, 160, 2);
  bounceCyan.position.set(24, 24, 24);
  scene.add(bounceCyan);

  let moodName = 'golden';
  const sunDir = new THREE.Vector3();

  function setMood(name, city) {
    const mood = MOODS[name] ?? MOODS.golden;
    moodName = name;
    skyMat.uniforms.topColor.value.setHex(mood.top);
    skyMat.uniforms.midColor.value.setHex(mood.mid);
    skyMat.uniforms.horizonColor.value.setHex(mood.horizon);
    skyMat.uniforms.sunColor.value.setHex(mood.sun);
    sunDir.set(...mood.sunDir).normalize();
    skyMat.uniforms.sunDir.value.copy(sunDir);
    scene.fog.color.setHex(mood.fog);
    scene.fog.density = mood.density;
    renderer.toneMappingExposure = mood.exposure;
    sun.color.setHex(mood.sun);
    sun.intensity = mood.sunIntensity;
    hemi.intensity = mood.hemi;
    hemi.color.setHex(mood.horizon);
    hemi.groundColor.setHex(0x3a2a4a);
    sunSprite.material.color.setHex(mood.sun);
    sunSprite.material.opacity = name === 'chase' ? 0.62 : 0.9;
    for (const cloud of clouds) cloud.material.color.setHex(mood.cloud);
    bounce.intensity = name === 'chase' ? 10 : 26;
    bounceCyan.intensity = name === 'chase' ? 8 : 20;
    if (city) city.setSun(sunDir, mood.fog);
    return mood;
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener('resize', resize);

  let time = 0;
  function update(dt) {
    time += dt;
    skyMat.uniforms.uTime.value = time;
    sky.position.copy(camera.position);
    sunSprite.position.copy(sunDir).multiplyScalar(900).add(camera.position);
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 700) cloud.position.x = -700;
    }
    // Keep the shadow frustum centred on the action.
    sun.target.position.copy(camera.position);
    sun.target.position.y = 0;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 260);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, sun, hemi, sky, setMood, update, render, resize, get mood() { return moodName; } };
}
// recorded-session note: renderer, lighting and mood palettes are unchanged
// strict3 recorded-session note: renderer, lighting and mood palettes are untouched

