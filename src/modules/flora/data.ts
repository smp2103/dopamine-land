// 식물에서 얻는 아이템(도감·상점이 읽는다).
export type WFruit = 'apple' | 'peach' | 'orange' | 'pear' | 'cherry';

export const FRUIT_ITEMS: Record<WFruit, { id: string; name: string; josa: string; price: number }> = {
  apple: { id: 'fruit-apple', name: '사과', josa: '가', price: 100 },
  peach: { id: 'fruit-peach', name: '복숭아', josa: '가', price: 100 },
  orange: { id: 'fruit-orange', name: '오렌지', josa: '가', price: 100 },
  pear: { id: 'fruit-pear', name: '배', josa: '가', price: 100 },
  cherry: { id: 'fruit-cherry', name: '체리', josa: '가', price: 100 },
};

/** 나무 흔들기로 얻는 그 밖의 아이템 */
export const FLORA_ITEMS = [
  ...Object.values(FRUIT_ITEMS).map((f) => ({ id: f.id, name: f.name, price: f.price })),
  { id: 'beehive', name: '벌집', price: 500 },
];
