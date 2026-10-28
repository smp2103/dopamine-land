// 플레이어 꾸미기·모델 — 모습 거르기/글자 왕복/옛 색 맞추기(순수) + 모든 모양·옷·모자 조합이 서고,
// 모든 동작·이동 모드에서 NaN 없이 움직이며, 드로 예산(가까이 ≤ 26 · 먼 LOD = 6)을 지키는지. 친구 아바타도 같은 모델.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import {
  buildPlayer, PLAYER_POSES, DEFAULT_LOOK, LOOK_PRESETS, cleanLook, sameLook, encodeLook, decodeLook, lookFromColors, colorsFromLook,
  HAIR_STYLES, OUTFITS, HATS, HAIR_COLORS, OUTFIT_COLORS, EYE_COLORS, SKINS, type PlayerLook, type PoseState,
} from '../src/modules/characters/player';
import { sceneStats } from './kit/three';

type G = Record<string, unknown>;
const gl = globalThis as unknown as G;
let undo: () => void = () => {};
beforeAll(() => {
  // 화면 없는 node: 캔버스 2D 는 아무것도 안 하는 대역으로
  const had = 'document' in gl, prev = gl.document;
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: String(s).length * 10 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  const el = (tag: string) => ({ tagName: tag, style: {}, width: 0, height: 0, getContext: () => ctx2d, appendChild() {}, addEventListener() {} });
  gl.document = { head: { appendChild() {} }, body: { appendChild() {} }, createElement: el };
  undo = () => { if (had) gl.document = prev; else delete gl.document; };
});
afterAll(() => undo());

const visibleStats = (o: THREE.Object3D) => sceneStats(o, { visibleOnly: true });
function finite(root: THREE.Object3D): boolean {
  let ok = true;
  root.updateMatrixWorld(true);
  root.traverse((o) => { for (const v of o.matrixWorld.elements) if (!Number.isFinite(v)) ok = false; });
  return ok;
}

describe('모습(look) — 순수', () => {
  it('cleanLook: 모르는 값·쓰레기는 기본값', () => {
    expect(cleanLook(null)).toEqual(DEFAULT_LOOK);
    expect(cleanLook({ hair: 'mohawk', skin: 3, outfit: 'hoodie', freckles: 'yes' })).toEqual({ ...DEFAULT_LOOK, outfit: 'hoodie' });
  });
  it('머리 모양 ≥ 4, 옷 ≥ 4, 모자/장식 ≥ 4', () => {
    expect(Object.keys(HAIR_STYLES).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(OUTFITS).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(HATS).length).toBeGreaterThanOrEqual(4);
  });
  it('encodeLook ↔ decodeLook 왕복(추천 모습 전부), 더 새 버전·이상한 글자는 null', () => {
    for (const p of LOOK_PRESETS) {
      const s = encodeLook(p.look);
      expect(s).toMatch(/^L1\./);
      expect(s.length).toBeLessThanOrEqual(12);
      expect(decodeLook(s)).toEqual(cleanLook(p.look));
    }
    expect(decodeLook('L9.0000000')).toBeNull();
    expect(decodeLook('엉뚱')).toBeNull();
    expect(decodeLook(42)).toBeNull();
  });
  it('옛 통신 색 → 가장 가까운 옷 색·머리색, 모습 → 색 → 모습이 같은 칸', () => {
    const l = lookFromColors({ tee: '#9fe6c8', hair: '#8a5a3e' });
    expect(l.outfitColor).toBe('mint');
    expect(l.hairColor).toBe('cocoa');
    for (const hc of Object.keys(HAIR_COLORS)) for (const oc of Object.keys(OUTFIT_COLORS)) {
      const a = { ...DEFAULT_LOOK, hairColor: hc, outfitColor: oc } as PlayerLook;
      expect(sameLook(lookFromColors(colorsFromLook(a)), a)).toBe(true);
    }
    expect(lookFromColors({ tee: 'zz', hair: '' })).toEqual(DEFAULT_LOOK);
  });
});

describe('플레이어 모델', () => {
  it('기본 모델: 모든 동작·이동 모드가 NaN 없이, 드로 예산 안, 먼 LOD 6 드로', () => {
    const rig = buildPlayer();
    const modes: PoseState['mode'][] = ['ground', 'air', 'glide', 'swim', 'dive', 'mounted'];
    let t = 0;
    for (const mode of modes) for (let i = 0; i < 20; i++) { t += 1 / 60; rig.animate({ speed: mode === 'ground' ? 6 : 1, mode, action: null, t, dt: 1 / 60 }); }
    for (const a of PLAYER_POSES) for (let i = 0; i < 12; i++) { t += 1 / 60; rig.animate({ speed: 0, mode: 'ground', action: a, t, dt: 1 / 60 }); }
    rig.animate({ speed: 0, mode: 'ground', action: null, t, dt: 0 });
    expect(finite(rig.root)).toBe(true);
    const near = visibleStats(rig.root);
    expect(near.drawCalls).toBeLessThanOrEqual(26);
    expect(near.triangles).toBeLessThan(80000);
    rig.setLod!('far');
    const far = visibleStats(rig.root);
    expect(far.drawCalls).toBe(6);
    rig.setLod!('near');
    expect(visibleStats(rig.root).drawCalls).toBe(near.drawCalls);
  });
  it('모든 머리 모양 × 옷 × 모자가 서고, setLook 은 같은 root·holdSlot 에서 다시 짓는다', () => {
    const rig = buildPlayer();
    const root = rig.root, slot = rig.holdSlot;
    let t = 0;
    for (const hair of Object.keys(HAIR_STYLES)) for (const outfit of Object.keys(OUTFITS)) for (const hat of Object.keys(HATS)) {
      const l = cleanLook({ ...DEFAULT_LOOK, hair, outfit, hat });
      rig.setLook!(l);
      t += 0.1;
      rig.animate({ speed: 3, mode: 'ground', action: null, t, dt: 1 / 60 });
      expect(rig.root).toBe(root);
      expect(rig.holdSlot).toBe(slot);
      expect(rig.look).toEqual(l);
      expect(finite(root)).toBe(true);
      expect(visibleStats(root).drawCalls).toBeLessThanOrEqual(30);
    }
    rig.setLod!('far');
    expect(visibleStats(root).drawCalls).toBe(6);
  });
  it('들기: 깜짝 → 곧 > < , 더듬이가 눌린다; 바라보기 대상이 있으면 고개를 돌린다', () => {
    const rig = buildPlayer();
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    let t = 0;
    for (let i = 0; i < 30; i++) { t += 1 / 60; rig.animate({ speed: 0, mode: 'ground', action: null, t, dt: 1 / 60 }); }
    rig.holdSlot.add(prop);
    for (let i = 0; i < 60; i++) { t += 1 / 60; rig.animate({ speed: 0, mode: 'ground', action: null, t, dt: 1 / 60 }); }
    let ahoge: THREE.Object3D | null = null;
    rig.head!.children.forEach((c) => { if (c.children.length === 2 && c.position.y > 0.25) ahoge = c; });
    expect(ahoge).toBeTruthy();
    expect((ahoge as unknown as THREE.Object3D).rotation.x).toBeLessThan(-0.5);
    rig.holdSlot.remove(prop);
    rig.root.updateMatrixWorld(true);
    const side = new THREE.Vector3(3, 1, 0.5).applyMatrix4(rig.root.matrixWorld);
    rig.setLookTarget!(side);
    for (let i = 0; i < 120; i++) { t += 1 / 60; rig.animate({ speed: 0, mode: 'ground', action: null, t, dt: 1 / 60 }); }
    expect(Math.abs(rig.head!.rotation.y)).toBeGreaterThan(0.4);
  });
});

describe('친구 아바타', () => {
  it('look 글자가 오면 그 모습, 없으면 색으로 짐작(옛 친구)', async () => {
    const { RemoteAvatar, friendLook } = await import('../src/modules/netplay/avatar');
    const sp = LOOK_PRESETS[1].look;
    expect(friendLook({ tee: '#ff8e86', hair: '#784a2e' }, encodeLook(sp))).toEqual(cleanLook(sp));
    expect(friendLook({ tee: '#9fe6c8', hair: '#86dcc4' }).hairColor).toBe('mint');
    const a = new RemoteAvatar('친구', { tee: '#9fe6c8', hair: '#86dcc4' });
    expect(a.currentLook.outfitColor).toBe('mint');
    a.setProfile('친구', { tee: '#9fe6c8', hair: '#86dcc4' }, encodeLook(sp));
    expect(a.currentLook).toEqual(cleanLook(sp));
    a.dispose();
  });
});

describe('자원 정리', () => {
  it('얼굴 굽기 판은 참조 세기로 공유·해제된다(꾸미기 연타·친구가 많아도 쌓이지 않는다)', async () => {
    const { faceCacheSize } = await import('../src/modules/characters/player/face');
    const n0 = faceCacheSize();
    const a = buildPlayer(), b = buildPlayer();
    // 같은 모습 둘은 같은 판(바탕·눈·입)을 같이 쓴다 — 앞 테스트가 남긴 기본 판이 있으면 늘지도 않는다
    expect(faceCacheSize()).toBeLessThanOrEqual(Math.max(n0, 3));
    const n1 = faceCacheSize();
    const eyes = Object.keys(EYE_COLORS);
    for (const e of eyes) { a.setLook!({ ...a.look!, eyes: e } as PlayerLook); expect(faceCacheSize()).toBeLessThanOrEqual(n1 + 1); }
    // 피부만 바꾸면 2048 눈 판은 다시 굽지 않고 바탕 하나만 는다
    a.setLook!({ ...a.look!, skin: Object.keys(SKINS).find((k) => k !== a.look!.skin)! } as PlayerLook);
    expect(faceCacheSize()).toBeLessThanOrEqual(n1 + 2);
    a.dispose!(); b.dispose!();
    expect(faceCacheSize()).toBe(n0);
  });
  it('친구 아바타: 합친 기하는 모습 바꿀 때·떠날 때 버려진다', async () => {
    const { RemoteAvatar } = await import('../src/modules/netplay/avatar');
    const a = new RemoteAvatar('친구', { tee: '#9fe6c8', hair: '#86dcc4' });
    const merged = () => { const out: THREE.Mesh[] = []; a.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name === 'netplay:merged') out.push(m); }); return out; };
    const disposed = new Set<THREE.BufferGeometry>();
    const watch = (ms: THREE.Mesh[]) => { for (const m of ms) m.geometry.addEventListener('dispose', () => disposed.add(m.geometry)); return ms; };
    const first = watch(merged());
    a.setProfile('친구', { tee: '#9fe6c8', hair: '#86dcc4' }, encodeLook(LOOK_PRESETS[2].look));
    // 옛 몸에 붙어 있던 합친 기하는 다 버려지고, 아직 붙어 있는 것(도구 상자 등)은 남는다
    for (const m of first) expect(disposed.has(m.geometry) || merged().includes(m)).toBe(true);
    const second = watch(merged());
    a.dispose();
    for (const m of second) expect(disposed.has(m.geometry)).toBe(true);
  });
});
