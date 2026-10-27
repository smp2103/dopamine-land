// netplay — 친구 방문(GDD 4.15, 방장 P2P). 서버 없이 WebRTC 데이터 채널을 "코드 복사·붙여넣기"로 잇는다(CONTRACT 4).
// 들어 있는 것: 연결(방장 초대 코드 → 손님 답장 코드 → 방장 붙여넣기), 버전 붙은 통신 약속(netplay/protocol.ts),
// 친구 아바타(buildPlayer 를 친구 색으로) + 10Hz 자세 보간, 이모트·스티커, 채팅(정해진 말 + 40자), 선물, 교환 창(둘 다 좋아요 → 한 번에),
// 방명록(flags.net.guestbook), 세이브 코드 내보내기·불러오기, 다른 모듈용 app 통로(game.ext.net).
// 손님 보너스·방문객 상자·협동 릴·레이스 같은 놀이는 netplay-play(order 61)가 ext.net 위에 얹는다.
//
// ── 두 탭(같은 컴퓨터)으로 해 보기 ── (STUN 없이 같은 컴퓨터·같은 와이파이면 된다)
//   1) 창 A·창 B 둘 다 http://127.0.0.1:5180/ 을 연다. 단, B 는 다른 브라우저 프로필·시크릿(게스트) 창·다른 브라우저로!
//      같은 주소의 두 탭은 세이브 한 칸(localStorage)을 같이 써서 서로 덮어쓴다(나중에 쓴 쪽이 이김 → 교환하면 세이브가 꼬인다).
//      ?fresh=1 도 읽기만 건너뛸 뿐 저장은 같은 칸에 하니 진짜 세이브를 덮어쓴다 — 쓰지 말자.
//   2) 탭 A: T(또는 왼쪽 👫 칩) → 연결 → "초대 코드 만들기" → 📋 복사.
//   3) 탭 B: 👫 → 연결 → "놀러 가기" 칸에 붙여넣기 → "답장 코드 만들기" → 📋 복사.
//   4) 탭 A: ② 칸에 답장 코드를 붙여넣고 "연결하기!" → 두 탭에 서로의 아바타가 보인다.
//   멀리 있는 친구: 두 사람 다 ⚙️ STUN 칸에 같은 stun: 주소를 적고 1)부터(대칭 NAT 이면 안 될 수 있다 — TURN 은 안 쓴다).
//   숨긴 탭은 브라우저가 그리기를 멈추지만 핑·자세 보내기는 setInterval 로 계속 돈다(15초 넘게 소식이 없으면 끊긴다).
//   단 크롬은 오래(약 5분) 숨긴 탭의 타이머를 1분에 한 번꼴로 늦춘다 → 그땐 핑이 늦어 친구 쪽에서 끊길 수 있다.
//
// game.ext.net = {
//   visiting: boolean       친구 섬에 손님으로 와 있나(연결되면 손님 쪽 true — netplay-play 도 쓸 수 있다)
//   boostTags: Record<tag, mult>   netplay-play 가 채우는 잡기 태그 배수
//   status                  'idle'|'hosting'|'offer'|'joining'|'answer'|'connecting'|'connected'|'closed'|'failed'
//   role                    연결 중일 때 'host'|'guest', 아니면 null
//   peer                    연결 중인 친구 {name, colors{tee,hair}, summary{dex,total,stars,coins,day}, role, v} | null
//   connected               boolean
//   send(kind, data?)       app 통로로 보내기(JSON 이 되는 값) → 보냈나
//   on(kind, fn(data, kind)) app 통로 듣기('*' = 전부) → 해제 함수. 받으면 state 이벤트 'net-coop' {kind, data} 도 나간다
//   peerPose()              친구 최신 자세 {x,y,z,yaw,m,a,w,s,…} | null
//   profile() · guestbook() · emote(id) · say(text|프리셋 번호) · gift(id, n) · open(tab?) · leave() · emotes · presets
// }
// 이벤트: net-peer {state: status} (단계가 바뀔 때마다), net-coop {kind, data} (app 쪽지를 받을 때)
// flags.net = { name, tee, hair, stun, guestbook: [{name, text, day, at, tee}], friends: [{name, tee, day, visits}], sessions }
// window.__net = { status(), ext, ctl, host(), join(code), finish(code), leave(), reset(), demo(), session(), peer(),
//                  say(t), emote(id), gift(id, n), trade(), exportSave(), importSave(code), avatar() }
import type { Ctx } from '../core/types';
import { NetController } from './netplay/controller';
import { registerNetUi } from './netplay/panels';
import { exportSave, importSave } from './netplay/save';

export const order = 60;

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const ctl = new NetController(game);
  game.ext.net = ctl.ext;

  registerNetUi(game, ctl);

  // 자세 10Hz·핑·시간 초과는 그리기와 따로(숨긴 탭에서도 돈다)
  const iv = setInterval(() => { try { ctl.tick(); } catch (e) { console.error('[netplay tick]', e); } }, 100);
  game.onUpdate((t, dt) => ctl.frame(t, dt));
  // 페이지를 떠나면 친구에게 인사하고 끊는다
  // (교환 중에 떠나면 맡긴 물건을 돌려받는데, core 의 pagehide 저장은 이미 돌았으니 여기서 한 번 더 바로 쓴다)
  addEventListener('pagehide', () => { ctl.leave(); clearInterval(iv); try { game.state.saveNow(); } catch { /* 못 씀 */ } });

  (globalThis as unknown as { __net?: unknown }).__net = {
    status: () => ctl.status,
    ext: ctl.ext,
    ctl,
    host: () => ctl.host().then(() => ctl.offerCode),
    join: (code: string) => ctl.join(code).then(() => ctl.answerCode || ctl.note),
    finish: (code: string) => ctl.finish(code).then(() => ctl.status),
    leave: () => ctl.leave(),
    reset: () => ctl.reset(),
    demo: () => { ctl.demo(); return ctl.status; },
    session: () => ctl.session,
    peer: () => ctl.session?.peer ?? null,
    say: (t: string | number) => ctl.say(t),
    emote: (id: string) => ctl.emote(id),
    gift: (id: string, n = 1) => ctl.gift(id, n),
    trade: () => ctl.session?.trade ?? null,
    exportSave: () => exportSave(game.state.snapshot()),
    importSave: (code: string) => importSave(code),
    avatar: () => ctl.avatar,
  };
}
