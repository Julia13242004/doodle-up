export const WIDTH = 400;
export const GIFT_GOAL = 5;
export const START_LIVES = 3;
export const FOOD_EFFECTS = Object.freeze({burger: 6, cherry: 8});
export const STEP = 1 / 120;
export const GRAVITY = 1650;
const BOUNCE = 690;
const START_HEIGHT = 125;
const HERO_HEIGHT = 44;
const HERO_RADIUS = 12;
const MONSTERS = ['blob', 'cyclops', 'bat'];

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrapX = (x) => ((x % WIDTH) + WIDTH) % WIDTH;
const distanceX = (a, b) => Math.min(Math.abs(a - b), WIDTH - Math.abs(a - b));
const overlaps = (x, y, entity, radiusX, radiusY) =>
  distanceX(x, entity.x) < radiusX && Math.abs(y - entity.y) < radiusY;

export class Game {
  constructor(viewHeight, random = Math.random) {
    this.height = viewHeight;
    this.random = random;
    this.time = 0;
    this.camera = 0;
    this.furthest = START_HEIGHT;
    this.player = {x: WIDTH / 2, y: START_HEIGHT, vx: 0, vy: BOUNCE, face: 1, firing: 0, shield: 0, jet: 0};
    this.lives = START_LIVES;
    this.collected = {burger: 0, cherry: 0, gift: 0};
    this.effectEnds = {burger: 0, cherry: 0};
    this.cherryStarted = 0;
    this.platforms = [];
    this.monsters = [];
    this.items = [];
    this.shots = [];
    this.fragments = [];
    this.events = [];
    this.ended = false;
    this.row = 0;
    this.nextGift = 7;
    this.nextFood = 2;
    this.lastPlatform = this.addPlatform(WIDTH / 2, START_HEIGHT, 103, 'normal');
    this.generate();
  }

  get score() {
    return Math.floor(this.furthest - START_HEIGHT);
  }

  get unlocked() {
    return this.collected.gift >= GIFT_GOAL;
  }

  effectRemaining(kind) {
    return Math.max(0, this.effectEnds[kind] - this.time);
  }

  between(low, high) {
    return low + (high - low) * this.random();
  }

  addPlatform(x, y, width, kind, anchor = true) {
    const travel = anchor ? 23 : 48;
    const leftTravel = Math.min(travel, x - width / 2 - 3);
    const rightTravel = Math.min(travel, WIDTH - x - width / 2 - 3);
    const platform = {x, homeX: x, y, width, kind, leftTravel, rightTravel, phase: this.between(0, Math.PI * 2), broken: false};
    this.platforms.push(platform);
    return platform;
  }

  generate() {
    const limit = this.camera + this.height + 160;
    while (this.lastPlatform.y < limit) {
      const row = ++this.row;
      const difficulty = Math.min(row / 58, 1);
      const x = clamp(this.lastPlatform.homeX + this.between(-113, 113), 53, WIDTH - 53);
      const y = this.lastPlatform.y + this.between(65 + 11 * difficulty, 84 + 19 * difficulty);
      const width = this.between(84 - 13 * difficulty, 98 - 13 * difficulty);
      const containsItem = row === this.nextGift || row === this.nextFood;
      const kind = !containsItem && row > 3 && this.random() < .14 + .13 * difficulty ? 'moving' : 'normal';
      const platform = this.addPlatform(x, y, width, kind);
      this.lastPlatform = platform;

      const side = x > WIDTH / 2 ? -1 : 1;
      const extraX = clamp(x + side * this.between(135, 193), 45, WIDTH - 45);
      if (this.random() < .65) {
        const chance = this.random();
        const kind = row > 3 && chance < .34 ? 'breakable' : chance < .53 ? 'moving' : 'normal';
        this.addPlatform(extraX, y + this.between(-13, 14), this.between(65, 82), kind, false);
      }

      if (row === this.nextGift) {
        this.items.push({x, y: y + 30, kind: 'gift', platform, taken: false});
        this.nextGift += Math.floor(this.between(6, 9));
        if (this.nextFood === row) this.nextFood++;
      } else if (row === this.nextFood) {
        this.items.push({x, y: y + 29, kind: this.random() < .5 ? 'burger' : 'cherry', platform, taken: false});
        this.nextFood += Math.floor(this.between(2, 5));
      } else if (row > 5 && this.random() < .20 + .09 * difficulty) {
        const kind = MONSTERS[Math.floor(this.random() * MONSTERS.length)];
        this.monsters.push({
          kind, homeX: extraX, homeY: y + 39, x: extraX, y: y + 39,
          phase: this.between(0, Math.PI * 2), dead: false
        });
      } else if (row > 3 && this.random() < .14) {
        platform.boost = this.random() < .88 ? 'spring' : 'jet';
      }
    }
  }

  step(dt, {direction = 0, shoot = false} = {}) {
    if (this.ended) return;
    this.time += dt;
    const p = this.player;
    p.firing = Math.max(0, p.firing - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.jet = Math.max(0, p.jet - dt);
    if (shoot && p.firing === 0) {
      p.firing = .23;
      this.shots.push({x: wrapX(p.x + p.face * 11), y: p.y + 48, previousY: p.y + 48, hit: false});
    }
    if (direction) p.face = direction;
    const horizontal = direction * (this.effectRemaining('burger') > 0 ? 410 : 270);
    p.vx += (horizontal - p.vx) * Math.min(1, dt * (direction ? 18 : 23));
    const previousY = p.y;
    p.x = wrapX(p.x + p.vx * dt);
    p.vy = p.jet > 0 ? 840 : p.vy - GRAVITY * dt;
    p.y += p.vy * dt;

    this.movePlatforms();
    for (const monster of this.monsters) {
      const flying = monster.kind === 'bat';
      monster.x = clamp(monster.homeX + Math.sin(this.time * (flying ? 2.2 : 1.6) + monster.phase) * (flying ? 54 : 16), 24, WIDTH - 24);
      monster.y = monster.homeY + (flying ? 14 * Math.cos(this.time * 3 + monster.phase) : 0);
    }
    for (const shot of this.shots) {
      shot.previousY = shot.y;
      shot.y += 760 * dt;
    }

    if (p.vy < 0) this.land(previousY);
    this.checkShots();
    if (this.checkMonsters(previousY)) return;
    this.collectItems();

    this.furthest = Math.max(this.furthest, p.y);
    this.camera = Math.max(this.camera, p.y - this.height * .55);
    if (p.y < this.camera - HERO_HEIGHT - 15) {
      this.loseLife('fall');
      if (this.ended) return;
    }
    this.generate();
    this.cleanUp();
  }

  movePlatforms() {
    const cherryBlend = clamp(Math.min(this.time - this.cherryStarted, this.effectRemaining('cherry')) / .25, 0, 1);
    for (const platform of this.platforms) {
      const wave = Math.sin(this.time * 1.9 + platform.phase);
      const travel = wave < 0 ? platform.leftTravel : platform.rightTravel;
      const activity = platform.kind === 'moving' ? 1 : cherryBlend;
      platform.x = platform.homeX + wave * travel * activity;
    }
    for (const item of this.items) item.x = item.platform.x;
  }

  land(previousY) {
    const p = this.player;
    // Higher landings take precedence when two platform tops are crossed in a step.
    for (let index = this.platforms.length - 1; index >= 0; index--) {
      const platform = this.platforms[index];
      const distance = distanceX(p.x, platform.x);
      if (platform.broken || previousY < platform.y || p.y > platform.y ||
          distance > platform.width / 2 + HERO_RADIUS - 2) continue;
      if (platform.kind === 'breakable') {
        platform.broken = true;
        this.fragments.push({x: platform.x, y: platform.y, width: platform.width, time: this.time});
        continue;
      }
      p.y = platform.y;
      p.vy = BOUNCE;
      if (platform.boost && distance < 17) {
        if (platform.boost === 'jet') {
          p.jet = .66;
          p.shield = Math.max(p.shield, .82);
          platform.boost = undefined;
        }
        p.vy = 970;
        this.events.push({type: 'boost'});
      }
      return;
    }
  }

  checkShots() {
    for (const shot of this.shots) {
      for (const monster of this.monsters) {
        if (shot.hit || monster.dead || distanceX(shot.x, monster.x) > 24 ||
            shot.y < monster.y - 17 || shot.previousY > monster.y + 17) continue;
        shot.hit = true;
        monster.dead = true;
        this.events.push({type: 'monster', x: monster.x, y: monster.y});
      }
    }
  }

  checkMonsters(previousY) {
    const p = this.player;
    for (const monster of this.monsters) {
      if (monster.dead || distanceX(p.x, monster.x) >= HERO_RADIUS + 16) continue;
      const head = monster.y + 15;
      if (p.vy < 0 && previousY >= head && p.y <= head) {
        monster.dead = true;
        p.y = head;
        p.vy = BOUNCE;
        this.events.push({type: 'monster', x: monster.x, y: monster.y});
      } else if (Math.abs(p.y + 21 - monster.y) >= 32) {
        continue;
      } else if (p.jet > 0) {
        monster.dead = true;
      } else if (p.shield <= 0 && (p.vy >= 0 || p.y < head)) {
        this.loseLife('monster');
        return this.ended;
      }
    }
    return false;
  }

  collectItems() {
    const p = this.player;
    for (const item of this.items) {
      if (item.taken || !overlaps(p.x, p.y + 21, item, item.kind === 'gift' ? 34 : 29, 33)) continue;
      item.taken = true;
      this.collected[item.kind]++;
      if (item.kind === 'cherry' && this.effectRemaining('cherry') === 0) this.cherryStarted = this.time;
      if (item.kind in FOOD_EFFECTS) this.effectEnds[item.kind] = this.time + FOOD_EFFECTS[item.kind];
      this.events.push({type: 'item', kind: item.kind, x: item.x, y: item.y,
        unlocked: item.kind === 'gift' && this.collected.gift === GIFT_GOAL});
    }
  }

  loseLife(reason) {
    this.lives--;
    if (!this.lives) {
      this.ended = true;
      return;
    }
    const p = this.player;
    p.shield = 1.6;
    if (reason === 'fall') {
      const target = this.camera + Math.min(this.height * .35, 185);
      const safe = this.platforms.filter(({kind, y}) => kind !== 'breakable' && y > this.camera + 75)
        .reduce((best, platform) => !best || Math.abs(platform.y - target) < Math.abs(best.y - target) ? platform : best, null);
      // The generator keeps safe platforms above the screen even after a fall.
      p.x = safe?.x ?? WIDTH / 2;
      p.y = safe?.y ?? target;
      p.vx = 0;
      p.vy = BOUNCE;
    }
    this.events.push({type: 'lost-life'});
  }

  cleanUp() {
    const bottom = this.camera - 90;
    this.platforms = this.platforms.filter(({y, broken}) => y > bottom && !broken);
    this.monsters = this.monsters.filter(({y, dead}) => y > bottom && !dead);
    this.items = this.items.filter(({y, taken}) => y > bottom && !taken);
    this.shots = this.shots.filter(({hit, y}) => !hit && y < this.camera + this.height + 45);
    this.fragments = this.fragments.filter(({time}) => this.time - time < .65);
  }
}
