// 바다 파도 높이 — game.ocean.waveAt 의 정본(순수 함수, three 없이).
// 식은 vehicles 가 ocean 이 없을 때 쓰는 잔물결(vehicles.ts ripple, 옛 waveY)과 한 글자도 다르지 않게 맞춘다.
// 그래야 ocean 이 늦게 붙거나 떨어져도 배·부표가 덜컥 튀지 않는다. 폭풍이면 env.waveMul(2) 만큼 출렁임만 커진다.

/** 두 사인 물결의 진폭·평균 높이(m) */
export const WAVE = { a1: 0.08, a2: 0.06, offset: -0.02 } as const;

/** 출렁임만(평균 0) — 진폭 배율이 곱해지는 부분 */
export function waveSwell(x: number, z: number, t: number): number {
  return WAVE.a1 * Math.sin(x * 0.23 + z * 0.11 + t * 0.9) + WAVE.a2 * Math.sin(-x * 0.13 + z * 0.29 + t * 1.25);
}

/** 이상한 배율(NaN·음수·무한)은 1 로 */
export const safeMul = (mul: unknown): number =>
  typeof mul === 'number' && Number.isFinite(mul) && mul >= 0 ? mul : 1;

/**
 * 바다 수면 높이. mul = env.waveMul(평소 1, 폭풍 2).
 * mul 이 1 이면 vehicles 의 ripple(x, z, t) 와 똑같다.
 */
export function waveAt(x: number, z: number, t: number, mul = 1): number {
  return safeMul(mul) * waveSwell(x, z, t) + WAVE.offset;
}
