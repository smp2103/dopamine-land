// 이야기 데이터(순수) — 챕터 6개(GDD 4.14) · 섬 주인 별조각 체인 7개(GDD 4.6.2) · 토토 대사 · 연출 시간표.
// 런타임 없이 표만 — story.ts 와 테스트가 같이 읽는다.

/** 토토 NPC id(GDD 3.10.1) */
export const TOTO_ID = 'npc_toto';
export const TOTO_NAME = '토토';
/** 큰 목표 한 줄(목표 칩) */
export const OBJECTIVE = 'Toto를 집에 보내 주자';

// ───────────── 챕터(GDD 4.14 진행 챕터) ─────────────
export type ChapterNo = 1 | 2 | 3 | 4 | 5 | 6;
export interface ChapterDef {
  no: ChapterNo;
  name: string;
  icon: string;
  color: string;
  /** 대략 플레이 시간(GDD 표) */
  hours: string;
  /** 수평선의 다음 것(이름) */
  horizon: string;
  /** 수평선 목표 랜드마크 후보(앞에서부터 geo 에 있는 것) — 없으면 섬 중심 */
  target: { landmarks: string[]; kinds?: string[]; island?: string } | null;
  /** 토토 한 줄(이 챕터 동안 말 걸면) */
  toto: string;
}

export const CHAPTERS: readonly ChapterDef[] = [
  { no: 1, name: '정착', icon: '🏡', color: '#8fdc9a', hours: '0~2시간', horizon: '산호빛섬 등대',
    target: { landmarks: ['lm:coral:lighthouse'], kinds: ['lighthouse'], island: 'coral' },
    toto: '삐융! 여기 집도 짓고 도구도 모으자! 그러다 보면 바다 너머 등대가 반짝일 거야!' },
  { no: 2, name: '첫 항해', icon: '⛵', color: '#7cc8ff', hours: '2~6시간', horizon: '공룡섬 하트 연기 화산',
    target: { landmarks: ['lm:dino:volcanovent'], kinds: ['volcanovent', 'volcano'], island: 'dino' },
    toto: '뗏목 타고 둥실둥실~ 저 멀리 하트 모양 연기 보여? 삐융!' },
  { no: 3, name: '공룡과 눈', icon: '🦕', color: '#ffb36b', hours: '6~12시간', horizon: '모래시계섬 피라미드',
    target: { landmarks: ['lm:desert:pyramid'], kinds: ['pyramid'], island: 'desert' },
    toto: '공룡 친구들이랑 눈섬까지! 다음엔 모래 위 세모 탑이 기다려! 삐융!' },
  { no: 4, name: '사막', icon: '🏜️', color: '#ffd36b', hours: '12~18시간', horizon: '펭박사 로켓 설계도',
    target: { landmarks: ['lm:launch:penglab'], kinds: ['penglab'], island: 'launch' },
    toto: '펭박사님이 로켓 설계도를 갖고 있대! 별똥별섬으로 가 보자, 삐융!' },
  { no: 5, name: '발사', icon: '🚀', color: '#ff9cb8', hours: '18~25시간', horizon: '달',
    target: { landmarks: ['lm:launch:launchpad'], kinds: ['launchpad'], island: 'launch' },
    toto: '로켓 부품 여섯 개랑 발사대! 다 모이면 달까지 슝~ 삐융!' },
  { no: 6, name: '우주', icon: '🌙', color: '#c9b6f2', hours: '25시간~', horizon: '블랙홀',
    target: null,
    toto: '우주는 넓고 반짝반짝! 내 별도 저 어딘가에 있어. 삐융…' },
];
export const chapterDef = (n: number): ChapterDef => CHAPTERS[Math.max(1, Math.min(6, Math.floor(n) || 1)) - 1];

// ───────────── 섬 주인 별조각 체인(GDD 4.6.2) ─────────────
export type ChainNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 조건 종류 */
export type ChainGoal =
  | { kind: 'secret'; secret: string }
  | { kind: 'give'; item: string }
  | { kind: 'release'; tag: string; n: number }
  | { kind: 'secret+skeletons'; secret: string; n: number }
  | { kind: 'show-aurora'; species: string }
  | { kind: 'zodiac'; n: number };

export interface ChainDef {
  no: ChainNo;
  /** 주인 NPC id(npcs-p1 과 정한 id) */
  owner: string;
  ownerName: string;
  island: string;
  islandName: string;
  icon: string;
  /** 받는 별조각 */
  piece: string;
  goal: ChainGoal;
  /** 별조각을 어디서 주나: 'spot' = 그 자리(폭포 뒤 동굴 받침대), 'owner' = 주인에게 말 걸면 */
  claim: 'spot' | 'owner';
  /** 부탁 한 줄(처음 말 걸면) */
  ask: string;
  /** 진행 중(아직) 한 줄 — {have}/{need} 치환 */
  wait: string;
  /** 다 모았을 때(주인에게 가 보라는 알림) */
  ready: string;
  /** 고맙다는 한 줄(별조각 받을 때) */
  thanks: string;
  /** 다 끝난 뒤 한 줄 */
  after: string;
  /** 체인 목록 한 줄 설명 */
  text: string;
  /** 주인 평소 대사에 섞을 힌트(addDialog) */
  hint: string;
}

const piece = (n: number) => `it_starpiece_${n}`;

export const CHAINS: readonly ChainDef[] = [
  { no: 1, owner: 'npc_mongsil', ownerName: '곰 몽실', island: 'home', islandName: '말랑섬', icon: '🐻', piece: piece(1),
    goal: { kind: 'secret', secret: 'home-waterfall-cave' }, claim: 'spot',
    text: '큰 폭포 뒤 동굴 찾기',
    ask: '토토 별조각? 음… 큰 폭포 뒤에서 밤마다 반짝이는 게 보였어! 폭포 뒤 동굴을 찾아봐!',
    wait: '폭포 뒤에 동굴이 있대! 물소리 큰 쪽으로 살금살금 가 봐!',
    ready: '폭포 뒤 동굴에서 반짝이는 걸 찾았구나!',
    thanks: '와아, 첫 번째 별조각이다! 토토가 엄청 좋아하겠다!',
    after: '별조각 하나 찾았으니 나머지도 금방이야! 섬 주인들한테 물어봐!',
    hint: '큰 폭포 뒤에서 가끔 반짝반짝 빛이 새어 나와. 뭘까?' },
  { no: 2, owner: 'npc_bodeul', ownerName: '보들', island: 'coral', islandName: '산호빛섬', icon: '🦦', piece: piece(2),
    goal: { kind: 'give', item: 'd_spyglass' }, claim: 'owner',
    text: '꿀꺽호 선장의 망원경 가져오기',
    ask: '별조각? 꿀꺽호 난파선 선장 망원경으로 보면 찾을 수 있을지도! 바닷속 선실에서 망원경 좀 가져다줄래?',
    wait: '꿀꺽호는 말랑섬이랑 산호빛섬 사이 바닷속에 있어! 선실 안을 잘 찾아봐~',
    ready: '선장의 망원경을 구했구나! 보들에게 가져다주자.',
    thanks: '이거야 이거! 망원경으로 보니까… 찾았다! 산호 사이에 숨어 있던 별조각이야!',
    after: '망원경 최고야! 별이 엄청 크게 보여~ 수다 떨 사람 필요하면 또 와!',
    hint: '꿀꺽호 선장이 엄청 좋은 망원경을 갖고 있었대. 아직 배 안에 있을까?' },
  { no: 3, owner: 'npc_owl_prof', ownerName: '부엉 교수', island: 'mushroom', islandName: '반딧불버섯섬', icon: '🦉', piece: piece(3),
    goal: { kind: 'release', tag: 'firefly', n: 30 }, claim: 'owner',
    text: '반딧불이 30마리 놓아주기',
    ask: '부엉… 별조각은 빛을 좋아한다네. 빛병에 담은 반딧불이를 서른 마리 놓아주면 빛을 따라 날아올 걸세.',
    wait: '반딧불이를 {have}/{need}마리 놓아주었군. 부엉… 조금만 더!',
    ready: '반딧불이 서른 마리가 하늘을 수놓았어요! 부엉 교수에게 가 보자.',
    thanks: '부엉! 반딧불 빛을 따라 별조각이 내려앉았네. 자, 자네 것이야.',
    after: '반딧불이는 놓아주면 더 반짝인다네. 부엉…',
    hint: '반딧불이를 놓아주면 밤하늘이 더 밝아진다네. 부엉.' },
  { no: 4, owner: 'npc_grandma', ownerName: '목길이 할머니', island: 'dino', islandName: '쿵쿵공룡섬', icon: '🦕', piece: piece(4),
    goal: { kind: 'secret+skeletons', secret: 'dino-mural-cave', n: 5 }, claim: 'owner',
    text: '고대 벽화 동굴 찾기 + 화석 골격 5',
    ask: '하늘에서 별이 떨어졌을 때 우리 조상 몇몇은 그 별을 타고 달로 갔단다. 벽화 동굴을 찾고 화석 골격 다섯을 맞춰 오렴.',
    wait: '벽화 동굴 {cave} · 화석 골격 {have}/{need}. 천천히 해도 괜찮단다.',
    ready: '벽화도 찾고 화석 골격도 다섯! 목길이 할머니께 가 보자.',
    thanks: '그래, 그 벽화의 별이 바로 이거란다. 오래오래 간직한 별조각이야. 가져가렴.',
    after: '달에는 지금도 헬멧 쓴 우리 친척들이 산단다. 호호.',
    hint: '옛날옛날 공룡이 로켓을 탔다는 벽화가 어딘가 있단다.' },
  { no: 5, owner: 'npc_snow_elder', ownerName: '흰눈 영감', island: 'ice', islandName: '솜눈섬', icon: '🐻‍❄️', piece: piece(5),
    goal: { kind: 'show-aurora', species: 'b_aurora_butterfly' }, claim: 'owner',
    text: '오로라 밤에 오로라나비 보여 주기',
    ask: '흠흠, 별조각이라… 오로라 뜨는 밤에 오로라나비를 잡아 보여 주면 이 늙은이가 아는 걸 알려 주지.',
    wait: '오로라 밤에 언덕으로 가 보게. 오로라나비는 오로라 아래서만 춤춘다네.',
    ready: '오로라 아래서 오로라나비를 잡았어요! 흰눈 영감에게 보여 주자.',
    thanks: '허허, 정말 오로라나비로군! 오로라 끝자락에 걸려 있던 별조각을 주겠네.',
    after: '오로라는 별들이 춤추는 길이라네. 허허.',
    hint: '오로라 뜨는 밤엔 아주 예쁜 나비가 나온다네. 흠흠.' },
  { no: 6, owner: 'npc_saltstar', ownerName: '소금별', island: 'desert', islandName: '모래시계섬', icon: '🦊', piece: piece(6),
    goal: { kind: 'secret', secret: 'desert-temple' }, claim: 'owner',
    text: '모래폭풍 뒤 고대 신전',
    ask: '별을 세는 게 내 일이야. 별조각 하나가 모래폭풍 뒤 신전으로 떨어졌어. 신전을 찾아 줄래?',
    wait: '모래폭풍이 몰아치는 날, 폭풍 너머를 잘 봐. 신전 지붕이 보일 거야.',
    ready: '모래폭풍 뒤 신전을 찾았어요! 소금별에게 알려 주자.',
    thanks: '신전 별자리판에 꽂혀 있던 게 바로 이 별조각이야! 내 별 지도에 표시해 둘게.',
    after: '오늘 밤엔 별이 몇 개 뜰까? 같이 세어 볼래?',
    hint: '모래폭풍 너머에 별자리판이 있는 신전이 있대. 낭만적이지?' },
  { no: 7, owner: 'npc_ppippo', ownerName: '삐뽀', island: 'launch', islandName: '별똥별섬', icon: '🤖', piece: piece(7),
    goal: { kind: 'zodiac', n: 12 }, claim: 'owner',
    text: '별자리 물고기 12종 기증',
    ask: '삐뽀삐뽀! 별조각 신호 감지! 정확한 위치 계산엔 별자리 물고기 12종 데이터 필요! 박물관에 기증해 주세요!',
    wait: '별자리 데이터 {have}/{need} 수신 중… 삐뽀!',
    ready: '별자리 물고기 12종 기증 완료! 삐뽀에게 가 보자.',
    thanks: '삐뽀! 계산 완료! 관제탑 안테나에 걸려 있던 마지막 별조각입니다! 삐뽀삐뽀!',
    after: '관제탑 이상 없음! 발사 준비 언제든 OK! 삐뽀!',
    hint: '삐뽀! 크레이터 호수에 별자리 물고기가 산다는 데이터가 있습니다!' },
];
export const CHAIN_BY_NO = new Map<number, ChainDef>(CHAINS.map((c) => [c.no, c]));
export const CHAIN_BY_OWNER = new Map<string, ChainDef>(CHAINS.map((c) => [c.owner, c]));
export const PIECES_TOTAL = CHAINS.length;

// ───────────── 토토 대사 ─────────────
export const TOTO_LINES = {
  hello: '삐융! 나는 토토! 별나라에서 떨어졌어… 집에 가고 싶어. 도와줄 거지?',
  pieces: (n: number) => (n >= PIECES_TOTAL
    ? '별조각이 일곱 개! 내 별이 다시 반짝여! 이제 로켓만 있으면 돼, 삐융!'
    : n === 0 ? '내 별이 부서져서 조각 일곱 개가 섬마다 흩어졌대. 섬 주인들한테 물어보자!'
      : `별조각 ${n}/${PIECES_TOTAL}개! 반짝반짝 조금씩 따뜻해져, 삐융!`),
  restored: '별조각 일곱 개가 모여 내 별이 다시 빛나! 로켓을 타고 우주로 가면 집에 갈 수 있어!',
  launchHint: '발사대에서 로켓을 타고 우주로 가면… 나도 별 로켓을 타고 집에 갈래!',
  bye: '고마워! 별나라에서도 계속 반짝반짝 손 흔들게! 삐융~!',
  idle: ['삐융?', '반짝반짝~', '여기 바람 좋다!', '우와, 저거 봐!', '삐융삐융!'],
} as const;

// ───────────── 연출 시간표(초) ─────────────
/** 별똥별 인트로: 하늘에서 줄 긋기 → 쾅 → 반짝 → 끝 */
export const INTRO_T = { fall: 3.2, settle: 6.2, end: 7.2 } as const;
/** 토토 깨어나기(구덩이에서 E) */
export const MEET_T = { crack: 0.6, pop: 1.0, land: 1.9, end: 3.6 } as const;
/** 별 되살리기(별조각 7개) */
export const RESTORE_T = { end: 4.5 } as const;
/** 엔딩: 토토 등장 → 불꽃놀이 → 별 로켓 출발 → 반짝 → 끝 */
export const ENDING_T = { appear: 0.5, fireworks: 1.2, board: 5.0, lift: 6.2, star: 10.5, end: 13.0 } as const;
/** 발사 후 이만큼 지나도 우주에 못 가면(우주 모듈 없음) 그 자리에서 엔딩 */
export const ENDING_FALLBACK_SEC = 14;
/** 인트로를 시작하지 않고 기다리는 최대 시간(게임 env 가 없을 때, 실제 초) */
export const INTRO_NO_ENV_SEC = 120;
