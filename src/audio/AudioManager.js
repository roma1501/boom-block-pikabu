/**
 * Звук — целиком синтезируется в WebAudio, ни одного внешнего файла.
 *
 * Взрыв собран из слоёв: подбас-удар, основной BOOM (шум через фильтр),
 * треск, разлёт обломков и длинный хвост-раскат. Близкий взрыв на доли
 * секунды «глушит» остальные звуки через фильтр на мастере — как будто
 * заложило уши.
 *
 * Есть ограничитель: даже если разрушилось 200 блоков, одновременно
 * прозвучит не больше нескольких ударов.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volume = 0.8;
    this.musicVolume = 0.45;
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
    this.cooldowns = {};
    this.voices = 0;
    this.maxVoices = 26;
    this.musicOn = false;
    this._musicTimer = null;
    this._noise = null;
    this._brown = null;
    // В меню и на выборе уровня фоновые взрывы должны быть беззвучными.
    this.worldMuted = false;
    // Настройка звука площадки (YouTube). Когда выключена, игра не звучит
    // вообще, и внутриигровые регуляторы на это не влияют.
    this.hostEnabled = true;
  }

  /** Можно ли играть звук мира (взрывы, обломки, кристаллы). */
  _world() { return this.ready && this.enabled && this.hostEnabled && !this.worldMuted; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = (this.enabled && this.hostEnabled) ? this.volume : 0;
    this.duck = c.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = 20000;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.master.connect(this.duck);
    this.duck.connect(this.comp);
    this.comp.connect(c.destination);

    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicVolume * 0.5; this.music.connect(this.master);

    // шумовые буферы
    this._noise = this._makeNoise(2.2, false);
    this._brown = this._makeNoise(3.0, true);

    this.ready = true;
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    this._applyGain();
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.music) this.music.gain.value = v * 0.5;
  }
  setEnabled(v) {
    this.enabled = v;
    this._applyGain();
  }

  /** Настройка звука площадки — имеет приоритет над всеми внутриигровыми. */
  setHostEnabled(v) {
    this.hostEnabled = !!v;
    this._applyGain();
    if (!v) this.stopMusic();
  }

  _applyGain() {
    if (!this.master) return;
    this.master.gain.value = (this.enabled && this.hostEnabled) ? this.volume : 0;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { } }
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.hostEnabled) {
      try { this.ctx.resume(); } catch (e) { }
    }
  }

  _makeNoise(sec, brown) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  }

  setListener(pos, right) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    this.listener.rx = right.x; this.listener.ry = right.y; this.listener.rz = right.z;
  }

  /** Возвращает {gain, pan, dist} для точки в мире. */
  _spatial(pos, ref = 12) {
    if (!pos) return { gain: 1, pan: 0, dist: 0 };
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const gain = ref / (ref + d * 1.25);
    let pan = 0;
    if (d > 0.4) pan = Math.max(-0.85, Math.min(0.85,
      (dx * this.listener.rx + dy * this.listener.ry + dz * this.listener.rz) / d));
    return { gain, pan, dist: d };
  }

  _limit(key, ms) {
    const t = performance.now();
    const last = this.cooldowns[key] || 0;
    if (t - last < ms) return false;
    this.cooldowns[key] = t;
    return true;
  }

  _node(pos, vol, ref) {
    const c = this.ctx;
    const g = c.createGain();
    const s = this._spatial(pos, ref);
    g.gain.value = vol * s.gain;
    let out = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = s.pan;
      g.connect(p);
      out = p;
    }
    // приглушение дальних звуков
    if (s.dist > 14) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(500, 14000 - s.dist * 240);
      out.connect(f);
      f.connect(this.sfx);
    } else {
      out.connect(this.sfx);
    }
    return { gain: g, dist: s.dist, spatial: s };
  }

  _noiseSrc(brown) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this._brown : this._noise;
    s.loop = true;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    return s;
  }

  /* ================================================================ */
  /* ВЗРЫВ                                                            */
  /* ================================================================ */
  explosion(pos, power = 1, chain = 1) {
    if (!this._world()) return;
    const c = this.ctx, t = c.currentTime;
    const s = this._spatial(pos, 20);
    const delay = Math.min(0.35, s.dist / 340);
    const T = t + delay;
    const near = Math.max(0, 1 - s.dist / 26);
    const vol = 0.95 * s.gain * power;

    const out = this.ctx.createGain();
    out.gain.value = 1;
    let dest = out;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = s.pan * 0.7;
      out.connect(p); dest = p;
    }
    dest.connect(this.sfx);

    // 1) подбас
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(126 * (0.9 + Math.random() * 0.2), T);
    sub.frequency.exponentialRampToValueAtTime(26, T + 0.55);
    const subG = c.createGain();
    subG.gain.setValueAtTime(0.0001, T);
    subG.gain.exponentialRampToValueAtTime(vol * 1.35, T + 0.012);
    subG.gain.exponentialRampToValueAtTime(0.0001, T + 0.75);
    sub.connect(subG); subG.connect(out);
    sub.start(T); sub.stop(T + 0.8);

    // 2) основное тело — шум через падающий фильтр
    const n1 = this._noiseSrc(false);
    const f1 = c.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.setValueAtTime(2600, T);
    f1.frequency.exponentialRampToValueAtTime(160, T + 0.5);
    f1.Q.value = 1.2;
    const g1 = c.createGain();
    g1.gain.setValueAtTime(0.0001, T);
    g1.gain.exponentialRampToValueAtTime(vol * 1.1, T + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.0001, T + 0.62);
    n1.connect(f1); f1.connect(g1); g1.connect(out);
    n1.start(T); n1.stop(T + 0.7);

    // 3) резкий треск
    const n2 = this._noiseSrc(false);
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 2100 + Math.random() * 1200; f2.Q.value = 0.9;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(vol * 0.75, T);
    g2.gain.exponentialRampToValueAtTime(0.0001, T + 0.13);
    n2.connect(f2); f2.connect(g2); g2.connect(out);
    n2.start(T); n2.stop(T + 0.16);

    // 4) хвост-раскат
    const n3 = this._noiseSrc(true);
    const f3 = c.createBiquadFilter();
    f3.type = 'lowpass';
    f3.frequency.setValueAtTime(420, T + 0.05);
    f3.frequency.exponentialRampToValueAtTime(90, T + 1.9);
    const g3 = c.createGain();
    g3.gain.setValueAtTime(0.0001, T);
    g3.gain.exponentialRampToValueAtTime(vol * 0.5, T + 0.09);
    g3.gain.exponentialRampToValueAtTime(0.0001, T + 2.1);
    n3.connect(f3); f3.connect(g3); g3.connect(out);
    n3.start(T); n3.stop(T + 2.2);

    // 5) разлёт обломков
    const n4 = this._noiseSrc(false);
    const f4 = c.createBiquadFilter();
    f4.type = 'highpass'; f4.frequency.value = 1400;
    const g4 = c.createGain();
    g4.gain.setValueAtTime(0.0001, T + 0.06);
    g4.gain.linearRampToValueAtTime(vol * 0.3, T + 0.16);
    g4.gain.exponentialRampToValueAtTime(0.0001, T + 1.1);
    n4.connect(f4); f4.connect(g4); g4.connect(out);
    n4.start(T + 0.05); n4.stop(T + 1.2);

    // 6) «заложило уши»
    if (near > 0.35) {
      const d = this.duck.frequency;
      d.cancelScheduledValues(T);
      d.setValueAtTime(20000, T);
      d.linearRampToValueAtTime(560 + (1 - near) * 3000, T + 0.03);
      d.exponentialRampToValueAtTime(20000, T + 0.55 + near * 0.5);
    }
  }

  /* ================================================================ */
  material(kind, pos, vol = 1) {
    if (!this._world()) return;
    if (!this._limit('mat_' + kind, 55)) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, Math.min(0.7, vol * 0.55), 10);

    const presets = {
      wood: { type: 'bandpass', f: 420, q: 2.2, dur: 0.19, brown: false, tone: 180 },
      stone: { type: 'lowpass', f: 900, q: 1.0, dur: 0.16, brown: true, tone: 90 },
      glass: { type: 'highpass', f: 3400, q: 1.0, dur: 0.42, brown: false, tone: 0 },
      dirt: { type: 'lowpass', f: 380, q: 0.8, dur: 0.16, brown: true, tone: 0 },
      metal: { type: 'bandpass', f: 1800, q: 5.5, dur: 0.5, brown: false, tone: 620 },
    };
    const p = presets[kind] || presets.stone;

    const n = this._noiseSrc(p.brown);
    const f = c.createBiquadFilter();
    f.type = p.type;
    f.frequency.value = p.f * (0.8 + Math.random() * 0.45);
    f.Q.value = p.q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + p.dur);
    n.connect(f); f.connect(g); g.connect(gain);
    n.start(T); n.stop(T + p.dur + 0.02);

    if (p.tone) {
      const o = c.createOscillator();
      o.type = kind === 'metal' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(p.tone * (0.85 + Math.random() * 0.35), T);
      o.frequency.exponentialRampToValueAtTime(p.tone * 0.55, T + p.dur);
      const og = c.createGain();
      og.gain.setValueAtTime(0.35, T);
      og.gain.exponentialRampToValueAtTime(0.0001, T + p.dur);
      o.connect(og); og.connect(gain);
      o.start(T); o.stop(T + p.dur + 0.02);
    }
    if (kind === 'glass') {
      for (let i = 0; i < 3; i++) {
        const o = c.createOscillator();
        o.type = 'sine';
        const fr = 2200 + Math.random() * 3600;
        o.frequency.setValueAtTime(fr, T + i * 0.02);
        const og = c.createGain();
        og.gain.setValueAtTime(0.18, T + i * 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, T + 0.25 + i * 0.05);
        o.connect(og); og.connect(gain);
        o.start(T + i * 0.02); o.stop(T + 0.4);
      }
    }
  }

  heavyImpact(pos, vol = 1) {
    if (!this._world() || !this._limit('heavy', 90)) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, Math.min(1, vol) * 0.85, 16);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(88, T);
    o.frequency.exponentialRampToValueAtTime(30, T + 0.32);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.9, T + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.42);
    o.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.45);

    const n = this._noiseSrc(true);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.6, T);
    ng.gain.exponentialRampToValueAtTime(0.0001, T + 0.35);
    n.connect(f); f.connect(ng); ng.connect(gain);
    n.start(T); n.stop(T + 0.4);
  }

  collapse(pos, vol = 1) {
    if (!this._world() || !this._limit('collapse', 220)) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.85 * vol + 0.2, 24);
    const n = this._noiseSrc(true);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, T);
    f.frequency.exponentialRampToValueAtTime(120, T + 1.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(0.9, T + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 1.8);
    n.connect(f); f.connect(g); g.connect(gain);
    n.start(T); n.stop(T + 1.9);

    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(60, T);
    o.frequency.exponentialRampToValueAtTime(22, T + 1.2);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, T);
    og.gain.exponentialRampToValueAtTime(0.8, T + 0.08);
    og.gain.exponentialRampToValueAtTime(0.0001, T + 1.4);
    o.connect(og); og.connect(gain);
    o.start(T); o.stop(T + 1.5);
  }

  creak(pos, vol = 1) {
    if (!this._world() || !this._limit('creak', 260)) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.4 + vol * 0.35, 14);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 90 + Math.random() * 70;
    o.frequency.setValueAtTime(base, T);
    o.frequency.linearRampToValueAtTime(base * 1.5, T + 0.5);
    const lfo = c.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 14 + Math.random() * 10;
    const lfoG = c.createGain(); lfoG.gain.value = 22;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(0.34, T + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.62);
    o.connect(f); f.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.65);
    lfo.start(T); lfo.stop(T + 0.65);
  }

  /* ================================================================ */
  fuseStart(pos) {
    if (!this._world()) return null;
    const c = this.ctx, T = c.currentTime;
    const n = this._noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 3600; f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(0.10, T + 0.06);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    n.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    n.start(T);
    return { src: n, gain: g, filter: f, pan: p };
  }
  fuseUpdate(h, pos, urgency) {
    if (!h || !this.ready) return;
    const s = this._spatial(pos, 8);
    h.gain.gain.value = 0.10 * s.gain * (0.8 + urgency * 0.9);
    h.filter.frequency.value = 2800 + urgency * 2600;
    if (h.pan) h.pan.pan.value = s.pan;
  }
  fuseStop(h) {
    if (!h || !this.ready) return;
    try {
      const T = this.ctx.currentTime;
      h.gain.gain.cancelScheduledValues(T);
      h.gain.gain.setValueAtTime(h.gain.gain.value, T);
      h.gain.gain.exponentialRampToValueAtTime(0.0001, T + 0.05);
      h.src.stop(T + 0.07);
    } catch (e) { /* уже остановлен */ }
  }

  tntPlace(pos) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.5, 8);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, T);
    o.frequency.exponentialRampToValueAtTime(84, T + 0.13);
    const g = c.createGain();
    g.gain.setValueAtTime(0.6, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.17);
    o.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.2);
    const n = this._noiseSrc(false);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.35, T);
    ng.gain.exponentialRampToValueAtTime(0.0001, T + 0.1);
    n.connect(f); f.connect(ng); ng.connect(gain);
    n.start(T); n.stop(T + 0.12);
  }

  lighterClick(pos, success) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.5, 6);
    const n = this._noiseSrc(false);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.7, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.07);
    n.connect(f); f.connect(g); g.connect(gain);
    n.start(T); n.stop(T + 0.09);
    if (success) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(720, T + 0.03);
      o.frequency.exponentialRampToValueAtTime(1300, T + 0.14);
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, T + 0.03);
      og.gain.exponentialRampToValueAtTime(0.22, T + 0.06);
      og.gain.exponentialRampToValueAtTime(0.0001, T + 0.24);
      o.connect(og); og.connect(gain);
      o.start(T + 0.03); o.stop(T + 0.26);
    }
  }

  /* ================================================================ */
  crystalPickup(pos, index, total) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.55, 30);
    const scale = [0, 4, 7, 12, 16, 19, 24];
    const step = scale[Math.min(scale.length - 1, index - 1)];
    const base = 523.25 * Math.pow(2, step / 12);
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = base * (i === 0 ? 1 : (i === 1 ? 2 : 3));
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, T);
      g.gain.exponentialRampToValueAtTime(0.35 / (i + 1), T + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, T + 0.7 - i * 0.14);
      o.connect(g); g.connect(gain);
      o.start(T); o.stop(T + 0.8);
    }
  }
  crystalReveal(pos) {
    if (!this._world() || !this._limit('reveal', 140)) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.4, 22);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(760, T);
    o.frequency.exponentialRampToValueAtTime(1720, T + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.26, T + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.65);
    o.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.7);
  }
  crystalPing(pos) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.22, 26);
    const o = c.createOscillator();
    o.type = 'sine'; o.frequency.value = 1480;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.14, T + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.5);
    o.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.55);
  }
  /** Нарастающий вой гравитационного заряда перед схлопыванием. */
  implode(pos) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.7, 22);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, T);
    o.frequency.exponentialRampToValueAtTime(1150, T + 0.6);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.5, T + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.68);
    o.connect(f); f.connect(g); g.connect(gain);
    o.start(T); o.stop(T + 0.7);

    const n = this._noiseSrc(false);
    const nf = c.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.setValueAtTime(400, T);
    nf.frequency.exponentialRampToValueAtTime(5200, T + 0.6);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, T);
    ng.gain.exponentialRampToValueAtTime(0.3, T + 0.3);
    ng.gain.exponentialRampToValueAtTime(0.0001, T + 0.66);
    n.connect(nf); nf.connect(ng); ng.connect(gain);
    n.start(T); n.stop(T + 0.7);
  }

  chestOpen(pos) {
    this.material('wood', pos, 1);
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const { gain } = this._node(pos, 0.5, 24);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, T + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.24, T + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, T + i * 0.07 + 0.5);
      o.connect(g); g.connect(gain);
      o.start(T + i * 0.07); o.stop(T + i * 0.07 + 0.55);
    });
  }

  /* ================================================================ */
  footstep(pos) {
    if (!this._world() || !this._limit('step', 180)) return;
    const c = this.ctx, T = c.currentTime;
    const g0 = c.createGain(); g0.gain.value = 0.16; g0.connect(this.sfx);
    const n = this._noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 260 + Math.random() * 180; f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.7, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.1);
    n.connect(f); f.connect(g); g.connect(g0);
    n.start(T); n.stop(T + 0.12);
  }
  land(v) {
    if (!this._world()) return;
    const c = this.ctx, T = c.currentTime;
    const g0 = c.createGain(); g0.gain.value = Math.min(0.45, v * 0.03); g0.connect(this.sfx);
    const n = this._noiseSrc(true);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 460;
    const g = c.createGain();
    g.gain.setValueAtTime(0.8, T);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.2);
    n.connect(f); f.connect(g); g.connect(g0);
    n.start(T); n.stop(T + 0.22);
  }

  /* ================================================================ */
  ui(kind = 'click') {
    if (!this.ready || !this.enabled || !this.hostEnabled) return;
    const c = this.ctx, T = c.currentTime;
    const g0 = c.createGain(); g0.gain.value = 0.3; g0.connect(this.sfx);
    const map = { click: [520, 780], back: [520, 330], deny: [260, 190], star: [880, 1320], tab: [660, 660] };
    const [f0, f1] = map[kind] || map.click;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f0, T);
    o.frequency.exponentialRampToValueAtTime(f1, T + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.exponentialRampToValueAtTime(0.5, T + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, T + 0.2);
    o.connect(g); g.connect(g0);
    o.start(T); o.stop(T + 0.22);
  }

  star(index) {
    if (!this.ready || !this.enabled || !this.hostEnabled) return;
    const c = this.ctx, T = c.currentTime;
    const g0 = c.createGain(); g0.gain.value = 0.42; g0.connect(this.sfx);
    const base = 659.25 * Math.pow(2, index * 4 / 12);
    [1, 1.5, 2].forEach((mul, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = base * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, T);
      g.gain.exponentialRampToValueAtTime(0.4 / (i + 1), T + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, T + 0.75);
      o.connect(g); g.connect(g0);
      o.start(T); o.stop(T + 0.8);
    });
  }

  fanfare() {
    if (!this.ready || !this.enabled || !this.hostEnabled) return;
    const c = this.ctx, T = c.currentTime;
    const g0 = c.createGain(); g0.gain.value = 0.34; g0.connect(this.sfx);
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      const t0 = T + i * 0.1;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      o.connect(lp); lp.connect(g); g.connect(g0);
      o.start(t0); o.stop(t0 + 0.45);
    });
  }

  /* ================================================================ */
  /* Погода и торнадо (нужны песочнице)                               */
  /* ================================================================ */
  /**
   * Ровный фон погоды: петля шума через фильтр.
   * kind: 'rain' — шелест, 'storm' — гуще и ниже, 'tornado' — рёв.
   */
  startAmbient(kind, level = 1) {
    if (!this.ready || !this.hostEnabled) return null;
    this.stopAmbient(kind);
    const c = this.ctx, T = c.currentTime;
    const cfg = {
      rain: { brown: false, type: 'bandpass', freq: 2600, q: 0.6, vol: 0.10 },
      storm: { brown: false, type: 'bandpass', freq: 1700, q: 0.5, vol: 0.15 },
      tornado: { brown: true, type: 'lowpass', freq: 420, q: 1.0, vol: 0.5 },
    }[kind];
    if (!cfg) return null;

    const n = this._noiseSrc(cfg.brown);
    const f = c.createBiquadFilter();
    f.type = cfg.type; f.frequency.value = cfg.freq; f.Q.value = cfg.q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(cfg.vol * level, T + 0.8);
    n.connect(f); f.connect(g); g.connect(this.sfx);
    n.start(T);

    // лёгкое «дыхание» — иначе петля слышна как ровное шипение
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = kind === 'tornado' ? 0.7 : 0.16;
    const lg = c.createGain();
    lg.gain.value = cfg.vol * level * (kind === 'tornado' ? 0.45 : 0.3);
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start(T);

    if (!this._ambients) this._ambients = {};
    this._ambients[kind] = { src: n, gain: g, lfo, vol: cfg.vol };
    return this._ambients[kind];
  }

  setAmbientLevel(kind, level) {
    const a = this._ambients && this._ambients[kind];
    if (!a) return;
    a.gain.gain.setTargetAtTime(a.vol * level, this.ctx.currentTime, 0.3);
  }

  stopAmbient(kind) {
    if (!this._ambients) return;
    const keys = kind ? [kind] : Object.keys(this._ambients);
    for (const k of keys) {
      const a = this._ambients[k];
      if (!a) continue;
      const T = this.ctx.currentTime;
      try {
        a.gain.gain.cancelScheduledValues(T);
        a.gain.gain.setValueAtTime(Math.max(0.0001, a.gain.gain.value), T);
        a.gain.gain.exponentialRampToValueAtTime(0.0001, T + 0.5);
        a.src.stop(T + 0.55);
        a.lfo.stop(T + 0.55);
      } catch (e) { /* уже остановлен */ }
      delete this._ambients[k];
    }
  }

  /** Гром: щелчок разряда, удар и длинный раскат. Задержка — по расстоянию. */
  thunder(pos, power = 1) {
    if (!this._world()) return;
    const c = this.ctx, t = c.currentTime;
    const s = this._spatial(pos, 26);
    const T = t + Math.min(0.5, s.dist / 340);
    const { gain } = this._node(pos, 0.9 * power, 26);

    // разряд — короткий яркий треск
    const n1 = this._noiseSrc(false);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g1 = c.createGain();
    g1.gain.setValueAtTime(0.7, T);
    g1.gain.exponentialRampToValueAtTime(0.0001, T + 0.16);
    n1.connect(hp); hp.connect(g1); g1.connect(gain);
    n1.start(T); n1.stop(T + 0.2);

    // удар
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, T);
    o.frequency.exponentialRampToValueAtTime(28, T + 0.6);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, T);
    og.gain.exponentialRampToValueAtTime(0.9, T + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, T + 0.9);
    o.connect(og); og.connect(gain);
    o.start(T); o.stop(T + 1);

    // раскат
    const n2 = this._noiseSrc(true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, T);
    lp.frequency.exponentialRampToValueAtTime(180, T + 2.4);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, T);
    g2.gain.linearRampToValueAtTime(0.55 * power, T + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.0001, T + 2.6);
    n2.connect(lp); lp.connect(g2); g2.connect(gain);
    n2.start(T); n2.stop(T + 2.7);
  }

  /* ================================================================ */
  /* Фоновая музыка: спокойный арпеджиатор + мягкий бас               */
  /* ================================================================ */
  startMusic() {
    if (!this.ready || this.musicOn || !this.hostEnabled) return;
    this.musicOn = true;
    this._step = 0;
    this._nextNote = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn) return;
      const now = this.ctx.currentTime;
      while (this._nextNote < now + 0.3) {
        this._scheduleNote(this._nextNote, this._step);
        this._nextNote += 0.26;
        this._step++;
      }
      this._musicTimer = setTimeout(tick, 90);
    };
    tick();
  }
  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    this._musicTimer = null;
  }
  _scheduleNote(t, step) {
    const c = this.ctx;
    const chords = [
      [0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 7], [2, 5, 9, 12],
    ];
    const bar = Math.floor(step / 8) % chords.length;
    const ch = chords[bar];
    const i = step % 8;
    const seq = [0, 1, 2, 3, 2, 1, 3, 2];
    const semi = ch[seq[i]] + (i === 6 ? 12 : 0);
    const freq = 261.63 * Math.pow(2, semi / 12) * 2;

    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    o.connect(lp); lp.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + 0.45);

    if (i === 0 || i === 4) {
      const b = c.createOscillator();
      b.type = 'sine';
      b.frequency.value = 261.63 * Math.pow(2, (ch[0] - 12) / 12);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      b.connect(bg); bg.connect(this.music);
      b.start(t); b.stop(t + 0.75);
    }
  }
}
