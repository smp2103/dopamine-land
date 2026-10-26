# 도파민랜드 룩 테스트 — 작업 계약

## 목표
"Three.js(WebGL2)로 **동물의 숲(New Horizons)급의 매끈매끈하고 귀여운 3D 그래픽**이 나오는가"를 눈으로 판정할 작은 장면을 만든다.
게임 로직이 아니라 **화면 퀄리티**가 전부다. 기준은 동숲 NH 의 플레이 화면:
- 형태: 모든 것이 둥글고 통통하다. 각진 로우폴리(면이 보이는 보석 느낌) 금지. 충분히 쪼갠 지오메트리 + 부드러운 법선.
- 재질: 파스텔·고채도지만 눈이 편한 색, 거친(roughness 높은) 표면, 은은한 그라디언트. 털·천은 보송하게(sheen).
- 조명: 부드러운 해 + 하늘색 환경광, 부드러운 그림자, 구석에 고이는 은은한 그늘(AO), 약한 림.
- 카메라: 위에서 비스듬히, 틸트시프트(미니어처) 흐림, 굴러가는 통나무처럼 휘는 땅.
- 생기: 바람에 흔들리는 풀·나무, 숨 쉬는 캐릭터, 반짝이는 물, 나비.

## 구조
- `npm run dev` → http://127.0.0.1:5180 (이미 떠 있음. 직접 띄우지 말 것)
- `src/core/` 공통 뼈대: `engine.ts`(렌더러·조명·후처리·모듈 로더), `island.ts`(높이장·HERO 위치), `curve.ts`(휘는 땅), `presets.ts`(시간대·카메라), `palette.ts`, `rng.ts`, `types.ts`
- `src/modules/*.ts` 각 모듈 = 기본 내보내기 `build(ctx)` 가 `THREE.Object3D` 를 돌려준다. `export const order = n`(작을수록 먼저, terrain 0, water 1, 기본 10).
  밑줄로 시작하는 파일은 로드 안 됨. 보조 파일은 `src/modules/<모듈>/` 하위 폴더에(자동 로드 안 됨).
- `ctx`: `island`(surfaceAt·heightAt·riverWaterY·isBuildable·HERO·RIVER_PATH…), `palette`, `rng(key)`, `onUpdate(fn(t, dt))`, `onTod(fn(name, preset))`, `scatter({key,count,minDist,accept,…})`(다른 모듈이 차지한 자리 피함), `scene`, `camera`, `renderer`, `tod`.

## 규칙
1. **곡률**: 엔진이 로드 후 모든 메시 재질에 휘는 땅 패치를 자동으로 건다(`applyCurve`). 직접 `ShaderMaterial` 을 쓰면 정점 셰이더에
   `#include <project_vertex>` 와 (그림자 받으면) `#include <worldpos_vertex>` 를 반드시 포함하거나 `curveVertexSource()` 를 써라. 아니면 땅과 어긋난다.
   곡률을 빼야 하는 물체는 `userData.noCurve = true`.
2. **그림자**: 땅 위 물체는 `castShadow = true`, 받는 면은 `receiveShadow = true`. 알파 테스트 잎 카드도 엔진이 깊이 재질에 맵을 넘겨준다.
3. **성능**: 많은 것은 `InstancedMesh`. 장면 전체 목표 draw call < 400, 삼각형 < 2.5M. 프레임마다 지오메트리 재생성 금지(셰이더·행렬로 흔들기).
4. **결정성**: `Math.random()` 금지 → `ctx.rng('키')`. 시간 애니메이션은 `onUpdate` 의 `t` 로(촬영 모드에선 t 가 고정된다).
5. **외부 다운로드 금지**: 에셋은 코드로 만든다(지오메트리·캔버스 텍스처). 이번 테스트는 "코드+엔진으로 동숲 결이 나오나"다.
6. **파일 소유**: 자기 모듈 파일(+ 자기 하위 폴더)만 고친다. 코어 파일은 명시적으로 허락된 담당만 고친다.
   `npx tsc --noEmit` 오류는 **자기 파일 것만** 고친다(다른 담당이 동시에 작업 중이다).
7. HERO 위치(`island.ts` 의 HERO)는 바꾸지 않는다 — 카메라 'ac'·'close' 가 거기를 본다. 플레이어 주변 반경 2.8 m 은 지정 소품만.

## 확인 방법 (반드시 눈으로)
- 한 장: `node scripts/shot.mjs --q "solo=terrain,water,flora&cam=ac&tod=day" --out shots/<담당>/<이름>.png` → Read 로 이미지를 본다.
- 표준 세트(카메라 6 × 낮 + ac × 아침·노을·밤): `node scripts/shot.mjs --set base --label <폴더> [--q "solo=..."]` → `python scripts/sheet.py shots/<폴더>` → `_sheet.jpg` 를 본다.
- 효과 끄기 비교: `&fx=tilt:0,ao:0,bloom:0,smaa:0,grade:0,shadows:0,curve:0`. 애니메이션 시점: `&t=3.2`.
- 카메라: ac(플레이 시점) · close(캐릭터·상자) · river(강·낚시) · beach(해변) · low(눈높이·지평선) · wide(섬 전체).
- 오류가 있으면 shot 스크립트가 ERRORS 와 콘솔을 출력하고 종료 코드 1.
