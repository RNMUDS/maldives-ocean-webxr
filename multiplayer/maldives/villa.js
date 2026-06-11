// villa.js — 水上ヴィラ一棟（デッキ・キャビン・ガラス・プール・落水・内装）。
// （resort.js 分割: 2026-06-12）
import * as THREE from 'three';
import { loadTexture, loadGeneratedPBRSet } from './textures.js';
import {
  DECK_HEIGHT, LOWER_DECK_TOP, woodDeckMaterial, woodPostMaterial,
  mergeStatic, boxGeo, stiltGeo, enableShadows,
} from './resort-shared.js';
import { createPool } from './pool.js';

// ヴィラ寸法（ローカル座標：+z=桟橋側の入口、-z=外海側）
// DECK_W/DECK_D/LOWER_DECK_TOP は足場判定(LAYOUT)用に公開
export const DECK_W = 11; // x方向
export const DECK_D = 8; // z方向
const CABIN_W = 6;
const CABIN_D = 4.6;
const CABIN_H = 3.0;
const ENTRANCE_GAP = 1.8;

// 壁：縦張りホワイトウッドの生成PBRテクスチャ
// （板ごとの塗装トーン差・縦木目・目地のV溝入り）
const wallMaterial = new THREE.MeshStandardMaterial({
  ...loadGeneratedPBRSet('whitewood', { repeat: [5, 1] }),
  normalScale: new THREE.Vector2(1.0, 1.0),
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
const cushionMaterial = new THREE.MeshStandardMaterial({
  color: 0xded8ca,
  roughness: 0.9,
  envMapIntensity: 0.4,
});

/**
 * 手すり。gaps = [{side, center, width}] で任意の辺に開口を空ける。
 * side: 'north'(-z) | 'south'(+z) | 'east'(+x) | 'west'(-x)
 */
function createRailing(width, depth, gaps = []) {
  const railing = new THREE.Group();
  const RAIL_HEIGHT = 0.95;
  const POST_GAP = 1.2;
  const postGeos = [];
  const railGeos = [];

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
        postGeos.push(
          side.axis === 'x'
            ? boxGeo(0.07, RAIL_HEIGHT, 0.07, t, RAIL_HEIGHT / 2, side.fixed)
            : boxGeo(0.07, RAIL_HEIGHT, 0.07, side.fixed, RAIL_HEIGHT / 2, t)
        );
      }
      railGeos.push(
        side.axis === 'x'
          ? boxGeo(segmentLength, 0.08, 0.1, center, RAIL_HEIGHT, side.fixed)
          : boxGeo(0.1, 0.08, segmentLength, side.fixed, RAIL_HEIGHT, center)
      );
    }
  }
  // 支柱・レールをそれぞれ1メッシュに結合（柵1枚=2ドローコール）
  railing.add(mergeStatic(postGeos, woodPostMaterial));
  railing.add(mergeStatic(railGeos, woodDeckMaterial));
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
  glass.userData.noShadow = true; // 透明ガラスは影を落とさない
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
  const slatGeos = [];
  for (let i = 0; i < count; i += 1) {
    slatGeos.push(boxGeo(
      0.1, height, SLAT_PITCH - 0.05,
      0, height / 2, -length / 2 + (i + 0.5) * SLAT_PITCH
    ));
  }
  wall.add(mergeStatic(slatGeos, woodPostMaterial));
  return wall;
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
export function createVilla({ glassFloor = false } = {}) {
  const villa = new THREE.Group();
  const frontZ = CABIN_D / 2; // キャビン前面(+z)
  const backZ = -CABIN_D / 2;
  const cabinBaseY = DECK_HEIGHT;

  // 杭（上段デッキ、6本を1メッシュに結合）
  const villaStiltGeos = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      villaStiltGeos.push(
        stiltGeo(sx * (DECK_W / 2 - 0.5), sz * (DECK_D / 2 - 0.5), DECK_HEIGHT)
      );
    }
  }
  villaStiltGeos.push(stiltGeo(-2.5, 0, DECK_HEIGHT));
  villaStiltGeos.push(stiltGeo(2.5, 0, DECK_HEIGHT));
  villa.add(mergeStatic(villaStiltGeos, woodPostMaterial));

  // 上段デッキ（ガラス床ヴィラはキャビン中央 1.8x1.4 の開口を開けて4分割）
  const HOLE_W = 1.8, HOLE_D = 1.4;
  if (glassFloor) {
    const deckParts = [
      [DECK_W / 2 - HOLE_W / 2, DECK_D, -(HOLE_W / 2 + (DECK_W / 2 - HOLE_W / 2) / 2), 0],
      [DECK_W / 2 - HOLE_W / 2, DECK_D, HOLE_W / 2 + (DECK_W / 2 - HOLE_W / 2) / 2, 0],
      [HOLE_W, DECK_D / 2 - HOLE_D / 2, 0, -(HOLE_D / 2 + (DECK_D / 2 - HOLE_D / 2) / 2)],
      [HOLE_W, DECK_D / 2 - HOLE_D / 2, 0, HOLE_D / 2 + (DECK_D / 2 - HOLE_D / 2) / 2],
    ];
    for (const [w, d, x, z] of deckParts) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), woodDeckMaterial);
      part.position.set(x, DECK_HEIGHT - 0.07, z);
      villa.add(part);
    }
  } else {
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(DECK_W, 0.14, DECK_D),
      woodDeckMaterial
    );
    deck.position.y = DECK_HEIGHT - 0.07;
    villa.add(deck);
  }

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

  // キャビン床と内装（ガラス床ヴィラは中央に海が見えるガラス窓）
  if (glassFloor) {
    const fw = CABIN_W - 0.1, fd = CABIN_D - 0.1;
    const floorParts = [
      [fw / 2 - HOLE_W / 2, fd, -(HOLE_W / 2 + (fw / 2 - HOLE_W / 2) / 2), 0],
      [fw / 2 - HOLE_W / 2, fd, HOLE_W / 2 + (fw / 2 - HOLE_W / 2) / 2, 0],
      [HOLE_W, fd / 2 - HOLE_D / 2, 0, -(HOLE_D / 2 + (fd / 2 - HOLE_D / 2) / 2)],
      [HOLE_W, fd / 2 - HOLE_D / 2, 0, HOLE_D / 2 + (fd / 2 - HOLE_D / 2) / 2],
    ];
    for (const [w, d, x, z] of floorParts) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), woodDeckMaterial);
      part.position.set(x, DECK_HEIGHT + 0.04, z);
      villa.add(part);
    }
    // 床のガラス（下の海・魚が見える）
    const glassPane = new THREE.Mesh(
      new THREE.PlaneGeometry(HOLE_W - 0.06, HOLE_D - 0.06),
      glassMaterial
    );
    glassPane.rotation.x = -Math.PI / 2;
    glassPane.position.set(0, DECK_HEIGHT + 0.05, 0);
    villa.add(glassPane);
    // ガラスの縁の枠
    for (const [w, d, x, z] of [
      [HOLE_W + 0.16, 0.08, 0, HOLE_D / 2 + 0.04],
      [HOLE_W + 0.16, 0.08, 0, -(HOLE_D / 2 + 0.04)],
      [0.08, HOLE_D, HOLE_W / 2 + 0.04, 0],
      [0.08, HOLE_D, -(HOLE_W / 2 + 0.04), 0],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), woodPostMaterial);
      rail.position.set(x, DECK_HEIGHT + 0.075, z);
      villa.add(rail);
    }
  } else {
    const cabinFloor = new THREE.Mesh(
      new THREE.BoxGeometry(CABIN_W - 0.1, 0.06, CABIN_D - 0.1),
      woodDeckMaterial
    );
    cabinFloor.position.set(0, DECK_HEIGHT + 0.04, 0);
    villa.add(cabinFloor);
  }
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
  const lowerStiltGeos = [];
  for (const [sx, sz] of [
    [lowerCenterX - LOWER_W / 2 + 0.4, lowerCenterZ - LOWER_D / 2 + 0.4],
    [lowerCenterX + LOWER_W / 2 - 0.4, lowerCenterZ - LOWER_D / 2 + 0.4],
    [lowerCenterX - LOWER_W / 2 + 0.4, lowerCenterZ + LOWER_D / 2 - 0.4],
    [lowerCenterX + LOWER_W / 2 - 0.4, lowerCenterZ + LOWER_D / 2 - 0.4],
  ]) {
    lowerStiltGeos.push(stiltGeo(sx, sz, LOWER_DECK_TOP));
  }
  villa.add(mergeStatic(lowerStiltGeos, woodPostMaterial));

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
