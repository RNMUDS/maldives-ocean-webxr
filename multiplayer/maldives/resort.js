// resort.js — モルディブ水上ヴィラリゾートの統括（配置と毎フレーム更新）。
// 実体は villa.js / walkway.js / island.js / resort-shared.js に分割。
import { DECK_HEIGHT, LOWER_DECK_TOP } from './resort-shared.js';
import { createVilla, DECK_W, DECK_D } from './villa.js';
import { updatePools } from './pool.js';
import { createWalkway, createLampPost, updateLamps } from './walkway.js';
import { createIsland } from './island.js';

export { DECK_HEIGHT };

// レイアウト（参照画像準拠：桟橋の片側にヴィラが一列に並ぶ）
const JETTY_LENGTH = 110;
const JETTY_START_Z = 8;
const JETTY_WIDTH = 2.4;
const VILLA_COUNT = 6;
const VILLA_SPACING = 13;
const VILLA_FIRST_Z = -6;
const VILLA_CENTER_X = 8.2; // 桟橋中心からヴィラ中心まで
const BRANCH_WIDTH = 1.6;
const LAMP_SPACING = 8;

/**
 * 参照画像準拠のモルディブ水上ヴィラリゾート。
 * 桟橋の片側(+x)に大型ヴィラ6棟が一列に並び、
 * 桟橋の先には白砂と椰子の島。
 */
// マルチプレイ版の足場判定（_groundY）用に主要寸法を公開する
export const LAYOUT = {
  JETTY_LENGTH,
  JETTY_START_Z,
  JETTY_WIDTH,
  VILLA_COUNT,
  VILLA_SPACING,
  VILLA_FIRST_Z,
  VILLA_CENTER_X,
  BRANCH_WIDTH,
  DECK_W,
  DECK_D,
  LOWER_DECK_TOP,
};

export function createResort(scene) {
  const lampPosts = [];

  const jetty = createWalkway(JETTY_LENGTH, JETTY_WIDTH);
  jetty.position.z = JETTY_START_Z - JETTY_LENGTH / 2;
  scene.add(jetty);

  // 接続通路：桟橋の縁からヴィラデッキの縁まで隙間なく
  const branchStart = JETTY_WIDTH / 2;
  const branchEnd = VILLA_CENTER_X - DECK_D / 2; // ヴィラの+z面（回転後は±x）
  const branchLength = branchEnd - branchStart;

  for (let i = 0; i < VILLA_COUNT; i += 1) {
    const z = VILLA_FIRST_Z - i * VILLA_SPACING;

    const branch = createWalkway(branchLength, BRANCH_WIDTH);
    branch.rotation.y = Math.PI / 2;
    branch.position.set(branchStart + branchLength / 2, 0, z);
    scene.add(branch);

    // 入口(+z)が桟橋(-x方向)を向くよう -90° 回転
    const villa = createVilla({ glassFloor: i === 0 });
    villa.rotation.y = -Math.PI / 2;
    villa.position.set(VILLA_CENTER_X, 0, z);
    scene.add(villa);
  }

  const lampCount = Math.floor(JETTY_LENGTH / LAMP_SPACING);
  for (let i = 0; i <= lampCount; i += 1) {
    const lampPost = createLampPost({ withLight: i % 3 === 0 });
    const side = i % 2 === 0 ? 1 : -1;
    lampPost.position.set(
      side * (JETTY_WIDTH / 2 - 0.18),
      DECK_HEIGHT,
      JETTY_START_Z - i * LAMP_SPACING
    );
    scene.add(lampPost);
    lampPosts.push(lampPost);
  }

  // 桟橋の終点につながる島＋遠景の島
  const mainIsland = createIsland(2.2);
  mainIsland.position.set(-8, 0, JETTY_START_Z - JETTY_LENGTH - 28);
  scene.add(mainIsland);
  const farIsland = createIsland(1.4);
  farIsland.position.set(170, 0, -180);
  scene.add(farIsland);
  function update(time) {
    updateLamps(lampPosts, time);
    updatePools(time);
  }

  return { update, deckHeight: DECK_HEIGHT };
}
