import { defineConfig } from 'vite';

// 첫 실행 속도(웨이브 7):
// - optimizeDeps.include: 무거운 바깥 패키지를 서버가 뜰 때 미리 묶는다 → 첫 접속 중 '새 의존성 발견 → 다시 묶고 새로고침' 이 없다
// - server.warmup: 서버가 뜨자마자 우리 소스를 미리 변환해 둔다 → 첫 접속 때 수백 개 파일 변환을 기다리지 않는다
// - rapier(물리 wasm 을 품은 JS, 약 4.3MB)는 원래 큰 덩어리라 크기 경고 기준을 그에 맞춘다
export default defineConfig({
  server: {
    port: 5180, strictPort: true, host: '127.0.0.1',
    warmup: { clientFiles: ['./src/main.ts', './src/core/*.ts', './src/modules/*.ts', './src/modules/**/*.ts'] },
  },
  optimizeDeps: {
    include: [
      'three',
      'three/addons/controls/OrbitControls.js',
      'three/addons/utils/BufferGeometryUtils.js',
      'three/addons/geometries/RoundedBoxGeometry.js',
      'postprocessing',
      'n8ao',
      'lil-gui',
      '@dimforge/rapier3d-compat',
      'simplex-noise',
    ],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4600 },
});
