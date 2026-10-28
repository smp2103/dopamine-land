// 부팅 화면 — 로딩(젤리 방울이 떨어져 작은 섬이 피어나는 화면) → 타이틀(별똥별이 쓰는 로고, 살아 있는 세계 위) → 인트로(별과 함께 떨어지는 카메라).
// 화면 뼈대·모양은 index.html 에 인라인으로 있다(JS 없이도 바로 보인다). 여기는 그걸 움직이는 손.
// 순수 부분(진행률·건너뛰기 규칙·팁 순서·카메라 길)은 DOM·three 없이 테스트한다(tests/boot.test.ts) — DOM 은 메서드 안에서만 만진다.
// 이 파일은 three 를 부르지 않는다(main 이 제일 먼저 부르는 가벼운 파일이어야 해서). 벡터는 {x,y,z} 평범한 객체.
// 디버그: window.__boot = { stage, progress(), times, skip, title(), start() } (main 이 단다)
import { mulberry32 } from './rng';

// ───────────── 단계와 진행률 ─────────────
export const BOOT_STAGES = [
  { id: 'engine', label: '엔진 준비 중', from: 0, to: 0.1 },
  { id: 'physics', label: '물리 깨우는 중', from: 0.1, to: 0.18 },
  { id: 'island', label: '섬 만드는 중', from: 0.18, to: 0.3 },
  { id: 'friends', label: '친구들 부르는 중', from: 0.3, to: 0.86 },
  { id: 'decor', label: '주변 꾸미는 중', from: 0.86, to: 0.99 },
  { id: 'done', label: '다 됐어요', from: 1, to: 1 },
] as const;
export type BootStageId = typeof BOOT_STAGES[number]['id'];
export const stageOf = (id: BootStageId) => BOOT_STAGES.find((s) => s.id === id)!;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** 진행률 — 목표(target)는 단계 구간 안의 비율로 정하고 절대 뒤로 가지 않는다. 화면 값(shown)은 목표를 부드럽게 따라간다 */
export class BootProgress {
  stage: BootStageId = 'engine';
  label: string = BOOT_STAGES[0].label;
  target = 0;
  shown = 0;
  /** 단계가 바뀐 시각들(ms, 측정용) */
  times: Partial<Record<BootStageId, number>> = {};

  /** 단계 + 그 단계 안 진행(0..1). 앞 단계로 돌아가는 호출은 무시한다 */
  set(id: BootStageId, frac = 0, label?: string, now = 0): number {
    const st = stageOf(id);
    const cur = BOOT_STAGES.findIndex((s) => s.id === this.stage);
    const idx = BOOT_STAGES.findIndex((s) => s.id === id);
    if (idx < cur) return this.target;
    if (idx > cur || this.times[id] === undefined) this.times[id] ??= now;
    this.stage = id;
    this.label = label ?? st.label;
    this.target = Math.max(this.target, st.from + (st.to - st.from) * clamp01(frac));
    return this.target;
  }

  /** 화면 값 한 걸음(dt 초). 목표를 넘지 않고, 줄지도 않는다. 끝(1)엔 빨리 닿는다 */
  step(dt: number): number {
    const d = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const gap = this.target - this.shown;
    if (gap <= 0) return this.shown;
    const k = 1 - Math.exp(-d * (this.target >= 1 ? 14 : 5));
    // 아주 작은 차이는 바로 붙인다(영원히 0.999… 에 머물지 않게)
    this.shown = gap < 0.002 ? this.target : this.shown + gap * k;
    return this.shown;
  }
}

/** 로딩 섬이 피어나는 문턱(모래 → 풀밭 → 나무 → 꽃 셋 → 집 → 반짝 별) — 화면 진행률이 넘을 때마다 한 조각씩 퐁 */
export const GROW_AT: readonly number[] = [0.06, 0.18, 0.34, 0.48, 0.56, 0.64, 0.78, 0.95];
export const growLevel = (v: number) => GROW_AT.filter((x) => v >= x).length;

/** 청크 남은 수 → 0..1(처음 본 최대값 기준, 늘어도 뒤로 안 감은 BootProgress 가 맡는다) */
export function pendingFraction(pending: number, maxSeen: number): number {
  if (!(maxSeen > 0)) return 1;
  return clamp01(1 - pending / maxSeen);
}

// ───────────── 타이틀 건너뛰기 규칙(계약) ─────────────
export interface SkipEnv {
  webdriver: boolean;
  params: URLSearchParams | Record<string, string | null | undefined>;
  /** game=0(룩 테스트) 이면 게임이 없다 */
  gameOn: boolean;
}
export type SkipReason = 'webdriver' | 'shot' | 'intro' | 'cam' | 'nogame' | null;
/** 자동 실행(navigator.webdriver)·shot=1·intro=0·cam=<프리셋> → 타이틀 없이 준비되자마자 시작. intro=1 은 자동 실행에서도 타이틀을 강제 */
export function skipTitle(env: SkipEnv): { skip: boolean; why: SkipReason } {
  const get = (k: string) => (env.params instanceof URLSearchParams ? env.params.get(k) : env.params[k] ?? null);
  if (!env.gameOn) return { skip: true, why: 'nogame' };
  if (get('shot') === '1') return { skip: true, why: 'shot' };
  if (get('cam')) return { skip: true, why: 'cam' };
  if (get('intro') === '0') return { skip: true, why: 'intro' };
  if (get('intro') === '1') return { skip: false, why: null };
  if (env.webdriver) return { skip: true, why: 'webdriver' };
  return { skip: false, why: null };
}

// ───────────── 졸린 별의 팁 ─────────────
export const BOOT_TIPS: readonly string[] = [
  '공중에서 Space 를 꾹 누르고 있으면 패러글라이더로 둥실 날아요',
  'Tab 을 누르면 말랑 주머니가 퐁! 도감·가방·지도가 다 거기 있어요',
  '물고기·곤충은 가끔 반짝이·왕관·꼬마로 나와요. 도감에 따로 적혀요',
  '요일마다 섬 소식이 달라요. 월요일엔 꽃잎비, 일요일엔 별똥별이 쏟아져요',
  '보물 상자는 열 때까지 뭐가 들었는지 몰라요. 두근두근!',
  '헤엄치다 C 를 누르면 바닷속으로 쏙 잠수해요. 숨은 아껴 쓰기!',
  'V 를 누르면 카메라가 모험 시점 ↔ 아늑 시점으로 바뀌어요',
  '공룡섬 땅속엔 화석이 잠들어 있대요. 삽으로 콕콕 파 봐요',
  '로켓 부품을 다 모으면 달나라까지 슝 날아갈 수 있어요',
  '주민에게 말을 걸고 선물하면 마음 하트가 쌓여요',
  '비눗방울 정류장에 올라타면 섬과 섬 사이를 퐁퐁 건너가요',
  '하늘에서 떨어진 별 친구 토토가 집에 돌아갈 길을 찾고 있대요',
  '보름달이 뜨는 밤엔 평소엔 못 보던 친구들이 살금살금 나와요',
  'P 를 누르면 사진 모드! 예쁜 순간을 찰칵 남겨요',
  '화면이 버벅이면 G 로 그래픽 품질을 바꿔 봐요',
  '나무를 흔들면 열매가… 가끔은 벌집이! 조심조심',
];

/** 팁 순서(시드 고정 섞기). 같은 시드 = 같은 순서 */
export function tipOrder(seed: number, n = BOOT_TIPS.length): number[] {
  const rnd = mulberry32((seed >>> 0) ^ 0x9e3779b9);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const TIP_PERIOD_MS = 3200;
/** 경과 시간(ms) → 지금 보일 팁 번호(순서표에서) */
export function tipAt(order: readonly number[], elapsedMs: number, periodMs = TIP_PERIOD_MS): number {
  if (!order.length) return 0;
  const k = Math.max(0, Math.floor(Math.max(0, elapsedMs) / Math.max(1, periodMs)));
  return order[k % order.length];
}

// ───────────── 카메라 길(순수 수학) ─────────────
export interface V3 { x: number; y: number; z: number }
/** 0..1 → 부드럽게(양끝 느리게) */
export const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 점점 빨라지다가 끝에서 살짝 눌렸다 돌아오는(쭈욱 → 말랑) 낙하 */
export function fallEase(t: number): number {
  const x = clamp01(t);
  if (x < 0.82) {
    // 처음엔 별이 살짝 끌어올리고(음수 = 조금 떠오름) 점점 빨라지며 떨어진다
    const u = x / 0.82;
    return 0.55 * u * u * (3 - 2 * u) + 0.45 * u * u - 0.05 * Math.sin(Math.PI * u) * (1 - u);
  }
  // 착지: 1 을 살짝 넘었다가(-) 돌아온다
  const u = (x - 0.82) / 0.18;
  return 1 + Math.sin(u * Math.PI) * 0.035 * (1 - u);
}
/** 각도 a → b 최단 쪽 보간 */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** 타이틀 궤도: 중심(플레이어) 둘레를 천천히 도는 높은 시점. t = 초 */
export interface OrbitOpts { yaw0: number; radius: number; height: number; speed: number; bob: number }
export const TITLE_ORBIT: OrbitOpts = { yaw0: 0.9, radius: 64, height: 34, speed: 0.045, bob: 2.2 };
export function titleOrbit(center: V3, t: number, o: OrbitOpts = TITLE_ORBIT): { pos: V3; look: V3; yaw: number } {
  const yaw = o.yaw0 + t * o.speed;
  const r = o.radius * (1 + 0.05 * Math.sin(t * 0.13));
  return {
    yaw,
    pos: { x: center.x + Math.sin(yaw) * r, y: center.y + o.height + Math.sin(t * 0.21) * o.bob, z: center.z + Math.cos(yaw) * r },
    look: { x: center.x, y: center.y + 3.5, z: center.z },
  };
}

/** 원통 좌표(중심 기준): 방위각·수평 거리·높이 */
export interface Cyl { yaw: number; r: number; h: number }
export function toCyl(p: V3, c: V3): Cyl {
  const dx = p.x - c.x, dz = p.z - c.z;
  return { yaw: Math.atan2(dx, dz), r: Math.hypot(dx, dz), h: p.y - c.y };
}
export function fromCyl(q: Cyl, c: V3): V3 {
  return { x: c.x + Math.sin(q.yaw) * q.r, y: c.y + q.h, z: c.z + Math.cos(q.yaw) * q.r };
}
export const GLIDE_SEC = 2.2;
/** 타이틀 → 따라가는 카메라. 방위각은 부드럽게, 높이는 '떨어지듯'(fallEase), 거리는 그 사이. k = 경과/길이 */
export function glidePose(from: Cyl, to: Cyl, center: V3, k: number): V3 {
  const e = easeInOut(k), f = fallEase(k);
  return fromCyl({ yaw: lerpAngle(from.yaw, to.yaw, e), r: from.r + (to.r - from.r) * easeInOut(Math.min(1, k * 1.15)), h: from.h + (to.h - from.h) * f }, center);
}
export const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** 인트로 별: 카메라 앞에서 출발해 플레이어 머리 위로 떨어지는 길(살짝 휘는 2차 베지어). k 0..1 */
export function starPath(from: V3, to: V3, k: number): V3 {
  const t = clamp01(k);
  const mid = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + 6, z: (from.z + to.z) / 2 };
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return { x: a * from.x + b * mid.x + c * to.x, y: a * from.y + b * mid.y + c * to.y, z: a * from.z + b * mid.z + c * to.z };
}

// ───────────── 로딩 화면(DOM) ─────────────
const BOOT_COUNT_KEY = 'dopamine-land-boots';
/** 몇 번째 부팅인지(팁 순서 시드) — 저장이 막혀 있으면 0 */
function bootCount(): number {
  try {
    const n = (Number(localStorage.getItem(BOOT_COUNT_KEY)) || 0) + 1;
    localStorage.setItem(BOOT_COUNT_KEY, String(n));
    return n;
  } catch { return 0; }
}

/** index.html 의 #boot 를 움직인다. 없으면(테스트·다른 페이지) 아무것도 안 한다 */
export class BootScreen {
  readonly progress = new BootProgress();
  readonly t0 = performance.now();
  private el: HTMLElement | null;
  private fill: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private order: number[];
  private tipShown = -1;
  /** 섬 조각(모래부터 순서대로)과 지금까지 피어난 수 */
  private parts: Element[] = [];
  private grown = 0;
  private raf = 0;
  private last = performance.now();
  private lastMove = performance.now();
  private lastTarget = 0;
  private done = false;
  private failed = false;

  constructor(doc: Document = document) {
    this.el = doc.getElementById('boot');
    this.order = tipOrder(bootCount());
    if (!this.el) return;
    this.fill = this.el.querySelector('.bt-fill');
    this.status = this.el.querySelector('.bt-status');
    this.tip = this.el.querySelector('.bt-tiptext');
    this.parts = [...this.el.querySelectorAll('.bt-isle > :not(.bt-sea):not(.bt-ripple)')];
    this.el.querySelector('.bt-retry')?.addEventListener('click', () => location.reload());
    this.el.querySelector('.bt-slow button')?.addEventListener('click', () => location.reload());
    this.el.classList.add('bt-js');
    this.loop();
  }

  /** 단계 알리기(진행 0..1, 보일 글은 생략하면 단계 이름) */
  stage(id: BootStageId, frac = 0, label?: string) {
    if (this.failed) return;
    this.progress.set(id, frac, label, Math.round(performance.now() - this.t0));
    if (this.status) this.status.textContent = this.progress.label + (id === 'done' ? '!' : '…');
    if (this.el) this.el.dataset.stage = id;
    // 오래 걸리는 동안에도 바로 보이게 한 번 그려 둔다
    this.paint(0);
  }

  private paint(dt: number) {
    const p = this.progress;
    const v = p.step(dt);
    if (p.target > this.lastTarget) { this.lastTarget = p.target; this.lastMove = performance.now(); }
    if (this.el) this.el.style.setProperty('--p', v.toFixed(4));
    if (this.fill) this.fill.style.width = `${(4 + v * 96).toFixed(2)}%`;
    const g = growLevel(v);
    if (g > this.grown) {
      for (let i = this.grown; i < g; i++) this.parts[i]?.classList.add('on');
      this.grown = g;
    }
    const k = tipAt(this.order, performance.now() - this.t0);
    if (k !== this.tipShown && this.tip) {
      this.tipShown = k;
      const t = this.tip;
      t.classList.remove('bt-in');
      // 다음 그림에서 다시 붙여 '톡' 하고 바뀌게
      void t.offsetWidth;
      t.textContent = BOOT_TIPS[k];
      t.classList.add('bt-in');
    }
    // 같은 단계에서 40초 넘게 꿈쩍 않으면 살짝 다시 시도 버튼
    if (this.el && !this.done) this.el.classList.toggle('bt-stuck', performance.now() - this.lastMove > 40000);
  }

  private loop = () => {
    const now = performance.now();
    this.paint(Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    if (!this.done || this.progress.shown < 1) this.raf = requestAnimationFrame(this.loop);
  };

  /** 다 됐어요 → 사라지기(instant = 촬영·자동 실행: 바로 없앤다) */
  finish(instant: boolean): Promise<void> {
    this.stage('done', 1);
    this.done = true;
    const el = this.el;
    if (!el) return Promise.resolve();
    if (instant) { cancelAnimationFrame(this.raf); el.remove(); return Promise.resolve(); }
    return new Promise((res) => {
      // 막대가 끝까지 차는 걸 잠깐 보여 주고 녹아 사라진다
      setTimeout(() => {
        el.classList.add('bt-out');
        setTimeout(() => { cancelAnimationFrame(this.raf); el.remove(); res(); }, 900);
      }, 380);
    });
  }

  /** 부팅 실패 — 멈춘 화면 대신 다정한 오류 카드 + 다시 시도 */
  fail(err: unknown) {
    this.failed = true;
    const el = this.el;
    if (!el) return;
    el.classList.add('bt-failed');
    const d = el.querySelector('.bt-errdetail');
    if (d) d.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    (el.querySelector('.bt-retry') as HTMLElement | null)?.focus();
  }
}

// ───────────── 타이틀(DOM) ─────────────
export interface TitleInfo { cont: boolean; day?: number; dex?: number }

/** 시작 글 — 처음이면 '톡 눌러서 시작', 저장이 있으면 '이어하기 · N일째' */
export function titlePrompt(info: TitleInfo): { main: string; sub: string } {
  if (!info.cont) return { main: '톡! 눌러서 시작', sub: '아무 키나 · 클릭' };
  const day = Math.max(1, Math.floor(info.day ?? 1));
  const dex = info.dex ? ` · 도감 ${info.dex}칸` : '';
  return { main: `이어하기 · ${day}일째`, sub: `아무 키나 눌러요${dex}` };
}

/** 사람이 '시작' 으로 칠 입력인가(단독 보조키·기능키·개발용 ` 는 빼고) */
export function isStartKey(code: string): boolean {
  if (!code) return false;
  if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code)) return false;
  if (/^F\d+$/.test(code)) return false;
  return !['Backquote', 'CapsLock', 'Tab', 'NumLock', 'ScrollLock', 'ContextMenu', 'PrintScreen'].includes(code);
}

export class TitleScreen {
  private el: HTMLElement | null;
  constructor(doc: Document = document) { this.el = doc.getElementById('title'); }
  show(info: TitleInfo) {
    const el = this.el;
    if (!el) return;
    const p = titlePrompt(info);
    const m = el.querySelector('.tt-go b'), s = el.querySelector('.tt-hint');
    if (m) m.textContent = p.main;
    if (s) s.textContent = p.sub;
    el.hidden = false;
    el.classList.toggle('tt-cont', info.cont);
    // 한 프레임 뒤 클래스 → CSS 전환이 처음부터 돈다
    requestAnimationFrame(() => el.classList.add('tt-on'));
  }
  /** 눌렀다 → 로고가 위로 퐁 사라지고 버튼이 터진다 */
  go() { this.el?.classList.add('tt-go-on'); }
  hide() {
    const el = this.el;
    if (!el) return;
    el.classList.add('tt-out');
    setTimeout(() => el.remove(), 900);
  }
  remove() { this.el?.remove(); }
}
