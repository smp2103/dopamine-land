> ⚠️ 주의: `game.world` 는 코어의 지구/우주 구분 문자열이다. 지역 판정 공유 객체는 **`game.geo`** 다(코어에 자리 있음: `game.env`·`game.econ`·`game.geo`·`game.ocean`).

# 「도파민랜드」 게임 디자인 문서 (GDD v1, 오늘 밤 제작 명세)

> 이 문서는 오늘 밤 1시간 30분 동안 에이전트 11~13명이 **보고 그대로 만드는 명세**다.
> 기획안 3개(벌고 쓰는 수집 섬 / 탐험·세계 / 수집·다양성)를 합쳤다. 기준 화면은 `shots/now/_sheet.jpg`(둥근 나무, 빨간 지붕 집, 2.5등신 아이, 곰 주민, 빛나는 상자, 풍선 선물, 강·폭포·해변, 아침·낮·노을·밤)이다.
> **API·파일 규칙은 `CONTRACT.md`가 정본이다.** 이 문서가 CONTRACT 와 다르면 CONTRACT 를 따르고 결과에 적어라.
> 좌표: x = 동(+)/서(−), z = 남(+)/북(−), 해수면 y = 0. 섬 위치는 이미 코드(`src/core/world.ts` 의 `ISLANDS`)에 있으니 **좌표를 바꾸지 않는다.**

---

## 목차
0. 읽는 법 · 공통 데이터 규격 (모든 담당 필수)
1. 컨셉과 핵심 루프
2. 맵
3. 담당별 제작 명세 (P0 / P1) + 전체 종 데이터
4. 콘텐츠 소비 설계 (가장 중요)
5. 보물상자·확률·천장, 도감·업적
6. 우주
7. 아트 규칙 (엄청 귀엽게)
8. 오늘 밤 통합 순서와 완료 기준

---

# 0. 읽는 법 · 공통 데이터 규격

## 0.1 누가 무엇을 읽나
| 담당 | 꼭 읽을 절 |
|---|---|
| economy | 0, 1, 3.1, 4 전체, 5 전체 |
| world | 0, 2 전체, 3.2 |
| ocean | 0, 2.3~2.4, 3.3(바다 생물 27종), 4.2 |
| flora | 0, 2.2, 3.4, 4.3(재료) |
| fishing | 0, 3.5(물고기 135종), 5.1~5.3 |
| insects | 0, 3.6(곤충 71종), 5.1~5.3 |
| dinos | 0, 2.2(공룡섬), 3.7 |
| vehicles | 0, 3.8, 4.7, 6.2 |
| space | 0, 3.9, 6 전체 |
| characters | 0, 3.10, 4.6 |
| ui | 0, 3.11, 5 전체, 4.1~4.4 |
| village | 0, 2.2, 3.12, 4.5, 4.7 |
| atmosphere | 0, 3.13 |
| **모두** | **7. 아트 규칙** |

## 0.2 파일 소유 (CONTRACT 규칙 5 재확인)
- 자기 모듈 파일(`src/modules/<담당>.ts` + `src/modules/<담당>/**`)만 고친다. 코어(`src/core/*`)는 고치지 않는다.
- 종·아이템 데이터는 `src/modules/<담당>/data.ts` 에 둔다. 모듈 시작 시 `game.state.register(list)` 로 **전부** 등록한다(도감 칸 수가 여기서 정해진다).
- 다른 담당 파일을 import 하지 않는다(동시 작업이라 아직 없을 수 있다). 담당끼리는 **이벤트(`state.emit`/`state.on`)**와 **런타임 공유 객체(0.6)**로만 연결한다.

## 0.3 종 데이터 공통 모양
코어 `Species`(`id, name, category, rarity 1~5, desc, habitat, price`)를 확장한다. 각 담당은 자기 data.ts 에 아래 모양을 쓴다.

```ts
// 각 담당 data.ts 안에 복사해서 쓴다(공용 import 없음)
type Body =
  // 물고기·수생 14
  | 'BALL' | 'SLEEK' | 'FLAT' | 'LONG' | 'DISC' | 'BIGHEAD' | 'HORSE' | 'JELLY'
  | 'OCTO' | 'CRUST' | 'RADIAL' | 'GIANT' | 'SHELL' | 'TAD'
  // 곤충 11
  | 'BUTTERFLY' | 'BEETLE' | 'DRAGONFLY' | 'BEE' | 'HOPPER' | 'SNAIL' | 'MANTIS' | 'SPIDER' | 'STICK' | 'ANT' | 'PUFF'
  // 공룡 5
  | 'QUAD' | 'BIPED' | 'LONGNECK' | 'WING' | 'SWIM';

interface Look {
  body: Body;
  c1: string;          // 바탕색 (0.5 색 이름표의 hex)
  c2?: string;         // 포인트색
  c3?: string;         // 배·안쪽색
  pattern?: 'solid'|'hstripe'|'vstripe'|'spots'|'gradient'|'scales'|'glowdots'|'rainbow'
          |'galaxy'|'bandage'|'heart'|'star'|'constellation'|'huecycle'|'chrome'|'clear'|'taiyaki'|'leaf';
  parts?: string[];    // 0.4 파츠 이름
  glow?: boolean;      // 발광(밤에 bloom)
  eye?: number;        // 눈 크기 배율(기본 1)
  len: number;         // 평균 크기 cm
}

interface Where {
  island: 'home'|'dino'|'ice'|'mushroom'|'coral'|'desert'|'launch'|'islet'|'any'|'moon'|'sugar'|'jelly'|'cloud'|'frost'|'belt'|'blackhole';
  zone: string;        // 3.5·3.6 표의 '장소' 코드
  time: ('morning'|'day'|'sunset'|'night'|'noon'|'midnight')[] | 'all';
  weather?: { only?: Weather[]; boost?: Weather[]; x?: number };  // only = 그 날씨에만, boost = x배(기본 3)
}
type Weather = 'clear'|'rain'|'storm'|'fog'|'meteor'|'snow'|'rainbow'|'aurora'|'sandstorm';

interface SpeciesX /* extends Species */ {
  id: string; name: string; category: 'fish'|'bug'|'sea'|'dino'|'space'|'fossil'|'item';
  rarity: 1|2|3|4|5; desc: string; habitat: string; price: number;   // price 는 0.7 공식으로 계산해 넣는다
  look: Look; where: Where[];
  shadow?: 'XS'|'S'|'M'|'L'|'XL'|'XXL';   // 물고기·잠수 생물
  behavior?: string;                       // 곤충·공룡·잠수 행동 코드
  witness?: boolean;                       // 잡지 않고 만나면(사진·쓰다듬기) 등록
  tags?: string[];                         // 사용처 태그: 'set:rainbow' 'food:carni' 'rocket' 'craft' …
  p1?: boolean;                            // 데이터만 등록, 출현은 나중(우주 다른 행성 등)
}
```

- **시간 코드 ↔ 게임 시각**: morning 05~09시, day 09~17시, sunset 17~21시, night 21~05시, noon 11~13시, midnight 00~02시. 이 네 이름은 `presets.TOD` 의 `morning/day/sunset/night` 과 같다.
- **표의 한국어 표기 ↔ 코드**: 아침=morning, 낮=day, 저녁=sunset, 밤=night, 정오=noon, 자정=midnight, 종일=all. 날씨: 맑음 clear, 비 rain, 폭풍 storm, 안개 fog, 유성우 meteor, 눈 snow, 무지개 rainbow, 오로라 aurora, 모래폭풍 sandstorm.
- 표의 "날씨" 칸이 `전용`이면 `only`, `×3` 이면 `boost`, `-` 면 날씨 무관.
- 도감에는 **P1 종도 전부 등록**한다(실루엣 칸이 많아야 "다 모으고 싶다"가 생긴다). 출현만 나중에 붙인다.

## 0.4 파츠 이름 (모델 담당 공통 어휘)
| 파츠 | 모양 | 파츠 | 모양 |
|---|---|---|---|
| `fan-fin` | 부채 지느러미(여러 장) | `ribbon-fin` | 긴 리본 지느러미 |
| `big-pec` | 큰 가슴지느러미(날치 날개) | `whiskers2` / `whiskers4` | 수염 튜브 |
| `crown` | 작은 금관 | `lantern` / `lantern-heart` | 이마 초롱(발광 구 / 하트) |
| `hump` / `hump2` | 등 혹 1개 / 2개 | `crest` | 볏·갈기 |
| `horn` / `horn3` / `spiral-horn` | 뿔 1 / 3 / 나선 뿔 | `leaf-tubes` | 잎 모양 튜브 여러 개 |
| `flower` | 꽃 한 송이 | `spikes` | 가시(둥근 끝) |
| `claws-big` | 큰 집게 | `legs-long` | 긴 다리 |
| `tentacles6` / `tentacles8` | 촉수 | `ear-fins` | 귀 지느러미 |
| `dome-head` | 투명 돔 머리 | `snout-long` / `spear` | 긴 코 / 창 주둥이 |
| `t-head` | 귀상어 T자 머리 | `fluffy` | 털 구 여러 개 |
| `frill` / `frill-heart` | 공룡 프릴(하트 무늬) | `plates` | 등판 |
| `club-tail` | 꼬리 곤봉 | `sail` | 등 돛 |
| `feathers` | 깃털 볏·몸털 | `dome-skull` | 박치기 돌 머리 |
| `long-claws` | 긴 손톱 | `helmet` | 우주 헬멧(투명 구) |
| `light-tail` | 빛 꼬리 흔적 | `ring` | 토성 고리 |
| `antenna-big` | 큰 더듬이 | `carrot-nose` | 당근 코 |
| `wings-clear` | 투명 날개 | `ball` | 굴리는 공(쇠똥구리) |

## 0.5 색 이름표 (표에 쓰인 색 이름 → hex)
순수 검정·순수 회색 금지. 아래에서 고른다.

| 이름 | hex | 이름 | hex | 이름 | hex |
|---|---|---|---|---|---|
| 빨강 | #ff6b6b | 주황 | #ffa24c | 노랑 | #ffd84a |
| 연두 | #a8e06a | 초록 | #5cc16a | 청록 | #3fc7b4 |
| 하늘 | #8fd3f4 | 파랑 | #4a9cf0 | 남색 | #3b5bb5 |
| 보라 | #a77be0 | 라벤더 | #c9b6f2 | 분홍 | #ff9fb8 |
| 연분홍 | #ffd0de | 산호 | #ff8a7a | 살구 | #ffc59a |
| 흰 | #fffaf2 | 크림 | #fff1cf | 베이지 | #e9d3a8 |
| 모래 | #f4e2b0 | 갈색 | #a8764f | 진갈 | #6e4a33 |
| 올리브 | #9bb35a | 회청 | #8aa0b8 | 회색 | #b8b8c4 |
| 먹색 | #3d3a4a | 은 | #dfe6ee (metal 0.6) | 금 | #ffcf4a (metal 0.7) |
| 민트 | #9ef0d2 | 자주 | #c25b8f | 형광연두 | #c8ff5a |
| 투명 | 하늘 tint, opacity 0.45 | 무지개 | 몸을 따라 hue 0→300 | 은하 | 남색 바탕 + 흰·분홍 점 캔버스 |

## 0.6 런타임 공유 객체와 이벤트 (담당 사이 연결)
코어를 고치지 않으려고 `game` 에 런타임 속성을 붙인다: `(ctx.game as any).econ = api`. 읽는 쪽은 **없을 수 있다고 가정**하고 기본값으로 동작한다.

| 객체 | 만드는 담당 | 내용 |
|---|---|---|
| `game.env` | atmosphere | `{ day, hour /*0~24 실수*/, tod: 'morning'|'day'|'sunset'|'night', weather: Weather, regionWeather(x,z): Weather, moonPhase /*0~1, 0.5=보름*/ }` — 없으면 `{hour:12, tod:'day', weather:'clear'}` |
| `game.econ` | economy | 아래 `EconApi` |
| `game.dex` | ui | `{ open(cat?), toast(text) }` 등 창 열기 |

```ts
interface EconApi {
  priceOf(id: string, size?: number, variant?: 'shiny'|'crown'|'tiny'): number; // 오늘 시세 반영 판매가
  sell(id: string, n: number, shop?: string): number;      // 판 코인 반환
  buy(shopItemId: string): boolean;
  canCraft(recipeId: string): boolean; craft(recipeId: string): boolean;
  donate(id: string): boolean; isDonated(id: string): boolean;
  isUnlocked(key: string): boolean; unlock(key: string): void;
  rollCatch(q: RollQuery): RollResult;                     // 5.2 알고리즘
  openChest(tier: ChestTier, where?: string): Loot[];      // 5.4 표
  stars: number; addStars(n: number, why: string): void;
  market(): { hot: string[]; mult: Record<string, number> };
}
```
`game.econ.rollCatch` 가 아직 없으면 fishing·insects·ocean 은 **5.2 의 의사코드를 로컬로 그대로** 구현한다(결과가 같아야 한다).

**이벤트 이름** (`game.state.emit({type, ...})`)
| type | 보내는 쪽 | 받는 쪽 | 필드 |
|---|---|---|---|
| `collect` / `coins` / `bag` | 코어 state | ui, economy | (코어 그대로) |
| `npc-talk` | characters | ui, economy | `npc` (3.10 id) |
| `open-shop` / `open-craft` / `open-museum` / `open-shipyard` | village(카운터·작업대) | ui | `shop` |
| `sell` / `buy` / `craft` / `donate` | economy | ui, 업적 | `id, n, coins` |
| `unlock` | economy | 모두 | `key` (4.8 해금 키) |
| `chest-open` | village·world·ocean(상자 둔 쪽) | economy → ui | `tier, at` |
| `catch-fail` | fishing·insects·ocean | economy(콤보 리셋), ui | `activity` |
| `env` | atmosphere | 모두 | `tod, weather, hour, day` |
| `discover` | world | ui | `place`(섬·랜드마크 id), `name` |
| `launch` / `arrive` | vehicles / space | ui, atmosphere | `to: 'moon'|'earth'` |
| `befriend` | dinos·characters | economy, ui | `id, hearts` |

**저장(flags) 키** — 모두 `game.state.flags` 아래, 자기 키만 쓴다.
`flags.econ`(economy: stars, keys, unlocks[], donated{}, pity{}, combo, market, house, bagSize, devStage{}), `flags.dino`(친밀도), `flags.vehicles`(소유·스킨), `flags.space`, `flags.world`(발견한 곳), `flags.ui`(설정).

## 0.7 판매가 공식 (economy 가 정본, 다른 담당은 data 의 price 에 같은 식으로 넣는다)
```
price = round10( BASE[★] × SIZE[shadow] × ZONE )
BASE  = { 1: 60, 2: 200, 3: 700, 4: 2500, 5: 9000 }
SIZE  = { XS: 0.7, S: 0.85, M: 1.0, L: 1.3, XL: 1.7, XXL: 2.2 }   // 곤충은 M, 공룡·우주 생물은 표의 크기
ZONE  = home 1.0 · 다른 섬 1.15 · 먼바다/심해/난파선 1.3 · 우주 1.8
```
- 개체 크기: 정규분포(평균 len, 표준편차 len×0.15). 판매가 × (0.85 + 0.3 × (개체 크기 / 최대 크기)).
- **왕관 개체**(크기 상위 1%, z > 2.33): ×3, 머리에 금관. **꼬마**(하위 3%): ×0.8, 피규어 재료로 인기. **반짝이**(1/256): ×5.
- 오늘 시세·판매 포화는 4.4.

## 0.8 크기 → 화면 크기
- 세상 속 모델 길이(m) = clamp(len_cm / 100, 0.18, 8). 너무 작은 건 0.18m 로 키운다(안 보이면 실패).
- **잡았다 들어 올리기**는 종과 상관없이 0.55m(거대종 XL 이상은 1.1m)로 정규화한다. 동숲 문법.
- 그림자 크기(물속): XS 0.35m, S 0.55m, M 0.8m, L 1.2m, XL 1.8m, XXL 2.8m 지름의 타원.

---

# 1. 컨셉과 핵심 루프

## 1.1 한 줄 컨셉
**"줍고 잡는 일은 30초마다, 쓸 곳은 일곱 군데, 다음 목표는 언제나 수평선 너머(옆 섬 → 공룡 섬 → 발사대 → 달)."**
동물의 숲의 귀여움 × 젤다의 "보이는 곳은 다 간다" × 모든 게 확률형인 두근거림. 잡은 친구는 하나도 버리지 않고 어딘가에 쓴다.

## 1.2 이야기 한 줄
"첫날 밤 별똥별이 말랑섬에 떨어졌다. 그 안에서 나온 아기 별토끼 **토토**를 집에 데려다주려고 로켓을 만들다가, 오래전 공룡들 일부가 달로 떠났다는 비밀을 알게 된다."
- 펭귄 **펭박사**는 날고 싶어서 로켓을 설계하는 과학자다(메인 진행 NPC).
- 공룡섬 장로 브라키오 **목길이 할머니**의 전설: "하늘에서 별이 떨어졌을 때 우리 조상 몇몇은 그 별을 타고 달로 갔단다." → 달에 헬멧 쓴 **별공룡**이 산다.

## 1.3 핵심 루프 (시간 단위)
| 주기 | 루프 | 내용 | 담당 |
|---|---|---|---|
| **10초** | 발견 | 걸어서 10초 안에 반짝이는 게 하나 이상: 물그림자, 날아다니는 곤충, 흔들 나무, 두드릴 돌, 반짝 땅(X), 풍선 선물, 떠밀려 온 병편지, 해저 거품 | world·flora·fishing·insects·ocean |
| **30초** | 획득 | 잡기·줍기 1회. 처음 잡은 종이면 도감 도장 "쾅!" + 실루엣이 컬러로. 희귀도별 연출 5단계 | fishing·insects·ocean·ui |
| **5분** | 소비 결정 | 가방(20칸)이 찬다 → 팔기·기증·제작·부탁·전시·투자·보관 중 고른다. **가방이 좁아야 쓰는 재미가 생긴다** | economy·ui |
| **30분 = 게임 하루** | 일일 루틴 | 아침 5분·낮 10분·저녁 5분·밤 10분. 한 번 접속하면 모든 시간대 생물을 본다. 우편함·주민 부탁·오늘의 인기 생물 | atmosphere·economy |
| **1시간** | 섬 하나 | 새 섬 도착 → 발견 팡파르 → 섬 도감 페이지 → 등대 복구 → 다음 섬이 보인다 | world·village |
| **세션 3~5회** | 섬 개발 | 등대 → 부두·다리 → 특산 시설 → 주민 이주 → 섬 별 5개 | economy·village |
| **장기** | 대장정 | 섬 7곳 → 공룡 친구 → 로켓 부품 6개 → 달 → 행성들 → 블랙홀 → 도감 100% | 모두 |

## 1.4 30초 루프 상세 (손맛)
1. 물그림자·풀숲 흔들림·해저 거품을 본다 → 2. 살금살금 다가간다(걷기 = 살금, Shift 달리기 = 들킴) → 3. E → 4. 짧은 미니게임(낚시 "톡·톡·꾹" / 잠자리채 휘두르기 타이밍 / 잠수 쫓아가 줍기) → 5. 잡았다 연출(희귀도별) → 6. 들어 올린 채 한 줄 말장난 → 7. 가방으로.

## 1.5 5분 루프 상세 (가방)
가방이 찬다 → 가까운 부두·마을로 → **처음 잡은 종은 박물관 기증(반짝별)**, 부탁받은 종은 주민에게, 재료로 쓰는 종은 작업대로, 피규어용은 5마리 모으기, 나머지는 꽥꽥상회에 판다(코인) → 코인으로 미끼·도구·탈것·가방 확장 → 다시 나간다.

## 1.6 1시간 루프 상세 (섬)
수평선의 랜드마크(화산 하트 연기, 버섯 탑, 발사탑) → 배로 60~110초 항해 → 섬 도착 "쿵쿵공룡섬 발견!" 카드 → 그 섬에서만 나오는 생물·재료·상자 → 섬 주인 부탁 → 별조각 1개 → 다음 탈것·로켓 부품.

---

# 2. 맵

## 2.1 월드 개요
- 크기: 8km × 8km 바다, x,z ∈ [−4000, 4000], 해수면 y = 0, 기본 해저 −38m(`SEA_FLOOR`).
- 섬 7개(반경 450~650m) + 보물 작은 섬 8개(쪼꼬미섬 A~H). 좌표는 `world.ts` 그대로.
- 시작 마을(룩 테스트 장면)은 **원점**, 시작 섬(home) 남쪽 해안 반도. 원점에서 북쪽으로 섬 본체가 이어진다.
- 이동 속도 기준: 걷기 4 m/s, 달리기 7, 자전거 11, 수영 3, 통통배 25, 모터보트 40. 반경 560m 섬 해안선 3.5km → 걸어서 한 바퀴 약 14분. 섬 사이 1.5~2.9km → 통통배 60~115초.

## 2.2 섬 표 (코드 id 고정, 표시 이름은 이 표가 정본 — ui 가 `ISLAND_NAMES` 로 덮어쓴다)

| id | 표시 이름 | 중심 (x, z) | 반경 | 테마 | 지형 (world) | 구역 (3~5) | 대표 랜드마크 | 고유 생물 요약 |
|---|---|---|---|---|---|---|---|---|
| `home` | **말랑섬** (시작) | (−120, −560) | 560 | 온대 마을·꽃 언덕 | 3단 계단 언덕(동숲식), 북쪽 고원에서 남쪽 바다로 흐르는 강 1줄, 폭포 2개, 연못 2개, 북쪽 해안 절벽, 남쪽 모래사장 | ① 말랑마을 반도(남, 원점) ② 폭포 강 숲(중앙~서) ③ 꽃잎 언덕(북동) ④ 과수원 평원(서) ⑤ 등대 곶(북, 절벽) | 큰 폭포 + 소원나무(느티나무 25m), 거대 벚나무 **할미벚**(40m, 꽃잎이 계속 흩날림), 무지개 풍차, 등대 | 민물고기 21, 해안 13, 곤충 21, 꽃잎 언덕의 하트 연못 생물 |
| `dino` | **쿵쿵공룡섬** | (1750, −900) | 650 | 공룡 계곡·화산·정글 | 가장 큰 섬. 북쪽 화산(높이 120m, 분화구 지름 80m, 하트 연기), 중앙 넓은 초원 계곡, 남·서 정글, 동남 늪, 북서 해안 절벽, 온천 3곳, 강 1줄 | ① 해안 정글(남·서, 말랑섬 쪽) ② 초원 계곡(중앙, 무리) ③ 화산 기슭(북·동, 용암 동굴·온천) ④ 늪(동남) ⑤ 둥지 절벽(북서 해안) | **하트 연기 화산**, 티노 낮잠 언덕, 브라키오 거목 숲, 고대 호수 | 공룡 20, 고대어 10, 고대 곤충 8, 화석 X 3배 |
| `ice` | **솜눈섬** | (−1900, −1550) | 600 | 설원·빙하·오로라 | 설산(정상 140m, 북) 썰매 슬로프, 꽁꽁 언 호수(서, 얼음 구멍), 빙하 절벽, 간헐천 온천 골짜기(중앙), 펭귄 해변(남동) | ① 펭귄 해변(남동, 말랑섬 쪽) ② 눈사람 마을·간헐천(중앙) ③ 얼음 호수(서) ④ 설산 슬로프(북) ⑤ 오로라 언덕(북서) | 바다에 뜬 **얼음 성 빙산**(남동 앞바다 250m), 오로라 전망대, 설산 | 얼음낚시 10, 곤충 7, 매머드·검치호·털공룡 |
| `mushroom` | **반딧불버섯섬** | (−1750, 1100) | 520 | 거대 버섯숲·늪·밤의 섬 | 키 큰 이끼 나무 + 집채만 한 버섯, 늪(남), 안개 호수(서), 뿌리 다리, 이끼 폭포, 낮엔 차분하고 **밤에 섬 전체가 빛남** | ① 버섯 마을(동, 말랑섬 쪽) ② 거대 버섯숲(중앙) ③ 반딧불 늪(남) ④ 안개 호수(서) ⑤ 뿌리 계곡(북) | **빛나는 버섯 탑**(60m, 나선 계단), 잠든 거인 나무, 남서 해안 좌초 유령선 | 늪 생물 9, 밤 곤충 9, 발광 식물 |
| `coral` | **산호빛섬** | (900, 1500) | 480 | 열대 석호·야자·맹그로브 | 가운데가 움푹 꺼진 **무지개 석호**(얕은 물), 바깥 산호초 고리, 동쪽 맹그로브 수로, 서쪽 정글 폭포, 검은 모래 해변 | ① 야자 해변(북, 말랑섬 쪽) ② 무지개 석호(중앙) ③ 정글 폭포(서) ④ 맹그로브 수로(동) ⑤ 산호초 고리(바다 둘레 80~250m) | 흰 등대 + 무지개 석호, 코코넛 탑, 거북 산란 해변(밤) | 열대어 18, 잠수 생물 다수, 열대 곤충 9 |
| `desert` | **모래시계섬** | (2650, 1050) | 550 | 사막·오아시스·유적 | 노을빛 모래 언덕(중앙, **모래 낚시**), 협곡 미로(북), 오아시스 + 야자(서), 피라미드 유적(동), 화석층 절벽(남), 모래 폭포 | ① 오아시스 바자르(서, 말랑섬 쪽) ② 모래 언덕(중앙) ③ 협곡 미로(북) ④ 피라미드 유적(동) ⑤ 화석층 절벽(남) | **모래 피라미드**(내부 퍼즐, P1), 모래 폭포, 오아시스 | 오아시스·모래 물고기 9, 사막 곤충 8, 화석 많음 |
| `launch` | **별똥별섬** (발사장) | (300, −2350) | 450 | 고원 메사·크레이터·발사장 | 가운데 높은 고원 메사(발사장), 동쪽 **크레이터 호수**(옛 별똥별 자리, 물이 은하색), 북쪽 천문대 언덕, 서쪽 운석 정원, 남쪽 바람개비 초원 | ① 바람개비 초원(남, 말랑섬 쪽) ② 발사장 메사(중앙) ③ 크레이터 호수(동) ④ 천문대 언덕(북) ⑤ 운석 정원(서) | **발사탑**(80m, 부품을 넣을수록 단계적으로 완성 — 말랑섬 등대 곶에서 보인다), 둥근 천문대 | 별자리 물고기 12, 우주 예고 곤충 9 |
| `islet-a`~`h` | **쪼꼬미섬 A~H** | world.ts 그대로 | 55~120 | 야자 1~3그루 무인도 | 모래 언덕 하나 | — | 보물상자 1~2(15% 미믹 상자게), 병편지 보물지도 목적지 | 랜덤 해안 생물 |

**섬 발견 순서(설계 의도)**: 말랑섬 → (뗏목) 산호빛섬·반딧불버섯섬 → (통통배) 쿵쿵공룡섬·솜눈섬 → (모터보트) 모래시계섬 → 별똥별섬(가깝지만 **발사장 시설은 섬 4곳 등대 복구 후** 열림) → 달. 섬 자체는 배만 있으면 어디든 갈 수 있다(오늘 밤 하드 잠금 없음, 4.8).

### 2.2.1 섬마다 "1시간" 밀도 체크리스트 (world·flora·village·fishing·insects 공통)
- **60~80m마다 뭔가 하나**: 상자, 채집물, 생물 무리, 경치 벤치, 표지판, 꽃밭, 동굴 입구, 풍선 선물.
- 섬마다: 대표 랜드마크 1 + 볼거리(POI) 10~14 + **숨은 곳 3** + 보물상자 40(고정 20 + 매일 다시 생기는 20) + 낚시터 4~6 + 화석 X 하루 4개 + 두드릴 돌 5 + 열매 나무 20그루 이상 + 주민 2.
- **3층 고도**: 해안 → 평지 → 언덕 → 정상. 정상에서 다른 섬 랜드마크가 보인다(다음 목적지 예고).
- 랜드마크는 청크와 별도로 **먼 거리 저해상도 LOD 를 항상** 띄운다("보이는 곳은 다 간다").

### 2.2.2 섬별 숨은 곳 (P1, 자리만 P0 로 비워 둔다)
| 섬 | 숨은 곳 ① | ② | ③ |
|---|---|---|---|
| home | 큰 폭포 뒤 동굴(첫 별조각) | 북쪽 절벽 아래 작은 해변(아침에만 금상자) | 숲 속 그루터기 원형 광장(보름 밤 요정 버섯 링) |
| dino | 분화구 안 용암석 정원 | 고대 벽화 동굴("로켓 탄 공룡" 그림) | 해안 동굴 → 해저 거품동굴 |
| ice | 빙하 속 얼어붙은 아기 매머드(녹이면 친구) | 오로라 밤에만 열리는 얼음 동굴 | 눈사태 뒤 상자 무덤 |
| mushroom | 버섯 탑 꼭대기 달 관측대 | 늪 한가운데 떠 있는 오두막 | 거인 나무 속 방 |
| coral | 석호 바닥 대왕조개 속 진주 | 해적 동굴 | 썰물 때만 드러나는 모래톱 길(쪼꼬미섬 C 까지) |
| desert | 모래폭풍 뒤 고대 신전 | 협곡 바닥 지하수 동굴 | 화석 절벽 꼭대기 "완전한 티라노 화석" |
| launch | 크레이터 바닥 운석 속 공간 | 메사 절벽 활공 출발대 | 바다 속 별빛 탐사선 블랙박스 |

## 2.3 바다 구역 (world·ocean)
판정은 `island.surfaceAt(x,z).coastDist`(가장 가까운 해안까지 거리)로 한다.

| 구역 | 판정 | 깊이 | 물색 | 들어가는 법 | 대표 생물 |
|---|---|---|---|---|---|
| **얕은 바다** | 해안에서 0~150m | 0~6m | 맑은 청록 #7fe0d6 | 맨몸 수영·해변 낚시 | 해안 13종, 잠수 줍기 10종 |
| **산호초** | 산호빛섬 둘레 80~250m 고리 + 말랑섬 남쪽 만(원점 남쪽 40~200m) | 3~12m | 청록 + 산호 색 바닥 | 맨몸 잠수(20초) → 스노클(40초) | 산호 낚시 11종, 잠수 6종 |
| **먼바다** | 해안에서 150m 이상 | 12~38m | 남색 #3aa3cf → #2a6fb0 | 배 위 낚시(트롤링) | 먼바다 8종, 고래·돌고래 목격 |
| **꼬르륵 해구** | 타원 중심 (−500, 3200), 반축 1400×500(x×z) + 월드 가장자리 고리(원점에서 3700m 이상) | 해구 −60~−120m, 가장자리 −60m | 짙은 남색, 발광 생물 점 | 잠수정 | 심해 9종, 메갈로돈 아기, 모사사우루스 목격 |
| **해류 고속도로** | 섬을 잇는 폭 40m 하얀 물결 띠(아래 경로) | — | 흰 거품 줄 | 배로 타면 +8 m/s, 수영하면 튜브처럼 떠내려감 | 날치 떼 |

**해류 경로(시계 방향 고리, 폴리라인)**: 원점 앞바다 (0, 120) → (900, 1050) 산호빛섬 북 → (2150, 1050) 모래시계섬 서 → (1750, −300) 공룡섬 남 → (300, −1950) 별똥별섬 남 → (−1500, −1300) 솜눈섬 동 → (−1350, 900) 버섯섬 동 → (−200, 300) 원점 서 → 처음으로.

> **world 주의**: 해구 깊이 −120m 는 지금 `SEA_FLOOR = −38` 보다 깊다. world 가 해구 구역에서만 해저를 더 판다(`island.ts` 수정은 코어라 금지 → `worldterrain` 모듈의 해저 메시를 해구 구역에서 더 내려 그리고, 판정은 ocean 이 같은 타원 식으로 한다).

## 2.4 항해 랜드마크
| 이름 | 위치 (x, z) | 내용 | 담당 |
|---|---|---|---|
| 등대 7개 | 섬마다 말랑섬(원점) 방향 해안 | 밤에 빛 회전. 복구 전엔 꺼져 있음 → 복구하면 빠른 이동 정류장 | village (P0 외형) |
| 부표 우체통 ① | (800, −480) | 말랑↔공룡 사이. 편지·선물, 빠른 이동 정류장 개발 가능(P1) | village·ocean |
| 부표 우체통 ② | (450, 760) | 원점↔산호 | 〃 |
| 부표 우체통 ③ | (−880, 560) | 원점↔버섯 | 〃 |
| 부표 우체통 ④ | (−1000, −1060) | 말랑↔솜눈 | 〃 |
| 부표 우체통 ⑤ | (2200, 80) | 공룡↔모래시계 | 〃 |
| 부표 우체통 ⑥ | (−200, −1500) | 말랑↔별똥별 | 〃 |
| 해적 난파선 **꿀꺽호** | (−650, 650), 깊이 −14 | 얕음. 잠수로 갑판·선실 보물상자(은), 곰치·유령해파리 | ocean |
| 유령선 **으스스호** | (−2700, 2000), 깊이 −20 | 반딧불버섯섬 남서. 밤 + 안개에 반투명 보라 유령선이 수면에 뜬다(P1 연출), 해적 보물 | ocean |
| **별빛 탐사선**(UFO 잔해) | (1100, −2900), 깊이 −30 | 별똥별섬 북동. 우주 복선(블랙박스), 은하나비 | ocean |
| 소용돌이 | (3200, −2600) | 표류 보물상자가 빙글빙글. 배로 가장자리를 돌면 상자 회수(P1) | ocean |
| 고래 길 | 원점 ↔ 모래시계섬 직선 | 혹등고래가 물 뿜는 이벤트(분수에 맞으면 무지개 + 코인 비, P1) | ocean |
| 얼음 성 빙산 | (−1650, −1250) | 솜눈섬 앞바다. 일각돌고래가 근처에 | world |

---

# 3. 담당별 제작 명세

> 모든 담당 공통 P0 조건: ① 청크 스트리밍으로(CONTRACT), ② 7장 아트 규칙 통과, ③ `node scripts/shot.mjs` 로 **눈으로 확인한 스크린샷** 1장 이상, ④ `npx tsc --noEmit` 자기 파일 오류 0.

## 3.1 economy — 재화·상점·제작·박물관·부탁·해금·저장 (데이터와 규칙)
**파일**: `src/modules/economy.ts`, `src/modules/economy/{data.ts, roll.ts, recipes.ts, shop.ts, chests.ts, market.ts}`

**P0 (오늘 밤 반드시)**
1. `game.econ` (0.6 `EconApi`) 를 **작업 시작 20분 안에** 붙인다(다른 담당이 부른다). 처음엔 빈 함수라도 된다.
2. 재화 4종: 도파코인(코어 `coins`), 반짝별, 열쇠 조각 3색(은·금·무지개), 캡슐 티켓. 4.1.
3. 재료 아이템 30종 등록(category `'item'`, 4.3 표).
4. 판매: 0.7 공식 + 오늘의 인기 3종 ×2 + 판매 포화(4.4). `sell()` 이 `addCoins` 와 `addItem(id, −n)` 을 같이.
5. 상점 품목 표(4.5)와 `buy()`.
6. 제작: 레시피 P0 20개 이상(4.6 의 P0 표시), `canCraft/craft`.
7. 박물관 기증: `donate()` → 첫 기증 반짝별(5.6), `flags.econ.donated`.
8. 해금 키(4.8) `isUnlocked/unlock` + `unlock` 이벤트.
9. `rollCatch` (5.2) + 천장(5.3) + 콤보 + 일일 첫 잡기 ★3 확정.
10. `openChest` (5.4 표).
11. 가방 20칸 제한(4.2) — 넘치면 `ui.toast("가방이 꽉 찼어요!")` 하고 바닥에 내려놓기(P1) 대신 못 줍게.
12. 저장: 코어 state 의 save 를 쓰고, 자기 상태는 `flags.econ` 에.
13. **치트(테스트용)**: URL `?cheat=1` 이면 코인 100만, 반짝별 999, 모든 재료 99, 모든 탈것 해금. `?p0=1`(기본 켜짐) 이면 4.9 의 **P0 테스트 수치**(비용 1/5)로 돈다.

**P1**: 일일 미션 5개(4.10), 주민 부탁 생성기(4.6), 섬 개발 기부함(4.7), 캡슐머신, 피규어 공방, 세트 보너스(4.11), 시세 섬별 상인, 우편함.

## 3.2 world — 군도 지형·섬별 생성기·바다·강·호수·청크 지형
**파일**: 기존 `src/modules/worldterrain.ts` (+ 폴더)

**P0**
1. 2.2 표의 7개 섬 지형을 섬 테마별로 다르게: 고도 프로필(home 계단 언덕 / dino 화산+계곡 / ice 설산 / mushroom 낮은 언덕+늪 / coral 링(가운데 석호) / desert 모래 언덕+메사 / launch 중앙 메사+크레이터), 해안 노이즈, 표면 색(`surfaceAt.kind`: grass·sand·snow·jungle·desert·lava·rock).
2. 섬마다 구역(2.2) 판정 함수 `zoneAt(x,z) → {island, zone}` 를 모듈 안에 만들고, `game.geo = { zoneAt, landmarks }` 로 공유(fishing·insects 가 쓴다). 구역 코드: 3.5·3.6 표의 '장소' 코드와 같게.
3. 강·호수·연못·늪·온천·오아시스·크레이터 호수의 물(낚시가 되는 물). 섬마다 낚시터 4~6.
4. 바다: 얕은 바다/먼바다 색 변화, 해구 구역 깊게(2.3 주의).
5. 랜드마크 **자리 표시 + 원거리 LOD**: 화산(하트 연기는 atmosphere), 할미벚, 버섯 탑, 발사탑 자리, 얼음 성 빙산, 피라미드, 석호 등대 — 모양은 크고 단순하게(먼 거리 실루엣이 중요).
6. 섬 도착 감지 → `discover` 이벤트(섬마다 처음 1회, 랜드마크 반경 40m 처음 1회).
7. 동굴 입구 자리(섬마다 1~3, 안은 P1).

**P1**: 숨은 곳 내부(2.2.2), 썰물 모래톱, 해류 띠 시각(ocean 과 협의), 섬 개발 단계별 지형 변화(다리 자리).

## 3.3 ocean — 항해·수영·잠수·해양 생물·난파선
**파일**: `src/modules/ocean.ts`, `src/modules/ocean/**`

**P0**
1. **수영**: 물에 들어가면 `mode 'swim'`(코어). 체력(헤엄 게이지) 100: 얕은 바다에선 회복, 먼바다(해안 200m 밖)에선 초당 −1. 0 이 되면 "둥둥 튜브" 연출로 가장 가까운 해변까지 1.5초 페이드 이동(벌칙 없음). 게이지는 플레이어 머리 위 작은 물방울 링.
2. **잠수**: 수영 중 C → `mode 'dive'`. 산소 방울 게이지: 맨몸 20초, 스노클 마스크 40초, 잠수복 90초(해금 키 `tool:snorkel`, `tool:wetsuit`). 0 이면 자동 상승.
3. **거품 그림자 채집**: 해저에 거품이 뽀글 오르는 그림자 → 다가가 1.5m 안에서 E → 잡았다. 일부는 도망(행동 `flee`: 갯가재·꼬마문어). 구역별 출현 3.3.1.
4. **배 부력**: vehicles 가 만든 배가 뜨도록 `waterLevelAt` + 파도 높이 함수 `waveAt(x,z,t)` 를 `game.ocean = { waveAt }` 로 공유.
5. 바다 생물 데이터 28종 등록(3.3.1), 이 중 P0 출현 15종 이상(얕은 바다·산호초).
6. 해저 장식: 산호(회전체 + 구), 해초(튜브 흔들림), 조개, 모래 물결. 청크 radius 150.
7. 난파선 **꿀꺽호** 1척(통통한 해적선, 기울어진 돛대, 선실 안 은상자 1).

**P1**: 해류 띠, 유령선·별빛 탐사선, 고래 길 이벤트, 돌고래 떼 나란히 헤엄치기, 잠수정 심해 채집, 병편지 표류, 바다 위 보물상자 표류, 갈매기가 물건 훔쳐가기.

### 3.3.1 바다 생물 (잠수 채집 · 목격) — category `'sea'`
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 행동 | 형태 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|---|
| d_urchin | 밤송이성게 | shallow(바위) | 종일 | - | 1 | XS/8 | still | RADIAL + spikes | 보라 | 바다에 떨어진 밤송이. |
| d_starfish | 별가사리 | shallow(모래) | 종일 | - | 1 | XS/12 | still | RADIAL 5갈래 | 주황 + 크림 점 | 소원 빌면 들어줄 것 같은 얼굴. |
| d_seacucumber | 물컹이해삼 | shallow | 밤 | - | 1 | S/20 | still | LONG 짧게 + 돌기 | 갈색 | 물컹 말고 할 말이 없다. |
| d_scallop | 부채가리비 | shallow(모래) | 낮 | - | 1 | S/10 | hop(톡 튐) | RADIAL 조개 | 주황 줄 | DIY 재료 1순위. |
| d_crab | 옆걸음꽃게 | shallow·해변 | 종일 | - | 1 | S/12 | flee(옆으로) | CRUST | 주황 | 앞으로 가 본 적 없다. |
| d_conch | 뿔소라 | shallow(바위) | 종일 | - | 1 | S/10 | still | SHELL 나선 + 뿔 | 크림 + 갈색 줄 | 귀에 대면 파도 소리. |
| d_abalone | 복이전복 | shallow(바위) | 낮 | - | 2 | S/12 | still | 납작 조개 | 올리브 / 안쪽 무지개 | 복을 부르는 조개. |
| d_seasquirt | 울퉁불퉁멍게 | shallow(바위) | 종일 | - | 2 | S/12 | still | 돌기 구 | 빨강 | 성격도 울퉁불퉁. |
| d_seahare | 바다토끼군소 | shallow(해초) | 아침 | - | 2 | S/15 | slow | 젤리 몸 + 귀 2 | 갈색 + 크림 점 | 놀라면 보라 잉크. |
| d_pearl_oyster | 진주굴 | shallow·wreck | 종일 | - | 3 | S/10 | still | 울퉁 조개 | 회청 | 20%로 진주(★1~5) 드롭. |
| d_nudibranch | 젤리바니갯민숭달팽이 | reef | 낮 | - | 3 | XS/3 | slow | 젤리 몸 + 토끼 귀 2 | 5색 변이(흰·분홍·노랑·보라·하늘) | 바다의 토끼. 5색 세트. |
| d_mantis_shrimp | 펀치왕갯가재 | reef | 낮 | - | 3 | S/18 | flee(빠름) | CRUST | 무지개 갑각 | 잡히기 전에 원투 펀치. |
| d_baby_octopus | 꼬마문어 | reef(바위 틈) | 밤 | - | 3 | S/15 | hide(숨었다 나옴) | OCTO | 산호 | 숨바꼭질 챔피언. |
| d_sea_angel | 바다나비 | reef | 밤 | - | 3 | XS/2 | drift | JELLY 날개형 | 투명 + 보라 | 바닷속 나비. |
| d_leafy_dragon | 이파리용나뭇잎해룡 | reef(해초 숲) | 아침 | - | 4 | S/30 | drift | HORSE + leaf-tubes | 연두 + 노랑 | 해초인 척 연기 30년차. |
| d_giant_clam | 진주왕대왕조개 | reef 바닥 | 낮 | 맑음 전용 | 4 | L/100 | still(입을 열었다 닫음) | RADIAL 조개 | 청록 + 무지개 입술 | 열 때마다 진주를 확률로 준다. |
| d_ghost_jelly | 유령해파리 | wreck | 밤 | 안개 ×3 | 4 | M/40 | drift | JELLY | 투명 + 라벤더 발광 | 난파선 선장의 옛 친구. |
| d_spyglass | 선장의망원경 | wreck(꿀꺽호 선실) | 종일 | - | 4 | S/40 | still | (유물) 금속 원통 | 금 + 갈색 | 박물관 해저관 유물. |
| d_mimic_crab | 상자게 | islet·wreck 상자 | 상자 열 때 3% | - | 3 | S/20 | flee(상자 들고 도망) | CRUST + 등에 상자 뚜껑 | 갈색 + 금 | 보물상자인 척하는 미믹. 잡으면 상자 2개를 토한다. |
| d_plankton | 반짝가루플랑크톤 | deep | 종일 | - | 1 | XS/1 | swarm | 발광 점 무리 | 하늘 발광 | 모으면 별가루 재료. (P1 잠수정) |
| d_crinoid | 깃털별바다나리 | deep 입구 | 밤 | - | 3 | S/25 | still | RADIAL + 깃털 팔 10 | 자주 | 깃털 먼지떨이 같다. (P1) |
| d_deep_cucumber | 투명심해해삼 | deep | 종일 | - | 2 | S/20 | slow | LONG + clear | 투명 분홍 | 속이 다 보이는 해삼. (P1) |
| d_turtle | 느긋이바다거북 | reef | 낮 | 맑음 | 4 | L/100 | witness(쓰다듬기) | SHELL 큰 것 | 올리브 + 크림 | 쓰다듬으면 등록 + 등에 매달려 이동. |
| d_dolphins | 돌고래떼 | offshore | 낮 | - | 2 | XL/250 | witness(배 옆에서 점프) | GIANT 작게 | 하늘 + 흰 배 | 배랑 경주하는 걸 좋아한다. |
| d_sealion | 바다사자 | ice 펭귄 해변 | 낮 | - | 2 | L/200 | witness | SHELL 없이 BALL 길쭉 + 지느러미 | 갈색 | 공 굴리기 장인. |
| d_humpback | 혹등고래 | offshore 고래 길 | 아침 | - | 4 | XXL/1400 | witness(물 뿜기) | GIANT | 남색 + 흰 혹 | 분수에 맞으면 무지개. (P1) |
| d_orca | 판다고래범고래 | offshore | 저녁 | - | 5 | XXL/700 | witness | GIANT | 먹색 + 흰 판다 무늬 | 잡는 게 아니라 친구가 되는 고래. (P1) |
| d_gold_jar | 금화단지 | wreck | 종일 | - | 3 | S/30 | still | 둥근 항아리 | 금 + 갈색 | 열면 코인 1,000~5,000. (아이템, 도감 X) |

## 3.4 flora — 섬별 식물·과일·흔들기
**파일**: 기존 `src/modules/flora.ts` + `flora/**`

**P0**
1. 섬별 식생(아래 표)을 청크로: 나무 radius 450, 풀꽃 radius 120. 같은 종류는 InstancedMesh.
2. **나무 흔들기**(E): 과일 1~3개 떨어짐(물리 굴러감, 줍기 E). 5%로 코인 주머니(100~1,000), 3%로 벌집(벌떼 → insects), 2%로 가구(P1, 지금은 코인으로). 나무마다 하루 1회.
3. **돌 두드리기**(E, 망치): 돌 5개/섬. 하루 8번까지, 연타 콤보 시 철광석·금광석 확률↑. 결과: 돌 60%, 점토 15%, 철광석 15%, 금광석 3%, 섬 특산 재료 7%(dino 화산유리, ice 얼음결정, desert 모래유리, launch 운석조각).
4. 나무 베기(망치=도끼 겸): 나무 재료(하루 나무당 3개). 단단한 나무 20%.
5. 꽃 줍기: 꽃 → 꽃잎(재료). 덩굴(coral·mushroom 나무에서 E).
6. 발광 식물: 밤에 bloom(버섯섬 발광버섯 6색, 크레이터 별사과).

**P1**: 꽃 교배(색 변이, 황금장미 1%), 민들레 홀씨(불면 하루 뒤 꽃), 네잎클로버(0.5%, 행운 버프), 회전초(굴러가는 걸 잡으면 상자), 심기·물주기, 과일 먹으면 힘(바위 부수기).

| 섬 | 나무 | 꽃·풀 | 특수 식물 | 과일·채집물(아이템 id) |
|---|---|---|---|---|
| home | 둥근 활엽수(지금 룩), 사과·복숭아·체리·오렌지·배 과일나무, 소나무, **벚나무**(꽃잎 언덕) | 튤립·장미·코스모스·팬지·데이지, 유채 띠(꽃잎 언덕은 색깔 띠로 위에서 보면 무지개 줄) | 할미벚(랜드마크, world 와 같은 자리), 소원나무 | m_apple, m_peach, m_cherry, m_orange, m_pear, m_petal, m_wood |
| dino | 소철, 나무고사리, 은행나무, 거대 고사리 | 용암꽃(빨강 발광), 이끼 | 브라키오가 먹는 높은 나무(열매가 높이 12m) | m_fern, m_ginkgo, m_volcanic(돌) |
| ice | 눈 덮인 전나무, 눈꽃나무(서리 열매) | 얼음꽃(투명 결정) | 간헐천 주변 초록 풀 | m_frostberry, m_icecrystal(돌) |
| mushroom | 이끼 나무, 거대 버섯(집채만 함, 갓 위에 올라갈 수 있음) | 발광 버섯 6색, 수정 꽃(밤에 핌), 고사리 | 우산버섯(P1: 뽑으면 우산) | m_spore, m_glowcap, m_vine |
| coral | 야자·코코넛·바나나, 맹그로브 | 히비스커스, 해변 풀 | 코코넛 탑 | m_coconut, m_banana, m_vine |
| desert | 대추야자, 선인장(기둥·공·부채) | 사막꽃 | 회전초(P1) | m_date, m_cactusflower, m_sandglass(돌) |
| launch | 별사과나무(별 모양 열매, 밤에 은은히 빛남), 바람에 휘는 풀 | 유성초(푸른 별꽃) | 바람개비 | m_starapple, m_meteor(돌) |
| moon (space) | 사탕나무(P1), 결정 덤불 | 달꽃(흰 발광) | — | m_moonflower |

## 3.5 fishing — 낚시 시스템 + 물고기·수생 135종
**파일**: `src/modules/fishing.ts`, `src/modules/fishing/{data.ts, body.ts, minigame.ts}`

**P0 시스템**
1. 물가(강·연못·호수·바다·늪·온천·크레이터)에서 `addProvider` 로 "E 낚시하기". 낚싯대가 기본 지급(첫 실행 `has('t_rod')` 없으면 지급).
2. 캐스팅(E) → 찌가 3~10m 앞에 떨어짐 → 주변 반경 6~12m 에 **물그림자 1~3개**(구역 후보에서 미리 `rollCatch` 로 정해 둔 종). 그림자 크기 = 종의 shadow. **★4 이상은 지느러미가 보이고, ★5·반짝이는 가장자리 금빛 반짝 파티클.**
3. 그림자가 찌로 다가옴 → **톡(0.8~2.5초 뒤) · 톡 · 꾹!** 꾹에 찌가 쑥 잠기고 물보라. 꾹 후 E 입력 창: ★1~3 0.7초, ★4 0.55초, ★5 0.45초(좋은 낚싯대 +0.1초). 톡에 누르면 도망(`catch-fail`).
4. 성공 → `game.ui.showCatch({species, sizeText, model, line})`. 크기는 0.7 의 정규분포. 왕관·꼬마·반짝이 판정.
5. 쓰레기: 캐스팅의 8%(미끼 없을 때 12%): 장화 35%, 깡통 35%, 해초 15%, **녹슨 열쇠(은열쇠 조각) 10%**, **병편지 5%**.
6. 몸형 14종 모델 생성기(`body.ts`): 0.3 `Look` → THREE.Group. 7장 귀여움 규칙(눈·볼터치·스쿼시) 필수. **종 하나하나 손으로 만들지 말고 파라미터로.**
7. 135종 데이터 전부 등록(아래 표). P0 출현: home·shore·coral·ice·launch 구역 + 나머지는 데이터만 있어도 그 섬에 가면 출현(조건 함수가 같으므로 사실상 전부 출현).
8. 미끼(P0 데이터 + 효과): 지렁이(기본, 효과 없음), 떡밥(★2 이상 ×1.3), 반짝 루어(★3 이상 ×1.5), 황금 미끼(★5 ×3). 화산 미끼(용암붕어 전용 조건).

**P1**: ★4 이상 **릴 줄다리기**(텐션 게이지: 좌우로 끄는 물고기, E 연타로 당기고 빨간 영역이면 놓음), 트롤링(배 뒤 낚시), 모래 낚시(사막 언덕 위 그림자), 얼음 구멍 미니게임, 협동 릴(친구), 스피노와 낚시 대결.

**종 표 읽는 법**: 장소 코드 = world `zoneAt` 의 zone. 크기 = 그림자/평균 cm. ★ = 희귀도. 몸형·파츠 = 0.3·0.4, 색 = 0.5.

### 3.5.1 말랑섬 민물 (zone: river·pond·waterfall·heartpond·estuary) — 21종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_medaka | 꼬물송사리 | river | 종일 | - | 1 | XS/4 | SLEEK | 연두, 투명 꼬리 | 제일 먼저 만나는 친구. 꼬물꼬물. |
| f_crucian | 말랑붕어 | pond·river | 종일 | - | 1 | S/15 | BALL | 주황 / 은 배 | 볼을 누르면 말랑할 것 같다. |
| f_chub | 쌩쌩피라미 | river | 아침·낮 | - | 1 | S/10 | SLEEK | 은 + 분홍 hstripe | 너무 빨라서 사진이 늘 흔들린다. |
| f_crayfish | 뾰로통가재 | river | 저녁·밤 | - | 1 | S/12 | CRUST + claws-big | 빨강 | 집게를 치켜들고 화난 척한다. |
| f_tadpole | 개굴올챙이 | pond | 아침 | - | 1 | XS/5 | TAD | 먹색 / 크림 배 | 다음 날 개구리 스티커를 준다. |
| f_loach | 꽃수염미꾸라지 | pond | 종일 | 비 ×3 | 1 | S/15 | LONG + whiskers4(끝이 꽃) | 베이지 + 갈색 spots | 비 오면 춤춘다. |
| f_sakura_medaka | 벚꽃송사리 | heartpond | 낮 | - | 1 | XS/4 | SLEEK | 연분홍 clear | 꽃잎 하나가 헤엄치는 줄. |
| f_koi | 볼빨간잉어 | pond | 낮 | - | 2 | M/50 | SLEEK + whiskers2 | 흰 + 빨강 볼 무늬 | 부끄러움을 많이 타는 비단잉어. |
| f_petal_goldfish | 꽃잎금붕어 | heartpond | 낮 | - | 2 | S/12 | BALL + hump + 꽃잎 꼬리 4장 | 빨강·흰 | 엉덩이를 씰룩거리며 헤엄친다. |
| f_sleepy_catfish | 졸린메기 | river | 밤 | 비 ×2 | 2 | L/70 | BIGHEAD + whiskers2, 반쯤 감은 눈 | 회청 | 낮엔 자고 밤에도 졸리다. |
| f_softshell | 동글자라 | pond | 낮 | 맑음 ×2 | 2 | M/30 | SHELL 납작 | 올리브 | 목을 쭉 내밀었다가 자기가 놀란다. |
| f_salmon | 폭포타기연어 | waterfall | 저녁 | - | 2 | L/70 | SLEEK | 남색 등 / 분홍 배 | 꿈은 폭포 꼭대기. |
| f_ribbon_betta | 리본베타 | heartpond | 저녁 | - | 3 | S/7 | DISC + ribbon-fin | 보라→파랑 gradient | 지느러미만 몸의 세 배. |
| f_axolotl | 솜사탕우파루파 | pond | 밤 | - | 3 | S/20 | TAD + crest(깃털 6) | 분홍 | 늘 웃고 있다. 이유는 모른다. |
| f_rainbow_trout | 무지개송어 | waterfall·river | 종일 | 무지개 전용 | 3 | M/45 | SLEEK | rainbow | 비 갠 뒤에만 기분이 좋다. |
| f_leopard_mandarin | 표범쏘가리 | river | 밤 | - | 3 | M/40 | SLEEK | 노랑 + 갈색 spots | 강 동네 패셔니스타. |
| f_taiyaki | 붕어빵붕어 | river | 저녁 | - | 4 | M/30 | BALL | 금·갈색 taiyaki | 꽥사장이 군침을 흘린다. |
| f_heart_koi | 하트잉어 | heartpond | 낮 | 친구 방문 ×2 | 4 | M/50 | SLEEK | 흰 + 빨강 heart 1개 | 둘이 같이 낚으면 잘 나온다는 소문. |
| f_lucky_goldkoi | 복덩이금잉어 | pond | 아침 | 맑음 전용 | 4 | L/60 | SLEEK + whiskers2 | 금 scales | 보기만 해도 복이 온단다. |
| f_grandpa_catfish | 왕메기할배 | estuary | 밤 | 비 전용 | 5 | XL/150 | BIGHEAD + whiskers4 + 흰 눈썹 | 회청 | 이 강에 산 지 100년. 말이 많다. |
| f_cloud_carp | 구름잉어 | waterfall | 아침 | 무지개 전용 | 5 | L/90 | SLEEK + 구름 모양 지느러미 | 흰→하늘 gradient | 폭포 물보라가 잉어가 됐다. |

### 3.5.2 해안 (zone: shore — 모든 섬 해안 0~150m, 부두, 바위, 모래) — 13종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_sardine | 반짝떼정어리 | shore | 종일 | - | 1 | S/15 | SLEEK (떼 그림자) | 은 + 파랑 등 | 떼로 다니며 반짝반짝. |
| f_mackerel | 등푸른고등어 | shore | 낮 | - | 1 | S/35 | SLEEK | 파랑 물결 줄 / 은 배 | 등에 파도를 새긴 물고기. |
| f_horse_mackerel | 동동전갱이 | shore(부두) | 저녁 | - | 1 | S/25 | SLEEK | 은 + 노랑 hstripe | 부두 단골손님. |
| f_goby | 꼬마망둥이 | shore·estuary | 종일 | - | 1 | XS/8 | BIGHEAD | 베이지 spots | 하구 모래 위 수다쟁이. |
| f_moon_jelly | 말랑파리해파리 | shore | 밤 | - | 1 | S/20 | JELLY | 연분홍 clear | 쏘지 않는 착한 해파리. |
| f_flounder | 납작씨광어 | shore(모래) | 종일 | - | 2 | M/60 | FLAT, 두 눈이 한쪽 | 모래 + 갈색 spots | 한쪽만 보고 산다. |
| f_puffer | 빵빵이복어 | shore | 낮 | - | 2 | S/25 | BALL + spikes(잡히면 부풂) | 노랑 + 갈색 spots | 놀라면 두 배. |
| f_squid | 먹물찍오징어 | shore(부두) | 밤 | - | 2 | M/40 | OCTO 길쭉 | 흰 clear | 도망칠 때 먹물로 하트를 그림. |
| f_seabream | 참잘돼미 | shore(바위) | 아침·낮 | - | 2 | M/50 | SLEEK | 분홍 + 파랑 spots | 잡으면 오늘 일이 잘 돼미. |
| f_rockfish | 뚱우럭 | shore(바위) | 저녁·밤 | - | 2 | M/35 | BIGHEAD | 진갈 + 먹색 vstripe | 바위 틈 집순이. |
| f_octopus | 팔방미인문어 | shore(바위) | 밤 | - | 3 | M/70 | OCTO + tentacles8 | 빨강 | 다리 여덟 개로 여덟 가지 일. |
| f_smile_ray | 웃는가오리 | shore(모래) | 저녁 | - | 3 | L/120 | FLAT 마름모(배 쪽 웃는 얼굴) | 회청 / 흰 배 | 뒤집으면 늘 웃고 있다. |
| f_red_snapper | 아침참돔 | shore(바위) | 아침 | 맑음 전용 | 4 | L/70 | SLEEK | 산호 + 하늘 spots | 동트는 바다의 주인공. |

### 3.5.3 산호빛섬 (zone: stream·mangrove·lagoon·reef) — 18종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_guppy | 무지개구피 | stream | 종일 | - | 1 | XS/3 | SLEEK (떼) | **7색 변이**(빨·주·노·초·파·남·보 꼬리) | 다섯 마리가 늘 붙어 다닌다. 7색 세트. |
| f_mudskipper | 팔짝망둥이 | mangrove | 낮 | - | 1 | S/10 | BIGHEAD, 눈이 머리 위, 지느러미 발 | 올리브 spots | 물고기인데 걷는 게 더 좋다. |
| f_clownfish | 줄무늬광대 | reef | 종일 | - | 1 | XS/8 | BALL 길쭉 | 주황 + 흰 vstripe 3 | 말미잘이 집이자 이불. |
| f_butterflyfish | 나풀이나비고기 | reef | 낮 | - | 1 | S/12 | DISC | 노랑 + 먹색 눈 무늬 | 가짜 눈으로 술래를 속인다. |
| f_angelfish | 날개천사 | lagoon | 낮 | - | 2 | S/15 | DISC + ribbon-fin | 흰 + 먹색 vstripe | 우아한 척하지만 먹보. |
| f_piranha | 앙앙피라냐 | stream | 저녁 | - | 2 | S/25 | BALL + 흰 이빨 2 | 회청 / 빨강 배 | 이빨 두 개가 자랑. 사실 채식. |
| f_archerfish | 찍찍물총고기 | mangrove | 낮 | - | 2 | S/20 | SLEEK | 은 + 먹색 spots | 잡히기 전에 물총부터. |
| f_blue_tang | 파랑꼬리블루탱 | reef | 낮 | - | 2 | S/20 | DISC | 파랑 + 노랑 꼬리 | 길을 자주 잃는다. |
| f_boxfish | 네모네모거북복 | reef | 낮 | - | 2 | S/15 | BALL(둥근 큐브) | 노랑 + 먹색 spots | 네모난 게 매력. |
| f_parrotfish | 앵무물고기 | reef | 낮 | - | 2 | M/50 | SLEEK + 부리 | rainbow scales | 산호를 갉아 모래를 만든다. |
| f_seahorse | 꼬리말이해마 | reef(해초) | 낮 | - | 3 | XS/10 | HORSE | 노랑 | 꼬리로 해초를 꼭 잡고 산다. 10%로 커플 2마리. |
| f_lionfish | 부채장군쏠배감펭 | reef | 저녁 | - | 3 | M/30 | BALL + fan-fin | 빨강·흰 hstripe | 부채를 펼치며 등장하는 장군. |
| f_porcupine | 가시가시복 | reef | 밤 | - | 3 | S/30 | BALL + spikes | 베이지 + 갈색 spots | 부풀면 밤송이. |
| f_moray | 빼꼼이곰치 | reef(바위 구멍) | 밤 | - | 3 | L/120 | LONG | 초록 | 평생 빼꼼. |
| f_arowana | 용용아로와나 | lagoon | 밤 | - | 4 | L/80 | SLEEK 길게 + whiskers2 | 은 chrome 큰 비늘 | 용이 되려고 수련 중. |
| f_napoleon | 혹부리나폴레옹 | reef | 낮 | 맑음 전용 | 4 | XL/180 | SLEEK + hump(이마) | 청록 물결 무늬 | 이마 혹은 지혜 주머니. |
| f_arapaima | 거대해피라루쿠 | stream(정글 폭포 웅덩이) | 저녁 | 비 전용 | 5 | XXL/250 | SLEEK | 올리브→빨강 꼬리 gradient | 이름 그대로 거대해. |
| f_rainbow_manta | 무지개만타 | lagoon·reef | 낮 | 무지개 전용 | 5 | XXL/400 | FLAT 마름모, 날개 끝 말림 | rainbow | 석호 위를 날듯이 점프한다. |

### 3.5.4 쿵쿵공룡섬 (zone: footprint·hotspring·ancientlake·swamp) — 10종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_footprint_minnow | 발자국피라미 | footprint(발자국 웅덩이) | 종일 | - | 1 | XS/6 | SLEEK | 연두 + 은 | 공룡 발자국 웅덩이 원주민. |
| f_doctorfish | 간질이닥터피쉬 | hotspring | 종일 | - | 1 | XS/5 | SLEEK | 회색 | 발 담그면 간질간질. |
| f_trilobite | 세잎이삼엽충 | ancientlake | 낮 | - | 2 | S/10 | CRUST 세 마디 | 갈색 | 3억 년째 엎드려 있다. |
| f_ammonite | 빙글이암모나이트 | ancientlake | 저녁 | - | 2 | M/30 | SHELL 나선 + tentacles6 | 크림 + 갈색 hstripe | 빙글빙글 돌면서 생각 중. |
| f_horseshoe | 투구게투구 | ancientlake(모래) | 밤 | - | 2 | M/40 | RADIAL 말굽 + 꼬리 가시 | 올리브 | 투구는 썼는데 싸울 줄 모른다. |
| f_lava_goldfish | 뜨끈이용암붕어 | hotspring | 종일 | - | 3 | S/20 | BALL, glow | 주황→빨강 gradient 발광 | 만지면 앗뜨. (화산 미끼면 ×3) |
| f_sturgeon | 갑옷철갑상어 | swamp | 밤 | - | 3 | L/120 | SLEEK + plates(작게) | 회청 | 갑옷이 무거워 늘 느긋. |
| f_coelacanth | 살아있는화석씨 | ancientlake | 밤 | - | 4 | L/150 | SLEEK + 다리 같은 지느러미 4 | 남색 + 흰 spots | 멸종했다는 소문에 서운해함. |
| f_anomalo | 아노말 | ancientlake | 종일 | 비 전용 | 4 | M/60 | FLAT 긴 몸 + 앞 집게 2 | 분홍 | 옛날 바다의 귀여운 깡패. |
| f_dunkle | 철갑턱둔클레오 | ancientlake 중앙 | 밤 | 안개 전용 | 5 | XL/300 | BIGHEAD + 철갑 헬멧, **볼터치 필수** | 회청 chrome | 갑옷 속엔 순한 눈. |

### 3.5.5 솜눈섬 (zone: icehole·icelake·icesea) — 10종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_smelt | 얼음사탕빙어 | icehole | 아침 | - | 1 | XS/8 | SLEEK | clear + 하늘 | 투명해서 뼈가 보이는데 귀엽다. |
| f_cod | 덜덜대구 | icesea | 종일 | - | 1 | M/60 | BIGHEAD + 목도리 무늬 | 회청 + 빨강 목도리 | 늘 추워서 떤다. |
| f_char | 북극곤들매기 | icelake | 낮 | - | 2 | M/50 | SLEEK | 초록 등 / 주황 spots 배 | 얼음 밑 패셔니스타. |
| f_hair_crab | 보송게털게 | icesea | 밤 | - | 2 | S/15 | CRUST + fluffy | 살구 | 털옷 입은 게. |
| f_baby_salmon | 꼬마연어 | icelake | 저녁 | - | 2 | S/25 | SLEEK | 은 + 분홍 hstripe | 크면 폭포를 탈 거래. |
| f_snowball_puffer | 눈뭉치복어 | icehole | 종일 | 눈 전용 | 3 | S/20 | BALL 2단 + carrot-nose | 흰 | 눈사람인 척하는 복어. |
| f_clione | 바다천사크리오네 | icesea | 밤 | - | 3 | XS/3 | JELLY 날개형 | clear + 주황 심장 | 날갯짓 한 번에 천사. |
| f_aurora_trout | 오로라송어 | icelake | 밤 | 오로라 전용 | 4 | M/45 | SLEEK | huecycle | 보는 사람마다 다른 색이라고 우긴다. |
| f_king_crab | 대왕킹크랩 | icesea | 밤 | 눈 ×3 | 4 | L/100 | CRUST + legs-long | 빨강 + 크림 | 왕이라서 옆으로도 위엄 있게. |
| f_narwhal | 뿔뿔고래일각돌고래 | icesea(빙산 근처) | 밤 | 오로라 전용 | 5 | XXL/450 | GIANT + spiral-horn | 회청 + 흰 spots | 뿔로 별을 콕 찌르는 게 취미. |

### 3.5.6 반딧불버섯섬 (zone: swamp·foglake) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_swamp_snail | 늪우렁 | swamp | 종일 | - | 1 | XS/4 | SHELL(달팽이 껍데기) | 초록 | 느리지만 지각한 적 없다. |
| f_moss_catfish | 이끼메기 | swamp | 낮 | - | 1 | M/40 | BIGHEAD + whiskers2 | 올리브 + 연두 spots | 등에 이끼가 자라도 모른다. |
| f_glow_medaka | 반딧불송사리 | swamp | 밤 | - | 2 | XS/4 | SLEEK, glow | 형광연두 | 밤에 떼로 깜빡인다. |
| f_fog_eel | 스르륵안개장어 | foglake | 종일 | 안개 전용 | 2 | L/90 | LONG | 라벤더 clear | 안개랑 구분이 안 된다. |
| f_shroom_jelly | 갓갓이버섯해파리 | swamp | 밤 | - | 3 | S/10 | JELLY(버섯 갓) | 빨강 + 흰 spots | 버섯인지 해파리인지 본인도 헷갈림. |
| f_lantern_trout | 초롱송어 | foglake | 밤 | - | 3 | M/40 | SLEEK + lantern, glow | 남색 + 노랑 초롱 | 초롱으로 길을 비춘다. |
| f_crown_frog | 왕관개굴 | swamp(연잎) | 밤 | 비 전용 | 4 | S/8 | TAD 다리형 + crown | 연두 | 키스하면… 아무 일도 없다. |
| f_ghost_carp | 유령잉어 | foglake | 밤 | 안개 전용 | 4 | L/70 | SLEEK, clear | 흰 clear + 라벤더 | 보였다 안 보였다. |
| f_moss_turtle | 이끼거북할멈 | swamp 한가운데 | 밤 | 안개 전용 | 5 | XL/180 | SHELL + 등에 이끼·버섯·작은 나무 | 올리브 | 등 위에 작은 숲이 산다. |

### 3.5.7 모래시계섬 (zone: oasis·ruin·cave·dune) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_sand_medaka | 모래알송사리 | oasis | 종일 | - | 1 | XS/4 | SLEEK | 모래 | 모래 위에 서면 사라진다. |
| f_hump_crucian | 쌍봉붕어 | oasis | 낮 | - | 2 | S/18 | BALL + hump2 | 살구 | 물을 혹에 저장한다고 믿음. |
| f_cactus_puffer | 선인장복어 | oasis | 낮 | 맑음 ×2 | 2 | S/20 | BALL + spikes + flower | 초록 + 분홍 꽃 | 부풀면 꽃이 핀다. |
| f_cave_fish | 장님동굴고기 | cave | 종일 | - | 3 | S/12 | SLEEK, 눈 대신 반짝이 점 | 연분홍 clear | 앞은 못 봐도 반짝이는 건 안다. |
| f_mirror_fish | 거울고기 | oasis(깊은 곳) | 정오 | 맑음 전용 | 3 | S/20 | DISC | chrome | 너를 비춰 준다. |
| f_sand_shark | 꼬마모래상어 | dune(모래 낚시) | 낮 | - | 3 | L/120 | GIANT 작게(모래 위 등지느러미) | 모래 / 흰 배 | 모래 속 술래잡기 챔피언. |
| f_mummy_catfish | 붕대씨미라메기 | ruin(유적 수로) | 밤 | - | 4 | M/60 | BIGHEAD | 흰·베이지 bandage | 붕대는 패션이다. |
| f_scarab_koi | 황금스카라브잉어 | ruin(신전 연못) | 밤 | 맑음 + 보름(moonPhase 0.45~0.55) | 5 | L/70 | SLEEK | 금 + 청록 보석 무늬 | 신전의 수호자(라고 본인이 말함). |
| f_sand_whale | 모래고래 | dune(모래 낚시) | 종일 | 모래폭풍 전용 | 5 | XXL/600 | GIANT, 모래 위 등지느러미 | 모래 + 살구 hstripe | 모래 위를 헤엄친다. |
> 모래 낚시(`dune`)는 P1. P0 에서는 dune 종을 오아시스 출현 후보에 같이 넣는다(조건은 그대로).

### 3.5.8 별똥별섬 크레이터 호수 (zone: crater) — 17종 (별자리 12 포함)
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_galaxy_crucian | 은하붕어 | crater | 종일 | - | 1 | S/15 | BALL | galaxy | 비늘마다 별이 하나씩. |
| f_candy_medaka | 별사탕송사리 | crater | 밤 | - | 1 | XS/4 | SLEEK | 파스텔 랜덤(5색 변이) | 별사탕을 닮은 꼬마. |
| f_comet_goldfish | 혜성꼬리금붕어 | crater | 밤 | 유성우 ×3 | 2 | S/12 | BALL + light-tail | 주황 + 흰 빛 꼬리 | 꼬리가 혜성처럼 길다. |
| f_zodiac_aries | 양자리물고기 | crater | 밤 | 유성우 ×3 | 3 | S/20 | BALL + 말린 뿔 2 | 남색 + 금 constellation | 별자리 12종 ① |
| f_zodiac_taurus | 황소자리물고기 | crater | 밤 | 유성우 ×3 | 3 | M/30 | BIGHEAD + horn 2 | 〃 | ② |
| f_zodiac_gemini | 쌍둥이자리물고기 | crater | 밤 | 유성우 ×3 | 3 | S/15 | SLEEK, 2마리가 붙어 있음 | 〃 | ③ |
| f_zodiac_cancer | 게자리물고기 | crater | 밤 | 유성우 ×3 | 3 | S/15 | CRUST | 〃 | ④ |
| f_zodiac_leo | 사자자리물고기 | crater | 밤 | 유성우 ×3 | 3 | M/35 | BALL + crest(갈기) | 〃 | ⑤ |
| f_zodiac_virgo | 처녀자리물고기 | crater | 밤 | 유성우 ×3 | 3 | S/20 | DISC + flower | 〃 | ⑥ |
| f_zodiac_libra | 천칭자리물고기 | crater | 밤 | 유성우 ×3 | 4 | M/40 | FLAT, 저울 무늬 | 〃 | ⑦ |
| f_zodiac_scorpio | 전갈자리물고기 | crater | 밤 | 유성우 ×3 | 4 | S/25 | CRUST + 하트 꼬리 | 〃 | ⑧ |
| f_zodiac_sagittarius | 사수자리물고기 | crater | 밤 | 유성우 ×3 | 4 | M/40 | SLEEK + 화살 모양 지느러미 | 〃 | ⑨ |
| f_zodiac_capricorn | 염소자리물고기 | crater | 밤 | 유성우 ×3 | 4 | S/25 | TAD + horn 2 | 〃 | ⑩ |
| f_zodiac_aquarius | 물병자리물고기 | crater | 밤 | 유성우 전용 | 5 | M/30 | JELLY(항아리 모양) | 〃 + 하늘 발광 | ⑪ |
| f_zodiac_pisces | 물고기자리물고기 | crater | 밤 | 유성우 전용 | 5 | M/30 | SLEEK, 2마리가 리본으로 이어짐 | 〃 + 분홍 발광 | ⑫ **12종 기증 = 로켓 항법 칩** |
| f_meteor_turtle | 운석거북 | crater | 밤 | 유성우 ×3 | 4 | L/80 | SHELL(운석 등) | 회색 + 금 반짝 | 하늘에서 같이 떨어졌다. |
| f_meteor_koi | 유성잉어 | crater | 밤 | 유성우 전용 | 5 | L/80 | SLEEK + light-tail | 흰 + 금 | 소원을 들어줄 것 같은 잉어. |

### 3.5.9 먼바다 (zone: offshore — 해안 150m 밖, 배 위에서만) — 8종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_flyingfish | 파닥날치 | offshore | 낮 | - | 2 | S/30 | SLEEK + big-pec | 파랑 + 은 | 배를 따라 날아오른다(가끔 갑판에 뛰어듦 = 공짜). |
| f_mahi | 형광이만새기 | offshore | 저녁 | - | 3 | L/120 | BIGHEAD | 형광연두→노랑 gradient | 너무 밝아서 선글라스 필요. |
| f_tuna | 참치마요 | offshore | 낮 | - | 3 | XL/200 | SLEEK | 남색 + 노랑 꼬리 | 이름 때문에 늘 긴장. |
| f_marlin | 창코청새치 | offshore | 낮 | 폭풍 ×3 | 4 | XXL/300 | SLEEK + spear | 파랑 + 하늘 vstripe | 창으로 수평선을 가리킨다. |
| f_hammerhead | 망치머리귀상어 | offshore | 밤 | - | 4 | XL/350 | GIANT + t-head, **볼터치 필수** | 회청 | 머리로 못을 박을 줄 안다. |
| f_sunfish | 쿠크다스개복치 | offshore(수면) | 낮 | 맑음 전용 | 4 | XXL/250 | DISC 큼, 잘린 꼬리 | 회청 / 흰 배 | 쉽게 상처받는다. 다정하게. |
| f_whaleshark | 점박이큰형고래상어 | offshore | 아침 | 무지개 or 맑음 | 5 | XXL/1000 | GIANT | 남색 + 흰 spots | 덩치는 제일 큰데 플랑크톤만 먹음. |
| f_oarfish | 용궁리본산갈치 | offshore | 밤 | 폭풍 전용 | 5 | XXL/800 | LONG 리본 + crest(빨간 갈기) | 은 + 빨강 | 용궁에서 온 리본 체조 선수. |

### 3.5.10 심해 해구 (zone: deep — 잠수정, P1 출현 / P0 데이터) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_glass_jelly | 유리종해파리 | deep | 종일 | - | 2 | S/15 | JELLY, 가장자리 glow | clear + 하늘 발광 | 투명한 종 모양 등불. |
| f_anglerfish | 등불이초롱아귀 | deep | 밤 | - | 3 | M/40 | BIGHEAD + lantern-heart, glow | 먹색 + 분홍 초롱 | 초롱이 꺼지면 운다. |
| f_blobfish | 말랑젤리씨블롭피시 | deep | 종일 | - | 3 | S/30 | BALL 녹아내린 | 연분홍 | 물 밖에선 우울해 보이지만 사실 행복. |
| f_giant_isopod | 데굴이대왕공벌레 | deep | 밤 | - | 3 | M/35 | CRUST 마디 | 회색 | 놀라면 데굴데굴. |
| f_dumbo | 귀큰이덤보문어 | deep | 종일 | - | 4 | S/20 | OCTO + ear-fins | 분홍 | 귀로 헤엄친다. |
| f_barreleye | 유리머리배럴아이 | deep | 밤 | - | 4 | S/15 | SLEEK + dome-head | 먹색 + 초록 눈 | 머릿속이 훤히 보인다. 아무 생각 없음. |
| f_goblin_shark | 코쭉이고블린상어 | deep | 밤 | - | 4 | L/300 | GIANT + snout-long, 볼터치 | 분홍 | 코가 길어서 늘 먼저 도착. |
| f_giant_squid | 심해대장대왕오징어 | deep | 밤 | 폭풍 전용 | 5 | XXL/1200 | OCTO 길쭉, 아주 큰 눈 | 빨강 | 눈이 축구공만 하다. |
| f_baby_megalodon | 메갈로돈아기 | deep | 종일 | - | 5 | XXL/500 | GIANT, 이빨 대신 웃는 입 | 회청 / 흰 배 | 아기라는데 배보다 크다. |

### 3.5.11 우주 물고기 (zone: moonpond P0 / cloudsea·jellysea·blackhole P1) — 11종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 크기 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| f_mochi_crucian | 떡붕어 | moonpond | 종일 | - | 1 | S/15 | BALL 말랑(스쿼시 강하게) | 흰 + 분홍 볼 | 떡처럼 늘어난다. |
| f_comet_minnow | 혜성피라미 | moonpond | 종일 | - | 2 | XS/10 | SLEEK + light-tail | 은 + 하늘 빛 | 지나간 자리에 빛줄기. |
| f_moonlight_jelly | 월광파리 | moonpond | 지구가 뜰 때(우주 night) | - | 2 | S/15 | JELLY, glow | 은 발광 | 달빛을 마셔서 빛난다. |
| f_rabbit_fish | 떡방아물고기 | moonpond | 종일 | - | 3 | S/20 | BALL + 토끼 귀 지느러미 | 흰 + 분홍 | 꼬리로 방아를 찧는다. |
| f_crater_turtle | 크레이터거북 | moonpond | 종일 | - | 4 | M/50 | SHELL(크레이터 등) | 회색 + 금 점 | 등에 작은 달을 지고 다닌다. |
| f_galaxy_tail | 갤럭시꼬리금붕어 | cloudsea (P1) | 종일 | - | 3 | S/15 | BALL + 은하 꼬리 | galaxy | 꼬리에 은하 하나를 키운다. |
| f_candy_puffer | 별사탕복어 | cloudsea (P1) | 종일 | 유성우 ×3 | 3 | S/20 | BALL + spikes(별사탕 색 끝) | 파스텔 | 부풀면 달콤한 냄새. |
| f_cloud_whale_baby | 구름고래아기 | cloudsea (P1) | 저녁 | - | 4 | L/150 | GIANT + fluffy | 흰 | 엄마는 하늘고래. |
| f_jelly_salmon | 젤리연어 | jellysea (P1) | 낮 | - | 3 | M/50 | SLEEK, clear | 분홍 젤리 | 탱글탱글 거꾸로 헤엄친다. |
| f_ring_ray | 고리가오리 | jellysea (P1) | 종일 | - | 4 | L/120 | FLAT + ring | 라벤더 + 금 고리 | 몸에 행성 고리를 두르고 다닌다. |
| f_blackhole_sunfish | 블랙홀개복치 | blackhole (P1) | 종일 | 일식 | 5 | XL/300 | DISC + 빛나는 고리 | 먹색 + 보라 glow | 미끼를 다 빨아들인다. 낚싯대 조심. |

**물고기·수생 합계: 21 + 13 + 18 + 10 + 10 + 9 + 9 + 17 + 8 + 9 + 11 = 135종** (+ 바다 생물 27종 = 수생 162종, 금화단지는 도감 밖 아이템).

## 3.6 insects — 곤충 71종·채집
**파일**: `src/modules/insects.ts`, `src/modules/insects/{data.ts, body.ts, ai.ts}`

**P0 시스템**
1. 청크 스포너(radius 100, 청크 64m): 청크마다 구역·시간·날씨 후보에서 2~5마리. 같은 청크는 같은 결과(`ctx.rng`).
2. **행동 AI 7종**(행동 코드):
   - `fly` 날기: 꽃·풀 사이를 팔랑 경로로. 플레이어가 **달리면** 4~8m 에서 도망, 걸으면 1.5~4m 까지 허용(경계심 ★에 비례).
   - `hover` 정지비행: 잠자리. 같은 자리에 멈췄다 휙 이동.
   - `perch` 붙기: 꽃·잎·나무 기둥에 붙어 있음. 1.5m 안에서 달리면 날아감.
   - `hop` 뛰기: 풀숲에서 톡톡 튐, 다가가면 2~3m 점프로 멀어짐.
   - `crawl` 기기: 땅·물 위. 느리게.
   - `hide` 숨기: 돌 두드리기 / 나무 흔들기로 나온다(flora 의 흔들기 이벤트 `{type:'tree-shake', x, z}` 를 듣는다 — flora 가 emit).
   - `glow` 빛: 밤에 발광 깜빡이며 둥둥.
3. **잠자리채**(E): 0.35초 휘두르기, 앞 60° · 2.2m 안 → 잡았다. 좋은 잠자리채 +30% 범위. 실패하면 곤충은 도망(`catch-fail`).
4. 곤충 몸형 11종 생성기(BUTTERFLY 날개는 캔버스 무늬 텍스처 — 색·무늬로 변주). 날개 파닥 애니메이션.
5. 71종 데이터 전부 등록.
6. 벌집(나무 흔들기 3%) → 벌떼가 쫓아옴(5초), 쏘이면 얼굴 퉁퉁 붓는 귀여운 벌칙(characters 에 `action: 'stung'` 3초), 벌떼를 잡으면 `b_honeybee` + m_honey 3.

**P1**: 반딧불 군무(버섯섬 밤 30마리 동시), 곤충 씨름, 쇠똥구리 따라가기(보물 공), 난초사마귀 위장 연출.

### 3.6.1 말랑섬 (zone: flower·tree·river·grass·rock·heartpond·sakura·orchard) — 21종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_cabbage_white | 팔랑이흰나비 | flower | 낮 | - | 1 | fly | BUTTERFLY | 흰 + 먹색 spots | 첫 잠자리채의 첫 친구. |
| b_yellow_butterfly | 노랑나비 | flower | 아침·낮 | - | 1 | fly | BUTTERFLY | 노랑 | 햇빛 한 조각이 날아다닌다. |
| b_honeybee | 붕붕꿀벌 | flower | 낮 | - | 1 | fly(꽃 맴돌기) | BEE | 노랑 + 먹색 hstripe | 꿀 배달 중이라 바쁘다. |
| b_ladybug | 칠점이무당벌레 | flower | 아침 | - | 1 | perch | BEETLE 반구 | 빨강 + 먹색 점 7 | 점 세는 걸 좋아한다. |
| b_cicada | 맴맴이매미 | tree | 낮 | 맑음 ×2 | 1 | perch(나무 기둥) | BEETLE 길쭉 + wings-clear | 올리브 | 노래 실력은 아직 연습 중. |
| b_red_dragonfly | 고추잠자리 | river | 저녁 | - | 1 | hover | DRAGONFLY | 빨강 | 노을과 같은 색. |
| b_snail | 비오면산책달팽이 | flower·rock | 종일 | 비 전용 | 1 | crawl | SNAIL | 분홍 껍데기 + 크림 몸 | 비 오는 날만 외출한다. |
| b_pillbug | 데굴데굴공벌레 | rock | 종일 | - | 1 | hide(돌) | BEETLE 마디, 공으로 말림 | 회색 | 부끄러우면 공이 된다. |
| b_water_strider | 물위걷기소금쟁이 | river(수면) | 낮 | - | 1 | crawl(물 위) | SPIDER형 legs-long 6 | 갈색 | 물 위가 바닥이다. |
| b_cricket | 왕귀뚜라미 | grass | 밤 | - | 1 | hop | HOPPER | 진갈 | 밤의 바이올린 담당. |
| b_swallowtail | 어흥나비호랑나비 | flower | 낮 | 맑음 ×2 | 2 | fly | BUTTERFLY | 노랑 + 먹색 vstripe | 이름만 무섭다. |
| b_sakura_butterfly | 벚꽃나비 | sakura | 낮 | - | 2 | fly | BUTTERFLY 반투명 | 연분홍 | 꽃잎이 날아다니는 줄. |
| b_bumblebee | 뚱벌호박벌 | flower(튤립) | 아침 | - | 2 | fly | BEE + fluffy, 날개 작게 | 노랑 + 먹색 | 날개가 너무 작아 보이는데 잘 난다. |
| b_flower_chafer | 초록보석꽃무지 | flower | 낮 | - | 2 | perch | BEETLE | 초록 chrome | 꽃 속에서 낮잠. |
| b_firefly | 반짝반딧불이 | river | 밤 | - | 3 | glow | BEETLE 작게 + 엉덩이 glow | 먹색 + 형광연두 발광 | 강가의 작은 별. |
| b_rhino_beetle | 대장뿔장수풍뎅이 | tree | 밤 | - | 3 | hide(나무 흔들기) | BEETLE + horn | 갈색 chrome | 마을 씨름 대장. |
| b_stag_beetle | 집게왕사슴벌레 | tree | 밤 | - | 3 | hide(나무 흔들기) | BEETLE + claws-big | 먹색 chrome | 집게 자랑을 멈추지 않는다. |
| b_rainbow_beetle | 무지개딱정벌레 | flower(꽃잎 언덕) | 종일 | 무지개 전용 | 3 | perch | BEETLE | rainbow chrome | 등에 무지개를 접어 둠. |
| b_heart_ladybug | 하트무당벌레 | heartpond | 낮 | 친구 방문 ×2 | 3 | perch | BEETLE 반구 | 분홍 + 빨강 heart 점 | 둘이 보면 행운. |
| b_orchid_mantis | 난초사마귀 | flower(분홍 꽃) | 저녁 | - | 4 | perch(꽃인 척, 1.5m 안에 오면 도망) | MANTIS + 꽃잎 다리 | 연분홍 + 흰 | 꽃인 척하는 연기 대상 수상. |
| b_crown_butterfly | 왕관나비 | sakura(할미벚 꼭대기) | 아침 | 맑음 전용 | 5 | fly(높이 15m 이상) | BUTTERFLY 큼 + crown 더듬이 | 금 + 흰 | 할미벚이 키운 나비의 여왕. |

### 3.6.2 산호빛섬 (zone: beach·jungle·palm·mangrove·waterfall) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_hermit_crab | 이사왕소라게 | beach | 아침 | - | 1 | crawl(옆으로 도망) | CRUST 미니 + 껍데기 | 랜덤 색 껍데기 | 곤충 칸에 들어온 이유는 본인도 모름. |
| b_leafcutter | 잎꾼개미 | jungle(땅 행렬) | 낮 | - | 1 | crawl(행렬) | ANT + 머리 위 초록 잎 | 갈색 | 잎 우산 행렬. |
| b_orange_wasp | 쏘지마벌 | palm | 낮 | - | 2 | fly | BEE | 주황 + 먹색 | 쏘지 않겠다고 약속했다. |
| b_stick_insect | 나뭇가지씨대벌레 | jungle(가지) | 저녁 | - | 3 | perch(위장) | STICK | 갈색 | 찾아내면 진짜 뿌듯. |
| b_leaf_insect | 잎인척잎사귀벌레 | jungle(잎) | 낮 | - | 3 | perch(위장) | BEETLE 납작 잎 모양 | 연두 + 잎맥 | 잎맥까지 그려 넣은 정성. |
| b_jewel_beetle | 비단벌레 | palm(줄기) | 낮 | 맑음 ×2 | 3 | perch | BEETLE 길쭉 | rainbow chrome | 보석상 단골. |
| b_birdwing | 비단제비나비 | jungle(히비스커스) | 낮 | 맑음 ×2 | 4 | fly | BUTTERFLY 큼 | 초록 chrome + 먹색 | 날개에 정글을 담았다. |
| b_morpho | 파란꿈모르포나비 | waterfall | 아침 | - | 4 | fly | BUTTERFLY 큼 | 파랑 chrome | 날갯짓마다 파란 반짝임. |
| b_hercules | 헤라클이헤라클레스장수풍뎅이 | jungle(거목) | 밤 | - | 5 | hide(나무 흔들기) | BEETLE 큼 + 긴 뿔 2 | 노랑 등 + 먹색 | 곤충계의 헤라클레스. |

### 3.6.3 쿵쿵공룡섬 (zone: fern·ranch·volcano·lava·rock·fossil·ancientlake·crater) — 8종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_fern_hopper | 풀쩍고사리메뚜기 | fern | 낮 | - | 1 | hop | HOPPER | 연두 | 공룡 발밑에서도 겁이 없다. |
| b_dung_beetle | 공룡똥쇠똥구리 | ranch | 아침 | - | 2 | crawl(공 굴리기) | BEETLE + ball(자기보다 3배) | 진갈 | 꿈은 크게, 공은 더 크게. |
| b_lava_firefly | 불똥이화산반딧불 | volcano | 밤 | - | 2 | glow | BEETLE + 주황 glow | 먹색 + 주황 | 화산 불꽃을 빌려 온다. |
| b_lava_beetle | 숯검댕용암딱정벌레 | lava(돌 밑) | 저녁 | - | 2 | hide(돌) | BEETLE | 먹색 + 주황 균열 glow | 등이 늘 따뜻하다. |
| b_heart_scorpion | 하트꼬리전갈 | rock | 밤 | - | 3 | crawl | SPIDER형 둥근 몸 + 말린 꼬리(끝 하트) | 크림 | 꼬리 끝이 하트 모양. |
| b_amber_mosquito | 호박속모기 | fossil(삽으로 X 파기 5%) | 종일 | - | 3 | (줍기) | 노란 반투명 구 안 작은 모기 | 금 clear | 1억 년째 같은 자세. |
| b_meganeura | 큰잠자리할배메가네우라 | ancientlake 위 | 낮 | 맑음 ×2 | 4 | hover(크게 선회) | DRAGONFLY 1m | 청록 | 날개 한 번에 바람이 분다. |
| b_fire_butterfly | 불꽃나비 | crater(분화구 가장자리) | 정오 | 맑음 전용 | 5 | fly | BUTTERFLY + glow | 빨강→노랑 gradient | 용암의 춤이 나비가 됐다. |

### 3.6.4 솜눈섬 (zone: snow·icecave·sky·cabin·snowtree·icelake·aurorahill) — 7종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_springtail | 톡톡이톡토기 | snow | 종일 | - | 1 | hop | PUFF 작은 구 | 남색 | 눈밭에서 톡톡 튄다. |
| b_cave_cricket | 꼽꼽이동굴귀뚜라미 | icecave | 밤 | - | 1 | hop | HOPPER, legs-long | 베이지 clear | 동굴 메아리 담당. |
| b_snow_bug | 눈송이벌레 | sky(눈 오는 하늘) | 종일 | 눈 전용 | 2 | fly(눈처럼 둥둥) | PUFF 흰 솜 + 작은 날개 | 흰 | 눈송이인 줄 알고 그냥 지나친다. |
| b_scarf_moth | 털목도리나방 | cabin(오두막 불빛) | 밤 | - | 2 | fly(불빛 맴돌기) | BUTTERFLY + fluffy 목 링 | 크림 + 빨강 목도리 | 목도리 없이는 못 난다. |
| b_snow_ladybug | 흰점이눈꽃무당벌레 | snowtree | 낮 | - | 2 | perch | BEETLE 반구 | 흰 + 하늘 점 | 겨울 한정판. |
| b_frost_butterfly | 서리나비 | icelake 위 | 아침 | - | 3 | fly | BUTTERFLY 결정 날개 | clear + 하늘 | 손대면 녹을까 봐 조심. |
| b_aurora_butterfly | 오로라나비 | aurorahill | 밤 | 오로라 전용 | 5 | fly | BUTTERFLY | huecycle | 오로라 조각이 나비가 됐다. |

### 3.6.5 반딧불버섯섬 (zone: swamp·mushroom·shade·shipwreck·foglake·giant·tower) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_firefly_swarm | 깜빡이반딧불이 | swamp(위) | 밤 | - | 1 | glow(떼) | BEETLE 작게 + glow | 형광연두 | 수백 마리가 같이 깜빡인다. |
| b_swamp_dragonfly | 늪장수잠자리 | swamp | 저녁 | - | 2 | hover | DRAGONFLY | 초록 + 먹색 | 늪 경비대장. |
| b_shroom_bug | 갓쓴벌레 | mushroom(버섯 위) | 종일 | 비 ×3 | 2 | perch | BEETLE + 등에 작은 버섯 | 갈색 + 빨강 갓 | 우산을 들고 다니는 대신 길렀다. |
| b_jumping_spider | 털뭉치깡총거미 | mushroom(기둥) | 낮 | - | 2 | hop | SPIDER + fluffy, 큰 눈 4 | 라벤더 | 눈이 너무 커서 무서울 틈이 없다. |
| b_neon_snail | 네온달팽이 | shade(버섯 그늘) | 밤 | - | 3 | crawl | SNAIL, glow 껍데기 | 청록 발광 | 밤길 가로등 담당. |
| b_ghost_moth | 스르르유령나방 | shipwreck(해안) | 밤 | 안개 ×3 | 3 | fly(투명도 깜빡) | BUTTERFLY 반투명 | 흰 clear | 보였다 안 보였다. |
| b_glasswing | 유리날개나비 | foglake | 낮 | - | 4 | fly | BUTTERFLY + wings-clear | 투명 + 분홍 테두리 | 날개 너머가 다 보인다. |
| b_moon_moth | 달나방 | giant(거인 나무) | 밤 | 맑음 + 보름 ×3 | 4 | fly | BUTTERFLY 큼 + 긴 꼬리 날개 | 연두 + 크림 | 달빛을 날개에 담는다. |
| b_firefly_queen | 별빛반딧불여왕 | tower(버섯 탑 꼭대기) | 자정 | - | 5 | glow | BEETLE 큼 + crown, glow | 금 발광 | 섬의 모든 반딧불이 따른다. |

### 3.6.6 모래시계섬 (zone: desertgrass·sand·ruin·pit·cactus·oasis·pyramid) — 8종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_desert_hopper | 모래뛰기메뚜기 | desertgrass | 낮 | - | 1 | hop | HOPPER | 모래 | 모래 위 멀리뛰기 챔피언. |
| b_silver_ant | 은빛달리기사막개미 | sand | 정오 | - | 1 | crawl(빠름) | ANT | 은 chrome | 뜨거워서 늘 뛴다. |
| b_scarab | 스카라브쇠똥구리 | ruin(앞) | 아침 | - | 2 | crawl + ball | BEETLE | 청록 chrome | 해를 굴리는 꿈을 꾼다. |
| b_antlion | 깔때기개미귀신 | pit(모래 구덩이) | 종일 | - | 3 | hide(구덩이에서 나옴) | BEETLE 둥근 몸 + claws-big | 베이지 | 구덩이 장인. |
| b_star_scorpion | 꼬리별전갈 | ruin(돌 밑) | 밤 | 맑음 ×2 | 3 | hide(돌) | SPIDER형 + 꼬리, glow | 청록 발광 | 달빛을 받으면 빛난다. |
| b_tarantula | 털보거미왕 | cactus | 밤 | - | 4 | crawl | SPIDER 큰 털 구 | 진갈 + 주황 무릎 | 털 손질에 하루를 다 쓴다. |
| b_sundial_cicada | 해시계매미 | oasis(야자) | 정오 | 맑음 전용 | 4 | perch | BEETLE + wings-clear | 금 | 정오에만 운다. |
| b_golden_scarab | 황금풍뎅이 | pyramid(꼭대기) | 종일 | - | 5 | perch | BEETLE | 금 chrome | 유적의 진짜 보물. (P1 퍼즐 뒤, P0 는 꼭대기에 그냥 둔다) |

### 3.6.7 별똥별섬 (zone: hill·antenna·pad·meadow·crater·telescope·wreckshore·tower) — 9종
| id | 이름 | 장소 | 시간 | 날씨 | ★ | 행동 | 몸형·파츠 | 색·무늬 | 한 줄 |
|---|---|---|---|---|---|---|---|---|---|
| b_wind_dragonfly | 바람잠자리 | meadow | 낮 | - | 1 | hover | DRAGONFLY | 하늘 | 바람개비 따라 빙글. |
| b_star_firefly | 별똥이별빛반딧불 | hill | 밤 | - | 2 | glow(별자리 모양으로 모임) | BEETLE + 별 모양 glow | 노랑 | 별자리 흉내를 낸다. |
| b_antenna_moth | 안테나나방 | antenna | 밤 | - | 2 | perch | BUTTERFLY + antenna-big | 회청 + 크림 | 우주 신호를 듣는 중. |
| b_launch_cricket | 발사뛰기귀뚜라미 | pad(발사대) | 낮 | - | 2 | hop(높이 10m) | HOPPER | 빨강 + 흰 hstripe | 로켓 흉내 대장. |
| b_meteor_beetle | 돌덩이벌레운석딱정벌레 | crater | 종일 | - | 3 | perch | BEETLE 울퉁불퉁 | 회색 + 금 반짝 | 하늘에서 같이 떨어졌다. |
| b_satellite_ladybug | 궤도점위성무당벌레 | telescope | 밤 | - | 3 | perch | BEETLE + 등 위를 공전하는 점 | 남색 + 노랑 점 | 등 위에 작은 태양계. |
| b_stardust_moth | 별가루나방 | crater(상공) | 밤 | 유성우 전용 | 3 | fly | BUTTERFLY + 반짝 가루 | 은 + galaxy | 잡으면 별가루 3개. |
| b_galaxy_butterfly | 은하나비 | wreckshore(탐사선 해안) | 밤 | 유성우 ×3 | 4 | fly | BUTTERFLY | galaxy | 우주에서 길을 잃고 온 나비. |
| b_comet_dragonfly | 혜성잠자리 | tower(발사탑 꼭대기) | 밤 | 유성우 전용 | 5 | hover + light-tail | DRAGONFLY | 흰 + 금 빛 꼬리 | 발사탑에 앉아 별을 기다린다. |

**곤충 합계: 21 + 9 + 8 + 7 + 9 + 8 + 9 = 71종.** (우주 곤충은 3.9 우주 생물에)

## 3.7 dinos — 공룡 계곡·공룡 22종·행동
**파일**: `src/modules/dinos.ts`, `src/modules/dinos/{data.ts, body.ts, ai.ts}`

**공룡은 잡지 않고 친해진다.** 육식 공룡도 위험하지 않다(쫓아와서 핥기, 상자 지키기 같은 장난 위협만).
- **도감 등록 = 첫 먹이 주기**(또는 목격형은 3m 안에서 E "인사하기"). 등록 시 `game.ui.showCatch`(들어 올리지 않고 공룡 옆에 하트 팡).
- **친밀도 하트 5칸**: 먹이 +1(종별 좋아하는 먹이면 +2), 쓰다듬기(E, 하루 1회) +0.5, 부탁 완료 +1. 하루 최대 +2. 5칸 = 탈것/펫/능력 해금(`unlock` 키 `dino:<id>`).
- **먹이**: 초식 = 과일·고사리(m_fern)·은행(m_ginkgo), 육식 = **물고기**(가방의 아무 물고기, ★가 높을수록 +1 추가). → 낚시가 곧 공룡 소비처.

**P0**
1. 공룡섬 하나에서 초식 6종 무리 배회(엄지척·뿔뿔이·접시등·나팔이·달리미·목길어) + 콩콩이·꼬마렉스.
2. **티노 낮잠 스텔스**: 티노 낮잠 언덕(공룡섬 중앙 북쪽 언덕). 낮(09~17)엔 잔다(콧방울 부풀었다 꺼짐 + "Zzz"). 플레이어가 10m 안에서 **달리면** 소음 게이지 +, 걸으면 천천히 +, 웅크림 없음. 게이지 100% → 깸 → "꺄오!" 하고 5초 쫓아오다 짧은 팔로 못 안아서 시무룩 → 다시 잠. 언덕 꼭대기 금상자는 안 깨우고 가야 열린다. 물고기 선물 30번 → 친구(전설 탈것, P1).
3. 먹이 주기 E → 하트 연출, 친밀도 저장(`flags.dino`).
4. 22종 데이터 전부 등록. 공룡 몸형 5종(QUAD·BIPED·LONGNECK·WING·SWIM) + 파츠로 변주.
5. 뿔뿔이 하트 5 → `dino:triceratops` 해금 → vehicles 가 탑승 처리(P1 이면 해금 토스트만).

**P1**: 알 부화(인큐베이터 가구, 게임일 3일), 공룡 성장 3단계, 나팔이 리듬 게임, 스피노 낚시 대결, 오비랍토르 도둑 추격, 브라키오 목 엘리베이터, 디플로 꼬리 다리, 공룡 대이동 이벤트(화요일), 화석 복원기.

| id | 이름 (종) | 구역 | 시간 | ★ | 몸형·파츠 | 색 | 행동 | 하트 5 보상 | 좋아하는 먹이 |
|---|---|---|---|---|---|---|---|---|---|
| z_iguanodon | 엄지척 (이구아노돈) | 초원 계곡, 무리 3~5 | 종일 | 1 | BIPED 통통 + 엄지 뿔 | 연두 + 크림 배 | 풀 뜯기, 엄지 "좋아요" | 사진 포즈 "엄지척" | 고사리 |
| z_protoceratops | 꼬마프로토 (프로토케라톱스) | 초원 | 종일 | 1 | QUAD 작게 + 작은 frill | 살구 | 졸졸 따라옴 | 펫 | 과일 |
| z_compy | 졸졸이 (콤프소그나투스) | 해안 정글, 떼 5 | 낮 | 1 | BIPED 꼬마 | 연두 + 노랑 줄 | 떼로 플레이어 뒤를 따라다님 | 펫(떼) | 물고기 |
| z_triceratops | 뿔뿔이 (트리케라톱스) | 초원 계곡, 무리 | 낮 | 2 | QUAD + horn3 + frill-heart | 하늘 + 분홍 프릴 | 머리로 바위 밀기 | **탈것: 돌진**(바위 깨기 → 광석) | 과일 |
| z_raptor | 콩콩이 (깃털 랩터) | 거목 숲, 3마리 | 낮 | 2 | BIPED 작게 + feathers(깃털 공 몸) | 파스텔 3색 변이 | 숨바꼭질(덤불에 숨음) | 펫 | 물고기 |
| z_stegosaurus | 접시등 (스테고사우루스) | 화산 기슭 | 낮 | 2 | QUAD + plates(밤에 빛남) | 올리브 + 파스텔 rainbow 등판 | 햇볕 쬐기, 등판 위 낮잠 가능 | 등판 꽃 장식 꾸미기 | 고사리 |
| z_ankylosaurus | 망치꼬리 (안킬로사우루스) | 화산 기슭 | 종일 | 2 | QUAD 납작 + 돌기 + club-tail | 베이지 + 갈색 | 꼬리로 바위·나무 쿵 | 광석·과일 떨어뜨려 줌(하루 3번) | 과일 |
| z_parasaurolophus | 나팔이 (파라사우롤로푸스) | 호숫가 | 아침 | 2 | BIPED + crest(나팔 볏) | 노랑 + 주황 볏 | 아침 합창 "뿌우~" | 리듬 미니게임(P1) / 음악 상자 | 고사리 |
| z_pachy | 박치기 (파키케팔로사우루스) | 거목 숲 | 낮 | 2 | BIPED + dome-skull | 하늘 + 갈색 머리 | 나무 박치기 → 열매·곤충 떨어짐 | 박치기 미니게임 | 과일 |
| z_gallimimus | 달리미 (갈리미무스) | 초원, 무리 | 저녁 | 2 | BIPED 날씬 + 긴 다리 | 살구 + 흰 | 무리 질주 | **탈것: 가장 빠른 육상**(16 m/s), 경주 | 과일 |
| z_brachio | 목길어 (브라키오사우루스) | 거목 숲 | 낮 | 3 | LONGNECK | 하늘 + 흰 점 | 높은 나무 잎 먹기 | 목 엘리베이터(절벽 위·높은 열매) | 높은 과일 |
| z_apatosaurus | 미끄럼틀 (아파토사우루스) | 호숫가 | 낮 | 3 | LONGNECK + 긴 꼬리 | 라벤더 | 호수에 발 담그기 | 꼬리 미끄럼틀 → 호수 풍덩 | 고사리 |
| z_oviraptor | 알도둑 (오비랍토르) | 둥지 절벽 | 아침 | 3 | BIPED + crest + 부리 | 주황 + 파랑 볏 | 가방 과일 훔쳐 도망 | 쫓아가 잡으면 공룡 알 / 선물 | 과일 |
| z_dilopho | 짜잔 (딜로포사우루스) | 해안 정글 | 저녁 | 3 | BIPED + frill(목) + crest 2 | 초록 + 노랑 프릴 | 목도리 펼치며 "짜잔" | 사진 이벤트 | 물고기 |
| z_therizino | 손톱정원사 (테리지노사우루스) | 해안 정글 | 낮 | 3 | BIPED + long-claws + feathers | 크림 복슬 | 긴 손톱으로 과일 따기 | 과일 따 주기(하루 5개) | 과일 |
| z_pteranodon | 슝슝이 (프테라노돈) | 둥지 절벽 | 낮 | 3 | WING + crest | 노랑 부리 + 하늘 날개 | 절벽에서 활공 | **탈것: 활공**(높은 곳 출발) | 물고기 |
| z_baby_rex | 꼬마렉스 (아기 티라노) | 화산 기슭 | 낮 | 3 | BIPED 큰 머리 + 아주 짧은 팔 | 연두 + 크림 배 | "꺅!" 포효(작음), 박수를 못 침 | 펫 + 소리 따라 하기 | 물고기 |
| z_spino | 돛등이 (스피노사우루스) | 늪 | 저녁 | 4 | BIPED + sail + 악어 주둥이(둥글게) | 청록 + 주황 돛 | 늪에서 낚시함 | 낚시 대결(이기면 황금 미끼 5) | ★3+ 물고기 |
| z_plesio | 목욕룡 (플레시오사우루스) | 고대 호수·해안 | 낮 | 4 | SWIM + 긴 목 + 지느러미 4 | 하늘 + 흰 배 | 고개 내밀기 | **탈것: 수상**(수영 ×3) | 물고기 |
| z_quetzal | 꼬마케찰 (케찰코아틀루스) | 화산 정상 | 낮 | 4 | WING 큼 + crest | 분홍 + 흰 | 정상에서 바람 타기 | **탈것: 섬 사이 비행**(P1) | ★4+ 물고기 |
| z_tino | 대장렉스 **티노** (티라노 어른) | 티노 낮잠 언덕 | 낮엔 낮잠, 저녁~밤 깨어 있음 | 5 | BIPED 큼 + 작은 왕관, **볼터치 필수** | 주황 + 크림 배 | 스텔스 놀이, 깨면 쫓아오다 시무룩 | 물고기 선물 30번 → 전설 탈것(P1) | 물고기 |
| z_mosasaur | 바다왕 모사 (모사사우루스) | 해구 입구 | 밤 | 5 | SWIM 큼 + 넓은 꼬리 | 남색 + 흰 배 | 잠수정 앞을 한 바퀴 돌고 사라짐 | 목격 등록, 협동 낚시(P1) | — |
| z_mammoth | 털뭉치 매머드 아기 (빙하기 손님) | 솜눈섬 빙하 → 녹이면 마을 | 종일 | 4 | QUAD + fluffy + 작은 상아 | 갈색 털 | 코로 눈 뿌리기 | 펫 | 서리 열매 |
| z_sabertooth | 송곳니 검치호 (빙하기 손님) | 솜눈섬 설산 | 밤 | 3 | QUAD 고양이형 + 송곳니 2(귀엽게) | 크림 + 갈색 줄 | 눈 위에서 뒹굴기 | 썰매 끌기(P1) | 물고기 |
| z_yutyrannus | 털복숭이 (유티라누스) | 솜눈섬 숲 | 종일 | 4 | BIPED + feathers 온몸 | 흰 + 하늘 | 눈 오면 신나서 뜀 | 펫 | 물고기 |

**합계 25종**(공룡 22 + 빙하기 손님 3). 달의 **별공룡**은 3.9 우주 생물.

**화석**(category `'fossil'`): 육상·하늘 공룡 20종(바다 공룡 2종·빙하기 손님 3종 제외) × 부위 3(head·body·tail) = 아이템 `fos_<공룡id 뒤>_<part>` 60개. 도감 칸은 **골격 20개**(`fos_<id>` — 3부위 기증 시 완성). 모든 섬 X 표시를 삽으로 파면 화석 조각, 공룡섬은 3배. 감정 전엔 "?? 화석"(감정 비용 300코인, P1 — P0 는 바로 이름 공개).

## 3.8 vehicles — 탈것·로켓 발사
**파일**: `src/modules/vehicles.ts`, `src/modules/vehicles/**`

**공통**: `Mountable` 로 `game.player.mount()`. **F = 소유한 탈것 부르기(근처에 소환)**, E = 타기/내리기(코어). 배는 물 위에서만 소환, 육상 탈것은 땅 위에서만. 탈것마다 스킨 3색(P1: 캡슐머신·금상자).

**P0**
1. **장바구니 자전거**: 11 m/s, 언덕 내리막 가속, 점프(Space) 작게, 바구니(가방 +5칸은 P1).
2. **통나무 뗏목**: 12 m/s, 출렁임(파도 `game.ocean.waveAt`), 노 젓는 애니메이션.
3. **통통배**: 25 m/s, 엔진 통통 연기, 갑판 위에서 낚시 가능(배 정지 시 E = 낚시 → fishing 의 provider 가 배 위에서도 뜨게 `player.mode==='mounted'` 이고 속도 < 1 이면 허용).
4. **모터보트**: 40 m/s, 파도 점프, 물보라.
5. **로켓 "도파민 1호" + 발사 연출**(6.2): 발사대 섬 발사탑에서 E → 카운트다운 → 상승 컷 → `game.setWorld('space', spawn)` + `launch` 이벤트. 달에서 귀환 패드 E → 지구 발사장으로.
6. 탈것 17종 데이터 등록(도감 '탈것' 탭, category `'item'` 에 `tags:['vehicle']`).

**P1**: 돛단요트(바람), 잠수정, 열기구, 프로펠러 비행기, 공룡 탑승 3종, 펭귄 썰매, 모래 버기, 달 로버, UFO, 2인승.

| id | 탈것 | 해금 (정식) | 지형 | 속도 | 물리 손맛 | 형태 힌트 | 우선 |
|---|---|---|---|---|---|---|---|
| v_bike | 장바구니 자전거 | 꽥꽥상회 8,000 + 철광석 5 | 육지 | 11 m/s | 언덕 가속, 작은 점프 | 파스텔 민트 프레임, 앞 바구니, 큰 바퀴 2 | **P0** |
| v_duck_tube | 오리튜브 | 해변 상점 1,500 | 얕은 바다 | 수영 ×1.5 | 둥둥, 잠수 불가, 체력 안 닳음 | 노란 오리 링 | P1 |
| v_raft | 통나무 뗏목 | DIY(나무 20 + 덩굴 5) | 바다 | 12 m/s | 출렁, 노 젓기 | 통나무 5 + 작은 깃발 | **P0** |
| v_tugboat | 통통배 | 조선소 30,000 (말랑섬 도감 30%) | 바다 | 25 m/s | 엔진 통통, 배 위 낚시 | 빨강 선체 + 흰 굴뚝, 둥근 창 | **P0** |
| v_yacht | 바람이 돛단요트 | 조선소 60,000 + 돛 부품 | 바다 | 순풍 35 / 역풍 15 | 바람 방향 화살표, 돛 기울기 | 흰 돛 + 하늘 줄 | P1 |
| v_motorboat | 물보라 모터보트 | 조선소 150,000 + 통통 엔진 부품 | 바다 | 40 m/s | 파도 점프, 물보라 | 형광 민트 + 흰 | **P0** |
| v_jetski | 수상바이크 | 산호빛섬 다이빙 센터 의뢰 | 바다 | 45 m/s | 스턴트 점프 | 분홍 + 흰 | P1 |
| v_submarine | 꼬르륵호 잠수정 | 다이빙 센터 + 잠수정 선체 부품 + 50,000 | 심해 | 8 m/s | 부력, 서치라이트, 로봇팔 줍기 | 노란 잠수함 + 둥근 창 + 프로펠러 | P1 |
| v_sled | 펭귄 썰매 | 솜눈섬 DIY | 눈 언덕 | 경사 비례(최대 20) | 미끄러짐, 드리프트 | 펭귄 얼굴 썰매 | P1 |
| v_buggy | 모래 버기 | 모래시계섬 바자르 80,000 | 사막 | 18 m/s | 모래 언덕 점프 | 살구 + 큰 풍선 바퀴 | P1 |
| v_balloon | 둥실풍선 열기구 | 풍선 선물 30개 터뜨리기 + 반짝별 300 | 하늘 | 6 m/s | 바람 따라 표류, 상승·하강만 | 줄무늬 풍선 + 바구니 | P1 |
| v_plane | 프로펠러 꼬마비행기 | 우주센터 1단계 | 하늘 | 50 m/s | 자유 비행(낮게) | 빨강 복엽기 | P1 |
| v_dino_trike | 뿔뿔이 (트리케라톱스) | 친밀도 하트 5 | 공룡섬 육지 | 14 m/s | 쿵쿵 진동, 바위 돌파 | 공룡 + 안장 | P1 |
| v_dino_ptera | 슝슝이 (익룡) | 친밀도 하트 5 | 공중 활공 | 20 m/s | 높은 곳 출발, 서서히 하강 | 공룡 + 안장 | P1 |
| v_dino_plesio | 목욕룡 (수장룡) | 친밀도 하트 5 | 호수·바다 | 18 m/s | 목 들어 물보라 | 공룡 + 안장 | P1 |
| v_rocket | 도파민 1호 로켓 | 로켓 부품 6 + 발사대 건설(6.1) | 지구 ↔ 달 | 연출 | 카운트다운, 발사 진동 | 빨강·흰 줄, 둥근 창, 지느러미 3 | **P0(연출)** |
| v_moon_rover | 깡총카 달 로버 | 달 도착 시 지급 | 달 | 15 m/s | 저중력 통통 튐 | 바퀴 6 + 접시 안테나 | P1 |
| v_ufo | 반짝 UFO | 우주 도감 80% | 우주 + 지구 하늘 | 60 m/s | 자유 비행, 빔으로 물건 들기 | 은 접시 + 분홍 돔 | P1 |

## 3.9 space — 우주 세계 (상세는 6장)
**파일**: `src/modules/space.ts`, `src/modules/space/**`

**P0**: 토끼달 1곳(6.3) — `SPACE_ORIGIN (0,0,30000)` 주변에 반경 400m 달 표면(청크), 중력은 코어가 −4.5. 크레이터 연못 3개(낚시 zone `moonpond`), 떡방아 토끼 마을, 월석 채집, 지구 전망 언덕, 우주상자, 귀환 패드. 우주 생물 P0 8종 출현. 도착 연출(`arrive` 이벤트).
**P1**: 20초 비행 미니게임, 다른 행성 6곳, 별공룡 친해지기.

### 3.9.1 우주 생물 (category `'space'`) — 18종
| id | 이름 | 지역 | 시간 | ★ | 형태 | 색·무늬 | 잡는 법 | 쓰임 | 우선 |
|---|---|---|---|---|---|---|---|---|---|
| s_glitter_moth | 반짝가루나방 | 달·소행성대 | 종일 | 1 | BUTTERFLY + 은빛 가루 | 은 | 잠자리채 | 날개 가루 = 별가루 2 | P0 |
| s_mochi_rabbit | 쿵떡이 떡방아토끼 | 달 마을 | 종일 | 1 | 흰 구 몸 + 긴 귀 + 절구 소품 | 흰 + 분홍 귀 | 쓰다듬기(witness) | 떡 선물(달떡 화폐, P1) | P0 |
| s_moon_bug | 달빛벌레 | 달 평원 | 우주 밤 | 2 | BEETLE + glow | 은 발광 | 잠자리채 | 판매 | P0 |
| s_crater_mole | 구멍쏙 크레이터두더지 | 달 크레이터 | 종일 | 2 | BALL + 분홍 코 | 회색 | 구멍에서 나올 때 E(두더지 잡기) | 판매 | P0 |
| s_moon_jelly | 둥실이 달빛해파리 | 달 상공 3~6m | 지구 뜰 때 | 2 | JELLY 공중 부유 | 은 clear + 하늘 | 잠자리채(점프해서) | 판매·램프 재료 | P0 |
| s_moonrock_turtle | 돌등이 월석거북 | 달 평원 | 우주 밤 | 3 | SHELL(월석 등) | 회색 + 크레이터 무늬 | E 줍기(느림) | 월석 드롭 3 | P0 |
| s_starsaurus | 별공룡 스타사우루스 | 달 별공룡 둥지 | 종일 | 4 | QUAD + horn3 + helmet | 하늘 + 금 별 무늬 | 인사하기(witness), 친해지기 P1 | 이야기(공룡의 후손) | P0(목격) |
| s_alien_kid | 삐리 외계인 꼬마 | 달 UFO 잔해 | 이벤트 | 4 | 초록 구 머리 + antenna 2 + 큰 눈 3 | 연두 | 대화(witness) | 말랑섬 주민으로 이사(P1) | P0(목격) |
| s_moon_brachio | 달브라키오 | 달 먼 언덕 | 종일 | 5 | LONGNECK + helmet | 은 + 별 무늬 | 목격 | 이야기 | P1 |
| s_cotton_sheep | 구름뭉치 솜사탕양 | 슈가링 | 종일 | 2 | fluffy 구 몸 + 작은 다리 | 분홍·하늘 | 털 깎기 | 솜사탕 재료 | P1 |
| s_jelly_bear | 말캉곰 젤리곰 | 젤리별 | 낮 | 2 | 곰 모양 clear 젤리 | 6색 랜덤 | 잠자리채 | 6색 세트 | P1 |
| s_balloon_octo | 빵빠레 풍선문어 | 솜사탕 성운 | 바람 | 3 | OCTO + 부푼 머리 | 노랑 | 붙잡으면 같이 떠오름 | 이동기 | P1 |
| s_ring_snake | 훌라후프 고리뱀 | 슈가링 고리 | 종일 | 3 | LONG 고리 모양 | 민트 + 흰 줄 | 잠자리채 | 판매 | P1 |
| s_crystal_hedgehog | 수정가시 고슴도치 | 서리볼 | 밤 | 3 | BALL + 결정 spikes | 하늘 clear | E | 결정 재료 | P1 |
| s_ufo_jelly | UFO해파리 | 자갈띠 소행성대 | 유성우 | 4 | 접시 돔 + 빛 촉수 | 은 + 분홍 | 잠자리채 | 판매 | P1 |
| s_sky_whale | 하늘고래 | 솜사탕 성운 | 저녁 | 5 | GIANT + fluffy + 무지개 지느러미 | 흰 | 친해지기 | 탈것(행성 사이) | P1 |
| s_comet_fox | 꼬리별 혜성여우 | 자갈띠 | 유성우 밤 | 5 | 여우 몸 + light-tail | 주황 + 흰 빛 | 잠자리채 | 소원 1회(하루 희귀 업) | P1 |
| s_little_star | 꼬마별 | 까만 도넛 근처 | 일식 | 5 | 작은 행성 구 + 눈·볼터치 | 노랑 | E | 펫(머리 위 공전) | P1 |

## 3.10 characters — 플레이어 애니메이션·주민 NPC
**파일**: 기존 `src/modules/characters.ts` + `characters/**`

**P0**
1. 플레이어(룩 테스트의 2.5등신 아이) 동작: idle(숨쉬기 스쿼시) · walk · run · jump · glide(패러글라이더) · swim · dive · **hold-up(머리 위 들어 올리기 0.8초)** · cast(낚싯대 던지기)·reel · net swing(잠자리채) · dig(삽) · shake(나무 흔들기) · hit(돌 두드리기) · pet(쓰다듬기) · sit(탈것) · stung(벌에 쏘여 얼굴 퉁퉁, 3초) · cheer(전설 획득 시 만세). `game.player.action` 값으로 포즈 선택.
2. 시설 NPC 4명 모델 + 자리 + `npc-talk` 이벤트: **꽥사장**(오리, 꽥꽥상회 카운터), **느릿 관장**(거북, 박물관), **펭박사**(펭귄, 별똥별섬 발사대 + P0 테스트 위해 말랑섬 부두에도 한 명 서 있다가 첫 대화에서 로켓 꿈 이야기), **곰 몽실**(기존 곰 주민, 마을 광장).
3. NPC 말풍선(동숲식 흰 둥근 말풍선 + 글자가 한 글자씩, 음성 대신 "뽀로롱" 소리 P1).
4. NPC 대사(첫 만남·평소 3줄씩)는 이 문서 4.6.3 을 쓴다.

**P1**: 통통(비버 목수, 작업대), 펠리 선장(펠리컨, 조선소), 보들(수달, 다이빙 센터), 프로 박사(프로토케라톱스, 화석 연구소), 토토(별토끼, 이야기), 목길이 할머니(브라키오 — dinos 와 협의), 낙타 상인, 너구리 고물상, 떡순이(달토끼), 꾸물이(외계 문어), 양 자매(옷가게), 주민 16명, 부탁 말풍선, 주민끼리 수다.

### 3.10.1 NPC 표
| id | 이름 | 종 | 자리 | 역할 | 성격·말버릇 | 우선 |
|---|---|---|---|---|---|---|
| npc_quack | 꽥사장 | 오리 | 말랑마을 꽥꽥상회 | 매입·판매·도구·미끼·자전거·가방 확장 | 장사꾼, "꽥! 좋은 물건이구먼!" | **P0** |
| npc_slow | 느릿 관장 | 거북 | 말랑마을 박물관 | 기증·해설(길고 느림) | "오오…… 이건…… 말이죠……" | **P0** |
| npc_peng | 펭박사 | 펭귄 | 별똥별섬 발사장(+ 말랑섬 부두) | 로켓·우주·메인 진행 | 날고 싶은 과학자, "날개는 없지만 엔진은 있지!" | **P0** |
| npc_mongsil | 곰 몽실 | 곰 | 말랑마을 광장(기존 자리) | 첫 친구, 튜토리얼, 부탁 | 다정함, "오늘은 뭐 잡았어?" | **P0** |
| npc_tongtong | 통통 | 비버 | 말랑마을 작업대 | DIY 레시피·집 증축·다리 | 장인, "뚝딱뚝딱!" | P1 |
| npc_peli | 펠리 선장 | 펠리컨 | 말랑섬 조선소 부두 | 배 판매·항로 | 바다 사나이, "부리에 바다를 담았지" | P1(P0 는 조선소 카운터만) |
| npc_bodeul | 보들 | 수달 | 산호빛섬 다이빙 센터 | 스노클·잠수복·잠수정 | 수다쟁이 | P1 |
| npc_pro | 프로 박사 | 프로토케라톱스 | 공룡섬 화석 연구소 | 화석 감정·부화 | 안경, 학자 | P1 |
| npc_toto | 토토 | 별토끼(외계) | 말랑섬 → 로켓 | 이야기(별조각 7) | 반짝이는 귀, "삐융!" | P1 |
| npc_grandma | 목길이 할머니 | 브라키오 | 공룡섬 거목 숲 | 전설·별조각 | 느긋한 할머니 | P1 |
| npc_camel | 낙타 상인 | 낙타 | 모래시계섬 바자르 | 다른 시세 상점 | 흥정꾼 | P1 |
| npc_raccoon | 너구리 고물상 | 너구리 | 말랑섬 해변 | 쓰레기 매입·재활용 | 수집광 | P1 |
| npc_tteoksun | 떡순이 | 달토끼 | 달 떡방아 가게 | 우주 상점 | 떡 장인 | P1(P0 는 모델만 서 있어도 됨) |
| npc_kkumul | 꾸물이 | 외계 문어 | 별다방 정거장 | 우주 상점·UFO | 다리 8개로 커피 | P1 |
| npc_sheep | 양 자매 | 양 | 말랑마을 | 옷가게 | 패션 | P1 |

이주민 후보 16종(P1): 곰 몽실, 토끼, 고양이, 강아지, 여우, 다람쥐, 판다, 개구리, 코알라, 햄스터, 알파카, 부엉이, 고슴도치, 아기공룡 "티라미"(티노 조카), 펭귄, 외계인 삐리.

## 3.11 ui — HUD·도감·잡았다 연출·상자 연출·코인·업적
**파일**: `src/modules/ui.ts`, `src/modules/ui/**` (코어 `GameUI.renderCatch` 훅을 덮어쓴다)

**P0**
1. **HUD**: 오른쪽 위 코인(카운트업 애니메이션) + 반짝별, 왼쪽 위 시계(게임 시각·날씨 아이콘·섬 이름), 아래 가운데 상호작용 안내(코어 prompt 꾸미기), 오른쪽 아래 두근 게이지 3개(낚시·곤충·상자, 5.3), 콤보 카운터(5 이상일 때만).
2. **잡았다 연출 5단계**(5.1 표) + 반짝이·왕관 추가 연출 + 처음이면 **NEW! 도장 쾅**.
3. **도감 창(B)**: 탭 = 물고기 / 바다 / 곤충 / 공룡 / 화석 / 우주 / 탈것. 섬별 필터. 칸 = 실루엣(못 잡음, 먹색 실루엣 + "?") / 컬러(잡음). 칸 클릭 → 큰 그림·이름·★·서식·시간·날씨·한 줄·최대 크기·잡은 수·기증 여부. 섬별 % 바, 100% 면 섬 왕관.
4. **가방 창(Tab)**: 20칸 격자, 아이템 아이콘(종 모델을 오프스크린 렌더한 썸네일 또는 색 원 + 이름), 팔기·기증 버튼은 상점·박물관 앞에서만.
5. **상점 창**(`open-shop`): 팔기 탭(가방 목록 + 오늘 시세 + "오늘의 인기!" 뱃지 + 다 팔기) / 사기 탭(4.5 표). 박물관 창(`open-museum`): 기증 가능한 것만. 제작 창(`open-craft`): 레시피 목록, 재료 있음/없음 색, 만들기 → 뚝딱 연출.
6. **상자 열기 연출**(5.4): 흔들림 횟수 힌트(1번 나무, 2번 은, 3번+빛 기둥 = 금 이상) → 뚜껑 팡 → 아이템이 하나씩 튀어나와 코인 분수.
7. 섬 발견 카드(`discover`): 화면 가운데 큰 이름 + 지도 도장.
8. 토스트·날씨 배너("유성우가 내려요!", "안개 속에 뭔가가…").

**P1**: 업적 창(5.7), 지도(M, 섬·발견·등대·우편함), 일일 미션 창, 캡슐머신 연출, 숙련도 레벨, 사진 모드(P), 세트 완성 대형 연출, 섬 개발 세리머니.

## 3.12 village — 마을 건물·다리·부두·박물관·상점 외형
**파일**: 기존 `src/modules/props.ts` / `props/village.ts` 계열(마을 담당 모듈)

**배치 원칙**: 시작 마을 룩(원점 ±25m)은 건드리지 않는다. 새 건물은 원점에서 북쪽·동쪽 30~250m 안, `isBuildable`/`heightAt` 로 평평한 곳에 `scatter` 로 자리 잡는다(아래 좌표는 목표값, 안 되면 가까운 평지로).

**P0**
| 건물 | 목표 위치 | 크기 | 외형 | 기능(이벤트) |
|---|---|---|---|---|
| 꽥꽥상회 | (35, −45) | 10×8m | 노랑 벽, 주황 줄무늬 차양, 오리 간판, 둥근 창 | 카운터 E → `open-shop {shop:'quack'}` |
| 박물관 | (−40, −80) | 20×14m, 돔 지붕 | 크림 돌 + 하늘색 돔, 기둥 4, 물고기·나비·공룡 뼈 실루엣 부조 | 입구 E → `open-museum`. 내부는 P1(기증하면 수조·케이스가 채워지는 전시 방) |
| 작업대 | (20, −30) 광장 가장자리 | 2×1m | 나무 작업대 + 망치·톱 | E → `open-craft` |
| 조선소 부두 | 말랑섬 남동 해안(원점 동쪽 해변 끝) | 부두 30m + 창고 | 나무 부두, 빨간 창고, 밧줄 더미, 작은 크레인 | 카운터 E → `open-shop {shop:'shipyard'}`, 배 소환 지점 |
| 다리 3 | 말랑섬 강 위(원점 북쪽 강 구간) | 강 폭 + 2m | 아치형 나무 다리, 난간 둥근 기둥 | 건너기 |
| 등대 7 | 섬마다 원점 방향 해안 | 높이 16m | 흰·빨강 줄, 둥근 꼭대기 | 복구 전 꺼짐, 복구 후 밤 회전 빛(P1 빠른 이동) |
| 우체통 | 집 앞(기존) | — | 기존 | 아침 우편(P1) |
| 발사탑 뼈대 | 별똥별섬 메사 중앙 | 높이 80m | 1단계: 철골 비계(노랑·빨강 철골, 둥근 볼트). 부품 수에 따라 단계 0~6 | E → 펭박사/발사(vehicles) |
| 게시판 | 광장 | — | 코르크 판 + 핀 | 오늘의 인기 생물·뉴스(P1 내용) |

**P1**: 섬 특산 시설 7종(양봉장·다이빙 센터·반딧불 정원·화석 연구소+부화장·얼음낚시 오두막·오아시스 바자르·천문대), 박물관 내부 4동, 집 증축 단계별 외형, 캡슐머신, 부표 우체통 6, 비눗방울 정류장, 주민 집.

## 3.13 atmosphere — 하늘·구름·시간·날씨·지역 분위기
**파일**: 기존 `src/modules/atmosphere.ts` + `atmosphere/**`

**P0**
1. **30분 하루**: 게임 1시간 = 75초. 시각 → `TOD` 프리셋(morning·day·sunset·night) 사이를 부드럽게 보간. 구간: 아침 05~09(5분), 낮 09~17(10분), 저녁 17~21(5분), 밤 21~05(10분). 시작 시각 = 오전 9시(`?tod=` 로 덮어쓰기 유지).
2. `game.env` 갱신(0.6) + `env` 이벤트(게임 1시간마다·날씨 바뀔 때).
3. **날씨 5종**: 맑음 / 비(빗줄기 파티클 + 물웅덩이 반짝 + 채도 −) / 폭풍(강한 비 + 바다 파도 ×2 + 번개 번쩍, 무섭지 않게 파스텔 보라) / 안개(가까운 안개 + 부드러운 빛) / 유성우(밤 전용, 별똥별 줄 + 반짝). 날씨는 게임 4시간마다 굴린다(아래 표).
4. **섬별 분위기 프리셋**(플레이어가 있는 섬에 따라 5초에 걸쳐 섞임): home 기본 / dino 습한 초록 안개 + 화산 쪽 따뜻한 빛 + **하트 연기**(화산 꼭대기 연기 파티클이 하트 모양으로 피어오름) / ice 차가운 파랑 + 눈 내림(비 → 눈으로 바뀜) / mushroom 보라·청록 안개, 밤 발광 강조, 반딧불 많이 / coral 채도 높은 청록 / desert 따뜻한 살구 아지랑이(비 → 모래폭풍) / launch 맑은 남색 밤하늘, 별 밀도 ×2.
5. 구름: 몽실몽실 둥근 구름(룩 그대로) 고도 120~200m, 바다 위로 넓게.

**P1**: 무지개(비 그친 뒤 게임 2시간, 하늘 무지개 아치), 오로라(솜눈섬 밤, 리본 셰이더), 보름달 주기(게임 8일 주기), 계절, 우주 하늘(지구가 떠 있음 — space 와 협의).

| 날씨 확률 (게임 4시간마다) | 맑음 | 비 | 폭풍 | 안개 | 유성우(밤 블록만) |
|---|---|---|---|---|---|
| 기본(home·coral·dino) | 55 | 22 | 6 | 9 | 8 |
| ice | 45(맑음) | 25(→눈) | 8(→눈보라) | 12 | 10(+오로라 P1: 밤 맑음의 40%) |
| mushroom | 40 | 25 | 5 | 22 | 8 |
| desert | 70 | 8(→모래폭풍) | 6(→모래폭풍) | 4 | 12 |
| launch | 50 | 15 | 5 | 8 | **22** |
> 유성우는 밤 블록에서만. 낮 블록에 유성우가 나오면 맑음으로.

---

# 4. 콘텐츠 소비 설계 (가장 중요)

> 원칙: **"잡은 친구는 하나도 버리지 않는다." 모든 수집품은 쓸 곳이 일곱 군데다.** 팔기 · 기증 · 제작 · 주민 부탁·선물 · 꾸미기 · 섬 개발·탈것 · 로켓·우주.

## 4.1 재화
| 재화 | id / 저장 | 버는 곳 | 쓰는 곳 |
|---|---|---|---|
| **도파코인** | 코어 `state.coins` | 판매, 상자, 주민 부탁, 코인 주머니(나무 5%), 금화 단지 | 도구·미끼, 탈것, 가방 확장, 집 증축, 박물관 증축, 섬 개발 기부, 발사대 건설, 화석 감정 |
| **반짝별** (마일리지) | `flags.econ.stars` | 도감 첫 등록, 박물관 첫 기증, 일일 미션, 업적, 세트 완성 | 레시피 카드, 탈것 면허, 주민 초대권, 캡슐 티켓, 펭박사 로켓 설계도, 특별 가구 |
| **열쇠 조각** 은·금·무지개 | `flags.econ.keys{silver,gold,rainbow}` | 낚시 녹슨 열쇠(은), 벌집·곤충 둥지(은), 상자 안(금 2%, 무지개 1%), 일일 미션, 세트 완성 | 조각 3개 = 열쇠 1 → 등급 상자 |
| **캡슐 티켓** | 아이템 `it_capsule` | 상자, 주민 감사, 반짝별 20으로 교환 | 두근두근 캡슐머신(의상·탈것 스킨·한정 가구, P1) |
| **달떡** (P1) | 아이템 `m_mochi` | 달토끼 떡방아, 달 생물 판매 | 우주 상점 |

### 4.1.1 반짝별 획득표
| 행동 | 반짝별 |
|---|---|
| 도감 첫 등록 ★1/★2/★3/★4/★5 | 1 / 2 / 3 / 5 / 10 |
| 박물관 첫 기증 (같은 표) | 1 / 2 / 3 / 5 / 10 |
| 반짝이 첫 등록 | 10 |
| 일일 미션 1개 / 5개 모두 | 3 / +10 보너스 |
| 업적 | 5~50 (5.7) |
| 세트 완성 | 20~100 (4.11) |
| 섬 도감 50% / 80% / 100% | 20 / 50 / 100 |

## 4.2 가방과 보관
- 가방 20칸. **칸 = 아이템 종류 하나.** 생물은 한 칸에 10마리, 재료는 30개, 도구는 1개(도구는 별도 도구 벨트 5칸, 가방 차지 안 함).
- 가방이 꽉 차면 "가방이 꽉 찼어요!" 토스트 + 그 자리에서 **놓아주기(생물) / 버리기(재료)** 선택(P1, P0 는 못 줍게).
- 확장: 20→30칸 5,000 / 30→40칸 25,000 / 40→50칸 100,000 (꽥꽥상회).
- 집 보관함(P1): 200칸.

## 4.3 재료 (category `'item'`, economy data.ts) — 30종 + 쓰레기
| id | 이름 | 얻는 곳 | 기본 판매가 | 주요 쓰임 |
|---|---|---|---|---|
| m_wood | 나무 | 나무 베기(전 섬) | 20 | 모든 DIY, 뗏목, 다리 |
| m_hardwood | 단단한 나무 | 나무 베기 20% | 40 | 로켓 동체, 썰매 |
| m_stone | 돌 | 돌 두드리기 | 15 | 등대, 다리, 망치 |
| m_clay | 점토 | 돌 두드리기 15% | 30 | 화분, 도자기 가구 |
| m_iron | 철광석 | 돌 15%, 망치꼬리, 뿔뿔이 돌진 | 150 | 도구 업그레이드, 배, 로켓 |
| m_gold | 금광석 | 돌 3%, 금상자 | 1,500 | 황금 도구, 황금 미끼, 로켓 엔진 |
| m_vine | 덩굴 밧줄 | coral·mushroom 나무 E | 30 | 뗏목, 돛 |
| m_petal | 꽃잎 | 꽃 줍기 | 15 | 돛, 화관, 열기구 |
| m_honey | 꿀 | 벌집(나무 흔들기 3%), 양봉장(P1) | 200 | 황금 미끼, 로켓 날개, 요리 |
| m_shell | 조개껍데기 | 해변 줍기 | 30 | 스노클, 루어, 조개 가구 |
| m_seaweed | 해초 | 낚시 쓰레기, 잠수 | 20 | 잠수복, 산소 캡슐 |
| m_coral | 산호 조각 | 잠수(reef) | 120 | 잠수복, 산호 램프, 산소 캡슐 |
| m_pearl | 진주 | 진주굴 20%, 대왕조개 | 2,000 | 황금 낚싯대, 잠수복, 램프 |
| m_spore | 버섯 포자 | mushroom 버섯 E | 60 | 요리, 버섯 가구 |
| m_glowcap | 발광 버섯 | mushroom 밤 | 150 | 잠수정 조명, 버섯 램프 |
| m_icecrystal | 얼음 결정 | ice 돌 | 300 | 로켓 조종석 창, 썰매 |
| m_sandglass | 모래유리 | desert 돌 | 300 | 로켓 창, 수조, 랜턴 |
| m_volcanic | 화산유리 | dino 돌 | 300 | 로켓 엔진, 통통 엔진, 부화기 |
| m_amber | 호박(琥珀) | dino 화석 X 10% | 800 | 호박 램프, 로켓 연료 첨가 |
| m_feather | 깃털 | dino 둥지 절벽 줍기, 익룡 친밀도 | 120 | 로켓 날개, 화관 |
| m_fern | 고사리 | dino 풀 | 15 | 초식 공룡 먹이 |
| m_ginkgo | 은행 | dino 은행나무 | 40 | 공룡 먹이, 요리 |
| m_stardust | 별가루 | 별가루나방, 반짝가루나방, 크레이터(매일), 유성우 소원 | 500 | 로켓 연료, 행운 쿠키, 황금 잠자리채 |
| m_starapple | 별사과 | launch 별사과나무 | 400 | 로켓 연료 |
| m_meteor | 운석 조각 | launch 돌, 크레이터 | 600 | 우주 가구, 로켓 |
| m_moonrock | 월석 | 달 월석거북·돌 | 1,200 | 우주 가구, 지구에서 고가 판매 |
| m_frostberry | 서리 열매 | ice 눈꽃나무 | 120 | 매머드 먹이, 셔벗 |
| m_apple·m_peach·m_cherry·m_orange·m_pear | 과일 5종 | home 과일나무(섬마다 다른 과일 3배) | 100 (다른 섬 과일 300) | 먹기(힘), 요리, 공룡 먹이, 선물 |
| m_coconut·m_banana·m_date | 열대 과일 | coral·desert | 150 | 〃 |
| m_balloon_scrap | 풍선 조각 | 풍선 선물 터뜨리기 | 50 | 열기구 |
| t_boot·t_can·t_tire | 장화·깡통·타이어(쓰레기) | 낚시 쓰레기 | 10 | 재활용 DIY(장화 화분, 깡통 로봇), 너구리 고물상 |
| t_bottle | 병편지 | 낚시 5%, 해변 표류 | — | 열면 보물지도(쪼꼬미섬 금상자) / 레시피 / 주민 사연 |
| t_rustykey | 녹슨 열쇠 | 낚시 쓰레기 | — | 줍는 즉시 은열쇠 조각 +1 |

## 4.4 상점·시세
- **판매가** = 0.7 공식 × 오늘 시세.
- **오늘의 인기 생물**: 게임 하루마다 시드(`day`)로 물고기 1·곤충 1·바다/공룡섬 1 = 3종을 골라 **×2**. 게시판·꽥사장 대사·HUD 토스트로 알린다("오늘은 고등어가 인기래!").
- **오늘의 손님 생물**(P1): 하루 한 종 출현 ×5, 기증하면 반짝별 +5.
- **판매 포화**: 같은 종을 하루에 10마리 넘게 팔면 11번째부터 마리당 −5%, 최저 50%. 다양하게 잡게 하는 장치. 다음 날 초기화.
- **재료 시세**: 재료마다 ±20% 사인 파동(주기 게임 5일, 재료마다 위상 다름).
- **상인별 보정**(P1): 오아시스 바자르(낙타) 곤충 ×1.3·물고기 ×0.9 / 달 떡방아 지구 생물 ×1.5 / 너구리 고물상 쓰레기 10코인 + 재활용 포인트(10포인트 = 반짝별 1).
- **친구 섬 시세**(P1): 친구 섬 꽥사장은 인기 생물이 다르다 → 친구 섬에 팔러 가는 재미.

## 4.5 상점 품목 (정식 가격 / P0 테스트 가격 = 1/5)
| 상점 | id | 품목 | 가격 | 효과 | 조건 |
|---|---|---|---|---|---|
| 꽥꽥상회 | shop_worm | 지렁이 미끼 ×5 | 100 | 기본 미끼(삽으로 땅 파면 공짜 1) | — |
| 〃 | shop_dough | 떡밥 ×3 | 300 | ★2+ ×1.3 | — |
| 〃 | shop_lure | 반짝 루어 ×1 | 800 | ★3+ ×1.5 | 낚시 50회 |
| 〃 | shop_shovel | 삽 | 800 | 화석 X 파기, 지렁이 | — |
| 〃 | shop_hammer | 돌망치 | 600 | 돌 두드리기, 나무 베기 | — |
| 〃 | shop_slingshot | 새총 | 1,200 | 풍선 선물 맞추기 | — |
| 〃 | shop_bike | 자전거 해금 | 8,000 | v_bike | — |
| 〃 | shop_bag30 / 40 / 50 | 가방 확장 | 5,000 / 25,000 / 100,000 | +10칸 | 순서대로 |
| 〃 | shop_recipe_* | 레시피 카드 | 반짝별 10~50 | 4.6 의 '레시피 카드' 레시피 해금 | — |
| 〃 | shop_capsule | 캡슐 티켓 | 반짝별 20 | 캡슐머신 1회 | P1 |
| 〃 | shop_house1~4 | 집 증축 | 9,800 / 98,000 / 198,000 / 498,000 | 집 크기·방 추가(P1 외형) | 순서대로 |
| 조선소 | shop_tugboat | 통통배 | 30,000 | v_tugboat | 말랑섬 도감 30% (P0: 조건 없음) |
| 〃 | shop_yacht | 돛단요트 | 60,000 + r_sail | v_yacht | 섬 3곳 방문 |
| 〃 | shop_motorboat | 모터보트 | 150,000 + r_engine | v_motorboat | 섬 4곳 방문 |
| 박물관 | shop_wing_* | 박물관 증축 | 수족관동 무료(처음부터) / 곤충관 50,000 / 화석관 100,000 / 해저관 80,000 / 천문관 200,000 | 기증 가능한 범주 확장 | 곤충관 이전엔 곤충 기증 불가 (P0: 전부 열림) |
| 펭박사 | shop_blueprint | 로켓 설계도 | 반짝별 200 | 로켓 부품 레시피 6개 해금 | 섬 4곳 방문 (P0: 반짝별 20) |
| 펭박사 | shop_launchpad | 발사대 건설 | 300,000 | 발사 가능 | 부품 6개 제작 (P0: 30,000) |

## 4.6 DIY 제작 레시피 (작업대에서 E) — 49개
"해금"이 `기본`이면 처음부터, `레시피 카드`면 상점 반짝별, `상자`면 상자·병편지에서 레시피 카드가 나온다.

| id | 결과 | 재료 | 효과 / 쓰임 | 해금 | 우선 |
|---|---|---|---|---|---|
| r_rod | 낚싯대 | 나무 5 | 낚시 (처음 지급) | 기본 | P0 |
| r_net | 잠자리채 | 나무 5 + 덩굴 1 | 곤충 (처음 지급) | 기본 | P0 |
| r_shovel | 삽 | 나무 5 + 철광석 2 | 화석·지렁이 | 기본 | P0 |
| r_hammer | 돌망치 | 나무 5 + 돌 5 | 돌·나무 베기 | 기본 | P0 |
| r_slingshot | 새총 | 나무 10 | 풍선 선물 | 기본 | P0 |
| r_good_rod | 좋은 낚싯대 | 나무 10 + 철광석 3 | 입질 창 +0.1초, ★3+ +5% | 낚시 30회 | P0 |
| r_golden_rod | 황금 낚싯대 | 좋은 낚싯대 + 금광석 5 + 진주 1 | ★4+ +10%, 줄다리기 쉬움 | 낚시 300회 | P0 |
| r_good_net | 좋은 잠자리채 | 나무 10 + 철광석 3 | 범위 +30% | 곤충 30회 | P0 |
| r_golden_net | 황금 잠자리채 | 좋은 잠자리채 + 금광석 5 + 별가루 3 | ★4+ +10%, 반짝이 ×2 | 곤충 300회 | P0 |
| r_snorkel | 스노클 마스크 | 조개 5 + 해초 5 + 철광석 1 | 잠수 40초 | 기본 | P0 |
| r_wetsuit | 잠수복 | 해초 20 + 산호 10 + 진주 1 | 잠수 90초, 산호초 깊은 곳 | 레시피 카드 30 | P0 |
| r_worm_bait | 지렁이 미끼 ×3 | 과일 1 | 기본 미끼 | 기본 | P0 |
| r_dough_bait | 떡밥 ×3 | 과일 2 + 꽃잎 2 | ★2+ ×1.3 | 기본 | P0 |
| r_shiny_lure | 반짝 루어 | 조개 3 + 철광석 1 | ★3+ ×1.5 | 레시피 카드 10 | P0 |
| r_golden_bait | 황금 미끼 | 금광석 1 + 꿀 1 | ★5 ×3 | 레시피 카드 30 | P0 |
| r_lava_bait | 화산 미끼 | 화산유리 1 + 지렁이 3 | 용암붕어 ×3 | 상자 | P1 |
| r_grilled_fish | 생선구이 | ★1 물고기 3 + 나무 2 | 30분 ★3+ +20% | 기본 | P0 |
| r_fruit_pie | 과일 파이 | 과일 5 + 꿀 1 | 10분 이동 속도 +20% | 레시피 카드 10 | P1 |
| r_lucky_cookie | 행운 쿠키 | 별가루 1 + 꿀 1 | 하루 반짝이 확률 ×2 | 유성우 소원 | P1 |
| r_oxygen | 산소 캡슐 ×3 | 해초 3 + 산호 1 | 달 체류(1개 = 게임 4시간) | 우주센터 | P0 |
| r_raft | **뗏목** | 나무 20 + 덩굴 5 | v_raft 해금 | 기본(곰 몽실 첫 부탁 후) | P0 |
| r_sail | 돛 | 꽃잎 20 + 덩굴 10 | 요트 부품 | 레시피 카드 20 | P1 |
| r_engine | 통통 엔진 | 철광석 15 + 화산유리 5 | 모터보트 부품 | 레시피 카드 30 | P0 |
| r_sub_hull | 잠수정 선체 | 철광석 30 + 모래유리 10 + 발광 버섯 5 | 잠수정 부품 | 다이빙 센터 | P1 |
| r_balloon | 열기구 풍선 | 풍선 조각 30 + 꽃잎 30 + 덩굴 10 | 열기구 | 풍선 30개 | P1 |
| r_sled | 펭귄 썰매 | 단단한 나무 10 + 얼음결정 5 | 썰매 | 솜눈섬 | P1 |
| r_rocket_body | **로켓 동체** | 철광석 40 + 단단한 나무 20 | 로켓 부품 ① | 설계도 | P0 |
| r_rocket_engine | **로켓 엔진** | 화산유리 15 + 금광석 10 | 로켓 부품 ② | 설계도 | P0 |
| r_rocket_window | **조종석 창** | 얼음결정 10 + 모래유리 10 | 로켓 부품 ③ | 설계도 | P0 |
| r_rocket_wing | **로켓 날개** | 깃털 20 + 꿀 10 | 로켓 부품 ④ | 설계도 | P0 |
| r_rocket_fuel | **반짝 연료** | 별가루 50 + 별사과 10 (+호박 1 = 품질 업 P1) | 로켓 부품 ⑤ | 설계도 | P0 |
| (기증 보상) | **항법 칩** | 별자리 물고기 12종 기증 | 로켓 부품 ⑥ (제작 아님) | 박물관 | P0 |
| r_fish_tank | 물고기 수조 | 모래유리 3 + 물고기 1 | 집에 그 물고기 전시(헤엄침) | 기본 | P1 |
| r_bug_cage | 곤충 케이지 | 나무 5 + 곤충 1 | 집에 곤충 전시 | 기본 | P1 |
| r_firefly_lantern | 반딧불 랜턴 | 반딧불이 3 + 모래유리 1 | 밤에 빛나는 가구 | 레시피 카드 10 | P1 |
| r_figure | 피규어 | 같은 종 5마리 | 그 종의 귀여운 피규어 가구 | 피규어 공방 | P1 |
| r_shell_bed | 조개 침대 | 조개 10 + 산호 5 | 가구 | 상자 | P1 |
| r_coral_lamp | 산호 램프 | 산호 5 + 진주 1 | 가구 | 상자 | P1 |
| r_amber_lamp | 호박 램프 | 호박 3 + 나무 5 | 가구 | 상자 | P1 |
| r_mushroom_lamp | 버섯 램프 | 발광 버섯 3 + 나무 2 | 가구 | 반딧불버섯섬 | P1 |
| r_boot_planter | 장화 화분 | 장화 1 + 꽃잎 3 | 재활용 개그 가구 | 기본 | P1 |
| r_can_robot | 깡통 로봇 | 깡통 5 + 철광석 1 | 재활용 개그 가구(삐걱 움직임) | 기본 | P1 |
| r_bone_slide | 뼈 미끄럼틀 | 중복 화석 조각 5 + 나무 10 | 마당 놀이기구 | 화석관 | P1 |
| r_cactus_pot | 선인장 화분 | 점토 3 + 선인장꽃 1 | 가구 | 모래시계섬 | P1 |
| r_incubator | 공룡 부화기 | 철광석 10 + 화산유리 3 + 단단한 나무 5 | 공룡 알 부화(게임 3일) | 화석 연구소 | P1 |
| r_lighthouse_kit | 등대 수리 키트 | 돌 30 + 철광석 5 + 섬 특산 재료 5 | 섬 개발 ① | 기본 | P0 |
| r_bridge_kit | 다리 키트 | 나무 30 + 돌 10 | 섬 개발 ② | 기본 | P1 |
| r_flower_crown | 화관 | 꽃잎 10 + 깃털 1 | 머리 장식 | 레시피 카드 10 | P1 |
| r_space_lamp | 월석 램프 | 월석 3 + 운석 조각 1 | 우주 가구 | 달 | P1 |

### 4.6.1 주민 부탁·선물·우정 (P1, 규칙은 지금 정한다)
- 주민 우정 0~100(하트 5칸 = 20씩). 대화 하루 첫 번 +1, 부탁 완료 +5~10, 선물 +2(좋아하는 범주 +5, 싫어하는 −1), 생일 선물 ×3.
- **부탁 템플릿** (하루 주민당 1개, 게시판 3개):
  1. "○○ 보고 싶어!" — 특정 종 1마리(현재 시간·날씨에 출현 가능한 종만 고른다).
  2. "○○ 3개 가져다줄래?" — 재료.
  3. "파란 거 아무거나!" — 색 조건(look.c1 계열).
  4. "★3 이상 물고기!" — 희귀도 조건.
  5. "우리 집에 수조 놔줘" — 가구 제작.
  6. "같이 반딧불 보러 가자" — 밤에 특정 장소 동행(P1).
  7. "옆 섬 ○○에게 편지 전해 줘" — 배달(섬 이동 동기).
  8. "내 생일 선물로 ○○" — 생일 날.
- 보상: 코인 300~3,000, 레시피 카드, 감사 편지(가구), 캡슐 티켓, 열쇠 조각, 별조각(섬 주인 체인 마지막).
- 우정 100 → 이사 제안(섬 개발 ④), 사진 선물.

### 4.6.2 섬 주인 부탁 체인 (별조각 7개 이야기, P1)
| 별조각 | 섬 | 섬 주인 | 체인 마지막 부탁 |
|---|---|---|---|
| ① | home | 곰 몽실 | 폭포 뒤 동굴 찾기 |
| ② | coral | 보들(수달) | 꿀꺽호 난파선 선장의 망원경 가져오기 |
| ③ | mushroom | 부엉 교수(부엉이) | 반딧불이 30마리 놓아주기(빛병) |
| ④ | dino | 목길이 할머니 | 고대 벽화 동굴 찾기 + 화석 골격 5 |
| ⑤ | ice | 흰눈 영감(북극곰) | 오로라 밤에 오로라나비 보여 주기 |
| ⑥ | desert | 소금별(사막여우 천문학자) | 모래폭풍 뒤 신전 |
| ⑦ | launch | 삐뽀(관제탑 로봇) | 별자리 물고기 12종 |

### 4.6.3 NPC 대사 (P0)
- 꽥사장 첫 만남: "꽥! 새 얼굴이구먼! 잡은 건 뭐든 사 주지. 오늘 인기 생물은 게시판에 붙여 놨어!" / 평소: "꽥! 또 왔구먼!", "그건 오늘 두 배야, 꽥!", "가방이 터지겠구먼, 꽥."
- 느릿 관장 첫 만남: "오오…… 어서…… 오세요…… 처음 보는…… 생물을…… 가져오면…… 전시해…… 드리죠……" / 기증 시: "오오…… 이건…… 정말…… 귀한…… (5초 뒤) ……친구로군요……"
- 펭박사: "난 날개는 있는데 날 줄은 몰라. 그래서 로켓을 만들지! 부품 여섯 개만 모아 주게. 모든 섬을 다 돌아야 할 걸세!"
- 곰 몽실: "왔구나! 오늘은 뭐 잡았어?", "강가 그림자 봤어? 살금살금 가야 해!", "뗏목 만들면 저 바다 너머도 갈 수 있대!"

## 4.7 섬 개발 단계 (코인·재료를 크게 쓰는 곳)
섬마다 5단계. 단계가 오를 때마다 **새 생물 1종 출현 + 새 상자 구역**이 열리고, 섬이 눈에 띄게 변한다(village 외형 P1).

| 단계 | 내용 | 비용(정식) | 효과 |
|---|---|---|---|
| ① 등대 복구 | 등대에 불 | 20,000 + 등대 수리 키트 | 빠른 이동 정류장(비눗방울, P1), 섬 지도 공개 |
| ② 부두·다리 | 부두 + 섬 안 다리 2 | 30,000 + 다리 키트 2 | 배 정박, 지름길 |
| ③ 섬 특산 시설 | 아래 표 | 80,000 + 특산 재료 20 | 섬 고유 기능 |
| ④ 주민 이주 | 주민 2명 부탁 체인 완료 | — | 주민 집, 매일 부탁 |
| ⑤ 섬 별 5개 | 섬 도감 80% + 꾸미기 점수 | — | 섬 깃발·음악 상자·섬 전용 가구 세트 |

| 섬 | 특산 재료 | ③ 특산 시설 | 시설 기능 |
|---|---|---|---|
| home | 꽃잎·꿀 | 양봉장 + 꽃시장 | 꿀 매일 5, 꽃 교배 |
| coral | 산호·진주 | 다이빙 센터(보들) | 스노클·잠수복 판매, 잠수정 의뢰 |
| mushroom | 발광 버섯 | 반딧불 정원 + 물약 가게 | 밤 반딧불 ×2, 버프 물약 |
| dino | 화산유리·깃털 | 화석 연구소 + 부화장 | 화석 감정, 알 부화 |
| ice | 얼음 결정 | 얼음낚시 오두막 + 스키 리프트 | 얼음 구멍 낚시, 썰매 |
| desert | 모래유리 | 오아시스 바자르 | 다른 시세, 모래 버기 |
| launch | 별가루·별사과 | 천문대 + 발사대 | 유성우 예보, 로켓 발사 |

## 4.8 해금 키와 조건 (economy `isUnlocked` 정본)
| 키 | 조건(정식) | P0 테스트 조건 | 무엇이 열리나 |
|---|---|---|---|
| `tool:rod` `tool:net` | 첫 접속 | 첫 접속 | 낚시·곤충 |
| `tool:shovel` `tool:hammer` `tool:slingshot` | 구매/제작 | 구매/제작 | 화석·돌·풍선 |
| `tool:snorkel` / `tool:wetsuit` | 제작 | 제작 | 잠수 40초 / 90초 |
| `v:bike` | 8,000 | 1,600 | 자전거 |
| `v:raft` | 뗏목 제작(나무 20 + 덩굴 5) | 나무 4 + 덩굴 1 | 뗏목 → 다른 섬 |
| `v:tugboat` | 30,000 + 말랑섬 도감 30% | 6,000 | 통통배 |
| `v:motorboat` | 150,000 + 통통 엔진 | 30,000 + 통통 엔진 | 모터보트 |
| `rocket:blueprint` | 반짝별 200 + 섬 4곳 방문 | 반짝별 20 | 로켓 부품 레시피 |
| `rocket:part:*` (6개) | 각 부품 제작/기증 | 재료 1/5, 항법 칩은 별자리 3종 기증 | 발사탑 단계 +1 |
| `rocket:pad` | 부품 6 + 300,000 | 부품 6 + 30,000 | 발사 |
| `space:moon` | 첫 발사 | 첫 발사 | 달 |
| `dino:<id>` | 친밀도 5 | 친밀도 2 | 탈것·펫 |
| `wing:*` | 박물관 증축 | 전부 열림 | 기증 범주 |

> **오늘 밤 하드 잠금 없음**: 섬은 배만 있으면 다 간다. 수영으로 먼바다는 못 간다(체력, 3.3). 해구는 잠수정 전엔 깊이 때문에 못 내려간다.

## 4.9 오늘 밤 P0 로 실제 돌아가야 하는 소비 루프 (최소 완료 기준)
`?p0=1`(기본) 테스트 수치로 **아래 10단계가 처음부터 끝까지 한 판에 이어져야 한다.**
1. 말랑섬 강에서 낚시 → 물고기 획득(잡았다 연출·도감 NEW). — fishing·ui
2. 꽃밭에서 곤충 → 획득. — insects
3. 상자 열기 → 코인·재료. — village/world·economy·ui
4. 나무 흔들기·베기·돌 두드리기 → 과일·나무·돌·철광석. — flora
5. **꽥꽥상회에서 팔기 → 코인**(오늘의 인기 ×2 보임). — economy·ui·village
6. **사기**: 반짝 루어 또는 자전거(1,600). — economy·ui
7. **제작**: 작업대에서 뗏목(나무 4 + 덩굴 1). — economy·ui
8. **해금**: F 로 뗏목 → 산호빛섬 → 수영·잠수 → 바다 생물. — vehicles·ocean·world
9. **기증**: 박물관에 기증 → 반짝별 → 로켓 설계도(반짝별 20) → 부품 6개 제작(P0 수치) → 발사대(30,000). — economy·ui·village
10. **발사 → 달** → 떡붕어 낚시·반짝가루나방 채집·월석 → 귀환 → 월석 판매(×1.8 우주 보정). — vehicles·space·fishing·economy
> `?cheat=1` 은 9~10 만 빠르게 보는 단축키(코인·재료 전부 지급).

## 4.10 일일 미션 (P1, 게임 하루마다 5개, 각 반짝별 3 + 다섯 개 모두 +10)
템플릿 15: 물고기 5마리 / 곤충 3마리 / ★3 이상 1마리 / 처음 보는 종 1 / 상자 3개 / 돌 두드리기 5 / 나무 흔들기 5 / 화석 X 2개 / 기증 2 / 팔기 5,000코인 / 다른 섬 가기 / 잠수 생물 2 / 공룡 먹이 3 / 풍선 선물 1 / 오늘의 인기 생물 잡기.

## 4.11 세트 수집 보너스 (P1)
| 세트 | 조건 | 보상 |
|---|---|---|
| 무지개 구피 | 무지개구피 7색 | 무지개 루어(★3+ +20% 영구) + 반짝별 30 |
| 별자리 12 | 별자리 물고기 12종 기증 | **로켓 항법 칩** + 반짝별 100 |
| 밤의 빛 | 발광 생물 8종(반딧불·용암붕어·초롱·반딧불송사리 …) | 반딧불 랜턴 + 밤 시야 확대 |
| 볼빵빵 | BALL 몸형 10종 | 말랑 쿠션 가구 세트 |
| 갯민숭 5색 | 젤리바니 5색 | 바다토끼 인형 |
| 고대 | 고대어 6 + 골격 3 | 공룡 목장 확장 |
| 섬 마스터 ×7 | 섬 고유종 전부 | 섬 깃발 + 음악 상자 + 반짝별 100 |
| 왕관 컬렉터 | 왕관 개체 10 | 금관 모자 |
| 반짝이 헌터 | 반짝이 5 | 반짝이 잠자리채(반짝이 ×2) |
| 우주 첫걸음 | 우주 생물 5 | 우주 온실 정원 |

**중복 처리(버릴 게 없게)**: 마스터리 별 3개(1회 등록 → 10회 은별 → 왕관 개체 금별) · 피규어 공방(같은 종 5) · 판매 포화 · 오늘의 인기 · 공룡 먹이 · 재료 레시피.

## 4.12 꾸미기 (P1, 설계만)
- **집**: 가구 배치(격자 0.5m), 벽지·바닥, 수조(물고기가 헤엄침)·곤충 케이지·피규어 진열장·공룡 알 부화기. 집 평가 점수.
- **마당·섬**: 꽃 심기, 울타리, 연못(잡은 물고기 방류), 공룡 울타리(아기공룡 펫), 반딧불 놓아주기(밤 풍경 변화).
- **섬 평가**: 꾸미기 점수 + 섬 도감 % → 별 1~5 → 새 주민 이사, 섬 음악 바뀜.

## 4.13 하루 루틴 — 접속하면 할 일 10가지 (게임 하루 30분)
1. **우편함** 열기: 주민 편지·선물·오늘의 뉴스(인기 생물 3종, 날씨 예보, 오늘의 손님 생물).
2. **게시판** 부탁 3개 받기.
3. **돌 5개 두드리기**(연타 콤보 → 광석).
4. **나무 흔들기**(과일·벌집·코인 주머니) + **화석 X 4개** 파기.
5. **오늘 첫 낚시·첫 곤충은 ★3 이상 확정**(접속 보상) 받기.
6. 오늘의 인기 생물 노리고 낚시 → **꽥꽥상회 팔기**.
7. **박물관 기증**(새로 잡은 것) → 반짝별.
8. **작업대 제작**(미끼·도구·부품).
9. **다른 섬 항해**(해류 타기, 바다 이벤트) → 그 섬 생물·상자.
10. **밤**: 반딧불·장수풍뎅이·심해어, 유성우면 별똥별섬에서 소원 + 별가루.

### 요일 이벤트 (게임 날짜 % 7, P1)
월 꽃잎비(말랑 꽃잎 언덕 꽃잎 생물 ×2) / 화 공룡 대이동 / 수 사막 모래폭풍 뒤 신전 / 목 반딧불 대축제(버섯섬) / 금 고래 길 고래 / 토 해적선 보물 / 일 유성우 확정(별똥별섬 별가루 ×2).

## 4.14 장기 목표
| 기간 | 목표 |
|---|---|
| 첫 2시간 | 텐트 → 집(9,800), 도구 4종, 박물관 수족관동, 뗏목, 섬 2곳 |
| 1주(게임 하루 30분 × 하루 2~3번) | 섬 7곳 방문, 통통배·모터보트, 공룡 친구 3, 등대 4개 복구, 로켓 부품 6, **첫 발사 → 달** |
| 1달 | 섬 7곳 개발 ③단계, 도감 70%, 공룡 탈것 3, 우주 행성 3곳, 별자리 12, 집 2층 |
| 엔드 | 도감 100%(엔딩 불꽃놀이), ★5 전종, 반짝이 수집, 섬 별 5개 전부, 블랙홀, 내 소행성 꾸미기 |

### 진행 챕터 (수평선에 다음 것이 늘 보이게)
| 챕터 | 시간 | 목표 | 수평선의 다음 것 |
|---|---|---|---|
| 1 정착 | 0~2h | 집, 도구, 박물관, 곰 몽실 부탁 | 바다 너머 별똥별섬 발사탑 뼈대(북), 산호빛섬 등대(남) |
| 2 첫 항해 | 2~6h | 뗏목, 산호빛섬·버섯섬, 수영·잠수 | 공룡섬 하트 연기 화산 |
| 3 공룡과 눈 | 6~12h | 통통배, 공룡섬·솜눈섬, 화석관 | 모래시계섬 피라미드 |
| 4 사막 | 12~18h | 모터보트, 모래시계섬, 등대 4 | 펭박사 로켓 설계도 |
| 5 발사 | 18~25h | 로켓 부품 6 + 발사대 | 달 |
| 6 우주 | 25h+ | 달 → 행성 | 블랙홀 |

## 4.15 친구 방문 (방장 P2P, P1 — 설계만, 오늘 밤 구현 없음)
- **손님 보너스**: 둘 다 ★3+ +10%. 하트잉어·하트무당벌레 출현 ×2(둘이 같은 물가).
- **방문객 상자**: 방장 섬에 손님만 하루 1번 여는 풍선 상자.
- **협동 릴**: 같은 그림자에 둘이 던지면 텐션을 나눠 들고 ★5 ×2. 협동 보스(모사사우루스·산갈치·우주고래)는 둘 이상이어야.
- **무역**: 섬마다 인기 생물이 달라 친구 섬에서 팔면 이득. 물건 선물, 도감 교환(선물 받은 종은 "○○가 준 친구" 표시, 박물관 기증은 직접 잡아야).
- **놀이**: 배·자전거·달리미 레이스, 티노 스텔스 같이 하기, 낚시 대회 10분(총 cm), 곤충 씨름, 숨바꼭질, 사진 모드·이모트, 불꽃놀이.
- **자랑**: 박물관·집 수조 구경, 방명록, 친구의 ★5 획득 알림이 나에게도.
- **2인 탈것**: 2인 자전거(같이 밟으면 ×1.3), 통통배 2인석, 열기구, 로켓(첫 발사를 친구와 하면 칭호).

---

# 5. 보물상자·확률·천장, 도감·업적

## 5.1 희귀도
| ★ | 이름 | 색(반짝임) | 기본 가중치 | 판매가 대략 | 잡았다 연출 (ui) |
|---|---|---|---|---|---|
| 1 | 흔함 | 흰 | 55 | 40~130 | "퐁!" 작은 팝 + 별 3개, 이름 팝업 |
| 2 | 보통 | 초록 | 27 | 140~440 | 팝 + 초록 반짝 + 음표 |
| 3 | 희귀 | 파랑 | 12 | 500~1,500 | 0.5초 슬로모 + 파란 링 + 카메라 살짝 줌 + 색종이 |
| 4 | 매우 희귀 | 보라 | 5 | 1,800~5,500 | 화면 가장자리 보라 비네트 + 회전 쇼케이스 1초 + 무지개 링 + 근처 NPC 박수 |
| 5 | 전설 | 금 | 1 | 6,000~20,000+ | 하늘이 금빛으로 물듦 + 1초 정지 프레임 + 빛 기둥 + 코인 분수 + "전설!" 도장 + 플레이어 cheer |
| 변이 | 반짝이 | 무지개 | 1/256 | ×5 | 위 연출 + 무지개 테두리 + "반짝이!" 별도 도장 |
| 변이 | 왕관 | 금 | 크기 상위 1% | ×3 | "최대 크기 경신! 62cm → 71cm" + 금관 |

## 5.2 잡기 굴림 알고리즘 (fishing·insects·ocean 공통, `econ.rollCatch`)
```
입력: activity('fish'|'bug'|'dive'), island, zone, hour, tod, weather, bait, buffs[], combo, friendVisit, rng
1) 후보 = 등록된 종 중 where 가 (island, zone) 일치 && 시간 일치 && (weather.only 없거나 지금 날씨 ∈ only)
   (zone 'shore' 는 모든 섬 해안에서 후보, island 'any')
2) 희귀도 가중치 W = {1:55, 2:27, 3:12, 4:5, 5:1}
   bonus = 미끼(떡밥 ★2+ ×1.3 / 루어 ★3+ ×1.5 / 황금 ★5 ×3) × 버프(생선구이 ★3+ ×1.2, 친구 ×1.1)
         × 콤보(연속 성공 5회부터 1회당 ★3+ +2%, 최대 +20%)
   W[r] *= 해당 bonus (r 조건 맞는 것만)
3) 천장(5.3): pity.since3 ≥ 19 → r ≥ 3 강제 / since4 ≥ 79 → r ≥ 4 / since5 ≥ 300 → W[5] += (since5−300)×0.6 / since5 ≥ 399 → r = 5
4) 오늘 첫 잡기(activity별) → r ≥ 3 강제
5) r 을 W 로 고름 → 후보 중 rarity == r 이 없으면 r−1, r−2 … (끝까지 없으면 r+1 …)
6) 같은 r 안에서 종 가중치: 기본 1, weather.boost 일치 × x(기본 3), 오늘의 손님 ×5
7) 변이: 반짝이 1/256(황금 잠자리채·행운 쿠키 ×2), 크기 = 정규분포(len, len×0.15) → 왕관(z>2.33)/꼬마(z<−1.88)
8) pity 갱신: since3·since4·since5 를 r 에 따라 0 으로 또는 +1. 결과 반환 {species, size, shiny, crown, tiny, rarity}
```
- 난수는 `ctx.rng(\`roll:${activity}:${day}:${count}\`)` — 같은 저장에선 결정적.
- 쓰레기(낚시 8%)는 1) 전에 따로 굴린다.

## 5.3 천장 (두근 게이지, 화면에 보여 줌)
- 낚시·곤충·잠수·상자 **따로** 쌓는다(`flags.econ.pity[activity]`).
- ★3 이상 20회 안 확정, ★4 이상 80회 안 확정, ★5 는 300회부터 확률 상승·400회 확정.
- HUD 두근 게이지 = since5 / 400. **80% 를 넘으면 낚싯줄·잠자리채가 분홍으로 반짝**("곧 뭔가 온다").
- 매일 첫 낚시·첫 곤충은 ★3 이상 확정(접속 보상).
- 콤보: 연속 성공 카운터, 실패(`catch-fail`)하면 0. 5 이상이면 HUD 에 "콤보 7!" + ★3+ 보너스.

## 5.4 보물상자 (category 아님, 아이템 루트)
| 상자 | 여는 법 | 어디 | 내용 (확률) |
|---|---|---|---|
| **나무상자** | 무료 E | 섬마다 고정 20 + 매일 20, 쪼꼬미섬 | 코인 100~500 (55%) · 재료 2~5개(섬 특산 포함) (25%) · 미끼 3 (10%) · 레시피 카드 (5%) · 은열쇠 조각 (4%) · 캡슐 티켓 (1%) |
| **은상자** | 은열쇠 | 난파선, 숨은 곳, 높은 곳, 나무상자 대신 10% | 코인 1,000~3,000 (45%) · 희귀 재료(철·진주·특산 5) (30%) · 가구(P1, 지금은 코인 ×2) (15%) · 레시피 (7%) · 금열쇠 조각 (2%) · 캡슐 티켓 2 (1%) |
| **금상자** | 금열쇠 | 티노 언덕 꼭대기, 숨은 곳 ①, 보물지도 X | 반짝별 50 (30%) · 코인 5,000~15,000 (30%) · 금광석 3 + 진주 2 (20%) · 탈것 스킨(P1, 지금은 반짝별 30) (12%) · 황금 미끼 3 (7%) · 무지개 조각 (1%) |
| **무지개상자** | 무지개열쇠 | 무지개 날씨에만 나타나는 상자 | 전설 가구·의상·탈것 스킨(P1) / 지금은 코인 30,000 + 반짝별 100 |
| **우주상자** | 무료(달에서만) | 달 표면 15개 | 월석 2~4 (40%) · 별가루 3~8 (30%) · 코인 3,000~8,000 (20%) · 우주 가구 레시피 (8%) · 헬멧 스킨 (2%) |
| **방문객 상자** | 손님만 1일 1회 | 방장 섬 광장 | P1 |
| **미믹 상자게** | 나무·은상자 열 때 3%(쪼꼬미섬 15%) | — | 상자가 다리 내밀고 도망 → 잡으면(E, 2.5m) d_mimic_crab 등록 + 상자 **2개** 보상 |
- **흔들림 힌트**: 열기 전 상자가 흔들리는 횟수 = 1번 나무 / 2번 은 / 3번 + 빛 기둥 = 금 이상. 미믹은 흔들다 눈을 뜬다.
- **풍선 선물**: 하늘에 떠다니는 선물 상자(새총으로 맞추기). 떨어지면 나무상자 표 + 풍선 조각 1. 섬마다 게임 1시간에 1개 생성.
- **병편지**: 열면 보물지도(60%, 쪼꼬미섬 하나에 X → 그 자리에 금상자), 레시피(25%), 주민 사연 편지(15%, 반짝별 3). 별똥별섬 앞바다 병편지는 5%로 "우주에서 온 편지"(복선).
- 상자 천장: 나무상자 50개마다 은상자 1개 확정.

## 5.5 도감 구조 (ui·economy)
| 탭 | 칸 수 | 등록 조건 |
|---|---|---|
| 물고기 | 135 | 낚시로 잡기 |
| 바다 | 27 | 잠수 줍기 / 목격(쓰다듬기·사진) |
| 곤충 | 71 | 잠자리채 |
| 공룡 | 25 | 첫 먹이 / 인사(목격) |
| 화석 | 20 골격 (60 조각) | 조각 3개 모으면 골격 칸 |
| 우주 | 18 | 잡기·목격 |
| 탈것 | 18 | 해금 |
| **합계** | **314칸** | |
- 칸 상태: 실루엣(?) → 컬러(잡음) → 은별(10회) → 금별(왕관 개체). 반짝이는 칸 오른쪽 위 작은 무지개 별.
- 섬별 % 바(그 섬 where 를 가진 종 기준), 100% 면 섬 왕관 아이콘.
- 한 줄 설명은 표의 "한 줄".

## 5.6 박물관 (기증)
- 동: 수족관동(물고기) · 해저관(바다) · 곤충관 · 화석관(골격) · 천문관(우주). 공룡은 기증하지 않는다(친구).
- 첫 기증마다 반짝별(4.1.1) + 느릿 관장 해설 + 전시물이 생긴다(P1 내부).
- 동별 10/25/50/75/100% 마일스톤: 반짝별 10/25/50/80/150 + 동 전용 가구.
- 별자리 물고기 12종 기증 = **항법 칩**.

## 5.7 업적 (P1 창, 데이터는 P0 로 economy 가 등록해 두면 좋다) — 약 60개
| id | 이름 | 조건 | 반짝별 |
|---|---|---|---|
| ach_first_fish | 첫 손맛 | 물고기 1마리 | 5 |
| ach_first_bug | 첫 날갯짓 | 곤충 1마리 | 5 |
| ach_fish_10 / 100 / 1000 | 낚시꾼 견습 / 낚시꾼 / 낚시 장인 | 물고기 10/100/1000 | 5/20/50 |
| ach_bug_10 / 100 / 1000 | 채집가 견습 / 채집가 / 채집 장인 | 곤충 10/100/1000 | 5/20/50 |
| ach_dex_10 / 25 / 50 / 75 / 100 | 도감 10% … 100% | 도감 % | 10/20/40/60/200 |
| ach_rare_first | 파란 빛 | 첫 ★3 | 5 |
| ach_epic_first | 보랏빛 두근 | 첫 ★4 | 10 |
| ach_legend_first | 전설의 시작 | 첫 ★5 | 20 |
| ach_legend_all | 전설 수집가 | ★5 전종 | 100 |
| ach_shiny_first | 반짝! | 첫 반짝이 | 20 |
| ach_shiny_5 | 반짝이 헌터 | 반짝이 5 | 50 |
| ach_crown_first | 왕관을 쓴 자 | 첫 왕관 개체 | 10 |
| ach_combo_10 | 손이 안 멈춰 | 콤보 10 | 10 |
| ach_combo_25 | 물때 장인 | 콤보 25 | 30 |
| ach_rain_night | 비 오는 밤의 낚시꾼 | 비 오는 밤 물고기 10 | 10 |
| ach_meteor_wish | 별에게 소원을 | 유성우 밤 별가루 10 | 10 |
| ach_fog_ghost | 안개 속 친구 | 유령잉어 or 유령해파리 | 15 |
| ach_aurora | 오로라 아래서 | 오로라 생물 1 | 20 |
| ach_rainbow | 무지개 너머 | 무지개 생물 1 | 15 |
| ach_taiyaki | 꽥사장 군침 | 붕어빵붕어 | 10 |
| ach_grandpa | 100년 이야기 | 왕메기할배 | 20 |
| ach_zodiac | 별자리 완성 | 별자리 12 | 50 |
| ach_guppy7 | 일곱 빛깔 | 무지개구피 7색 | 20 |
| ach_island_all | 군도 여행자 | 섬 7곳 방문 | 20 |
| ach_islet_all | 무인도 수집가 | 쪼꼬미섬 8곳 | 20 |
| ach_landmark_10 | 보이는 곳은 다 간다 | 랜드마크 10곳 | 15 |
| ach_swim_far | 먼바다 수영 | 해안 200m 까지 수영 | 5 |
| ach_dive_10 | 잠수부 | 잠수 생물 10 | 10 |
| ach_wreck | 꿀꺽호의 비밀 | 난파선 상자 | 10 |
| ach_raft | 첫 항해 | 뗏목으로 다른 섬 | 10 |
| ach_tugboat | 통통통 | 통통배 구입 | 10 |
| ach_speed | 물보라 질주 | 모터보트 최고 속도 | 10 |
| ach_current | 해류 타기 | 해류 띠 1km | 5 |
| ach_tino_sneak | 티노를 안 깨웠다 | 낮잠 언덕 금상자 열기 | 20 |
| ach_tino_wake | 미안해 티노 | 티노를 깨움 | 5 |
| ach_dino_friend | 공룡 친구 | 공룡 하트 5 | 15 |
| ach_dino_ride | 공룡 라이더 | 공룡 탑승 | 20 |
| ach_fossil_5 | 꼬마 고생물학자 | 골격 5 | 15 |
| ach_fossil_all | 공룡관 완성 | 골격 20 | 80 |
| ach_chest_10 / 100 | 보물 사냥꾼 / 보물왕 | 상자 10/100 | 5/30 |
| ach_mimic | 속았다! | 미믹 상자게 잡기 | 10 |
| ach_gold_chest | 금빛 뚜껑 | 금상자 열기 | 10 |
| ach_balloon_10 | 새총 명사수 | 풍선 선물 10 | 10 |
| ach_bottle_map | 보물지도의 끝 | 병편지 보물지도 X 찾기 | 15 |
| ach_stung | 퉁퉁 | 벌에 쏘이기 | 5 |
| ach_sell_100k | 큰손 | 하루 100,000코인 판매 | 15 |
| ach_million | 도파 백만장자 | 누적 1,000,000 | 50 |
| ach_donate_50 | 박물관의 친구 | 기증 50 | 20 |
| ach_craft_10 | 뚝딱뚝딱 | 제작 10 | 10 |
| ach_lighthouse_4 | 불을 켜는 사람 | 등대 4 | 20 |
| ach_rocket_part | 부품 하나 | 로켓 부품 1 | 10 |
| ach_launch | 3, 2, 1, 발사! | 첫 발사 | 50 |
| ach_moon_jump | 달에서 높이뛰기 | 달에서 점프 10m | 15 |
| ach_moon_fish | 달 낚시꾼 | 달 물고기 3 | 15 |
| ach_starsaurus | 공룡의 후손 | 별공룡 인사 | 30 |
| ach_space_5 | 우주 첫걸음 | 우주 생물 5 | 20 |

---

# 6. 우주 콘텐츠

## 6.1 로켓 "도파민 1호" (부품 6개 — 모든 섬을 돌아야 완성)
| 부품 | 레시피 | 재료가 나는 섬 | 발사탑 단계 외형(village) |
|---|---|---|---|
| ① 동체 | 철광석 40 + 단단한 나무 20 | home·dino(광석) | 비계 1단 + 흰 동체 아래쪽 |
| ② 엔진 | 화산유리 15 + 금광석 10 | dino | 바닥 노즐 3개 |
| ③ 조종석 창 | 얼음결정 10 + 모래유리 10 | ice·desert | 꼭대기 둥근 창 |
| ④ 날개 | 깃털 20 + 꿀 10 | dino 둥지·home 꽃잎 언덕 | 지느러미 3장(빨강) |
| ⑤ 반짝 연료 | 별가루 50 + 별사과 10 | launch(유성우) | 옆 연료 탱크가 반짝 |
| ⑥ 항법 칩 | 별자리 물고기 12종 기증 | launch 크레이터 낚시 | 안테나 + 깜빡이 |
발사대 건설 300,000 코인(최대 코인 소비처). **P0 테스트: 레시피 재료 1/5, 항법 칩은 별자리 3종 기증, 발사대 30,000.**

## 6.2 발사 연출 (vehicles P0)
| 시각 | 연출 |
|---|---|
| 0.0s | 발사탑 앞 E "발사!" → 플레이어가 로켓에 쏙 들어감(창으로 얼굴 보임) |
| 0.5s | 펭박사 + 근처 NPC 가 손 흔듦, 카메라가 로켓 아래에서 올려다봄 |
| 1.0~4.0s | 카운트다운 "3, 2, 1" (큰 글자, ui 토스트 아님 — 화면 가운데 통통 튀는 숫자) + 로켓 진동 + 연기 뭉게뭉게(둥근 구 파티클) |
| 4.0~7.0s | 발사! 화면 흔들림, 불꽃(주황·노랑 구 꼬리), 카메라가 따라 올라감 → 섬 → 군도 전체가 보이는 높이(곡률 크게) |
| 7.0~9.0s | 하늘이 남색 → 별, 둥근 행성(지구) 실루엣 |
| 9.0s | 흰 페이드 → `game.setWorld('space', 달 착륙장)` + `launch` 이벤트 |
| P1 | 20초 별가루 모으기 비행 미니게임(로딩 겸) |

## 6.3 토끼달 (space P0) — `SPACE_ORIGIN (0, 0, 30000)` 기준 상대 좌표
- 크기: 반경 400m 원판 지형(청크). 휘는 땅 곡률을 세게 줘서 **작은 행성처럼** 보이게. 하늘에 **지구가 크게** 떠 있음(우리 군도가 보이는 파란 구).
- 중력: 코어가 −4.5(지구 −22의 약 1/5). 점프가 높고 천천히 떨어짐. **Space 길게 누르면 둥실 3초**(활공과 같은 입력).
- 표면: 크림·회색 고운 흙, 둥근 크레이터(테두리가 도톰한 도넛) 30개, 반짝이는 결정 덤불, 달꽃(흰 발광).
| 구역 | 상대 위치 | 내용 |
|---|---|---|
| 착륙장 | (0, 0) | 로켓 착륙 패드, 귀환 E, 펭박사 깃발 |
| 떡방아 토끼 마을 | (80, −60) | 둥근 떡집 3채(찹쌀떡 모양 지붕), 떡순이 가게(P1 상점), 떡방아토끼 5마리가 방아 찧음 |
| 크레이터 연못 3 | (−120, 40), (60, 150), (−40, −180) | 우유빛 물, 낚시 zone `moonpond` (떡붕어·혜성피라미·월광파리·떡방아물고기·크레이터거북) |
| 월석 들판 | (200, 50) 일대 | 월석거북, 월석 돌(두드리기 → m_moonrock) |
| 지구 전망 언덕 | (−200, −100) | 가장 높은 언덕, 지구가 정면. 사진 명소 |
| 별공룡 둥지 | (150, −220) | 헬멧 쓴 스타사우루스 3마리(목격), 알 둥지(P1) |
| UFO 잔해 | (−250, 200) | 삐리 외계인 꼬마(목격), 우주상자 |
| 우주상자 | 곳곳 15개 | 5.4 표 |
- **산소**: 산소 캡슐 1개 = 게임 4시간(5분). 없으면 첫 방문은 펭박사가 3개 줌. 0 이 되면 자동 귀환(벌칙 없음, "숨차!").
- **P0 우주 생물 출현**: 반짝가루나방, 쿵떡이 떡방아토끼, 달빛벌레, 구멍쏙 두더지, 둥실이 달빛해파리, 돌등이 월석거북, 별공룡(목격), 삐리(목격) + 달 물고기 5종.
- **귀환**: 착륙장 E "지구로!" → 짧은 하강 연출 → `setWorld('earth', 별똥별섬 발사대 앞)` + `arrive {to:'earth'}`.
- 월석·별가루는 지구 상점에서 우주 보정 ×1.8 로 비싸게 팔린다(돌아올 이유).

## 6.4 행성 목록 (P1)
| 행성 | 특징 | 중력 | 낚시·생물 | 공룡 |
|---|---|---|---|---|
| **토끼달** (P0) | 크레이터, 떡방아 마을 | 0.2 | 6.3 | 별공룡, 달브라키오 |
| **슈가링** | 분홍 사탕 고리 행성, 고리 위를 서핑보드로 | 0.5 | 고리 얼음 낚시, 솜사탕양, 고리뱀 | 고리 익룡 |
| **젤리별** | 말랑 젤리 바다, 바닥이 트램펄린 | 0.7 | 젤리연어, 고리가오리, 젤리곰 6색 | 젤리 수장룡 |
| **서리볼** | 얼음별, 마찰 0.05 다 미끄러짐 | 0.4 | 결정물고기, 수정가시 고슴도치, 서리펭귄 | — |
| **솜사탕 성운** | 땅 없는 구름 군도, 구름 위 낚시 | 0 (둥둥) | 갤럭시꼬리금붕어, 별사탕복어, 구름고래아기, **하늘고래**, 풍선문어 | — |
| **자갈띠** | 소행성대, 소행성 사이 점프·채굴 | 0.05 | UFO해파리, 혜성여우, 운석달팽이 | — |
| **별다방** | 우주정거장 허브, 꾸물이 상점, 친구 모임 | 1 | UFO 소 | — |
| **까만 도넛** | 블랙홀(끝판), 일식 때만 | 가변 | **블랙홀개복치**, 꼬마별 | — |
- 우주 도감은 박물관 천문관에 기증. 도감 100% → 엔딩 불꽃놀이. 엔드게임 "내 소행성" 하우징.

---

# 7. 아트 규칙 — 엄청 귀엽게

> 기준은 룩 시트다. 둥근 나무, 빨간 지붕 집, 2.5등신 아이, 곰 주민, 빛나는 상자. **각진 로우폴리·무서운 얼굴·마네킹·회색 단색 덩어리는 실패다.**

## 7.1 공통 형태 언어
1. **둥근 실루엣**: 모든 덩어리는 구·캡슐·튜브·회전체(Lathe). 모서리 반경 ≥ 덩어리 크기의 20%. Box 를 쓰면 둥근 상자(RoundedBox) 또는 세그먼트를 쪼개고 법선 부드럽게.
2. **충분히 쪼갠 지오메트리**: 구 최소 24×16, 캡슐 16 radial, 튜브 12 radial. 각이 보이면 실패. `computeVertexNormals` + smooth.
3. **아기 비율**: 머리(앞쪽) 크고 몸 짧고 통통. 2~2.5등신. 큰 생물(고래·브라키오·티노)도 머리를 크게.
4. **짧은 팔다리**: 짧은 캡슐, 끝이 둥근 공. 발가락·손가락 없음(공룡 발은 둥근 발톱 3개 정도까지만, 흰색).
5. **스쿼시 대기 동작**: 모든 생물 scale 1.00↔1.05 (2초 주기, 위상은 개체마다 다르게) + 지느러미·날개·꼬리 살랑.

## 7.2 얼굴 (모든 생물·NPC·로켓까지 하나로 통일)
- **눈**: 흰자 없이 **먹색(#3d3a4a) 세로 타원**(가로:세로 = 0.75:1) + **흰 하이라이트 2개**(큰 것 지름 = 눈의 35%, 위 바깥쪽 / 작은 것 15%, 아래 안쪽). 눈 지름 = 머리 높이의 28~35%. 두 눈 간격 = 눈 지름 × 1.4. 몸 앞쪽 25% 지점.
  - 캔버스 텍스처 1장(공용)을 데칼 평면(살짝 휘게) 또는 구 표면 위 작은 원판으로. `eye` 배율로 크기만 바꾼다.
- **볼터치**: 눈 아래 바깥쪽 **분홍(#ff9fb8) 반투명(0.55) 원판 2개**, 지름 = 눈의 80%. **무서운 종(아귀·상어·티라노·둔클레오·메갈로돈·고블린상어)일수록 필수.**
- **입**: 작은 "ω" 또는 "◡" 곡선(먹색 선, 두께 얇게). 이빨은 넣어도 흰 둥근 삼각 1~2개만. 상어·메갈로돈은 이빨 대신 웃는 입.
- **잡혔을 때 표정**: 눈을 ">  <" 텍스처로 바꾸고 볼을 더 진하게(0.8) — 들어 올리는 0.8초 동안.
- **곤충**: 같은 얼굴을 작게(머리 구 앞에). 겹눈 금지. 더듬이는 끝이 동그란 공.

## 7.3 재질·빛
- `MeshStandardMaterial`, roughness 0.45~0.7(말랑 플라스틱/장난감), metalness 0(금·은·chrome 무늬만 0.5~0.7).
- 그라디언트·무늬는 **캔버스 텍스처 256~512px**(줄·점·하트·별·은하·붕대). 몸형별 UV 를 단순하게(회전체는 v 방향 = 몸 길이).
- 발광(glow): emissive 를 색 그대로 + 밤에 강도 ↑(bloom 임계값 1.6 을 넘게 1.8~2.5).
- 반투명(clear): opacity 0.45~0.6, depthWrite false, 하늘 tint.
- 그림자: 큰 것만 castShadow. 생물은 발밑에 **둥근 블롭 그림자**(검은 반투명 원판)로 땅에 붙어 보이게.

## 7.4 팔레트
- 기본은 `src/core/palette.ts`(잔디 #86d16f, 모래 #f4e2b0, 물 #7fe0d6/#3aa3cf, 나무 #c98f55, 금 #ffcf4a, 분홍 #ff9fb8, 크림 #fff6e3, 하늘 #8fd3f4) + 0.5 색 이름표.
- **파스텔이지만 맑은 색**: 채도 50~80%, 명도 65~90%. 진흙 같은 탁한 색·순수 회색·순수 검정 금지(먹색 #3d3a4a 가 가장 어두운 색).
- 섬별 대표색: home 연두·분홍 / dino 초록·주황·하트 분홍 연기 / ice 흰·하늘·라벤더 / mushroom 보라·청록·형광연두 발광 / coral 청록·산호·노랑 / desert 살구·모래·청록 포인트 / launch 남색·금·흰 / 달 크림·은·분홍(토끼).
- 희귀도 색은 5.1 표. UI 강조색은 따뜻한 갈색 글자(#4a3b2a) + 크림 패널(#fff8e8).

## 7.5 담당별 귀여움 체크리스트 (스크린샷 보고 하나라도 X 면 고친다)
| 담당 | 체크 |
|---|---|
| fishing·ocean | □ 눈 크고 하이라이트 2개 □ 볼터치 □ 지느러미 끝 둥글게 □ 꼬리 살랑 □ 무서운 종도 웃는 입 □ 크기가 너무 작아 안 보이지 않음(최소 0.18m) □ 그림자 타원이 물 위에서 보임 |
| insects | □ 머리 크고 얼굴 있음 □ 날개 파닥(BUTTERFLY 0.25초 주기) □ 다리 짧고 6개 이하로 보이게(거미 8개는 짧고 통통) □ 더듬이 끝 공 □ 날개 무늬가 캔버스로 또렷 |
| dinos | □ 머리 몸의 40% 이상 □ 볼터치 □ 발 둥근 공 □ 티라노 팔 아주 짧게 □ 걸을 때 몸이 통통 위아래 □ 뿔·등판 끝 둥글게 |
| characters | □ 룩 시트의 아이 비율 그대로 □ NPC 도 2~2.5등신 □ 걸을 때 머리 살짝 흔들 □ 대화 시 통통 튀는 리액션 |
| flora | □ 나무는 구 덩어리 뭉게 □ 과일 반짝 하이라이트 □ 꽃 머리 크고 줄기 짧게 □ 흔들면 squash |
| village | □ 지붕 두툼하고 둥근 처마 □ 창 둥글게 □ 문 아치 □ 간판에 동물 실루엣 □ 철골(발사탑)도 둥근 볼트·파스텔 |
| vehicles | □ 장난감 같은 비율(바퀴 크게) □ 둥근 창 □ 로켓에도 얼굴(창 = 눈, 볼터치 스티커) □ 배 굴뚝 연기 동그란 구 |
| space | □ 크레이터 테두리 도톰 □ 지구가 하늘에 크게 □ 별공룡 헬멧 투명 구 □ 토끼 귀 길고 둥글게 |
| atmosphere | □ 구름 몽실몽실 □ 비·눈 파티클도 둥근 방울 □ 폭풍도 무섭지 않은 파스텔 보라 □ 하트 연기 |
| ui | □ Jua 폰트 □ 둥근 패널(반경 14~18px) □ 크림 바탕 + 갈색 글자 □ 숫자 카운트업 통통 □ 도장 "쾅" 회전 + 스케일 펀치 |

---

# 8. 오늘 밤 통합 순서와 완료 기준

## 8.1 시간표 (1시간 30분)
| 시간 | 할 일 |
|---|---|
| 0:00~0:20 | 각자 data.ts(이 문서 표 그대로) + 모델 생성기 뼈대. economy 는 `game.econ` 빈 껍데기 먼저, atmosphere 는 `game.env` 먼저, world 는 `game.geo.zoneAt` 먼저 |
| 0:20~1:00 | 시스템 동작(낚시 루프, 곤충 AI, 수영·잠수, 탈것, 상점 창, 달). 15분마다 shot 으로 눈 확인 |
| 1:00~1:20 | 4.9 의 P0 10단계 연결 확인, 아트 체크리스트, 성능(`--bench`: 60fps, draw call < 900, 삼각형 < 4M) |
| 1:20~1:30 | 결과 보고: 만든 파일, 스크린샷 경로, 남은 P1, 다른 담당에게 필요한 것 |

## 8.2 완료 기준 (담당별 한 줄)
| 담당 | 완료 = |
|---|---|
| economy | `game.econ` 전 함수 동작, 재료 30 등록, 상점·제작·기증·해금·상자·rollCatch 가 4.9 1~10 에서 막힘 없음 |
| world | 7개 섬이 테마별로 달라 보이고 `zoneAt` 이 3.5·3.6 의 zone 코드를 돌려줌, 랜드마크 원거리 실루엣 |
| ocean | 수영 체력·잠수 산소·거품 채집 15종+, 배 부력 `waveAt`, 꿀꺽호 1척 |
| flora | 섬별 식생 7종류, 흔들기·베기·두드리기 결과 재료 |
| fishing | 135종 등록, 그림자 → 톡톡꾹 → 잡았다, 몸형 14 |
| insects | 71종 등록, 행동 7종, 잠자리채 |
| dinos | 25종 등록, 초식 무리 배회, 티노 스텔스, 먹이 주기 |
| vehicles | 자전거·뗏목·통통배·모터보트 탑승, 로켓 발사 연출 → 달 |
| space | 토끼달 표면·연못·마을·생물 8종, 귀환 |
| characters | 플레이어 동작 16종, NPC 4명 + 대사 |
| ui | HUD·잡았다 5단계·도감·가방·상점/박물관/제작 창·상자 연출·발견 카드 |
| village | 꽥꽥상회·박물관·작업대·조선소·다리·등대 7·발사탑 뼈대 |
| atmosphere | 30분 하루, 날씨 5종, 섬별 분위기, 하트 연기 |

## 8.3 충돌 방지 요약
- 섬 좌표·반경은 `world.ts` 그대로. 표시 이름만 이 문서(2.2).
- 종 id 는 이 문서 표의 id 를 그대로(도감·상점·부탁이 id 로 찾는다). 새 종을 추가하면 접두사 규칙(`f_ d_ b_ z_ s_ v_ m_ t_ r_ fos_ ach_`)을 지키고 결과에 적는다.
- 다른 담당 파일 import 금지 → 이벤트(0.6)와 `game.env / game.econ / game.geo / game.ocean` 런타임 객체로만.
- 시간·날씨는 atmosphere 의 `game.env` 하나만 믿는다(각자 시계 만들지 않는다).
- 돈·별·열쇠·해금은 economy 만 바꾼다(다른 담당은 `game.econ.*` 호출 또는 코어 `addCoins`(상자 코인 등)만).
- git commit 하지 않는다(CONTRACT).
