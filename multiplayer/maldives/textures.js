import * as THREE from 'three';

const TEXTURE_BASE =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/';
const ANISOTROPY = 8; // 斜めから見た床板のボケを防ぐ

const loader = new THREE.TextureLoader();

/**
 * CDNからテクスチャを読み込む共通ヘルパー。
 * 失敗してもマテリアルの単色で描画が継続できるようエラーは記録のみ。
 */
export function loadTexture(file, { repeat = [1, 1], srgb = false } = {}) {
  // http(s)はそのまま、'textures/'はローカル生成テクスチャ、それ以外はCDN
  const isLocal = file.startsWith('textures/') || file.startsWith('./');
  const url = file.startsWith('http') || isLocal ? file : TEXTURE_BASE + file;
  const texture = loader.load(url, undefined, undefined, (error) => {
    console.error(`テクスチャの読み込みに失敗しました: ${file}`, error);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = ANISOTROPY;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * tools/gen_textures.py で生成したローカルPBRテクスチャ一式
 * （カラー・法線・粗さ）を読み込む。
 */
export function loadGeneratedPBRSet(name, { repeat = [1, 1] } = {}) {
  return {
    map: loadTexture(`textures/${name}_diff.png`, { repeat, srgb: true }),
    normalMap: loadTexture(`textures/${name}_normal.png`, { repeat }),
    roughnessMap: loadTexture(`textures/${name}_rough.png`, { repeat }),
  };
}
