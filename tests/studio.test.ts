// studio: URL 파라미터 읽기(rig·pose·expr·숫자 범위·game=1 풀밭 기본·size) · toQuery 왕복 · 포즈 → 아바타 입력 · 접촉 시트 배치.
import { describe, it, expect } from 'vitest';
import {
  parseStudioParams, parseRig, rigKey, toQuery, normAngle, playerPose, animalPose,
  rigSheet, posesSheet, lineupSheet, lineupParts, DEFAULTS, SHEET_W, EXPRS, TURN_ANGLES, SHEET_POSES,
} from '../src/studio/params';

describe('studio params', () => {
  it('기본값', () => {
    const p = parseStudioParams('');
    expect(p).toEqual(DEFAULTS);
    expect(rigKey(p.rig)).toBe('player');
  });

  it('rig 종류', () => {
    expect(parseRig('player')).toEqual({ type: 'player', id: 'player' });
    expect(parseRig('animal:bear')).toEqual({ type: 'animal', id: 'bear' });
    expect(parseRig('npc:npc_quack')).toEqual({ type: 'npc', id: 'npc_quack' });
    expect(parseRig('villager:nabi')).toEqual({ type: 'villager', id: 'nabi' });
    expect(parseRig('concept:jelly')).toEqual({ type: 'concept', id: 'jelly' });
    expect(parseRig('concept:../../evil')).toBeNull();
    expect(parseRig('robot:x')).toBeNull();
    expect(parseRig('')).toBeNull();
    // 모르는 rig 는 기본(플레이어)
    expect(parseStudioParams('?rig=zzz').rig.type).toBe('player');
  });

  it('pose · expr · 숫자', () => {
    const p = parseStudioParams('?rig=animal:rabbit&pose=Cheer&expr=happy&t=2.5&angle=-90&dist=0.01&h=1.2&fov=500');
    expect(p.pose).toBe('cheer');
    expect(p.expr).toBe('happy');
    expect(p.t).toBe(2.5);
    expect(p.angle).toBe(270);
    expect(p.dist).toBe(0.2);
    expect(p.h).toBe(1.2);
    expect(p.fov).toBe(120);
    expect(parseStudioParams('?expr=angry&pose=a1').expr).toBeNull();
    expect(parseStudioParams('?pose=a1').pose).toBe('idle');
    expect(parseStudioParams('?t=abc').t).toBe(1);
    expect(normAngle(725)).toBe(5);
  });

  it('game=1 이면 풀밭이 기본, bg 를 주면 그것', () => {
    expect(parseStudioParams('?game=1').bg).toBe('grass');
    expect(parseStudioParams('?game=1&bg=studio').bg).toBe('studio');
    expect(parseStudioParams('?bg=grass').bg).toBe('grass');
    const p = parseStudioParams('?game=1&cam=cozy&lod=far&lineup=1&part=1&sil=1&frame=face&zoom=3&size=640x480&orbit=0');
    expect(p).toMatchObject({ game: true, cam: 'cozy', lod: 'far', lineup: true, part: 1, sil: true, frame: 'face', zoom: 3, size: { w: 640, h: 480 }, orbit: false });
    expect(parseStudioParams('?size=9x9').size).toBeNull();
  });

  it('객체로도 받는다', () => {
    const p = parseStudioParams({ rig: 'animal:fox', pose: 'walk', angle: 45, game: true, dist: null });
    expect(p.rig).toEqual({ type: 'animal', id: 'fox' });
    expect(p.pose).toBe('walk');
    expect(p.angle).toBe(45);
    expect(p.dist).toBeNull();
  });

  it('toQuery 왕복', () => {
    const cases = [
      '', 'rig=animal%3Abear&pose=run&expr=sad&t=3&angle=90&dist=4', 'game=1&bg=studio&cam=cozy&pitch=0.5',
      'lineup=1&part=0&sil=1', 'rig=concept%3Ajelly&frame=face&zoom=2&size=300x400&tod=sunset&orbit=0', 'game=1&lod=far&dist=30',
    ];
    for (const c of cases) {
      const p = parseStudioParams(c);
      expect(parseStudioParams(toQuery(p))).toEqual(p);
    }
    expect(toQuery(DEFAULTS)).toBe('');
  });
});

describe('studio poses', () => {
  const acts = ['fish', 'hold', 'cheer', 'sit'];
  it('플레이어: 이동 상태 · 동작 · 모르는 포즈', () => {
    expect(playerPose('idle', acts)).toMatchObject({ speed: 0, mode: 'ground', action: null, fallback: false });
    expect(playerPose('walk', acts).speed).toBeGreaterThan(0.4);
    expect(playerPose('run', acts).speed).toBeGreaterThan(8.5); // 달리기 smoothstep 끝(8.5) 너머
    expect(playerPose('jump', acts).mode).toBe('air');
    expect(playerPose('swim', acts).mode).toBe('swim');
    expect(playerPose('mounted', acts).mode).toBe('mounted');
    expect(playerPose('hold', acts)).toMatchObject({ action: 'hold', hold: true });
    expect(playerPose('fish', acts)).toMatchObject({ action: 'fish', hold: false });
    expect(playerPose('dance', acts)).toMatchObject({ action: null, fallback: true });
  });
  it('동물: 걷기·박수·표정', () => {
    expect(animalPose('walk', null).walk).toBeGreaterThan(0);
    expect(animalPose('cheer', null)).toMatchObject({ clap: true, happy: true, fallback: false });
    expect(animalPose('jump', null).hop).toBeGreaterThan(0);
    expect(animalPose('idle', 'smile').happy).toBe(true);
    expect(animalPose('swim', null).fallback).toBe(true);
  });
});

describe('studio sheets', () => {
  const rig = { type: 'animal' as const, id: 'bear' };
  it('리그 시트: 돌려 보기 8 · 포즈 8 · 얼굴 6 + 게임 + 먼 LOD, 줄마다 폭이 꼭 맞다', () => {
    const rows = rigSheet(rig);
    expect(rows).toHaveLength(3);
    expect(rows[0].cells.map((c) => c.q.angle)).toEqual([...TURN_ANGLES]);
    expect(rows[1].cells.map((c) => c.q.pose)).toEqual([...SHEET_POSES]);
    expect(rows[2].cells.slice(0, 6).map((c) => c.q.expr)).toEqual([...EXPRS]);
    expect(rows[2].cells[6].q).toMatchObject({ game: true });
    expect(rows[2].cells[7].q).toMatchObject({ game: true, lod: 'far', dist: 30 });
    for (const r of rows) {
      expect(r.cells.reduce((a, c) => a + c.w, 0)).toBeCloseTo(SHEET_W, 5);
      for (const c of r.cells) expect(c.q.rig).toEqual(rig);
    }
  });
  it('모든 포즈 시트: 이동 상태 + 동작 전부, 8칸씩', () => {
    const acts = Array.from({ length: 21 }, (_, i) => `a${i}`);
    const rows = posesSheet({ type: 'player', id: 'player' }, acts);
    const poses = rows.flatMap((r) => r.cells.map((c) => c.q.pose));
    expect(poses).toHaveLength(7 + 21);
    expect(poses).toContain('glide');
    expect(poses).not.toContain('idle');
    for (const r of rows) expect(r.cells.length).toBeLessThanOrEqual(8);
  });
  it('줄 세우기 시트 · 반 나누기', () => {
    const rows = lineupSheet();
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.cells[0].q.lineup)).toBe(true);
    expect(rows.filter((r) => r.cells[0].q.sil)).toHaveLength(2);
    const parts = lineupParts(Array.from({ length: 23 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([12, 11]);
    expect(parts.flat()).toHaveLength(23);
  });
});
