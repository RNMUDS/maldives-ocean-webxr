import * as THREE from 'three';

const CLOUD_COUNT = 14;
const CLOUD_MIN_RADIUS = 900;
const CLOUD_RADIUS_SPREAD = 1200;
const CLOUD_MIN_ALTITUDE = 180;
const CLOUD_ALTITUDE_SPREAD = 260;

// 配置を毎回同じにする決定的な擬似乱数（スクリーンショット検証の再現性も保つ）
function createRandom(initialSeed) {
  let seed = initialSeed;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// ガウス状の白い塊を重ねた、ふんわりした積雲テクスチャ
function createCloudTexture() {
  const WIDTH = 256;
  const HEIGHT = 128;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const random = createRandom(7);

  const BLOB_COUNT = 40;
  for (let i = 0; i < BLOB_COUNT; i += 1) {
    const x = WIDTH * 0.15 + random() * WIDTH * 0.7;
    const y = HEIGHT * 0.35 + random() * HEIGHT * 0.35;
    const radius = 12 + random() * 30;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return new THREE.CanvasTexture(canvas);
}

/** 水平線の上に浮かぶ積雲（ビルボード）を空に散らす */
export function createClouds(scene) {
  const texture = createCloudTexture();
  const random = createRandom(99);

  for (let i = 0; i < CLOUD_COUNT; i += 1) {
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.5 + random() * 0.3,
        depthWrite: false,
        toneMapped: false, // HDRの空より暗く沈んで煙に見えるのを防ぐ
      })
    );
    const angle = random() * Math.PI * 2;
    const radius = CLOUD_MIN_RADIUS + random() * CLOUD_RADIUS_SPREAD;
    cloud.position.set(
      Math.cos(angle) * radius,
      CLOUD_MIN_ALTITUDE + random() * CLOUD_ALTITUDE_SPREAD,
      Math.sin(angle) * radius
    );
    const width = 500 + random() * 700;
    cloud.scale.set(width, width * 0.4, 1);
    scene.add(cloud);
  }
}
