// GDD 3.5.8 별똥별섬 크레이터 호수(crater) 17종 — 별자리 물고기 12종(set:zodiac, 기증 → 로켓 항법 칩).
// 별자리 무늬(constellation)는 남색 몸 + 금 별·선 메시(parts.ts)를 종마다 다른 모양으로 얹는다.
import { at, boost, fish, look, only, type FishDef } from './def';
import type { FishDeco, FishLook } from '../data';
import type { Part } from '../../../core/art';

const L = 'launch';
const NIGHT = 'night';

/** 별자리 물고기 공통 모양 — 남색 + 금 별자리. 몸형·파츠·장식만 다르다 */
const zodiacLook = (shape: FishLook['shape'], parts: Part[] = [], deco: FishDeco[] = [], glow?: string): FishLook =>
  look(shape, ['navy', 'lavender', glow ?? 'gold'], 'constellation', { parts, deco: ['stars', ...deco], glow: !!glow });

const Z: Array<[id: string, name: string, r: 3 | 4 | 5, size: string, lk: FishLook, n: string]> = [
  ['aries', '양자리물고기', 3, 'S/20', zodiacLook('round', [], ['curl-horn']), '①'],
  ['taurus', '황소자리물고기', 3, 'M/30', zodiacLook('bighead', [], ['horns2']), '②'],
  ['gemini', '쌍둥이자리물고기', 3, 'S/15', zodiacLook('long', [], ['twin']), '③'],
  ['cancer', '게자리물고기', 3, 'S/15', { ...zodiacLook('crab'), claws: true }, '④'],
  ['leo', '사자자리물고기', 3, 'M/35', zodiacLook('round', ['crest'], ['mane']), '⑤'],
  ['virgo', '처녀자리물고기', 3, 'S/20', zodiacLook('tall', ['flower']), '⑥'],
  ['libra', '천칭자리물고기', 4, 'M/40', zodiacLook('flatfish', [], ['scale-mark']), '⑦'],
  ['scorpio', '전갈자리물고기', 4, 'S/25', { ...zodiacLook('shrimp', ['claws-big'], ['heart-tail']) }, '⑧'],
  ['sagittarius', '사수자리물고기', 4, 'M/40', zodiacLook('long', [], ['arrow-fin']), '⑨'],
  ['capricorn', '염소자리물고기', 4, 'S/25', zodiacLook('tadpole', [], ['horns2']), '⑩'],
  ['aquarius', '물병자리물고기', 5, 'M/30', zodiacLook('jelly', [], ['jar'], 'sky'), '⑪'],
  ['pisces', '물고기자리물고기', 5, 'M/30', zodiacLook('long', [], ['twin-ribbon'], 'pink'), '⑫ 12종 기증 = 로켓 항법 칩'],
];
const ZODIAC_LINE: Record<string, string> = {
  aries: '말린 뿔로 별을 콩 박는다.', taurus: '힘은 세지만 별사탕을 제일 좋아한다.', gemini: '둘이 한 몸처럼 붙어 다닌다.',
  cancer: '집게로 별빛을 집어 먹는다.', leo: '갈기를 휘날리며 크레이터의 왕을 자처한다.', virgo: '머리에 꽃 한 송이를 꽂고 다닌다.',
  libra: '등에 저울 무늬가 있어 공평한 걸 좋아한다.', scorpio: '꼬리 끝이 하트라 하나도 안 무섭다.', sagittarius: '화살 지느러미로 별똥별을 겨눈다.',
  capricorn: '작은 뿔 두 개로 밤하늘을 오른다.', aquarius: '항아리 속에 별빛 물을 담아 다닌다.', pisces: '리본으로 이어진 단짝 두 마리.',
};

export const LAUNCH_FISH: FishDef[] = [
  fish('f_galaxy_crucian', null, '은하붕어', at(L, 'crater'), 1, 'S/15',
    look('round', ['navy', 'purple', 'pink'], 'galaxy'), '비늘마다 별이 하나씩.'),
  // 5색 변이: 잡을 때마다 파스텔 다섯 색 중 하나(model 이 rng 로 고른다)
  fish('f_candy_medaka', null, '별사탕송사리', at(L, 'crater', NIGHT), 1, 'XS/4',
    look('long', ['lightPink', 'white', 'yellow'], 'none', {
      eye: 1.2, variants: [['lightPink', 'white', 'yellow'], ['lavender', 'white', 'pink'], ['mint', 'white', 'sky'], ['sky', 'white', 'lavender'], ['yellow', 'white', 'apricot']],
    }), '별사탕을 닮은 꼬마.'),
  fish('f_comet_goldfish', null, '혜성꼬리금붕어', at(L, 'crater', NIGHT, boost(3, 'meteor')), 2, 'S/12',
    look('round', ['orange', 'apricot', 'white'], 'grad', { fancy: true, parts: ['light-tail'] }), '꼬리가 혜성처럼 길다.'),
  ...Z.map(([id, name, r, sz, lk, n]) => fish('f_zodiac_' + id, null, name,
    at(L, 'crater', NIGHT, r === 5 ? only('meteor') : boost(3, 'meteor')), r, sz, lk,
    `${ZODIAC_LINE[id]} 별자리 12종 ${n}`, { tags: ['set:zodiac'] })),
  fish('f_meteor_turtle', null, '운석거북', at(L, 'crater', NIGHT, boost(3, 'meteor')), 4, 'L/80',
    look('turtle', ['grey', 'cream', 'gold'], 'spots', { deco: ['meteor-shell'] }), '하늘에서 같이 떨어졌다.'),
  fish('f_meteor_koi', null, '유성잉어', at(L, 'crater', NIGHT, only('meteor')), 5, 'L/80',
    look('long', ['white', 'white', 'gold'], 'none', { parts: ['light-tail', 'whiskers2'], glow: true }), '소원을 들어줄 것 같은 잉어.'),
];
