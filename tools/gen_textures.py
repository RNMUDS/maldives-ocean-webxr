#!/usr/bin/env python3
"""ヴィラ用のシームレスPBRテクスチャ生成（藁葺き屋根・白漆喰壁）。

カラー・法線・粗さの3マップを textures/ に出力する。
全マップはタイル可能（上下左右ラップ）。
"""

import numpy as np
from PIL import Image

SIZE = 1024
RNG = np.random.default_rng(42)
OUT_DIR = "textures"


def save(name, array):
    """0..1 float配列をPNG保存する。"""
    img = Image.fromarray((np.clip(array, 0, 1) * 255).astype(np.uint8))
    img.save(f"{OUT_DIR}/{name}.png")
    print(f"saved {OUT_DIR}/{name}.png")


def normal_from_height(height, strength=2.0):
    """ハイトマップからタイル可能な法線マップ(GL向き)を作る。"""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nz = np.ones_like(height)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    normal = np.stack(
        [(-dx / length + 1) / 2, (dy / length + 1) / 2, (nz / length + 1) / 2],
        axis=-1,
    )
    return normal


def tileable_noise(size, grid, rng):
    """ラップするバイリニア値ノイズ。"""
    coarse = rng.random((grid, grid))
    coarse = np.pad(coarse, ((0, 1), (0, 1)), mode="wrap")
    xs = np.linspace(0, grid, size, endpoint=False)
    x0 = xs.astype(int)
    fx = xs - x0
    fx = fx * fx * (3 - 2 * fx)  # smoothstep
    out = np.zeros((size, size))
    for i in range(size):
        y0 = x0[i]
        fy = fx[i]
        row0 = coarse[y0, x0] * (1 - fx) + coarse[y0, x0 + 1] * fx
        row1 = coarse[y0 + 1, x0] * (1 - fx) + coarse[y0 + 1, x0 + 1] * fx
        out[i] = row0 * (1 - fy) + row1 * fy
    return out


def fractal_noise(size, octaves, rng, base_grid=4):
    total = np.zeros((size, size))
    amplitude = 1.0
    amp_sum = 0.0
    for o in range(octaves):
        total += tileable_noise(size, base_grid * (2**o), rng) * amplitude
        amp_sum += amplitude
        amplitude *= 0.55
    return total / amp_sum


# ---------------------------------------------------------------- 藁葺き屋根
def generate_thatch():
    height = np.zeros((SIZE, SIZE))

    ROW_PITCH = 170  # 藁束の段の間隔(px)
    STRAND_LEN = 300  # 藁1本の長さ(px)
    STRANDS_PER_ROW = 2600

    rows = list(range(-1, SIZE // ROW_PITCH + 1))
    for row in rows:
        base_y = row * ROW_PITCH
        for _ in range(STRANDS_PER_ROW):
            x = RNG.uniform(0, SIZE)
            y0 = base_y + RNG.uniform(-12, 12)
            length = STRAND_LEN * RNG.uniform(0.75, 1.1)
            drift = RNG.uniform(-14, 14)  # 下端までの横ずれ
            bend = RNG.uniform(-6, 6)
            brightness = RNG.uniform(0.35, 1.0)
            width = RNG.integers(1, 3)

            steps = int(length)
            t = np.linspace(0, 1, steps)
            xs = (x + drift * t + bend * t * t).astype(int) % SIZE
            ys = (y0 + length * t).astype(int) % SIZE
            taper = brightness * (1 - 0.45 * t)  # 先端ほど暗く
            for w in range(width):
                height[ys, (xs + w) % SIZE] = np.maximum(
                    height[ys, (xs + w) % SIZE], taper
                )

    # 段ごとの影（束の重なりの下端は暗く落ちる）
    yy = np.arange(SIZE)
    row_phase = (yy % ROW_PITCH) / ROW_PITCH
    row_shade = 0.55 + 0.45 * np.clip(row_phase * 2.2, 0, 1)
    height *= row_shade[:, None]

    # 微細ノイズで束のムラ
    height = np.clip(height * (0.85 + 0.3 * fractal_noise(SIZE, 4, RNG)), 0, 1)

    # カラー：灰褐色の藁パレット（明るさ＝高さ）
    base = np.array([0.67, 0.55, 0.40])  # うすい茶色（暖色寄り）
    dark = np.array([0.26, 0.20, 0.13])
    hue_var = fractal_noise(SIZE, 5, RNG)[..., None] * np.array([0.08, 0.05, -0.03])
    diffuse = dark + (base - dark) * height[..., None] + hue_var
    save("thatch_diff", diffuse)

    save("thatch_normal", normal_from_height(height, strength=3.0))

    roughness = 0.82 + 0.15 * (1 - height) + 0.05 * fractal_noise(SIZE, 4, RNG)
    save("thatch_rough", np.repeat(roughness[..., None], 3, axis=2))


# ---------------------------------------------------------------- 白漆喰壁
def generate_plaster():
    # コテむら：大きめの起伏＋細かいザラつき
    height = fractal_noise(SIZE, 6, RNG)
    trowel = tileable_noise(SIZE, 6, RNG)  # コテの大きなうねり
    height = height * 0.6 + trowel * 0.4

    # まれな小さな欠け・粒
    speckles = RNG.random((SIZE, SIZE)) > 0.9985
    height = np.clip(height - speckles * RNG.uniform(0.25, 0.5), 0, 1)

    # カラー：暖色の白。うねりでわずかに明暗、薄いシミ
    base = np.array([0.93, 0.90, 0.84])
    stains = fractal_noise(SIZE, 3, RNG)
    stain_tint = (stains[..., None] - 0.5) * np.array([0.08, 0.08, 0.1])
    shade = (0.94 + 0.06 * height)[..., None]
    diffuse = base * shade + stain_tint
    diffuse[speckles] *= 0.55
    save("plaster_diff", diffuse)

    save("plaster_normal", normal_from_height(height, strength=1.4))

    roughness = 0.62 + 0.2 * (1 - height) + 0.08 * fractal_noise(SIZE, 4, RNG)
    save("plaster_rough", np.repeat(roughness[..., None], 3, axis=2))


# ---------------------------------------------------------------- 白塗装の板壁
def generate_whitewood():
    """縦張りのホワイトウッド（白ペンキの板壁）。

    横張りとして計算し、最後に転置して縦張りにする。
    """
    PLANKS = 8  # 1タイルあたりの板数
    plank_h = SIZE // PLANKS
    yy = np.arange(SIZE)
    plank_idx = (yy // plank_h) % PLANKS
    phase = yy % plank_h

    # 木目：ノイズを板の長手方向に引き伸ばして筋にする
    raw = fractal_noise(SIZE, 6, RNG)
    KERNEL = 41
    kernel = np.ones(KERNEL) / KERNEL
    grain = np.empty_like(raw)
    for i in range(SIZE):
        wrapped = np.concatenate([raw[i, -KERNEL:], raw[i], raw[i, :KERNEL]])
        grain[i] = np.convolve(wrapped, kernel, mode="same")[KERNEL:-KERNEL]

    # 板ごとの微妙な塗装トーン差
    tones = RNG.uniform(-0.04, 0.04, PLANKS)
    tone_map = tones[plank_idx][:, None]

    # 目地（板の継ぎ目のV溝）
    groove = np.clip(1 - np.minimum(phase, plank_h - phase) / 3.0, 0, 1)[:, None]

    height = np.clip(0.55 + (grain - 0.5) * 0.35 + tone_map - groove * 0.5, 0, 1)

    # カラー：暖色の白ペンキ。木目がうっすら透け、目地は暗く落ちる
    base = np.array([0.92, 0.90, 0.86])
    shade = (0.93 + 0.07 * grain + tone_map)[..., None]
    diffuse = base * shade
    diffuse *= 1 - groove[..., None] * 0.35

    roughness = np.clip(0.55 + 0.18 * (1 - grain) + groove * 0.2, 0, 1)

    # 縦張りへ転置（法線は転置後の高さから再計算）
    height = height.T
    diffuse = np.transpose(diffuse, (1, 0, 2))
    roughness = roughness.T

    save("whitewood_diff", np.clip(diffuse, 0, 1))
    save("whitewood_normal", normal_from_height(height, strength=1.8))
    save("whitewood_rough", np.repeat(roughness[..., None], 3, axis=2))


# ---------------------------------------------------------------- コンクリート
def generate_concrete():
    # 基本のムラ：細かい骨材ノイズ＋大きな打ちムラ
    fine = fractal_noise(SIZE, 7, RNG)
    broad = tileable_noise(SIZE, 5, RNG)
    height = fine * 0.45 + broad * 0.55

    # 気泡の小穴（コンクリート特有のポックリした凹み）
    pores = np.zeros((SIZE, SIZE))
    n_pores = 900
    ys = RNG.integers(0, SIZE, n_pores)
    xs = RNG.integers(0, SIZE, n_pores)
    radii = RNG.integers(1, 5, n_pores)
    for x, y, r in zip(xs, ys, radii):
        yy, xx = np.ogrid[-r : r + 1, -r : r + 1]
        mask = yy * yy + xx * xx <= r * r
        py = (np.arange(y - r, y + r + 1) % SIZE)[:, None]
        px = (np.arange(x - r, x + r + 1) % SIZE)[None, :]
        pores[py * 0 + py, px] = np.maximum(pores[py, px], mask * RNG.uniform(0.4, 1.0))
    height = np.clip(height - pores * 0.35, 0, 1)

    # 縦の水垂れ跡（うっすら）
    streak_seed = tileable_noise(SIZE, 24, RNG)[0]  # 1行をx方向の種に
    streaks = np.tile(streak_seed, (SIZE, 1))
    streak_fade = fractal_noise(SIZE, 3, RNG)
    streak_mix = (streaks - 0.5) * 0.06 * (0.5 + streak_fade)

    # 型枠の水平継ぎ目（2本）
    seams = np.zeros((SIZE, SIZE))
    for sy in (SIZE // 3, SIZE * 2 // 3):
        seams[sy - 1 : sy + 2, :] = 0.5
    height = np.clip(height - seams * 0.25, 0, 1)

    # カラー：中明度の打ち放しグレー
    base = np.array([0.66, 0.65, 0.62])
    shade = (0.82 + 0.18 * height)[..., None]
    diffuse = base * shade + streak_mix[..., None] * np.array([1.0, 1.0, 1.05])
    diffuse -= (pores * 0.18)[..., None]
    diffuse -= (seams * 0.1)[..., None]
    save("concrete_diff", np.clip(diffuse, 0, 1))

    save("concrete_normal", normal_from_height(height, strength=1.6))

    roughness = 0.68 + 0.18 * (1 - height) + 0.06 * fractal_noise(SIZE, 4, RNG)
    save("concrete_rough", np.repeat(np.clip(roughness, 0, 1)[..., None], 3, axis=2))


if __name__ == "__main__":
    import os

    os.makedirs(OUT_DIR, exist_ok=True)
    generate_thatch()
    generate_plaster()
    generate_whitewood()
    generate_concrete()
