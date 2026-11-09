/**
 * Постобработка: свой минимальный композитор.
 *
 * Сцена рендерится в HDR-буфер, оттуда — bloom в две ступени,
 * затем финальный проход: ACES tone mapping, грейдинг, виньетка,
 * хроматическая аберрация, вспышка взрыва, кольцевое искажение
 * от ударной волны и пылевая пелена.
 *
 * Свой композитор вместо EffectComposer — чтобы вся картинка собиралась
 * за один финальный проход и на слабом телефоне это стоило один blit.
 */
import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform float uThreshold; uniform float uKnee;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float s = clamp((l - uThreshold) / max(0.0001, uKnee), 0.0, 1.0);
  gl_FragColor = vec4(c * s * s, 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;
  s += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316;
  s += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316;
  s += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.0702;
  s += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.0702;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom1, tBloom2, tNoise;
uniform vec2 uRes;
uniform float uBloom, uFlash, uCA, uDust, uExposure, uSat, uContrast, uVignette, uTime;
uniform float uDistortStrength, uDistortRadius;
uniform vec2 uDistortPos;
uniform vec3 uDustColor, uFlashColor;
uniform int uUseBloom;
varying vec2 vUv;

vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}

void main(){
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;

  if(uDistortStrength > 0.002){
    vec2 d = uv - uDistortPos;
    d.x *= aspect;
    float r = length(d);
    float ring = exp(-pow((r - uDistortRadius) * 12.0, 2.0));
    vec2 nd = r > 1e-5 ? d / r : vec2(0.0);
    nd.x /= aspect;
    uv += nd * ring * uDistortStrength * 0.05;
  }

  vec2 cc = uv - 0.5;
  float ca = uCA * (0.0016 + 0.010 * dot(cc, cc));
  vec3 col;
  col.r = texture2D(tScene, uv + cc * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - cc * ca).b;

  if(uUseBloom == 1){
    vec3 bl = texture2D(tBloom1, uv).rgb * 0.62 + texture2D(tBloom2, uv).rgb * 0.95;
    col += bl * uBloom;
  }

  col += uFlashColor * uFlash;
  col *= uExposure;
  col = aces(col);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;

  if(uDust > 0.003){
    float n = texture2D(tNoise, uv * 2.1 + vec2(uTime * 0.035, uTime * 0.019)).r;
    col = mix(col, uDustColor, clamp(uDust,0.0,0.8) * (0.35 + 0.65 * n));
  }

  float v = smoothstep(1.02, 0.30, length(cc) * 1.44);
  col *= mix(1.0, v, uVignette);

  col = max(col, vec3(0.0));
  col = pow(col, vec3(0.45454545));
  gl_FragColor = vec4(col, 1.0);
}`;

const _sizeTmp = new THREE.Vector2();

class Pass {
  constructor(fragment, uniforms) {
    this.material = new THREE.ShaderMaterial({
      uniforms, vertexShader: QUAD_VERT, fragmentShader: fragment,
      depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }
  dispose() { this.material.dispose(); this.mesh.geometry.dispose(); }
}

export class PostFX {
  constructor(renderer, quality, noiseTexture) {
    this.renderer = renderer;
    this.quality = quality;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const gl = renderer.getContext();
    const halfOK = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    this.type = halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.bloomLevels = quality.bloom ? (quality.name === 'high' ? 2 : 1) : 0;

    this.rtScene = null;
    this.rtBright = null;
    this.rtA = null; this.rtB = null;
    this.rtC = null; this.rtD = null;

    this.bright = new Pass(BRIGHT_FRAG, {
      tDiffuse: { value: null }, uThreshold: { value: 1.05 }, uKnee: { value: 0.75 },
    });
    this.blur = new Pass(BLUR_FRAG, {
      tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() },
    });
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this.blackTex = black;
    this.comp = new Pass(COMP_FRAG, {
      tScene: { value: null }, tBloom1: { value: black }, tBloom2: { value: black },
      tNoise: { value: noiseTexture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uBloom: { value: 0.5 }, uFlash: { value: 0 }, uCA: { value: 0 }, uDust: { value: 0 },
      uExposure: { value: 0.94 }, uSat: { value: 1.05 }, uContrast: { value: 1.015 },
      uVignette: { value: 0.42 }, uTime: { value: 0 },
      uDistortStrength: { value: 0 }, uDistortRadius: { value: 0.2 },
      uDistortPos: { value: new THREE.Vector2(0.5, 0.5) },
      uDustColor: { value: new THREE.Color(0xb09070) },
      uFlashColor: { value: new THREE.Color(0xfff0d0) },
      uUseBloom: { value: this.bloomLevels > 0 ? 1 : 0 },
    });

    this.flash = 0;
    this.ca = 0;
    this.dust = 0;
    this.distort = null;
    this.size = new THREE.Vector2(1, 1);
  }

  setSize(w, h) {
    const s = this.quality.renderScale;
    const rw = Math.max(2, Math.floor(w * s)), rh = Math.max(2, Math.floor(h * s));
    this.size.set(rw, rh);
    const opts = {
      type: this.type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false, samples: this.quality.msaa,
    };
    if (this.rtScene) this.rtScene.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(rw, rh, opts);
    this.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;

    const bopts = {
      type: this.type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    };
    for (const k of ['rtBright', 'rtA', 'rtB', 'rtC', 'rtD']) {
      if (this[k]) { this[k].dispose(); this[k] = null; }
    }
    if (this.bloomLevels > 0) {
      const hw = Math.max(2, rw >> 1), hh = Math.max(2, rh >> 1);
      this.rtBright = new THREE.WebGLRenderTarget(hw, hh, bopts);
      this.rtA = new THREE.WebGLRenderTarget(hw, hh, bopts);
      this.rtB = new THREE.WebGLRenderTarget(hw, hh, bopts);
      if (this.bloomLevels > 1) {
        const qw = Math.max(2, rw >> 2), qh = Math.max(2, rh >> 2);
        this.rtC = new THREE.WebGLRenderTarget(qw, qh, bopts);
        this.rtD = new THREE.WebGLRenderTarget(qw, qh, bopts);
      }
    }
    this.comp.material.uniforms.uRes.value.set(rw, rh);
  }

  _blit(pass, target) {
    this.renderer.setRenderTarget(target);
    this.renderer.render(pass.scene, this.cam);
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.Scene} vmScene   сцена предмета в руках (рендерится поверх)
   * @param {THREE.Camera} vmCamera
   */
  render(scene, camera, vmScene, vmCamera, dt) {
    const r = this.renderer;
    // Размер мог ещё не прийти: во встроенном WebView канва в первых кадрах
    // нулевая, и resize() пропускается. Тогда создаём цели по текущему
    // буферу рендера — иначе кадр падает на пустом rtScene.
    if (!this.rtScene) {
      const s = r.getSize(_sizeTmp);
      this.setSize(Math.max(2, Math.round(s.x) || 2), Math.max(2, Math.round(s.y) || 2));
    }
    // autoClear выключен: иначе второй render() (предмет в руках) стёр бы сцену
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (vmScene) {
      r.clearDepth();
      r.render(vmScene, vmCamera);
    }
    r.autoClear = prevAuto;

    const u = this.comp.material.uniforms;
    if (this.bloomLevels > 0) {
      this.bright.material.uniforms.tDiffuse.value = this.rtScene.texture;
      this._blit(this.bright, this.rtBright);

      const bw = this.rtBright.width, bh = this.rtBright.height;
      this.blur.material.uniforms.tDiffuse.value = this.rtBright.texture;
      this.blur.material.uniforms.uDir.value.set(1 / bw, 0);
      this._blit(this.blur, this.rtA);
      this.blur.material.uniforms.tDiffuse.value = this.rtA.texture;
      this.blur.material.uniforms.uDir.value.set(0, 1 / bh);
      this._blit(this.blur, this.rtB);
      u.tBloom1.value = this.rtB.texture;

      if (this.bloomLevels > 1) {
        const cw = this.rtC.width, ch = this.rtC.height;
        this.blur.material.uniforms.tDiffuse.value = this.rtB.texture;
        this.blur.material.uniforms.uDir.value.set(1.6 / cw, 0);
        this._blit(this.blur, this.rtC);
        this.blur.material.uniforms.tDiffuse.value = this.rtC.texture;
        this.blur.material.uniforms.uDir.value.set(0, 1.6 / ch);
        this._blit(this.blur, this.rtD);
        u.tBloom2.value = this.rtD.texture;
      } else {
        u.tBloom2.value = this.blackTex;
      }
    }

    u.tScene.value = this.rtScene.texture;
    u.uFlash.value = this.flash;
    u.uCA.value = this.ca;
    u.uDust.value = this.dust;
    u.uTime.value += dt;
    if (this.distort) {
      u.uDistortStrength.value = this.distort.strength;
      u.uDistortRadius.value = this.distort.radius;
      u.uDistortPos.value.copy(this.distort.pos);
    } else {
      u.uDistortStrength.value = 0;
    }

    r.setRenderTarget(null);
    r.render(this.comp.scene, this.cam);
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 4.2);
    this.ca = Math.max(0, this.ca - dt * 3.0);
    this.dust = Math.max(0, this.dust - dt * 0.85);
    if (this.distort) {
      this.distort.t += dt;
      const k = this.distort.t / this.distort.life;
      if (k >= 1) this.distort = null;
      else {
        this.distort.radius = 0.02 + k * this.distort.maxR;
        this.distort.strength = this.distort.power * Math.pow(1 - k, 1.5);
      }
    }
  }

  addFlash(v) { this.flash = Math.min(1.6, this.flash + v); }
  addCA(v) { this.ca = Math.min(1.4, this.ca + v); }
  addDust(v) { this.dust = Math.min(0.62, this.dust + v); }

  setDistort(screenPos, maxR, power, life = 0.55) {
    this.distort = { pos: screenPos.clone(), t: 0, life, maxR, power, radius: 0.02, strength: power };
  }

  dispose() {
    for (const k of ['rtScene', 'rtBright', 'rtA', 'rtB', 'rtC', 'rtD']) if (this[k]) this[k].dispose();
    this.bright.dispose(); this.blur.dispose(); this.comp.dispose();
    this.blackTex.dispose();
  }
}
