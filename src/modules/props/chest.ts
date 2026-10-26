// 보물상자(도파민랜드 주인공 소품): 둥근 나무 상자 + 금색 띠·자물쇠, 살짝 열린 뚜껑 틈으로 따뜻한 빛과 금빛 반짝이.
import * as THREE from 'three';
import { rbox, grad, part, roundExtrude, roundRectShape, blob, canvasTex } from './kit';

const W = 0.84, H = 0.42, D = 0.56;
const LID_H = 0.2;
const BAND_X = W / 2 - 0.14;

/** 뚜껑 단면(뒤 경첩 0 → 앞 D, 위로 둥근 반타원) */
function lidShape(depth: number, height: number, grow = 0): THREE.Shape {
  const s = new THREE.Shape();
  const r = depth / 2 + grow, cx = depth / 2;
  s.moveTo(cx - r, -grow * 0.5);
  s.lineTo(cx + r, -grow * 0.5);
  s.absellipse(cx, -grow * 0.5, r, height + grow, 0, Math.PI, false, 0);
  s.closePath();
  return s;
}

function lidGeo(width: number, grow: number, bevel: number): THREE.BufferGeometry {
  const g = roundExtrude(lidShape(D - 0.03, LID_H, grow), width, bevel, 40);
  g.rotateY(-Math.PI / 2); // 단면 x → 상자 +z, 밀기 방향 → 상자 x
  return g;
}

function sparkleTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,240,200,1)');
    r.addColorStop(0.25, 'rgba(255,200,110,0.45)');
    r.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
}

export interface ChestOpts {
  rng: () => number;
  onUpdate: (fn: (t: number) => void) => void;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function buildChest(o: ChestOpts): THREE.Group {
  const root = new THREE.Group();
  root.name = 'chest';

  // ── 몸통: 둥근 판자 세 장을 쌓아 결 사이 홈이 부드럽게 보이게
  const plankCols = ['#b57a4c', '#c08657', '#c98f60'];
  const ph = H / 3;
  for (let i = 0; i < 3; i++) {
    const g = rbox(W, ph + 0.012, D, 0.04, 5);
    grad(g, new THREE.Color(plankCols[i]).multiplyScalar(0.82), plankCols[i], 0.8);
    const m = part(g, 'wood');
    m.position.y = ph * (i + 0.5);
    root.add(m);
  }
  // 안쪽 어두운 속(뚜껑 틈으로 보이는 테두리)
  const inner = part(rbox(W - 0.1, 0.03, D - 0.1, 0.012, 2), 'matte', '#5a2f16');
  inner.position.y = H + 0.002;
  root.add(inner);

  // ── 금색 띠: 양옆 세로 띠 + 바닥 테
  for (const sx of [-1, 1]) {
    const band = part(rbox(0.09, H + 0.02, D + 0.03, 0.035, 4), 'gold');
    band.position.set(sx * BAND_X, H / 2, 0);
    root.add(band);
  }
  const foot = part(rbox(W + 0.035, 0.07, D + 0.035, 0.034, 4), 'gold');
  foot.position.y = 0.035;
  root.add(foot);
  const rim = part(rbox(W + 0.02, 0.045, D + 0.02, 0.02, 3), 'gold');
  rim.position.y = H - 0.012;
  root.add(rim);

  // ── 자물쇠 판 + 열쇠 구멍
  const plate = part(roundExtrude(roundRectShape(0.17, 0.19, 0.06), 0.045, 0.016), 'gold');
  plate.position.set(0, H - 0.1, D / 2 + 0.012);
  root.add(plate);
  const holeC = part(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 24).rotateX(Math.PI / 2), 'matte', '#3a1f0e');
  holeC.position.set(0, H - 0.085, D / 2 + 0.036);
  root.add(holeC);
  const holeS = part(rbox(0.018, 0.05, 0.02, 0.008, 2), 'matte', '#3a1f0e');
  holeS.position.set(0, H - 0.115, D / 2 + 0.036);
  root.add(holeS);

  // ── 속에 보이는 금화 더미
  const mound = part(blob(0.26, 0.42, 0.1, 4.2, 4), 'treasure');
  mound.scale.set(1.3, 1, 0.85);
  mound.position.set(0, H + 0.01, 0.02);
  root.add(mound);
  const rnd = o.rng;
  // 더미 위 금화(봉긋한 면을 따라)
  for (let i = 0; i < 16; i++) {
    const coin = part(new THREE.CylinderGeometry(0.048, 0.048, 0.014, 28), 'gold');
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.27;
    const x = Math.cos(a) * r * 1.25, z = Math.sin(a) * r * 0.75 + 0.03;
    const top = 0.1 * Math.max(0, 1 - (r / 0.3) ** 2);
    coin.position.set(x, H + 0.02 + top + rnd() * 0.012, z);
    coin.rotation.set((rnd() - 0.5) * 0.9 - z * 1.5, rnd() * 3, (rnd() - 0.5) * 0.9 + x * 0.8);
    root.add(coin);
  }
  // 앞 테두리에 걸쳐 흘러나온 금화 두 닢
  for (const [x, rz] of [[-0.12, 0.5], [0.16, -0.4]] as const) {
    const coin = part(new THREE.CylinderGeometry(0.048, 0.048, 0.014, 28), 'gold');
    coin.position.set(x, H + 0.03, D / 2 - 0.02);
    coin.rotation.set(0.9, 0, rz);
    root.add(coin);
  }
  // 풀밭에 떨어진 금화 셋(눕거나 비스듬히)
  for (const [x, z, tilt] of [[0.42, D / 2 + 0.22, 0.12], [0.6, D / 2 + 0.05, 0.25], [-0.36, D / 2 + 0.3, 0.08]] as const) {
    const coin = part(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 28), 'gold');
    coin.position.set(x, 0.012 + tilt * 0.05, z);
    coin.rotation.set(tilt, rnd() * 3, tilt * 0.5);
    root.add(coin);
  }
  // 분홍 하트 보석(둥근)
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.05);
  heart.bezierCurveTo(-0.07, 0.0, -0.05, 0.055, 0, 0.03);
  heart.bezierCurveTo(0.05, 0.055, 0.07, 0.0, 0, -0.05);
  const gem = part(roundExtrude(heart, 0.04, 0.016, 20), 'gloss', '#ff6f9c');
  gem.position.set(0.13, H + 0.13, 0.05);
  gem.rotation.set(-0.5, -0.3, 0.2);
  root.add(gem);

  // ── 뚜껑(뒤 경첩에서 열림) — 살아 있는 조각
  const lid = new THREE.Group();
  lid.userData.live = true;
  lid.position.set(0, H, -D / 2 + 0.015);
  const lidBody = part(lidGeo(W, 0, 0.05), 'wood');
  grad(lidBody.geometry, '#b17a4f', '#d6a170', 0.9);
  lid.add(lidBody);
  for (const sx of [-1, 1]) {
    const lb = part(lidGeo(0.09, 0.032, 0.03), 'gold');
    lb.position.x = sx * BAND_X;
    lid.add(lb);
  }
  // 뚜껑 앞 걸쇠
  const hasp = part(roundExtrude(roundRectShape(0.11, 0.12, 0.04), 0.035, 0.012), 'gold');
  hasp.position.set(0, 0.0, D - 0.005);
  lid.add(hasp);
  // 뚜껑 안쪽 면(빛 받는 어두운 나무)
  const lidIn = part(rbox(W - 0.08, 0.02, D - 0.1, 0.01, 2), 'matte', '#7a4322');
  lidIn.position.set(0, 0.004, D / 2 - 0.01);
  lid.add(lidIn);
  root.add(lid);

  // ── 빛: 틈 사이 발광 판(HDR → 블룸)
  const glowMat = new THREE.MeshBasicMaterial({
    map: sparkleTex(), color: new THREE.Color().setRGB(3.0, 2.0, 0.8), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.25, D * 1.5).rotateX(-Math.PI / 2), glowMat);
  glow.position.set(0, H + 0.006, 0.04);
  glow.userData.live = true;
  root.add(glow);

  // 빛 번짐 후광(얼굴을 향하는 판)
  const haloMat = new THREE.SpriteMaterial({
    map: sparkleTex(), color: new THREE.Color().setRGB(0.55, 0.32, 0.12), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(1.1, 0.8, 1);
  halo.position.set(0, H + 0.16, 0.1);
  halo.userData.live = true;
  halo.userData.noCurve = true;
  root.add(halo);

  // 틈에서 위로 퍼지는 옅은 빛줄기(세로 판 몇 장, 위로 갈수록 사라짐)
  const rayMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main() {
        float across = sin( vUv.x * 3.14159 );
        across *= across;
        float up = pow( 1.0 - vUv.y, 1.6 ) * smoothstep( 0.0, 0.08, vUv.y );
        float stripes = 0.65 + 0.35 * sin( vUv.x * 19.0 + uTime * 0.9 ) * sin( vUv.x * 7.0 - uTime * 0.6 );
        float a = across * up * stripes * 0.32;
        gl_FragColor = vec4( vec3( 1.9, 1.35, 0.6 ) * a, a );
      }`,
  });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1);
    g.translate(0, 0.5, 0);
    // 위로 갈수록 넓어지는 사다리꼴
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) > 0.5) p.setX(k, p.getX(k) * 1.5);
    const ray = new THREE.Mesh(g, rayMat);
    ray.scale.set(W * 0.82, 0.75 + i * 0.12, 1);
    ray.position.set(0, H + 0.02, 0.05 + i * 0.07);
    ray.rotation.set(-0.42 + i * 0.12, 0, 0);
    ray.userData.live = true;
    ray.renderOrder = 2;
    root.add(ray);
  }

  const light = new THREE.PointLight('#ffb35a', 2.2, 3.2, 1.6);
  light.position.set(0, H + 0.2, 0.18);
  light.userData.live = true;
  root.add(light);

  // ── 금빛 반짝이 입자(t 로 떠오르고 깜빡임)
  const N = 34;
  const pg = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    pos.set([(rnd() - 0.5) * W * 0.8, H + 0.05, (rnd() - 0.3) * D * 0.6], i * 3);
    seed.set([rnd(), rnd()], i * 2);
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 900 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScale;
      attribute vec2 aSeed;
      varying float vA; varying float vTw;
      void main() {
        float life = fract( uTime * ( 0.22 + 0.12 * aSeed.y ) + aSeed.x );
        vec3 transformed = position;
        float ang = aSeed.x * 40.0 + uTime * ( 0.8 + aSeed.y );
        transformed.x += sin( ang ) * 0.06 * life + transformed.x * life * 0.35;
        transformed.z += cos( ang ) * 0.06 * life + 0.12 * life;
        transformed.y += life * ( 0.7 + 0.5 * aSeed.y );
        vA = smoothstep( 0.0, 0.15, life ) * ( 1.0 - smoothstep( 0.55, 1.0, life ) );
        vTw = 0.6 + 0.4 * sin( uTime * 9.0 + aSeed.y * 30.0 );
        #include <project_vertex>
        gl_PointSize = uScale * ( 0.05 + 0.05 * aSeed.y ) / -mvPosition.z;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vTw;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = length( p );
        float core = exp( -d * d * 18.0 );
        float rays = exp( -abs( p.x ) * 14.0 ) * exp( -abs( p.y ) * 2.5 ) + exp( -abs( p.y ) * 14.0 ) * exp( -abs( p.x ) * 2.5 );
        float a = ( core + rays * 0.55 * vTw ) * vA;
        if ( a < 0.003 ) discard;
        gl_FragColor = vec4( vec3( 3.2, 2.4, 1.0 ) * a, a );
      }`,
  });
  const sparks = new THREE.Points(pg, pMat);
  sparks.frustumCulled = false;
  sparks.userData.live = true;
  root.add(sparks);

  o.onUpdate((t) => {
    // 뚜껑이 안에서 밀리는 듯 아주 살짝 숨 쉰다
    lid.rotation.x = -(0.62 + 0.035 * Math.sin(t * 1.6) + 0.015 * Math.sin(t * 4.1));
    const flick = 0.92 + 0.08 * Math.sin(t * 3.3) * Math.sin(t * 1.7 + 1.0);
    light.intensity = 2.2 * flick;
    glowMat.color.setRGB(3.0 * flick, 2.0 * flick, 0.8 * flick);
    pMat.uniforms.uTime.value = t;
    rayMat.uniforms.uTime.value = t;
    // 화면 높이 기준 점 크기(px/m)
    pMat.uniforms.uScale.value = o.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(o.camera.fov) / 2));
  });

  return root;
}
