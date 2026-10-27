// GDD 3.5.9 먼바다(offshore — 해안 150m 밖, 배 위에서만) 8종 + 3.5.10 심해 해구(deep — P1 출현 / P0 데이터) 9종.
// 무서운 종(상어·아귀·메갈로돈)은 볼터치 필수 — model 이 모든 종에 볼터치를 붙이고, 'scary' 태그 종은 웃는 입을 크게.
import { at, boost, fish, look, only, type FishDef } from './def';

const ANY = 'any';
const P1 = { p1: true } as const;

export const OFFSHORE_FISH: FishDef[] = [
  fish('f_flyingfish', 'fish-flyingfish', '파닥날치', at(ANY, 'offshore', 'day'), 2, 'S/30',
    look('long', ['blue', 'silver', 'sky'], 'grad', { parts: ['big-pec'] }), '배를 따라 날아오른다(가끔 갑판에 뛰어듦 = 공짜).'),
  fish('f_mahi', 'fish-mahimahi', '형광이만새기', at(ANY, 'offshore', 'sunset'), 3, 'L/120',
    look('bighead', ['neon', 'yellow', 'yellow'], 'grad'), '너무 밝아서 선글라스 필요.'),
  fish('f_tuna', 'fish-tuna', '참치마요', at(ANY, 'offshore', 'day'), 3, 'XL/200',
    look('long', ['navy', 'silver', 'yellow'], 'grad'), '이름 때문에 늘 긴장.'),
  fish('f_marlin', 'fish-marlin', '창코청새치', at(ANY, 'offshore', 'day', boost(3, 'storm')), 4, 'XXL/300',
    look('long', ['blue', 'sky', 'sky'], 'stripe', { parts: ['spear'] }), '창으로 수평선을 가리킨다.'),
  fish('f_hammerhead', 'fish-hammerhead', '망치머리귀상어', at(ANY, 'offshore', 'night'), 4, 'XL/350',
    look('shark', ['slate', 'white', 'slate'], 'none', { parts: ['t-head'] }), '머리로 못을 박을 줄 안다.', { tags: ['scary'] }),
  fish('f_sunfish', 'fish-sunfish', '쿠크다스개복치', at(ANY, 'offshore', 'day', only('clear')), 4, 'XXL/250',
    look('sunfish', ['slate', 'white', 'slate'], 'grad'), '쉽게 상처받는다. 다정하게.'),
  fish('f_whaleshark', 'fish-whale-shark', '점박이큰형고래상어', at(ANY, 'offshore', 'morning', only('rainbow', 'clear')), 5, 'XXL/1000',
    look('whaleshark', ['navy', 'white', 'white'], 'spots'), '덩치는 제일 큰데 플랑크톤만 먹음.'),
  fish('f_oarfish', 'fish-oarfish', '용궁리본산갈치', at(ANY, 'offshore', 'night', only('storm')), 5, 'XXL/800',
    look('eel', ['silver', 'white', 'red'], 'none', { parts: ['crest'], deco: ['long-body'] }), '용궁에서 온 리본 체조 선수.'),
];

export const DEEP_FISH: FishDef[] = [
  fish('f_glass_jelly', 'fish-deep-jelly', '유리종해파리', at(ANY, 'deep'), 2, 'S/15',
    look('jelly', ['sky', 'white', 'sky'], 'none', { clear: true, glow: true }), '투명한 종 모양 등불.', P1),
  fish('f_anglerfish', 'fish-anglerfish', '등불이초롱아귀', at(ANY, 'deep', 'night'), 3, 'M/40',
    look('angler', ['ink', 'lavender', 'pink'], 'none', { parts: ['lantern-heart'] }), '초롱이 꺼지면 운다.', { ...P1, tags: ['scary'] }),
  fish('f_blobfish', 'fish-blobfish', '말랑젤리씨블롭피시', at(ANY, 'deep'), 3, 'S/30',
    look('round', ['lightPink', 'lightPink', 'pink'], 'none', { deco: ['melty'] }), '물 밖에선 우울해 보이지만 사실 행복.', P1),
  fish('f_giant_isopod', null, '데굴이대왕공벌레', at(ANY, 'deep', 'night'), 3, 'M/35',
    look('isopod', ['grey', 'silver', 'slate'], 'none'), '놀라면 데굴데굴.', P1),
  fish('f_dumbo', 'fish-dumbo', '귀큰이덤보문어', at(ANY, 'deep'), 4, 'S/20',
    look('octopus', ['pink', 'lightPink', 'coral'], 'none', { parts: ['ear-fins'] }), '귀로 헤엄친다.', P1),
  fish('f_barreleye', 'fish-barreleye', '유리머리배럴아이', at(ANY, 'deep', 'night'), 4, 'S/15',
    look('long', ['ink', 'slate', 'green'], 'none', { parts: ['dome-head'] }), '머릿속이 훤히 보인다. 아무 생각 없음.', P1),
  fish('f_goblin_shark', null, '코쭉이고블린상어', at(ANY, 'deep', 'night'), 4, 'L/300',
    look('shark', ['pink', 'lightPink', 'coral'], 'none', { parts: ['snout-long'] }), '코가 길어서 늘 먼저 도착.', { ...P1, tags: ['scary'] }),
  fish('f_giant_squid', 'fish-giant-squid', '심해대장대왕오징어', at(ANY, 'deep', 'night', only('storm')), 5, 'XXL/1200',
    look('squid', ['red', 'apricot', 'coral'], 'spots', { eye: 1.6 }), '눈이 축구공만 하다.', P1),
  fish('f_baby_megalodon', null, '메갈로돈아기', at(ANY, 'deep'), 5, 'XXL/500',
    look('shark', ['slate', 'white', 'slate'], 'none', { deco: ['big-smile'] }), '아기라는데 배보다 크다.', { ...P1, tags: ['scary'] }),
];
