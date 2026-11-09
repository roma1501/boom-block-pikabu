/**
 * Сцена: процедурное небо с градиентом, солнце с мягкими тенями,
 * атмосферная дымка и медленно плывущие облака.
 */
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop, uMid, uBottom, uSun;
uniform vec3 uSunDir;
void main(){
  float h = normalize(vDir).y;
  vec3 col;
  if (h > 0.0) col = mix(uMid, uTop, pow(clamp(h,0.0,1.0), 0.62));
  else col = mix(uMid, uBottom, pow(clamp(-h,0.0,1.0), 0.5));
  float s = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
  col += uSun * pow(s, 220.0) * 3.0;
  col += uSun * pow(s, 8.0) * 0.16;
  gl_FragColor = vec4(col, 1.0);
}`;

export class SceneManager {
  constructor(quality) {
    this.quality = quality;
    this.scene = new THREE.Scene();

    // --- небо ---
    const geo = new THREE.SphereGeometry(1, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(0x1f6ce0) },
        uMid: { value: new THREE.Color(0x93d2ff) },
        uBottom: { value: new THREE.Color(0xd8ecff) },
        uSun: { value: new THREE.Color(0xfff0c8) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.35) },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // --- свет ---
    // Тени не должны проваливаться в чёрное: полусферический свет даёт
    // холодную подсветку сверху и тёплый отражённый свет от земли.
    this.hemi = new THREE.HemisphereLight(0xc6e2ff, 0x8a7a5e, 2.15);
    this.scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xa8c4e8, 0.55);
    this.scene.add(this.amb);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.95);
    this.sun.position.set(38, 58, 26);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      const s = quality.shadowMapSize;
      this.sun.shadow.mapSize.set(s, s);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 190;
      this.sun.shadow.bias = -0.0009;
      this.sun.shadow.normalBias = 0.035;
      this.sun.shadow.radius = 2.2;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x9ec2ff, 0.9);
    this.fill.position.set(-32, 22, -30);
    this.scene.add(this.fill);

    this.scene.fog = new THREE.Fog(0x9fd4ff, 45, quality.viewDistance);

    // --- облака ---
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    this.cloudSprites = [];
  }

  buildClouds(tex, count, radius, height) {
    for (const s of this.cloudSprites) this.clouds.remove(s);
    this.cloudSprites.length = 0;
    const n = this.quality.name === 'low' ? Math.floor(count * 0.5) : count;
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: 0.5 + Math.random() * 0.35, color: 0xffffff,
        fog: false,
      });
      const sp = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.55 + Math.random() * 0.6);
      const sc = 26 + Math.random() * 46;
      sp.scale.set(sc, sc * (0.35 + Math.random() * 0.25), 1);
      sp.position.set(Math.cos(a) * r, height + Math.random() * 34, Math.sin(a) * r);
      sp.userData.speed = 0.32 + Math.random() * 0.5;
      sp.renderOrder = -900;
      this.clouds.add(sp);
      this.cloudSprites.push(sp);
    }
  }

  /** Подгоняем тень под размер уровня. */
  fitShadow(cx, cy, cz, radius) {
    const d = this.sun.shadow.camera;
    d.left = -radius; d.right = radius;
    d.top = radius; d.bottom = -radius;
    d.far = radius * 4.5;
    d.updateProjectionMatrix();
    this.sun.position.set(cx + radius * 0.75, cy + radius * 1.25, cz + radius * 0.55);
    this.sun.target.position.set(cx, cy, cz);
    this.sun.target.updateMatrixWorld();
    this.skyMat.uniforms.uSunDir.value.set(radius * 0.75, radius * 1.25, radius * 0.55).normalize();
    this.clouds.position.set(cx, 0, cz);
  }

  setPreset(p) {
    const presets = {
      day: { top: 0x1f6ce0, mid: 0x93d2ff, bottom: 0xd8ecff, fog: 0x9fd4ff, sun: 0xfff2d8, hemi: 0xc6e2ff, gnd: 0x8a7a5e, si: 1.95 },
      warm: { top: 0x2a7ad8, mid: 0xa8d8f0, bottom: 0xffe6c0, fog: 0xd0e4f0, sun: 0xffe4bc, hemi: 0xd6e8ff, gnd: 0x9a8460, si: 1.85 },
      cold: { top: 0x2760b8, mid: 0x9ec8e8, bottom: 0xdaeaf5, fog: 0xb8d6ea, sun: 0xe8f0ff, hemi: 0xcadcf5, gnd: 0x6e7484, si: 1.8 },
    };
    const s = presets[p] || presets.day;
    this.skyMat.uniforms.uTop.value.setHex(s.top);
    this.skyMat.uniforms.uMid.value.setHex(s.mid);
    this.skyMat.uniforms.uBottom.value.setHex(s.bottom);
    this.skyMat.uniforms.uSun.value.setHex(s.sun);
    this.scene.fog.color.setHex(s.fog);
    this.hemi.color.setHex(s.hemi);
    this.hemi.groundColor.setHex(s.gnd);
    this.sun.color.setHex(s.sun);
    this.sun.intensity = s.si;
  }

  update(dt, cameraPos) {
    this.sky.position.copy(cameraPos);
    this.sky.scale.setScalar(Math.max(60, this.quality.viewDistance * 2.4));
    for (const s of this.cloudSprites) {
      s.position.x += s.userData.speed * dt;
      if (s.position.x > 260) s.position.x = -260;
    }
  }
}
