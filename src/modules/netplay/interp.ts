// 친구 자세 보간 — 10Hz 로 오는 pose 를 조금(DELAY) 늦게 재생해 사이를 부드럽게 잇는다. 순수(three 없음).
// 시계 맞추기: 보낸 쪽 시계(ts) − 받은 시각 의 "가장 큰 값"(= 가장 덜 늦게 온 쪽지)을 시계 차로 본다.
// 이 값은 천천히만 줄어들게(OFFSET_DECAY) 해서 한 번 늦은 쪽지에 흔들리지 않는다.
// 재생 시각 = 지금 + 시계 차 − DELAY. 버퍼 끝을 넘으면 EXTRAP 만큼만 앞으로 밀고 멈춘다. 멀리 순간이동(SNAP)하면 끊어서 바로 옮긴다.

export interface PoseSample {
  /** 보낸 쪽 시각(ms) */
  ts: number;
  x: number; y: number; z: number;
  yaw: number;
  m: string;
  a: string | null;
  w: string;
  s: number;
}
export interface PoseOut extends PoseSample {
  /** 지난 재생 이후 실제 이동 속도(m/s, 걷기 애니메이션용) */
  speed: number;
  /** 버퍼 끝을 넘어 앞으로 민 중인가 */
  extrapolating: boolean;
}

/** 재생 지연(ms) — 10Hz 쪽지 1.5장 분량 */
export const DELAY = 150;
/** 버퍼 끝 너머로 미는 최대 시간(ms) */
export const EXTRAP = 220;
/** 이만큼(m) 넘게 한 번에 움직이면 순간이동으로 본다 */
export const SNAP = 30;
/** 버퍼 최대 길이 */
export const BUF_MAX = 40;
/** 시계 차가 줄어드는 빠르기(ms/초) — 네트워크가 느려지면 천천히 따라간다 */
export const OFFSET_DECAY = 20;

/** 가장 짧은 쪽으로 각도 보간 */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class InterpBuffer {
  private buf: PoseSample[] = [];
  /** 보낸 쪽 시계 − 내 시계(ms). null = 아직 모름 */
  offset: number | null = null;
  private lastNow = 0;
  private lastOut: PoseOut | null = null;

  constructor(public delay = DELAY) {}

  get size() { return this.buf.length; }
  /** 가장 최근에 받은 것 */
  latest(): PoseSample | null { return this.buf[this.buf.length - 1] ?? null; }

  /** 쪽지 하나 넣기(now = 받은 내 시각 ms) */
  push(s: PoseSample, now: number) {
    const off = s.ts - now;
    if (this.offset === null || off > this.offset) this.offset = off;
    const last = this.buf[this.buf.length - 1];
    if (last && s.ts <= last.ts) return; // 늦게 도착한 옛 쪽지는 버린다(순서 보장 통로라도 방어)
    // 순간이동 — 이전 자취를 버리고 새로 시작(사이를 미끄러지지 않게)
    if (last && Math.hypot(s.x - last.x, s.z - last.z) > SNAP) this.buf.length = 0;
    // 세계가 바뀌면(지구 ↔ 우주) 마찬가지
    if (last && s.w !== last.w) this.buf.length = 0;
    this.buf.push(s);
    if (this.buf.length > BUF_MAX) this.buf.splice(0, this.buf.length - BUF_MAX);
  }

  clear() { this.buf.length = 0; this.offset = null; this.lastOut = null; }

  /** 내 시각 now 에 보여 줄 자세. 아직 아무것도 없으면 null */
  sample(now: number): PoseOut | null {
    const B = this.buf;
    if (!B.length || this.offset === null) return null;
    // 시계 차를 천천히 줄인다(한 번 빨리 온 쪽지 탓에 너무 앞서 재생하지 않게)
    if (this.lastNow) this.offset -= Math.max(0, now - this.lastNow) * (OFFSET_DECAY / 1000);
    const newest = B[B.length - 1];
    // 줄이다가 최신 쪽지가 미래가 되면 다시 맞춘다
    const minOff = newest.ts - now - 2000;
    if (this.offset < minOff) this.offset = minOff;
    const rt = now + this.offset - this.delay;
    let out: PoseOut;
    if (rt <= B[0].ts) out = { ...B[0], speed: 0, extrapolating: false };
    else if (rt >= newest.ts) {
      const prev = B[B.length - 2];
      const over = Math.min(EXTRAP, rt - newest.ts);
      if (prev && newest.ts > prev.ts && over > 0) {
        const k = over / (newest.ts - prev.ts);
        out = {
          ...newest,
          x: newest.x + (newest.x - prev.x) * k, y: newest.y + (newest.y - prev.y) * k, z: newest.z + (newest.z - prev.z) * k,
          yaw: lerpAngle(prev.yaw, newest.yaw, 1 + k), speed: 0, extrapolating: true,
        };
      } else out = { ...newest, speed: 0, extrapolating: false };
      // 재생이 끝을 한참 지난 쪽지들은 마지막 둘만 남긴다
      if (B.length > 2) B.splice(0, B.length - 2);
    } else {
      let i = 1;
      while (i < B.length && B[i].ts < rt) i++;
      const a = B[i - 1], b = B[i];
      const k = (rt - a.ts) / Math.max(1, b.ts - a.ts);
      out = {
        ts: rt, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
        yaw: lerpAngle(a.yaw, b.yaw, k),
        // 모드·동작·세계는 끊긴 값 — 가까운 쪽
        m: k < 0.5 ? a.m : b.m, a: k < 0.5 ? a.a : b.a, w: b.w, s: a.s + (b.s - a.s) * k,
        speed: 0, extrapolating: false,
      };
      // 지나간 쪽지 버리기(보간에 쓸 앞 하나는 남긴다)
      if (i - 1 > 0) B.splice(0, i - 1);
    }
    const dtS = this.lastNow ? (now - this.lastNow) / 1000 : 0;
    if (this.lastOut && dtS > 0 && this.lastOut.w === out.w) {
      const d = Math.hypot(out.x - this.lastOut.x, out.z - this.lastOut.z);
      out.speed = d > SNAP ? 0 : Math.min(30, d / dtS);
    }
    this.lastNow = now;
    this.lastOut = out;
    return out;
  }
}
