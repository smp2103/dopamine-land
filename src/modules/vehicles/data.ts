// 탈것 도감 18칸(GDD 3.8 표, P0-6) — category 'item' + tags ['vehicle']. 도감 '탈것' 탭이 tag 로 거른다.
// economy 는 v_* 를 등록하지도, 가방에 넣지도 않는다(계약 v2 3장 ID POLICY). 해금하거나 처음 타면 keep:false 로 기록한다.
import type { Species } from '../../core/state';

interface Row { id: string; name: string; rarity: number; habitat: string; speed: string; desc: string; p1?: boolean }

const ROWS: Row[] = [
  { id: 'v_bike', name: '장바구니 자전거', rarity: 1, habitat: '육지', speed: '11 m/s', desc: '민트 프레임에 꽃 바구니! 내리막에서 씽씽, Space 로 폴짝.' },
  { id: 'v_duck_tube', name: '오리튜브', rarity: 1, habitat: '얕은 바다', speed: '수영 ×1.5', desc: '노란 오리 링에 쏙. 둥둥 떠서 체력이 안 닳아요.' },
  { id: 'v_raft', name: '통나무 뗏목', rarity: 2, habitat: '바다', speed: '12 m/s', desc: '통나무 다섯 개에 작은 깃발. 영차영차 노 저어 다른 섬으로!' },
  { id: 'v_tugboat', name: '통통배', rarity: 2, habitat: '바다', speed: '25 m/s', desc: '통통통 동그란 연기. 멈추면 갑판에서 낚시도 해요.' },
  { id: 'v_yacht', name: '바람이 돛단요트', rarity: 3, habitat: '바다', speed: '순풍 35 / 역풍 15', desc: '하늘 줄무늬 돛이 바람을 머금어요.', p1: true },
  { id: 'v_motorboat', name: '물보라 모터보트', rarity: 3, habitat: '바다', speed: '40 m/s', desc: '파도를 타고 붕 뜨는 물보라 보트!' },
  { id: 'v_jetski', name: '수상바이크', rarity: 3, habitat: '바다', speed: '45 m/s', desc: '분홍 수상바이크로 스턴트 점프.', p1: true },
  { id: 'v_submarine', name: '꼬르륵호 잠수정', rarity: 4, habitat: '심해', speed: '8 m/s', desc: '노란 잠수정, 둥근 창 너머로 심해 구경.', p1: true },
  { id: 'v_sled', name: '펭귄 썰매', rarity: 2, habitat: '눈 언덕', speed: '최대 20 m/s', desc: '펭귄 얼굴 썰매로 미끄럼 드리프트.', p1: true },
  { id: 'v_buggy', name: '모래 버기', rarity: 3, habitat: '사막', speed: '18 m/s', desc: '큰 풍선 바퀴로 모래 언덕 점프!', p1: true },
  { id: 'v_balloon', name: '둥실풍선 열기구', rarity: 4, habitat: '하늘', speed: '6 m/s', desc: '줄무늬 풍선 타고 바람 따라 둥실.', p1: true },
  { id: 'v_plane', name: '프로펠러 꼬마비행기', rarity: 4, habitat: '하늘', speed: '50 m/s', desc: '낮게 낮게 군도 위를 빙글.', p1: true },
  { id: 'v_dino_trike', name: '뿔뿔이 (트리케라톱스)', rarity: 4, habitat: '공룡섬 육지', speed: '14 m/s', desc: '쿵쿵! 바위도 뿔로 콩.', p1: true },
  { id: 'v_dino_ptera', name: '슝슝이 (익룡)', rarity: 4, habitat: '공중 활공', speed: '20 m/s', desc: '높은 곳에서 슝— 천천히 내려앉아요.', p1: true },
  { id: 'v_dino_plesio', name: '목욕룡 (수장룡)', rarity: 4, habitat: '호수·바다', speed: '18 m/s', desc: '긴 목을 들어 물보라 샤워.', p1: true },
  { id: 'v_rocket', name: '도파민 1호 로켓', rarity: 5, habitat: '지구 ↔ 달', speed: '연출', desc: '창문 눈에 볼터치 스티커. 3, 2, 1 발사!' },
  { id: 'v_moon_rover', name: '깡총카 달 로버', rarity: 4, habitat: '달', speed: '15 m/s', desc: '저중력에서 통통 튀는 바퀴 여섯 개.', p1: true },
  { id: 'v_ufo', name: '반짝 UFO', rarity: 5, habitat: '우주 + 지구 하늘', speed: '60 m/s', desc: '은 접시에 분홍 돔, 빔으로 슝.', p1: true },
];

/** 도감 칸(등록용) */
export const VEHICLE_DEX: Species[] = ROWS.map((r) => ({
  id: r.id, name: r.name, category: 'item', rarity: r.rarity, tags: ['vehicle'],
  habitat: r.habitat, desc: `${r.desc} (${r.speed})`, ...(r.p1 ? { p1: true } : {}),
}));

/** id → 칸 */
export const VEHICLE_DEX_BY_ID: ReadonlyMap<string, Species> = new Map(VEHICLE_DEX.map((s) => [s.id, s]));

/** 표 밖 덤 칸(웨이브 3 인계: 달리미 탑승) — 18칸 표는 그대로 두고 따로 등록한다 */
const EXTRA_ROWS: Row[] = [
  { id: 'v_dino_galli', name: '달리미 (갈리미무스)', rarity: 4, habitat: '공룡섬 초원', speed: '16 m/s', desc: '가장 빠른 육상 탈것! 무리와 함께 질주.', p1: true },
];
export const VEHICLE_DEX_EXTRA: Species[] = EXTRA_ROWS.map((r) => ({
  id: r.id, name: r.name, category: 'item', rarity: r.rarity, tags: ['vehicle'],
  habitat: r.habitat, desc: `${r.desc} (${r.speed})`, ...(r.p1 ? { p1: true } : {}),
}));
for (const s of VEHICLE_DEX_EXTRA) (VEHICLE_DEX_BY_ID as Map<string, Species>).set(s.id, s);
