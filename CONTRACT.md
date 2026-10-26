# 도파민랜드 — 작업 계약 (게임 v1)

## 목표
「모여봐요 동물의 숲」의 귀여움 × 「젤다의 전설 야숨/왕눈」의 "내가 세상을 탐험하는" 느낌 × 모든 게 확률형인 도파민 루프.
PC 웹(Three.js r186 + TypeScript + WebGL2 + Rapier 물리). 기획 명세는 `docs/GDD.md`(있으면 반드시 읽기).
**아트 최우선: 엄청엄청 귀엽게.** 둥글고 통통한 실루엣, 큰 눈·볼터치, 짧은 팔다리, 충분히 쪼갠 지오메트리 + 부드러운 법선, 파스텔이지만 맑은 색.
각진 로우폴리·무서운 얼굴·마네킹·회색 단색 덩어리는 실패다.

## 세계
- 8km × 8km 바다(`island.WORLD_BOUNDS`) 위 테마 섬들(`island.ISLANDS`: home·dino·ice·mushroom·coral·desert·launch + 보물 작은 섬 islet-a~h). 섬 반경 450~650 m.
- 시작 마을(룩 테스트 장면)은 원점 근처, 시작 섬(home) 남쪽 해안 반도. 마을 범위 `island.ISLAND_BOUNDS` 는 마을 전용 지형(terrain.ts·water.ts)이 그린다.
- 높이·표면: `island.heightAt(x,z)`, `island.surfaceAt(x,z)` → `{h, kind, island, coastDist, …}`(kind: sea·sand·grass·cliff·river·rock·snow·jungle·desert·lava), `island.waterLevelAt(x,z)`(물 없으면 -Infinity), `island.worldSample`, `island.islandAt`, `island.islandById`, `island.islandSpawnPoints(id, n)`.
- 우주: `SPACE_ORIGIN = (0, 0, 30000)` 근처, `game.spaceRoot` 아래에. `game.setWorld('space'|'earth', spawn?)` 로 오간다(중력 -4.5 / -22).

## 넓은 세계 = 청크 스트리밍 (필수)
플레이어 주변만 만든다. 섬 전체를 한 번에 만들지 마라.
```ts
ctx.game.chunks.add({ key: 'flora-trees', size: 128, radius: 420, build: ({ cx, cz, x0, z0, size }) => group | null, world: 'earth' })
```
- 같은 청크는 언제 다시 만들어도 같아야 한다 → `ctx.rng(\`키:${cx},${cz}\`)`.
- 작은 것(꽃·풀·곤충)은 radius 80~150, 나무·바위 300~600, 랜드마크는 먼 거리 LOD 따로.
- 청크 안 같은 종류는 `InstancedMesh` 하나로. 지오메트리·재질은 모듈 전역에서 공유(공유 지오메트리는 `geometry.userData.shared = true` → 청크 버릴 때 dispose 안 함).
- 성능 목표(RTX 5060 Ti, 1600×900): 60fps, draw call < 900, 삼각형 < 4M. `--bench` 로 확인.

## 게임 API (`ctx.game`, 룩 테스트 모드면 null)
- `game.player`: `pos`, `yaw`, `mode`('ground'|'air'|'glide'|'swim'|'dive'|'mounted'), `action`(모듈이 넣는 동작 이름 — 'fish'·'net'·'dig'·'shake'·'pet' 등, 아바타가 포즈를 잡는다), `teleport(x,z,y?)`, `mount(m)`, `dismount()`, `facing()`, `locked`(미니게임 중 이동 잠금), `setAvatar({root, animate, holdSlot})`.
- 조작: WASD/화살표 이동, Shift 달리기, Space 점프(공중에서 누르고 있으면 패러글라이더 활공), C 잠수 토글(수영 중), E 상호작용/내리기, 마우스 드래그 시점, 휠 줌, V 카메라(모험 ↔ 아늑). Q/R 시점 회전.
- 상호작용: `game.addInteractable({ id, position: () => Vector3, radius, label, onUse })` 또는
  `game.addProvider(id, (player, game) => ({ label, dist, use, key? }) | null)`(물가에서 '낚시하기'처럼 상황형). 가장 가까운 것 하나가 화면에 "E …" 로 뜬다.
- 물리: `game.physics.add({ shape, type, position, mesh, buoyancy, restitution, … })` → 메시가 물체를 따라간다(공·상자·과일·통나무 — 플레이어가 밀면 굴러간다). 정적 충돌: `game.physics.addStatic(shape, pos)`(나무 줄기·바위·건물 벽 — 청크와 함께 만들고 dispose 에서 `remove()`). `RAPIER` 도 export.
- 탈것: `Mountable { name, drive(input, dt, game), seat, object, camDistance?, onExit? }` → `game.player.mount(m)`. drive 안에서 입력(`input.axis()`, `input.down('Space')` …)으로 직접 움직인다(물리 몸체든 직접 이동이든).
- 수집: `game.state.register(species[])`(도감 칸 등록 — 모듈 시작 시 전부), `game.ui.showCatch({ species, sizeText, model, line })`(도감 기록 + 머리 위로 들어 올리기 + 배너), `game.state.addCoins(n)`, `addItem(id,n)`, `has(id)`, `state.on(e => …)`(collect·coins·bag 이벤트), `game.ui.toast(text)`.
- `game.onUpdate((t, dt) => …)`, `game.onWorld(w => …)`, `game.time`, `game.input`, `game.cam`(yaw·pitch·dist·style).
- 촬영 모드에선 `dt = 0`(고정 시간). 움직임을 보려면 `live=1`.

## 공통 규칙
1. **곡률**: 엔진이 모든 메시 재질에 휘는 땅 패치를 건다(청크도 자동). 직접 ShaderMaterial 은 `#include <project_vertex>`·`<worldpos_vertex>` 포함 또는 `curveVertexSource()`. 모험 카메라에선 곡률이 거의 0, 아늑 카메라에선 동숲처럼 휜다.
2. **그림자**: 큰 물체 castShadow, 작은 풀꽃은 끄기(성능). 땅에 정확히 앉히기(`heightAt`).
3. **결정성**: `Math.random()` 금지 → `ctx.rng(key)`. 애니메이션은 `t` 로.
4. **외부 다운로드 금지**: 모델·텍스처는 코드로(지오메트리 + 캔버스 그림). 폰트는 index.html 의 Google Fonts 'Jua' 만.
5. **파일 소유**: 자기 모듈 파일(`src/modules/<이름>.ts` + `src/modules/<이름>/**`)만. 코어(`src/core/*`)는 고치지 말고 필요한 게 있으면 결과에 적어라(아주 작은 추가 export 는 허용, 기존 동작을 바꾸지 말 것). `npx tsc --noEmit` 오류는 자기 파일 것만.
6. 데이터(종 목록 등)는 `src/modules/<이름>/data.ts` 에 — 도감·상점이 읽는다.

## 확인 (반드시 눈으로)
- `node scripts/ensure-dev.mjs` → 서버 보장. 새 vite 를 띄우지 마라.
- 게임 화면: `node scripts/shot.mjs --q "spawn=dino&tod=day" --out shots/<담당>/x.png` → Read 로 본다.
  `spawn=x,z` 또는 섬 id, `style=cozy`, `world=space`, `live=1`(시간 흐름), `--eval "<페이지 JS>"`(예: `__game.player.teleport(1750,-900)`, `__game.cam.yaw=1.2`, `__game.setWorld('space')`), `--after 1500`.
- 고정 카메라(마을): `cam=ac|close|river|beach|low|wide`. 룩 테스트 모드: `game=0`.
- 성능: `--bench`. 오류는 shot 이 ERRORS 로 출력.
- git commit 하지 마라(다른 담당이 동시에 작업 중).
