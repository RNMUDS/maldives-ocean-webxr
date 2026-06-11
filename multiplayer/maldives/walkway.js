// walkway.js — 桟橋・接続通路の板張りとランプポスト。
// （resort.js 分割: 2026-06-12）
import * as THREE from 'three';
import { loadGeneratedPBRSet } from './textures.js';
import {
  DECK_HEIGHT, woodDeckMaterial, woodPostMaterial,
  mergeStatic, boxGeo, stiltGeo, enableShadows,
} from './resort-shared.js';

const LAMP_COLOR = 0xffb366;
const LAMP_INTENSITY = 5;
const LAMP_RANGE = 9;

// ランプポスト用コンクリート（細い柱に合わせて細かめのリピート）
const lampConcreteMaterial = new THREE.MeshStandardMaterial({
  color: 0xb4b4b0, // 直射光での白飛びを防ぐ減光
  ...loadGeneratedPBRSet('concrete', { repeat: [0.5, 0.5] }),
  normalScale: new THREE.Vector2(0.8, 0.8),
  envMapIntensity: 0.3,
});

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

// 桟橋の板張り通路（杭付き）。長さ方向は z。
export function createWalkway(length, width) {
  const walkway = new THREE.Group();
  // 板は1枚ずつ別メッシュにせず、全板を1ジオメトリに結合（1ドローコール）
  const PLANK_PITCH = 0.36;
  const plankCount = Math.floor(length / PLANK_PITCH);
  const plankGeos = [];
  for (let i = 0; i < plankCount; i += 1) {
    plankGeos.push(boxGeo(
      width, 0.08, PLANK_PITCH - 0.05,
      0, DECK_HEIGHT - 0.04, -length / 2 + (i + 0.5) * PLANK_PITCH
    ));
  }
  walkway.add(mergeStatic(plankGeos, woodDeckMaterial));
  // 杭も全て結合
  const POST_PITCH = 4;
  const stiltGeos = [];
  for (let z = -length / 2; z <= length / 2; z += POST_PITCH) {
    stiltGeos.push(stiltGeo(-width / 2 + 0.15, z, DECK_HEIGHT));
    stiltGeos.push(stiltGeo(width / 2 - 0.15, z, DECK_HEIGHT));
  }
  walkway.add(mergeStatic(stiltGeos, woodPostMaterial));
  return walkway;
}

export function createLampPost({ withLight = true } = {}) {
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

  // WebGLのフォワード描画では灯数がそのまま全物体の負荷になるため、
  // 実光源は一部のランプのみ（見た目の発光・光暈は全ランプ共通）
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(LAMP_COLOR, LAMP_INTENSITY, LAMP_RANGE, 2);
    light.position.y = POST_HEIGHT + 0.1;
    lampPost.add(light);
  }

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

// ランプの灯のゆらぎ（実光源と光暈を同期して脈動させる）
export function updateLamps(lampPosts, time) {
    for (let i = 0; i < lampPosts.length; i += 1) {
      const flicker = 0.88 + 0.12 * Math.sin(time * 4.5 + i * 1.7);
      if (lampPosts[i].userData.light) {
        lampPosts[i].userData.light.intensity = LAMP_INTENSITY * flicker;
      }
      lampPosts[i].userData.halo.material.opacity = flicker;
    }
}
