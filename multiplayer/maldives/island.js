// island.js — 白砂と森の島（遠景）。
// （resort.js 分割: 2026-06-12）
import * as THREE from 'three';

// 白砂と椰子の島（桟橋の終点につながる）
export function createIsland(scale) {
  const island = new THREE.Group();
  let seed = 91;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const dummy = new THREE.Object3D();

  // ── 真っ白な砂浜: 楕円ドーム2つを重ねて海岸線を不規則に ──
  const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f3e4, roughness: 1 });
  const sand = new THREE.Mesh(new THREE.SphereGeometry(20, 36, 18), sandMaterial);
  sand.scale.set(scale, 0.07 * scale, scale * 0.72);
  sand.receiveShadow = true;
  island.add(sand);
  const sandSpit = new THREE.Mesh(new THREE.SphereGeometry(20, 28, 14), sandMaterial);
  sandSpit.scale.set(scale * 0.55, 0.05 * scale, scale * 0.42);
  sandSpit.position.set(scale * 13, 0, scale * 6);
  sandSpit.receiveShadow = true;
  island.add(sandSpit);

  // ── 密生する森のキャノピー: 潰した球のインスタンスを敷き詰める ──
  const RX = 20 * scale * 0.62;          // 森の楕円範囲（砂浜の帯を残す）
  const RZ = 20 * scale * 0.72 * 0.6;
  const sandTop = (q) => 1.4 * scale * Math.sqrt(Math.max(0, 1 - q));
  const CANOPY_COUNT = 160;
  const canopy = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 9, 7),
    new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    CANOPY_COUNT
  );
  const GREENS = [0x1e4d2b, 0x2d6a35, 0x417f3c, 0x26512a, 0x528f48, 0x35703a];
  const color = new THREE.Color();
  for (let i = 0; i < CANOPY_COUNT; i += 1) {
    // 楕円内に棄却サンプリング（中心ほど密に大きく）
    let px = 0, pz = 0, q = 1;
    for (let tries = 0; tries < 8; tries += 1) {
      px = (random() * 2 - 1) * RX;
      pz = (random() * 2 - 1) * RZ;
      q = (px / RX) ** 2 + (pz / RZ) ** 2;
      if (q < 1) break;
    }
    const r = (1.5 + random() * 2.8) * scale * 0.55 * (1.25 - q * 0.5);
    dummy.position.set(px, sandTop(q * 0.7) + r * 0.18, pz);
    dummy.scale.set(r * (0.9 + random() * 0.5), r * 0.6, r * (0.9 + random() * 0.5));
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.updateMatrix();
    canopy.setMatrixAt(i, dummy.matrix);
    color.set(GREENS[i % GREENS.length]);
    color.offsetHSL((random() - 0.5) * 0.03, (random() - 0.5) * 0.1, (random() - 0.5) * 0.06);
    canopy.setColorAt(i, color);
  }
  canopy.instanceColor.needsUpdate = true;
  canopy.castShadow = true;
  island.add(canopy);

  // ── 林冠から頭を出す椰子（幹と葉をそれぞれ1バッチでインスタンス描画） ──
  const PALM_COUNT = 14;
  const FRONDS_PER_PALM = 7;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.16, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }),
    PALM_COUNT
  );
  const fronds = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.3, 2.6, 4),
    new THREE.MeshStandardMaterial({ color: 0x3f9447, roughness: 0.85 }),
    PALM_COUNT * FRONDS_PER_PALM
  );
  const frondDummy = new THREE.Object3D();
  for (let i = 0; i < PALM_COUNT; i += 1) {
    // 林縁〜砂浜の際に配置（参照画像のように森の手前で立ち上がる）
    const a = random() * Math.PI * 2;
    const ring = 0.72 + random() * 0.22;
    const px = Math.cos(a) * RX * ring;
    const pz = Math.sin(a) * RZ * ring;
    const q = (px / RX) ** 2 + (pz / RZ) ** 2;
    const baseY = sandTop(Math.min(1, q) * 0.7);
    const h = (4.5 + random() * 3.5) * scale * 0.55;
    const tilt = (random() - 0.5) * 0.22;
    const tiltDir = random() * Math.PI * 2;

    dummy.position.set(px + Math.cos(tiltDir) * tilt * h * 0.5, baseY + h / 2, pz + Math.sin(tiltDir) * tilt * h * 0.5);
    dummy.rotation.set(Math.sin(tiltDir) * tilt, 0, -Math.cos(tiltDir) * tilt);
    dummy.scale.set(scale * 0.55, h, scale * 0.55);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    // 葉: 幹の頂部から放射状に垂れる
    const topX = px + Math.cos(tiltDir) * tilt * h;
    const topZ = pz + Math.sin(tiltDir) * tilt * h;
    const topY = baseY + h;
    for (let f = 0; f < FRONDS_PER_PALM; f += 1) {
      const fa = (f / FRONDS_PER_PALM) * Math.PI * 2 + random() * 0.4;
      const droop = 0.9 + random() * 0.5;
      const reach = 1.05 * scale * 0.55;
      frondDummy.position.set(
        topX + Math.cos(fa) * reach,
        topY + 0.25 * scale * 0.55,
        topZ + Math.sin(fa) * reach
      );
      frondDummy.rotation.set(Math.sin(fa) * droop, 0, -Math.cos(fa) * droop);
      frondDummy.scale.set(scale * 0.5, scale * 0.62, scale * 0.28);
      frondDummy.updateMatrix();
      fronds.setMatrixAt(i * FRONDS_PER_PALM + f, frondDummy.matrix);
    }
  }
  trunks.castShadow = true;
  fronds.castShadow = true;
  island.add(trunks, fronds);

  return island;
}
