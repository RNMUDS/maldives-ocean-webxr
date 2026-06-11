// 「夜の踊り子」オマージュ：ラグーンを周回する小さな漁船の舳先で、
// 男の子が腕を振り上げるダンスを踊り続けるアンビエント演出。
// 時刻ベースの決定的アニメーションなので全プレイヤーがほぼ同じ光景を見る。
import * as THREE from 'three';

const BOAT_PATH_CENTER = new THREE.Vector3(-32, 0, -48);
const BOAT_PATH_RADIUS = 26;
const BOAT_SPEED = 0.045;      // 周回の角速度 (rad/s)
const BEAT_HZ = 2.2;           // ダンスのテンポ（約132BPM）

// ── 小型漁船（白い和船風：船体・デッキ・小さな操舵室・旗竿） ──
function createFishingBoat() {
  const boat = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.6 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2a6e8c, roughness: 0.7 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.9 });

  // 船体（先細りの舳先はスケールで表現）
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 6.4), hullMaterial);
  hull.position.y = 0.25;
  boat.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.0, 1.6, 4), hullMaterial);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1.4, 1, 0.63); // 船体幅・高さに合わせて断面を潰す
  bow.position.set(0, 0.25, 4.0);
  boat.add(bow);
  // 舷側のライン
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.14, 6.4), trimMaterial);
  stripe.position.y = 0.62;
  boat.add(stripe);

  // デッキ
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 6.2), deckMaterial);
  deck.position.y = 0.72;
  boat.add(deck);

  // 操舵室（船尾側）
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.6), hullMaterial);
  cabin.position.set(0, 1.3, -1.6);
  boat.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.8), trimMaterial);
  cabinRoof.position.set(0, 1.9, -1.6);
  boat.add(cabinRoof);
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.5, 0.05),
    new THREE.MeshPhysicalMaterial({ color: 0x1a3038, roughness: 0.1, envMapIntensity: 1.2 })
  );
  windshield.position.set(0, 1.45, -0.82);
  boat.add(windshield);

  // 旗竿と大漁旗風の旗
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), trimMaterial);
  pole.position.set(0, 2.9, -2.3);
  boat.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xd64545, roughness: 0.8, side: THREE.DoubleSide })
  );
  flag.position.set(0.48, 3.6, -2.3);
  boat.add(flag);

  boat.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return { boat, flag };
}

// ── 踊る男の子（Tシャツ＋短パンのローポリ人形、肩・腰・脚をピボット） ──
function createDancingBoy() {
  const boy = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3bb4e5, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: 0.9 });

  // 腰から上をまとめて揺らすためのピボット
  const hips = new THREE.Group();
  hips.position.y = 0.62;
  boy.add(hips);

  // 脚（左右、股関節ピボット）
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.15), pants);
    thigh.position.y = -0.3;
    leg.add(thigh);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24), pants);
    shoe.position.set(0, -0.62, 0.04);
    leg.add(shoe);
    leg.position.set(sx * 0.1, 0, 0);
    hips.add(leg);
    legs.push(leg);
  }

  // 胴体（腰ピボットの子）
  const torso = new THREE.Group();
  hips.add(torso);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.22), shirt);
  body.position.y = 0.27;
  torso.add(body);

  // 頭
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 0.66;
  torso.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95 })
  );
  hair.position.y = 0.7;
  torso.add(hair);

  // 腕（肩ピボット、振り上げダンスの主役）
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.13), shirt);
    sleeve.position.y = -0.1;
    arm.add(sleeve);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.1), skin);
    forearm.position.y = -0.38;
    arm.add(forearm);
    arm.position.set(sx * 0.25, 0.48, 0);
    torso.add(arm);
    arms.push(arm);
  }

  boy.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
  return { boy, hips, torso, head, arms, legs };
}

/**
 * 漁船＋踊る男の子を生成する。update(t) で周回・波の揺れ・ダンスを駆動。
 */
export function createDanceBoat(scene) {
  const { boat, flag } = createFishingBoat();
  scene.add(boat);

  const rig = createDancingBoy();
  rig.boy.position.set(0, 0.76, 2.6); // 舳先のデッキ上
  boat.add(rig.boy);

  function update(t) {
    // ラグーンを周回（進行方向を向き、波で揺れる）
    const angle = t * BOAT_SPEED;
    const x = BOAT_PATH_CENTER.x + Math.cos(angle) * BOAT_PATH_RADIUS;
    const z = BOAT_PATH_CENTER.z + Math.sin(angle) * BOAT_PATH_RADIUS;
    boat.position.set(x, 0.08 + Math.sin(t * 1.1) * 0.08, z);
    boat.rotation.y = -angle;            // 接線方向（舳先が進行方向）
    boat.rotation.x = Math.sin(t * 0.9) * 0.025;
    boat.rotation.z = Math.cos(t * 0.7) * 0.035;
    flag.rotation.y = Math.sin(t * 3.1) * 0.3; // 旗のはためき

    // ── 夜の踊り子ダンス ──
    // ビートに合わせて左右の腕を交互に斜め上へ振り上げる
    const beat = t * BEAT_HZ * Math.PI;        // 半拍ごとに切替
    const swing = Math.sin(beat);              // -1..1
    const lift = (s) => -0.5 - (s * 0.5 + 0.5) * 1.9;  // 下ろし→斜め上振り上げ
    rig.arms[0].rotation.z = -lift(swing);     // 左腕（外側へ）
    rig.arms[0].rotation.x = -0.35;
    rig.arms[1].rotation.z = lift(-swing);     // 右腕（逆位相）
    rig.arms[1].rotation.x = -0.35;

    // 腰の横ノリ＋上下バウンス＋身体のツイスト
    rig.hips.position.x = Math.sin(beat) * 0.06;
    rig.boy.position.y = 0.76 + Math.abs(Math.sin(beat)) * 0.07;
    rig.torso.rotation.y = Math.sin(beat) * 0.25;
    rig.torso.rotation.z = Math.sin(beat) * 0.08;
    rig.head.rotation.z = Math.sin(beat + 0.5) * 0.12;  // 首も小さくノる

    // 膝の軽い屈伸（左右交互に体重移動）
    rig.legs[0].rotation.x = Math.max(0, Math.sin(beat)) * 0.3;
    rig.legs[1].rotation.x = Math.max(0, -Math.sin(beat)) * 0.3;
  }

  return { boat, update };
}
