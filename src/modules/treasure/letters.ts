// 병편지 창(panel 'letter') — 방금 연 편지(보물지도·레시피 카드·주민 사연·우주에서 온 편지)와 가진 보물지도 목록.
// 글자는 #4a3b2a, 바탕은 #fff8e8(계약 v2 Art). 그리기는 hud 렌더러가 붙인 body 안에서만.
import type { PanelDef, PanelCtx } from '../../core/api';
import { islandName, islandById } from '../../core/world';
import type { MapEntry } from './logic';

/** 편지 한 장(창에 넘기는 arg) */
export type LetterView =
  | { kind: 'map'; n: number; map: MapEntry }
  | { kind: 'recipe'; rid: string; name: string; icon: string }
  | { kind: 'letter'; from: string; icon: string; text: string; stars: number }
  | { kind: 'space'; text: string };

/** 주민 사연 편지(15%, 반짝별 3) */
export const RESIDENT_LETTERS: ReadonlyArray<{ from: string; icon: string; text: string }> = [
  { from: '곰 몽실', icon: '🐻', text: '안녕! 바다에 편지를 띄워 보는 건 처음이야. 이걸 주운 너는 분명 다정한 친구일 거야. 다음에 같이 꿀 먹자!' },
  { from: '꽥사장', icon: '🦆', text: '꽥! 병에 넣은 건 내 비밀 장부… 가 아니고 감사 편지구먼! 늘 좋은 물건 가져와 줘서 고맙다, 꽥!' },
  { from: '느릿 관장', icon: '🐢', text: '오오…… 이 편지가…… 닿을 때쯤이면…… 아마…… 내년이겠죠…… 그래도…… 반가워요……' },
  { from: '펭박사', icon: '🐧', text: '실험 기록 #42: 병은 잘 뜬다. 나는 잘 안 뜬다. 그래서 로켓을 만든다! 부품 찾으면 꼭 알려 주게!' },
  { from: '통통', icon: '🦫', text: '뚝딱뚝딱! 나무 병마개를 새로 깎아 봤어. 꽉 닫혔지? 다음엔 의자도 만들어 줄게!' },
  { from: '펠리 선장', icon: '🦩', text: '부리에 바다를 담았지! 이 편지는 바람이 데려다준 거야. 오늘 바다는 잔잔하니 항해하기 딱이야.' },
  { from: '보들', icon: '🦦', text: '있잖아 있잖아! 산호초에서 거품이 퐁퐁 올라오는 데 있지? 거기 잠수하면 반짝이는 게 있대! 진짜야!' },
  { from: '너구리 고물상', icon: '🦝', text: '해변에 굴러다니는 헌 타이어, 버리지 말고 나한테 줘! 반짝반짝 닦아서 보물로 만들 거야.' },
  { from: '양 자매', icon: '🐑', text: '이번 시즌 유행은 조개껍데기 목걸이래요~ 바닷가에서 예쁜 거 보면 하나만 남겨 둬요!' },
  { from: '토끼 이웃', icon: '🐰', text: '어젯밤 별똥별에 소원을 빌었어. "친구가 이 편지를 주웠으면!" …이루어졌네? 헤헤.' },
  { from: '판다 이웃', icon: '🐼', text: '대나무 대신 사과를 먹어 봤는데 너무 맛있어서 깜짝 놀랐어. 너도 과일나무 흔들어 봐!' },
  { from: '부엉이 이웃', icon: '🦉', text: '부엉… 밤바다는 별이 비쳐서 하늘이 두 개야. 언젠가 같이 보러 가자, 부엉.' },
];

/** 우주에서 온 편지(별똥별섬 앞바다 5%) — 토토 이야기 복선 */
export const SPACE_LETTERS: readonly string[] = [
  '삐융… 삐융… 이 신호가 닿는다면, 지구의 친구에게. 우리 별이 조각조각 흩어졌어. 하늘을 봐 줘. 반짝이는 귀가 보이면 그게 나야.',
  '여긴 아주 높고 조용한 곳. 달에선 떡방아 소리가 들려. 지구는 동글동글 파랗구나. 언젠가 로켓을 타고 와 줄래? 삐융!',
  '별조각 하나를 바다에 떨어뜨렸어… 일곱 개가 다 모이면 집에 갈 수 있을 텐데. 혹시 보면 간직해 줘. — 반짝이는 귀가',
];

const UI = { text: '#4a3b2a', bg: '#fff8e8', line: '#f0dcb4' };
const card = (inner: string, tone = UI.bg) =>
  `<div style="background:${tone};color:${UI.text};border:3px dashed ${UI.line};border-radius:22px;padding:18px 20px;margin:6px 0 12px;line-height:1.55;font-size:18px">${inner}</div>`;

/** 쪼꼬미섬 모양 + X 표시(작은 SVG 지도) */
export function mapSvg(m: MapEntry, esc: (s: unknown) => string): string {
  const d = islandById(m.islet);
  const r = d?.r ?? 80;
  const ux = d ? (m.x - d.x) / (r * 1.25) : 0, uz = d ? (m.z - d.z) / (r * 1.25) : 0;
  const px = 110 + ux * 80, py = 80 + uz * 60;
  const wob = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2, k = 1 + 0.08 * Math.sin(i * 2.7 + r);
    return `${(110 + Math.cos(a) * 76 * k).toFixed(1)},${(80 + Math.sin(a) * 56 * k).toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 220 160" width="220" height="160" style="display:block;margin:8px auto;background:#cfeee6;border-radius:18px;border:3px solid #e9d3a8">
    <polygon points="${wob}" fill="#f4e2b0" stroke="#e0c08a" stroke-width="3"/>
    <circle cx="${(110 - 30).toFixed(1)}" cy="${(80 - 18).toFixed(1)}" r="9" fill="#5cc16a"/><rect x="${(110 - 32).toFixed(1)}" y="${(80 - 12).toFixed(1)}" width="4" height="12" rx="2" fill="#a8764f"/>
    <g stroke="#ff6b6b" stroke-width="7" stroke-linecap="round"><line x1="${px - 10}" y1="${py - 10}" x2="${px + 10}" y2="${py + 10}"/><line x1="${px + 10}" y1="${py - 10}" x2="${px - 10}" y2="${py + 10}"/></g>
    <text x="110" y="152" text-anchor="middle" font-size="14" fill="${UI.text}">${esc(islandName(m.islet))}</text>
  </svg>`;
}

/** 편지 한 장 HTML */
export function letterHtml(v: LetterView, esc: (s: unknown) => string): string {
  switch (v.kind) {
    case 'map':
      return card(`<div style="font-size:24px;text-align:center">🗺️ 보물지도 #${v.n}</div>${mapSvg(v.map, esc)}
        <div style="text-align:center"><b>${esc(islandName(v.map.islet))}</b> 어딘가에 빨간 X 가… 삽으로 파면 <b>금상자</b>가 나온대요! ✨<br><small>가까이 가면 반짝이는 빛기둥이 보여요</small></div>`, '#fff3d6');
    case 'recipe':
      return card(`<div style="font-size:24px;text-align:center">📜 레시피 카드!</div>
        <div style="text-align:center;font-size:44px;margin:8px 0">${esc(v.icon)}</div>
        <div style="text-align:center"><b>${esc(v.name)}</b> 만드는 법이 적혀 있어요.<br>작업대에서 만들 수 있게 됐어요! 🔨</div>`, '#f2f8ff');
    case 'letter':
      return card(`<div style="font-size:22px">${esc(v.icon)} <b>${esc(v.from)}</b>의 편지</div>
        <p style="margin:10px 0 12px">${esc(v.text)}</p><div style="text-align:right">마음이 따뜻해졌어요 · ⭐ 반짝별 +${v.stars}</div>`, '#fff0f4');
    case 'space':
      return card(`<div style="font-size:22px;text-align:center">🌌 우주에서 온 편지</div>
        <p style="margin:10px 0 12px;font-style:italic">${esc(v.text)}</p><div style="text-align:right">…종이가 은은하게 반짝인다 ✨</div>`, '#eef0ff');
  }
}

export interface LetterPanelEnv {
  /** 가진 보물지도(번호 → 목적지) */
  maps(): Array<{ n: number; map: MapEntry }>;
  /** 가방 속 안 연 병편지 수 */
  bottles(): number;
  /** 가방 병편지 하나 열기 — 열리면 이 창을 그 편지로 다시 연다 */
  openBagBottle(): LetterView | null;
}

/** 'letter' 창 정의 */
export function letterPanel(env: LetterPanelEnv): PanelDef {
  return {
    kind: 'letter', title: '병편지', color: '#9ef0d2', icon: '🍾', defaultTab: 'read',
    tabs: () => [{ id: 'read', label: '편지', icon: '💌' }, { id: 'maps', label: '보물지도', icon: '🗺️', badge: env.maps().length ? String(env.maps().length) : undefined }],
    meta: () => (env.bottles() ? `안 연 병 ${env.bottles()}개` : ''),
    render(body: HTMLElement, pc: PanelCtx) {
      const { esc } = pc.h;
      const tab = pc.tab === 'maps' ? 'maps' : 'read';
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = `color:${UI.text};max-width:560px;margin:0 auto`;
      body.appendChild(wrap);
      if (tab === 'read') {
        const v = pc.arg as LetterView | null | undefined;
        wrap.insertAdjacentHTML('beforeend', v && typeof v === 'object' && 'kind' in v
          ? letterHtml(v, esc)
          : card('<div style="text-align:center">🍾 해변이나 바다에서 병편지를 찾아봐요!<br><small>낚시하다가 건질 때도 있어요</small></div>'));
      } else {
        const list = env.maps();
        wrap.insertAdjacentHTML('beforeend', list.length
          ? list.map(({ n, map }) => card(`<div style="font-size:20px">🗺️ 보물지도 #${n} — <b>${esc(islandName(map.islet))}</b></div>${mapSvg(map, esc)}`, '#fff3d6')).join('')
          : card('<div style="text-align:center">아직 보물지도가 없어요.<br><small>병편지 열 개 중 여섯은 보물지도래요!</small></div>'));
      }
      const left = env.bottles();
      if (left > 0) {
        const b = pc.h.button(`🍾 병편지 열기 (${left})`, () => { env.openBagBottle(); });
        b.style.cssText = 'display:block;margin:6px auto;font-size:20px;padding:10px 22px;border-radius:16px';
        wrap.appendChild(b);
      }
    },
  };
}
