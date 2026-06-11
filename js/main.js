import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { createOcean } from './ocean.js';
import { createResort, DECK_HEIGHT } from './resort.js';
import { createMarineLife } from './marinelife.js';
import { createClouds } from './clouds.js';
import { createGiantScreen } from './screen.js';

const PLAYER_HEIGHT = 1.6; // 非XR時のカメラ高さ（XR時はデバイスが上書き）
const MOVE_SPEED = 2.5; // XRサムスティック移動速度 (m/s)
const WASD_SPEED = 5; // キーボード移動速度 (m/s)
const SPRINT_MULTIPLIER = 3; // Shift押下時の倍率
const FLY_SPEED = 4; // Space押下時の上昇速度 (m/s)
const FALL_SPEED = 5; // Space解放時の下降速度 (m/s)
const DEAD_ZONE = 0.15;

const pressedKeys = new Set();

let renderer;
let scene;
let camera;
let dolly;
let controls;
let ocean;
let resort;
let marineLife;
let controllers = [];
const clock = new THREE.Clock();

init();

function init() {
  try {
    setupRenderer();
    setupScene();
    setupXR();
    setupKeyboard();
    window.addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
  } catch (error) {
    console.error('初期化に失敗しました:', error);
    showError('シーンの初期化に失敗しました。WebGL対応ブラウザでお試しください。');
  }
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
}

function setupScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  );
  camera.position.set(0, DECK_HEIGHT + PLAYER_HEIGHT, 8);

  // XR用プレイヤーリグ（カメラとコントローラを載せて移動させる）
  // 非XR時はワールド座標と一致させるため原点に置き、
  // XRセッション開始時に桟橋のデッキ上へ移動する
  dolly = new THREE.Group();
  dolly.add(camera);
  scene.add(dolly);
  renderer.xr.addEventListener('sessionstart', () => {
    dolly.position.set(0, DECK_HEIGHT, 8);
  });
  renderer.xr.addEventListener('sessionend', () => {
    dolly.position.set(0, 0, 0);
  });

  // フラットな環境光は最小限にし、空からの光と
  // ラグーン水面からの照り返し（反射光）で立体感を出す
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambient);
  const bounceLight = new THREE.HemisphereLight(0xbfd8e8, 0x5fc8b8, 0.35);
  scene.add(bounceLight);

  ocean = createOcean(scene, renderer);
  resort = createResort(scene);
  marineLife = createMarineLife(scene);
  createClouds(scene);
  setupScreenShare(createGiantScreen(scene));

  // 一人称視点：クリックでポインターロックし、マウスで見回す
  controls = new PointerLockControls(camera, renderer.domElement);
  camera.lookAt(0, DECK_HEIGHT + PLAYER_HEIGHT, -10); // 初期視線は桟橋の先
  renderer.domElement.addEventListener('click', () => {
    if (renderer.xr.isPresenting) return;
    // 非対応環境（古いブラウザ等）でも未処理エラーにしない
    try {
      const request = renderer.domElement.requestPointerLock();
      if (request && typeof request.catch === 'function') {
        request.catch((error) => {
          console.error('ポインターロックを開始できませんでした:', error);
        });
      }
    } catch (error) {
      console.error('ポインターロックを開始できませんでした:', error);
    }
  });
  setupDragLookFallback();
}

// ポインターロックが使えない環境向け：ドラッグで一人称視点を回す
function setupDragLookFallback() {
  const LOOK_SPEED = 0.0025;
  const PITCH_LIMIT = Math.PI / 2 - 0.05;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (controls.isLocked || renderer.xr.isPresenting) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging || controls.isLocked) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SPEED;
    euler.x -= dy * LOOK_SPEED;
    euler.x = THREE.MathUtils.clamp(euler.x, -PITCH_LIMIT, PITCH_LIMIT);
    camera.quaternion.setFromEuler(euler);
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  // 検証用：ヘッドレステストから視点切替・海/空パラメータ調整を行うフック
  window.__SCENE_DEBUG__ = {
    setView(position, target) {
      camera.position.set(...position);
      camera.lookAt(...target);
    },
    ocean,
    marineLife,
    getCameraY: () => camera.position.y,
  };
}

function setupXR() {
  document.body.appendChild(VRButton.createButton(renderer));

  const modelFactory = new XRControllerModelFactory();
  controllers = [0, 1].map((index) => {
    const controller = renderer.xr.getController(index);
    dolly.add(controller);

    const grip = renderer.xr.getControllerGrip(index);
    grip.add(modelFactory.createControllerModel(grip));
    dolly.add(grip);

    return controller;
  });
}

// 右上のボタンで巨大スクリーンへの画面共有を開始/停止する。
// HTMLキャッシュの影響を受けないよう、ボタンはJSから動的に生成する
function setupScreenShare(giantScreen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:30;padding:10px 16px;' +
    'font-size:14px;color:#fff;background:rgba(11,38,64,.85);' +
    'border:1px solid #2fd0c8;border-radius:8px;cursor:pointer;';
  document.body.appendChild(button);

  const setIdle = () => {
    button.textContent = '📺 画面共有';
    button.style.background = 'rgba(11,38,64,.85)';
    button.style.borderColor = '#2fd0c8';
  };
  const setSharing = () => {
    button.textContent = '⏹ 共有を停止';
    button.style.background = 'rgba(208,60,60,.75)';
    button.style.borderColor = '#ff8888';
  };
  setIdle();

  // ブラウザ側の「共有を停止」操作でもボタン表示を戻す
  giantScreen.onStop = setIdle;

  button.addEventListener('click', async (event) => {
    event.stopPropagation(); // canvasのポインターロックを発火させない
    if (giantScreen.isSharing()) {
      giantScreen.stopShare();
      setIdle();
    } else if (await giantScreen.startShare()) {
      setSharing();
    }
  });
}

function setupKeyboard() {
  window.addEventListener('keydown', (event) => {
    // スクロール等の既定動作を抑止（Space・矢印キー）
    if (event.code === 'Space' || event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
    pressedKeys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.code);
  });
  window.addEventListener('blur', () => pressedKeys.clear());
}

// WASD: 視線方向に水平移動 / Shift: 高速移動 / Space: 上昇（飛行）
function handleKeyboardMovement(delta) {
  const sprint =
    pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')
      ? SPRINT_MULTIPLIER
      : 1;

  // Space押下中は上昇、離すと歩行時の目線高さまで自動下降
  const groundEyeY = DECK_HEIGHT + PLAYER_HEIGHT;
  if (pressedKeys.has('Space')) {
    camera.position.y += FLY_SPEED * sprint * delta;
  } else if (camera.position.y > groundEyeY) {
    camera.position.y = Math.max(
      groundEyeY,
      camera.position.y - FALL_SPEED * sprint * delta
    );
  }

  let moveForward = 0;
  let moveRight = 0;
  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) moveForward += 1;
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) moveForward -= 1;
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) moveRight += 1;
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) moveRight -= 1;
  if (moveForward === 0 && moveRight === 0) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.setY(0).normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, camera.up)
    .normalize();

  const speed = WASD_SPEED * sprint;
  const offset = new THREE.Vector3()
    .addScaledVector(forward, moveForward * speed * delta)
    .addScaledVector(right, moveRight * speed * delta);
  camera.position.add(offset);
}

// XRコントローラのサムスティックで筏の上を移動する
function handleLocomotion(delta) {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    const axes = source.gamepad?.axes;
    if (!axes || axes.length < 4) continue;

    const x = Math.abs(axes[2]) > DEAD_ZONE ? axes[2] : 0;
    const y = Math.abs(axes[3]) > DEAD_ZONE ? axes[3] : 0;
    if (x === 0 && y === 0) continue;

    const headQuaternion = renderer.xr
      .getCamera()
      .getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(headQuaternion)
      .setY(0)
      .normalize();
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(headQuaternion)
      .setY(0)
      .normalize();

    dolly.position.addScaledVector(forward, -y * MOVE_SPEED * delta);
    dolly.position.addScaledVector(right, x * MOVE_SPEED * delta);
  }
}

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  ocean.update(delta);
  resort.update(elapsed);
  marineLife.update(elapsed);

  if (renderer.xr.isPresenting) {
    handleLocomotion(delta);
    dolly.position.y = DECK_HEIGHT; // 桟橋のデッキ高さを維持
  } else {
    handleKeyboardMovement(delta);
  }

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showError(message) {
  const element = document.createElement('div');
  element.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'color:#fff;background:rgba(0,0,0,.7);padding:16px 24px;border-radius:8px;z-index:100;';
  element.textContent = message;
  document.body.appendChild(element);
}
