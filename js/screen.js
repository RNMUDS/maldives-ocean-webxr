import * as THREE from 'three';
import { loadGeneratedPBRSet } from './textures.js';

// プール側（外海）の沖合に立つ巨大スクリーン
const SCREEN_WIDTH = 52;
const SCREEN_HEIGHT = 29.2; // ほぼ16:9
const SCREEN_BOTTOM_Y = 5; // 海面からスクリーン下端まで
const SCREEN_POSITION = new THREE.Vector3(85, 0, -35);
const SEABED_Y = -3;

// 待機中に表示する案内画面
function createPlaceholderTexture() {
  const WIDTH = 1024;
  const HEIGHT = 576;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#0b2640');
  gradient.addColorStop(1, '#0e4a56');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#2fd0c8';
  ctx.font = 'bold 72px "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OCEAN SCREEN', WIDTH / 2, HEIGHT / 2 - 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '40px "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.fillText('右上の「画面共有」ボタンで投影できます', WIDTH / 2, HEIGHT / 2 + 50);
  return new THREE.CanvasTexture(canvas);
}

/**
 * 沖合の巨大スクリーンを生成する。
 * startShare() でブラウザの画面共有を開始してスクリーンに投影し、
 * 共有停止で自動的に待機画面へ戻る。
 */
export function createGiantScreen(scene) {
  const group = new THREE.Group();
  group.position.copy(SCREEN_POSITION);
  group.rotation.y = -Math.PI / 2; // リゾート側(-x)を向く

  const concrete = new THREE.MeshStandardMaterial({
    color: 0xb4b4b0,
    ...loadGeneratedPBRSet('concrete', { repeat: [1, 4] }),
    envMapIntensity: 0.3,
  });

  // 支柱（海底から立ち上がる）
  const pylonHeight = SCREEN_BOTTOM_Y + SCREEN_HEIGHT - SEABED_Y;
  for (const sx of [-1, 1]) {
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, pylonHeight, 2.8),
      concrete
    );
    pylon.position.set(
      sx * (SCREEN_WIDTH / 2 - 4),
      SEABED_Y + pylonHeight / 2,
      -2.0
    );
    pylon.castShadow = true;
    group.add(pylon);
  }

  // スクリーンのフレーム（ヴィラの壁と同じ縦張りホワイトウッド）
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_WIDTH + 2.4, SCREEN_HEIGHT + 2.4, 1.0),
    new THREE.MeshStandardMaterial({
      ...loadGeneratedPBRSet('whitewood', { repeat: [14, 1] }),
      normalScale: new THREE.Vector2(1.0, 1.0),
      envMapIntensity: 0.3,
    })
  );
  frame.position.set(0, SCREEN_BOTTOM_Y + SCREEN_HEIGHT / 2, -0.6);
  frame.castShadow = true;
  group.add(frame);

  // 表示面（自発光・トーンマッピング除外で映像をくっきり）
  const placeholderTexture = createPlaceholderTexture();
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: placeholderTexture,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
    screenMaterial
  );
  screen.position.set(0, SCREEN_BOTTOM_Y + SCREEN_HEIGHT / 2, 0);
  group.add(screen);

  scene.add(group);

  // --- 画面共有 ---
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  let activeStream = null;
  const api = { onStop: null };

  function stopShare() {
    if (activeStream) {
      for (const track of activeStream.getTracks()) track.stop();
      activeStream = null;
    }
    if (screenMaterial.map !== placeholderTexture) {
      screenMaterial.map.dispose();
    }
    screenMaterial.map = placeholderTexture;
    screenMaterial.needsUpdate = true;
    if (api.onStop) api.onStop();
  }

  async function startShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.error('このブラウザは画面共有(getDisplayMedia)に対応していません');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      activeStream = stream;
      video.srcObject = stream;
      await video.play();

      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      screenMaterial.map = videoTexture;
      screenMaterial.needsUpdate = true;

      // ブラウザ側の「共有を停止」で待機画面に戻す
      stream.getVideoTracks()[0].addEventListener('ended', stopShare);
      return true;
    } catch (error) {
      console.error('画面共有を開始できませんでした:', error);
      return false;
    }
  }

  function isSharing() {
    return activeStream !== null;
  }

  api.group = group;
  api.startShare = startShare;
  api.stopShare = stopShare;
  api.isSharing = isSharing;
  return api;
}
