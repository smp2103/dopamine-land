// 스튜디오 전용 '꾸미기 미리보기' 리그: concept:look 으로 부르면 window.__look(모습 객체 · 'L1.' 글자 · 추천 id)의 플레이어를 세운다.
// (게임은 이 파일을 쓰지 않는다 — 꾸민 모습을 시트로 확인하는 용도)
import { buildPlayer, PLAYER_POSES, LOOK_PRESETS, decodeLook, cleanLook, type PlayerRig } from '../player';

export { PLAYER_POSES };

export function build(): PlayerRig {
  const w = (globalThis as { __look?: unknown }).__look;
  const preset = typeof w === 'string' ? LOOK_PRESETS.find((p) => p.id === w)?.look ?? decodeLook(w) : null;
  return buildPlayer(preset ?? cleanLook(w));
}
