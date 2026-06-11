import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SEABED_DEPTH = -3;
const SEABED_RADIUS = 400;

// カラフルな熱帯魚の大群（InstancedMeshで1ドローコール描画）
const TROPICAL_COUNT = 600;
const TROPICAL_PALETTE = [
  0xff7f2a, // クマノミのオレンジ
  0xffd23f, // キイロハギの黄
  0x2a9dff, // ナンヨウハギの青
  0xff4f9a, // ピンク
  0x66f08a, // グリーンクロミス
  0xb56bff, // 紫
  0x40e8e0, // シアン
];
const TROPICAL_SCHOOLS = [
  { center: new THREE.Vector3(-5, -0.9, -12), radius: 3.5, speed: 0.7 },
  { center: new THREE.Vector3(14, -1.2, -8), radius: 4.5, speed: 0.55 },
  { center: new THREE.Vector3(17, -0.8, -35), radius: 3.0, speed: 0.8 },
  { center: new THREE.Vector3(-9, -1.5, -32), radius: 5.0, speed: 0.5 },
  { center: new THREE.Vector3(3, -1.0, -52), radius: 4.0, speed: 0.65 },
  { center: new THREE.Vector3(13, -1.4, -60), radius: 3.5, speed: 0.75 },
  { center: new THREE.Vector3(-4, -0.7, -70), radius: 3.0, speed: 0.6 },
  { center: new THREE.Vector3(20, -1.0, -20), radius: 5.5, speed: 0.45 },
];

const FISH_SCHOOLS = [
  { center: new THREE.Vector3(-6, -1.0, -15), radius: 4, count: 12, speed: 0.9 },
  { center: new THREE.Vector3(16, -1.3, -30), radius: 5, count: 10, speed: 0.7 },
  { center: new THREE.Vector3(-8, -1.6, -45), radius: 6, count: 14, speed: 0.8 },
];
const JUMPER_SPOTS = [
  { x: -5, z: -10, period: 7, offset: 0 },
  { x: -7, z: -28, period: 9, offset: 3 },
  { x: 18, z: -20, period: 8, offset: 5.5 },
];
const JUMP_DURATION = 1.4; // 滞空時間(s)
const JUMP_HEIGHT = 1.6;
const GRAVITY_REST_Y = -1.0; // 待機中の水深

const fishMaterial = new THREE.MeshStandardMaterial({
  color: 0x9fc4d8,
  metalness: 0.45,
  roughness: 0.35,
  envMapIntensity: 1.0,
});
const mantaMaterial = new THREE.MeshStandardMaterial({
  color: 0x2c3a42,
  roughness: 0.6,
  envMapIntensity: 0.6,
});
const turtleShellMaterial = new THREE.MeshStandardMaterial({
  color: 0x55683a,
  roughness: 0.7,
  envMapIntensity: 0.5,
});
const turtleSkinMaterial = new THREE.MeshStandardMaterial({
  color: 0x7a8a55,
  roughness: 0.8,
});

// 砂紋と海草・サンゴのパッチを描いた海底テクスチャ（参照画像の浅瀬の模様）
function createSeabedTexture() {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // 浅瀬のターコイズは「水越しに見える砂」が作る色なので、
  // 単純アルファ合成の本実装では海底側に青緑を焼き込む
  ctx.fillStyle = '#6ee8da';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 決定的な擬似乱数（毎回同じ模様）
  let seed = 21;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  // 明るい砂だまり（浅い場所）
  for (let i = 0; i < 40; i += 1) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = 15 + random() * 45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(225,236,200,0.55)');
    g.addColorStop(1, 'rgba(225,236,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 海草・サンゴの暗いパッチ
  for (let i = 0; i < 30; i += 1) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = 8 + random() * 35;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(60,110,95,0.5)');
    g.addColorStop(1, 'rgba(60,110,95,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

// ラグーンの明るい砂の海底（半透明の水越しに見える）
function createSeabed() {
  const seabed = new THREE.Mesh(
    new THREE.CircleGeometry(SEABED_RADIUS, 48),
    new THREE.MeshStandardMaterial({
      map: createSeabedTexture(),
      roughness: 1,
    })
  );
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = SEABED_DEPTH;
  seabed.receiveShadow = true;
  return seabed;
}

// 熱帯魚の大群：紡錘形＋尾びれを1ジオメトリに結合し、
// インスタンシングで全個体を1ドローコールで描く
function createTropicalSchool() {
  const body = new THREE.SphereGeometry(0.055, 7, 5);
  body.scale(0.55, 0.9, 1.8);
  const tail = new THREE.ConeGeometry(0.035, 0.07, 4);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -0.12);
  const geometry = mergeGeometries([body, tail]);

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.15,
    envMapIntensity: 0.8,
  });
  // モバイルWebGL2のUBO上限(16KB)に収まるよう200匹ごとに分割する
  // （1バッチ200×mat4 64B ≒ 12.8KB < 16KB）
  const BATCH = 200;
  const batches = [];
  for (let offset = 0; offset < TROPICAL_COUNT; offset += BATCH) {
    const count = Math.min(BATCH, TROPICAL_COUNT - offset);
    const instanced = new THREE.InstancedMesh(geometry, material, count);
    instanced.frustumCulled = false;
    batches.push(instanced);
  }

  let seed = 5;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  const color = new THREE.Color();
  const members = [];
  for (let i = 0; i < TROPICAL_COUNT; i += 1) {
    const school = TROPICAL_SCHOOLS[i % TROPICAL_SCHOOLS.length];
    members.push({
      school,
      phase: random() * Math.PI * 2,
      radiusJitter: 0.35 + random() * 0.85,
      depthJitter: (random() - 0.5) * 0.7,
      bobPhase: random() * Math.PI * 2,
      scale: 0.6 + random() * 0.7,
      direction: i % 2 === 0 ? 1 : -1, // 群れ内で時計/反時計が混ざる
      batch: batches[Math.floor(i / BATCH)],
      slot: i % BATCH,
    });
    color.set(TROPICAL_PALETTE[i % TROPICAL_PALETTE.length]);
    // 個体ごとにわずかな色ムラ
    color.offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.1);
    members[i].batch.setColorAt(members[i].slot, color);
  }
  for (const b of batches) b.instanceColor.needsUpdate = true;

  return { batches, members };
}

// 捕食者の魚（体長・色指定、背びれ付き）
function createPredatorFish(length, color, finColor) {
  const fish = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.25,
    envMapIntensity: 1.0,
  });
  const finMaterial = new THREE.MeshStandardMaterial({
    color: finColor,
    roughness: 0.5,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(length * 0.16, 12, 9), material);
  body.scale.set(0.55, 0.8, 3.1);
  fish.add(body);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(length * 0.13, length * 0.22, 5),
    finMaterial
  );
  tail.rotation.x = Math.PI / 2;
  tail.scale.x = 0.3;
  tail.position.z = -length * 0.55;
  fish.add(tail);

  const dorsal = new THREE.Mesh(
    new THREE.ConeGeometry(length * 0.09, length * 0.18, 4),
    finMaterial
  );
  dorsal.scale.z = 0.35;
  dorsal.position.set(0, length * 0.14, length * 0.05);
  fish.add(dorsal);

  return fish;
}

// 捕食の瞬間の水しぶき
function createSplashPuff() {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    SIZE / 2, SIZE / 2, 0,
    SIZE / 2, SIZE / 2, SIZE / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.5, 'rgba(235,250,248,0.4)');
  gradient.addColorStop(1, 'rgba(235,250,248,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  sprite.scale.setScalar(0.1);
  return sprite;
}

// 小魚（紡錘形の胴体＋尾びれ）
function createFish() {
  const fish = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fishMaterial);
  body.scale.set(0.6, 0.7, 1.8);
  fish.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), fishMaterial);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.26;
  fish.add(tail);
  return fish;
}

function createMantaRay() {
  const manta = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), mantaMaterial);
  body.scale.set(0.7, 0.22, 1.1);
  manta.add(body);

  // 三角の翼（フラップ回転の軸を体側に置く）
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.7);
  wingShape.lineTo(1.7, -0.1);
  wingShape.lineTo(0, 0.7);
  wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.07,
    bevelEnabled: false,
  });
  wingGeometry.rotateX(-Math.PI / 2);

  const leftWing = new THREE.Mesh(wingGeometry, mantaMaterial);
  leftWing.position.x = 0.3;
  manta.add(leftWing);
  const rightWing = new THREE.Mesh(wingGeometry, mantaMaterial);
  rightWing.scale.x = -1;
  rightWing.position.x = -0.3;
  manta.add(rightWing);

  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.005, 1.6, 6),
    mantaMaterial
  );
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -1.6;
  manta.add(tail);

  manta.userData.wings = { left: leftWing, right: rightWing };
  return manta;
}

function createTurtle() {
  const turtle = new THREE.Group();

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), turtleShellMaterial);
  shell.scale.set(0.8, 0.4, 1.0);
  turtle.add(shell);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), turtleSkinMaterial);
  head.position.set(0, 0.02, 0.6);
  turtle.add(head);

  const flippers = [];
  for (const [sx, sz, isFront] of [
    [0.42, 0.3, true],
    [-0.42, 0.3, true],
    [0.36, -0.35, false],
    [-0.36, -0.35, false],
  ]) {
    const flipper = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      turtleSkinMaterial
    );
    flipper.scale.set(isFront ? 1.6 : 1.0, 0.18, 0.55);
    flipper.position.set(sx, -0.05, sz);
    turtle.add(flipper);
    if (isFront) flippers.push(flipper);
  }
  turtle.userData.frontFlippers = flippers;
  return turtle;
}

/**
 * ラグーンの海洋生物（魚群・跳ねる魚・マンタ・ウミガメ）と
 * 砂の海底を生成する。update(time) で全員を泳がせる。
 */
export function createMarineLife(scene) {
  scene.add(createSeabed());

  // 魚群：各個体は群れの中心を周回しつつ位相差で散らばる
  const schoolFish = [];
  for (const school of FISH_SCHOOLS) {
    for (let i = 0; i < school.count; i += 1) {
      const fish = createFish();
      fish.userData.school = school;
      fish.userData.phase = (i / school.count) * Math.PI * 2;
      fish.userData.radiusJitter = 0.6 + (i % 5) * 0.18;
      fish.userData.depthJitter = ((i % 4) - 1.5) * 0.18;
      scene.add(fish);
      schoolFish.push(fish);
    }
  }

  // 跳ねる魚
  const jumpers = JUMPER_SPOTS.map((spot) => {
    const fish = createFish();
    fish.scale.setScalar(1.6);
    fish.position.set(spot.x, GRAVITY_REST_Y, spot.z);
    fish.userData.spot = spot;
    scene.add(fish);
    return fish;
  });

  const manta = createMantaRay();
  scene.add(manta);

  const turtle = createTurtle();
  scene.add(turtle);

  // カラフルな熱帯魚の大群
  const tropical = createTropicalSchool();
  for (const batch of tropical.batches) scene.add(batch);
  const tropicalDummy = new THREE.Object3D();

  // --- 食物連鎖：中型魚（小魚を捕食）と大型魚（中型魚を捕食） ---
  const mediumFish = createPredatorFish(0.7, 0x5a7a8c, 0x3a525e);
  mediumFish.position.set(8, -1.2, -20);
  scene.add(mediumFish);
  const largeFish = createPredatorFish(1.9, 0x39444c, 0x242c32);
  largeFish.position.set(-10, -1.8, -40);
  scene.add(largeFish);

  const splashPuffs = [createSplashPuff(), createSplashPuff()];
  for (const puff of splashPuffs) scene.add(puff);

  const chain = {
    medium: {
      mesh: mediumFish,
      velocity: new THREE.Vector3(1, 0, 0),
      mode: 'patrol', // patrol | chase | flee | dead
      targetIndex: -1,
      modeUntil: 0,
      deadUntil: 0,
      orbit: { center: new THREE.Vector3(8, -1.2, -25), radius: 9, phase: 1.1 },
    },
    large: {
      mesh: largeFish,
      velocity: new THREE.Vector3(1, 0, 0),
      mode: 'patrol',
      nextHuntAt: 14,
      modeUntil: 0,
      orbit: { center: new THREE.Vector3(4, -1.9, -35), radius: 16, phase: 4.2 },
    },
    puffs: [],
    lastTime: 0,
  };

  function showPuff(position, scale) {
    const puff = splashPuffs[chain.puffs.length % splashPuffs.length];
    puff.position.copy(position);
    chain.puffs.push({ puff, start: chain.lastTime, scale });
  }

  // 有機的な回遊位置：半径と速度が揺らぎ、群れの中心も漂流し、
  // 個体は小さく蛇行する（機械的な等速円運動を避ける）
  function swimPosition(out, center, baseRadius, speed, direction, phase, time) {
    // 群れの中心の漂流
    const driftX = Math.sin(time * 0.05 + phase * 0.7) * 2.2;
    const driftZ = Math.cos(time * 0.04 + phase * 1.3) * 2.2;
    // 角速度の揺らぎ（進んだり緩んだり）
    const angle =
      direction * (time * speed + 0.6 * Math.sin(time * 0.33 + phase * 1.7)) +
      phase;
    // 半径の伸縮
    const radius = baseRadius * (1 + 0.22 * Math.sin(time * 0.21 + phase * 2.3));
    // 個体の小さな蛇行（エピサイクル）
    const wanderX = 0.3 * Math.sin(time * 1.1 + phase * 3.1);
    const wanderZ = 0.3 * Math.cos(time * 0.9 + phase * 4.7);
    out.set(
      center.x + driftX + Math.cos(angle) * radius + wanderX,
      center.y + 0.18 * Math.sin(time * 0.4 + phase * 5.3),
      center.z + driftZ + Math.sin(angle) * radius + wanderZ
    );
    return out;
  }

  const posNow = new THREE.Vector3();
  const posAhead = new THREE.Vector3();
  const HEADING_LOOKAHEAD = 0.25; // 進行方向サンプリングの先読み秒数

  function updateSchools(time) {
    for (const fish of schoolFish) {
      const { school, phase, radiusJitter, depthJitter } = fish.userData;
      const radius = school.radius * radiusJitter;
      swimPosition(posNow, school.center, radius, school.speed, 1, phase, time);
      swimPosition(
        posAhead, school.center, radius, school.speed, 1, phase,
        time + HEADING_LOOKAHEAD
      );
      posNow.y += depthJitter + Math.sin(time * 2 + phase) * 0.1;
      posAhead.y = posNow.y;
      fish.position.copy(posNow);
      fish.lookAt(posAhead); // 実際の進行方向を向く
    }
  }

  // 水面下から頭を上にして飛び出し、放物線の頂点を越えたら
  // 頭を下げて水面に刺さるように潜る
  function jumpPosition(spot, progress) {
    const ARC_BASE_Y = -0.7; // 出発・着水とも水面下
    return new THREE.Vector3(
      spot.x + progress * 2.4 - 1.2,
      ARC_BASE_Y + 4 * (JUMP_HEIGHT - ARC_BASE_Y) * progress * (1 - progress),
      spot.z
    );
  }

  function updateJumpers(time) {
    for (const fish of jumpers) {
      const { spot } = fish.userData;
      const t = (time + spot.offset) % spot.period;
      if (t < JUMP_DURATION) {
        const progress = t / JUMP_DURATION;
        const position = jumpPosition(spot, progress);
        const ahead = jumpPosition(spot, progress + 0.02);
        fish.position.copy(position);
        fish.lookAt(ahead); // 頭(+z)が常に進行方向＝接線を向く
      } else {
        fish.position.set(spot.x - 1.2, GRAVITY_REST_Y, spot.z);
        fish.rotation.set(0, Math.PI / 2, 0);
      }
    }
  }

  // 熱帯魚i匹目の現在位置（捕食者の追跡にも使う）
  function tropicalPosition(m, time, out) {
    const radius = m.school.radius * m.radiusJitter;
    swimPosition(out, m.school.center, radius, m.school.speed, m.direction, m.phase, time);
    out.y += m.depthJitter + Math.sin(time * 2.2 + m.bobPhase) * 0.08;
    return out;
  }

  const FLEE_RADIUS = 2.4; // 捕食者からこの距離内の小魚は散開
  const scatterVec = new THREE.Vector3();

  function updateTropical(time) {
    const { batches, members } = tropical;
    const predatorPosition = chain.medium.mesh.position;
    const predatorHunting = chain.medium.mode !== 'dead';
    for (let i = 0; i < members.length; i += 1) {
      const m = members[i];
      // 食べられた個体は非表示にし、時間が経つと群れに補充される
      if (m.eaten) {
        if (time > m.respawnAt) m.eaten = false;
        else {
          tropicalDummy.position.set(0, -50, 0);
          tropicalDummy.scale.setScalar(0.001);
          tropicalDummy.updateMatrix();
          m.batch.setMatrixAt(m.slot, tropicalDummy.matrix);
          continue;
        }
      }
      tropicalPosition(m, time, posNow);
      tropicalPosition(m, time + HEADING_LOOKAHEAD, posAhead);

      // 捕食者が近いと反対方向へ散開して逃げる
      if (predatorHunting) {
        scatterVec.subVectors(posNow, predatorPosition);
        const dist = scatterVec.length();
        if (dist < FLEE_RADIUS && dist > 0.001) {
          scatterVec.normalize().multiplyScalar((FLEE_RADIUS - dist) * 1.4);
          scatterVec.y *= 0.3;
          posNow.add(scatterVec);
          posAhead.add(scatterVec).add(scatterVec); // 逃げる向きに頭を向ける
        }
      }

      tropicalDummy.position.copy(posNow);
      tropicalDummy.lookAt(posAhead); // 進行方向（揺らぎ込み）を向く
      tropicalDummy.scale.setScalar(m.scale);
      tropicalDummy.updateMatrix();
      m.batch.setMatrixAt(m.slot, tropicalDummy.matrix);
    }
    for (const b of batches) b.instanceMatrix.needsUpdate = true;
  }

  // --- 食物連鎖のAI ---
  const steerTarget = new THREE.Vector3();
  const preyPosition = new THREE.Vector3(); // 捕食判定用（steerTargetは視線計算で上書きされる）
  const desiredVelocity = new THREE.Vector3();

  // 速度ベクトルを目標方向へ滑らかに旋回させて前進する
  function steer(actor, target, speed, turnRate, delta) {
    desiredVelocity.subVectors(target, actor.mesh.position);
    if (desiredVelocity.lengthSq() > 0.0001) {
      desiredVelocity.normalize().multiplyScalar(speed);
      actor.velocity.lerp(desiredVelocity, Math.min(1, turnRate * delta));
    }
    actor.mesh.position.addScaledVector(actor.velocity, delta);
    // 水面下に保つ
    actor.mesh.position.y = Math.min(-0.4, Math.max(-2.6, actor.mesh.position.y));
    steerTarget.copy(actor.mesh.position).add(actor.velocity);
    actor.mesh.lookAt(steerTarget);
  }

  function updateFoodChain(time, delta) {
    const medium = chain.medium;
    const large = chain.large;
    const members = tropical.members;

    // === 中型魚：小魚を追い回して食べる ===
    if (medium.mode === 'dead') {
      if (time > medium.deadUntil) {
        // 別の群れの近くに新しい個体が現れる
        const school = TROPICAL_SCHOOLS[Math.floor(time) % TROPICAL_SCHOOLS.length];
        medium.mesh.position.set(school.center.x + 6, -1.2, school.center.z + 6);
        medium.mesh.visible = true;
        medium.mode = 'patrol';
        medium.modeUntil = time + 4;
      }
    } else if (medium.mode === 'flee') {
      // 大型魚から全力で逃げる（それでも大型魚の方が速い）
      steerTarget
        .subVectors(medium.mesh.position, large.mesh.position)
        .normalize()
        .multiplyScalar(8)
        .add(medium.mesh.position);
      steer(medium, steerTarget, 3.2, 2.2, delta);
    } else if (medium.mode === 'chase') {
      const prey = members[medium.targetIndex];
      if (!prey || prey.eaten || time > medium.modeUntil) {
        medium.mode = 'patrol';
        medium.modeUntil = time + 5;
      } else {
        tropicalPosition(prey, time, preyPosition);
        steer(medium, preyPosition, 3.4, 3.0, delta);
        if (medium.mesh.position.distanceTo(preyPosition) < 0.45) {
          prey.eaten = true; // 捕食！
          prey.respawnAt = time + 20;
          showPuff(preyPosition, 0.8);
          medium.mode = 'patrol';
          medium.modeUntil = time + 6; // 満腹のクールダウン
        }
      }
    } else {
      // 巡回：自分の縄張りをゆったり泳ぐ
      swimPosition(
        steerTarget, medium.orbit.center, medium.orbit.radius,
        0.25, 1, medium.orbit.phase, time + 1.2
      );
      steer(medium, steerTarget, 1.3, 1.5, delta);
      if (time > medium.modeUntil) {
        // 近くの群れから獲物を選んで追跡開始
        let best = -1;
        let bestDist = 14;
        for (let i = 0; i < members.length; i += 7) {
          if (members[i].eaten) continue;
          tropicalPosition(members[i], time, posNow);
          const d = medium.mesh.position.distanceTo(posNow);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        if (best >= 0) {
          medium.targetIndex = best;
          medium.mode = 'chase';
          medium.modeUntil = time + 7;
        } else {
          medium.modeUntil = time + 3;
        }
      }
    }

    // === 大型魚：中型魚を追い回して食べる ===
    if (large.mode === 'chase') {
      preyPosition.copy(medium.mesh.position);
      steer(large, preyPosition, 5.2, 2.6, delta);
      const caught =
        medium.mode !== 'dead' &&
        large.mesh.position.distanceTo(preyPosition) < 1.0;
      if (caught) {
        showPuff(preyPosition, 1.6);
        medium.mesh.visible = false; // 捕食！
        medium.mode = 'dead';
        medium.deadUntil = time + 9;
        large.mode = 'patrol';
        large.nextHuntAt = time + 24;
      } else if (time > large.modeUntil || medium.mode === 'dead') {
        large.mode = 'patrol'; // 逃げ切られた
        large.nextHuntAt = time + 12;
        if (medium.mode === 'flee') medium.mode = 'patrol';
      }
    } else {
      swimPosition(
        steerTarget, large.orbit.center, large.orbit.radius,
        0.18, 1, large.orbit.phase, time + 1.5
      );
      steer(large, steerTarget, 1.6, 1.2, delta);
      // 中型魚が射程(20m)に入ったタイミングで狩りを開始する
      if (
        time > large.nextHuntAt &&
        medium.mode !== 'dead' &&
        large.mesh.position.distanceTo(medium.mesh.position) < 20
      ) {
        large.mode = 'chase';
        large.modeUntil = time + 14;
        medium.mode = 'flee'; // 狙われた中型魚は逃走に切り替え
      }
    }

    // 捕食の水しぶき（広がって消える）
    for (let i = chain.puffs.length - 1; i >= 0; i -= 1) {
      const entry = chain.puffs[i];
      const age = time - entry.start;
      if (age > 0.7) {
        entry.puff.material.opacity = 0;
        chain.puffs.splice(i, 1);
      } else {
        entry.puff.scale.setScalar(entry.scale * (0.3 + age * 2.2));
        entry.puff.material.opacity = 0.85 * (1 - age / 0.7);
      }
    }
  }

  const MANTA_CENTER = new THREE.Vector3(0, -1.9, -15);
  const TURTLE_CENTER = new THREE.Vector3(-4, -1.3, -24);

  function updateManta(time) {
    swimPosition(posNow, MANTA_CENTER, 16, 0.16, 1, 0.8, time);
    swimPosition(posAhead, MANTA_CENTER, 16, 0.16, 1, 0.8, time + 0.6);
    posNow.y += Math.sin(time * 0.5) * 0.3;
    posAhead.y += Math.sin((time + 0.6) * 0.5) * 0.3;
    manta.position.copy(posNow);
    manta.lookAt(posAhead);
    manta.rotateZ(0.16 + 0.08 * Math.sin(time * 0.4)); // 揺らぐバンク
    const flap = Math.sin(time * 1.8) * 0.45;
    manta.userData.wings.left.rotation.z = flap;
    manta.userData.wings.right.rotation.z = -flap;
  }

  function updateTurtle(time) {
    swimPosition(posNow, TURTLE_CENTER, 7, 0.1, -1, 2.4, time);
    swimPosition(posAhead, TURTLE_CENTER, 7, 0.1, -1, 2.4, time + 0.8);
    posNow.y += Math.sin(time * 0.7) * 0.2;
    posAhead.y += Math.sin((time + 0.8) * 0.7) * 0.2;
    turtle.position.copy(posNow);
    turtle.lookAt(posAhead);
    // 前ヒレのひと掻きに合わせて推進が脈打つようなピッチ
    turtle.rotateX(0.06 * Math.sin(time * 2.5));
    const paddle = Math.sin(time * 2.5) * 0.4;
    for (const flipper of turtle.userData.frontFlippers) {
      flipper.rotation.z = paddle;
    }
  }

  function update(time) {
    const delta = Math.min(0.1, time - chain.lastTime);
    chain.lastTime = time;
    updateSchools(time);
    updateJumpers(time);
    updateTropical(time);
    updateFoodChain(time, delta);
    updateManta(time);
    updateTurtle(time);
  }

  return { update, mediumFish, largeFish, tropical };
}
