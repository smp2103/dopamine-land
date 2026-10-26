// 부드러운 색보정: 어두운 곳은 lift 색으로 살짝 띄우고(그늘이 검정 대신 푸르스름/보랏빛), 밝은 곳은 gain 으로 물들인다.
import * as THREE from 'three';
import { Effect } from 'postprocessing';

const FRAG = /* glsl */ `
uniform vec3 lift;
uniform vec3 gain;
uniform float sat;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  c = c * gain + lift * ( 1.0 - c );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 1.0 + sat );
  outputColor = vec4( max( c, 0.0 ), inputColor.a );
}`;

export class SoftGradeEffect extends Effect {
  constructor() {
    super('SoftGradeEffect', FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['lift', new THREE.Uniform(new THREE.Color(0, 0, 0))],
        ['gain', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ['sat', new THREE.Uniform(0)],
      ]),
    });
  }
  set(lift: string, gain: string, sat: number) {
    // hex 는 sRGB 로 적고, 셰이더(선형)에는 변환해서 넘긴다
    (this.uniforms.get('lift')!.value as THREE.Color).set(lift);
    (this.uniforms.get('gain')!.value as THREE.Color).set(gain);
    this.uniforms.get('sat')!.value = sat;
  }
}
