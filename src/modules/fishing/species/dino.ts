// GDD 3.5.4 쿵쿵공룡섬(footprint·hotspring·ancientlake·swamp) 10종 — 고대어는 'ancient' 태그(세트 '고대').
import { at, fish, look, only, type FishDef } from './def';

const D = 'dino';

export const DINO_FISH: FishDef[] = [
  fish('f_footprint_minnow', null, '발자국피라미', at(D, 'footprint'), 1, 'XS/6',
    look('long', ['lime', 'silver', 'silver'], 'grad', { eye: 1.15 }), '공룡 발자국 웅덩이 원주민.'),
  fish('f_doctorfish', 'fish-doctor-fish', '간질이닥터피쉬', at(D, 'hotspring'), 1, 'XS/5',
    look('long', ['grey', 'white', 'slate'], 'none', { deco: ['pout'] }), '발 담그면 간질간질.'),
  fish('f_trilobite', null, '세잎이삼엽충', at(D, 'ancientlake', 'day'), 2, 'S/10',
    look('isopod', ['brown', 'beige', 'darkBrown'], 'none', { deco: ['trilobe'] }), '3억 년째 엎드려 있다.', { tags: ['ancient'] }),
  fish('f_ammonite', null, '빙글이암모나이트', at(D, 'ancientlake', 'sunset'), 2, 'M/30',
    look('snail', ['cream', 'white', 'brown'], 'hstripe', { parts: ['tentacles6'] }), '빙글빙글 돌면서 생각 중.', { tags: ['ancient'] }),
  fish('f_horseshoe', null, '투구게투구', at(D, 'ancientlake', 'night'), 2, 'M/40',
    look('horseshoe', ['olive', 'beige', 'darkBrown'], 'none'), '투구는 썼는데 싸울 줄 모른다.', { tags: ['ancient'] }),
  // 화산 미끼(bait_volcano)면 ×3 — fishing 이 미끼로 boostTags['bait:volcano'] 를 건다
  fish('f_lava_goldfish', 'fish-lava-medaka', '뜨끈이용암붕어', at(D, 'hotspring'), 3, 'S/20',
    look('round', ['orange', 'yellow', 'red'], 'grad', { glow: true, fancy: true }), '만지면 앗뜨. (화산 미끼면 ×3)', { tags: ['bait:volcano'] }),
  fish('f_sturgeon', 'fish-sturgeon', '갑옷철갑상어', at(D, 'swamp', 'night'), 3, 'L/120',
    look('shark', ['slate', 'white', 'slate'], 'none', { parts: ['plates'] }), '갑옷이 무거워 늘 느긋.', { tags: ['ancient'] }),
  fish('f_coelacanth', 'fish-coelacanth', '살아있는화석씨', at(D, 'ancientlake', 'night'), 4, 'L/150',
    look('long', ['navy', 'sky', 'white'], 'spots', { deco: ['lobe-fins'] }), '멸종했다는 소문에 서운해함.', { tags: ['ancient'] }),
  fish('f_anomalo', null, '아노말', at(D, 'ancientlake', 'all', only('rain')), 4, 'M/60',
    look('isopod', ['pink', 'lightPink', 'coral'], 'none', { deco: ['flaps', 'front-claws'] }), '옛날 바다의 귀여운 깡패.', { tags: ['ancient'] }),
  fish('f_dunkle', null, '철갑턱둔클레오', at(D, 'ancientlake', 'night', only('fog')), 5, 'XL/300',
    look('bighead', ['slate', 'cream', 'silver'], 'chrome', { deco: ['armor'] }), '갑옷 속엔 순한 눈.', { tags: ['ancient', 'scary'] }),
];

