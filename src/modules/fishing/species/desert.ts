// GDD 3.5.7 모래시계섬(oasis·ruin·cave·dune) 9종.
// 모래 낚시(dune)는 P1 — P0 에서는 dune 종을 오아시스 후보에 같이 넣는다(조건은 그대로) → oasis 줄을 하나 더 단다.
import { at, boost, fish, look, only, type FishDef } from './def';
import type { FishWhere } from '../data';

const S = 'desert';
/** dune 줄 + 같은 조건의 oasis 줄(P0 대체 출현) */
const dune = (time = 'all', w?: ReturnType<typeof only>): FishWhere[] => [...at(S, 'dune', time, w), ...at(S, 'oasis', time, w)];

export const DESERT_FISH: FishDef[] = [
  fish('f_sand_medaka', 'fish-pupfish', '모래알송사리', at(S, 'oasis'), 1, 'XS/4',
    look('long', ['sand', 'cream', 'beige'], 'none', { eye: 1.2 }), '모래 위에 서면 사라진다.'),
  fish('f_hump_crucian', null, '쌍봉붕어', at(S, 'oasis', 'day'), 2, 'S/18',
    look('round', ['apricot', 'cream', 'orange'], 'grad', { parts: ['hump2'] }), '물을 혹에 저장한다고 믿음.'),
  fish('f_cactus_puffer', null, '선인장복어', at(S, 'oasis', 'day', boost(2, 'clear')), 2, 'S/20',
    look('puffer', ['green', 'lime', 'pink'], 'none', { parts: ['spikes', 'flower'] }), '부풀면 꽃이 핀다.'),
  fish('f_cave_fish', null, '장님동굴고기', at(S, 'cave'), 3, 'S/12',
    look('long', ['lightPink', 'white', 'pink'], 'none', { clear: true, deco: ['blind'] }), '앞은 못 봐도 반짝이는 건 안다.'),
  fish('f_mirror_fish', null, '거울고기', at(S, 'oasis', 'noon', only('clear')), 3, 'S/20',
    look('tall', ['silver', 'white', 'sky'], 'chrome'), '너를 비춰 준다.'),
  fish('f_sand_shark', null, '꼬마모래상어', dune('day'), 3, 'L/120',
    look('shark', ['sand', 'white', 'beige'], 'none'), '모래 속 술래잡기 챔피언.'),
  fish('f_mummy_catfish', null, '붕대씨미라메기', at(S, 'ruin', 'night'), 4, 'M/60',
    look('bighead', ['white', 'beige', 'brown'], 'bandage', { parts: ['whiskers2'] }), '붕대는 패션이다.'),
  fish('f_scarab_koi', null, '황금스카라브잉어', at(S, 'ruin', 'night', only('clear'), 'full'), 5, 'L/70',
    look('long', ['gold', 'cream', 'teal'], 'scales', { deco: ['gem'] }), '신전의 수호자(라고 본인이 말함).'),
  fish('f_sand_whale', null, '모래고래', dune('all', only('sandstorm')), 5, 'XXL/600',
    look('whale', ['sand', 'cream', 'apricot'], 'hstripe'), '모래 위를 헤엄친다.'),
];
