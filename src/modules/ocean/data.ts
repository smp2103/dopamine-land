// 바닷속 채집 생물(카테고리 'sea') — 도감·상점이 읽는다.
import type { Species } from '../../core/state';

export type SeaHabitat = 'floor' | 'swim' | 'anemone';

export interface SeaSpecies extends Species {
  /** 모델 키(models.ts) */
  model: string;
  habitat: SeaHabitat;
  /** 이 깊이(m, 양수) 이상에서만 산다 */
  minDepth: number;
  /** 크기 범위(cm) */
  size: [number, number];
  /** 화면 모델 배율 */
  scale: number;
  /** 잡지 않고 만나기만(도감 기록) */
  meetOnly?: boolean;
  line: string;
}

const S = (o: Omit<SeaSpecies, 'category'>): SeaSpecies => ({ category: 'sea', ...o });

export const SEA_SPECIES: SeaSpecies[] = [
  S({ id: 'sea-cucumber', name: '해삼', rarity: 1, price: 120, model: 'cucumber', habitat: 'floor', minDepth: 1.5, size: [12, 30], scale: 1, desc: '말랑말랑 바닥 청소부.', line: '해삼 해삼~ 오늘도 바닥은 반짝반짝!' }),
  S({ id: 'sea-abalone', name: '전복', rarity: 2, price: 600, model: 'abalone', habitat: 'floor', minDepth: 2, size: [6, 14], scale: 1, desc: '무지갯빛 껍데기를 숨기고 있다.', line: '전복이다! 전부 복 받을 거야!' }),
  S({ id: 'sea-urchin', name: '성게', rarity: 1, price: 150, model: 'urchin', habitat: 'floor', minDepth: 1.2, size: [5, 10], scale: 1, desc: '가시는 따끔, 속은 말랑.', line: '성게 잡았다! 성게… 성공했게!' }),
  S({ id: 'sea-octopus', name: '문어', rarity: 2, price: 500, model: 'octopus', habitat: 'floor', minDepth: 3, size: [30, 80], scale: 1, desc: '다리가 여덟 개라 포옹도 여덟 번.', line: '문어다! 문득 어깨춤이 나와!' }),
  S({ id: 'sea-webfoot', name: '주꾸미', rarity: 1, price: 220, model: 'webfoot', habitat: 'floor', minDepth: 1.5, size: [10, 20], scale: 0.7, desc: '작고 통통한 봄의 별미.', line: '주꾸미 잡았다! 쭈욱 쭈욱~' }),
  S({ id: 'sea-squid', name: '오징어', rarity: 2, price: 400, model: 'squid', habitat: 'swim', minDepth: 4, size: [20, 40], scale: 1, desc: '먹물 대신 반짝임을 뿜는다.', line: '오징어다! 오늘 징~하게 운이 좋아!' }),
  S({ id: 'sea-seahorse', name: '해마', rarity: 3, price: 1100, model: 'seahorse', habitat: 'swim', minDepth: 2, size: [8, 18], scale: 1, desc: '아빠가 알을 품는 다정한 물고기.', line: '해마 잡았다! 해맑게 웃는 해마!' }),
  S({ id: 'sea-goldhorse', name: '황금 해마', rarity: 5, price: 12000, model: 'goldhorse', habitat: 'swim', minDepth: 8, size: [10, 20], scale: 1.1, desc: '바다의 행운을 몰고 다닌다는 전설.', line: '황금 해마!! 오늘 운 다 썼다!' }),
  S({ id: 'sea-scallop', name: '가리비', rarity: 1, price: 200, model: 'scallop', habitat: 'floor', minDepth: 1.2, size: [7, 15], scale: 1, desc: '파닥파닥 헤엄치는 조개.', line: '가리비 잡았다! 가리지 말고 비춰 줘~' }),
  S({ id: 'sea-pearl', name: '진주조개', rarity: 4, price: 5000, model: 'pearl', habitat: 'floor', minDepth: 5, size: [8, 16], scale: 1, desc: '천 개 중 하나에 진주가 있다.', line: '진주조개!! 진짜 주인공 등장!' }),
  S({ id: 'sea-oyster', name: '굴', rarity: 1, price: 140, model: 'oyster', habitat: 'floor', minDepth: 1, size: [6, 14], scale: 1, desc: '울퉁불퉁 바다의 우유.', line: '굴 잡았다! 굴러 들어온 복!' }),
  S({ id: 'sea-mussel', name: '홍합', rarity: 1, price: 100, model: 'mussel', habitat: 'floor', minDepth: 1, size: [5, 10], scale: 1, desc: '바위에 꼭 붙어 사는 단짝.', line: '홍합이다! 홍~ 합격!' }),
  S({ id: 'sea-giantclam', name: '대왕조개', rarity: 4, price: 4200, model: 'giantclam', habitat: 'floor', minDepth: 6, size: [40, 90], scale: 1, desc: '입술이 형광빛으로 빛난다.', line: '대왕조개! 대왕님 납시오!' }),
  S({ id: 'sea-crab', name: '꽃게', rarity: 1, price: 250, model: 'crab', habitat: 'floor', minDepth: 0.8, size: [8, 20], scale: 1, desc: '옆으로 걸어도 마음은 직진.', line: '꽃게 잡았다! 꽃처럼 예쁜 게!' }),
  S({ id: 'sea-hermit', name: '소라게', rarity: 2, price: 450, model: 'hermit', habitat: 'floor', minDepth: 0.8, size: [4, 9], scale: 0.85, desc: '집이 작아지면 이사를 간다.', line: '소라게! 집까지 통째로 데려왔어!' }),
  S({ id: 'sea-lobster', name: '랍스터', rarity: 3, price: 1800, model: 'lobster', habitat: 'floor', minDepth: 5, size: [25, 50], scale: 1, desc: '빨간 갑옷의 바다 기사.', line: '랍스터다! 랍스타~ 오늘의 스타!' }),
  S({ id: 'sea-shrimp', name: '새우', rarity: 1, price: 160, model: 'shrimp', habitat: 'swim', minDepth: 1.5, size: [5, 12], scale: 0.8, desc: '등은 굽어도 꿈은 크다.', line: '새우 잡았다! 새우깡은 아니야!' }),
  S({ id: 'sea-jelly', name: '해파리', rarity: 2, price: 380, model: 'jelly', habitat: 'swim', minDepth: 3, size: [10, 30], scale: 1, desc: '말랑하게 떠다니는 바다의 풍선.', line: '해파리다! 해~ 파릇파릇!' }),
  S({ id: 'sea-moonjelly', name: '보름달물해파리', rarity: 3, price: 900, model: 'moonjelly', habitat: 'swim', minDepth: 6, size: [15, 35], scale: 1.1, desc: '등에 네잎클로버 무늬가 있다.', line: '보름달물해파리! 달님이 바다에 떴네!' }),
  S({ id: 'sea-turtle', name: '바다거북', rarity: 3, price: 0, model: 'turtle', habitat: 'swim', minDepth: 4, size: [70, 120], scale: 1, meetOnly: true, desc: '천천히, 하지만 아주 멀리 간다. (만나기만 해요)', line: '바다거북이 인사해 줬다! 거북~ 반가워!' }),
  S({ id: 'sea-puffer', name: '복어', rarity: 2, price: 550, model: 'puffer', habitat: 'swim', minDepth: 2, size: [8, 20], scale: 1, desc: '놀라면 동그랗게 부푼다.', line: '복어 잡았다! 복이 어~ 가득!' }),
  S({ id: 'sea-clownfish', name: '흰동가리', rarity: 2, price: 650, model: 'clown', habitat: 'anemone', minDepth: 1.5, size: [6, 11], scale: 1, desc: '말미잘 집에 사는 줄무늬 꼬마.', line: '흰동가리! 집 앞에서 딱 만났다!' }),
  S({ id: 'sea-ray', name: '가오리', rarity: 3, price: 1500, model: 'ray', habitat: 'swim', minDepth: 5, size: [40, 100], scale: 1, desc: '바닷속을 나는 연.', line: '가오리다! 가오~ 살아있네!' }),
  S({ id: 'sea-starfish', name: '불가사리', rarity: 1, price: 90, model: 'starfish', habitat: 'floor', minDepth: 0.6, size: [8, 20], scale: 1, desc: '바닷속에 떨어진 별.', line: '불가사리! 소원을 하나 빌어 볼까?' }),
  S({ id: 'sea-conch', name: '소라', rarity: 1, price: 180, model: 'conch', habitat: 'floor', minDepth: 1, size: [6, 14], scale: 1, desc: '귀에 대면 파도 소리가 난다.', line: '소라 잡았다! 소라소라~ 노래해!' }),
  S({ id: 'sea-nudibranch', name: '갯민숭달팽이', rarity: 3, price: 1300, model: 'nudi', habitat: 'floor', minDepth: 3, size: [3, 8], scale: 0.9, desc: '바다에서 제일 화려한 옷을 입었다.', line: '갯민숭달팽이! 패션 왕 등장!' }),
  S({ id: 'sea-squirt', name: '멍게', rarity: 1, price: 170, model: 'squirt', habitat: 'floor', minDepth: 1.5, size: [6, 14], scale: 1, desc: '멍~ 하니 바위에 앉아 있다.', line: '멍게 잡았다! 멍하니 있다 잡혔게!' }),
];

/** 출현 가중치(희귀도별) */
export const RARITY_WEIGHT = [0, 40, 20, 8, 3, 0.6];
