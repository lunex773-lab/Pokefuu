import Phaser from 'phaser';

const frag = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uAmount;
uniform float uVignette;
uniform float uGrain;
varying vec2 outTexCoord;

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  float a = uAmount;
  // 裏層の空間の歪み（ゆっくりとした波）
  uv.x += sin(uv.y * 38.0 + uTime * 1.7) * 0.0035 * a + sin(uv.y * 6.0 - uTime * 0.9) * 0.004 * a;
  uv.y += cos(uv.x * 22.0 + uTime * 1.1) * 0.002 * a;
  // 色収差
  float ca = 0.0035 * a;
  vec4 c;
  c.r = texture2D(uMainSampler, uv + vec2(ca, 0.0)).r;
  c.g = texture2D(uMainSampler, uv).g;
  c.b = texture2D(uMainSampler, uv - vec2(ca, 0.0)).b;
  c.a = 1.0;
  // ビネット
  vec2 d = outTexCoord - 0.5;
  float v = smoothstep(0.82, 0.22, length(d * vec2(1.25, 1.0)));
  c.rgb *= mix(1.0, v, uVignette);
  // フィルムグレイン
  float n = rand(outTexCoord * 512.0 + fract(uTime) * 37.0);
  c.rgb += (n - 0.5) * uGrain;
  gl_FragColor = c;
}
`;

/**
 * 画面全体のポストエフェクト（歪み・色収差・ビネット・グレイン）。
 * 裏層の危険度や演出に応じて amount を上げ下げする。
 */
export class DistortPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  amount = 0;
  vignette = 0.45;
  grain = 0.035;

  constructor(game: Phaser.Game) {
    super({ game, name: 'DistortFX', fragShader: frag });
  }

  onPreRender(): void {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uAmount', this.amount);
    this.set1f('uVignette', this.vignette);
    this.set1f('uGrain', this.grain);
  }
}
