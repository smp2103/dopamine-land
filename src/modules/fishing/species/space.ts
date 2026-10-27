// GDD 3.5.11 우주 물고기 11종 — 토끼달 연못(moonpond, P0 5종) + 구름바다·젤리바다·블랙홀(P1 데이터 6종).
// 전부 'space-goods'(지구에서 팔면 ×1.8). 달 연못은 island 'moon', 시간은 우주 시계(지구가 뜰 때 = night).
import { at, boost, fish, look, type FishDef } from './def';

const MOON = 'moon';
const SG = ['space-goods'];
const P1 = { p1: true, tags: SG };

export const SPACE_FISH: FishDef[] = [
  // 떡처럼 말랑 — squish 2.5 배로 숨쉰다
  fish('f_mochi_crucian', null, '떡붕어', at(MOON, 'moonpond'), 1, 'S/15',
    look('round', ['white', 'white', 'pink'], 'none', { deco: ['mochi'], squish: 2.5 }), '떡처럼 늘어난다.', { tags: SG }),
  fish('f_comet_minnow', null, '혜성피라미', at(MOON, 'moonpond'), 2, 'XS/10',
    look('long', ['silver', 'white', 'sky'], 'grad', { parts: ['light-tail'], glow: true }), '지나간 자리에 빛줄기.', { tags: SG }),
  fish('f_moonlight_jelly', null, '월광파리', at(MOON, 'moonpond', 'night'), 2, 'S/15',
    look('jelly', ['silver', 'white', 'sky'], 'none', { glow: true, clear: true }), '달빛을 마셔서 빛난다.', { tags: SG }),
  fish('f_rabbit_fish', null, '떡방아물고기', at(MOON, 'moonpond'), 3, 'S/20',
    look('round', ['white', 'white', 'pink'], 'none', { deco: ['rabbit-ears', 'mochi'] }), '꼬리로 방아를 찧는다.', { tags: SG }),
  fish('f_crater_turtle', null, '크레이터거북', at(MOON, 'moonpond'), 4, 'M/50',
    look('turtle', ['grey', 'cream', 'gold'], 'spots', { deco: ['crater-shell'] }), '등에 작은 달을 지고 다닌다.', { tags: SG }),
  fish('f_galaxy_tail', null, '갤럭시꼬리금붕어', at('cloud', 'cloudsea'), 3, 'S/15',
    look('round', ['navy', 'purple', 'pink'], 'galaxy', { fancy: true, deco: ['galaxy-tail'] }), '꼬리에 은하 하나를 키운다.', P1),
  fish('f_candy_puffer', null, '별사탕복어', at('cloud', 'cloudsea', 'all', boost(3, 'meteor')), 3, 'S/20',
    look('puffer', ['lightPink', 'white', 'sky'], 'none', { parts: ['spikes'], deco: ['candy-tips'] }), '부풀면 달콤한 냄새.', P1),
  fish('f_cloud_whale_baby', null, '구름고래아기', at('cloud', 'cloudsea', 'sunset'), 4, 'L/150',
    look('whale', ['white', 'white', 'sky'], 'none', { parts: ['fluffy'] }), '엄마는 하늘고래.', P1),
  fish('f_jelly_salmon', null, '젤리연어', at('jelly', 'jellysea', 'day'), 3, 'M/50',
    look('long', ['pink', 'lightPink', 'pink'], 'none', { clear: true, deco: ['upside-down'] }), '탱글탱글 거꾸로 헤엄친다.', P1),
  fish('f_ring_ray', null, '고리가오리', at('jelly', 'jellysea'), 4, 'L/120',
    look('ray', ['lavender', 'white', 'gold'], 'none', { parts: ['ring'] }), '몸에 행성 고리를 두르고 다닌다.', P1),
  // '일식' = 새달 창(moonPhase < 0.04 또는 > 0.96)
  fish('f_blackhole_sunfish', null, '블랙홀개복치', at('blackhole', 'blackhole', 'all', undefined, 'eclipse'), 5, 'XL/300',
    look('sunfish', ['ink', 'purple', 'purple'], 'none', { glow: true, deco: ['glow-ring'] }), '미끼를 다 빨아들인다. 낚싯대 조심.', P1),
];
