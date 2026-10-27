// GDD 3.5.3 산호빛섬(stream·mangrove·lagoon·reef) 18종 — 무지개구피는 7색이 한 칸씩(set:rainbow, 업적 '일곱 빛깔').
import { at, fish, look, only, type FishDef } from './def';

const C = 'coral';

/** 무지개구피 7색(빨·주·노·초·파·남·보 꼬리) — 빨강이 원래 구피 자리(fish-guppy = f_guppy) */
const GUPPY: Array<[id: string, ko: string, c: string]> = [
  ['', '빨강', 'red'], ['_orange', '주황', 'orange'], ['_yellow', '노랑', 'yellow'], ['_green', '초록', 'green'],
  ['_blue', '파랑', 'blue'], ['_navy', '남색', 'navy'], ['_purple', '보라', 'purple'],
];

export const CORAL_FISH: FishDef[] = [
  ...GUPPY.map(([suf, ko, c], i) => fish('f_guppy' + suf, i === 0 ? 'fish-guppy' : null, `무지개구피(${ko})`, at(C, 'stream'), 1, 'XS/3',
    look('long', ['sky', 'white', c], 'grad', { fancy: true, deco: ['color-tail'], eye: 1.2 }),
    `다섯 마리가 늘 붙어 다닌다. 7색 세트 중 ${ko} 꼬리.`, { tags: ['set:rainbow', 'school'] })),
  fish('f_mudskipper', null, '팔짝망둥이', at(C, 'mangrove', 'day'), 1, 'S/10',
    look('bighead', ['olive', 'beige', 'brown'], 'spots', { deco: ['top-eyes', 'fin-feet'] }), '물고기인데 걷는 게 더 좋다.'),
  fish('f_clownfish', 'fish-clownfish', '줄무늬광대', at(C, 'reef'), 1, 'XS/8',
    look('round', ['orange', 'apricot', 'white'], 'stripe', { deco: ['long-ball'] }), '말미잘이 집이자 이불.'),
  fish('f_butterflyfish', 'fish-butterflyfish', '나풀이나비고기', at(C, 'reef', 'day'), 1, 'S/12',
    look('tall', ['yellow', 'cream', 'ink'], 'none', { deco: ['eyespot'] }), '가짜 눈으로 술래를 속인다.'),
  fish('f_angelfish', 'fish-angelfish', '날개천사', at(C, 'lagoon', 'day'), 2, 'S/15',
    look('tall', ['white', 'white', 'ink'], 'stripe', { parts: ['ribbon-fin'] }), '우아한 척하지만 먹보.'),
  fish('f_piranha', 'fish-piranha', '앙앙피라냐', at(C, 'stream', 'sunset'), 2, 'S/25',
    look('round', ['slate', 'red', 'red'], 'none', { deco: ['teeth'] }), '이빨 두 개가 자랑. 사실 채식.'),
  fish('f_archerfish', null, '찍찍물총고기', at(C, 'mangrove', 'day'), 2, 'S/20',
    look('long', ['silver', 'white', 'ink'], 'spots', { deco: ['pout'] }), '잡히기 전에 물총부터.'),
  fish('f_blue_tang', 'fish-blue-tang', '파랑꼬리블루탱', at(C, 'reef', 'day'), 2, 'S/20',
    look('tall', ['blue', 'sky', 'yellow'], 'grad'), '길을 자주 잃는다.'),
  fish('f_boxfish', 'fish-boxfish', '네모네모거북복', at(C, 'reef', 'day'), 2, 'S/15',
    look('box', ['yellow', 'cream', 'ink'], 'spots'), '네모난 게 매력.'),
  fish('f_parrotfish', 'fish-parrotfish', '앵무물고기', at(C, 'reef', 'day'), 2, 'M/50',
    look('long', ['teal', 'mint', 'pink'], 'rainbow', { deco: ['beak'] }), '산호를 갉아 모래를 만든다.'),
  fish('f_seahorse', 'fish-haema', '꼬리말이해마', at(C, 'reef', 'day'), 3, 'XS/10',
    look('seahorse', ['yellow', 'cream', 'orange'], 'band'), '꼬리로 해초를 꼭 잡고 산다. 10%로 커플 2마리.'),
  fish('f_lionfish', 'fish-lionfish', '부채장군쏠배감펭', at(C, 'reef', 'sunset'), 3, 'M/30',
    look('round', ['red', 'white', 'white'], 'hstripe', { parts: ['fan-fin'] }), '부채를 펼치며 등장하는 장군.'),
  fish('f_porcupine', null, '가시가시복', at(C, 'reef', 'night'), 3, 'S/30',
    look('puffer', ['beige', 'cream', 'brown'], 'spots', { parts: ['spikes'], deco: ['long-spikes'] }), '부풀면 밤송이.'),
  fish('f_moray', 'fish-moray', '빼꼼이곰치', at(C, 'reef', 'night'), 3, 'L/120',
    look('eel', ['green', 'lime', 'olive'], 'none'), '평생 빼꼼.'),
  fish('f_arowana', 'fish-arowana', '용용아로와나', at(C, 'lagoon', 'night'), 4, 'L/80',
    look('long', ['silver', 'white', 'gold'], 'chrome', { parts: ['whiskers2'], deco: ['long-body'] }), '용이 되려고 수련 중.'),
  fish('f_napoleon', null, '혹부리나폴레옹', at(C, 'reef', 'day', only('clear')), 4, 'XL/180',
    look('long', ['teal', 'mint', 'blue'], 'hstripe', { parts: ['hump'] }), '이마 혹은 지혜 주머니.'),
  fish('f_arapaima', 'fish-pirarucu', '거대해피라루쿠', at(C, 'stream', 'sunset', only('rain')), 5, 'XXL/250',
    look('long', ['olive', 'apricot', 'red'], 'grad', { deco: ['long-body'] }), '이름 그대로 거대해.'),
  fish('f_rainbow_manta', 'fish-manta', '무지개만타', at(C, 'lagoon,reef', 'day', only('rainbow')), 5, 'XXL/400',
    look('ray', ['purple', 'white', 'pink'], 'rainbow', { deco: ['cephalic', 'curl-wings'] }), '석호 위를 날듯이 점프한다.'),
];
