// ─────────────────────────────────────────────────────────────────────────────
// MALDIVES OCEAN RESORT — モルディブ水上ヴィラのマルチプレイ空間。
//   • /internship/ と同じスタック: SpaceCore（アバター + Socket.IO 同期 +
//     独立 SFU 音声ルーム + 一人称リグ）+ SFU 画面共有。
//   • 名前のみのログインで入場。
//   • 桟橋・ヴィラのデッキ・島の砂浜を歩ける（_groundY 衝突）。
//     Space 長押しで飛行。
//   • 沖合の巨大スクリーンに画面共有（SFU video）。誰かの共有が
//     全員のスクリーンに映る。共有が無いときは案内画面。
//   • シングルプレイ版 (RNMUDS/maldives-ocean-webxr) を WebGPU + TSL に移植。
// Published at /maldives/ (nginx → :3000, static client/maldives/).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

import {
  SpaceCore, setLoading, hideLoading, gpuFail,
  EYE_HEIGHT, MOVE_SPEED, SPRINT_MULT, GRAVITY, FLY_RISE,
} from '/gw/_shared/space-core.js';

import { createOcean } from './ocean-webgpu.js';
import { createResort, DECK_HEIGHT, LAYOUT } from './resort.js';
import { createMarineLife } from './marinelife.js';
import { createClouds } from './clouds.js';
import { loadGeneratedPBRSet } from './textures.js';
import { createDanceBoat } from './dance-boat.js';

const ROOM_ID = 'maldives-main';   // multiplayer room
const SFU_ROOM = 'maldives';       // independent SFU voice/video room
const NAME_KEY = 'maldives-user-name';

// ── 沖合の巨大スクリーン ──
const SCREEN_WIDTH = 52;
const SCREEN_HEIGHT = 29.2;
const SCREEN_BOTTOM_Y = 5;
const SCREEN_POSITION = new THREE.Vector3(85, 0, -35);
const SEABED_Y = -3;

// ── 島の衝突（resort.js の配置と一致させる） ──
const ISLAND_CX = -8;
const ISLAND_CZ = LAYOUT.JETTY_START_Z - LAYOUT.JETTY_LENGTH - 28;
const ISLAND_RX = 44;   // 20 * scale2.2
const ISLAND_RZ = 30.8; // 20 * scale2.2 * 0.7
const ISLAND_H = 4.4;   // 砂丘の最大高さ

function makePlaceholderTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 576;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 576);
  g.addColorStop(0, '#0b2640'); g.addColorStop(1, '#0e4a56');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
  x.textAlign = 'center';
  x.fillStyle = '#2fd0c8';
  x.font = 'bold 72px "Hiragino Sans","Helvetica Neue",sans-serif';
  x.fillText('OCEAN SCREEN', 512, 250);
  x.fillStyle = '#ffffff';
  x.font = '38px "Hiragino Sans","Helvetica Neue",sans-serif';
  x.fillText('右上の🖥️ボタンで画面を共有できます', 512, 330);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class MaldivesSpace extends SpaceCore {
  constructor() {
    super({ roomId: ROOM_ID, sfuRoom: SFU_ROOM, logPrefix: '[maldives]', joystickColor: '#2fd0c8', toneMappingExposure: 0.35 });
    this.userName = (() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } })() || 'ゲスト';
    this.yaw = 0;                 // 桟橋の先（-Z、ヴィラと島）を向く
    this.pitch = -0.02;
    this.position = new THREE.Vector3(0, DECK_HEIGHT + EYE_HEIGHT, 6);
    // screen-share state: producerId → { texture, videoEl, socketId, userName }
    this._shares = new Map();
    this._activeShareId = null;
    this._videoEl = null;
    this._localShare = null;
  }

  async start() {
    setLoading('レンダラーを初期化中…');
    try { await this._setupRenderer(); }
    catch (e) { gpuFail('3D描画を初期化できませんでした。<br><small>' + (e?.message ?? e) + '</small>'); return; }
    setLoading('ラグーンとヴィラを建設中…');
    this._setupScene();
    this._setupControls();
    setLoading('シェーダーをコンパイル中…');
    // 事前コンパイルに失敗しても入室は続行する（初回フレームで遅延コンパイル）
    try { await this.renderer.compileAsync(this.scene, this.camera); }
    catch (e) { console.warn('[maldives] compileAsync failed — continuing:', e?.message ?? e); }
    this._showUI();
    this._loop();
    setLoading('接続中…');
    await this._setupMultiplayer().catch((e) => console.warn('[maldives] mp:', e));
    this._setupVoice()
      .then(() => this._wireScreenShare())
      .catch((e) => console.warn('[maldives] voice:', e));
    hideLoading();
  }

  // 時刻モード切替ボタン（昼 ⇄ 夕暮れ）。各自のクライアントだけに効く
  _wireExtraUI() {
    const btn = document.getElementById('time-btn');
    if (!btn) return;
    btn.classList.remove('hidden');
    this._timeMode = 'noon';
    btn.addEventListener('click', () => {
      this._timeMode = this._timeMode === 'noon' ? 'sunset' : 'noon';
      this.ocean.setMode(this._timeMode);
      btn.textContent = this._timeMode === 'noon' ? '🌅' : '☀️';
      btn.title = this._timeMode === 'noon' ? '夕暮れにする' : '昼にする';
    });
  }

  // WebGPUが使えれば使い、無ければ同じTSLシーンをWebGL2バックエンドで描く
  // （/gw/ 本体と同じ方針 — スマホを含むほぼ全ブラウザで動く）
  async _setupRenderer() {
    this.canvas = document.getElementById('c');
    let renderer = null;
    // iOS/iPadOSのSafariはWebGPUが新しく、本シーンの大規模TSLコンパイルで
    // 固まる事例があるため、最初からWebGL2経路に固定する（/gw/も同方針で安定）
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS && navigator.gpu) {
      try {
        renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true });
        await renderer.init();
      } catch (e) {
        console.warn('[maldives] WebGPU init failed — falling back to WebGL2:', e?.message ?? e);
        renderer = null;
      }
    }
    if (!renderer) {
      renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, forceWebGL: true });
      await renderer.init();
    }
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.toneMappingExposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ── scene ──
  _setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 20000);
    this.camera.rotation.order = 'YXZ';

    this.ocean = createOcean(this.scene, {
      swellEnabled: !!this.renderer.backend?.isWebGPUBackend,
      renderer: this.renderer,
    });
    this.resort = createResort(this.scene);
    this.marine = createMarineLife(this.scene);
    this.danceBoat = createDanceBoat(this.scene);
    createClouds(this.scene);
    this._buildScreen();
    this._setupBoatAudio();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // カヤックのスピーカー: 参照動画の音声を船の位置から空間再生する。
  // 距離減衰つきなので船が近くを通った時だけ聞こえる
  _setupBoatAudio() {
    const listener = new THREE.AudioListener();
    this.camera.add(listener);
    const sound = new THREE.PositionalAudio(listener);
    sound.setRefDistance(7);
    sound.setRolloffFactor(1.5);
    sound.setLoop(true);
    sound.setVolume(0.011); // 0.11からさらに1/10に減音
    this.danceBoat.boat.add(sound);

    new THREE.AudioLoader().load(
      './assets/yorunoodoriko.m4a',
      (buffer) => {
        sound.setBuffer(buffer);
        const tryPlay = () => {
          if (sound.isPlaying) return true;
          const ctx = listener.context;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          try { sound.play(); } catch {}
          return sound.isPlaying;
        };
        // ログイン操作直後なら再生できる。ブロックされた場合は次の操作で開始
        if (!tryPlay()) {
          const once = () => {
            if (tryPlay()) {
              window.removeEventListener('pointerdown', once);
              window.removeEventListener('keydown', once);
              window.removeEventListener('touchstart', once);
            }
          };
          window.addEventListener('pointerdown', once);
          window.addEventListener('keydown', once);
          window.addEventListener('touchstart', once);
        }
      },
      undefined,
      (e) => console.warn('[maldives] boat audio load failed:', e)
    );
    this._boatAudio = sound;
  }

  // 沖合の巨大スクリーン（共有が無い間は案内画面）
  _buildScreen() {
    const group = new THREE.Group();
    group.position.copy(SCREEN_POSITION);
    group.rotation.y = -Math.PI / 2; // リゾート側(-x)を向く

    const concrete = new THREE.MeshStandardMaterial({
      color: 0xb4b4b0,
      ...loadGeneratedPBRSet('concrete', { repeat: [1, 4] }),
      envMapIntensity: 0.3,
    });
    const pylonHeight = SCREEN_BOTTOM_Y + SCREEN_HEIGHT - SEABED_Y;
    for (const sx of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.8, pylonHeight, 2.8), concrete);
      pylon.position.set(sx * (SCREEN_WIDTH / 2 - 4), SEABED_Y + pylonHeight / 2, -2.0);
      pylon.castShadow = true;
      group.add(pylon);
    }

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(SCREEN_WIDTH + 2.4, SCREEN_HEIGHT + 2.4, 1.0),
      new THREE.MeshStandardMaterial({
        ...loadGeneratedPBRSet('whitewood', { repeat: [14, 1] }),
        envMapIntensity: 0.3,
      })
    );
    frame.position.set(0, SCREEN_BOTTOM_Y + SCREEN_HEIGHT / 2, -0.6);
    frame.castShadow = true;
    group.add(frame);

    this._placeholderTexture = makePlaceholderTexture();
    this._placeholderMat = new THREE.MeshBasicMaterial({ map: this._placeholderTexture, toneMapped: false });
    // 昼の屋外なので共有画面はやや明るさを抑えて白飛びを防ぐ
    this._videoMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this._videoMat.color.setRGB(0.85, 0.85, 0.85);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
      this._placeholderMat
    );
    screen.position.set(0, SCREEN_BOTTOM_Y + SCREEN_HEIGHT / 2, 0);
    screen.userData.baseW = SCREEN_WIDTH;
    screen.userData.baseH = SCREEN_HEIGHT;
    this._screenMeshes = [screen];
    group.add(screen);

    this.scene.add(group);
  }

  // ── screen share (SFU video, /internship/ と同じスタック) ──
  _wireScreenShare() {
    const btn = document.getElementById('screen-share-btn');
    if (!navigator.mediaDevices?.getDisplayMedia) { btn?.classList.add('hidden'); }
    else {
      btn?.classList.remove('hidden');
      btn?.addEventListener('click', () => this._toggleShare(btn));
    }

    this.voice.on('videoProducerAdded', ({ producerId, videoEl, socketId }) => {
      if (this.voice.screenProducer?.id === producerId) return;   // 自分のエコー
      if (this._shares.has(producerId)) return;
      const texture = this._makeVideoTexture(videoEl);
      this._shares.set(producerId, { texture, videoEl, socketId, userName: this._shareName(socketId) });
      this._activateShare(producerId);
    });
    this.voice.on('videoProducerRemoved', ({ producerId }) => {
      const entry = this._shares.get(producerId);
      if (!entry) return;
      this._shares.delete(producerId);
      try { entry.texture.dispose(); } catch {}
      if (this._activeShareId === producerId) this._activateNextShare();
    });

    // 途中入室対応: 入室前から共有中だった画面は voice.initialize() 中に
    // 消費され、videoProducerAdded をリスナー登録前に発火し終えている。
    // videoConsumers に残っているので、ここで取り込んでスクリーンに出す
    if (this.voice.videoConsumers) {
      for (const [producerId, entry] of this.voice.videoConsumers) {
        if (this.voice.screenProducer?.id === producerId) continue;
        if (this._shares.has(producerId)) continue;
        const texture = this._makeVideoTexture(entry.videoEl);
        this._shares.set(producerId, {
          texture,
          videoEl: entry.videoEl,
          socketId: entry.socketId,
          userName: this._shareName(entry.socketId),
        });
        if (!this._activeShareId) this._activateShare(producerId);
      }
    }
  }

  _makeVideoTexture(videoEl) {
    const t = new THREE.VideoTexture(videoEl);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    return t;
  }

  _shareName(socketId) {
    try { return this.socket?.users?.get(socketId)?.userName || '参加者'; } catch { return '参加者'; }
  }

  _activateShare(producerId) {
    const entry = producerId === 'local' ? this._localShare : this._shares.get(producerId);
    if (!entry) return;
    this._activeShareId = producerId;
    this._videoEl = entry.videoEl;
    if (!entry.videoEl._fitWired) {
      entry.videoEl._fitWired = true;
      entry.videoEl.addEventListener('resize', () => {
        if (this._videoEl === entry.videoEl) this._fitScreensToVideo();
      });
    }
    this._videoMat.map = entry.texture;
    this._videoMat.needsUpdate = true;
    for (const m of this._screenMeshes) m.material = this._videoMat;
    this._fitScreensToVideo();
    this._setShareLabel(producerId === 'local' ? 'あなたの画面をオーシャンスクリーンに表示中' : `${entry.userName} さんの画面を表示中`);
  }

  _activateNextShare() {
    if (this._localShare) return this._activateShare('local');
    const next = this._shares.keys().next();
    if (!next.done) return this._activateShare(next.value);
    this._activeShareId = null;
    this._videoEl = null;
    this._videoMat.map = null;
    for (const m of this._screenMeshes) { m.material = this._placeholderMat; m.scale.set(1, 1, 1); }
    this._setShareLabel(null);
  }

  // レターボックス（contain）フィット：共有映像のアスペクト比を保つ
  _fitScreensToVideo() {
    const v = this._videoEl;
    const va = (v && v.videoWidth > 0 && v.videoHeight > 0) ? v.videoWidth / v.videoHeight : 0;
    for (const m of this._screenMeshes) {
      if (!va) { m.scale.set(1, 1, 1); continue; }
      const sa = m.userData.baseW / m.userData.baseH;
      m.scale.set(Math.min(1, va / sa), Math.min(1, sa / va), 1);
    }
  }

  _setShareLabel(text) {
    const el = document.getElementById('share-label');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('visible', !!text);
  }

  async _toggleShare(btn) {
    if (this._shareBusy) return;
    this._shareBusy = true;
    try {
      if (this._localShare) { await this._stopLocalShare(btn); return; }
      if (!this.voice?.isJoined) { console.warn('[maldives] voice not joined yet — cannot share'); return; }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No video track from getDisplayMedia');
      const producerId = await this.voice.startScreenShare(track, stream);
      if (!producerId) { stream.getTracks().forEach((t) => t.stop()); throw new Error('SFU rejected the screen producer'); }
      const videoEl = document.createElement('video');
      videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
      videoEl.style.display = 'none'; videoEl.srcObject = stream;
      document.body.appendChild(videoEl);
      videoEl.onloadedmetadata = () => videoEl.play().catch(() => {});
      const texture = this._makeVideoTexture(videoEl);
      this._localShare = { producerId, stream, videoEl, texture };
      track.onended = () => this._stopLocalShare(btn);   // ブラウザの「共有を停止」
      this._activateShare('local');
      btn?.classList.add('active');
    } catch (e) {
      if (e?.name !== 'NotAllowedError') console.warn('[maldives] share failed:', e);
    } finally {
      this._shareBusy = false;
    }
  }

  async _stopLocalShare(btn) {
    const ls = this._localShare;
    this._localShare = null;
    btn?.classList.remove('active');
    try { await this.voice?.stopScreenShare(); } catch {}
    if (ls) {
      try { ls.stream.getTracks().forEach((t) => t.stop()); } catch {}
      try { ls.texture.dispose(); } catch {}
      try { ls.videoEl.srcObject = null; ls.videoEl.remove(); } catch {}
    }
    if (this._activeShareId === 'local') this._activateNextShare();
  }

  // ── 足場の高さ（桟橋・接続通路・ヴィラの上下デッキ・島の砂浜・海面） ──
  _groundY(x, z) {
    const L = LAYOUT;
    // 桟橋
    if (
      Math.abs(x) <= L.JETTY_WIDTH / 2 &&
      z <= L.JETTY_START_Z && z >= L.JETTY_START_Z - L.JETTY_LENGTH
    ) return DECK_HEIGHT;

    // 各ヴィラ（回転後: 上段デッキは world-x が奥行き、world-z が幅）
    for (let i = 0; i < L.VILLA_COUNT; i += 1) {
      const vz = L.VILLA_FIRST_Z - i * L.VILLA_SPACING;
      // 茅葺き屋根（4角錐）: 屋根面より上にいる時だけ足場になる
      // （ConeGeometry(5.2, 2.8, 4)回転45°: 半幅3.68 / 軒4.05m / 頂点6.85m）
      {
        const lx = z - vz;
        const lz = -(x - L.VILLA_CENTER_X);
        const m = Math.max(Math.abs(lx), Math.abs(lz));
        const ROOF_HALF = 3.68;
        const ROOF_APEX = 6.85;
        const ROOF_BASE = 4.05;
        if (m <= ROOF_HALF) {
          const roofY = ROOF_APEX - ((ROOF_APEX - ROOF_BASE) / ROOF_HALF) * m;
          if (this.position.y > roofY - 0.35) return roofY;
        }
      }
      // 接続通路
      if (
        x >= L.JETTY_WIDTH / 2 && x <= L.VILLA_CENTER_X - L.DECK_D / 2 &&
        Math.abs(z - vz) <= L.BRANCH_WIDTH / 2 + 0.2
      ) return DECK_HEIGHT;
      // 上段デッキ
      if (
        Math.abs(x - L.VILLA_CENTER_X) <= L.DECK_D / 2 &&
        Math.abs(z - vz) <= L.DECK_W / 2
      ) return DECK_HEIGHT;
      // 下段（プール）デッキ
      if (
        x >= L.VILLA_CENTER_X + L.DECK_D / 2 && x <= L.VILLA_CENTER_X + L.DECK_D / 2 + 4.5 &&
        z >= vz + 0.5 && z <= vz + 5.5
      ) return L.LOWER_DECK_TOP;
    }

    // 島の砂浜（楕円ドーム）
    const qx = (x - ISLAND_CX) / ISLAND_RX;
    const qz = (z - ISLAND_CZ) / ISLAND_RZ;
    const q = qx * qx + qz * qz;
    if (q < 1) return ISLAND_H * Math.sqrt(1 - q);

    return 0; // 海面（波の上を歩ける）
  }

  // ── main loop ──
  _loop() {
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(async () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      this._step(dt, t);
      this.resort.update(t);
      this.marine.update(t);
      this.danceBoat.update(t);
      try { await this.renderer.renderAsync(this.scene, this.camera); }
      catch (e) { if (!this._renderErrLogged) { this._renderErrLogged = true; console.warn('[maldives] render error:', e?.message ?? e); } }
    });
  }

  _step(dt, t) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mv = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mv.add(fwd);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mv.sub(fwd);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mv.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mv.sub(right);
    if (this.joy.x || this.joy.y) { mv.add(fwd.clone().multiplyScalar(this.joy.y)); mv.add(right.clone().multiplyScalar(this.joy.x)); }
    if (mv.lengthSq() > 0) {
      mv.normalize();
      const sp = MOVE_SPEED * ((this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? SPRINT_MULT : 1);
      this.position.x += mv.x * sp * dt;
      this.position.z += mv.z * sp * dt;
    }
    // リゾート一帯から離れすぎないように
    const cx = 0, cz = -50, R = 350;
    const dx = this.position.x - cx, dz = this.position.z - cz;
    const dr = Math.hypot(dx, dz);
    if (dr > R) { this.position.x = cx + dx * (R / dr); this.position.z = cz + dz * (R / dr); }

    if (this.flyHold) { this.velocityY = FLY_RISE; this.grounded = false; }
    else this.velocityY += GRAVITY * dt;
    this.position.y += this.velocityY * dt;
    const minY = this._groundY(this.position.x, this.position.z) + EYE_HEIGHT;
    if (this.position.y <= minY) { this.position.y = minY; this.velocityY = 0; this.grounded = true; }

    this.camera.position.copy(this.position);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    this._syncTransform();
  }
}

// ── name-only login → start ──────────────────────────────────────────────────
const loginEl = document.getElementById('login');
const form = document.getElementById('login-card');
const nameInput = document.getElementById('name-input');
const errEl = document.getElementById('login-err');
try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch {}
nameInput.focus();

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim().slice(0, 30);
  if (!name) { errEl.textContent = '名前を入力してください'; nameInput.focus(); return; }
  try { localStorage.setItem(NAME_KEY, name); } catch {}
  loginEl.style.display = 'none';
  document.getElementById('loading')?.classList.remove('hidden');
  const space = new MaldivesSpace();
  window.__maldivesSpace = space;
  space.start();
});
