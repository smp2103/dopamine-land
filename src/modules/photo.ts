// photo — 사진 모드(P, GDD 3.11 P1 · 5.5 목격 · 6.3 지구 전망 언덕).
// P 를 누르면 플레이어를 잠그고(player.lock('photo')) HUD(#dl)를 숨긴 채 카메라를 따로 몬다:
//   🎠 빙글 카메라(플레이어 둘레) / 🕊️ 자유 카메라 — WASD 이동 · QE 높이 · 휠 줌 · 드래그 시점. 땅 아래로는 절대 안 들어가고(땅 공급자 포함)
//   플레이어에게서 40 m 밖으로는 못 나간다(청크가 플레이어 주변만 있으니까).
// 필터(따끈·파스텔·필름·옛날)는 게임 캔버스에 CSS filter 로만 건다(새 렌더 패스 없음). 액자·스티커는 겹친 2D 캔버스.
// 포즈(만세·안녕·앉기·찰칵·브이)는 player.act 로, 고르면 카메라를 본다. 셀프 타이머 3·10초.
// 찰칵 → 한 프레임 다시 그리고 바로 캔버스를 읽어 필터·액자·스티커를 입힌 PNG(toBlob) → 결과 카드에서 내려받기.
// 그림은 IndexedDB 'dopamine-land-photos' 에 최근 12장, flags.photo 에는 메타데이터만.
// 사진 명소(지구 전망 언덕 · 섬마다 등대 곶 · 폭포): 처음 찍으면 반짝별 한 번(econ.addStars).
// 목격 등록: game.witnesses.list() 중 화면 안 + 카메라 30 m 안, 아직 도감에 없는 종은 showCatch keep:false. 그리고 'photo' {spot, species}.
//
// game.ext.photo (주인: photo) = {
//   active() → boolean            사진 모드인가
//   enter() / exit() / toggle()
//   capture() → Promise<PhotoMeta | null>   지금 화면 찰칵(타이머 무시)
//   album() → PhotoMeta[]         최근 사진 메타(오래된 것부터)
//   spots() → Array<{id, name, world, x, z, done, stars}>   사진 명소
// }
// flags.photo = { album: PhotoMeta[], spots: {id: true}, seq, shots, witnessed, last: {filter, frame, timer} }
// 디버그: window.__photo { enter, exit, toggle, active, capture, state, filter(id), frame(id), sticker(e, x, y), clearStickers, pose(id),
//   timer(sec), mode('orbit'|'free'), cam(), setCam(x, y, z, yaw?, pitch?), lookAt(x, y, z), album(), openAlbum(), spots(), goSpot(id),
//   preview() — 지금 찍으면 들어갈 종·명소 }
import * as THREE from 'three';
import type { Ctx } from '../core/types';
import type { Game } from '../core/game';
import type { Species } from '../core/state';
import {
  ALBUM_KEEP, CAM_MAX_DIST, FILTERS, FOV_DEFAULT, FRAMES, POSES, STICKER_MAX,
  anglesOf, clampCamera, clampPitch, cycle, ensurePhotoFlags, faceYaw, fileName, filterById, frameById, freeStep, frustumOf, gameTimeText,
  adoptOrphans, lookDir, nextTimer, orbitPos, pushMeta, selectWitnesses, spotInShot, stickerAt, zoomDist, zoomFov,
  type FilterId, type FrameId, type PhotoFlags, type PhotoMeta, type PhotoSpot, type PlacedSticker, type PoseDef, type V3, type WitnessPick,
} from './photo/logic';
import { openAlbum, type Album, type PhotoRecord } from './photo/album';
import { composePhoto, download, makeGrainTile, thumbOf, toPng } from './photo/draw';
import { PhotoView } from './photo/ui';

export const order = 60;

/** 사진 모드 동안 숨길 화면 조각(HUD·코어 안내·도움말·GUI·연출 겹) */
const HIDE_SELECTORS = ['#dl', '#ui', '#hud', '#dlfx', '.lil-gui.lil-auto-place', '.lil-gui.autoPlace', '#interiors-deco-bar'];
/** 명소 안내 살피기 간격(초, 실시간) */
const SPOT_POLL = 0.25;

type CamMode = 'orbit' | 'free';

export default function build(ctx: Ctx) {
  const game = ctx.game;
  if (!game) return;
  const g: Game = game;
  const st = g.state;
  const I = ctx.island;
  const camera = ctx.camera;
  const canvas = ctx.renderer.domElement;

  // ───────────── 저장(flags.photo) ─────────────
  let fl: PhotoFlags | null = null;
  const F = (): PhotoFlags => {
    if (!fl || st.flags.photo !== fl) fl = ensurePhotoFlags(st.flags);
    return fl;
  };
  F();
  const save = () => st.save();

  // ───────────── 앨범(IndexedDB, 처음 쓸 때 연다) ─────────────
  let albumP: Promise<Album> | null = null;
  const album = () => (albumP ??= openAlbum().then(async (a) => {
    // flags 와 IDB 를 맞춘다: 메타가 없는 그림(저장 초기화·?fresh=1)은 지우지 않고 '추억' 으로 다시 품고,
    // 12장을 넘친 옛 그림만 정리한다. 그림이 없는 메타는 남긴다(다른 기기·지운 저장소 — 앨범엔 안 보인다)
    try {
      const f = F();
      const rows = await a.list();
      if (adoptOrphans(f, rows, ALBUM_KEEP).length) save();
      const keep = new Set(f.album.map((m) => m.id));
      for (const r of rows) if (!keep.has(r.id)) await a.remove(r.id);
    } catch (e) { console.warn('[photo] 앨범 맞추기', e); }
    return a;
  }));

  // ───────────── 사진 명소(처음 물을 때 한 번 만든다 — 지형은 시드 고정) ─────────────
  let spotCache: PhotoSpot[] | null = null;
  const spots = (): PhotoSpot[] => {
    if (spotCache) return spotCache;
    const out: PhotoSpot[] = [];
    const nm = (id: string) => g.geo?.islandName?.(id) ?? I.islandName(id);
    // 섬마다 등대 곶(등대 꼭대기 쪽이 화면에 들어오게)
    try {
      const L = I.PLACES.lighthouses as Record<string, { x: number; z: number }>;
      for (const id of I.LIGHTHOUSE_ISLANDS) {
        const p = L[id];
        if (!p) continue;
        out.push({ id: `lighthouse:${id}`, name: `${nm(id)} 등대 곶`, world: 'earth', x: p.x, z: p.z, y: I.heightAt(p.x, p.z) + 9, r: 70, mustSee: true, stars: 5 });
      }
    } catch (e) { console.warn('[photo] 등대 자리', e); }
    // 폭포: 말랑섬 큰 폭포 + 섬마다 가장 높이 떨어지는 강 마디(zones 와 같은 기준 — 1.2 m 넘게, 마디 67% 지점)
    try {
      const wf = I.worldFeatures().find((f) => f.kind === 'waterfall');
      if (wf) out.push({ id: `waterfall:${wf.island ?? 'home'}`, name: `${nm(wf.island ?? 'home')} 큰 폭포`, world: 'earth', x: wf.x, z: wf.z, y: I.heightAt(wf.x, wf.z) + 3, r: 60, mustSee: true, stars: 5 });
      const best = new Map<string, { x: number; z: number; y: number; drop: number }>();
      for (const R of I.worldRivers()) {
        for (let i = 0; i < R.pts.length - 1; i++) {
          const a = R.pts[i], b = R.pts[i + 1], drop = a.level - b.level;
          if (drop <= 1.2) continue;
          const cur = best.get(R.island);
          if (!cur || drop > cur.drop) best.set(R.island, { x: a.x + (b.x - a.x) * 0.67, z: a.z + (b.z - a.z) * 0.67, y: (a.level + b.level) / 2, drop });
        }
      }
      // 시작 마을 강(고원 → 들판 계단 폭포): 강 길을 따라 물 높이가 가장 급히 떨어지는 곳
      {
        const P = I.RIVER_PATH;
        let fall: { x: number; z: number; y: number; drop: number } | null = null;
        for (let i = 0; i < P.length - 1; i++) {
          for (let k = 0; k < 12; k++) {
            const t0 = k / 12, t1 = (k + 1) / 12;
            const ax = P[i].x + (P[i + 1].x - P[i].x) * t0, az = P[i].z + (P[i + 1].z - P[i].z) * t0;
            const bx = P[i].x + (P[i + 1].x - P[i].x) * t1, bz = P[i].z + (P[i + 1].z - P[i].z) * t1;
            const ya = I.riverWaterY(ax, az), yb = I.riverWaterY(bx, bz);
            if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
            const drop = ya - yb;
            if (drop > 0.5 && (!fall || drop > fall.drop)) fall = { x: (ax + bx) / 2, z: (az + bz) / 2, y: (ya + yb) / 2, drop };
          }
        }
        if (fall) out.push({ id: 'waterfall:village', name: '말랑마을 폭포', world: 'earth', x: fall.x, z: fall.z, y: fall.y, r: 35, mustSee: true, stars: 5 });
      }
      for (const [island, f] of best) {
        if (out.some((s) => s.id === `waterfall:${island}`)) continue;
        out.push({ id: `waterfall:${island}`, name: `${nm(island)} 폭포`, world: 'earth', x: f.x, z: f.z, y: f.y + 1, r: 60, mustSee: true, stars: 5 });
      }
    } catch (e) { console.warn('[photo] 폭포 자리', e); }
    spotCache = out;
    return out;
  };
  /** 우주 명소(space 가 늦게 생겨도 되게 매번 읽는다) */
  const spaceSpots = (): PhotoSpot[] => {
    const list = (g.space as unknown as { photoSpots?: Array<{ id: string; name: string; x: number; z: number }> } | null)?.photoSpots ?? [];
    return list.filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.x) && Number.isFinite(s.z))
      .map((s) => ({ id: s.id, name: s.name, world: 'space' as const, x: s.x, z: s.z, r: 45, mustSee: false, stars: 10 }));
  };
  const allSpots = () => [...spots(), ...spaceSpots()];

  // ───────────── 모드 상태 ─────────────
  const last = F().last ?? {};
  const S = {
    active: false,
    justEntered: false,
    mode: 'orbit' as CamMode,
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.3,
    dist: 6,
    lift: 0,
    fov: FOV_DEFAULT,
    filter: filterById(last.filter).id as FilterId,
    frame: frameById(last.frame).id as FrameId,
    timer: [0, 3, 10].includes(last.timer ?? 0) ? (last.timer ?? 0) : 0,
    stickers: [] as PlacedSticker[],
    sticker: null as string | null,
    pose: null as PoseDef['id'] | null,
    /** 셀프 타이머 끝나는 실시간(ms) — 0 이면 안 셈 */
    countEnd: 0,
    countShown: 0,
    busy: false,
    /** 다음 프레임 찰칵(키·버튼에서 요청) */
    wantShot: false,
    lastBlob: null as Blob | null,
    lastMeta: null as PhotoMeta | null,
    lastUrl: '',
    spotPoll: 0,
    caption: '',
  };
  let prevCamUpdate: Game['cam']['update'] | null = null;
  const hidden: Array<{ el: HTMLElement; vis: string }> = [];
  const rnd = ctx.rng('photo:sticker');
  const grainTile = typeof document !== 'undefined' ? makeGrainTile(ctx.rng('photo:grain')) : null;

  // ───────────── 화면 ─────────────
  const view = new PhotoView({
    filter: (id) => setFilter(id),
    frame: (id) => setFrame(id),
    pickSticker: (e) => { S.sticker = S.sticker === e ? null : e; if (S.sticker) view.msg('화면을 눌러 붙여요 · 붙은 걸 누르면 떼요 ✨'); sync(); },
    decoClick: (x, y) => decoClick(x, y),
    clearStickers: () => { S.stickers = []; S.sticker = null; sync(); view.msg('스티커를 다 뗐어요 🧽'); },
    pose: (id) => setPose(id),
    timer: () => { S.timer = nextTimer(S.timer); remember(); sync(); view.msg(S.timer ? `셀프 타이머 ${S.timer}초 ⏱️` : '타이머를 껐어요'); },
    camMode: () => setMode(S.mode === 'orbit' ? 'free' : 'orbit'),
    shutter: () => shutter(),
    album: () => { void openAlbumView(); },
    exit: () => exit(),
    save: () => { if (S.lastBlob && S.lastMeta) { download(S.lastBlob, fileName(S.lastMeta.at)); view.msg('PNG 로 저장했어요 💾'); } },
    closeResult: () => view.showResult(null),
    albumSave: (id) => { void albumSave(id); },
    albumDelete: (id) => { void albumDelete(id); },
    albumClose: () => view.showAlbum(null),
  });

  const sync = () => {
    view.sync({ filter: S.filter, frame: S.frame, sticker: S.sticker, pose: S.pose, timer: S.timer, camMode: S.mode });
    redrawDeco();
  };
  const redrawDeco = () => { if (S.active) view.drawDeco(S.frame, S.filter, S.stickers, S.caption, grainTile); };
  const remember = () => { F().last = { filter: S.filter, frame: S.frame, timer: S.timer }; save(); };

  const setFilter = (id: FilterId) => {
    S.filter = filterById(id).id;
    if (S.active) canvas.style.filter = filterById(S.filter).css;
    remember(); sync();
  };
  const setFrame = (id: FrameId) => { S.frame = frameById(id).id; remember(); sync(); };
  const setMode = (m: CamMode) => {
    if (m === S.mode) return;
    if (m === 'free') {
      // 지금 보던 그대로 자유 카메라로(자리·방향 이어받기)
      const d = camera.getWorldDirection(_off);
      const a = anglesOf(d);
      S.yaw = a.yaw; S.pitch = clampPitch(a.pitch); S.pos.copy(camera.position); S.fov = camera.fov;
    } else {
      const t = orbitTarget();
      const off = _off.copy(camera.position).sub(t);
      S.dist = zoomDist(off.length(), 0);
      S.yaw = Math.atan2(off.x, off.z);
      S.pitch = clampPitch(Math.asin(Math.max(-1, Math.min(1, off.y / Math.max(1e-3, off.length())))));
      S.fov = FOV_DEFAULT;
    }
    S.mode = m;
    sync();
    view.msg(m === 'free' ? '🕊️ 자유 카메라 — 날아다니며 찍어요' : '🎠 빙글 카메라 — 나를 가운데 두고 돌아요');
  };
  /** 포즈 고르기 — 같은 걸 또 누르면 풀린다(force 면 그대로 잡는다) */
  const setPose = (id: PoseDef['id'] | null, force = false) => {
    const p = g.player;
    if (id === null || (S.pose === id && !force)) {
      if (S.pose && p.action === S.pose) p.act(null);
      S.pose = null;
    } else {
      S.pose = id;
      p.act(id);
      // 카메라를 바라보게(잠겨 있어 이동으로 돌아가지 않는다)
      if (!p.mounted) p.yaw = faceYaw(p.pos, camera.position);
      g.audio?.sfx?.('ui-click', { pitch: 1.2 });
    }
    sync();
  };
  const decoClick = (x: number, y: number) => {
    const aspect = innerWidth / Math.max(1, innerHeight);
    const hit = stickerAt(S.stickers, x, y, aspect);
    if (hit >= 0) { S.stickers.splice(hit, 1); sync(); return; }
    if (!S.sticker) return;
    if (S.stickers.length >= STICKER_MAX) { view.msg(`스티커는 ${STICKER_MAX}개까지예요!`); return; }
    S.stickers.push({ e: S.sticker, x, y, s: 0.075 + rnd() * 0.03, rot: (rnd() - 0.5) * 0.6 });
    g.audio?.sfx?.('ui-click', { pitch: 1.5 });
    sync();
  };

  // ───────────── 카메라 ─────────────
  /** 빙글 카메라 중심(스크래치 — 다음 호출 전까지만 유효) */
  const orbitTarget = () => _tgt.set(g.player.pos.x, g.player.pos.y + 1.0 + S.lift, g.player.pos.z);
  const groundAt = (x: number, z: number) => g.groundAt(x, z);
  const anchor = (): V3 => g.player.pos;
  const _look = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _tgt = new THREE.Vector3();
  const _off = new THREE.Vector3();

  /** 사진 모드 카메라(코어 CameraRig.update 자리에 끼운다 — 모듈 갱신 뒤, 그리기 전) */
  const photoCam = (input: Game['input'], dt: number) => {
    if (!S.active) { prevCamUpdate?.call(g.cam, input, dt); return; }
    // 앨범을 보는 동안은 카메라를 멈춘다. 결과 카드는 카메라를 움직이면 저절로 닫힌다(계속 찍기)
    const busyUi = view.albumOpen;
    // 드래그 시점(앨범을 보는 동안은 안 돌린다)
    if (!busyUi) {
      S.yaw -= input.mouseDX * 0.005;
      S.pitch = clampPitch(S.pitch + input.mouseDY * 0.004);
    }
    const ax = busyUi ? { x: 0, y: 0 } : input.axis();
    const up = busyUi ? 0 : (input.down('KeyE') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0);
    if (view.resultOpen && (ax.x || ax.y || up || input.mouseDX || input.mouseDY || input.wheel)) view.showResult(null);
    const fast = input.down('ShiftLeft') || input.down('ShiftRight');
    let target: THREE.Vector3;
    if (S.mode === 'orbit') {
      S.yaw += ax.x * dt * 1.6;
      S.dist = zoomDist(S.dist, input.wheel - ax.y * dt * 6);
      S.lift = Math.max(-0.9, Math.min(4, S.lift + up * dt * 2));
      target = orbitTarget();
      const want = orbitPos(target, S.yaw, S.pitch, S.dist);
      const c = clampCamera(want, anchor(), groundAt, { maxDist: CAM_MAX_DIST });
      S.pos.set(c.x, c.y, c.z);
      camera.fov = S.fov;
    } else {
      S.fov = zoomFov(S.fov, input.wheel);
      const nx = freeStep(S.pos, S.yaw, ax, up, fast ? 14 : 5, dt);
      const c = clampCamera(nx, anchor(), groundAt, { maxDist: CAM_MAX_DIST });
      S.pos.set(c.x, c.y, c.z);
      const d = lookDir(S.yaw, S.pitch);
      // 초점(심도·그림자 중심)은 앞쪽 — 플레이어가 화면 안 가까이 있으면 플레이어
      const toP = _look.copy(g.player.pos).sub(S.pos);
      const along = toP.x * d.x + toP.y * d.y + toP.z * d.z;
      target = along > 1 && along < 25 && toP.length() - along < 4 ? orbitTarget() : _fwd.set(S.pos.x + d.x * 10, S.pos.y + d.y * 10, S.pos.z + d.z * 10);
      camera.fov = S.fov;
    }
    camera.position.copy(S.pos);
    camera.updateProjectionMatrix();
    if (S.mode === 'orbit') camera.lookAt(target);
    else { const d = lookDir(S.yaw, S.pitch); camera.lookAt(S.pos.x + d.x, S.pos.y + d.y, S.pos.z + d.z); }
    // 엔진 시점(그림자·심도·곡률 원점)이 따라오게
    g.cam.target.copy(target);
  };

  // ───────────── 들어가기·나가기 ─────────────
  const hideChrome = () => {
    hidden.length = 0;
    for (const sel of HIDE_SELECTORS) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if (el.closest('#photo-ui')) continue;
        hidden.push({ el, vis: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    }
  };
  const showChrome = () => { for (const h of hidden) h.el.style.visibility = h.vis; hidden.length = 0; };

  function enter(): boolean {
    if (S.active) return true;
    if (g.hud.isOpen()) g.hud.close();
    S.active = true;
    S.justEntered = true;
    g.player.lock('photo');
    if (g.cam.update !== photoCam) prevCamUpdate = g.cam.update;
    g.cam.update = photoCam;
    // 지금 보던 자리에서 시작(빙글 카메라)
    S.mode = 'orbit';
    S.lift = 0;
    S.fov = FOV_DEFAULT;
    const t = orbitTarget();
    const off = _off.copy(camera.position).sub(t);
    const len = off.length();
    S.dist = zoomDist(Number.isFinite(len) && len > 0.1 ? len : 6, 0);
    S.yaw = len > 0.1 ? Math.atan2(off.x, off.z) : g.cam.yaw;
    S.pitch = clampPitch(len > 0.1 ? Math.asin(Math.max(-1, Math.min(1, off.y / len))) : 0.3);
    S.pos.copy(camera.position);
    S.stickers = []; S.sticker = null; S.pose = null; S.countEnd = 0;
    hideChrome();
    canvas.style.filter = filterById(S.filter).css;
    S.caption = captionNow();
    // 앨범을 미리 열어 맞춰 둔다(첫 찰칵이 기다리지 않게)
    void album().catch(() => {});
    view.show(true);
    sync();
    view.msg('📷 사진 모드! 멋진 순간을 남겨 봐요');
    g.audio?.sfx?.('ui-click', { pitch: 1.1 });
    st.emit({ type: 'ui-open', kind: 'photo' });
    return true;
  }

  function exit(): boolean {
    if (!S.active) return false;
    S.active = false;
    S.countEnd = 0;
    S.wantShot = false;
    view.countdown(0);
    if (S.pose && g.player.action === S.pose) g.player.act(null);
    S.pose = null;
    g.player.unlock('photo', true);
    if (g.cam.update === photoCam && prevCamUpdate) g.cam.update = prevCamUpdate;
    prevCamUpdate = null;
    canvas.style.filter = '';
    showChrome();
    view.show(false);
    st.emit({ type: 'ui-close', kind: 'photo' });
    return true;
  }
  const toggle = () => (S.active ? exit() : enter());

  // ───────────── 찰칵 ─────────────
  const placeName = (): string => {
    if (g.world === 'space') {
      const pl = g.space?.planet ?? 'moon';
      return pl === 'moon' ? '토끼달' : (g.ext.planets?.name?.(pl) as string | undefined) ?? '먼 행성';
    }
    const p = g.player.pos;
    const z = g.geo?.zoneAt?.(p.x, p.z);
    if (z?.island) return g.geo?.islandName?.(z.island) ?? I.islandName(z.island);
    const isl = I.islandAt?.(p.x, p.z);
    return isl ? I.islandName(isl.id) : '반짝이는 바다';
  };
  const day = () => Math.max(0, Math.floor(g.env?.day ?? 0));
  const hour = () => g.env?.hour ?? 12;
  const captionNow = () => `${placeName()} · ${gameTimeText(day(), hour())}`;
  const isRegistered = (id: string) => {
    const sp = st.byGdd(id);
    return !!st.dex[sp?.id ?? id];
  };
  const speciesOf = (id: string): Species | undefined => st.byGdd(id) ?? st.species.get(id);
  const nameOf = (id: string) => speciesOf(id)?.name ?? id;

  /** 지금 찍으면 들어갈 것(목격·명소) */
  const preview = (): { pick: WitnessPick; spot: PhotoSpot | null } => {
    const fr = frustumOf(camera);
    const pick = selectWitnesses(g.witnesses.list(), camera.position, fr, isRegistered);
    const spot = spotInShot(allSpots(), g.world, camera.position, fr, groundAt);
    return { pick, spot };
  };

  const shutter = () => {
    if (!S.active || S.busy) return;
    if (view.resultOpen) view.showResult(null);
    if (view.albumOpen) view.showAlbum(null);
    if (S.timer > 0) {
      if (S.countEnd) { S.countEnd = 0; view.countdown(0); view.msg('타이머를 멈췄어요'); return; }
      S.countEnd = performance.now() + S.timer * 1000;
      S.countShown = 0;
      if (S.pose && !g.player.mounted) g.player.yaw = faceYaw(g.player.pos, camera.position);
      view.msg(`${S.timer}초 뒤에 찰칵! 포즈를 잡아요 ✌️`);
      return;
    }
    S.wantShot = true;
  };

  /** 한 프레임 그리고 바로 읽는다(preserveDrawingBuffer 없이도 같은 작업 안이면 그림이 남아 있다) */
  async function capture(): Promise<PhotoMeta | null> {
    if (S.busy) return null;
    S.busy = true;
    try {
      // 앨범 맞추기(옛 그림 품기·seq 올리기)가 끝난 뒤에 번호를 받는다 — 안 그러면 새 사진이 옛 그림을 덮는다
      try { await album(); } catch { /* 메모리로라도 간다 */ }
      if (!S.active) return null;
      const { pick, spot } = preview();
      const caption = spot ? `${spot.name} · ${gameTimeText(day(), hour())}` : captionNow();
      view.hideChrome(true);
      let shot: HTMLCanvasElement;
      try {
        camera.updateMatrixWorld();
        g.engine.composer.render(0);
        shot = composePhoto(canvas, { filter: S.filter, frame: S.frame, stickers: S.stickers, caption, grainTile });
      } finally { view.hideChrome(false); }
      view.flash();
      const blob = await toPng(shot);
      const thumb = thumbOf(shot);
      const f = F();
      const id = f.seq++;
      const meta: PhotoMeta = {
        id, at: Date.now(), day: day(), hour: Math.round(hour() * 100) / 100, world: g.world, place: spot?.name ?? placeName(),
        spot: spot?.id, species: pick.inShot, filter: S.filter, frame: S.frame, w: shot.width, h: shot.height,
      };
      if (!spot) delete meta.spot;
      pushMeta(f, meta, ALBUM_KEEP);
      f.shots++;
      // 목격 등록(도감만) — HUD 는 숨어 있으니 결과 카드에도 적는다
      const fresh: string[] = [];
      for (const sid of pick.fresh) {
        const sp = speciesOf(sid);
        if (!sp || isRegistered(sid)) continue;
        try { g.ui.showCatch({ species: sp, keep: false, activity: 'photo', line: '사진으로 만났다! 📷' }); } catch (e) { console.error('[photo] showCatch', e); }
        fresh.push(sp.name);
        f.witnessed++;
      }
      // 명소 보너스(한 번)
      let bonus: string | null = null;
      if (spot) {
        const econ = g.econ;
        if (!f.spots[spot.id] && econ && typeof econ.addStars === 'function') {
          econ.addStars(spot.stars, 'photo-spot');
          f.spots[spot.id] = true;
          bonus = `🌟 사진 명소 「${spot.name}」 첫 사진! 반짝별 +${spot.stars}`;
        } else if (f.spots[spot.id]) bonus = `📍 「${spot.name}」 또 와 줬네요!`;
      }
      save();
      st.emit({ type: 'photo', spot: spot?.id, species: pick.inShot });
      // 앨범(IndexedDB) — 실패해도 사진은 결과 카드에서 저장할 수 있다
      try { await (await album()).put({ id, at: meta.at, blob, thumb } satisfies PhotoRecord); } catch (e) { console.warn('[photo] 앨범 저장', e); }
      if (S.lastUrl) URL.revokeObjectURL(S.lastUrl);
      S.lastBlob = blob;
      S.lastMeta = meta;
      S.lastUrl = blob ? URL.createObjectURL(blob) : '';
      if (S.active) view.showResult({ url: S.lastUrl || thumb, meta, place: meta.place, fresh, bonus, canSave: !!blob });
      return meta;
    } catch (e) {
      console.error('[photo] capture', e);
      if (S.active) view.msg('앗, 사진이 흔들렸어요… 다시 찍어 볼까요?');
      return null;
    } finally { S.busy = false; }
  }

  // ───────────── 앨범 창 ─────────────
  async function openAlbumView(sel?: number) {
    if (view.resultOpen) view.showResult(null);
    const a = await album();
    const rows = await a.list();
    const metas = new Map(F().album.map((m) => [m.id, m]));
    if (!S.active) return;
    view.showAlbum({ rows: rows.filter((r) => metas.has(r.id)), metas, names: nameOf, sel, kind: a.kind });
  }
  async function albumSave(id: number) {
    const r = await (await album()).get(id);
    if (r?.blob) { download(r.blob, fileName(r.at)); view.msg('PNG 로 저장했어요 💾'); }
  }
  async function albumDelete(id: number) {
    await (await album()).remove(id);
    const f = F();
    f.album = f.album.filter((m) => m.id !== id);
    save();
    view.msg('앨범에서 떼어냈어요 🗑️');
    await openAlbumView();
  }

  // ───────────── 단축키 P ─────────────
  g.hud.registerHotkey({ id: 'photo:p', code: 'KeyP', label: '사진', hint: true, run: () => { toggle(); } });

  // ───────────── 매 프레임(게임 갱신 안 — 입력은 이 프레임 끝에 비워지니 여기서 읽는다. 카메라는 이 뒤에 photoCam) ─────────────
  g.onUpdate((_t, dt) => {
    if (!S.active) return;
    // 다른 곳에서 카메라 훅을 바꿔 끼웠으면 다시 얹는다(낚시 갤러리 같은 디버그는 예외 없이 사진 모드가 이긴다)
    // 처음 맡아 둔 원래 함수(코어 CameraRig.update)는 덮지 않는다 — 나갈 때 그걸 돌려놓아야 하니까
    if (g.cam.update !== photoCam) { prevCamUpdate ??= g.cam.update; g.cam.update = photoCam; }
    const inp = g.input;
    if (S.justEntered) { S.justEntered = false; }
    else {
      const hit = (c: string) => inp.hit(c);
      if (hit('Escape')) {
        if (view.albumOpen) view.showAlbum(null);
        else if (view.closePops()) { /* 펼친 말풍선만 닫는다 */ }
        else if (view.resultOpen) view.showResult(null);
        else if (S.sticker) { S.sticker = null; sync(); }
        else { exit(); return; }
      }
      if (hit('KeyP')) { exit(); return; }
      if (hit('KeyT')) { S.timer = nextTimer(S.timer); remember(); sync(); view.msg(S.timer ? `셀프 타이머 ${S.timer}초 ⏱️` : '타이머를 껐어요'); }
      if (hit('KeyF')) setMode(S.mode === 'orbit' ? 'free' : 'orbit');
      if (hit('KeyR')) setFilter(cycle(FILTERS, S.filter, inp.down('ShiftLeft') ? -1 : 1).id);
      if (hit('KeyB')) setFrame(cycle(FRAMES, S.frame, inp.down('ShiftLeft') ? -1 : 1).id);
      if (hit('KeyH')) view.msg(view.toggleClean() ? '도구를 숨겼어요 (H 로 다시)' : '도구가 돌아왔어요');
      if (hit('KeyL')) { if (view.albumOpen) view.showAlbum(null); else void openAlbumView(); }
      if (hit('Backspace')) { S.stickers.pop(); sync(); }
      for (let i = 0; i < POSES.length; i++) if (hit(`Digit${i + 1}`)) setPose(POSES[i].id);
      // 셔터는 맨 끝 — 같은 프레임에 고른 타이머·포즈·필터가 먼저 먹게
      if (hit('Space') || hit('Enter')) shutter();
    }
    // 셀프 타이머(실시간 — 촬영 모드 dt 0 에서도 흐른다)
    if (S.countEnd) {
      const left = Math.ceil((S.countEnd - performance.now()) / 1000);
      if (left <= 0) { S.countEnd = 0; view.countdown(0); S.wantShot = true; }
      else if (left !== S.countShown) { S.countShown = left; view.countdown(left); g.audio?.sfx?.('ui-click', { pitch: left <= 1 ? 1.6 : 1.0 }); }
    }
    if (S.wantShot) { S.wantShot = false; void capture(); }
    // 명소 안내·액자 글씨(가끔)
    S.spotPoll -= Math.max(dt, 1 / 60);
    if (S.spotPoll <= 0) {
      S.spotPoll = SPOT_POLL;
      const { spot } = preview();
      view.spot(spot ? (F().spots[spot.id] ? `📍 ${spot.name} (찍어 봤어요)` : `📍 ${spot.name} — 사진 명소! 첫 사진 반짝별 +${spot.stars}`) : null);
      const cap = captionNow();
      if (cap !== S.caption) { S.caption = cap; redrawDeco(); }
    }
  });
  addEventListener('resize', () => redrawDeco());

  // 세계가 바뀌면(로켓·귀환) 카메라를 플레이어 곁으로
  g.onWorld(() => { if (S.active) { S.mode = 'orbit'; S.dist = 6; sync(); } });

  // ───────────── 바깥 창구 ─────────────
  const spotRows = () => allSpots().map((s) => ({ id: s.id, name: s.name, world: s.world, x: s.x, z: s.z, stars: s.stars, done: !!F().spots[s.id] }));
  g.ext.photo = {
    active: () => S.active,
    enter, exit, toggle,
    capture: () => capture(),
    album: () => F().album.slice(),
    spots: spotRows,
  };

  // ───────────── 디버그 훅 ─────────────
  if (typeof window !== 'undefined') {
    (window as unknown as { __photo?: unknown }).__photo = {
      enter, exit, toggle,
      active: () => S.active,
      capture: () => capture(),
      state: () => ({
        active: S.active, mode: S.mode, filter: S.filter, frame: S.frame, timer: S.timer, pose: S.pose, stickers: S.stickers.length,
        locks: g.player.lockedBy(), flags: JSON.parse(JSON.stringify(F())) as PhotoFlags,
      }),
      filter: (id: FilterId) => { setFilter(id); return S.filter; },
      frame: (id: FrameId) => { setFrame(id); return S.frame; },
      sticker: (e: string, x = 0.5, y = 0.5) => { S.stickers.push({ e, x, y, s: 0.09, rot: 0 }); sync(); return S.stickers.length; },
      clearStickers: () => { S.stickers = []; sync(); },
      pose: (id: PoseDef['id'] | null) => { setPose(id, true); return S.pose; },
      timer: (sec: number) => { S.timer = [0, 3, 10].includes(sec) ? sec : 0; sync(); return S.timer; },
      mode: (m: CamMode) => { setMode(m); return S.mode; },
      cam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: S.yaw, pitch: S.pitch, dist: S.dist, fov: S.fov, mode: S.mode }),
      setCam: (x: number, y: number, z: number, yaw?: number, pitch?: number) => {
        if (!S.active) enter();
        if (S.mode !== 'free') setMode('free');
        const c = clampCamera({ x, y, z }, anchor(), groundAt, { maxDist: CAM_MAX_DIST });
        S.pos.set(c.x, c.y, c.z);
        if (yaw !== undefined) S.yaw = yaw;
        if (pitch !== undefined) S.pitch = clampPitch(pitch);
        return { ...c };
      },
      lookAt: (x: number, y: number, z: number) => {
        if (!S.active) enter();
        if (S.mode !== 'free') setMode('free');
        const a = anglesOf({ x: x - S.pos.x, y: y - S.pos.y, z: z - S.pos.z });
        S.yaw = a.yaw; S.pitch = clampPitch(a.pitch);
        return a;
      },
      album: async () => (await (await album()).list()).map((r) => ({ id: r.id, at: r.at, bytes: r.blob?.size ?? 0 })),
      openAlbum: () => openAlbumView(),
      spots: spotRows,
      /** 명소 옆으로 가서(플레이어) 그쪽을 본다 */
      goSpot: (id: string) => {
        const s = allSpots().find((x) => x.id === id);
        if (!s) return false;
        if (g.world !== s.world) g.setWorld(s.world);
        const back = s.world === 'earth' ? Math.min(40, s.r * 0.6) : 4;
        // 섬 안쪽(섬 중심 쪽)으로 물러서서 본다 — 바다 위면 바다에 선다
        const isl = s.world === 'earth' ? I.islandAt?.(s.x, s.z) : null;
        let dx = isl ? isl.x - s.x : 1, dz = isl ? isl.z - s.z : 0;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        g.player.teleport(s.x + dx * back, s.z + dz * back);
        if (!S.active) enter();
        setMode('orbit');
        S.yaw = Math.atan2(dx, dz); S.pitch = 0.15; S.dist = 5;
        return true;
      },
      preview: () => { const p = preview(); return { inShot: p.pick.inShot, fresh: p.pick.fresh, spot: p.spot?.id ?? null }; },
    };
  }
}
