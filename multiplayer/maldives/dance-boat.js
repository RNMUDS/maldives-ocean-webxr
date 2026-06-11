// 「夜の踊り子」(アオサ王子) オマージュ:
//   • 船は Sketchfab の "Wooden Boat" (o0ozexo0o, CC-BY) を使用。
//     https://sketchfab.com/3d-models/wooden-boat-55118b23a5494e4b81eed831b9f8c871
//   • 舳先に立つ小柄な少年: フィン型の黒帽子・サングラス・
//     赤プリント入り黒T・黒短パン・裸足。
//   • ダンスは3フェーズのループ:
//       A) 膝バウンス＋肘90°で両手を前にぷらぷら（手首が主役）
//       B) 両腕を真横に大きく広げてスウェイ
//       C) 片腕を前方へ伸ばして指差し（上体をひねる）
//   • 後ろでは大人2人が木のシングルブレードパドルで必死に漕ぐ。
// 時刻ベースの決定的アニメーション（全プレイヤーがほぼ同じ光景を見る）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PATH_CENTER = new THREE.Vector3(-50, 0, -52);
const PATH_RADIUS = 28;
const BOAT_SPEED = 0.04;
const BEAT_HZ = 2.2;            // 約132BPM
const DANCE_PERIOD = 10.9;      // フェーズ一巡の長さ(s) ≒ 24拍

const SEAT_Y = 0.34; // 乗員の暫定座面高（モデル読込後に実寸へ更新）

// ── 木のシングルブレードパドル（カヌー用） ──
function createPaddle() {
  const paddle = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xd2a85c, roughness: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 8), wood);
  shaft.position.y = -0.18;
  paddle.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.46, 0.03), wood);
  blade.position.y = -0.98;
  paddle.add(blade);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.06), wood); // Tグリップ
  grip.position.y = 0.46;
  paddle.add(grip);
  return paddle;
}

// ── 座って必死に漕ぐ大人（片舷ストローク） ──
function createPaddler({ hairColor = 0xc9a96a, topColor = 0x2c3438, side = 1 } = {}) {
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
  // 腕（漕ぐ側へ伸ばす）
  for (const sx of [-0.2, 0.24]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), skin);
    arm.position.set(side * 0.22 + sx * 0.3, 0.6, 0.18);
    arm.rotation.y = side * -0.3;
    paddler.add(arm);
  }

  // パドルは漕ぐ側の舷へ（外へ傾けて構える）
  const paddle = createPaddle();
  paddle.position.set(side * 0.4, 0.62, 0.25);
  paddle.rotation.z = side * 0.42;
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
  print.position.set(0, 0.33, 0.141);
  torso.add(print);

  // 頭＋サングラス
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
 * カヌー＋踊る少年＋漕ぐ大人2人を生成する。update(t) で駆動。
 */
export function createDanceBoat(scene) {
  const canoe = new THREE.Group();
  scene.add(canoe);

  // Sketchfabの木製ボートを読み込み、実寸を測って正規化する
  // （全長4.6m・長手をz軸・中心を原点・12cm沈めて喫水を作る）
  let boyBaseY = SEAT_Y + 0.02; // モデル読込後に実際の縁の高さへ更新される
  new GLTFLoader().load(
    './assets/wooden-boat.glb',
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const length = Math.max(size.x, size.z);
      const scale = 4.6 / length;
      model.scale.setScalar(scale);
      if (size.x > size.z) model.rotation.y = Math.PI / 2; // 長手をz軸へ
      const box2 = new THREE.Box3().setFromObject(model);
      const center = box2.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box2.min.y + 0.14; // 喫水分沈める
      model.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      canoe.add(model);

      // 縁の高さに合わせて乗員を再配置
      const hullTop = box2.max.y - box2.min.y - 0.14;
      boyBaseY = hullTop + 0.01;
      boy.root.position.y = boyBaseY;
      for (const entry of paddlers) {
        entry.rig.paddler.position.y = hullTop - 0.18;
      }
    },
    undefined,
    (e) => console.warn('[maldives] boat model load failed:', e)
  );

  const boy = createBoy();
  boy.root.scale.setScalar(0.75);              // 小さな少年
  boy.root.position.set(0, SEAT_Y + 0.02, 1.45); // 舳先寄り（読込後に高さ調整）
  canoe.add(boy.root);

  // 少年の後ろで必死にカヌーを漕ぐ大人たち（2人、互いに逆舷）
  const paddlers = [
    { rig: createPaddler({ hairColor: 0x2a2018, topColor: 0x37424a, side: 1 }), z: 0.05, phase: 0, side: 1 },
    { rig: createPaddler({ hairColor: 0xc9a96a, topColor: 0x2c3438, side: -1 }), z: -1.3, phase: Math.PI * 0.7, side: -1 },
  ];
  for (const entry of paddlers) {
    entry.rig.paddler.scale.setScalar(1.25); // 大人の体格
    entry.rig.paddler.position.set(0, SEAT_Y - 0.02, entry.z);
    canoe.add(entry.rig.paddler);
  }

  function update(t) {
    // ── カヌーの周回と波の揺れ ──
    const angle = t * BOAT_SPEED;
    canoe.position.set(
      PATH_CENTER.x + Math.cos(angle) * PATH_RADIUS,
      0.02 + Math.sin(t * 1.05) * 0.05,
      PATH_CENTER.z + Math.sin(angle) * PATH_RADIUS
    );
    canoe.rotation.y = -angle;
    canoe.rotation.x = Math.sin(t * 0.9) * 0.02;
    canoe.rotation.z = Math.cos(t * 0.75) * 0.03 + Math.sin(t * 1.3) * 0.015;

    // ── 大人たち: 必死のカヌーストローク（前後に大きく掻く・体ごと前傾） ──
    const STROKE_HZ = 2.8;
    for (const entry of paddlers) {
      const stroke = t * STROKE_HZ + entry.phase;
      const { paddler, paddle } = entry.rig;
      paddle.rotation.x = -0.35 + Math.sin(stroke) * 0.6;   // 前→後ろへ掻く
      paddle.rotation.z = entry.side * (0.42 + Math.cos(stroke) * 0.1);
      paddler.rotation.x = 0.16 + Math.cos(stroke) * 0.2;   // 体ごと漕ぐ前傾
      paddler.rotation.z = entry.side * 0.05 + Math.sin(stroke) * 0.06;
    }
    // ストロークに合わせて船体がわずかにサージする
    canoe.rotation.x += Math.cos(t * STROKE_HZ) * 0.01;

    // ── 少年のダンス: 3フェーズ・ループ ──
    const p = (t % DANCE_PERIOD) / DANCE_PERIOD;
    const beat = t * BEAT_HZ * Math.PI;
    const wBounce = Math.max(phaseWindow(p, 0.0, 0.34), phaseWindow(p, 0.72, 1.0, 0.03));
    const wSpread = phaseWindow(p, 0.34, 0.55);
    const wPoint = phaseWindow(p, 0.55, 0.72);

    for (const arm of boy.arms) {
      const s = arm.side; // 左:-1 右:+1
      // A) 肘90°で前へ、手首をぷらぷら振る
      const aSh = { x: -0.25, z: s * 0.30 };
      const aEl = -1.55 + Math.sin(beat * 2 + s) * 0.12;
      const aWr = Math.sin(beat * 2 + s * 0.8) * 0.85;
      // B) 両腕を真横に大きく広げる
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

    // 膝のバウンス（Aで最も深く）
    const bounceDepth = 0.05 + 0.06 * wBounce;
    const bounce = Math.abs(Math.sin(beat)) * bounceDepth;
    boy.root.position.y = boyBaseY - bounce * 0.75;
    for (const leg of boy.legs) {
      leg.hip.rotation.x = bounce * 2.4;
      leg.knee.rotation.x = -bounce * 4.2;
    }

    // 上体: Aで軽く前傾＋横ノリ、Bでスウェイ、Cで指差し方向へひねる
    boy.torso.rotation.x = 0.12 * wBounce;
    boy.torso.rotation.z = Math.sin(beat) * (0.06 * wBounce + 0.12 * wSpread);
    boy.torso.rotation.y = Math.sin(beat * 0.5) * 0.1 * wSpread - 0.4 * wPoint;
    boy.head.rotation.x = Math.sin(beat + 0.6) * 0.08;
    boy.head.rotation.z = Math.sin(beat) * 0.06;
  }

  return { boat: canoe, update };
}
