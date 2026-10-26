// 탈것 효과: 몽글몽글 입자(먼지·물보라·항적·연기·거품·불꽃) + 속도감 바람 선. InstancedMesh 한 벌씩(draw call 3).
import * as THREE from 'three';

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s0: number; s1: number; g: number; drag: number; r: number; gC: number; b: number; flat: number }

export class Puffs {
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  constructor(public cap: number, mat: THREE.Material, detail = 14) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.userData.shared = true;
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    void detail;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: { life: number; s0: number; s1: number; g?: number; drag?: number; color: THREE.ColorRepresentation; flat?: number }) {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.c.set(o.color);
    this.ps.push({ x, y, z, vx, vy, vz, life: 0, max: o.life, s0: o.s0, s1: o.s1, g: o.g ?? 0, drag: o.drag ?? 1.2, r: this.c.r, gC: this.c.g, b: this.c.b, flat: o.flat ?? 1 });
  }
  update(dt: number) {
    const keep: P[] = [];
    let n = 0;
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.life / p.max;
      // 커졌다가 끝에 작아지며 사라진다(투명도 대신 크기)
      const sz = (p.s0 + (p.s1 - p.s0) * Math.sqrt(t)) * (1 - Math.pow(t, 3));
      this.s.set(Math.max(1e-3, sz), Math.max(1e-3, sz * p.flat), Math.max(1e-3, sz));
      this.v.set(p.x, p.y, p.z);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setRGB(p.r, p.gC, p.b);
      this.mesh.setColorAt(n, this.c);
      keep.push(p);
      n++;
    }
    this.ps = keep;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 속도감 바람 선: 탈것 둘레 원통에서 생겨 뒤로 휙 지나간다 */
export class SpeedLines {
  mesh: THREE.InstancedMesh;
  private ls: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; len: number; w: number }> = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 0, 1);
  constructor(cap = 60) {
    const g = new THREE.CapsuleGeometry(0.5, 1, 4, 8).rotateX(Math.PI / 2);
    g.userData.shared = true;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.7), transparent: true, opacity: 0.55, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  /** pos = 탈것 중심, dir = 진행 방향(단위), speed m/s, rnd = 결정적 난수 */
  feed(dt: number, pos: THREE.Vector3, dir: THREE.Vector3, speed: number, rnd: () => number, radius = 2.5) {
    const rate = Math.max(0, speed - 9) * 1.8;
    let want = rate * dt;
    while (want > 0 && this.ls.length < this.mesh.count + 999) {
      if (rnd() > want) break;
      want -= 1;
      const a = rnd() * Math.PI * 2, r = radius * (0.7 + rnd() * 0.8);
      // 진행 방향에 수직인 두 축
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const off = side.multiplyScalar(Math.cos(a) * r).add(up.multiplyScalar(Math.abs(Math.sin(a)) * r * 0.8 + 0.5));
      const ahead = 4 + rnd() * 8;
      this.ls.push({
        x: pos.x + dir.x * ahead + off.x, y: pos.y + dir.y * ahead + off.y, z: pos.z + dir.z * ahead + off.z,
        vx: -dir.x * speed * 0.5, vy: -dir.y * speed * 0.5, vz: -dir.z * speed * 0.5,
        life: 0, max: 0.45 + rnd() * 0.25, len: 0.4 + speed * 0.045, w: 0.012 + rnd() * 0.012,
      });
    }
    if (this.ls.length > 60) this.ls.splice(0, this.ls.length - 60);
    this.update(dt, dir);
  }
  update(dt: number, dir?: THREE.Vector3) {
    let n = 0;
    const keep: typeof this.ls = [];
    for (const l of this.ls) {
      l.life += dt;
      if (l.life >= l.max) continue;
      l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
      const t = l.life / l.max;
      const fade = Math.sin(Math.PI * t);
      const d = dir ?? new THREE.Vector3(-l.vx, -l.vy, -l.vz).normalize();
      this.q.setFromUnitVectors(this.up, d);
      this.m.compose(new THREE.Vector3(l.x, l.y, l.z), this.q, new THREE.Vector3(l.w * fade, l.w * fade, l.len * fade));
      this.mesh.setMatrixAt(n++, this.m);
      keep.push(l);
    }
    this.ls = keep;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
