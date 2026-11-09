/**
 * Интерфейс: экраны, HUD, комбо-индикаторы, обучение, панель результата.
 * Вся вёрстка — в index.html, здесь только состояние и анимации.
 */
import { I18N, t } from '../core/I18n.js';

export class UIManager {
  constructor(audio) {
    this.audio = audio;
    this.screens = {
      loading: document.getElementById('screen-loading'),
      menu: document.getElementById('screen-menu'),
      levels: document.getElementById('screen-levels'),
      hud: document.getElementById('hud'),
      pause: document.getElementById('screen-pause'),
      complete: document.getElementById('screen-complete'),
      settings: document.getElementById('screen-settings'),
      reward: document.getElementById('screen-reward'),
      shop: document.getElementById('screen-shop'),
    };
    this.el = {
      loadFill: document.getElementById('load-fill'),
      loadText: document.getElementById('load-text'),
      found: document.getElementById('hud-found'),
      total: document.getElementById('hud-total'),
      score: document.getElementById('hud-score'),
      gems: document.getElementById('hud-gems'),
      level: document.getElementById('hud-level'),
      hint: document.getElementById('hud-hint'),
      tntCount: document.getElementById('tnt-count'),
      crosshair: document.getElementById('crosshair'),
      combo: document.getElementById('combo-stack'),
      tutorial: document.getElementById('tutorial'),
      flyers: document.getElementById('flyers'),
      crystalChip: document.querySelector('.hud-crystals'),
      gemTarget: document.getElementById('hud-gem-target'),
      hotbar: document.getElementById('hotbar'),
      lsTitle: document.getElementById('ls-title'),
      lsName: document.getElementById('ls-name'),
      lsStars: document.getElementById('ls-stars'),
      lsPlay: document.getElementById('ls-play'),
      lvlGrid: document.getElementById('lvl-grid'),
      gridOverlay: document.getElementById('ls-grid-overlay'),
      menuStars: document.getElementById('menu-stars'),
      menuGems: document.getElementById('menu-gems'),
      winStars: document.querySelectorAll('.wstar'),
      winCrystals: document.getElementById('win-crystals'),
      winTnt: document.getElementById('win-tnt'),
      winBlocks: document.getElementById('win-blocks'),
      winScore: document.getElementById('win-score'),
      muteIco: document.getElementById('mute-ico'),
      dmgVignette: document.getElementById('dmg-vignette'),
      shopList: document.getElementById('shop-list'),
      shopGems: document.getElementById('shop-gems'),
      chargeCount: document.getElementById('hud-charges'),
    };
    this.atlas = null;
    this.tileCache = {};
    this.shopTab = 'explosives';
    this.current = 'loading';
    this.actions = {};
    this.tutSteps = [];
    this.scoreShown = 0;
    this.scoreTarget = 0;
    this._levelTimer = 0;
    this._bind();
  }

  on(name, fn) { this.actions[name] = fn; }

  _bind() {
    document.addEventListener('click', (e) => {
      // пауза от площадки: интерфейс не реагирует ни на что
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
    // ползунки и переключатели настроек
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
    return ['pause', 'complete', 'settings', 'reward'].some(k =>
      this.screens[k] && this.screens[k].classList.contains('active'));
  }
  showHUD(on) {
    this.screens.hud.classList.toggle('active', on);
    if (on) this.layoutHotbar();
  }

  progress(p, text) {
    this.el.loadFill.style.width = Math.round(p * 100) + '%';
    if (text) this.el.loadText.textContent = text;
  }

  /* ---------------------------------------------------------- */
  setLevelInfo(num, name, hint) {
    this.el.level.textContent = t('hud.level', { n: num });
    this.el.level.classList.add('show');
    this._levelTimer = 3.4;
    if (hint) {
      this.el.hint.textContent = hint;
      this.el.hint.classList.add('show');
    } else this.el.hint.classList.remove('show');
  }

  setCrystals(found, total) {
    this.el.found.textContent = found;
    this.el.total.textContent = total;
    this.el.crystalChip.classList.remove('pop');
    void this.el.crystalChip.offsetWidth;
    this.el.crystalChip.classList.add('pop');
  }
  setScore(v) { this.scoreTarget = v; }
  setGems(v) { this.el.gems.textContent = v; }
  /* ---------------- панель предметов ---------------- */
  setAtlas(atlas) { this.atlas = atlas; }

  /** Вырезает тайл из атласа в data URL — для иконок в интерфейсе. */
  tileImage(tileIndex) {
    if (this.tileCache[tileIndex]) return this.tileCache[tileIndex];
    if (!this.atlas) return '';
    const a = this.atlas;
    const src = a.texture.image;
    const c = document.createElement('canvas');
    c.width = c.height = a.tile;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const cx = (tileIndex % a.cols) * a.cell + a.pad;
    const cy = Math.floor(tileIndex / a.cols) * a.cell + a.pad;
    x.drawImage(src, cx, cy, a.tile, a.tile, 0, 0, a.tile, a.tile);
    const url = `url(${c.toDataURL()})`;
    this.tileCache[tileIndex] = url;
    return url;
  }

  /**
   * Собирает панель предметов: открытые заряды + зажигалка.
   * @param {Array} items [{kind:'charge'|'lighter', name, tile, cost}]
   */
  buildHotbar(items) {
    const h = this.el.hotbar;
    h.innerHTML = '';
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.slot = i;
      d.title = it.name;
      const key = document.createElement('div');
      key.className = 'key'; key.textContent = String(i + 1);
      d.appendChild(key);
      const ico = document.createElement('div');
      if (it.kind === 'lighter') {
        ico.className = 'slot-ico ico-lighter';
      } else {
        ico.className = 'slot-img';
        ico.style.backgroundImage = (this.chargeIcon && it.key)
          ? this.chargeIcon(it.key) : this.tileImage(it.tile);
      }
      d.appendChild(ico);
      if (it.kind === 'charge') {
        const cost = document.createElement('div');
        cost.className = 'cost';
        cost.textContent = '×' + it.cost;
        d.appendChild(cost);
      }
      h.appendChild(d);
    });
    this.hotbarItems = items;
    this.layoutHotbar();
  }

  /**
   * Панель предметов стоит по центру внизу, а экранные контролы — по углам.
   * На узких экранах все трое встречаются, поэтому панель поднимается над
   * ними, а если места нет совсем — прячется: выбор предмета всё равно
   * доступен кнопками, а счётчик зарядов есть в верхней строке.
   */
  layoutHotbar() {
    const h = this.el.hotbar;
    if (!h) return;
    h.style.bottom = '';
    h.style.display = '';
    if (!document.body.classList.contains('touch')) return;
    const r = h.getBoundingClientRect();
    if (!r.width) return;
    let top = Infinity, hit = false;
    for (const sel of ['#stick-zone', '.touch-buttons']) {
      const z = document.querySelector(sel);
      if (!z) continue;
      const b = z.getBoundingClientRect();
      if (b.right > r.left && b.left < r.right && b.top < r.bottom && b.bottom > r.top) hit = true;
      if (b.top < top) top = b.top;
    }
    if (!hit) return;
    const bottom = window.innerHeight - top + 8;
    if (bottom + r.height > window.innerHeight - 4) h.style.display = 'none';
    else h.style.bottom = Math.round(bottom) + 'px';
  }

  setTnt(v) {
    this.el.tntCount = this.el.tntCount || null;
    const slots = this.el.hotbar.querySelectorAll('.slot');
    const items = this.hotbarItems || [];
    slots.forEach((s, i) => {
      const it = items[i];
      if (!it || it.kind !== 'charge') return;
      s.classList.toggle('empty', v < it.cost);
    });
    this.charges = v;
    if (this.el.chargeCount) this.el.chargeCount.textContent = v;
  }
  setSlot(i) {
    this.el.hotbar.querySelectorAll('.slot').forEach((s, k) => s.classList.toggle('active', k === i));
  }
  setCrosshair(state) {
    const c = this.el.crosshair;
    c.classList.remove('can', 'no', 'fire');
    if (state) c.classList.add(state);
  }

  combo(text, small) {
    const d = document.createElement('div');
    d.className = 'combo' + (small ? ' small' : '');
    d.textContent = text;
    this.el.combo.appendChild(d);
    setTimeout(() => d.remove(), 900);
    while (this.el.combo.children.length > 4) this.el.combo.firstChild.remove();
  }

  /** Кристалл летит в счётчик. */
  flyCrystal(from) {
    const target = this.el.gemTarget.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'flyer';
    d.style.backgroundImage = getComputedStyle(this.el.gemTarget).backgroundImage;
    d.style.left = (from.x - 16) + 'px';
    d.style.top = (from.y - 16) + 'px';
    this.el.flyers.appendChild(d);
    const tx = target.left + target.width / 2 - from.x;
    const ty = target.top + target.height / 2 - from.y;
    const anim = d.animate([
      { transform: 'translate(0,0) scale(1.5)', opacity: 1 },
      { transform: `translate(${tx * 0.4}px, ${ty * 0.4 - 60}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) scale(0.35)`, opacity: 0.2 },
    ], { duration: 620, easing: 'cubic-bezier(.4,.1,.3,1)' });
    anim.onfinish = () => d.remove();
    setTimeout(() => d.remove(), 900);
  }

  /* ---------------------------------------------------------- */
  setTutorial(steps) {
    this.tutSteps = steps;
    this.renderTutorial();
  }
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
    // На последнем уровне сообщаем, что контент закончился (требование Playables).
    const nextBtn = document.querySelector('#screen-complete [data-act=nextlevel]');
    let note = document.getElementById('win-last');
    if (!note) {
      note = document.createElement('div');
      note.id = 'win-last';
      note.className = 'win-last';
      const rows = document.querySelector('#screen-complete .win-rows');
      rows.parentNode.insertBefore(note, rows.nextSibling);
    }
    note.textContent = data.last ? (data.lastText || '') : '';
    note.style.display = data.last ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = data.last ? 'none' : '';
    this.el.winCrystals.textContent = `${data.crystals}/${data.totalCrystals}`;
    this.el.winTnt.textContent = `${data.tntUsed}/${data.tntMax}`;
    this.el.winBlocks.textContent = data.blocks;
    this.el.winScore.textContent = data.score;
    this.el.winStars.forEach(s => { s.classList.remove('on', 'off'); });
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

  /* ---------------------------------------------------------- */
  setLevelSelect(num, name, stars, locked, canPrev, canNext) {
    this.el.lsTitle.textContent = t('ls.level', { n: num });
    this.el.lsName.textContent = name;
    this.el.lsStars.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('i');
      if (i < stars) s.className = 'on';
      this.el.lsStars.appendChild(s);
    }
    this.screens.levels.classList.toggle('locked', locked);
    document.querySelector('.ls-left').classList.toggle('off', !canPrev);
    document.querySelector('.ls-right').classList.toggle('off', !canNext);
  }

  buildGrid(count, save, onPick) {
    const g = this.el.lvlGrid;
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

  setMenuStats(stars, gems, maxStars) {
    if (this.el.menuStars) this.el.menuStars.textContent = stars;
    if (this.el.menuGems) this.el.menuGems.textContent = gems;
    const dim = document.querySelector('#screen-menu .dim');
    if (dim) dim.textContent = '/' + maxStars;
  }

  /* ---------------- мастерская ---------------- */
  /**
   * @param {ShopManager} shop
   * @param {(kind,key)=>void} onBuy
   */
  renderShop(shop, onBuy) {
    this.el.shopGems.textContent = shop.gems;
    const list = this.el.shopList;
    list.innerHTML = '';
    const rows = this.shopTab === 'player' ? shop.playerRows() : shop.explosiveRows();

    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'shop-row ' +
        (r.state === 'locked' ? 'locked' : r.state === 'max' ? 'max' : 'owned');

      const ico = document.createElement('div');
      ico.className = 'shop-ico';
      if (r.mat !== undefined) {
        if (this.chargeIcon) {
          ico.style.backgroundImage = this.chargeIcon(r.key);
        } else {
          const tiles = this.materialTiles ? this.materialTiles(r.mat) : null;
          if (tiles) ico.style.backgroundImage = this.tileImage(tiles[1]);
        }
      } else {
        ico.textContent = r.icon || '★';
        ico.style.background = 'linear-gradient(180deg,#4a76c8,#22417f)';
      }
      row.appendChild(ico);

      const info = document.createElement('div');
      info.className = 'shop-info';
      const name = document.createElement('div');
      name.className = 'shop-name';
      name.textContent = t(r.name);
      if (r.level > 0) {
        const lv = document.createElement('span');
        lv.className = 'lvl';
        lv.textContent = r.value !== undefined ? r.value : t('shop.lvl', { n: r.level });
        name.appendChild(lv);
      }
      if (r.charges) {
        const c = document.createElement('span');
        c.className = 'cost-tag';
        c.textContent = t('shop.charges', { n: r.charges });
        name.appendChild(c);
      }
      info.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'shop-desc';
      desc.textContent = t(r.desc);
      info.appendChild(desc);

      const pips = document.createElement('div');
      pips.className = 'shop-pips';
      for (let i = 0; i < r.maxLevel; i++) {
        const p = document.createElement('i');
        if (i < r.level) p.className = 'on';
        pips.appendChild(p);
      }
      info.appendChild(pips);
      row.appendChild(info);

      if (r.state === 'max') {
        const s = document.createElement('span');
        s.className = 'shop-state';
        s.textContent = t('shop.max');
        row.appendChild(s);
      } else {
        const b = document.createElement('button');
        b.className = 'shop-buy' + (r.affordable ? '' : ' poor');
        b.innerHTML = `${r.cost}<span class="ico ico-gem"></span>`;
        b.title = t(r.state === 'locked' ? 'shop.unlock' : 'shop.upgrade');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.audio) this.audio.ui(r.affordable ? 'star' : 'deny');
          if (r.affordable) onBuy(this.shopTab === 'player' ? 'player' : 'explosive', r.key);
        });
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }

  bindShopTabs(onTab) {
    document.querySelectorAll('.shop-tab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.shop-tab').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        this.shopTab = b.dataset.tab;
        if (this.audio) this.audio.ui('tab');
        onTab(this.shopTab);
      });
    });
  }

  // кнопки звука может не быть: на некоторых площадках её даёт хост
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

  flashDamage(v) {
    this.el.dmgVignette.style.opacity = Math.min(0.85, v);
    setTimeout(() => { this.el.dmgVignette.style.opacity = 0; }, 220);
  }

  update(dt) {
    if (this._levelTimer > 0) {
      this._levelTimer -= dt;
      if (this._levelTimer <= 0) {
        this.el.level.classList.remove('show');
        this.el.hint.classList.remove('show');
      }
    }
    if (this.scoreShown !== this.scoreTarget) {
      const d = this.scoreTarget - this.scoreShown;
      this.scoreShown += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 7)));
      if (Math.abs(this.scoreTarget - this.scoreShown) < 1) this.scoreShown = this.scoreTarget;
      this.el.score.textContent = Math.round(this.scoreShown);
    }
  }
}
