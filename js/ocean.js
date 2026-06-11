import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

const WATER_SIZE = 10000;
const SKY_SCALE = 10000;
const SUN_LIGHT_DISTANCE = 120;
const SHADOW_AREA = 60; // 影を落とす範囲（桟橋とヴィラ列一帯）
const SHADOW_MAP_SIZE = 4096;
const SHADOW_CATCHER_RADIUS = 75;
const WATER_NORMALS_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/waternormals.jpg';

// 参考: Three.js Water Pro の環境プリセット（凪〜嵐）
export const PRESETS = {
  'Maldives Noon': {
    waveHeight: 1.0,
    waterAlpha: 0.45,
    turbidity: 3,
    rayleigh: 0.6,
    exposure: 0.35,
    distortionScale: 2.4,
    waveSpeed: 0.8,
    waterColor: 0x30e8da,
    sunElevation: 50,
    sunAzimuth: 235,
    fogDensity: 0.00002,
  },
  'Glassy Calm': {
    waveHeight: 0.35,
    waterAlpha: 0.85,
    turbidity: 4,
    rayleigh: 1.5,
    exposure: 0.4,
    distortionScale: 1.2,
    waveSpeed: 0.4,
    waterColor: 0x00474f,
    sunElevation: 12,
    sunAzimuth: 165,
    fogDensity: 0.00005,
  },
  'Gentle Breeze': {
    waveHeight: 1.2,
    waterAlpha: 0.88,
    turbidity: 3,
    rayleigh: 1.2,
    exposure: 0.32,
    distortionScale: 2.8,
    waveSpeed: 0.8,
    waterColor: 0x001e0f,
    sunElevation: 25,
    sunAzimuth: 180,
    fogDensity: 0.00008,
  },
  'Tropical Noon': {
    waveHeight: 1.0,
    waterAlpha: 0.8,
    turbidity: 2,
    rayleigh: 0.8,
    exposure: 0.22,
    distortionScale: 2.0,
    waveSpeed: 0.7,
    waterColor: 0x006994,
    sunElevation: 60,
    sunAzimuth: 200,
    fogDensity: 0.00003,
  },
  Choppy: {
    waveHeight: 2.0,
    waterAlpha: 0.92,
    turbidity: 8,
    rayleigh: 2,
    exposure: 0.35,
    distortionScale: 4.5,
    waveSpeed: 1.4,
    waterColor: 0x0a2e36,
    sunElevation: 18,
    sunAzimuth: 140,
    fogDensity: 0.0002,
  },
  'Golden Sunset': {
    waveHeight: 1.3,
    waterAlpha: 0.9,
    turbidity: 10,
    rayleigh: 3,
    exposure: 0.5,
    distortionScale: 3.0,
    waveSpeed: 0.9,
    waterColor: 0x2a1a0a,
    sunElevation: 3,
    sunAzimuth: 190,
    fogDensity: 0.0004,
  },
  Storm: {
    waveHeight: 3.0,
    waterAlpha: 0.96,
    turbidity: 20,
    rayleigh: 4,
    exposure: 0.3,
    distortionScale: 5.5,
    waveSpeed: 2.2,
    waterColor: 0x06141a,
    sunElevation: 6,
    sunAzimuth: 90,
    fogDensity: 0.0008,
  },
};

export const DEFAULT_PRESET = 'Maldives Noon';

function loadWaterNormals() {
  return new THREE.TextureLoader().load(
    WATER_NORMALS_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    },
    undefined,
    (error) => {
      console.error('水面法線テクスチャの読み込みに失敗しました:', error);
    }
  );
}

/**
 * 海面・空・太陽をまとめて生成し、パラメータ適用と毎フレーム更新の
 * 関数を返す。
 */
export function createOcean(scene, renderer) {
  const sun = new THREE.Vector3();

  // うねり（頂点変位）用に細分化したプレーン
  const water = new Water(
    new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 256, 256),
    {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: loadWaterNormals(),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffffff,
    waterColor: PRESETS[DEFAULT_PRESET].waterColor,
    distortionScale: PRESETS[DEFAULT_PRESET].distortionScale,
    alpha: PRESETS[DEFAULT_PRESET].waterAlpha,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.transparent = true; // 半透明にして水中の生物・海底を見せる
  water.renderOrder = 1; // 透明物同士の描画順を固定してちらつきを防ぐ
  water.receiveShadow = true;
  // 視線が浅い角度でも空の鏡映一色にならないよう反射率に上限を設け、
  // ラグーンの水色（散乱項）を残す
  water.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
        'float reflectance = min( 0.35, rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 ) );'
      )
      // 散乱に下限を設け、遠景でもラグーンの水色が残るようにする
      .replace(
        'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
        'vec3 scatter = ( 0.55 + 0.45 * max( 0.0, dot( surfaceNormal, eyeDirection ) ) ) * waterColor;'
      );

    // うねり：3方向の正弦波で頂点を上下させ、水面全体を揺らす
    shader.uniforms.waveAmplitude = { value: 1.0 };
    shader.vertexShader = ('uniform float waveAmplitude;\n' +
      shader.vertexShader
        .replace(
          'void main() {',
          [
            'void main() {',
            '\tvec3 wavePosition = position;',
            '\tfloat waveTime = time * 0.6;',
            '\twavePosition.z += waveAmplitude * (',
            '\t\tsin( position.x * 0.045 + waveTime ) * 0.14 +',
            '\t\tcos( position.y * 0.032 + waveTime * 1.35 ) * 0.11 +',
            '\t\tsin( ( position.x + position.y ) * 0.018 + waveTime * 0.7 ) * 0.16 );',
          ].join('\n')
        )
        .replaceAll('vec4( position, 1.0 )', 'vec4( wavePosition, 1.0 )'));
    water.material.userData.shader = shader;
  };
  scene.add(water);

  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms.mieCoefficient.value = 0.005;
  skyUniforms.mieDirectionalG.value = 0.8;

  // 太陽に連動する平行光源（全オブジェクトの影と反射の光源）
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.camera.left = -SHADOW_AREA;
  sunLight.shadow.camera.right = SHADOW_AREA;
  sunLight.shadow.camera.top = SHADOW_AREA;
  sunLight.shadow.camera.bottom = -SHADOW_AREA;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_LIGHT_DISTANCE * 3;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.03; // 壁面のシャドウアクネを防ぐ
  sunLight.target.position.set(4, 0, -38); // ヴィラ列の中心に影を集める
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 水面シェーダーは影を受けられないため、影専用の透明プレーンを重ねる
  const shadowCatcherMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
  shadowCatcherMaterial.depthWrite = false; // 水面とのZファイティングを防ぐ
  const shadowCatcher = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_CATCHER_RADIUS, 48),
    shadowCatcherMaterial
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(4, 0.03, -35); // 桟橋〜ヴィラ列一帯の中心
  shadowCatcher.renderOrder = 2; // 必ず水面の後に描画
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  let renderTarget;

  const state = { ...PRESETS[DEFAULT_PRESET], preset: DEFAULT_PRESET };

  function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - state.sunElevation);
    const theta = THREE.MathUtils.degToRad(state.sunAzimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    skyUniforms.sunPosition.value.copy(sun);
    water.material.uniforms.sunDirection.value.copy(sun).normalize();

    // 平行光源を太陽位置に同期し、低高度ほど暖色・減光させる
    sunLight.position
      .copy(sun)
      .multiplyScalar(SUN_LIGHT_DISTANCE)
      .add(sunLight.target.position);
    const warmth = THREE.MathUtils.clamp(state.sunElevation / 30, 0, 1);
    sunLight.color.lerpColors(
      new THREE.Color(0xff7733),
      new THREE.Color(0xffffff),
      warmth
    );
    sunLight.intensity = THREE.MathUtils.lerp(1.2, 2.4, warmth);

    if (renderTarget) renderTarget.dispose();
    sceneEnv.add(sky);
    renderTarget = pmremGenerator.fromScene(sceneEnv);
    scene.add(sky);
    scene.environment = renderTarget.texture;
  }

  function applyState() {
    water.material.uniforms.distortionScale.value = state.distortionScale;
    water.material.uniforms.waterColor.value.set(state.waterColor);
    water.material.uniforms.alpha.value = state.waterAlpha;
    if (water.material.userData.shader) {
      water.material.userData.shader.uniforms.waveAmplitude.value =
        state.waveHeight;
    }
    skyUniforms.turbidity.value = state.turbidity;
    skyUniforms.rayleigh.value = state.rayleigh;
    scene.fog = new THREE.FogExp2(0xaadcee, state.fogDensity); // 水平線の青い靄
    renderer.toneMappingExposure = state.exposure;
    updateSun();
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) {
      console.error(`未知のプリセットです: ${name}`);
      return;
    }
    Object.assign(state, preset, { preset: name });
    applyState();
  }

  function update(delta) {
    water.material.uniforms.time.value += delta * state.waveSpeed;
  }

  applyState();

  return { water, sky, sun, state, applyState, applyPreset, update };
}
