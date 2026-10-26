import * as THREE from 'three';
const cams = { beach: { pos: [6, 6.5, 12], target: [12.5, 0.2, 3.5], fov: 36 }, ac2: { pos: [0, 8.99, 15.38], target: [0, 1.1, -0.8], fov: 28 }, ac: { pos: [0, 10.5, 12.5], target: [0, 1.2, -0.6], fov: 32 }, close: { pos: [1.2, 3.1, 5.6], target: [0.6, 1.5, -0.8], fov: 30 } };
const name = process.argv[2] || 'ac';
const cp = cams[name];
const cam = new THREE.PerspectiveCamera(cp.fov, 16/9, 0.1, 600);
cam.position.set(...cp.pos); cam.lookAt(new THREE.Vector3(...cp.target)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
const K=0.0085;
for (const s of process.argv.slice(3)) {
  const [x,y,z] = s.split(',').map(Number);
  const dz=z-cp.target[2], dx=x-cp.target[0];
  const v = new THREE.Vector3(x, y - K*(dz*dz+0.18*dx*dx), z).project(cam);
  console.log(s, '->', Math.round((v.x+1)/2*1600), Math.round((1-v.y)/2*900));
}
