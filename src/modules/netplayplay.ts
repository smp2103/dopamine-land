// netplay-play — 친구 방문 놀이(GDD 4.15 · 4.4 친구 섬 시세 · 5.4 방문객 상자). netplay(order 60)의 game.ext.net 위에 얹는다.
// 모든 쪽지는 netplay 'app' 통로의 'np' 칸으로 오간다(netplayplay/logic.ts decodeMsg 가 거른다).
//
// 들어 있는 것
//   방문객 상자   방장 섬 광장(꽥사장 가게 동쪽)에 하루 1번 풍선 상자 → 손님이 E → 방장이 확인 → 손님 쪽 econ.openChest('wood', 'visitor')
//   친구 섬 시장   손님이 방장 섬 꽥사장 앞에서 F → 방장의 priceOf(id, {where:'friend'}) 시세로 판다(Y → 친구 섬 시장)
//   손님 보너스   연결되면 손님 쪽 ext.net.visiting = true(netplay 도 켠다) + 둘 다 'friend' 버프(★3+ ×1.1, econ.addBuff)
//   레이스        자전거·배·달리기 체크포인트 코스(말랑섬) — 순서대로만 센다, 3·2·1 출발, 빠른 쪽 승
//   낚시 대회      10분 동안 잡은 물고기 길이(cm) 합
//   티노 살금살금  친구 발소리도 내 티노 소음 게이지에 얹는다(같이 보는 게이지) · 둘이 꼭대기까지 몰래 가면 반짝별
//   협동 릴        fishing 의 'net-coop' {kind:'reel'} 신호를 듣고 친구가 줄다리기하면 알려 준다(돕기 E 는 fishing 이 단다)
//   협동 보스      모사사우루스(먼바다·심해) · 산갈치(밤/비바람 바다) · 하늘고래(우주) — 방장이 HP 주인, 둘이 같이 쳐야 깎인다
//   도감 교환      제안 → 수락(돌려줄 종 고르기) → 받은 종은 flags.net.dexFrom[id] = {name, day} "○○가 준 친구"
//   숨바꼭질      초대한 쪽이 술래 — 30초 눈 가리기 → 150초 찾기(따뜻따뜻 힌트, 멀면 친구가 안 보인다)
//   불꽃놀이      펑! 친구 화면에도 같은 자리·같은 씨앗으로
//   ★5 알림       내가 ★5 를 잡으면 친구 화면에 배너
//   2인 탈것      친구가 2인승(자전거·카트·요트·열기구)을 타면 곁에서 E → 뒷자리. 자전거는 둘 다 W → ×1.3(vehicles.setPassenger pedal + ext.net.coPedal)
//   칭호          친구와 처음 로켓을 쏘면 「우주 단짝」 등(flags.net.play.titles)
//   하트 짝       둘이 같은 물가(30m 안) → ext.net.boostTags['friend-boost'] = 2 (하트잉어 태그)
//
// 채우는 것: ext.net.visiting(손님) · ext.net.boostTags · ext.net.coPedal — ext.net 의 주인은 netplay, 이 칸들은 netplay 머리글이 이 모듈 몫으로 비워 둔 것.
// flags.net.play = { chest{day, by}, visited{host: day}, titles[], wins{}, daily{day, n}, boss{kind: day}, duo, launched }
// flags.net.dexFrom = { [speciesId]: {name, day} }   — "○○가 준 친구"
// 창: Y(또는 🎡 칩) '같이 놀기' — 놀이 · 친구 섬 시장 · 도감 교환 · 칭호
// window.__netplayplay = { play, state(), invite(g), answer(ok), quit(), chest(), market(), sell(id,n), boss(kind), mash(n), offerDex(id), acceptDex(back),
//                          firework(), ride(), course(kind), goto(where), demo() }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import * as Island from '../core/island';
import { NetPlay, type TinoHandle } from './netplayplay/play';
import { ThreeView } from './netplayplay/view';
import { registerPlayUi } from './netplayplay/panel';
import { COURSES, VISITOR_CHEST, BOSSES, type GameKind, type BossKind, type RaceKind } from './netplayplay/logic';

export const order = 61;

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const dbg = () => (globalThis as unknown as { __net?: { avatar?: () => { root?: THREE.Object3D } | null }; __dinos?: { tinoNpc?: TinoHandle } });
  const view = new ThreeView(ctx.scene, (x, z) => game.groundAt(x, z));
  const play = new NetPlay(game, {
    view,
    // 친구 아바타(ext.net.avatar)·티노(ext.tino) — 없으면 디버그 손잡이로, 그것도 없으면 그 기능만 쉰다
    avatar: () => (game.ext.net?.avatar?.() as { root?: THREE.Object3D } | null | undefined)?.root ?? dbg().__net?.avatar?.()?.root ?? null,
    tino: () => {
      const t = (game.ext.tino as TinoHandle | undefined) ?? dbg().__dinos?.tinoNpc;
      return t && t.m && typeof t.m.gauge === 'number' ? t : null;
    },
  });
  play.wire();
  registerPlayUi(game, play);
  game.onUpdate((t, dt) => play.update(t, dt));

  (globalThis as unknown as { __netplayplay?: unknown }).__netplayplay = {
    play,
    state: () => ({
      connected: play.connected, role: play.role, status: play.status(), run: play.run ? { kind: play.run.kind, id: play.run.id, phase: (play.run as { phase: string }).phase } : null,
      invite: play.invite, chestOn: play.chestOn, boss: play.bossView, heart: play.heart, boostTags: { ...(game.ext.net?.boostTags ?? {}) },
      ride: !!play.ride, passenger: !!play.passenger, peerDrive: play.peerDrive, flags: play.flags(), dexFrom: play.dexFrom(), peerDex: play.peerDex.size,
    }),
    invite: (g: GameKind) => play.inviteTo(g),
    answer: (ok = true) => play.answer(ok),
    quit: () => play.quitRun(),
    chest: () => play.openVisitorChest(),
    market: () => { play.askQuote(true); return play.marketRows(); },
    sell: (id: string, n = 1) => play.sellFriend(id, n),
    boss: (kind: BossKind) => play.callBoss(kind),
    mash: (n = 10) => { let k = 0; for (let i = 0; i < n; i++) if (play.bossMash()) k++; return k; },
    offerDex: (id: string) => play.offerDex(id),
    acceptDex: (back: string | null = null) => play.acceptDex(back),
    firework: () => play.firework(),
    ride: () => play.askRide(),
    course: (kind: RaceKind = 'bike') => COURSES[kind],
    bosses: BOSSES,
    /** 놀이 자리로 순간이동: 'chest' · 'shop' · 'bike' · 'boat' · 'run' · 'tino' · 'sea' */
    goto: (where: string) => {
      const P = Island.PLACES;
      const spot = where === 'chest' ? { x: VISITOR_CHEST.x + 1.5, z: VISITOR_CHEST.z + 1.5 }
        : where === 'shop' ? { x: P.shop.x, z: P.shop.z + 4 }
          : where === 'tino' ? { x: P.tinoHill.x + 14, z: P.tinoHill.z + 4 }
            : where === 'sea' ? { x: 260, z: 380 }
              : COURSES[where as RaceKind]?.cps[0] ?? null;
      if (!spot) return null;
      game.player.teleport(spot.x, spot.z);
      return spot;
    },
    /** 혼자 보기: netplay 데모 친구를 붙인다(같은 메모리 끈 — 'np' 쪽지는 데모 친구가 대답하지 않는다) */
    demo: () => (globalThis as unknown as { __net?: { demo?: () => unknown } }).__net?.demo?.(),
  };
}
