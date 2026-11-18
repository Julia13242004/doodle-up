import {EMBEDDED_SPRITES} from './sprite-data.js?v=4.1';
import {WIDTH, clamp} from './game.js?v=4';

const FILES = {
  hero: 'Doodle',
  shoot: 'Doodle-shoot',
  normal: 'birthday/platform-birthday-normal-game',
  moving: 'birthday/platform-birthday-moving-game',
  breakable: 'birthday/platform-birthday-breakable-game',
  blob: 'monster-blob',
  cyclops: 'monster-cyclops',
  bat: 'monster-bat',
  burger: 'prize-burger',
  cherry: 'prize-cherry',
  gift: 'prize-gift'
};
const INK = '#24241a';

export async function loadSprites() {
  const entries = await Promise.all(Object.entries(FILES).map(([name, file]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([name, image]);
    image.onerror = () => reject(new Error('Не удалось загрузить спрайт ' + file));
    image.src = EMBEDDED_SPRITES[file];
  })));
  return Object.fromEntries(entries);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    this.sprites = {};
    this.sparkles = [];
    this.resize();
  }

  resize() {
    const {width, height} = this.canvas.getBoundingClientRect();
    const ratio = clamp(window.devicePixelRatio || 1, 1, 2.5);
    const actualWidth = Math.max(1, Math.round(width * ratio));
    const actualHeight = Math.max(1, Math.round(height * ratio));
    this.canvas.width = actualWidth;
    this.canvas.height = actualHeight;
    this.scale = actualWidth / WIDTH;
    this.height = actualHeight / this.scale;
  }

  sprite(name, x, y, width, height) {
    const image = this.sprites[name];
    if (image) this.ctx.drawImage(image, x, y, width, height);
  }

  background(camera) {
    const {ctx, height} = this;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, height);
    const paperOrigin = height + camera;
    for (const [step, color] of [[20, '#ededed'], [100, '#d9d9d9']]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = step === 20 ? .7 : .86;
      ctx.beginPath();
      for (let x = 0; x <= WIDTH; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = ((paperOrigin % step) + step) % step; y <= height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
      }
      ctx.stroke();
    }
  }

  draw(game, now = 0) {
    const {ctx, scale, height} = this;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.background(game?.camera ?? 0);
    if (!game) {
      this.sprite('moving', -20, height * .16, 111, 27.75);
      this.sprite('normal', WIDTH - 80, height * .27, 100, 25);
      this.sprite('breakable', WIDTH - 57, height * .73, 85, 21.25);
      this.sprite('normal', 5, height * .85, 98, 24.5);
      return;
    }

    const screenY = (y) => height - (y - game.camera);
    for (const platform of game.platforms) {
      const y = screenY(platform.y);
      if (y < -55 || y > height + 35) continue;
      const width = platform.width;
      this.sprite(platform.kind, platform.x - width / 2, y - width * .026, width, width / 4);
      if (platform.boost === 'spring') this.spring(platform.x, y);
      if (platform.boost === 'jet') this.jetpack(platform.x, y - 15, .8);
    }

    for (const fragment of game.fragments) {
      const age = game.time - fragment.time;
      for (const side of [-1, 1]) {
        const x = fragment.x + side * age * 58;
        const y = screenY(fragment.y) + age * age * 280;
        const width = fragment.width;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(side * age * 2.5);
        ctx.globalAlpha = clamp(1 - age, 0, 1);
        ctx.beginPath();
        ctx.rect(side < 0 ? -width / 2 : 0, -6, width / 2, width / 4 + 8);
        ctx.clip();
        this.sprite('breakable', -width / 2, -3, width, width / 4);
        ctx.restore();
      }
    }

    for (const item of game.items) {
      const y = screenY(item.y) + Math.sin(game.time * 5 + item.x) * 3;
      const size = item.kind === 'gift' ? 39 : 34;
      this.sprite(item.kind, item.x - size / 2, y - size / 2, size, size);
    }

    for (const monster of game.monsters) {
      const size = {blob: 59, cyclops: 63, bat: 75}[monster.kind];
      this.sprite(monster.kind, monster.x - size / 2, screenY(monster.y) - size / 2, size, size);
    }

    for (const shot of game.shots) {
      ctx.fillStyle = '#f7ab36';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(shot.x, screenY(shot.y), 3.3, 6, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    for (const sparkle of this.sparkles) {
      if (now > sparkle.end) continue;
      const age = 1 - (sparkle.end - now) / 570;
      const y = screenY(sparkle.y) - age * 28;
      ctx.globalAlpha = clamp(1 - age, 0, 1);
      ctx.fillStyle = '#a64b1d';
      ctx.font = '900 19px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(sparkle.label, sparkle.x, y);
      ctx.globalAlpha = 1;
    }
    this.sparkles = this.sparkles.filter(({end}) => now < end);

    const p = game.player;
    const y = screenY(p.y);
    for (const x of [p.x - WIDTH, p.x, p.x + WIDTH]) {
      if (x < -54 || x > WIDTH + 54) continue;
      this.hero(p, x, y, game.time);
    }
  }

  hero(player, x, y, time) {
    const ctx = this.ctx;
    if (player.shield > 0 && player.jet <= 0 && Math.floor(time * 14) % 2) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(player.face, 1);
    if (player.jet > 0) {
      this.jetpack(-14, -20);
      ctx.fillStyle = '#f4a234';
      ctx.beginPath();
      ctx.moveTo(-20, -9);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-14, 9 + Math.sin(time * 65) * 5);
      ctx.fill();
    }
    const shooting = player.firing > .075;
    const img = this.sprites[shooting ? 'shoot' : 'hero'];
    if (img) {
      if (shooting) {
        ctx.drawImage(img, 45, 10, 382, 483, -30, -60, 49, 62);
      } else {
        ctx.drawImage(img, 118, 53, 333, 411, -17, -47, 38, 47);
      }
    }
    ctx.restore();
  }

  spring(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#f3d965';
    for (let level = 0; level < 3; level++) {
      ctx.beginPath();
      ctx.ellipse(0, -3 - level * 3, 8, 3.1, .06, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  jetpack(x, y, size = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#c7d8db';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 13, .05, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e45450';
    ctx.beginPath();
    ctx.ellipse(0, -2, 2.8, 5, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

