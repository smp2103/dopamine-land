// 달 하늘: 크게 뜬 지구(우리 군도가 보이는 파란 구) · 토성 · 분홍·민트 행성 · 은하수 띠 · 반짝 별.
// 카메라를 따라다녀 무한히 멀리 보인다(곡률 없음 noCurve). 캔버스가 없는 곳(테스트)에선 단색 텍스처로 대신한다.
import * as THREE from 'three';

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** w×h 캔버스에 그려 텍스처로. DOM 이 없으면 1px 단색 */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, c: HTMLCanvasElement) => void, fallback = '#8fd3f4'): THREE.Texture {
  if (hasDom()) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) {
      draw(g, c);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    }
  }
  const col = new THREE.Color(fallback);
  const t = new THREE.DataTexture(new Uint8Array([col.r * 255, col.g * 255, col.b * 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

const skyMat = <M extends THREE.Material>(m: M): M => { m.userData.noCurve = true; (m as unknown as { fog: boolean }).fog = false; return m; };

export interface MoonSky {
  group: THREE.Group;
  earth: THREE.Group;
  /** 매 프레임: 카메라를 따라가고 지구를 돌린다. hour 로 지구 높이가 살짝 오르내린다 */
  update(t: number, cam: THREE.Vector3, hour: number): void;
}

/** 지구 방향(달 중심에서 본 방위 — 기본 시선 -Z 오른쪽 위, 지구 전망 언덕(-200,-100)에선 정면에 가깝게) */
export const EARTH_DIR = new THREE.Vector3(0.24, 0.05, -1).normalize();

export function makeMoonSky(rng: (k: string) => () => number): MoonSky {
  const group = new THREE.Group();
  group.name = 'moon-sky';
  group.userData.noCurve = true;
  const earth = makeEarth();
  earth.name = 'moon-earth';
  group.add(earth);
  const saturn = makeSaturn();
  saturn.position.set(-2300, 900, -2400);
  group.add(saturn);
  const pinkP = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#ffc4dd', '#ffd9e8', '#f7b0d0', '#ffe4ee']), roughness: 0.8, emissive: '#ff9fc8', emissiveIntensity: 0.35 })));
  pinkP.position.set(900, 2000, 2600);
  group.add(pinkP);
  const mintP = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 24), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#a8f0de', '#d4fff1', '#8fe0cc']), roughness: 0.8, emissive: '#8fe0cc', emissiveIntensity: 0.15 })));
  mintP.position.set(-2600, 700, 900);
  group.add(mintP);
  // 은하수 띠
  {
    const mr = rng('space:milky');
    const mt = canvasTex(2048, 512, (x) => {
      for (let i = 0; i < 520; i++) {
        const u = mr() * 2048, w = 0.5 + 0.5 * Math.sin(u / 2048 * Math.PI * 4 + 1);
        const vv = 256 + (mr() + mr() + mr() - 1.5) * 70 * (0.6 + w * 0.6) + Math.sin(u * 0.004) * 30;
        const r = 20 + mr() * 70;
        const col = ['255,170,220', '160,200,255', '200,170,255', '255,230,200'][Math.floor(mr() * 4)];
        const gr = x.createRadialGradient(u, vv, 0, u, vv, r);
        gr.addColorStop(0, `rgba(${col},${0.05 + 0.07 * w})`); gr.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = gr; x.fillRect(u - r, vv - r, r * 2, r * 2);
      }
      for (let i = 0; i < 2600; i++) {
        const u = mr() * 2048, vv = 256 + (mr() + mr() + mr() + mr() - 2) * 70 + Math.sin(u * 0.004) * 30;
        x.fillStyle = `rgba(255,255,255,${0.25 + mr() * 0.6})`; x.fillRect(u, vv, mr() < 0.1 ? 2 : 1, mr() < 0.1 ? 2 : 1);
      }
    }, '#000000');
    mt.wrapS = THREE.RepeatWrapping;
    const band = new THREE.Mesh(new THREE.SphereGeometry(3600, 64, 32), skyMat(new THREE.MeshBasicMaterial({ map: mt, transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, opacity: hasDom() ? 0.95 : 0 })));
    band.rotation.set(1.05, 0.4, 0.35);
    band.renderOrder = -1;
    band.userData.noCurve = true;
    group.add(band);
  }
  // 반짝 별(4갈래 스프라이트)
  const sparkTex = sparkleTex();
  const twinkles: THREE.Sprite[] = [];
  const twR = rng('space:twinkle');
  const twCols = ['#ffffff', '#fff2b0', '#ffd0ea', '#c8e4ff'];
  for (let i = 0; i < 70; i++) {
    const a = twR() * 6.28, el = 0.12 + twR() * 1.2, d = 3800;
    const s = new THREE.Sprite(skyMat(new THREE.SpriteMaterial({ map: sparkTex, color: twCols[i % 4], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.position.set(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
    const base = 30 + twR() * twR() * 110;
    s.scale.setScalar(base);
    s.userData = { base, ph: twR() * 6.28, noCurve: true };
    twinkles.push(s);
    group.add(s);
  }
  group.traverse((o) => { o.userData.noCurve = true; });
  const dir = new THREE.Vector3();
  return {
    group, earth,
    update(t, cam, hour) {
      group.position.copy(cam);
      // 지구: 하루에 한 번 살짝 오르내린다(아침·낮엔 높이, 밤엔 수평선 가까이 — 늘 보이게)
      const up = 0.05 + 0.035 * Math.sin(((hour - 6) / 24) * Math.PI * 2);
      dir.copy(EARTH_DIR); dir.y = up; dir.normalize();
      earth.position.copy(dir).multiplyScalar(2700);
      earth.userData.clouds.rotation.y = t * 0.01;
      earth.rotation.y = 0.6 + t * 0.004;
      saturn.rotation.y = t * 0.003;
      for (const s of twinkles) s.scale.setScalar(s.userData.base * (0.75 + 0.35 * Math.sin(t * 2.3 + s.userData.ph)));
    },
  };
}

function makeEarth() {
  const g = new THREE.Group();
  const map = canvasTex(1024, 512, (x) => {
    const grd = x.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#9fe4ff'); grd.addColorStop(0.5, '#4fb8f5'); grd.addColorStop(1, '#9fe4ff');
    x.fillStyle = grd; x.fillRect(0, 0, 1024, 512);
    // 군도: 둥글둥글 섬 블롭(모래 테두리 + 초록)
    const blob = (cx: number, cy: number, r: number, n: number, seed: number) => {
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
        const a = seed + i * 2.39, d = r * 0.6 * Math.sqrt((i + 0.5) / n);
        const bx = cx + Math.cos(a) * d * 1.4, by = cy + Math.sin(a) * d, br = r * (0.35 + 0.25 * Math.sin(seed + i));
        x.fillStyle = pass === 0 ? '#fbe9b0' : i % 3 ? '#7fd67a' : '#9ce07a';
        x.beginPath(); x.arc(bx, by, br + (pass === 0 ? 6 : 0), 0, Math.PI * 2); x.fill();
      }
    };
    blob(220, 200, 110, 14, 1); blob(300, 340, 70, 8, 3); blob(560, 190, 130, 16, 5); blob(620, 330, 80, 9, 7); blob(820, 250, 90, 10, 9); blob(900, 380, 40, 5, 2);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 26); x.fillRect(0, 490, 1024, 22);
  }, '#4fb8f5');
  const earth = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: '#3a8fd8', emissiveIntensity: 0.3 })));
  g.add(earth);
  const cmap = canvasTex(1024, 512, (x) => {
    for (let i = 0; i < 46; i++) {
      const bx = (i * 157.3) % 1024, by = 50 + ((i * 89.7) % 410), r = 6 + ((i * 37) % 10);
      x.fillStyle = `rgba(255,255,255,${0.75 + 0.2 * ((i * 13) % 3) / 2})`;
      const n = 5 + (i % 4);
      for (let k = 0; k < n; k++) { x.beginPath(); x.arc(bx + k * r * 1.1, by + Math.sin(k * 0.9 + i) * 4, r * (1 - Math.abs(k - (n - 1) / 2) / n * 0.8), 0, Math.PI * 2); x.fill(); }
    }
  }, '#ffffff');
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(409, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map: cmap, transparent: true, opacity: hasDom() ? 1 : 0, roughness: 1, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.15 })));
  g.add(clouds);
  g.userData.clouds = clouds;
  // 대기 테두리 빛
  g.add(new THREE.Mesh(new THREE.SphereGeometry(440, 48, 32), skyMat(new THREE.MeshBasicMaterial({ color: '#8fd4ff', transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }))));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(480, 48, 32), skyMat(new THREE.MeshBasicMaterial({ color: '#6fb8ff', transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }))));
  g.scale.setScalar(0.62);
  return g;
}

function stripeTex(cols: string[]) {
  return canvasTex(64, 256, (g, c) => {
    for (let y = 0; y < 256; y++) {
      const k = y / 256;
      const i = Math.floor((k * cols.length * 2.3 + Math.sin(k * 20) * 0.4) % cols.length + cols.length) % cols.length;
      g.fillStyle = cols[i]; g.fillRect(0, y, 64, 1);
    }
    g.globalAlpha = 0.25; g.filter = 'blur(3px)'; g.drawImage(c, 0, 0);
  }, cols[0]);
}

function makeSaturn() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(300, 64, 48), skyMat(new THREE.MeshStandardMaterial({ map: stripeTex(['#ffd9a8', '#ffe8c4', '#f7c08a', '#ffe1b8', '#f4b48a']), roughness: 0.75, emissive: '#ffb37a', emissiveIntensity: 0.4 }))));
  const ringMap = canvasTex(512, 8, (x) => {
    for (let i = 0; i < 512; i++) { const k = i / 512; x.fillStyle = `rgba(255,${200 + 40 * Math.sin(k * 30)},${210 + 40 * Math.cos(k * 17)},${0.25 + 0.6 * Math.abs(Math.sin(k * 9)) * (k > 0.08 && k < 0.95 ? 1 : 0)})`; x.fillRect(i, 0, 1, 8); }
  }, '#ffe6f0');
  const rg = new THREE.RingGeometry(380, 620, 128, 1);
  const uv = rg.attributes.uv, pp = rg.attributes.position;
  for (let i = 0; i < uv.count; i++) { const r = Math.hypot(pp.getX(i), pp.getY(i)); uv.setXY(i, (r - 380) / 240, 0.5); }
  const ring = new THREE.Mesh(rg, skyMat(new THREE.MeshBasicMaterial({ map: ringMap, transparent: true, opacity: hasDom() ? 1 : 0.4, side: THREE.DoubleSide, depthWrite: false, color: '#ffe6f0' })));
  ring.rotation.x = Math.PI / 2 - 0.35; ring.rotation.y = 0.25;
  g.add(ring);
  g.rotation.z = 0.25;
  return g;
}

/** 4갈래 반짝이 텍스처(공유) */
let sparkCache: THREE.Texture | null = null;
export function sparkleTex() {
  if (sparkCache) return sparkCache;
  sparkCache = canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,0.8)'); r.addColorStop(0.35, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.moveTo(64, 0); g.quadraticCurveTo(68, 60, 128, 64); g.quadraticCurveTo(68, 68, 64, 128); g.quadraticCurveTo(60, 68, 0, 64); g.quadraticCurveTo(60, 60, 64, 0); g.fill();
  }, '#ffffff');
  sparkCache.userData.shared = true;
  return sparkCache;
}
