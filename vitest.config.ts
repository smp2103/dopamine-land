// 테스트 설정 — 화면 없는 node 환경. 브라우저 대역은 tests/kit(storage·fakeGame·three)이 깐다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
  },
});
