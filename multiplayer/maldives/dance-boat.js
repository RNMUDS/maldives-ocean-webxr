// 「夜の踊り子」(アオサ王子) オマージュ — 参照映像準拠:
//   • グレー迷彩のシットオントップ・カヤック。後部にもう1人が座り、
//     オレンジシャフトのダブルブレードパドルで漕いで進む。
//   • 舳先に立つ男の子: 黒い縦長帽子・サングラス・黒Tシャツ(胸に赤)・
//     黒短パン・裸足。
//   • ダンスは3フェーズのループ:
//       A) 膝バウンス＋肘90°で両手を前にぷらぷら（手首が主役）
//       B) 両腕を真横に大きく広げてスウェイ
//       C) 片腕を前方へ伸ばして指差し（上体をひねる）
// 時刻ベースの決定的アニメーション（全プレイヤーがほぼ同じ光景を見る）。
import * as THREE from 'three';

const PATH_CENTER = new THREE.Vector3(-32, 0, -48);
const PATH_RADIUS = 26;
const BOAT_SPEED = 0.04;
const BEAT_HZ = 2.2;            // 約132BPM
const DANCE_PERIOD = 10.9;      // フェーズ一巡の長さ(s) ≒ 24拍

// ── 迷彩テクスチャ（グレー系ブロッチ） ──
function createCamoTexture() {
  const SIZE = 256;
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const x = cv.getContext('2d');
  x.fillStyle = '#6a7076';
  x.fillRect(0, 0, SIZE, SIZE);
  let seed = 31;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const COLORS = ['#2b2f33', '#8d949a', '#1c1f22', '#71787e'];
  for (let i = 0; i < 90; i += 1) {
    x.fillStyle = COLORS[i % COLORS.length];
    x.beginPath();
    const bx = random() * SIZE, by = random() * SIZE;
    x.ellipse(bx, by, 10 + random() * 26, 6 + random() * 16, random() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── シットオントップ・カヤック ──
function createKayak() {
  const kayak = new THREE.Group();
  const camo = new THREE.MeshStandardMaterial({
    map: createCamoTexture(),
    roughness: 0.7,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.85 });

  // 低く平たい船体（タンデム、全長約4.5m）
  // 参照画像: 側面下部は白っぽいマーブル、デッキ側は黒グレー迷彩
  const lightHull = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.45 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 4.8), lightHull);
  hull.position.y = 0.09;
  kayak.add(hull);
  const deckSlab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 4.8), camo);
  deckSlab.position.y = 0.22;
  kayak.add(deckSlab);
  // 先細りの舳先・船尾（潰した四角錐）
  for (const [z, len] of [[2.4, 1.2], [-2.4, 0.8]]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.6, len, 4), camo);
    tip.rotation.x = (z > 0 ? -1 : 1) * Math.PI / 2;
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(0.71, 1, 0.31);
    tip.position.set(0, 0.13, z + (z > 0 ? len / 2 : -len / 2));
    kayak.add(tip);
  }
  // 甲板の縁の盛り上がり
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 4.7), camo);
  rim.position.y = 0.28;
  kayak.add(rim);
  // 座席のくぼみ（2席、濃色のインセット）と背もたれ
  for (const z of [-1.7, -0.5]) {
    const well = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.72), dark);
    well.position.set(0, 0.285, z);
    kayak.add(well);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.07), dark);
    backrest.position.set(0, 0.45, z - 0.4);
    kayak.add(backrest);
  }

  // 前方デッキの黒い丸ハッチ（参照画像のアクセント）
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), dark);
  hatch.position.set(0, 0.30, 1.45);
  kayak.add(hatch);
  // 舳先の黒いハンドル
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.3), dark);
  handle.position.set(0, 0.24, 2.7);
  kayak.add(handle);
  // 船体側面の「STREAM JOURNEY」ロゴ
  const logoCv = document.createElement('canvas');
  logoCv.width = 512; logoCv.height = 64;
  const lx = logoCv.getContext('2d');
  lx.font = 'italic bold 44px "Helvetica Neue", sans-serif';
  lx.fillStyle = '#16181b';
  lx.textBaseline = 'middle';
  lx.fillText('⟁ STREAM JOURNEY', 16, 32);
  const logoTex = new THREE.CanvasTexture(logoCv);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  for (const sx of [-1, 1]) {
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.16),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true })
    );
    logo.position.set(sx * 0.435, 0.09, 0.2);
    logo.rotation.y = sx * Math.PI / 2;
    kayak.add(logo);
  }

  // 少年の背後に転がる黒い長靴（参照画像の小ネタ）
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.4 });
  for (const [bx, rot] of [[-0.12, 0.4], [0.14, -0.9]]) {
    const boot = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10), bootMat);
    shaft.position.y = 0.15;
    boot.add(shaft);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), bootMat);
    toe.position.set(0, 0.045, 0.1);
    boot.add(toe);
    boot.position.set(bx, 0.27, 0.6);
    boot.rotation.set(Math.PI / 2.2, rot, 0); // ほぼ横倒し
    kayak.add(boot);
  }

  kayak.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return kayak;
}

// ── ダブルブレードパドル（オレンジシャフト・黒ブレード） ──
function createPaddle() {
  const paddle = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 2.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8762a, roughness: 0.5 })
  );
  shaft.rotation.z = Math.PI / 2;
  paddle.add(shaft);
  for (const sx of [-1, 1]) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.015, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 })
    );
    blade.scale.y = 1;
    blade.position.set(sx * 1.12, 0, 0);
    blade.rotation.x = sx * 0.5; // ブレードのフェザー角
    paddle.add(blade);
  }
  return paddle;
}

// ── 座って必死に漕ぐ大人 ──
function createPaddler({ hairColor = 0xc9a96a, topColor = 0x2c3438 } = {}) {
  const paddler = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.26), top);
  torso.position.y = 0.55;
  paddler.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.position.y = 0.95;
  paddler.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 })
  );
  hair.position.y = 0.97;
  paddler.add(hair);
  // 伸ばした脚（座位）
  for (const sx of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.7), top);
    leg.position.set(sx, 0.2, 0.42);
    paddler.add(leg);
  }
  // 腕（パドルを保持 — パドルと一緒に揺らすので簡略な前出し）
  const arms = new THREE.Group();
  for (const sx of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), skin);
    arm.position.set(sx, 0.62, 0.22);
    arms.add(arm);
  }
  paddler.add(arms);

  const paddle = createPaddle();
  paddle.position.set(0, 0.72, 0.42);
  paddler.add(paddle);

  paddler.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return { paddler, paddle };
}

// ── 踊る男の子（参照映像の衣装・関節は肩/肘/手首/股/膝） ──
function createBoy() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb5825c, roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const blackSoft = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 });

  const hips = new THREE.Group();
  hips.position.y = 0.6;
  root.add(hips);

  // 脚（裸足）
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.1, 0, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.15), blackSoft); // 短パンの裾
    thigh.position.y = -0.17;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.32;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.11), skin); // 素足のすね
    shin.position.y = -0.15;
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), skin); // 裸足
    foot.position.set(0, -0.31, 0.05);
    knee.add(foot);
    hips.add(hip);
    legs.push({ hip, knee });
  }

  // 上体（オーバーサイズの黒Tシャツ）
  const torso = new THREE.Group();
  hips.add(torso);
  const tee = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.28), black);
  tee.position.y = 0.27;
  torso.add(tee);
  // 胸の赤いプリント
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xd23a3a })
  );
  print.position.set(0, 0.33, 0.131);
  torso.add(print);

  // 頭＋サングラス＋黒い縦長帽子（少し後ろに傾ける）
  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.add(face);
  const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04), black);
  glasses.position.set(0, 0.02, 0.115);
  head.add(glasses);
  // サメの背びれ / 折り紙兜風: 先端が斜め後上方に尖る黒い布帽子
  const finShape = new THREE.Shape();
  finShape.moveTo(0.11, 0);
  finShape.quadraticCurveTo(0.10, 0.28, -0.02, 0.5);   // 前縁: ほぼ垂直に立ち上がり
  finShape.quadraticCurveTo(-0.06, 0.36, -0.13, 0.16); // 後縁: 尖端から急に落ちる
  finShape.lineTo(-0.12, 0);
  finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.17,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  finGeometry.translate(0, 0, -0.085);
  const hat = new THREE.Mesh(finGeometry, black);
  hat.rotation.y = Math.PI / 2; // フィンの面を進行方向に
  hat.position.set(0, 0.1, -0.01);
  head.add(hat);

  // 腕（肩→肘→手首の3関節、手のぷらぷらが主役）
  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.27, 0.46, 0);
    torso.add(shoulder);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.27, 0.14), black);
    sleeve.position.y = -0.11;
    shoulder.add(sleeve);
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    shoulder.add(elbow);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.09), skin);
    forearm.position.y = -0.13;
    elbow.add(forearm);
    const wrist = new THREE.Group();
    wrist.position.y = -0.27;
    elbow.add(wrist);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.14, 0.05), skin);
    hand.position.y = -0.06;
    wrist.add(hand);
    arms.push({ shoulder, elbow, wrist, side: sx });
  }

  root.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  return { root, hips, torso, head, arms, legs };
}

// フェーズ窓関数: 区間 [a,b] で1、端 w で滑らかに0へ
function phaseWindow(p, a, b, w = 0.05) {
  const up = THREE.MathUtils.smoothstep(p, a - w, a + w);
  const down = 1 - THREE.MathUtils.smoothstep(p, b - w, b + w);
  return Math.min(up, down);
}

/**
 * カヤック＋踊る男の子＋漕ぎ手を生成する。update(t) で駆動。
 */
export function createDanceBoat(scene) {
  const kayak = createKayak();
  scene.add(kayak);

  const boy = createBoy();
  boy.root.scale.setScalar(0.75);       // 小さな少年
  boy.root.position.set(0, 0.31, 2.0);  // 舳先のデッキ
  kayak.add(boy.root);

  // 男の子の後ろで必死にカヌーを漕ぐ大人たち（2人）
  const paddlers = [
    { rig: createPaddler({ hairColor: 0x2a2018, topColor: 0x37424a }), z: -0.5, phase: 0 },
    { rig: createPaddler({ hairColor: 0xc9a96a, topColor: 0x2c3438 }), z: -1.7, phase: Math.PI }, // 逆位相で漕ぐ
  ];
  for (const entry of paddlers) {
    entry.rig.paddler.scale.setScalar(1.25); // 大人の体格
    entry.rig.paddler.position.set(0, 0.28, entry.z);
    kayak.add(entry.rig.paddler);
  }

  function update(t) {
    // ── カヤックの周回と波の揺れ ──
    const angle = t * BOAT_SPEED;
    kayak.position.set(
      PATH_CENTER.x + Math.cos(angle) * PATH_RADIUS,
      0.02 + Math.sin(t * 1.05) * 0.05,
      PATH_CENTER.z + Math.sin(angle) * PATH_RADIUS
    );
    kayak.rotation.y = -angle;
    kayak.rotation.x = Math.sin(t * 0.9) * 0.02;
    kayak.rotation.z = Math.cos(t * 0.75) * 0.03 + Math.sin(t * 1.6) * 0.015; // 漕ぎでも揺れる

    // ── 大人たち: 必死の高速パドルストローク（深い前傾・逆位相） ──
    const STROKE_HZ = 3.4;
    for (const entry of paddlers) {
      const stroke = t * STROKE_HZ + entry.phase;
      const { paddler, paddle } = entry.rig;
      paddle.rotation.z = Math.sin(stroke) * 0.45;         // 左右交互に水へ
      paddle.rotation.y = Math.cos(stroke) * 0.4;          // 強い掻き
      paddler.rotation.x = 0.18 + Math.cos(stroke) * 0.22; // 前傾して体ごと漕ぐ
      paddler.rotation.z = Math.sin(stroke) * 0.12;
    }
    // ストロークに合わせて船体がわずかにサージする
    kayak.rotation.x += Math.cos(t * STROKE_HZ) * 0.012;

    // ── 男の子のダンス: 3フェーズ・ループ ──
    const p = (t % DANCE_PERIOD) / DANCE_PERIOD;
    const beat = t * BEAT_HZ * Math.PI;
    // A: 手ぷらぷらバウンス（2回入る）/ B: 両腕を真横へ / C: 指差し
    const wBounce = Math.max(phaseWindow(p, 0.0, 0.34), phaseWindow(p, 0.72, 1.0, 0.03));
    const wSpread = phaseWindow(p, 0.34, 0.55);
    const wPoint = phaseWindow(p, 0.55, 0.72);

    for (const arm of boy.arms) {
      const s = arm.side; // 左:-1 右:+1
      // A) 肘90°で前へ、手首をぷらぷら振る
      const aSh = { x: -0.25, z: s * 0.30 };
      const aEl = -1.55 + Math.sin(beat * 2 + s) * 0.12;
      const aWr = Math.sin(beat * 2 + s * 0.8) * 0.85;
      // B) 両腕を真横に大きく広げる（指先まで一直線）
      const bSh = { x: 0, z: s * 1.5 };
      const bEl = -0.06;
      const bWr = Math.sin(beat) * 0.18;
      // C) 右腕だけ前方へ伸ばして指差し、左腕は下ろす
      const isPointArm = s > 0;
      const cSh = isPointArm ? { x: -1.5, z: 0.15 } : { x: 0.1, z: s * 0.2 };
      const cEl = isPointArm ? -0.04 : -0.25;
      const cWr = 0;

      arm.shoulder.rotation.x = aSh.x * wBounce + bSh.x * wSpread + cSh.x * wPoint;
      arm.shoulder.rotation.z = aSh.z * wBounce + bSh.z * wSpread + cSh.z * wPoint;
      arm.elbow.rotation.x = aEl * wBounce + bEl * wSpread + cEl * wPoint;
      arm.wrist.rotation.x = aWr * wBounce + bWr * wSpread + cWr * wPoint;
    }

    // 膝のバウンス（ダンス全体を通して、Aで最も深く）
    const bounceDepth = 0.05 + 0.06 * wBounce;
    const bounce = Math.abs(Math.sin(beat)) * bounceDepth;
    boy.root.position.y = 0.31 - bounce * 0.75;
    for (const leg of boy.legs) {
      leg.hip.rotation.x = bounce * 2.4;     // 股関節を曲げ
      leg.knee.rotation.x = -bounce * 4.2;   // 膝で吸収（しゃがみ込み）
    }

    // 上体: Aで軽く前傾＋横ノリ、Bでスウェイ、Cで指差し方向へひねる
    boy.torso.rotation.x = 0.12 * wBounce;
    boy.torso.rotation.z = Math.sin(beat) * (0.06 * wBounce + 0.12 * wSpread);
    boy.torso.rotation.y = Math.sin(beat * 0.5) * 0.1 * wSpread - 0.4 * wPoint;
    boy.head.rotation.x = Math.sin(beat + 0.6) * 0.08;
    boy.head.rotation.z = Math.sin(beat) * 0.06;
  }

  return { boat: kayak, update };
}
