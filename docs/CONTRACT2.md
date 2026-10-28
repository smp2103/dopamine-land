SHARED RUNTIME CONTRACT v2 (dopamine-land). Wave-0 workstream core-contract writes this text verbatim to docs/CONTRACT2.md and as typed code in src/core/api.ts, src/core/events.ts, src/core/registry.ts, src/core/interact.ts, src/core/art.ts. Every later workstream MUST read docs/CONTRACT2.md and those files before coding. Everything is additive. Existing behaviour stays unless a line below says otherwise.

0. GLOBAL RULES
- CONTRACT.md rules still apply. Use ctx.rng / rngFor only, never Math.random. No external assets: sound is WebAudio synthesis, models are code. World content is chunk streamed. Decorative chunk layers set detail:true so QUALITY.low drops them. Shared geometry sets userData.shared=true. No git commits. Edit only your ownedFiles.
- Per-workstream gate: `npx tsc --noEmit` reports no errors in your own files, and your tests/<key>.test.ts passes. The whole-repo gate (tsc + `npx vitest run` + `vite build` all green) runs at the END of each wave and is fixed by the next wave's owners, or by loop-integration in the final wave. Do not try to make other workstreams' in-progress files compile.
- Tests use tests/kit (fakeGame.ts, storage.ts, three.ts; built in wave 1). Keep pure logic in <module>/logic.ts-style files so it can be tested without DOM or WebGL.
- Optional services are read lazily with `?.` and a fallback, e.g. `game.econ?.isUnlocked(k) ?? true` or `game.env?.hour ?? 12`. Never read a service at build time unless its owner has a lower module order.
- Persistent data lives only under game.state.flags.<ns> (section 7), followed by state.save(). Core v2 debounces save, so call it freely. Large binary data such as photos goes to IndexedDB, never into flags.
- Imports between modules: runtime cross-talk goes only through game.* services and events (GDD 8.3). Exception: pure, side-effect-free leaf files may be imported read-only: economy/data.ts and economy/tables.ts (tables), economy/progression.ts (pure predicates), economy/roll.ts, characters/player.ts (buildPlayer), characters/animal.ts (buildAnimal), props/balloon.ts (buildBalloonGift), interiors/placement.ts (grid helper). Never import another module's default/build file.
- Perf: QUALITY presets (src/core/quality.ts) must keep working. New per-frame work must be O(nearby). No new full-screen passes. Each new module gets at most 40 draw calls and 150k tris near the player, and at most 1 ms/frame of main-thread JS. Bench baseline: shots/bench-baseline.json (wave 0). Tolerance: +10% draw calls and +10% ms/frame per stop.
- Art (GDD 0.4, 0.5, 7.1-7.4). Every new or edited creature or NPC model uses src/core/art.ts:
  - eyeMaterial()/addEyes(): one shared canvas eye texture, #3d3a4a vertical 0.75:1 ellipse with 2 white highlights.
  - addBlush(): #ff9fb8, opacity 0.55, 80% of the eye diameter. Mandatory on scary species.
  - blobShadow(r): shared round translucent disc.
  - breathe(obj, t, phase): scale 1.00↔1.05 over 2 s, with a per-instance phase from the rng.
  - crownMesh(): gold crown.
  - PALETTE: the named GDD 0.5 colours. pastelize() rejects pure black and grey.
  - PARTS: the GDD 0.4 parts vocabulary, used as Species look.parts?: Part[].
  - UI text colour is #4a3b2a on #fff8e8.
- Each module exposes window.__<moduleName> debug hooks (section 9) so scripts/loop.mjs can drive it headless. Listing your hooks is part of every acceptance.

1. CONSTANTS (src/core/api.ts)
- Time: HOUR_SEC=75 (1 game hour); DAY_SEC=1800 (one game day = 30 real minutes); START_HOUR=9.
- TOD blocks: morning 05-09, day 09-17, sunset 17-21, night 21-05. noon is 11-13 and midnight is 00-02. Helpers: todOf(h), isNoon(h), isMidnight(h).
- Calendar: weekday = day%7 (0 Mon … 6 Sun). Moon cycle is 8 game days: moonPhase runs 0..1, full moon is 0.45-0.55, new moon/eclipse window is <0.04 or >0.96. Seasons last 7 game days each: spring → summer → autumn → winter.
- Modes: P0 = ?p0 (on unless p0=0). Under P0, shop and recipe costs are ceil(x/5) unless an explicit p0 value exists, and the GDD 'P0: 조건 없음' gates are dropped (blueprint island-visit gate, tugboat home-dex 30%). cheat = ?cheat=1.
- Variant helpers: splitVariant(bagKey) → {id, variant}; variantKey(id, v) = `${id}@${v}` for v ∈ shiny|crown|tiny.

2. TYPED SERVICE SLOTS ON Game (types in src/core/api.ts; the core assigns null, the owners fill them)
- game.env: EnvApi|null — owner atmosphere, order 50, so every reader must read lazily.
  { day; hour (0..24 float); minute; tod:'morning'|'day'|'sunset'|'night'; noon; midnight; weekday; season; moonPhase; fullMoon; eclipse; weather:Weather (at the player); regionWeather(x,z); weatherOf(region); forecast(region, hoursAhead):Weather; waveMul:number (1, storm 2; ocean reads it); gameSec; forceWeather(region|'*', w|null, hours?); advance(sec); setHour(h) }
  Weather = 'clear'|'rain'|'storm'|'fog'|'meteor'|'snow'|'blizzard'|'rainbow'|'aurora'|'sandstorm'.
- game.econ: EconApi|null — owner economy, order 9. See section 6.
- game.geo: GeoApi|null — owner worldterrain, order 2.
  { zoneAt(x,z):{island, theme, zone, sea:null|'shore'|'shallow'|'reef'|'offshore'|'deep'|'trench'}; islandName(id); landmarks:Landmark[]; addLandmark(l) (idempotent by id); discovered(id); currentAt(x,z):{x,z}|null }
  Landmark {id:'lm:<island>:<kind>[:n]', kind, name, island, x, z, r}. currentAt returns null until seaworld assigns geo.currentAt.
- game.ocean: OceanApi|null — the ONLY owner is ocean. Other modules read it and never assign it.
  { waveAt(x,z,t) (includes env.waveMul); stamina; staminaMax; oxygen; oxygenMax; swimming }
- game.audio: AudioApi|null — owner audio, order 1.
  { sfx(name, o?:{x?,z?,vol?,pitch?}); music(track|null); ambience(name, level); setVolume('master'|'music'|'sfx', v); mute(on?):boolean }
- game.hud: HudRegistry — owner core, always present; the renderer is the hud module. See section 5.
- game.vehicles: VehiclesApi|null — owner vehicles.
  { current():{kind, speed, boat, seats?}|null; owned(); summon(kind):boolean; isBoat(kind); registerKind(def) }
- game.space: SpaceApi|null — owner space.
  { planet; ponds:Array<{x,z,r,y}>; pondAt(x,z):{y}|null; oxygen:{value,max}; landingSpawn:Vector3; returnSpawn:Vector3; registerPlanet(def:{id, name, origin:Vector3, radius, gravity, heightAt(x,z), build():Object3D, onEnter?(), onExit?()}); goPlanet(id, spawn?); addSpawn(planetId, spawner:{id, build(root), update?(t,dt)}) }
- game.witnesses: core registry. add(fn:()=>Array<{speciesId, pos:Vector3}>) returns an unsubscribe; list(). Used by photo mode and by greet-to-register.
- game.focusOverride: Vector3|null — core. When set, chunks.update uses it instead of player.pos (interiors and planets).
- game.ext: Record<string, any>, one owner per key:
  ext.village (village), ext.fossils (dinos), ext.npc (characters), ext.interiors (interiors), ext.meta (meta, incl. perk(name):boolean), ext.calendar (calendar, incl. boosts():Record<tag,mult>), ext.currents (seaworld), ext.treasure (treasure), ext.flora (flora), ext.travel (islanddev: addNode/nodes/go), ext.net (netplay: visiting, peer), ext.secrets (secrets), ext.hidden (hidden), ext.garden (garden), ext.dev (islanddev), ext.photo (photo), ext.story (story), ext.planets (planets), ext.flight (flight), ext.witnessFx (none).
  Each owner documents its shape in its module file header.
- game.dex: legacy alias. Core defines it as a getter returning the facade {open, close, toast, showRegion, register} backed by game.hud. hud must not assign it.

3. CORE ADDITIONS (wave 1, core-runtime)
- Species (state.ts) gets optional fields: tags?: string[] ('set:rainbow', 'set:zodiac', 'set:glow', 'set:ball', 'set:nudi', 'ancient', 'food:carni', 'rocket', 'witness', 'vehicle', 'junk', 'space-goods', 'fos:<dino>:<part>'); gdd?; where?: Array<{island?, zone?, time?, weather?:{only?, boost?, x?}, dev?:string /*unlock key required*/}>; witness?; len?; shadow?:'XS'|'S'|'M'|'L'|'XL'|'XXL'; p1?; diet?:'herb'|'carni'; look?:{parts?:Part[]}.
- ID POLICY: existing species ids are NOT renamed. New species use GDD ids. Matches set gdd:'<gdd id>'. state.byGdd(id) resolves a GDD id or a real id to its Species.
  v_* ids are vehicle dex rows owned by vehicles: category 'item', tags ['vehicle'] (GDD 3.8 P0-6). Economy never registers v_* and never puts them in the bag; vehicle recipes and shop items only unlock keys.
- Save v2: key 'dopamine-land-save-v1', JSON gains v:2.
  Load migrations: fruit-apple|peach|orange|pear|cherry → m_apple|…|m_pear; beehive → m_honey; star-shard → m_stardust.
  save() is debounced 400 ms and flushes on pagehide and visibilitychange. saveNow() exists for tests. state.on(fn) returns an unsubscribe; state.off(fn).
- Dex record: {count, best, first, variants?:{shiny?, crown?, tiny?}}. The bag holds variant keys `${id}@shiny|crown|tiny` separately. has(id) counts the base id only.
- Bag hook: state.canAdd?:(id, n)=>boolean, set by economy. collect() when canAdd is false: the dex is still recorded, the bag is not incremented, and it emits bag-full {id}.
- collect payload: {type:'collect', species, size, isNew, variant?, activity?, rarity}.
- ui.showCatch({species, sizeText?, model?, line?, size?, variant?, activity?, keep?:boolean /*false = witness: dex only*/}).
  hold() normalizes the model's longest side to 0.55 m. It uses 1.1 m when shadow is XL/XXL, or, when shadow is absent, when len >= 150.
  crown variant: adds art.crownMesh() on the held model.
- Game API:
  - onUpdate, onWorld and addProvider return unsubscribe functions. removeProvider(id).
  - Interaction gains id, whileMounted?, priority? (default 0).
  - While mounted, only whileMounted interactions are picked; otherwise E dismounts.
  - Picks game.current (best KeyE) and game.currentAlt (best non-E key, highest priority then nearest).
  - game.consumedKeys: Set of codes claimed this frame by current/currentAlt. The hotkey dispatcher skips them.
  - listInteractions(); interact(id).
  - The pure selection lives in src/core/interact.ts selectInteractions(cands, mounted).
  - Frame order (wave 1): chunks → pick interactions → run E/alt keys → module onUpdate hooks. Providers therefore see module state from the previous frame, and use() runs before the modules' own update in that frame.
- Player:
  - lock(owner)/unlock(owner) use a counter. The `locked` getter is owners>0 || legacy flag; the setter keeps legacy behaviour.
  - act(name, seconds).
  - Poses: fish, cast, reel, net, dig, shake, chop, hit, pick, pet, hold, cheer, stung, sit, sleep, eat, wave, photo, plant, water, peace.
- Ground providers: game.addGroundProvider(fn(x,z)=>number|null). The first non-null result wins over Island.heightAt. Used by Player teleport, the safety net, mount exit and the CameraRig ground clamp. The WORLD_BOUNDS clamp only applies when world==='earth' and no provider claims the point.
  - The phys-ground chunk collider is still built from Island.heightAt, not groundAt. An owner whose provider floor sits above the terrain (interiors, planets) must add its own physics.addStatic floor collider; otherwise only the safety net (snap when > 0.6 m below) and teleport respect the floor.
- Prompts: GameUI.setPrompt(primary, alt?) renders both in core #ui. hud wraps setPrompt and renders its own chips (one renderer at a time).
- engine.timeScale (default 1; multiplies dt only — t / game.time keeps running in real time, so things timed by t do not pause at timeScale 0). ctx.onTodChange(fn(name)) fires only when the name changes.
- window.__dl = { game, give(id,n), coins(n), stars(n), teleport(x,z), world(w), hour(h), advance(sec), list(), interact(id), unlockAll(), save() }.

4. EVENTS (src/core/events.ts typed union; emitted via game.state.emit)
Kept:
- register; collect; coins{delta, why}; bag{id, delta}
- sell{id, n, coins, shop}; buy{id, n, cost}; craft{id /*recipe*/, gives /*item id or unlock key*/, n}
- donate{id, n, coins, stars}; stars{delta, why}; unlock{key, why}
- chest-loot; chest-open{tier, at, loot, source}; request-done{id, coins, npc?}
- open-shop{shop}; open-museum; open-craft; open-board
New:
- Bag and clock: bag-full{id}; env{tod, weather, hour, day} (every game hour and on weather change at the player); day{day, prev}; tod{tod, prev}; weather{region, weather, prev}
- Catching: catch{activity, species, rarity, variant?, size?, combo, firstOfDay?}; catch-fail{activity}
- Harvest: harvest{kind, item, n, island, combo?}, where kind ∈ chop|rock|shake|fruit|flower|petal|vine|mushroom|spore|glowcap|fern|shell|feather|dig|balloon|bottle|moonrock|moonflower|stardust|meteor|seaweed|coral|pearl|honey|crater|junk
- World triggers: tree-shake{x, z, tree, island}; rock-hit{x, z, rock, combo, island}; beehive{x, z}; stung{}
- NPCs: npc-talk{npc}; befriend{id, hearts, kind:'npc'|'dino'}; gift{npc, item, delta}; clap{x, z} (★4 catch; nearby NPCs clap)
- World and travel: discover{place, name, kind:'island'|'landmark'|'islet'}; mount{vehicle}; dismount{vehicle}; summon{vehicle}; launch-wave{} (rocket at 0.5 s; NPCs wave); launch{to}; arrive{to}
- Survival: swim-rescue{}; oxygen-out{where:'sea'|'space'}
- UI: open-panel{kind, tab?, arg?}; open-shipyard{}; ui-open{kind}; ui-close{kind}
- Meta and calendar: mission-done{id}; missions-all{day}; achievement{id, stars}; set-complete{id}; weekday-event{id, active}; mail{id}
- Placement and development: place{item, where}; dev-stage{island, stage}; lighthouse{island, lit}
- Story, P1 and network: tino{state:'sleep'|'stir'|'wake'|'chase'}; release{species, n, where}; secret-found{id}; ending{}; photo{spot?, species?:string[]}; net-peer{state}; net-coop{kind, data}
Weekday-event ids (fixed): 0 'petalrain' (Mon, home petal pickups + petal-tag species ×2), 1 'migration' (Tue), 2 'sandtemple' (Wed), 3 'firefly' (Thu), 4 'whaleroad' (Fri), 5 'pirate' (Sat, extra silver chests at ghost ship, spawned by seaworld), 6 'meteor' (Sun, meteor night + launch stardust ×2).
Secret ids (fixed):
- Home: home-waterfall-cave, home-cliff-beach, home-fairy-ring
- Dino: dino-lava-garden, dino-mural-cave, dino-bubble-cave
- Ice: ice-mammoth, ice-aurora-cave, ice-avalanche
- Mushroom: mush-moon-deck, mush-swamp-hut, mush-tree-room
- Coral: coral-clam, coral-pirate-cave, coral-sandbar
- Desert: desert-temple, desert-water-cave, desert-trex
- Launch: launch-meteorite, launch-glide, launch-probe (emitted by seaworld when the black box is taken)

5. UI REGISTRY (src/core/registry.ts → game.hud)
HudRegistryStore methods:
- Panels: registerPanel(def, opts?:{replace?:boolean}). A duplicate kind without replace is ignored with console.warn.
- Panel control: open(kind, tab?, arg?); close(); isOpen(kind?); current()
- Side column: registerChip({id, order, render(el), update?(el, dt)})
- Hotkeys: registerHotkey({code, label, hint?, when?(), run()})
- Map: registerMapLayer({id, draw(g2, toPx, scale, world)})
- Presentation: banner({text, sub?, icon?, color?, ms?}); card({title, body, icon?, color?, ms?}); gauge(id, {label, value 0..1, color, show}); toast(text); showRegion(name, sub, color, dark?)
- Before attach, everything is queued. open() remembers only the last request.
Types:
- PanelDef {kind, title, color, icon?, defaultTab?, tabs?(), meta?(), render(body, ctx), onOpen?(arg), onClose?()}
- PanelCtx {tab, sel, arg, setSel, rerender, close, h:HudHelpers}
- HudHelpers {esc, fmt, ico(id), name(id), color(id), confetti(el, colors, n), button(html, onClick), thumb?(id)}
attach(impl:HudRenderer), with HudRenderer = { openPanel(def, ctx); closePanel(); showBanner(b); showCard(c); setGauge(id, g); refreshChips(); toast(text); showRegion(...); drawLayersHint?() }. attach drains the queue in order: panels, chips, hotkeys, layers, then the queued open, banners, cards and gauges.
Hotkeys (GDD 3.11):
- B dex; Tab bag (I = legacy alias for bag); E use; F alt interaction / summon; G quality; V cam; C dive; M map; J journal; P photo; N mute; K mail; H home deco (placement mode); Esc close.
- The dispatcher uses game.input, skips codes in game.consumedKeys, skips while a text input is focused, and skips while player.locked unless the hotkey is the open panel's own.
KeyF priority for alt interactions: dino mount 30, balloon slingshot 20, chop 10, others 0. F summon runs only when no KeyF interaction is current this frame.
HUD windows lock with player.lock('hud').

6. ECONOMY API (EconApi). Economy owns all currencies.
Wave-2 core (econ-service):
- Currencies: stars; stamps; keys {silver, gold, rainbow} (pieces; 3 pieces = 1 key); addStars(n, why); spendStars(n, why); addKeyPiece(color, n); keyCount(color); useKey(color)
- Costs: Cost {coins?, stars?, items?}; canAfford(c); spend(c, why)
- Bag: bag {size, used, free, canAdd(id, n=1), stackMax(id) (creature 10, material 30, tool 1), isTool(id), belt():string[] (tool_* go to the 5-slot belt, not the bag)}
- Giving: give(id, n, why?, o?:{silent?}):number. Respects the bag, toasts '가방이 꽉 찼어요!', returns the amount added. All world pickups use econ.give, falling back to state.addItem.
- Day and market: day(); market() {day, hot[3], mult}
- Prices: priceOf(id, o?:{size?, variant?, where?:'home'|'island'|'farsea'|'space'|'friend'}). id may carry an @variant. Space goods ×1.8 when sold on earth; ZONE multiplier; other-island specialty fruit base 300.
- Selling and shops: sell(id, n, shop='quack'); sellAll(ids?, shop?); shopItems(shop); shopPrice(id):Cost; canBuy(id):{ok, why?}; buy(id)
- Crafting: recipes(); needsOf(rid); canCraft(rid); craft(rid)
- Museum: isDonated(id); canDonate(id); donate(id)
- Unlocks: isUnlocked(key); unlock(key, why?); requirement(key):{ok, text}; rocket():{blueprint, parts:{body, engine, window, wing, fuel, chip}, count, pad}
- Catching: rollCatch(q):RollResult; reportCatch(r); catchFail(activity); pity(activity):{since3, since4, since5, gauge}; combo
- Chests and requests: openChest(tier?, where?); requests(); fulfill(rid)
- Misc: flags(); p0; cheat
Wave 3A (econ-chests) adds:
- Chests: chestTiers; addChestArea({id, island, x, z, r, n, tier?}); chestPity():{wood, gauge}
- Museum and fossils: museum():{wings:[{id, got, total, milestones}]}; skeletonsDone()
- Requests and guest: requestsFor(npcId); guest():{id}
Wave 4 (econ-p1) adds:
- Use and buffs: use(id); addBuff(name, gameMinutes); buffs():Array<{name, until}>
- Storage and placement: storage {size, list(), put(id, n), take(id, n)}; release(id); display(id, on); invest(island, cost)
- Capsule and figurines: capsule.roll(); figurine(id)
Callers guard these with `?.`.
RollQuery {activity:'fish'|'bug'|'dive'|'space'|'moonfish'; pool:Species[]; bait?; buffs?; rng?; junk?; luckMult?}.
RollEnv (built by economy) {day, hour, tod, weather, p0, guestId?, boostTags?:Record<tag,mult> (from ext.calendar?.boosts()), isUnlocked(key), rng(key)}.
RollResult {species, rarity, junk?, size?, variant?, combo, pityHit?, firstOfDay?}.
Algorithm (GDD 5.2/5.3), implemented in economy/roll.ts:
- Rarity weights W = {1:55, 2:27, 3:12, 4:5, 5:1}. Drop species whose where[].dev is locked.
- Weather: weather.only filter; weather.boost ×3.
- Bait: dough ★2+ ×1.3; lure ★3+ ×1.5; golden ★5 ×3. Buffs: grilled ★3+ ×1.2; friend ×1.1.
- Combo: from 5 streak, +2% per catch for ★3+, max +20%.
- Pity per activity: since3 >= 19 forces ★3+; since4 >= 79 forces ★4+; since5 ramps from 300 to guaranteed ★5 at 399.
- First catch of the day per activity is ★3+. If no candidate exists at the rolled rarity, fall back to r-1… then r+1.
- Within a rarity: guest ×5, boostTags multiplier.
- Size Normal(len, 0.15·len). crown when z > 2.33, tiny when z < -1.88. shiny 1/256 × luckMult.
- Junk (fish only): 8% with bait, 12% without; t_boot 35 / t_can 35 / m_seaweed 15 / t_rustykey 10 / t_bottle 5.
- rng key `roll:${activity}:${day}:${count}`.
Unlock keys:
- Tools: tool:rod tool:net tool:shovel tool:hammer tool:slingshot tool:snorkel tool:wetsuit tool:goodrod tool:goldrod tool:goodnet tool:goldnet tool:wateringcan
- Vehicles: v:bike v:scooter v:kart v:raft v:duck_tube v:tugboat v:yacht v:motorboat v:jetski v:submarine v:sled v:buggy v:balloon v:plane v:rover v:ufo v:dino_<id>; licence:<kind>
- Rocket and space: rocket:blueprint rocket:part:body|engine|window|wing|fuel|chip rocket:pad space:moon space:planet:<id>
- Other: dino:<id>; wing:aquarium|bug|fossil|sea|astro; lighthouse:<island>; dev:<island>:<1-5>; facility:<id>; recipe:<rid>; house:<1-4>; bag:30|40|50; invite:<n>
Unlock rules:
- Items with an `unlock` field auto-unlock on craft or buy.
- Starter kit on a fresh save: tool_rod + tool_net and their keys.
- Soft progression: islands are reached by vehicle; swim stamina limits swimming; there is no hard island lock.
Shops (ShopItem.shop):
- quack (home), shipyard, peng (blueprint 20★ P0 / launch pad 30,000 P0, gated on 6 parts)
- beach, bazaar (desert; incl. shop_buggy), diving (coral; snorkel, wetsuit, shop_submarine)
- potion (mushroom), moon (떡순이), junk (raccoon), station (꾸물이), sheep (cosmetics), capsule
Facility shops work from the start as a stall (counter plus NPC). islanddev stage ③ only upgrades visuals and adds a bonus.

7. FLAGS NAMESPACES (one owner each)
- Economy and clock: econ (economy; roll state in econ.roll); env (atmosphere {sec})
- World and nature: world (worldterrain {disc}); flora (flora); treasure (treasure, incl. popped, crater); garden
- Vehicles and creatures: vehicles {owned, at, skins}; dino {hearts, dayGain, fed, tinoFish, eggs}; ocean (ocean; migrates 'ocean.jar.*'); fishing; insects {released}; space; planets; seaworld
- Characters and story: npc (characters {id:{f, met, last, gifts}}); story
- Systems: meta; calendar; interiors; dev (islanddev; incl. travel nodes); secrets; hidden
- UI and network: hud {variants seen, dex filter}; ui {tutorial, hudHidden}; photo {album metadata; images in IndexedDB 'dopamine-land-photos'}; net {guestbook}
- Audio volumes live in localStorage 'dopamine-land:audio'.

8. IDS AND MODULE ORDER
- Providers, interactables and chunk keys are prefixed with the module name.
- Item prefixes: m_ materials; t_ junk; tool_; bait_; seed_; f_ furniture; p_ parts (non-vehicle); it_ misc (it_capsule, it_oxygen, it_starpiece_1..7, it_map_<n>, it_letter_<n>, it_blackbox, it_invite); fos_ fossils; cos_ cosmetics; skin_<kind>_<n>.
- Module order: audio 1, worldterrain 2, village 4, flora 6, vehicles 6, economy 9, onboarding 11, hud 12, ocean 12, hudfx 13, interiors 14, characters 20, treasure 25, fishing/insects/dinos 30, secrets 30, hidden 31, garden 32, seaworld 35, space 40, planets 42, flight 43, calendar 45, meta 46, islanddev 47, story 48, atmosphere 50, netplay 60, netplay-play 61, photo 60.

9. DEBUG HOOKS (window.__<name>; required)
- Core and services: __dl (core); __env {advance, setHour, force(w)}; __econ {give, unlock, state()}; __hud {open, cards()}; __geo {zoneAt, disc()}
- World content: __flora {chopNearest, hitNearest, rocks()}; __treasure {spawn(kind), digs()}; __village {stage(n), light(id)}
- Vehicles and travel: __vehicles {mount(kind), summon(kind), list}; __space {goPad, pond(i)}
- Creatures and NPCs: __fishingDebug {catchNow, goto(zone)}; __insects {spawnAt, catchNear}; __dinos {feed, tino(state)}; __ocean {dive(x,z), oxygen()}; __chars {talk(id)}
- P1 and later modules: __meta; __calendar; __interiors; __seaworld; __planets; __flight; __story; __secrets; __hidden; __garden; __islanddev; __net; __photo

10. INTEGRATION NOTES — Integration notes (wave 6, loop-integration)
GDD 4.9 P0 10-step loop automation:
- CI gate: tests/loop.test.ts (node). tests/loop/boot.ts boots 24 real modules in contract order on the tests/kit fake game. It uses a real ChunkManager (chunks stream around the player), a tiny DOM stand-in (tests/loop/dom.ts) and core makeDebugApi for __dl. hud, hudfx, atmosphere and photo are left out because they need a real screen; env is the kit fake clock.
- Shared step definitions: tests/loop/steps.mjs (STEPS 1..10 + makeHelpers). They drive the game only through window.__* hooks and __dl, so the same source runs in node and in the browser. Each step also runs a ledger check: the coins/stars event deltas inside the step must equal the change in the balance.
- Local browser run: `npm run loop` (scripts/loop.mjs). It opens /?fresh=1&p0=1&live=1. ANGLE is metal on darwin and d3d11 on win32. It runs step 0 (every section 9 hook, incl. __env, __hud and __photo) and then steps 1..10, writing shots/loop/stepNN.png (plus stepNN-<label>.png mid-step shots). It also collects window.__errors. `--cheat` runs 9..10 with ?cheat=1; `--only 4,5` runs a subset.
- Debug grants in the plain P0 run, logged as step notes: rocket-part materials for 5 islands (stand-in for the island tour) and the coins still short of the 30,000 launch pad. Everything else is earned in the loop, including stars from dex and donations and 3 zodiac fish rolled at the night crater. ?cheat=1 needs no grants.
Fixes:
- core/game.ts: window.__dl is now built by exported makeDebugApi(host). The API is the same, and host can be the real Game or a tests/kit fake game. Additions for the loop: where(id)/goto(id, back) (the position of a point interactable / teleport next to it), places {PLACES, HERO, ISLANDS}, mark()/events(since, type?) (a slim state-event log; species objects become ids) and layers/locks/timeScale (unchanged).
- fishing.ts (__fishingDebug): catchNow() and pool() kept using a stale cur.plan after the first catch, so on the moon they still rolled the earth river pool. They also read the zone at the player's feet (the bank: 'flower' → pond fallback) instead of at the cast point. They now use a fresh plan when idle and the zone where the bobber would land (same as onCast).
- flora (__flora / ext.flora): added pickDrop(maxD = 6). Shaken fruit could only be picked up through the E provider 'flora-pick'; there was no hook to pick it headless.
- calendar/data.ts: the welcome mail from 곰 몽실 (first morning) now also carries m_vine ×1. Vines grow only on coral/mushroom trees (GDD 3.4), but the raft that reaches those islands needs 1 vine (GDD 4.9 step 7). Without this, a fresh P0 save could not craft the raft except through a lucky chest.
- Loop facts (no code change): chopping and rock hitting need tool:hammer, which is not in the starter kit. The loop buys it at quack (P0 120) with chest/catch coins in step 4. Zodiac fish appear only at night (GDD 3.5.8).
Rule checks in tests/loop.test.ts: module order matches section 8. The section 9 hooks exist. Species ids follow GDD prefixes per category (f_ b_ d_ z_ s_ fos_, or gdd: with that prefix); items use the section 8 item prefixes. The only exceptions are v1 legacy ids that existed before contract v2 (fish-*, sea-*, bug-*, fossil-*, 7 old space ids).

11. INTEGRATION NOTES — wave 6 gate (perf audit + loop)
- P0 step 7 (raft vine) depends on the calendar welcome mail (calendar order 45). tests/loop/steps.mjs step 4 now fails outright when __calendar is missing, so a disabled calendar shows up at step 4 instead of step 7. Long term a P0 vine source on the home island would remove this dependency (tests/flora-harvest.test.ts currently pins vineTree('palm0','home') === false).
- quality.planReach on low deviates from the literal brief ("skip detail:true layers beyond their innerRadius"): skipping every inner-ring layer emptied the island of trees beyond ~42 m, so low skips only the middle LOD ring, pulls the far ring inward to fill the gap, and drops small far rings (outer radius < 200 m). Accepted at the gate.
- core/chunks.ts: trimSmallShadows(root, minR) turns castShadow off for meshes whose bounding radius (relative to root) is below minR. Residents use 0.16 × scale (they already have a blob shadow); vehicles use 0.28 m.
- characters/residents.ts registers each resident container with game.chunks.lod (far 90 m, at = live position). Far residents are hidden and their update is skipped (Live.sleeping) unless talking.
- hudfx: queued discover cards are tagged with their world ('moon:'/'planet:' places → space) and dropped on a world switch, so earth landmark cards no longer appear after landing on the moon.
- engine __perf.adaptive(true) now also puts the renderer back at the governor cap.
- tests/loop.test.ts (plain P0): steps 9 and 10 fail if a zodiac fish or the mochi crucian had to be forced with catchNow ('바로 낚음' notes).

12. INTEGRATION NOTES — wave 7 (UX polish: boot/title, minimal HUD + 말랑 주머니, onboarding)
Boot and title:
- index.html carries a pure HTML/CSS loader (#boot) and title layer (#title); the canvas (#dl-world) stays at opacity 0 until ready. src/core/boot.ts (no three import) holds BootScreen (honest stages), TitleScreen, skipTitle() and the camera-path math.
- Game.started (typed by declaration merging in core/events.ts): main sets it false right after new Game, and true together with the new state event 'game:start' {skipped}. Automation (navigator.webdriver, shot=1, intro=0, cam=…, game=0) skips the title and starts at once (skipped:true); intro=1 forces the title. Modules that gate on it must treat undefined as started (hud: startedOf(v) = v !== false).
- tests/kit FakeGame: started = true by default; start(skipped = true) sets it and emits 'game:start'.
- Engine: loadModules(onProgress) fetches modules in parallel and builds them in order; Engine.prefetchModules; lazy lil-gui (buildGui/toggleGui, ?dev=1 or Backquote); engine.moduleMs per-module build times.
HUD (additive API, core/api.ts + registry.ts):
- PanelDef.badge?(): ring badge; PanelDef.app?: false | {order} (false = opens only at a place, not in the pocket ring).
- ChipDef.peek?: boolean | 'live' (false = only hud.peek(id) shows it; 'live' = visible while it has content, e.g. vehicles:wind).
- HudRegistry: peek(id, ms?), hint(opts: HintOpts {id, text, keys, ttl, priority, again, until, anchor?}) → true if hud draws it, hideHint(id), stageBusy(), stageClaim(ms, tag?) — big banners/region names/centre cards take the stage one at a time. Matching optional HudRenderer methods.
- Keys: Tab = 말랑 주머니 (POCKET_KIND 'pocket'; opening emits ui-open {kind:'pocket'}), I = 가방, B = 도감, M = 지도, Esc = 닫기, Backslash (\) = HUD 숨기기. Backquote (`) belongs to the dev panel only.
- The always-on 💾 chip is gone; the save panel opens from the '💾 세이브 코드' button in the 친구 panel.
- AudioApi.muted?: read-only mute state (AudioService getter).
Onboarding (order 11): game.ext.onboarding = {buddy, anchor(), active()}; flags.onboarding = {v:1, done, play}; window.__onboarding. Off under shot=1 or onb=0 (onb=1 forces it). It delegates bubbles to hud.hint when accepted (its own 3D star hides), ?onbview=own draws its own view.
