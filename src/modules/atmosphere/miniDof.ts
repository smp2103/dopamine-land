// 미니어처 심도 — 깊이 기준으로 초점 띠(플레이어 거리 앞뒤)는 선명하게, 먼 곳·바로 앞만 흐리게.
// 화면 띠 기준 틸트시프트와 달리 키 큰 나무도 초점 거리에 있으면 위아래 다 선명하다.
import * as THREE from 'three';
import { Effect, EffectAttribute, KawaseBlurPass, KernelSize, Resolution } from 'postprocessing';

const FRAG = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform vec4 band;     // x 앞 선명 경계, y 뒤 선명 경계, z 앞 램프, w 뒤 램프 (m)
uniform vec2 strength; // x 앞 최대, y 뒤 최대 (0..1)
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float d = -getViewZ(depth);
  float far = smoothstep(band.y, band.y + band.w, d) * strength.y;
  float near = (1.0 - smoothstep(band.x - band.z, band.x, d)) * strength.x;
  float c = max(far, near);
  vec4 a = texture2D(mapA, uv);
  vec4 b = texture2D(mapB, uv);
  vec4 col = mix(inputColor, a, smoothstep(0.0, 0.45, c));
  col = mix(col, b, smoothstep(0.45, 1.0, c));
  outputColor = col;
}`;

export interface DofParams {
  /** 초점 거리(카메라 → 기준점, m) */
  focus: number;
  /** 초점 앞·뒤로 선명하게 둘 거리(m) */
  nearSharp: number;
  farSharp: number;
  /** 선명 → 최대 흐림까지 거리(m) */
  nearRamp: number;
  farRamp: number;
  nearMax: number;
  farMax: number;
}

export class MiniDofEffect extends Effect {
  rtA: THREE.WebGLRenderTarget;
  rtB: THREE.WebGLRenderTarget;
  blurA: KawaseBlurPass;
  blurB: KawaseBlurPass;
  resA: Resolution;
  resB: Resolution;

  constructor() {
    super('MiniDofEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['mapA', new THREE.Uniform(null)],
        ['mapB', new THREE.Uniform(null)],
        ['band', new THREE.Uniform(new THREE.Vector4(10, 20, 3, 12))],
        ['strength', new THREE.Uniform(new THREE.Vector2(0.5, 1))],
      ]),
    });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.uniforms.get('mapA')!.value = this.rtA.texture;
    this.uniforms.get('mapB')!.value = this.rtB.texture;
    this.blurA = new KawaseBlurPass({ kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
    this.blurB = new KawaseBlurPass({ kernelSize: KernelSize.MEDIUM, resolutionScale: 0.25 });
    this.resA = new Resolution(this, Resolution.AUTO_SIZE, Resolution.AUTO_SIZE, 0.5);
    this.resB = new Resolution(this, Resolution.AUTO_SIZE, Resolution.AUTO_SIZE, 0.25);
  }

  setParams(p: DofParams) {
    this.uniforms.get('band')!.value.set(p.focus - p.nearSharp, p.focus + p.farSharp, p.nearRamp, p.farRamp);
    this.uniforms.get('strength')!.value.set(p.nearMax, p.farMax);
  }

  update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget) {
    this.blurA.render(renderer, inputBuffer, this.rtA);
    this.blurB.render(renderer, inputBuffer, this.rtB);
  }

  setSize(width: number, height: number) {
    this.resA.setBaseSize(width, height);
    this.resB.setBaseSize(width, height);
    this.rtA.setSize(this.resA.width, this.resA.height);
    this.rtB.setSize(this.resB.width, this.resB.height);
    this.blurA.resolution.copy(this.resA);
    this.blurB.resolution.copy(this.resB);
  }

  initialize(renderer: THREE.WebGLRenderer, alpha: boolean, frameBufferType: number) {
    this.blurA.initialize(renderer, alpha, frameBufferType);
    this.blurB.initialize(renderer, alpha, frameBufferType);
    if (frameBufferType !== undefined) {
      for (const rt of [this.rtA, this.rtB]) {
        rt.texture.type = frameBufferType as THREE.TextureDataType;
        if (renderer !== null && renderer.outputColorSpace === THREE.SRGBColorSpace) rt.texture.colorSpace = THREE.SRGBColorSpace;
      }
    }
  }
}
