/**
 * Прицел бога: кольцо на поверхности и полупрозрачная сфера радиуса взрыва.
 * Игрок должен видеть площадь удара до того, как нажмёт, — иначе
 * ограниченные бомбы превращаются в лотерею.
 */
import * as THREE from 'three';

const SPH_VERT = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const SPH_FRAG = /* glsl */`
uniform float uOpacity; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  f = pow(f, 2.2);
  gl_FragColor = vec4(uColor * (0.5 + f * 1.9), f * uOpacity + 0.035 * uOpacity);
}`;

export class AimMarker {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 12;
    scene.add(this.group);

    this.ringGeo = new THREE.RingGeometry(0.88, 1, 56);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false,
    });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.group.add(this.ring);

    this.dotGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this.dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      depthWrite: false, depthTest: false, fog: false,
    });
    this.dot = new THREE.Mesh(this.dotGeo, this.dotMat);
    this.group.add(this.dot);

    this.sphGeo = new THREE.SphereGeometry(1, 22, 16);
    this.sphMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.4 },
        uColor: { value: new THREE.Color(0xffb060) },
      },
      vertexShader: SPH_VERT, fragmentShader: SPH_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.FrontSide, fog: false,
    });
    this.sphere = new THREE.Mesh(this.sphGeo, this.sphMat);
    this.sphere.frustumCulled = false;
    this.group.add(this.sphere);

    this._t = 0;
    this._up = new THREE.Vector3(0, 1, 0);
    this._n = new THREE.Vector3();
  }

  /**
   * @param {THREE.Vector3} point точка на поверхности
   * @param {{x,y,z}} normal нормаль грани
   * @param {number} radius радиус взрыва
   * @param {number} color цвет заряда
   */
  show(point, normal, radius, color) {
    this.group.visible = true;
    this.group.position.copy(point);
    this._n.set(normal.x || 0, normal.y || 1, normal.z || 0).normalize();
    this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._n);
    this.ring.position.copy(this._n).multiplyScalar(0.06);
    this.ring.scale.setScalar(Math.max(1.2, radius * 0.8));
    this.sphere.scale.setScalar(radius);
    this.ringMat.color.setHex(color);
    this.sphMat.uniforms.uColor.value.setHex(color);
  }

  hide() { this.group.visible = false; }
  get visible() { return this.group.visible; }

  update(dt) {
    if (!this.group.visible) return;
    this._t += dt;
    const p = 0.5 + 0.5 * Math.sin(this._t * 4.2);
    this.ringMat.opacity = 0.55 + p * 0.4;
    this.sphMat.uniforms.uOpacity.value = 0.26 + p * 0.16;
    this.dot.scale.setScalar(0.9 + p * 0.3);
  }

  dispose() {
    this.ringGeo.dispose(); this.ringMat.dispose();
    this.dotGeo.dispose(); this.dotMat.dispose();
    this.sphGeo.dispose(); this.sphMat.dispose();
  }
}
