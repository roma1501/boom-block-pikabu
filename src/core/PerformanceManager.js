/**
 * Производительность.
 * При первом запуске оценивает устройство, дальше следит за FPS и
 * подкручивает разрешение рендера и бюджеты частиц/обломков,
 * не трогая силу самих взрывов.
 */
import { CONFIG } from './Config.js';

export function detectQuality() {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Windows Phone/i.test(ua);
  const cores = navigator.hardwareConcurrency || (mobile ? 4 : 8);
  const mem = navigator.deviceMemory || (mobile ? 4 : 8);

  let gpuScore = 1;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Apple (A1[4-9]|M[1-9])|RTX|GTX 1[0-9]|RX [5-9]\d00|Adreno \(TM\) (7|8)\d\d|Mali-G7[8-9]|Immortalis/i.test(r)) gpuScore = 2;
      else if (/Intel|UHD|Iris|Adreno \(TM\) 6\d\d|Mali-G5|PowerVR/i.test(r)) gpuScore = 0.7;
    }
  } catch (e) { /* нет WebGL-инфо — оценим по остальному */ }

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 6 ? 1.4 : cores >= 4 ? 0.8 : 0.3;
  score += mem >= 8 ? 1.6 : mem >= 4 ? 1 : 0.4;
  score += gpuScore;
  if (mobile) score -= 1.1;
  if (window.devicePixelRatio > 2.5) score -= 0.3;

  if (score >= 3.6) return 'high';
  if (score >= 2.0) return 'medium';
  return 'low';
}

export class PerformanceManager {
  constructor(quality, renderer) {
    this.quality = quality;
    this.renderer = renderer;
    this.frames = 0;
    this.acc = 0;
    this.fps = 60;
    this.avg = 60;
    this.samples = [];
    this.scale = 1;
    this.minScale = 0.62;
    this.adaptTimer = 0;
    this.onScaleChange = null;
    this.enabled = true;
    this.stableTime = 0;
    this.lowTime = 0;
    this.debrisFactor = 1;
  }

  update(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0; this.acc = 0;
      this.samples.push(this.fps);
      if (this.samples.length > 6) this.samples.shift();
      this.avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      if (this.enabled) this.adapt();
    }
  }

  adapt() {
    const target = 56;
    const low = 42;
    if (this.avg < low) {
      this.lowTime += 0.5; this.stableTime = 0;
      if (this.lowTime > 1.4) {
        this.lowTime = 0;
        if (this.scale > this.minScale) {
          this.scale = Math.max(this.minScale, this.scale - 0.1);
          if (this.onScaleChange) this.onScaleChange(this.scale);
        } else if (this.debrisFactor > 0.45) {
          this.debrisFactor = Math.max(0.45, this.debrisFactor - 0.2);
        }
      }
    } else if (this.avg > target) {
      this.stableTime += 0.5; this.lowTime = 0;
      if (this.stableTime > 4) {
        this.stableTime = 0;
        if (this.debrisFactor < 1) this.debrisFactor = Math.min(1, this.debrisFactor + 0.15);
        else if (this.scale < 1) {
          this.scale = Math.min(1, this.scale + 0.06);
          if (this.onScaleChange) this.onScaleChange(this.scale);
        }
      }
    }
  }

  reset() {
    this.samples.length = 0; this.avg = 60;
    this.lowTime = 0; this.stableTime = 0;
  }
}

export function qualityPreset(name) {
  return Object.assign({}, CONFIG.quality[name] || CONFIG.quality.medium);
}
