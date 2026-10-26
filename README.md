# 도파민랜드 (가제)

동물의 숲처럼 귀엽고, 젤다처럼 탐험하고, 모든 게 랜덤 보상인 3D 힐링 게임. 웹(Three.js + TypeScript + Rapier).

## 실행 (맥·윈도우 공통)
```bash
npm install
npm run dev        # http://127.0.0.1:5180
```
조작: WASD 이동 · Shift 달리기 · Space 점프(공중에서 누르고 있으면 활공) · C 잠수 · E 상호작용 · 마우스 드래그 시점 · 휠 줌 · V 카메라(모험/아늑)

URL 옵션: `?spawn=dino`(섬 id: home·dino·ice·mushroom·coral·desert·launch), `?world=space`, `?style=cozy`, `?tod=sunset`, `?game=0`(룩 테스트 장면), `?fresh=1`(저장 무시)

## 구조
- `src/core/` 엔진·세계·물리·게임 API — `CONTRACT.md` 참고
- `src/modules/` 콘텐츠 모듈(지형·식물·낚시·곤충·공룡·탈것·우주·캐릭터·UI·마을·대기…)
- `docs/GDD.md` 기획서
- `scripts/shot.mjs` 헤드리스 크롬 촬영(QA), `scripts/sheet.py` 시트

## 촬영(QA)
```bash
node scripts/shot.mjs --q "spawn=dino&tod=day" --out shots/x.png --bench
```
맥에서는 Chrome 이 설치돼 있어야 한다(playwright-core 가 시스템 Chrome 을 쓴다).
