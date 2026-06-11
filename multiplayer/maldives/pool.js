// pool.js — インフィニティプールと落水・泡・水滴・波紋。
// （villa.js から追加分割: 2026-06-12）
import * as THREE from 'three';
import { loadTexture } from './textures.js';
import { LOWER_DECK_TOP } from './resort-shared.js';

const poolRimMaterial = new THREE.MeshStandardMaterial({
  color: 0xddd8cc,
  roughness: 0.4,
  envMapIntensity: 0.7,
});
// プール水面の波紋（法線マップをドリフトさせ反射を揺らめかせる）
const poolRippleTexture = loadTexture(
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/waternormals.jpg',
  { repeat: [2.5, 2] }
);
const poolWaterMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x2fd0c8,
  transparent: true,
  opacity: 0.85,
  roughness: 0.08,
  normalMap: poolRippleTexture,
  normalScale: new THREE.Vector2(0.35, 0.35),
  envMapIntensity: 1.2,
});

// 落水の縦筋テクスチャ（プールのオーバーフロー用）
function createSpillTexture() {
  const WIDTH = 512;
  const HEIGHT = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  let seed = 11;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  // 背景は透明のまま、はっきりした水筋を描く（隙間から奥が透けて
  // 「別々の筋が落ちている」ことが分かる）
  const STREAK_COUNT = 70;
  for (let i = 0; i < STREAK_COUNT; i += 1) {
    const x = random() * WIDTH;
    const width = 4 + random() * 12;
    const alpha = 0.45 + random() * 0.45;
    // 筋に沿って濃淡の節を入れ、スクロール時に流速感を出す
    const SEGMENTS = 14;
    for (let s = 0; s < SEGMENTS; s += 1) {
      const y0 = (s / SEGMENTS) * HEIGHT;
      ctx.fillStyle = `rgba(255,255,255,${alpha * (0.45 + random() * 0.55)})`;
      ctx.fillRect(
        x - width / 2 + (random() - 0.5) * 2,
        y0,
        width,
        HEIGHT / SEGMENTS + 1
      );
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 着水部の泡テクスチャ
function createFoamTexture() {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  let seed = 23;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let i = 0; i < 140; i += 1) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = 8 + random() * 28;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(255,255,255,${0.25 + random() * 0.3})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    // 横ラップ
    for (const ox of [0, -SIZE, SIZE]) {
      ctx.fillRect(x - r + ox, y - r, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 2層の落水（異なる速度でスクロールさせ、奥行きと流速感を出す）
const spillTextureFront = createSpillTexture();
const spillTextureBack = createSpillTexture();
spillTextureBack.repeat.set(1.6, 1.2);
const foamTexture = createFoamTexture();

// WebGPUはPointsのサイズ指定に未対応のため、水滴は小さな球のインスタンスで描く
const dropletGeometry = new THREE.SphereGeometry(0.045, 6, 5);
const dropletMaterial = new THREE.MeshBasicMaterial({
  color: 0xeefffd,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const dropletDummy = new THREE.Object3D();

// 各プールの落水アニメーション対象（パーティクル・波紋）
const spillEmitters = [];

// 全プール共有（テクスチャオフセットを一括アニメーション）。
// ライティングで白飛びしないよう非ライト依存のBasicにする
const spillFrontMaterial = new THREE.MeshBasicMaterial({
  color: 0xf2fffd,
  map: spillTextureFront,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const spillBackMaterial = new THREE.MeshBasicMaterial({
  color: 0xc8f0ea,
  map: spillTextureBack,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
  depthWrite: false,
});
// 縁の天端を越える水の輝くエッジ
const spillBeadMaterial = new THREE.MeshBasicMaterial({
  color: 0xeefffd,
  transparent: true,
  opacity: 0.85,
});
const foamMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: foamTexture,
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
});

// インフィニティプール（白い縁、外縁はデッキ端と面一）
export function createPool(poolW, poolD) {
  const pool = new THREE.Group();
  const RIM = 0.22;
  const RIM_HEIGHT = 0.42;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(poolW, 0.08, poolD),
    poolRimMaterial
  );
  floor.position.y = 0.04;
  pool.add(floor);

  // 外海側(-z)の縁だけ水面より低くする＝本物のインフィニティエッジ。
  // 水がその縁を越えて流れ落ちる
  const WATER_LEVEL = RIM_HEIGHT - 0.08; // 0.34
  const OUTER_RIM_HEIGHT = WATER_LEVEL - 0.025; // 水面より低い外縁
  const rims = [
    [poolW, RIM, 0, poolD / 2 - RIM / 2, RIM_HEIGHT],
    [poolW, RIM, 0, -poolD / 2 + RIM / 2, OUTER_RIM_HEIGHT],
    [RIM, poolD - RIM * 2, poolW / 2 - RIM / 2, 0, RIM_HEIGHT],
    [RIM, poolD - RIM * 2, -poolW / 2 + RIM / 2, 0, RIM_HEIGHT],
  ];
  for (const [w, d, x, z, h] of rims) {
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      poolRimMaterial
    );
    rim.position.set(x, h / 2, z);
    pool.add(rim);
  }

  // プール水面：外海側は低い縁の外面まで張り出し、越流が見える
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM * 2, poolD - RIM),
    poolWaterMaterial
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER_LEVEL, -RIM / 2);
  pool.add(water);

  // --- インフィニティエッジの落水（外海側 -z へこぼれ落ちる） ---
  const dropHeight = WATER_LEVEL + LOWER_DECK_TOP + 0.12; // 水面から海面下まで

  // デッキ下の陰（暗い背景板）：白い水筋のコントラストを確保する
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM + 0.1, dropHeight),
    new THREE.MeshBasicMaterial({
      color: 0x143836,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  shade.position.set(0, WATER_LEVEL - dropHeight / 2, -poolD / 2 + 0.005);
  shade.userData.noShadow = true;
  pool.add(shade);

  // 奥層：薄い色で広く、わずかに外へ傾ける
  const backSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM, dropHeight),
    spillBackMaterial
  );
  backSheet.position.set(0, WATER_LEVEL - dropHeight / 2, -poolD / 2 - 0.02);
  backSheet.rotation.x = 0.04;
  backSheet.userData.noShadow = true;
  pool.add(backSheet);

  // 手前層：はっきりした水筋（速いスクロール）
  const frontSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM, dropHeight),
    spillFrontMaterial
  );
  frontSheet.position.set(0, WATER_LEVEL - dropHeight / 2 - 0.02, -poolD / 2 - 0.07);
  frontSheet.rotation.x = 0.07; // 下端ほど外へ膨らむ放物線の近似
  frontSheet.userData.noShadow = true;
  pool.add(frontSheet);

  // 低い外縁を越えてカーブする水（白く輝く越流エッジ）
  const bead = new THREE.Mesh(
    new THREE.BoxGeometry(poolW - RIM, 0.03, RIM + 0.04),
    spillBeadMaterial
  );
  bead.position.set(0, WATER_LEVEL + 0.005, -poolD / 2 + RIM / 2 - 0.02);
  bead.rotation.x = -0.12; // 外へ向かって下がる
  pool.add(bead);

  // 着水部の泡（海面すれすれ・広め）
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW + 0.8, 1.3),
    foamMaterial
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, -LOWER_DECK_TOP + 0.06, -poolD / 2 - 0.55);
  foam.userData.noShadow = true;
  pool.add(foam);

  // --- 落下する水滴パーティクル ---
  let seed = 77;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const DROP_COUNT = 60;
  const droplets = [];
  for (let i = 0; i < DROP_COUNT; i += 1) {
    droplets.push({
      x: (random() - 0.5) * (poolW - RIM) * 0.95,
      phase: random(),
      speed: 0.7 + random() * 0.6,
    });
  }
  const dropletMesh = new THREE.InstancedMesh(dropletGeometry, dropletMaterial, DROP_COUNT);
  dropletMesh.frustumCulled = false;
  pool.add(dropletMesh);

  // --- 着水点に広がる波紋リング ---
  const rings = [];
  for (let k = 0; k < 3; k += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, -LOWER_DECK_TOP + 0.08, -poolD / 2 - 0.45);
    ring.scale.set(poolW / 1.2, 1, 1); // プール幅に合わせた楕円
    pool.add(ring);
    rings.push(ring);
  }

  spillEmitters.push({
    mesh: dropletMesh,
    droplets,
    rings,
    waterLevel: WATER_LEVEL,
    dropHeight,
    edgeZ: -poolD / 2,
  });

  return pool;
}

// プール関連の毎フレーム更新（落水スクロール・泡・波紋・水滴・波紋リング）
export function updatePools(time) {
    // プールの落水：2層の水筋を異なる速度で流し、着水の泡を脈動させる
    spillTextureFront.offset.y = (time * 2.2) % 1;
    spillTextureBack.offset.y = (time * 1.3) % 1;
    spillTextureBack.offset.x = Math.sin(time * 0.4) * 0.02; // 揺らぎ
    foamTexture.offset.x = (time * 0.07) % 1;
    foamMaterial.opacity = 0.62 + 0.18 * Math.sin(time * 3.2);
    // プール水面の波紋：水が流れ落ちるインフィニティエッジへ向かって流す
    poolRippleTexture.offset.set(
      Math.sin(time * 0.6) * 0.008, // わずかな横揺らぎのみ
      -((time * 0.06) % 1) // エッジ方向への一定の流れ
    );

    // 水滴パーティクルの落下（放物線で外へ膨らむ）と波紋の拡大
    for (const emitter of spillEmitters) {
      for (let i = 0; i < emitter.droplets.length; i += 1) {
        const droplet = emitter.droplets[i];
        const progress = (time * droplet.speed + droplet.phase) % 1;
        dropletDummy.position.set(
          droplet.x + Math.sin(time * 3 + i) * 0.01,
          emitter.waterLevel - progress * progress * emitter.dropHeight,
          emitter.edgeZ - 0.05 - progress * progress * 0.3
        );
        dropletDummy.updateMatrix();
        emitter.mesh.setMatrixAt(i, dropletDummy.matrix);
      }
      emitter.mesh.instanceMatrix.needsUpdate = true;

      for (let k = 0; k < emitter.rings.length; k += 1) {
        const ring = emitter.rings[k];
        const cycle = (time * 0.55 + k / emitter.rings.length) % 1;
        const spread = 0.35 + cycle * 1.5;
        ring.scale.set(spread * 2.2, spread, 1);
        ring.material.opacity = 0.45 * (1 - cycle);
      }
    }
}
