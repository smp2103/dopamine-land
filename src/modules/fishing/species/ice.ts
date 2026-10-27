// GDD 3.5.5 솜눈섬(icehole·icelake·icesea) 10종.
import { at, boost, fish, look, only, type FishDef } from './def';

const I = 'ice';

export const ICE_FISH: FishDef[] = [
  fish('f_smelt', 'fish-bingeo', '얼음사탕빙어', at(I, 'icehole', 'morning'), 1, 'XS/8',
    look('long', ['sky', 'white', 'sky'], 'none', { clear: true, deco: ['bones'], eye: 1.15 }), '투명해서 뼈가 보이는데 귀엽다.'),
  fish('f_cod', 'fish-daegu', '덜덜대구', at(I, 'icesea'), 1, 'M/60',
    look('bighead', ['slate', 'white', 'red'], 'none', { deco: ['scarf'] }), '늘 추워서 떤다.'),
  fish('f_char', 'fish-arctic-char', '북극곤들매기', at(I, 'icelake', 'day'), 2, 'M/50',
    look('long', ['green', 'apricot', 'orange'], 'spots'), '얼음 밑 패셔니스타.'),
  fish('f_hair_crab', null, '보송게털게', at(I, 'icesea', 'night'), 2, 'S/15',
    look('crab', ['apricot', 'cream', 'brown'], 'none', { claws: true, parts: ['fluffy'] }), '털옷 입은 게.'),
  fish('f_baby_salmon', null, '꼬마연어', at(I, 'icelake', 'sunset'), 2, 'S/25',
    look('long', ['silver', 'white', 'pink'], 'band', { eye: 1.15 }), '크면 폭포를 탈 거래.'),
  fish('f_snowball_puffer', null, '눈뭉치복어', at(I, 'icehole', 'all', only('snow')), 3, 'S/20',
    look('puffer', ['white', 'white', 'sky'], 'none', { parts: ['carrot-nose'], deco: ['snowman'] }), '눈사람인 척하는 복어.'),
  fish('f_clione', 'fish-clione', '바다천사크리오네', at(I, 'icesea', 'night'), 3, 'XS/3',
    look('tadpole', ['white', 'white', 'orange'], 'none', { clear: true, wings: true, deco: ['heart-core'] }), '날갯짓 한 번에 천사.'),
  fish('f_aurora_trout', 'fish-aurora-trout', '오로라송어', at(I, 'icelake', 'night', only('aurora')), 4, 'M/45',
    look('long', ['mint', 'lavender', 'pink'], 'huecycle', { glow: true }), '보는 사람마다 다른 색이라고 우긴다.'),
  fish('f_king_crab', 'fish-king-crab', '대왕킹크랩', at(I, 'icesea', 'night', boost(3, 'snow')), 4, 'L/100',
    look('crab', ['red', 'cream', 'coral'], 'none', { claws: true, parts: ['legs-long'], deco: ['bumpy'] }), '왕이라서 옆으로도 위엄 있게.'),
  fish('f_narwhal', null, '뿔뿔고래일각돌고래', at(I, 'icesea', 'night', only('aurora')), 5, 'XXL/450',
    look('whale', ['slate', 'white', 'white'], 'spots', { parts: ['spiral-horn'] }), '뿔로 별을 콕 찌르는 게 취미.'),
];
