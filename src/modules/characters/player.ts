// 플레이어(주인공 '말랑' 젤리 아이): 키 ≈1.3 m, 꾸미기(머리 모양·색·눈·옷·모자)로 모습이 바뀐다.
// 실제 모델·움직임은 characters/player/(rig · body · hair · face · mats · look)에 있다 — 이 파일은 바깥에 보이는 약속만 모아 둔다.
// 동작(game.player.action, 계약 v2 3장): fish cast reel net dig shake chop hit pick pet hold cheer stung sit sleep eat wave photo plant water peace.
// 들어 올리기(hold)는 깜짝 → '> <', 만세(cheer)는 '> <' + 진한 볼(GDD 7.2), 벌에 쏘이면(stung) 볼이 퉁퉁 + 빙글 눈 + 어질어질 별.
// 부수효과 없는 빌더(다른 모듈이 buildPlayer 를 import 해도 된다).
export { buildPlayer, PLAYER_POSES, type PlayerRig, type PoseState, type Rig, type StudioExpr } from './player/rig';
export {
  DEFAULT_LOOK, LOOK_PRESETS, cleanLook, sameLook, encodeLook, decodeLook, lookFromColors, colorsFromLook,
  SKINS, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, OUTFITS, OUTFIT_COLORS, HATS, type PlayerLook,
} from './player/look';
