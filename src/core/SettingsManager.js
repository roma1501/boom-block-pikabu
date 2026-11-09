/**
 * Настройки: качество, громкость, чувствительность, тряска, замедление.
 * Хранятся вместе с прогрессом, применяются ко всем подсистемам сразу.
 */
export class SettingsManager {
  constructor(save) {
    this.save = save;
    this.listeners = [];
  }

  get s() { return this.save.data.settings; }

  onChange(fn) { this.listeners.push(fn); }
  _emit(key) { for (const f of this.listeners) f(key, this.s); }

  set(key, value) {
    this.s[key] = value;
    this.save.save();
    this._emit(key);
  }

  apply(game) {
    const s = this.s;
    if (game.audio) {
      game.audio.setVolume(s.muted ? 0 : s.volume);
      game.audio.setMusicVolume(s.music);
      if (s.music > 0.01 && !s.muted) game.audio.startMusic(); else game.audio.stopMusic();
    }
    if (game.input) {
      game.input.sensitivity = s.sensitivity;
      game.input.invertY = !!s.invertY;
    }
    if (game.player) {
      game.player.shakeScale = s.shake * (game.shop ? game.shop.armorMul : 1);
    }
    game.slowmoEnabled = !!s.slowmo;
    if (game.mobile) game.mobile.haptics = s.haptics === undefined ? true : !!s.haptics;
  }
}
