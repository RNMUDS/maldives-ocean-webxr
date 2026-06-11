import * as THREE from 'three';
import { loadTexture, loadGeneratedPBRSet } from './textures.js';

export const DECK_HEIGHT = 1.2; // 水面から上段デッキ上面まで(m)

// レイアウト（参照画像準拠：桟橋の片側にヴィラが一列に並ぶ）
const JETTY_LENGTH = 110;
const JETTY_START_Z = 8;
const JETTY_WIDTH = 2.4;
const VILLA_COUNT = 6;
const VILLA_SPACING = 13;
const VILLA_FIRST_Z = -6;
const VILLA_CENTER_X = 8.2; // 桟橋中心からヴィラ中心まで
const BRANCH_WIDTH = 1.6;
const LAMP_SPACING = 8;
const LAMP_COLOR = 0xffb366;
const LAMP_INTENSITY = 5;
const LAMP_RANGE = 9;

// ヴィラ寸法（ローカル座標：+z=桟橋側の入口、-z=外海側）
const DECK_W = 11; // x方向
const DECK_D = 8; // z方向
const CABIN_W = 6;
const CABIN_D = 4.6;
const CABIN_H = 3.0;
const LOWER_DECK_TOP = 0.65; // 下段（プール）デッキ上面
const ENTRANCE_GAP = 1.8;

// --- マテリアル ---
const woodDeckMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8b894,
  map: loadTexture('hardwood2_diffuse.jpg', { repeat: [1, 1], srgb: true }),
  bumpMap: loadTexture('hardwood2_bump.jpg'),
  bumpScale: 0.02,
  roughnessMap: loadTexture('hardwood2_roughness.jpg'),
  roughness: 0.95,
  envMapIntensity: 0.5,
});
const woodPostMaterial = new THREE.MeshStandardMaterial({
  color: 0x8a6a48,
  map: loadTexture('hardwood2_diffuse.jpg', { repeat: [1, 2], srgb: true }),
  bumpMap: loadTexture('hardwood2_bump.jpg'),
  bumpScale: 0.015,
  roughness: 0.9,
  envMapIntensity: 0.4,
});
// 壁：縦張りホワイトウッドの生成PBRテクスチャ
// （板ごとの塗装トーン差・縦木目・目地のV溝入り）
const wallMaterial = new THREE.MeshStandardMaterial({
  ...loadGeneratedPBRSet('whitewood', { repeat: [5, 1] }),
  normalScale: new THREE.Vector2(1.0, 1.0),
  envMapIntensity: 0.3,
});
// ランプポスト用コンクリート（細い柱に合わせて細かめのリピート）
const lampConcreteMaterial = new THREE.MeshStandardMaterial({
  color: 0xb4b4b0, // 直射光での白飛びを防ぐ減光
  ...loadGeneratedPBRSet('concrete', { repeat: [0.5, 0.5] }),
  normalScale: new THREE.Vector2(0.8, 0.8),
  envMapIntensity: 0.3,
});
// 藁葺き屋根：生成PBRテクスチャ（藁一本単位＋束の段差、うすい茶色）
const thatchMaterial = new THREE.MeshStandardMaterial({
  ...loadGeneratedPBRSet('thatch', { repeat: [4, 1.5] }),
  normalScale: new THREE.Vector2(1.0, 1.0),
  envMapIntensity: 0.2,
});
// 透明ガラス（中が見える）
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xcfe8ec,
  transparent: true,
  opacity: 0.22,
  roughness: 0.05,
  metalness: 0,
  envMapIntensity: 1.4,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const frameMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8d4c8,
  roughness: 0.5,
  envMapIntensity: 0.6,
});
const lowerDeckMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6c9ac, // 画像のベージュ床
  roughness: 0.95,
  envMapIntensity: 0.4,
});
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
const cushionMaterial = new THREE.MeshStandardMaterial({
  color: 0xded8ca,
  roughness: 0.9,
  envMapIntensity: 0.4,
});

function enableShadows(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function createGlowTexture() {
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    SIZE / 2, SIZE / 2, 0,
    SIZE / 2, SIZE / 2, SIZE / 2
  );
  gradient.addColorStop(0, 'rgba(255, 210, 140, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 170, 80, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();

// 落水の縦筋テクスチャ（プールのオーバーフロー用）
function createSpillTexture() {
  const WIDTH = 256;
  const HEIGHT = 512;
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
  const STREAK_COUNT = 46;
  for (let i = 0; i < STREAK_COUNT; i += 1) {
    const x = random() * WIDTH;
    const width = 2 + random() * 6;
    const alpha = 0.45 + random() * 0.45;
    // 筋に沿って濃淡の節を入れ、スクロール時に流速感を出す
    const SEGMENTS = 8;
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
  return texture;
}

// 着水部の泡テクスチャ
function createFoamTexture() {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  let seed = 23;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let i = 0; i < 90; i += 1) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = 4 + random() * 14;
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
  return texture;
}

// 2層の落水（異なる速度でスクロールさせ、奥行きと流速感を出す）
const spillTextureFront = createSpillTexture();
const spillTextureBack = createSpillTexture();
spillTextureBack.repeat.set(1.6, 1.2);
const foamTexture = createFoamTexture();

// 落下する水滴パーティクル用のスプライト
function createDropletTexture() {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    SIZE / 2, SIZE / 2, 0,
    SIZE / 2, SIZE / 2, SIZE / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.4, 'rgba(235,255,252,0.5)');
  gradient.addColorStop(1, 'rgba(235,255,252,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return new THREE.CanvasTexture(canvas);
}

const dropletTexture = createDropletTexture();
const dropletMaterial = new THREE.PointsMaterial({
  map: dropletTexture,
  color: 0xffffff,
  size: 0.13,
  transparent: true,
  opacity: 1.0,
  depthWrite: false,
  sizeAttenuation: true,
});

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

// 水中の海底まで届く杭。上端はデッキ板の下に隠してZファイティングを防ぐ
function createStilt(x, z, deckTopY) {
  const DEPTH_BELOW_WATER = 3.2;
  const topY = deckTopY - 0.06;
  const stilt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, topY + DEPTH_BELOW_WATER, 10),
    woodPostMaterial
  );
  stilt.position.set(x, (topY - DEPTH_BELOW_WATER) / 2, z);
  return stilt;
}

/**
 * 手すり。gaps = [{side, center, width}] で任意の辺に開口を空ける。
 * side: 'north'(-z) | 'south'(+z) | 'east'(+x) | 'west'(-x)
 */
function createRailing(width, depth, gaps = []) {
  const railing = new THREE.Group();
  const RAIL_HEIGHT = 0.95;
  const POST_GAP = 1.2;

  const sides = [
    { name: 'south', axis: 'x', fixed: depth / 2, length: width },
    { name: 'north', axis: 'x', fixed: -depth / 2, length: width },
    { name: 'east', axis: 'z', fixed: width / 2, length: depth },
    { name: 'west', axis: 'z', fixed: -width / 2, length: depth },
  ];

  for (const side of sides) {
    const sideGaps = gaps
      .filter((gap) => gap.side === side.name)
      .sort((a, b) => a.center - b.center);
    const ranges = [];
    let cursor = -side.length / 2;
    for (const gap of sideGaps) {
      ranges.push([cursor, gap.center - gap.width / 2]);
      cursor = gap.center + gap.width / 2;
    }
    ranges.push([cursor, side.length / 2]);

    for (const [from, to] of ranges) {
      const segmentLength = to - from;
      if (segmentLength < 0.2) continue;
      const center = (from + to) / 2;
      const count = Math.max(1, Math.floor(segmentLength / POST_GAP));
      for (let i = 0; i <= count; i += 1) {
        const t = from + (i * segmentLength) / count;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, RAIL_HEIGHT, 0.07),
          woodPostMaterial
        );
        if (side.axis === 'x') post.position.set(t, RAIL_HEIGHT / 2, side.fixed);
        else post.position.set(side.fixed, RAIL_HEIGHT / 2, t);
        railing.add(post);
      }
      const rail = new THREE.Mesh(
        side.axis === 'x'
          ? new THREE.BoxGeometry(segmentLength, 0.08, 0.1)
          : new THREE.BoxGeometry(0.1, 0.08, segmentLength),
        woodDeckMaterial
      );
      if (side.axis === 'x') rail.position.set(center, RAIL_HEIGHT, side.fixed);
      else rail.position.set(side.fixed, RAIL_HEIGHT, center);
      railing.add(rail);
    }
  }
  return railing;
}

// 枠付きガラスパネル（壁開口にはめ込む）
function createGlassPanel(width, height) {
  const panel = new THREE.Group();
  const FRAME = 0.07;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width - FRAME, height - FRAME),
    glassMaterial
  );
  glass.position.y = height / 2;
  panel.add(glass);

  for (const [w, h, x, y] of [
    [width, FRAME, 0, FRAME / 2],
    [width, FRAME, 0, height - FRAME / 2],
    [FRAME, height, -width / 2 + FRAME / 2, height / 2],
    [FRAME, height, width / 2 - FRAME / 2, height / 2],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameMaterial);
    bar.position.set(x, y, 0);
    panel.add(bar);
  }
  return panel;
}

function createLounger() {
  const lounger = new THREE.Group();
  for (const sx of [-0.26, 0.26]) {
    for (const sz of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.25, 0.06),
        woodPostMaterial
      );
      leg.position.set(sx, 0.125, sz);
      lounger.add(leg);
    }
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 1.5), cushionMaterial);
  base.position.set(0, 0.3, 0.05);
  lounger.add(base);

  // 背もたれ：回転軸を座面との接合辺に移し、座面の端から
  // 斜め上に立ち上がる（座面と隙間なく結合）
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 0.65), cushionMaterial);
  back.geometry.translate(0, 0, -0.325); // 手前の辺がピボットになる
  back.position.set(0, 0.3, -0.7); // 座面の端・同じ高さに接合
  back.rotation.x = 0.6; // 端から起き上がる傾斜
  lounger.add(back);
  return lounger;
}

// 海へ降りる梯子
function createSeaLadder() {
  const ladder = new THREE.Group();
  for (const sx of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8),
      woodPostMaterial
    );
    rail.position.set(sx, -1.2, 0);
    ladder.add(rail);
  }
  for (let i = 0; i < 6; i += 1) {
    const step = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8),
      woodPostMaterial
    );
    step.rotation.z = Math.PI / 2;
    step.position.set(0, -0.2 - i * 0.38, 0);
    ladder.add(step);
  }
  return ladder;
}

// 隣のヴィラとの目隠し（縦スラット壁）
function createPrivacyWall(length, height) {
  const wall = new THREE.Group();
  const SLAT_PITCH = 0.18;
  const count = Math.floor(length / SLAT_PITCH);
  for (let i = 0; i < count; i += 1) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, height, SLAT_PITCH - 0.05),
      woodPostMaterial
    );
    slat.position.set(0, height / 2, -length / 2 + (i + 0.5) * SLAT_PITCH);
    wall.add(slat);
  }
  return wall;
}

// インフィニティプール（白い縁、外縁はデッキ端と面一）
function createPool(poolW, poolD) {
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
  pool.add(shade);

  // 奥層：薄い色で広く、わずかに外へ傾ける
  const backSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM, dropHeight),
    spillBackMaterial
  );
  backSheet.position.set(0, WATER_LEVEL - dropHeight / 2, -poolD / 2 - 0.02);
  backSheet.rotation.x = 0.04;
  pool.add(backSheet);

  // 手前層：はっきりした水筋（速いスクロール）
  const frontSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(poolW - RIM, dropHeight),
    spillFrontMaterial
  );
  frontSheet.position.set(0, WATER_LEVEL - dropHeight / 2 - 0.02, -poolD / 2 - 0.07);
  frontSheet.rotation.x = 0.07; // 下端ほど外へ膨らむ放物線の近似
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
  pool.add(foam);

  // --- 落下する水滴パーティクル ---
  let seed = 77;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const DROP_COUNT = 60;
  const positions = new Float32Array(DROP_COUNT * 3);
  const droplets = [];
  for (let i = 0; i < DROP_COUNT; i += 1) {
    droplets.push({
      x: (random() - 0.5) * (poolW - RIM) * 0.95,
      phase: random(),
      speed: 0.7 + random() * 0.6,
    });
  }
  const dropletGeometry = new THREE.BufferGeometry();
  dropletGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  );
  const points = new THREE.Points(dropletGeometry, dropletMaterial);
  points.frustumCulled = false;
  pool.add(points);

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
    attribute: dropletGeometry.attributes.position,
    droplets,
    rings,
    waterLevel: WATER_LEVEL,
    dropHeight,
    edgeZ: -poolD / 2,
  });

  return pool;
}

// ベッドのある簡単な内装
function createInterior() {
  const interior = new THREE.Group();

  const bedBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.4, 1.7),
    woodPostMaterial
  );
  bedBase.position.set(-1.6, 0.2, -1.0);
  interior.add(bedBase);
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.22, 1.6),
    cushionMaterial
  );
  mattress.position.set(-1.6, 0.51, -1.0);
  interior.add(mattress);
  for (const sz of [-1.35, -0.65]) {
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.35),
      cushionMaterial
    );
    pillow.position.set(-2.35, 0.68, sz);
    interior.add(pillow);
  }
  const headboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.1, 1.8),
    woodPostMaterial
  );
  headboard.position.set(-2.65, 0.55, -1.0);
  interior.add(headboard);

  return interior;
}

/**
 * 参照画像準拠の大型水上ヴィラ一棟。
 * ローカル +z: 入口（桟橋側）、-z: 外海側。
 * 上段ウッドデッキ＋下段ベージュデッキ、角にインフィニティプール、
 * 白壁に大きなガラス開口、うすい茶色の茅葺き屋根、海への梯子。
 */
function createVilla() {
  const villa = new THREE.Group();
  const frontZ = CABIN_D / 2; // キャビン前面(+z)
  const backZ = -CABIN_D / 2;
  const cabinBaseY = DECK_HEIGHT;

  // 杭（上段デッキ）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      villa.add(
        createStilt(sx * (DECK_W / 2 - 0.5), sz * (DECK_D / 2 - 0.5), DECK_HEIGHT)
      );
    }
  }
  villa.add(createStilt(-2.5, 0, DECK_HEIGHT));
  villa.add(createStilt(2.5, 0, DECK_HEIGHT));

  // 上段デッキ
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(DECK_W, 0.14, DECK_D),
    woodDeckMaterial
  );
  deck.position.y = DECK_HEIGHT - 0.07;
  villa.add(deck);

  // --- キャビン（白壁＋大開口ガラス） ---
  // 前面(+z): 中央にガラス引き戸（開口2.4m）
  const DOOR_OPENING = 2.4;
  const sideWallW = (CABIN_W - DOOR_OPENING) / 2;
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(sideWallW, CABIN_H, 0.12),
      wallMaterial
    );
    wall.position.set(
      sx * (DOOR_OPENING / 2 + sideWallW / 2),
      cabinBaseY + CABIN_H / 2,
      frontZ
    );
    villa.add(wall);
  }
  const frontLintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_OPENING, CABIN_H - 2.2, 0.12),
    wallMaterial
  );
  frontLintel.position.set(0, cabinBaseY + 2.2 + (CABIN_H - 2.2) / 2, frontZ);
  villa.add(frontLintel);
  // ガラス引き戸2枚（片方を開けて入口にする）
  const slidingClosed = createGlassPanel(1.2, 2.2);
  slidingClosed.position.set(-0.6, cabinBaseY, frontZ);
  villa.add(slidingClosed);
  const slidingOpen = createGlassPanel(1.2, 2.2);
  slidingOpen.position.set(-1.25, cabinBaseY, frontZ - 0.1); // 重ねて開いた状態
  villa.add(slidingOpen);

  // 背面(-z): 全面ガラス3枚（外海を一望）
  const seaPanelW = CABIN_W / 3;
  for (let i = 0; i < 3; i += 1) {
    const panel = createGlassPanel(seaPanelW, CABIN_H - 0.3);
    panel.position.set(-CABIN_W / 2 + seaPanelW * (i + 0.5), cabinBaseY, backZ);
    villa.add(panel);
  }
  const seaLintel = new THREE.Mesh(
    new THREE.BoxGeometry(CABIN_W, 0.3, 0.12),
    wallMaterial
  );
  seaLintel.position.set(0, cabinBaseY + CABIN_H - 0.15, backZ);
  villa.add(seaLintel);

  // 側面: 白壁＋窓ガラス
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, CABIN_H, CABIN_D),
      wallMaterial
    );
    wall.position.set(sx * (CABIN_W / 2), cabinBaseY + CABIN_H / 2, 0);
    villa.add(wall);
    const sideWindow = createGlassPanel(1.4, 1.1);
    sideWindow.rotation.y = Math.PI / 2;
    sideWindow.position.set(sx * (CABIN_W / 2 + 0.07), cabinBaseY + 1.0, 0.6);
    villa.add(sideWindow);
  }

  // コーナー柱と幅木（漆喰壁の面を引き締める白木トリム）
  for (const sx of [-1, 1]) {
    for (const sz of [backZ, frontZ]) {
      const cornerPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, CABIN_H, 0.16),
        frameMaterial
      );
      cornerPost.position.set(sx * (CABIN_W / 2), cabinBaseY + CABIN_H / 2, sz);
      villa.add(cornerPost);
    }
  }
  for (const [w, d, x, z] of [
    [CABIN_W + 0.1, 0.06, 0, frontZ + 0.05],
    [CABIN_W + 0.1, 0.06, 0, backZ - 0.05],
    [0.06, CABIN_D + 0.1, CABIN_W / 2 + 0.05, 0],
    [0.06, CABIN_D + 0.1, -CABIN_W / 2 - 0.05, 0],
  ]) {
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.18, d),
      frameMaterial
    );
    skirt.position.set(x, cabinBaseY + 0.09, z);
    villa.add(skirt);
  }

  // キャビン床と内装
  const cabinFloor = new THREE.Mesh(
    new THREE.BoxGeometry(CABIN_W - 0.1, 0.06, CABIN_D - 0.1),
    woodDeckMaterial
  );
  cabinFloor.position.set(0, DECK_HEIGHT + 0.04, 0);
  villa.add(cabinFloor);
  const interior = createInterior();
  interior.position.y = DECK_HEIGHT + 0.07;
  villa.add(interior);

  // 屋根：うすい茶色の茅葺き。基部を壁に0.15めり込ませて隙間とちらつきを防ぐ
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(5.2, 2.8, 4),
    thatchMaterial
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, cabinBaseY + CABIN_H + 1.4 - 0.15, 0);
  villa.add(roof);
  const roofCap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.6, 4), thatchMaterial);
  roofCap.rotation.y = Math.PI / 4;
  roofCap.position.set(0, cabinBaseY + CABIN_H + 2.75, 0);
  villa.add(roofCap);

  // --- 下段（プール）デッキ：外海側の右角（画像と同じ構成） ---
  const LOWER_W = 5;
  const LOWER_D = 4.5;
  const lowerCenterX = DECK_W / 2 - LOWER_W / 2; // 3
  const lowerCenterZ = -DECK_D / 2 - LOWER_D / 2; // -10.25→-6.25
  const lowerDeck = new THREE.Mesh(
    new THREE.BoxGeometry(LOWER_W, 0.14, LOWER_D),
    lowerDeckMaterial
  );
  lowerDeck.position.set(lowerCenterX, LOWER_DECK_TOP - 0.07, lowerCenterZ);
  villa.add(lowerDeck);
  for (const [sx, sz] of [
    [lowerCenterX - LOWER_W / 2 + 0.4, lowerCenterZ - LOWER_D / 2 + 0.4],
    [lowerCenterX + LOWER_W / 2 - 0.4, lowerCenterZ - LOWER_D / 2 + 0.4],
    [lowerCenterX - LOWER_W / 2 + 0.4, lowerCenterZ + LOWER_D / 2 - 0.4],
    [lowerCenterX + LOWER_W / 2 - 0.4, lowerCenterZ + LOWER_D / 2 - 0.4],
  ]) {
    villa.add(createStilt(sx, sz, LOWER_DECK_TOP));
  }

  // 上段→下段への階段
  const STEP_COUNT = 3;
  const stepRise = (DECK_HEIGHT - LOWER_DECK_TOP) / STEP_COUNT;
  for (let i = 0; i < STEP_COUNT; i += 1) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.1, 0.4),
      woodDeckMaterial
    );
    step.position.set(
      lowerCenterX,
      DECK_HEIGHT - stepRise * (i + 1) + 0.05,
      -DECK_D / 2 + 0.2 + i * 0.4
    );
    villa.add(step);
  }

  // インフィニティプール：下段デッキの外海側角、外縁をデッキ端に揃える
  const POOL_W = 3.2;
  const POOL_D = 2.6;
  const pool = createPool(POOL_W, POOL_D);
  pool.position.set(
    lowerCenterX - LOWER_W / 2 + POOL_W / 2, // 左寄せ
    LOWER_DECK_TOP,
    lowerCenterZ - LOWER_D / 2 + POOL_D / 2 // 外海側へ寄せて無限縁に
  );
  villa.add(pool);

  // 海への梯子（下段デッキの外海側）
  const ladder = createSeaLadder();
  ladder.position.set(
    lowerCenterX + LOWER_W / 2 - 0.6,
    LOWER_DECK_TOP,
    lowerCenterZ - LOWER_D / 2 - 0.05
  );
  villa.add(ladder);

  // サンラウンジャー（上段デッキ、入口動線を避ける）
  for (const sx of [3.6, 4.6]) {
    const lounger = createLounger();
    lounger.position.set(sx, DECK_HEIGHT, 1.8);
    lounger.rotation.y = Math.PI;
    villa.add(lounger);
  }

  // 目隠しスラット壁（隣のヴィラ側 = ±x 端）
  const privacyWall = createPrivacyWall(DECK_D * 0.6, 1.6);
  privacyWall.position.set(-DECK_W / 2 + 0.1, DECK_HEIGHT, -DECK_D * 0.18);
  villa.add(privacyWall);

  // 手すり：入口(+z中央)と階段(-z、下段への接続部)に開口
  const railing = createRailing(DECK_W, DECK_D, [
    { side: 'south', center: 0, width: ENTRANCE_GAP },
    { side: 'north', center: lowerCenterX, width: 1.6 },
  ]);
  railing.position.y = DECK_HEIGHT;
  villa.add(railing);

  enableShadows(villa);
  return villa;
}

// 桟橋の板張り通路（杭付き）。長さ方向は z。
function createWalkway(length, width) {
  const walkway = new THREE.Group();
  const PLANK_PITCH = 0.36;
  const plankCount = Math.floor(length / PLANK_PITCH);
  for (let i = 0; i < plankCount; i += 1) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, PLANK_PITCH - 0.05),
      woodDeckMaterial
    );
    plank.position.set(0, DECK_HEIGHT - 0.04, -length / 2 + (i + 0.5) * PLANK_PITCH);
    walkway.add(plank);
  }
  const POST_PITCH = 4;
  for (let z = -length / 2; z <= length / 2; z += POST_PITCH) {
    walkway.add(createStilt(-width / 2 + 0.15, z, DECK_HEIGHT));
    walkway.add(createStilt(width / 2 - 0.15, z, DECK_HEIGHT));
  }
  enableShadows(walkway);
  return walkway;
}

function createLampPost() {
  const lampPost = new THREE.Group();
  const POST_HEIGHT = 1.3;

  // コンクリートの角柱ボラード
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, POST_HEIGHT, 0.14),
    lampConcreteMaterial
  );
  post.position.y = POST_HEIGHT / 2;
  lampPost.add(post);
  const postCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.05, 0.18),
    lampConcreteMaterial
  );
  postCap.position.y = POST_HEIGHT + 0.025;
  lampPost.add(postCap);

  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffcc88,
      emissive: 0xffaa44,
      emissiveIntensity: 2.5,
      roughness: 0.3,
    })
  );
  lantern.position.y = POST_HEIGHT + 0.1;
  lampPost.add(lantern);

  const light = new THREE.PointLight(LAMP_COLOR, LAMP_INTENSITY, LAMP_RANGE, 2);
  light.position.y = POST_HEIGHT + 0.1;
  lampPost.add(light);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffd9a0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  halo.scale.setScalar(0.55);
  halo.position.y = POST_HEIGHT + 0.1;
  lampPost.add(halo);

  enableShadows(lampPost);
  lantern.castShadow = false;
  lampPost.userData.light = light;
  lampPost.userData.halo = halo;
  return lampPost;
}

// 白砂と椰子の島（桟橋の終点につながる）
function createIsland(scale) {
  const island = new THREE.Group();

  const sand = new THREE.Mesh(
    new THREE.SphereGeometry(20, 28, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2e8cb, roughness: 1 })
  );
  sand.scale.set(scale, 0.1 * scale, scale * 0.7);
  island.add(sand);

  const PALM_COUNT = 9;
  for (let i = 0; i < PALM_COUNT; i += 1) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 7, 6),
      woodPostMaterial
    );
    trunk.position.y = 3.5;
    trunk.rotation.z = (i % 3) * 0.1 - 0.1;
    palm.add(trunk);
    const FROND_COUNT = 6;
    for (let f = 0; f < FROND_COUNT; f += 1) {
      const frond = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 4, 4),
        new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 })
      );
      const angle = (f / FROND_COUNT) * Math.PI * 2;
      frond.position.set(Math.cos(angle) * 1.4, 7, Math.sin(angle) * 1.4);
      frond.rotation.set(Math.sin(angle) * 1.2, 0, -Math.cos(angle) * 1.2);
      palm.add(frond);
    }
    const angle = (i / PALM_COUNT) * Math.PI * 2 + (i % 2) * 0.4;
    palm.position.set(
      Math.cos(angle) * 9 * scale * 0.7,
      1.2,
      Math.sin(angle) * 7 * scale * 0.5
    );
    palm.scale.setScalar(scale * 0.55);
    island.add(palm);
  }
  enableShadows(island);
  return island;
}

/**
 * 参照画像準拠のモルディブ水上ヴィラリゾート。
 * 桟橋の片側(+x)に大型ヴィラ6棟が一列に並び、
 * 桟橋の先には白砂と椰子の島。
 */
export function createResort(scene) {
  const lampPosts = [];

  const jetty = createWalkway(JETTY_LENGTH, JETTY_WIDTH);
  jetty.position.z = JETTY_START_Z - JETTY_LENGTH / 2;
  scene.add(jetty);

  // 接続通路：桟橋の縁からヴィラデッキの縁まで隙間なく
  const branchStart = JETTY_WIDTH / 2;
  const branchEnd = VILLA_CENTER_X - DECK_D / 2; // ヴィラの+z面（回転後は±x）
  const branchLength = branchEnd - branchStart;

  for (let i = 0; i < VILLA_COUNT; i += 1) {
    const z = VILLA_FIRST_Z - i * VILLA_SPACING;

    const branch = createWalkway(branchLength, BRANCH_WIDTH);
    branch.rotation.y = Math.PI / 2;
    branch.position.set(branchStart + branchLength / 2, 0, z);
    scene.add(branch);

    // 入口(+z)が桟橋(-x方向)を向くよう -90° 回転
    const villa = createVilla();
    villa.rotation.y = -Math.PI / 2;
    villa.position.set(VILLA_CENTER_X, 0, z);
    scene.add(villa);
  }

  const lampCount = Math.floor(JETTY_LENGTH / LAMP_SPACING);
  for (let i = 0; i <= lampCount; i += 1) {
    const lampPost = createLampPost();
    const side = i % 2 === 0 ? 1 : -1;
    lampPost.position.set(
      side * (JETTY_WIDTH / 2 - 0.18),
      DECK_HEIGHT,
      JETTY_START_Z - i * LAMP_SPACING
    );
    scene.add(lampPost);
    lampPosts.push(lampPost);
  }

  // 桟橋の終点につながる島＋遠景の島
  const mainIsland = createIsland(2.2);
  mainIsland.position.set(-8, 0, JETTY_START_Z - JETTY_LENGTH - 28);
  scene.add(mainIsland);
  const farIsland = createIsland(1.4);
  farIsland.position.set(170, 0, -180);
  scene.add(farIsland);

  function update(time) {
    for (let i = 0; i < lampPosts.length; i += 1) {
      const flicker = 0.88 + 0.12 * Math.sin(time * 4.5 + i * 1.7);
      lampPosts[i].userData.light.intensity = LAMP_INTENSITY * flicker;
      lampPosts[i].userData.halo.material.opacity = flicker;
    }
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
      const array = emitter.attribute.array;
      for (let i = 0; i < emitter.droplets.length; i += 1) {
        const droplet = emitter.droplets[i];
        const progress = (time * droplet.speed + droplet.phase) % 1;
        array[i * 3] = droplet.x + Math.sin(time * 3 + i) * 0.01;
        array[i * 3 + 1] =
          emitter.waterLevel - progress * progress * emitter.dropHeight;
        array[i * 3 + 2] = emitter.edgeZ - 0.05 - progress * progress * 0.3;
      }
      emitter.attribute.needsUpdate = true;

      for (let k = 0; k < emitter.rings.length; k += 1) {
        const ring = emitter.rings[k];
        const cycle = (time * 0.55 + k / emitter.rings.length) % 1;
        const spread = 0.35 + cycle * 1.5;
        ring.scale.set(spread * 2.2, spread, 1);
        ring.material.opacity = 0.45 * (1 - cycle);
      }
    }
  }

  return { update, deckHeight: DECK_HEIGHT };
}
