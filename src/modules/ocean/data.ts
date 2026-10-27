// 바닷속 채집 생물·목격 생물(카테고리 'sea', GDD 3.3.1) — 도감·상점·박물관이 읽는다.
// ID 정책(계약 v2 3장): 원래 있던 id 는 그대로 두고 gdd 로 GDD 표 id 를 단다. 새 종은 GDD id 를 쓴다.
// 상자게(d_mimic_crab)는 economy 몫이라 여기 없다. 곰치는 낚시(fishing) 종이라 꿀꺽호엔 장식으로만 둔다.
// where.zone 은 잠수 구역 코드: shallow(해안 0~150m) · reef · wreck(난파선 둘레) · offshore · trench(꼬르륵 해구).
import type { Species } from '../../core/state';
import type { ShadowSize, SpeciesWhere, Weather } from '../../core/api';

export type SeaHabitat = 'floor' | 'swim' | 'anemone' | 'drift';
/** GDD 행동 코드 — still 가만 · slow 느릿 · hop 톡 튐 · flee 도망 · hide 숨었다 나옴 · drift 둥실 · swarm 무리 · swim 빙글 · witness 만나기 · relic 유물 */
export type SeaBehavior = 'still' | 'slow' | 'hop' | 'flee' | 'hide' | 'drift' | 'swarm' | 'swim' | 'witness' | 'relic';
export type DiveZone = 'shallow' | 'reef' | 'wreck' | 'offshore' | 'trench';

export interface SeaSpecies extends Species {
  /** 모델 키(models.ts) */
  model: string;
  habitat: SeaHabitat;
  behavior: SeaBehavior;
  /** 이 깊이(m, 양수) 이상에서만 산다 */
  minDepth: number;
  /** 크기 범위(cm) */
  size: [number, number];
  /** 화면 모델 배율 */
  scale: number;
  /** 잡지 않고 만나기만(도감 기록, 가방엔 안 들어간다) — witness 와 같은 뜻(옛 이름) */
  meetOnly?: boolean;
  line: string;
}

/** 0.7 판매가 공식(새 종 가격): round10(BASE[★] × SIZE[그림자] × ZONE) */
const BASE: Record<number, number> = { 1: 60, 2: 200, 3: 700, 4: 2500, 5: 9000 };
const SIZE: Record<ShadowSize, number> = { XS: 0.7, S: 0.85, M: 1.0, L: 1.3, XL: 1.7, XXL: 2.2 };
export const seaPrice = (r: number, sh: ShadowSize, zone = 1.15) => Math.round((BASE[r] * SIZE[sh] * zone) / 10) * 10;

/** 평균 길이(cm) → 그림자 크기 */
export function shadowOf(len: number): ShadowSize {
  return len < 10 ? 'XS' : len < 25 ? 'S' : len < 50 ? 'M' : len < 120 ? 'L' : len < 300 ? 'XL' : 'XXL';
}

type Row = Omit<SeaSpecies, 'category' | 'len' | 'shadow'> & { len?: number; shadow?: ShadowSize };
const S = (o: Row): SeaSpecies => {
  const len = o.len ?? Math.round((o.size[0] + o.size[1]) / 2);
  return { category: 'sea', ...o, len, shadow: o.shadow ?? shadowOf(len) };
};
/** 구역 여러 개 × 시간(GDD 0.3 Where, 섬은 어디든) */
const W = (zones: DiveZone[], time: string | string[] = 'all', weather?: { only?: Weather[]; boost?: Weather[]; x?: number }): SpeciesWhere[] =>
  zones.map((zone) => ({ zone, time, ...(weather ? { weather } : {}) }));

export const SEA_SPECIES: SeaSpecies[] = [
  // ── 원래 있던 27종(id 그대로) ──
  S({ id: 'sea-cucumber', gdd: 'd_seacucumber', name: '해삼', rarity: 1, price: 120, model: 'cucumber', habitat: 'floor', behavior: 'still', minDepth: 1.5, size: [12, 30], scale: 1, where: W(['shallow'], 'night'), desc: '말랑말랑 바닥 청소부.', line: '해삼 해삼~ 오늘도 바닥은 반짝반짝!' }),
  S({ id: 'sea-abalone', gdd: 'd_abalone', name: '전복', rarity: 2, price: 600, model: 'abalone', habitat: 'floor', behavior: 'still', minDepth: 2, size: [6, 14], scale: 1, where: W(['shallow'], 'day'), desc: '무지갯빛 껍데기를 숨기고 있다.', line: '전복이다! 전부 복 받을 거야!' }),
  S({ id: 'sea-urchin', gdd: 'd_urchin', name: '성게', rarity: 1, price: 150, model: 'urchin', habitat: 'floor', behavior: 'still', minDepth: 1.2, size: [5, 10], scale: 1, where: W(['shallow', 'reef']), desc: '가시는 따끔, 속은 말랑.', line: '성게 잡았다! 성게… 성공했게!' }),
  S({ id: 'sea-octopus', name: '문어', rarity: 2, price: 500, model: 'octopus', habitat: 'floor', behavior: 'slow', minDepth: 3, size: [30, 80], scale: 1, where: W(['reef', 'wreck']), desc: '다리가 여덟 개라 포옹도 여덟 번.', line: '문어다! 문득 어깨춤이 나와!' }),
  S({ id: 'sea-webfoot', name: '주꾸미', rarity: 1, price: 220, model: 'webfoot', habitat: 'floor', behavior: 'slow', minDepth: 1.5, size: [10, 20], scale: 0.7, where: W(['shallow']), desc: '작고 통통한 봄의 별미.', line: '주꾸미 잡았다! 쭈욱 쭈욱~' }),
  S({ id: 'sea-squid', name: '오징어', rarity: 2, price: 400, model: 'squid', habitat: 'swim', behavior: 'swim', minDepth: 4, size: [20, 40], scale: 1, where: W(['offshore', 'shallow'], 'night'), desc: '먹물 대신 반짝임을 뿜는다.', line: '오징어다! 오늘 징~하게 운이 좋아!' }),
  S({ id: 'sea-seahorse', name: '해마', rarity: 3, price: 1100, model: 'seahorse', habitat: 'swim', behavior: 'drift', minDepth: 2, size: [8, 18], scale: 1, where: W(['reef', 'shallow']), desc: '아빠가 알을 품는 다정한 물고기.', line: '해마 잡았다! 해맑게 웃는 해마!' }),
  S({ id: 'sea-goldhorse', name: '황금 해마', rarity: 5, price: 12000, model: 'goldhorse', habitat: 'swim', behavior: 'drift', minDepth: 6, size: [10, 20], scale: 1.1, where: W(['reef']), desc: '바다의 행운을 몰고 다닌다는 전설.', line: '황금 해마!! 오늘 운 다 썼다!' }),
  S({ id: 'sea-scallop', gdd: 'd_scallop', name: '가리비', rarity: 1, price: 200, model: 'scallop', habitat: 'floor', behavior: 'hop', minDepth: 1.2, size: [7, 15], scale: 1, where: W(['shallow'], 'day'), desc: '파닥파닥 헤엄치는 조개. DIY 재료 1순위.', line: '가리비 잡았다! 가리지 말고 비춰 줘~' }),
  S({ id: 'sea-pearl', gdd: 'd_pearl_oyster', name: '진주조개', rarity: 3, price: 900, model: 'pearl', habitat: 'floor', behavior: 'still', minDepth: 3, size: [8, 16], scale: 1, where: W(['shallow', 'wreck']), desc: '다섯 번 중 한 번은 진주를 품고 있다.', line: '진주조개!! 진짜 주인공 등장!' }),
  S({ id: 'sea-oyster', name: '굴', rarity: 1, price: 140, model: 'oyster', habitat: 'floor', behavior: 'still', minDepth: 1, size: [6, 14], scale: 1, where: W(['shallow', 'wreck']), desc: '울퉁불퉁 바다의 우유.', line: '굴 잡았다! 굴러 들어온 복!' }),
  S({ id: 'sea-mussel', name: '홍합', rarity: 1, price: 100, model: 'mussel', habitat: 'floor', behavior: 'still', minDepth: 1, size: [5, 10], scale: 1, where: W(['shallow', 'wreck']), desc: '바위에 꼭 붙어 사는 단짝.', line: '홍합이다! 홍~ 합격!' }),
  S({ id: 'sea-giantclam', gdd: 'd_giant_clam', name: '대왕조개', rarity: 4, price: 4200, model: 'giantclam', habitat: 'floor', behavior: 'still', minDepth: 4, size: [70, 130], len: 100, shadow: 'L', scale: 1, where: W(['reef'], 'day', { only: ['clear'] }), desc: '입술이 형광빛으로 빛난다. 맑은 날 열면 진주를 준다.', line: '대왕조개! 대왕님 납시오!' }),
  S({ id: 'sea-crab', gdd: 'd_crab', name: '꽃게', rarity: 1, price: 250, model: 'crab', habitat: 'floor', behavior: 'hop', minDepth: 0.8, size: [8, 16], scale: 1, where: W(['shallow']), desc: '옆으로 걸어도 마음은 직진.', line: '꽃게 잡았다! 꽃처럼 예쁜 게!' }),
  S({ id: 'sea-hermit', name: '소라게', rarity: 2, price: 450, model: 'hermit', habitat: 'floor', behavior: 'slow', minDepth: 0.8, size: [4, 9], scale: 0.85, where: W(['shallow']), desc: '집이 작아지면 이사를 간다.', line: '소라게! 집까지 통째로 데려왔어!' }),
  S({ id: 'sea-lobster', name: '랍스터', rarity: 3, price: 1800, model: 'lobster', habitat: 'floor', behavior: 'slow', minDepth: 4, size: [25, 50], scale: 1, where: W(['reef', 'wreck']), desc: '빨간 갑옷의 바다 기사.', line: '랍스터다! 랍스타~ 오늘의 스타!' }),
  S({ id: 'sea-shrimp', name: '새우', rarity: 1, price: 160, model: 'shrimp', habitat: 'swim', behavior: 'swim', minDepth: 1.5, size: [5, 12], scale: 0.8, where: W(['shallow', 'reef']), desc: '등은 굽어도 꿈은 크다.', line: '새우 잡았다! 새우깡은 아니야!' }),
  S({ id: 'sea-jelly', name: '해파리', rarity: 2, price: 380, model: 'jelly', habitat: 'drift', behavior: 'drift', minDepth: 3, size: [10, 30], scale: 1, where: W(['offshore', 'shallow', 'reef']), desc: '말랑하게 떠다니는 바다의 풍선.', line: '해파리다! 해~ 파릇파릇!' }),
  S({ id: 'sea-moonjelly', name: '보름달물해파리', rarity: 3, price: 900, model: 'moonjelly', habitat: 'drift', behavior: 'drift', minDepth: 5, size: [15, 35], scale: 1.1, where: W(['offshore', 'reef']), desc: '등에 네잎클로버 무늬가 있다.', line: '보름달물해파리! 달님이 바다에 떴네!' }),
  S({ id: 'sea-turtle', gdd: 'd_turtle', name: '느긋이바다거북', rarity: 4, price: 0, model: 'turtle', habitat: 'swim', behavior: 'witness', minDepth: 3, size: [80, 120], len: 100, shadow: 'L', scale: 1, meetOnly: true, witness: true, tags: ['witness'], where: W(['reef'], 'day', { only: ['clear'] }), desc: '천천히, 하지만 아주 멀리 간다. 쓰다듬으면 도감에 적어요(가방엔 안 들어가요).', line: '바다거북이 인사해 줬다! 거북~ 반가워!' }),
  S({ id: 'sea-puffer', name: '복어', rarity: 2, price: 550, model: 'puffer', habitat: 'swim', behavior: 'swim', minDepth: 2, size: [8, 20], scale: 1, where: W(['reef', 'shallow']), desc: '놀라면 동그랗게 부푼다.', line: '복어 잡았다! 복이 어~ 가득!' }),
  S({ id: 'sea-clownfish', name: '흰동가리', rarity: 2, price: 650, model: 'clown', habitat: 'anemone', behavior: 'swim', minDepth: 1.5, size: [6, 11], scale: 1, where: W(['reef']), desc: '말미잘 집에 사는 줄무늬 꼬마.', line: '흰동가리! 집 앞에서 딱 만났다!' }),
  S({ id: 'sea-ray', name: '가오리', rarity: 3, price: 1500, model: 'ray', habitat: 'swim', behavior: 'swim', minDepth: 5, size: [40, 100], scale: 1, where: W(['reef', 'offshore']), desc: '바닷속을 나는 연.', line: '가오리다! 가오~ 살아있네!' }),
  S({ id: 'sea-starfish', gdd: 'd_starfish', name: '별가사리', rarity: 1, price: 90, model: 'starfish', habitat: 'floor', behavior: 'still', minDepth: 0.6, size: [8, 16], scale: 1, where: W(['shallow', 'reef']), desc: '소원 빌면 들어줄 것 같은 얼굴.', line: '불가사리! 소원을 하나 빌어 볼까?' }),
  S({ id: 'sea-conch', gdd: 'd_conch', name: '뿔소라', rarity: 1, price: 180, model: 'conch', habitat: 'floor', behavior: 'still', minDepth: 1, size: [6, 14], scale: 1, where: W(['shallow']), desc: '귀에 대면 파도 소리가 난다.', line: '소라 잡았다! 소라소라~ 노래해!' }),
  S({ id: 'sea-nudibranch', name: '갯민숭달팽이', rarity: 3, price: 1300, model: 'nudi', habitat: 'floor', behavior: 'slow', minDepth: 2, size: [3, 8], scale: 0.9, where: W(['shallow'], 'day'), desc: '바다에서 제일 화려한 옷을 입었다.', line: '갯민숭달팽이! 패션 왕 등장!' }),
  S({ id: 'sea-squirt', gdd: 'd_seasquirt', name: '울퉁불퉁멍게', rarity: 2, price: 340, model: 'squirt', habitat: 'floor', behavior: 'still', minDepth: 1.5, size: [8, 16], scale: 1, where: W(['shallow']), desc: '성격도 울퉁불퉁.', line: '멍게 잡았다! 멍하니 있다 잡혔게!' }),

  // ── GDD 3.3.1 새 종 ──
  S({ id: 'd_seahare', name: '바다토끼군소', rarity: 2, price: seaPrice(2, 'S', 1), model: 'seahare', habitat: 'floor', behavior: 'slow', minDepth: 1.2, size: [10, 20], scale: 1, where: W(['shallow'], 'morning'), desc: '놀라면 보라 잉크를 뿜는다.', line: '군소다! 놀라지 마, 보라 잉크는 안 뿜을게~' }),
  S({ id: 'd_nudibranch', name: '젤리바니(흰)', rarity: 3, price: seaPrice(3, 'XS'), model: 'nudi_white', habitat: 'floor', behavior: 'slow', minDepth: 2.5, size: [2, 4], scale: 1.2, tags: ['set:nudi'], where: W(['reef'], 'day'), desc: '바다의 토끼. 다섯 빛깔을 다 모아 보자!', line: '젤리바니! 바다에도 토끼가 살아요~' }),
  S({ id: 'd_nudibranch_pink', name: '젤리바니(분홍)', rarity: 3, price: seaPrice(3, 'XS'), model: 'nudi_pink', habitat: 'floor', behavior: 'slow', minDepth: 2.5, size: [2, 4], scale: 1.2, tags: ['set:nudi'], where: W(['reef'], 'day'), desc: '볼처럼 발그레한 젤리바니.', line: '분홍 젤리바니! 볼터치가 똑같아~' }),
  S({ id: 'd_nudibranch_yellow', name: '젤리바니(노랑)', rarity: 3, price: seaPrice(3, 'XS'), model: 'nudi_yellow', habitat: 'floor', behavior: 'slow', minDepth: 2.5, size: [2, 4], scale: 1.2, tags: ['set:nudi'], where: W(['reef'], 'day'), desc: '병아리처럼 노란 젤리바니.', line: '노랑 젤리바니! 삐약 아니고 뽀글~' }),
  S({ id: 'd_nudibranch_purple', name: '젤리바니(보라)', rarity: 3, price: seaPrice(3, 'XS'), model: 'nudi_purple', habitat: 'floor', behavior: 'slow', minDepth: 2.5, size: [2, 4], scale: 1.2, tags: ['set:nudi'], where: W(['reef'], 'day'), desc: '라벤더 향이 날 것 같은 젤리바니.', line: '보라 젤리바니! 신비로운 토끼님~' }),
  S({ id: 'd_nudibranch_sky', name: '젤리바니(하늘)', rarity: 3, price: seaPrice(3, 'XS'), model: 'nudi_sky', habitat: 'floor', behavior: 'slow', minDepth: 2.5, size: [2, 4], scale: 1.2, tags: ['set:nudi'], where: W(['reef'], 'day'), desc: '하늘을 닮은 파란 젤리바니.', line: '하늘 젤리바니! 바다 속에 하늘이 떴다~' }),
  S({ id: 'd_mantis_shrimp', name: '펀치왕갯가재', rarity: 3, price: seaPrice(3, 'S'), model: 'mantis', habitat: 'floor', behavior: 'flee', minDepth: 2.5, size: [14, 22], scale: 1, where: W(['reef'], 'day'), desc: '잡히기 전에 원투 펀치. 살금살금 다가가자.', line: '갯가재 잡았다! 펀치는 살살 부탁해!' }),
  S({ id: 'd_baby_octopus', name: '꼬마문어', rarity: 3, price: seaPrice(3, 'S'), model: 'babyocto', habitat: 'floor', behavior: 'hide', minDepth: 2.5, size: [10, 20], scale: 1, where: W(['reef'], 'night'), desc: '숨바꼭질 챔피언. 바위 틈에서 빼꼼.', line: '꼬마문어 찾았다! 숨바꼭질은 내가 이겼어!' }),
  S({ id: 'd_sea_angel', name: '바다나비', rarity: 3, price: seaPrice(3, 'XS'), model: 'seaangel', habitat: 'drift', behavior: 'drift', minDepth: 2, size: [1, 3], scale: 1.6, where: W(['reef'], 'night'), desc: '바닷속을 팔랑팔랑 나는 나비.', line: '바다나비다! 파닥파닥 천사 날갯짓~' }),
  S({ id: 'd_leafy_dragon', name: '이파리용나뭇잎해룡', rarity: 4, price: seaPrice(4, 'S'), model: 'leafy', habitat: 'drift', behavior: 'drift', minDepth: 3, size: [24, 36], scale: 1.15, where: W(['reef'], 'morning'), desc: '해초인 척 연기 30년차.', line: '나뭇잎해룡! 해초인 줄 알았잖아!' }),
  S({ id: 'd_ghost_jelly', name: '유령해파리', rarity: 4, price: seaPrice(4, 'M', 1.3), model: 'ghostjelly', habitat: 'drift', behavior: 'drift', minDepth: 4, size: [30, 50], scale: 1.4, where: W(['wreck'], 'night', { boost: ['fog'], x: 3 }), desc: '난파선 선장의 옛 친구. 안개 낀 밤에 자주 나온다.', line: '유령해파리… 으스스? 아니, 몽글몽글!' }),
  S({ id: 'd_spyglass', name: '선장의망원경', rarity: 4, price: seaPrice(4, 'S', 1.3), model: 'spyglass', habitat: 'floor', behavior: 'relic', minDepth: 0, size: [36, 44], scale: 1, tags: ['relic', 'museum:sea'], where: [{ zone: 'wreck', time: 'all' }], desc: '꿀꺽호 선실에서 나온 박물관 해저관 유물.', line: '선장의 망원경! 저 멀리 보물이 보여~' }),
  // 꼬르륵 해구(trench) — 깊은 곳에서 떠오른 아이들
  S({ id: 'd_plankton', name: '반짝가루플랑크톤', rarity: 1, price: seaPrice(1, 'XS', 1.3), model: 'plankton', habitat: 'drift', behavior: 'swarm', minDepth: 10, size: [1, 1], len: 1, shadow: 'XS', scale: 2.2, where: W(['trench']), desc: '모으면 별가루가 된다.', line: '반짝가루 플랑크톤! 손안에 은하수가 가득!' }),
  S({ id: 'd_crinoid', name: '깃털별바다나리', rarity: 3, price: seaPrice(3, 'S', 1.3), model: 'crinoid', habitat: 'drift', behavior: 'drift', minDepth: 10, size: [20, 30], scale: 1.2, where: W(['trench'], 'night'), desc: '깃털 먼지떨이 같다.', line: '바다나리다! 깃털 먼지떨이 같아~' }),
  S({ id: 'd_deep_cucumber', name: '투명심해해삼', rarity: 2, price: seaPrice(2, 'S', 1.3), model: 'deepcuke', habitat: 'drift', behavior: 'slow', minDepth: 10, size: [16, 24], scale: 1, where: W(['trench']), desc: '속이 다 보이는 해삼.', line: '투명심해해삼! 속마음까지 다 보여~' }),
  // 목격(잡지 않고 만나면 도감에) — 돌고래·고래는 수면 위에서 인사(E, 12m)
  S({ id: 'd_dolphins', name: '돌고래떼', rarity: 2, price: 0, model: 'dolphin', habitat: 'swim', behavior: 'witness', minDepth: 0, size: [200, 300], len: 250, shadow: 'XL', scale: 1, witness: true, meetOnly: true, tags: ['witness'], where: W(['offshore'], 'day'), desc: '배랑 경주하는 걸 좋아한다.', line: '돌고래떼가 반겨 줬다! 끼룩끼룩~' }),
  S({ id: 'd_sealion', name: '바다사자', rarity: 2, price: 0, model: 'sealion', habitat: 'swim', behavior: 'witness', minDepth: 0, size: [180, 220], len: 200, shadow: 'L', scale: 1, witness: true, meetOnly: true, tags: ['witness'], where: [{ island: 'ice', zone: 'icesea', time: 'day' }], desc: '공 굴리기 장인.', line: '바다사자가 공을 굴려 줬다!' }),
  S({ id: 'd_humpback', name: '혹등고래', rarity: 4, price: 0, model: 'whale', habitat: 'swim', behavior: 'witness', minDepth: 0, size: [1200, 1600], len: 1400, shadow: 'XXL', scale: 1, witness: true, meetOnly: true, tags: ['witness'], where: W(['offshore'], 'morning'), desc: '분수에 맞으면 무지개.', line: '혹등고래다! 푸우~ 분수 쇼!' }),
  S({ id: 'd_orca', name: '판다고래범고래', rarity: 5, price: 0, model: 'orca', habitat: 'swim', behavior: 'witness', minDepth: 0, size: [600, 800], len: 700, shadow: 'XXL', scale: 1, witness: true, meetOnly: true, p1: true, tags: ['witness'], where: W(['offshore'], 'sunset'), desc: '잡는 게 아니라 친구가 되는 고래.', line: '판다고래범고래! 오늘부터 친구!' }),
];

export const SEA_BY_ID = new Map(SEA_SPECIES.map((s) => [s.id, s]));
/** 잠수 잡기 굴림에 넣지 않는 것(목격·유물) */
export const isWitness = (s: Pick<SeaSpecies, 'witness' | 'meetOnly' | 'tags'>) => !!(s.witness || s.meetOnly || s.tags?.includes('witness'));
export const isRelic = (s: Pick<SeaSpecies, 'behavior' | 'tags'>) => s.behavior === 'relic' || !!s.tags?.includes('relic');

/** 출현 가중치(희귀도별 — econ 이 없을 때만 쓰는 로컬 굴림, GDD 5.2 W) */
export const RARITY_WEIGHT = [0, 55, 27, 12, 5, 1];
