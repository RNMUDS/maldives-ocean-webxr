// resort-shared.js — リゾート各モジュールが共有する材質とジオメトリヘルパー。
// （resort.js 分割: 2026-06-12）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadTexture } from './textures.js';

export const DECK_HEIGHT = 1.2; // 水面から上段デッキ上面まで(m)
export const LOWER_DECK_TOP = 0.65; // 下段（プール）デッキ上面

export const woodDeckMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8b894,
  map: loadTexture('hardwood2_diffuse.jpg', { repeat: [1, 1], srgb: true }),
  bumpMap: loadTexture('hardwood2_bump.jpg'),
  bumpScale: 0.02,
  roughnessMap: loadTexture('hardwood2_roughness.jpg'),
  roughness: 0.95,
  envMapIntensity: 0.5,
});
export const woodPostMaterial = new THREE.MeshStandardMaterial({
  color: 0x8a6a48,
  map: loadTexture('hardwood2_diffuse.jpg', { repeat: [1, 2], srgb: true }),
  bumpMap: loadTexture('hardwood2_bump.jpg'),
  bumpScale: 0.015,
  roughness: 0.9,
  envMapIntensity: 0.4,
});

// ── ドローコール削減: 静的な同材質ジオメトリを1メッシュに結合する ──
export function mergeStatic(geometries, material) {
  const merged = mergeGeometries(geometries);
  for (const g of geometries) g.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function boxGeo(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
export function stiltGeo(x, z, deckTopY) {
  const DEPTH_BELOW_WATER = 3.2;
  const topY = deckTopY - 0.06;
  const g = new THREE.CylinderGeometry(0.12, 0.14, topY + DEPTH_BELOW_WATER, 10);
  g.translate(x, (topY - DEPTH_BELOW_WATER) / 2, z);
  return g;
}

export function enableShadows(object) {
  object.traverse((child) => {
    if (child.isMesh && !child.userData.noShadow) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
