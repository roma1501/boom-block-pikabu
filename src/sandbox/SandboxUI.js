/**
 * Интерфейс песочницы.
 * Разметка — в sandbox.html, здесь только состояние, анимации и события.
 * Основа та же, что в основной игре, но HUD другой: вместо кристаллов и
 * очков в центре внимания шкала разрушения и остаток бомб.
 */
import { I18N, t } from '../core/I18n.js';

export class SandboxUI {
  constructor(audio) {
    this.audio = audio;
    this.screens = {
      loading: document.getElementById('screen-loading'),
      menu: document.getElementById('screen-menu'),
      maps: document.getElementById('screen-maps'),
      hud: document.getElementById('hud'),
      pause: document.getElementById('screen-pause'),
      complete: document.getElementById('screen-complete'),
      fail: document.getElementById('screen-fail'),
      settings: document.getElementById('screen-settings'),
      tornado: document.getElementById('screen-tornado'),
    };
    this.el = {
      loadFill: document.getElementById('load-fill'),
      loadText: document.getElementById('load-text'),
      bombs: document.getElementById('hud-bombs'),
      bombChip: document.querySelector('.hud-bombs'),
      percent: document.getElementById('hud-percent'),
      progFill: document.getElementById('prog-fill'),
      progGoal: document.getElementById('prog-goal'),
      progS2: document.getElementById('prog-s2'),
      progS3: document.getElementById('prog-s3'),
      goalLbl: document.getElementById('hud-goal'),
      score: document.getElementById('hud-score'),
      map: document.getElementById('hud-map'),
      hint: document.getElementById('hud-hint'),
      combo: document.getElementById('combo-stack'),
      tutorial: document.getElementById('tutorial'),
      hotbar: document.getElementById('hotbar'),
      mapGrid: document.getElementById('map-grid'),
      menuCleared: document.getElementById('menu-cleared'),
      menuStars: document.getElementById('menu-stars'),
      menuTotal: document.getElementById('menu-total'),
      winStars: document.querySelectorAll('.wstar'),
      winPercent: document.getElementById('win-percent'),
      winBombs: document.getElementById('win-bombs'),
      winBlocks: document.getElementById('win-blocks'),
      winScore: document.getElementById('win-score'),
      winLast: document.getElementById('win-last'),
      winNext: document.getElementById('win-next'),
      failText: document.getElementById('fail-text'),
      muteIco: document.getElementById('mute-ico'),
      tornadoBtn: document.getElementById('btn-tornado'),
      tornadoBadge: document.getElementById('tornado-badge'),
      weather: document.getElementById('hud-weather'),
      weatherIco: document.getElementById('hud-weather-ico'),
      weatherTxt: document.getElementById('hud-weather-txt'),
      tPips: document.getElementById('t-pips'),
      tCount: document.getElementById('t-count'),
      tHave: document.getElementById('t-have'),
      tHaveN: document.getElementById('t-have-n'),
      tUse: document.getElementById('t-use'),
      tNote: document.getElementById('t-note'),
    };
    this.actions = {};
    this.tutSteps = [];
    this.scoreShown = 0;
    this.scoreTarget = 0;
    this.percentShown = 0;
    this.percentTarget = 0;
    this._mapTimer = 0;
    this.current = 'loading';
    this.hotbarItems = [];
    this._bind();
  }

  on(name, fn) { this.actions[name] = fn; }

  _bind() {
    document.addEventListener('click', (e) => {
      if (document.body.classList.contains('host-paused')) return;
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      btn.classList.add('press');
      setTimeout(() => btn.classList.remove('press'), 90);
      if (this.audio) this.audio.ui(act === 'menu' || act === 'quit' ? 'back' : 'click');
      if (this.actions[act]) this.actions[act]();
    });
    document.addEventListener('pointerdown', (e) => {
      if (document.body.classList.contains('host-paused')) return;
      const slot = e.target.closest('.slot');
      if (slot && this.actions.slot) this.actions.slot(+slot.dataset.slot);
    });
    document.querySelectorAll('input[type=range][data-setting]').forEach(inp => {
      inp.addEventListener('input', () => {
        if (this.actions.setting) this.actions.setting(inp.dataset.setting, +inp.value / 100);
      });
    });
    document.querySelectorAll('.seg[data-setting]').forEach(seg => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (this.actions.setting) this.actions.setting(seg.dataset.setting, b.dataset.val);
      });
    });
  }

  /* ---------------------------------------------------------- */
  show(name) {
    for (const k in this.screens) {
      const el = this.screens[k];
      if (!el) continue;
      el.classList.toggle('active', k === name);
    }
    this.current = name;
  }
  overlay(name, on) {
    const el = this.screens[name];
    if (el) el.classList.toggle('active', on);
  }
  isOverlayOpen() {
    return ['pause', 'complete', 'fail', 'settings', 'tornado'].some(k =>
      this.screens[k] && this.screens[k].classList.contains('active'));
  }
  showHUD(on) { this.screens.hud.classList.toggle('active', on); }

  progress(p, text) {
    this.el.loadFill.style.width = Math.round(p * 100) + '%';
    if (text) this.el.loadText.textContent = text;
  }

  /* ---------------------------------------------------------- */
  setMapInfo(num, name, hint) {
    this.el.map.textContent = t('sb.map', { n: num }) + ' · ' + name;
    this.el.map.classList.add('show');
    this._mapTimer = 4.2;
    if (hint) {
      this.el.hint.textContent = hint;
      this.el.hint.classList.add('show');
    } else this.el.hint.classList.remove('show');
  }

  setBombs(n) {
    this.el.bombs.textContent = n;
    this.el.bombChip.classList.remove('pop');
    void this.el.bombChip.offsetWidth;
    this.el.bombChip.classList.add('pop');
    this.el.bombChip.classList.toggle('empty', n <= 0);
    this.bombs = n;
    this._refreshSlots();
  }

  /** Пороги на шкале: цель прохождения и две звезды. */
  setGoal(goal, stars) {
    this.el.progGoal.style.left = goal + '%';
    this.el.progS2.style.left = stars[0] + '%';
    this.el.progS3.style.left = stars[1] + '%';
    if (this.el.goalLbl) this.el.goalLbl.textContent = t('sb.goal', { n: goal });
    this.goal = goal;
  }

  setPercent(v) { this.percentTarget = v; }

  setScore(v) { this.scoreTarget = v; }

  /* ---------------- панель бомб ---------------- */
  setAtlas(atlas) { this.atlas = atlas; this.tileCache = {}; }

  /** Вырезает тайл из атласа в data URL — иконки бомб в панели. */
  tileImage(tileIndex) {
    if (!this.tileCache) this.tileCache = {};
    if (this.tileCache[tileIndex]) return this.tileCache[tileIndex];
    if (!this.atlas) return '';
    const a = this.atlas;
    const c = document.createElement('canvas');
    c.width = c.height = a.tile;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const cx = (tileIndex % a.cols) * a.cell + a.pad;
    const cy = Math.floor(tileIndex / a.cols) * a.cell + a.pad;
    x.drawImage(a.texture.image, cx, cy, a.tile, a.tile, 0, 0, a.tile, a.tile);
    const url = `url(${c.toDataURL()})`;
    this.tileCache[tileIndex] = url;
    return url;
  }

  buildHotbar(items) {
    const h = this.el.hotbar;
    h.innerHTML = '';
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.slot = i;
      d.title = it.locked ? t('sb.locked', { n: it.unlock }) : it.name;
      const key = document.createElement('div');
      key.className = 'key'; key.textContent = String(i + 1);
      d.appendChild(key);
      const ico = document.createElement('div');
      ico.className = 'slot-img';
      ico.style.backgroundImage = it.icon || '';
      d.appendChild(ico);
      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.textContent = '×' + it.cost;
      d.appendChild(cost);
      if (it.locked) {
        const lk = document.createElement('div');
        lk.className = 'slot-lock';
        lk.textContent = it.unlock;
        d.appendChild(lk);
      }
      h.appendChild(d);
    });
    this.hotbarItems = items;
    this._refreshSlots();
  }

  _refreshSlots() {
    const slots = this.el.hotbar.querySelectorAll('.slot');
    slots.forEach((s, i) => {
      const it = this.hotbarItems[i];
      if (!it) return;
      s.classList.toggle('locked', !!it.locked);
      s.classList.toggle('empty', !it.locked && (this.bombs || 0) < it.cost);
    });
  }

  setSlot(i) {
    this.el.hotbar.querySelectorAll('.slot').forEach((s, k) => s.classList.toggle('active', k === i));
  }

  /* ---------------- торнадо и погода ---------------- */
  /**
   * Кнопка смерча живёт в двух состояниях: пока смерча нет — это кнопка
   * рекламы (и помечена как реклама), когда есть — обычная кнопка выбора.
   */
  setTornado(count, views) {
    const b = this.el.tornadoBtn;
    if (!b) return;
    const ready = count > 0;
    this.el.tornadoBadge.textContent = ready ? '×' + count : views + '/2';
    b.classList.toggle('ready', ready);
    b.classList.toggle('ad', !ready);
    if (!ready) b.classList.remove('armed');
  }

  setTornadoArmed(on) {
    if (this.el.tornadoBtn) this.el.tornadoBtn.classList.toggle('armed', on);
  }

  /**
   * Окно смерча: сколько роликов уже засчитано, что будет дальше и
   * честное предупреждение, что кнопка запускает рекламу.
   */
  showTornadoPanel(count, views, need) {
    const pips = this.el.tPips;
    if (pips) {
      pips.innerHTML = '';
      for (let i = 0; i < need; i++) {
        const p = document.createElement('i');
        if (i < views) p.className = 'on';
        pips.appendChild(p);
      }
    }
    if (this.el.tCount) this.el.tCount.textContent = `${views} / ${need}`;
    const has = count > 0;
    if (this.el.tHave) {
      this.el.tHave.style.display = has ? '' : 'none';
      if (this.el.tHaveN) this.el.tHaveN.textContent = '×' + count;
    }
    if (this.el.tUse) this.el.tUse.style.display = has ? '' : 'none';
    if (this.el.tNote) {
      this.el.tNote.innerHTML = t(has ? 'sb.tornado.adnote.more' : 'sb.tornado.adnote',
        { n: Math.max(0, need - views) });
    }
    this.overlay('tornado', true);
  }

  refreshTornadoPanel(count, views, need) {
    if (this.screens.tornado && this.screens.tornado.classList.contains('active')) {
      this.showTornadoPanel(count, views, need);
    }
  }

  setWeather(kind) {
    const el = this.el.weather;
    if (!el) return;
    if (!kind || kind === 'clear') { el.style.display = 'none'; return; }
    el.style.display = '';
    this.el.weatherIco.textContent = { rain: '🌧', snow: '❄️', storm: '⛈️' }[kind] || '';
    this.el.weatherTxt.textContent = t('sb.weather.' + kind + '.s');
  }

  /* ---------------------------------------------------------- */
  combo(text, small) {
    const d = document.createElement('div');
    d.className = 'combo' + (small ? ' small' : '');
    d.textContent = text;
    this.el.combo.appendChild(d);
    setTimeout(() => d.remove(), 900);
    while (this.el.combo.children.length > 4) this.el.combo.firstChild.remove();
  }

  setTutorial(steps) { this.tutSteps = steps; this.renderTutorial(); }
  renderTutorial() {
    const c = this.el.tutorial;
    c.innerHTML = '';
    for (const s of this.tutSteps) {
      if (s.done && s.hidden) continue;
      const d = document.createElement('div');
      d.className = 'tut' + (s.done ? ' done' : '');
      d.innerHTML = s.text;
      c.appendChild(d);
    }
  }
  completeTutorialStep(id) {
    const s = this.tutSteps.find(x => x.id === id);
    if (!s || s.done) return;
    s.done = true;
    this.renderTutorial();
    setTimeout(() => { s.hidden = true; this.renderTutorial(); }, 420);
  }
  clearTutorial() { this.tutSteps = []; this.el.tutorial.innerHTML = ''; }

  /* ---------------------------------------------------------- */
  showComplete(data) {
    this.el.winPercent.textContent = data.percent + '%';
    this.el.winBombs.textContent = `${data.bombsUsed}/${data.bombsMax}`;
    this.el.winBlocks.textContent = data.blocks;
    this.el.winScore.textContent = data.score;
    this.el.winLast.textContent = data.last ? t('sb.win.last') : '';
    this.el.winLast.style.display = data.last ? 'block' : 'none';
    if (this.el.winNext) this.el.winNext.style.display = data.last ? 'none' : '';
    this.el.winStars.forEach(s => s.classList.remove('on', 'off'));
    this.overlay('complete', true);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const el = this.el.winStars[i];
        if (i < data.stars) { el.classList.add('on'); if (this.audio) this.audio.star(i); }
        else el.classList.add('off');
      }, 380 + i * 320);
    }
    if (this.audio) setTimeout(() => this.audio.fanfare(), 380 + data.stars * 320);
  }

  showFail(percent, goal) {
    this.el.failText.innerHTML = t('sb.fail.text', { n: percent, g: goal });
    this.overlay('fail', true);
  }

  /* ---------------------------------------------------------- */
  buildGrid(count, save, onPick) {
    const g = this.el.mapGrid;
    g.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      const unlocked = save.isUnlocked(i + 1);
      const st = save.stars(i + 1);
      d.className = 'lvl-cell ' + (!unlocked ? 'lock' : (st > 0 ? 'done' : ''));
      d.innerHTML = unlocked
        ? `${i + 1}<span class="mini">${'★'.repeat(st)}${'·'.repeat(3 - st)}</span>`
        : '🔒';
      if (unlocked) d.addEventListener('click', () => onPick(i));
      g.appendChild(d);
    }
  }

  setMenuStats(cleared, total, stars, maxStars) {
    if (this.el.menuCleared) this.el.menuCleared.textContent = cleared;
    if (this.el.menuTotal) this.el.menuTotal.textContent = '/' + total;
    if (this.el.menuStars) this.el.menuStars.textContent = stars + '/' + maxStars;
  }

  setMuted(m) { if (this.el.muteIco) this.el.muteIco.textContent = m ? '🔇' : '🔊'; }

  syncSettings(s) {
    document.querySelectorAll('input[type=range][data-setting]').forEach(inp => {
      const k = inp.dataset.setting;
      if (s[k] !== undefined) inp.value = Math.round(s[k] * 100);
    });
    document.querySelectorAll('.seg[data-setting]').forEach(seg => {
      const k = seg.dataset.setting;
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', String(s[k]) === b.dataset.val);
      });
    });
  }

  /* ---------------------------------------------------------- */
  update(dt) {
    if (this._mapTimer > 0) {
      this._mapTimer -= dt;
      if (this._mapTimer <= 0) {
        this.el.map.classList.remove('show');
        this.el.hint.classList.remove('show');
      }
    }
    if (this.scoreShown !== this.scoreTarget) {
      const d = this.scoreTarget - this.scoreShown;
      this.scoreShown += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 7)));
      if (Math.abs(this.scoreTarget - this.scoreShown) < 1) this.scoreShown = this.scoreTarget;
      this.el.score.textContent = Math.round(this.scoreShown);
    }
    if (Math.abs(this.percentShown - this.percentTarget) > 0.05) {
      this.percentShown += (this.percentTarget - this.percentShown) * Math.min(1, dt * 6);
      const v = this.percentShown;
      this.el.progFill.style.width = Math.min(100, v) + '%';
      this.el.percent.textContent = Math.round(v) + '%';
      this.el.progFill.classList.toggle('done', v >= (this.goal || 100));
    }
  }
}
