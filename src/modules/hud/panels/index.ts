// 기본 패널을 game.hud 에 등록한다(도감·가방·상점·제작·박물관·게시판 + 큰 지도). 그리기는 렌더러가 아니라 각 패널의 render 가.
// 같은 kind 를 다른 모듈이 먼저 넣었으면(registerPanel 이 false) 그쪽을 그대로 둔다.
import type { Game } from '../../../core/game';
import type { PanelDef } from '../../../core/api';
import { makeLook, type Look, type PanelEnv } from './common';
import { dexPanel } from './dex';
import { bagPanel } from './bag';
import { shopPanel } from './shop';
import { craftPanel } from './craft';
import { museumPanel } from './museum';
import { boardPanel } from './board';
import { mapPanel, MAP_PANEL, type MapPanel } from './map';
import type { Thumbs } from '../thumbs';
import type { IslandShapes } from '../map';

export { makeLook, MAP_PANEL, type Look, type PanelEnv, type MapPanel };

export function registerBuiltinPanels(game: Game, look: Look = makeLook(game), extra: { thumbs?: Thumbs | null; shapes?: IslandShapes | null } = {}): { defs: PanelDef[]; map: MapPanel } {
  const env: PanelEnv = { game, look, thumbs: extra.thumbs ?? null, shapes: extra.shapes ?? null };
  const map = mapPanel(env);
  const defs: PanelDef[] = [dexPanel(env), bagPanel(env), shopPanel(env), craftPanel(env), museumPanel(env), boardPanel(env), map];
  for (const d of defs) game.hud.registerPanel(d);
  return { defs, map };
}
