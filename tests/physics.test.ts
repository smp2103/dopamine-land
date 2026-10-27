// 물리: 부력이 쌓이지 않는지, 프레임이 밀려도 물리가 빨리 감기지 않는지.
import { describe, it, expect, beforeAll } from 'vitest';
import { Physics } from '../src/core/physics';

let P: Physics;
beforeAll(async () => {
  P = new Physics();
  await P.init();
  P.waterLevel = () => 0; // 어디나 수면 높이 0
});

/** 실제 게임처럼 dt 를 잘라 가며 seconds 만큼 돌린다 */
const run = (seconds: number, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) P.update(dt); };

describe('부력', () => {
  it('과일(밀도 0.8, 부력 1.6)은 수면 근처에 떠 있는다', () => {
    const b = P.add({ shape: { kind: 'ball', r: 0.3 }, position: { x: 0, y: 2, z: 0 }, density: 0.8, buoyancy: 1.6, linearDamping: 0.3 });
    run(10);
    const y = b.body.translation().y;
    expect(y).toBeGreaterThan(-0.5);
    expect(y).toBeLessThan(0.5);
    expect(Math.abs(b.body.linvel().y)).toBeLessThan(0.5);
    b.remove();
  });

  it('물 밖으로 나오면 남은 힘 없이 다시 떨어진다', () => {
    const b = P.add({ shape: { kind: 'ball', r: 0.3 }, position: { x: 5, y: -1, z: 0 }, density: 0.8, buoyancy: 1.6 });
    run(1);
    // 물이 사라지면(마른 땅) 부력 없이 중력만 받아야 한다
    P.waterLevel = () => -Infinity;
    const y0 = b.body.translation().y;
    run(0.5);
    expect(b.body.translation().y).toBeLessThan(y0);
    P.waterLevel = () => 0;
    b.remove();
  });
});

describe('고정 스텝', () => {
  it('느린 프레임이 길게 이어져도 밀린 시간을 쌓아 두지 않는다', () => {
    for (let i = 0; i < 600; i++) P.update(0.1); // 10fps 로 1분
    expect(P.accumulator).toBeLessThan(P.step);
  });
});
