// WebGPU (three.js r179 / TSL) 版のラグーンの海と空。
// シングルプレイ版の Water(WebGL) を WaterMesh / SkyMesh に置き換えたもの。
import * as THREE from 'three';
import { positionLocal, time, sin, cos, vec3 } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WaterMesh } from 'three/addons/objects/WaterMesh.js';

const WATER_SIZE = 10000;
const SKY_SCALE = 10000;
const SUN_LIGHT_DISTANCE = 120;
const SHADOW_AREA = 60;
const SHADOW_MAP_SIZE = 2048;
const WATER_NORMALS_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/waternormals.jpg';

// 時刻モード: 昼のターコイズラグーン / 夕暮れの鏡の海
const MODES = {
  noon: {
    waterAlpha: 0.5,          // 半透明 — 海底と魚が透ける
    turbidity: 3,
    rayleigh: 0.6,
    waterColor: 0x30e8da,
    sunElevation: 50,
    sunAzimuth: 235,
    distortionScale: 2.6,
    fogColor: 0xaadcee,
    fogDensity: 0.00002,
    exposure: 0.35,
    sunIntensity: 2.4,
    sunColor: 0xffffff,
    hemiIntensity: 0.6,
    waterSunColor: 0xffffff,
  },
  sunset: {
    waterAlpha: 0.96,         // ほぼ不透明 — 水面は空を映す鏡になる
    turbidity: 10,
    rayleigh: 3,
    waterColor: 0x001e0f,     // 公式oceanデモと同じ暗い深緑
    sunElevation: 2.5,
    sunAzimuth: 188,          // 桟橋の先（島の方向）に光の道ができる
    distortionScale: 3.7,
    fogColor: 0x2a1a10,
    fogDensity: 0.00012,
    exposure: 0.5,
    sunIntensity: 1.1,
    sunColor: 0xff7733,
    hemiIntensity: 0.15,
    waterSunColor: 0xffd9a0,
  },
};
const PRESET = MODES.noon;

export function createOcean(scene, { swellEnabled = true, renderer = null } = {}) {
  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - PRESET.sunElevation);
  const theta = THREE.MathUtils.degToRad(PRESET.sunAzimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  // ── 水面（TSL WaterMesh、半透明で海底と魚が見える） ──
  const waterNormals = new THREE.TextureLoader().load(
    WATER_NORMALS_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    },
    undefined,
    (error) => console.error('水面法線テクスチャの読み込みに失敗:', error)
  );
  const water = new WaterMesh(
    new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 128, 128),
    {
      waterNormals,
      sunDirection: sun.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: PRESET.waterColor,
      distortionScale: PRESET.distortionScale,
      alpha: PRESET.waterAlpha,
    }
  );
  water.rotation.x = -Math.PI / 2;
  water.material.transparent = true;
  water.renderOrder = 1;
  // うねり: 3方向の正弦波で頂点を上下させる。
  // WebGLバックエンドではWaterMeshのuniformブロック上限を超えて
  // コンパイルに失敗するため、WebGPU時のみ適用する
  if (swellEnabled) {
    const swell = sin(positionLocal.x.mul(0.045).add(time.mul(0.6))).mul(0.14)
      .add(cos(positionLocal.y.mul(0.032).add(time.mul(0.81))).mul(0.11))
      .add(sin(positionLocal.x.add(positionLocal.y).mul(0.018).add(time.mul(0.42))).mul(0.16));
    water.material.positionNode = positionLocal.add(vec3(0, 0, swell));
  }
  scene.add(water);

  // ── 空（TSL SkyMesh） ──
  const sky = new SkyMesh();
  sky.scale.setScalar(SKY_SCALE);
  sky.turbidity.value = PRESET.turbidity;
  sky.rayleigh.value = PRESET.rayleigh;
  sky.mieCoefficient.value = 0.005;
  sky.mieDirectionalG.value = 0.8;
  sky.sunPosition.value.copy(sun);
  scene.add(sky);

  // ── 太陽光（影あり）と水面からの照り返し ──
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.camera.left = -SHADOW_AREA;
  sunLight.shadow.camera.right = SHADOW_AREA;
  sunLight.shadow.camera.top = SHADOW_AREA;
  sunLight.shadow.camera.bottom = -SHADOW_AREA;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_LIGHT_DISTANCE * 3;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.05;
  sunLight.target.position.set(4, 0, -38);
  sunLight.position.copy(sun).multiplyScalar(SUN_LIGHT_DISTANCE).add(sunLight.target.position);
  scene.add(sunLight, sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xbfd8e8, 0x5fc8b8, 0.6);
  scene.add(hemiLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  scene.fog = new THREE.FogExp2(PRESET.fogColor, PRESET.fogDensity);

  // 時刻モードの切替（昼のラグーン ⇄ 夕暮れの鏡の海）。
  // 太陽・空・水・霧・露出・ライトをまとめて差し替える
  function setMode(name) {
    const m = MODES[name];
    if (!m) {
      console.error(`未知の時刻モードです: ${name}`);
      return;
    }
    const mPhi = THREE.MathUtils.degToRad(90 - m.sunElevation);
    const mTheta = THREE.MathUtils.degToRad(m.sunAzimuth);
    sun.setFromSphericalCoords(1, mPhi, mTheta);

    sky.turbidity.value = m.turbidity;
    sky.rayleigh.value = m.rayleigh;
    sky.sunPosition.value.copy(sun);

    water.sunDirection.value.copy(sun).normalize();
    water.waterColor.value.set(m.waterColor);
    water.distortionScale.value = m.distortionScale;
    water.alpha.value = m.waterAlpha;
    water.sunColor.value.set(m.waterSunColor);

    sunLight.position.copy(sun).multiplyScalar(SUN_LIGHT_DISTANCE).add(sunLight.target.position);
    sunLight.color.set(m.sunColor);
    sunLight.intensity = m.sunIntensity;
    hemiLight.intensity = m.hemiIntensity;

    scene.fog.color.set(m.fogColor);
    scene.fog.density = m.fogDensity;
    if (renderer) renderer.toneMappingExposure = m.exposure;
  }

  return { water, sky, sunDir: sun, setMode };
}
