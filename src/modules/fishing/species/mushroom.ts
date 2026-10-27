// GDD 3.5.6 반딧불버섯섬(swamp·foglake) 9종 — 늪은 공룡섬에도 있어서 섬(mushroom)으로 가른다.
import { at, fish, look, only, type FishDef } from './def';

const M = 'mushroom';

export const MUSHROOM_FISH: FishDef[] = [
  fish('f_swamp_snail', null, '늪우렁', at(M, 'swamp'), 1, 'XS/4',
    look('snail', ['green', 'lime', 'olive'], 'hstripe', { eye: 1.2 }), '느리지만 지각한 적 없다.'),
  fish('f_moss_catfish', null, '이끼메기', at(M, 'swamp', 'day'), 1, 'M/40',
    look('bighead', ['olive', 'cream', 'lime'], 'spots', { parts: ['whiskers2'], deco: ['moss'] }), '등에 이끼가 자라도 모른다.'),
  fish('f_glow_medaka', null, '반딧불송사리', at(M, 'swamp', 'night'), 2, 'XS/4',
    look('long', ['neon', 'cream', 'neon'], 'none', { glow: true, eye: 1.2 }), '밤에 떼로 깜빡인다.', { tags: ['school'] }),
  fish('f_fog_eel', null, '스르륵안개장어', at(M, 'foglake', 'all', only('fog')), 2, 'L/90',
    look('eel', ['lavender', 'white', 'lavender'], 'none', { clear: true }), '안개랑 구분이 안 된다.'),
  fish('f_shroom_jelly', null, '갓갓이버섯해파리', at(M, 'swamp', 'night'), 3, 'S/10',
    look('jelly', ['red', 'white', 'white'], 'none', { deco: ['cap'] }), '버섯인지 해파리인지 본인도 헷갈림.'),
  fish('f_lantern_trout', null, '초롱송어', at(M, 'foglake', 'night'), 3, 'M/40',
    look('long', ['navy', 'sky', 'yellow'], 'none', { parts: ['lantern'] }), '초롱으로 길을 비춘다.'),
  fish('f_crown_frog', null, '왕관개굴', at(M, 'swamp', 'night', only('rain')), 4, 'S/8',
    look('frog', ['lime', 'cream', 'green'], 'none', { parts: ['crown'] }), '키스하면… 아무 일도 없다.'),
  fish('f_ghost_carp', null, '유령잉어', at(M, 'foglake', 'night', only('fog')), 4, 'L/70',
    look('long', ['white', 'white', 'lavender'], 'none', { clear: true, glow: true }), '보였다 안 보였다.'),
  fish('f_moss_turtle', null, '이끼거북할멈', at(M, 'swamp', 'night', only('fog')), 5, 'XL/180',
    look('turtle', ['olive', 'cream', 'green'], 'none', { deco: ['forest'] }), '등 위에 작은 숲이 산다.'),
];
