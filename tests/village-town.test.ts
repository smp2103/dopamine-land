// village-town: 집 단계(해금 → 0~4)·시설 보이기(이벤트 → setFacility)·마을 장소가 땅/물 위에 제대로 있는지.
import { describe, it, expect } from 'vitest';
import * as Island from '../src/core/island';
import { makeFakeGame } from './kit/fakeGame';
import { houseStageFromUnlocks, houseKeyStage, clampStage } from '../src/modules/village/house';
import { FACILITY_IDS, facilityIdsFor, facilityKeys, facilityUnlocked, wireVillageSync, type VillageTargets } from '../src/modules/village/facilities';
import { planShipyard, PIER_LEN, PIER_END } from '../src/modules/village/shipyard';
import { planBridge } from '../src/modules/village/bridges';

const H = Island.heightAt;
const P = Island.PLACES;
const dry = (x: number, z: number) => H(x, z) > 0.3 && !Number.isFinite(Island.waterLevelAt(x, z));

/** 기록하는 대상(ext.village 대역) */
function recorder(lighthouseIds: string[] = ['home', 'coral', 'dino']) {
  const log: string[] = [];
  const st = { house: -1, tower: -1, fac: new Map<string, boolean>(), lights: new Map<string, boolean>() };
  const T: VillageTargets = {
    lighthouseIds,
    setLighthouse: (id, lit) => { st.lights.set(id, lit); log.push(`light:${id}:${lit}`); },
    setTowerStage: (n) => { st.tower = n; log.push(`tower:${n}`); },
    setHouseStage: (n) => { st.house = n; log.push(`house:${n}`); },
    setFacility: (id, on) => { st.fac.set(id, on); log.push(`fac:${id}:${on}`); },
  };
  return { T, st, log };
}
/** 가짜 econ(해금 키 집합) */
function fakeEcon(keys: string[], o: { cheat?: boolean; parts?: number } = {}) {
  const set = new Set(keys);
  return {
    isUnlocked: (k: string) => set.has(k),
    unlock: (k: string) => set.add(k),
    rocket: () => ({ count: o.parts ?? [...set].filter((k) => k.startsWith('rocket:part:')).length }),
    cheat: !!o.cheat,
  };
}

describe('집 단계(해금 → 외형)', () => {
  it('house:1~4 중 가장 높은 단계', () => {
    expect(houseStageFromUnlocks(() => false)).toBe(0);
    expect(houseStageFromUnlocks((k) => k === 'house:1')).toBe(1);
    expect(houseStageFromUnlocks((k) => k === 'house:1' || k === 'house:2')).toBe(2);
    expect(houseStageFromUnlocks((k) => k === 'house:3')).toBe(3);
    expect(houseStageFromUnlocks((k) => k.startsWith('house:'))).toBe(4);
    expect(houseStageFromUnlocks((k) => k === 'house:5' || k === 'house:0')).toBe(0);
  });
  it('키 읽기·범위', () => {
    expect(houseKeyStage('house:2')).toBe(2);
    expect(houseKeyStage('house:9')).toBeNull();
    expect(houseKeyStage('houses:1')).toBeNull();
    expect(clampStage(7)).toBe(4);
    expect(clampStage(-2)).toBe(0);
    expect(clampStage(NaN)).toBe(0);
  });
  it('첫 onUpdate 에서 econ 으로 맞추고, unlock house:n 이벤트로 오른다(내려가지 않는다)', () => {
    const game = makeFakeGame();
    const { T, st } = recorder();
    wireVillageSync(game as never, T);
    game.econ = fakeEcon(['house:1']) as never;
    game.tick(1 / 60, 1);
    expect(st.house).toBe(1);
    game.state.emit({ type: 'unlock', key: 'house:3' });
    expect(st.house).toBe(3);
    game.state.emit({ type: 'unlock', key: 'house:2' });
    expect(st.house).toBe(3);
    game.dispose();
  });
});

describe('시설 보이기(이벤트 → setFacility)', () => {
  it('별칭·섬 id 를 시설 id 로', () => {
    expect(facilityIdsFor('divingCenter')).toEqual(['divingCenter']);
    expect(facilityIdsFor('diving')).toEqual(['divingCenter']);
    expect(facilityIdsFor('fossillab')).toEqual(['fossilLab']);
    expect(facilityIdsFor('hatchery')).toEqual(['fossilLab']);
    expect(facilityIdsFor('ice')).toEqual(['iceHut', 'skiLift']);
    expect(facilityIdsFor('mushroom')).toEqual(['fireflyGarden', 'potionShop']);
    expect(facilityIdsFor('launch')).toEqual([]); // 발사장 개방 키 — 천문대와 따로
    expect(facilityIdsFor('spacecenter')).toEqual([]);
    for (const id of FACILITY_IDS) expect(facilityKeys(id)).toContain(`facility:${id}`);
    expect(facilityUnlocked('bazaar', (k) => k === 'facility:oasis')).toBe(true);
    expect(facilityUnlocked('bazaar', (k) => k === 'dev:desert:3')).toBe(true);
    expect(facilityUnlocked('bazaar', (k) => k === 'dev:desert:2')).toBe(false);
  });
  it('처음엔 전부 노점, facility:<id> 해금이 오면 그 시설만', () => {
    const game = makeFakeGame();
    const { T, st, log } = recorder();
    wireVillageSync(game as never, T);
    game.econ = fakeEcon([]) as never;
    game.tick(1 / 60, 2);
    for (const id of FACILITY_IDS) expect(st.fac.get(id)).toBe(false);
    log.length = 0;
    game.state.emit({ type: 'unlock', key: 'facility:diving' });
    expect(st.fac.get('divingCenter')).toBe(true);
    expect(st.fac.get('bazaar')).toBe(false);
    // 같은 해금이 또 와도 한 번만
    game.state.emit({ type: 'unlock', key: 'facility:divingCenter' });
    expect(log.filter((l) => l.startsWith('fac:divingCenter')).length).toBe(1);
    game.dispose();
  });
  it('dev-stage ③ 이면 그 섬 시설이 서고 ① 이면 등대가 켜진다', () => {
    const game = makeFakeGame();
    const { T, st } = recorder(['home', 'ice']);
    wireVillageSync(game as never, T);
    game.state.emit({ type: 'dev-stage', island: 'ice', stage: 1 });
    expect(st.lights.get('ice')).toBe(true);
    expect(st.fac.get('iceHut')).toBeUndefined();
    game.state.emit({ type: 'dev-stage', island: 'ice', stage: 3 });
    expect(st.fac.get('iceHut')).toBe(true);
    expect(st.fac.get('skiLift')).toBe(true);
    game.dispose();
  });
  it('cheat 면 처음부터 전부 보인다', () => {
    const game = makeFakeGame();
    const { T, st } = recorder();
    wireVillageSync(game as never, T);
    game.econ = fakeEcon([], { cheat: true }) as never;
    game.tick(1 / 60, 1);
    for (const id of FACILITY_IDS) expect(st.fac.get(id)).toBe(true);
    game.dispose();
  });
  it('등대·발사탑: 첫 동기화 + lighthouse / rocket:part 이벤트', () => {
    const game = makeFakeGame();
    const { T, st } = recorder(['home', 'coral']);
    wireVillageSync(game as never, T);
    const econ = fakeEcon(['lighthouse:coral', 'rocket:part:body', 'rocket:part:engine']);
    game.econ = econ as never;
    game.tick(1 / 60, 1);
    expect(st.lights.get('coral')).toBe(true);
    expect(st.lights.get('home')).toBe(false);
    expect(st.tower).toBe(2);
    econ.unlock('rocket:part:wing');
    game.state.emit({ type: 'unlock', key: 'rocket:part:wing' });
    expect(st.tower).toBe(3);
    game.state.emit({ type: 'lighthouse', island: 'home', lit: true });
    expect(st.lights.get('home')).toBe(true);
    game.state.emit({ type: 'unlock', key: 'lighthouse:nowhere' }); // 모르는 섬은 무시
    expect(st.lights.has('nowhere')).toBe(false);
    game.dispose();
  });
});

describe('마을 장소(땅·물)', () => {
  it('집·우체통·시설 자리는 마른 땅', () => {
    expect(dry(P.house.x, P.house.z)).toBe(true);
    expect(dry(P.mailbox.x, P.mailbox.z)).toBe(true);
    expect(dry(P.shipyard.x, P.shipyard.z)).toBe(true);
    for (const id of FACILITY_IDS) {
      const s = P.facilities[id];
      expect(dry(s.x, s.z), id).toBe(true);
    }
    for (const [id, s] of Object.entries(P.lighthouses)) expect(dry(s.x, s.z), id).toBe(true);
  });
  it('다리 3: 가운데는 강물 위, 양 끝은 둑(땅)이고 아치가 물 위로 뜬다', () => {
    expect(P.bridges.length).toBe(3);
    for (const b of P.bridges) {
      const w = Island.waterLevelAt(b.x, b.z);
      expect(Number.isFinite(w)).toBe(true);
      expect(H(b.x, b.z)).toBeLessThan(w);
      const f = { x: Math.sin(b.rot), z: Math.cos(b.rot) };
      const a = { x: b.x - f.x * b.len / 2, z: b.z - f.z * b.len / 2 }, c = { x: b.x + f.x * b.len / 2, z: b.z + f.z * b.len / 2 };
      expect(dry(a.x, a.z)).toBe(true);
      expect(dry(c.x, c.z)).toBe(true);
      const plan = planBridge(b.len, H(a.x, a.z), H(c.x, c.z), w);
      expect(plan.deckY(0.5)).toBeGreaterThan(w + 0.9);
      // 구간 경사 30° 이하(걸어 오를 수 있게)
      for (let k = 0; k < 10; k++) {
        const dy = plan.deckY((k + 1) / 10) - plan.deckY(k / 10);
        expect(Math.abs(Math.atan2(dy, b.len / 10))).toBeLessThan((30 * Math.PI) / 180);
      }
    }
  });
  it('조선소: 계산대·창고는 땅, 잔교 30 m 는 바다로, 배 소환 자리는 깊은 물', () => {
    const plan = planShipyard(Island);
    expect(dry(plan.counter.x, plan.counter.z)).toBe(true);
    expect(H(plan.warehouse.x, plan.warehouse.z)).toBeGreaterThan(0.2);
    expect(plan.pier.len).toBe(PIER_LEN);
    const d = { x: Math.sin(plan.pier.rotY), z: Math.cos(plan.pier.rotY) };
    for (let s = 6; s <= PIER_LEN + PIER_END; s += 3) expect(H(plan.pier.x + d.x * s, plan.pier.z + d.z * s)).toBeLessThan(0);
    expect(H(plan.boatSpawn.x, plan.boatSpawn.z)).toBeLessThan(-0.8);
    expect(Math.hypot(plan.pier.x - plan.counter.x, plan.pier.z - plan.counter.z)).toBeGreaterThan(4);
    // 보도가 있으면 끝은 본섬 땅
    if (plan.walk) expect(H(plan.walk.endX, plan.walk.endZ)).toBeGreaterThan(0.4);
    // 결정적
    expect(planShipyard(Island)).toEqual(plan);
  });
});
