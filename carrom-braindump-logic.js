/**
 * Pure 2D Carrom Board Physics & Brain Dump Pocket Routing Engine.
 *
 * 4 Corner Pockets:
 *  - top-left     -> 'scheduling' (Schedule Queue)
 *  - top-right    -> 'notes'      (Step-by-Step Sticky Notes)
 *  - bottom-left  -> 'journal'    (Journal Thoughts)
 *  - bottom-right -> 'archive'    (Archived Dumps)
 *
 * Shared between index.html (via window.CarromBrainDumpLogic) and Node unit tests.
 */

export const BOARD_SIZE = 420;
export const FRAME_WIDTH = 34;
export const PLAY_MIN = FRAME_WIDTH;
export const PLAY_MAX = BOARD_SIZE - FRAME_WIDTH;
export const PLAY_CENTER = BOARD_SIZE / 2;

export const COIN_RADIUS = 17;
export const STRIKER_RADIUS = 19;
export const POCKET_RADIUS = 18;
export const POCKET_RIM_RADIUS = POCKET_RADIUS + 2;
export const POCKET_INSET = POCKET_RIM_RADIUS + 3; // 23px inside PLAY_MIN/PLAY_MAX -> strictly inside playing field
export const POCKET_CAPTURE_RADIUS = 22;
export const STRIKER_BASELINE_Y = PLAY_MAX - 56;
export const STRIKER_MIN_X = PLAY_MIN + 60;
export const STRIKER_MAX_X = PLAY_MAX - 60;
export const MAX_SHOT_SPEED = 21;

export const CARROM_POCKETS = [
  {
    id: 'scheduling',
    corner: 'tl',
    label: 'Schedule',
    shortLabel: 'SCHEDULE',
    color: '#F28B82',
    x: PLAY_MIN + POCKET_INSET,
    y: PLAY_MIN + POCKET_INSET,
  },
  {
    id: 'notes',
    corner: 'tr',
    label: 'Notes',
    shortLabel: 'NOTES',
    color: '#6EA8D8',
    x: PLAY_MAX - POCKET_INSET,
    y: PLAY_MIN + POCKET_INSET,
  },
  {
    id: 'journal',
    corner: 'bl',
    label: 'Journal',
    shortLabel: 'JOURNAL',
    color: '#81C953',
    x: PLAY_MIN + POCKET_INSET,
    y: PLAY_MAX - POCKET_INSET,
  },
  {
    id: 'archive',
    corner: 'br',
    label: 'Archive',
    shortLabel: 'ARCHIVE',
    color: '#9A9AA0',
    x: PLAY_MAX - POCKET_INSET,
    y: PLAY_MAX - POCKET_INSET,
  },
];

const COIN_TONES = [
  { fill: '#F7E7CE', ring: '#C9A875', text: '#2B1F14' },
  { fill: '#3A322C', ring: '#7D6A58', text: '#F5EDE0' },
  { fill: '#D95D5D', ring: '#F4A6A6', text: '#FFF8F6' },
];

export function createInitialStriker(x = PLAY_CENTER) {
  return {
    x: clamp(x, STRIKER_MIN_X, STRIKER_MAX_X),
    y: STRIKER_BASELINE_Y,
    vx: 0,
    vy: 0,
    r: STRIKER_RADIUS,
    inMotion: false,
    scratched: false,
  };
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Generates non-overlapping carrom coin positions packed around the center rose.
 * When opts.singleCoin is true, only the head (active) brain dump item spawns at center.
 */
export function layoutBrainDumpCoins(items, existingCoins = [], opts = {}) {
  const rawList = Array.isArray(items) ? items : [];
  const list = opts && opts.singleCoin ? rawList.slice(0, 1) : rawList;
  const prevById = new Map((existingCoins || []).map((c) => [String(c.id), c]));
  const coins = [];

  // Hex-like rings centered slightly above middle so striker baseline stays clear
  const centerX = PLAY_CENTER;
  const centerY = PLAY_CENTER - 14;
  const spacing = COIN_RADIUS * 2 + 5;

  const slots = [{ x: centerX, y: centerY }];
  // Ring 1 (6 coins)
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    slots.push({ x: centerX + Math.cos(a) * spacing, y: centerY + Math.sin(a) * spacing });
  }
  // Ring 2 (12 coins)
  for (let i = 0; i < 12; i += 1) {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    slots.push({ x: centerX + Math.cos(a) * (spacing * 1.95), y: centerY + Math.sin(a) * (spacing * 1.95) });
  }

  list.forEach((item, idx) => {
    const existing = prevById.get(String(item.id));
    if (existing && Number.isFinite(existing.x) && Number.isFinite(existing.y)) {
      coins.push({
        ...existing,
        text: item.text,
        tag: item.tag || 'Thought',
        index: idx + 1,
      });
      return;
    }

    let pos = slots[idx];
    if (!pos) {
      const angle = idx * 2.39996;
      const dist = Math.min(115, 22 + Math.sqrt(idx) * 26);
      pos = {
        x: clamp(centerX + Math.cos(angle) * dist, PLAY_MIN + 46, PLAY_MAX - 46),
        y: clamp(centerY + Math.sin(angle) * dist, PLAY_MIN + 46, STRIKER_BASELINE_Y - 46),
      };
    }

    const tone = COIN_TONES[idx % COIN_TONES.length];
    coins.push({
      id: item.id,
      text: item.text,
      tag: item.tag || 'Thought',
      index: idx + 1,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      r: COIN_RADIUS,
      tone,
    });
  });

  // Ensure no overlapping freshly added coins
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < coins.length; i += 1) {
      for (let j = i + 1; j < coins.length; j += 1) {
        const a = coins[i];
        const b = coins[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.r + b.r + 2;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x = clamp(a.x - nx * push, PLAY_MIN + a.r + 14, PLAY_MAX - a.r - 14);
          a.y = clamp(a.y - ny * push, PLAY_MIN + a.r + 14, STRIKER_BASELINE_Y - a.r - 18);
          b.x = clamp(b.x + nx * push, PLAY_MIN + b.r + 14, PLAY_MAX - b.r - 14);
          b.y = clamp(b.y + ny * push, PLAY_MIN + b.r + 14, STRIKER_BASELINE_Y - b.r - 18);
        }
      }
    }
  }

  return coins;
}

/**
 * Converts a slingshot drag vector (pointer pulled back from striker) into a launch velocity.
 */
export function computeStrikerShotVelocity(strikerX, strikerY, pointerX, pointerY, maxPull = 115) {
  const pullDx = strikerX - pointerX;
  const pullDy = strikerY - pointerY;
  const pullDist = Math.hypot(pullDx, pullDy);
  if (pullDist < 6) {
    return { vx: 0, vy: 0, power: 0, angle: -Math.PI / 2 };
  }
  const power = clamp(pullDist / maxPull, 0, 1);
  const speed = 3.2 + power * (MAX_SHOT_SPEED - 3.2);
  const nx = pullDx / pullDist;
  const ny = pullDy / pullDist;
  return {
    vx: nx * speed,
    vy: ny * speed,
    power,
    angle: Math.atan2(ny, nx),
  };
}

/**
 * Computes an assisted shot velocity to flick a specific coin straight toward a target pocket.
 */
export function computeAssistedPocketImpulse(coin, pocketId, speed = 15.5) {
  const pocket = CARROM_POCKETS.find((p) => p.id === pocketId);
  if (!coin || !pocket) return { vx: 0, vy: 0 };
  const dx = pocket.x - coin.x;
  const dy = pocket.y - coin.y;
  const dist = Math.hypot(dx, dy) || 1;
  return {
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
  };
}

function resolveCircleCollision(a, b, massA = 1, massB = 1, restitution = 0.88) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return false;

  const nx = dx / dist;
  const ny = dy / dist;

  // Positional correction so coins never stick
  const overlap = minDist - dist;
  const invTotalMass = 1 / (massA + massB);
  a.x -= nx * overlap * (massB * invTotalMass);
  a.y -= ny * overlap * (massB * invTotalMass);
  b.x += nx * overlap * (massA * invTotalMass);
  b.y += ny * overlap * (massA * invTotalMass);

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal > 0) return true;

  const j = (-(1 + restitution) * velAlongNormal) / (1 / massA + 1 / massB);
  const impulseX = j * nx;
  const impulseY = j * ny;

  a.vx -= impulseX / massA;
  a.vy -= impulseY / massA;
  b.vx += impulseX / massB;
  b.vy += impulseY / massB;
  return true;
}

/**
 * Advances Carrom board physics by one fixed tick.
 * Returns { pocketed: Array<{ coin, pocket }>, collisions: number, wallHits: number, strikerScratched: boolean, allStopped: boolean }
 */
export function stepCarromPhysics(coins, striker, opts = {}) {
  const friction = opts.friction ?? 0.976;
  const wallRestitution = opts.wallRestitution ?? 0.82;
  const stopThreshold = opts.stopThreshold ?? 0.12;
  const pocketed = [];
  let collisions = 0;
  let wallHits = 0;
  let strikerScratched = false;

  const bodies = striker && !striker.scratched ? [...coins, striker] : [...coins];

  // Integrate positions + wall bounces
  for (const body of bodies) {
    body.x += body.vx;
    body.y += body.vy;

    const minX = PLAY_MIN + body.r;
    const maxX = PLAY_MAX - body.r;
    const minY = PLAY_MIN + body.r;
    const maxY = PLAY_MAX - body.r;

    if (body.x < minX) {
      body.x = minX;
      body.vx = Math.abs(body.vx) * wallRestitution;
      wallHits += 1;
    } else if (body.x > maxX) {
      body.x = maxX;
      body.vx = -Math.abs(body.vx) * wallRestitution;
      wallHits += 1;
    }
    if (body.y < minY) {
      body.y = minY;
      body.vy = Math.abs(body.vy) * wallRestitution;
      wallHits += 1;
    } else if (body.y > maxY) {
      body.y = maxY;
      body.vy = -Math.abs(body.vy) * wallRestitution;
      wallHits += 1;
    }
  }

  // Pairwise collisions (striker is slightly heavier than wooden coins)
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const massA = a === striker ? 1.45 : 1;
      const massB = b === striker ? 1.45 : 1;
      if (resolveCircleCollision(a, b, massA, massB)) {
        collisions += 1;
      }
    }
  }

  // Pocket capture checks for coins (iterate backward for safe splice)
  for (let i = coins.length - 1; i >= 0; i -= 1) {
    const coin = coins[i];
    for (const pocket of CARROM_POCKETS) {
      if (Math.hypot(coin.x - pocket.x, coin.y - pocket.y) <= POCKET_CAPTURE_RADIUS) {
        pocketed.push({ coin, pocket });
        coins.splice(i, 1);
        break;
      }
    }
  }

  // Pocket check for striker (foul/scratch -> safely return to baseline after turn)
  if (striker && !striker.scratched) {
    for (const pocket of CARROM_POCKETS) {
      if (Math.hypot(striker.x - pocket.x, striker.y - pocket.y) <= POCKET_CAPTURE_RADIUS - 2) {
        striker.scratched = true;
        striker.vx = 0;
        striker.vy = 0;
        strikerScratched = true;
        break;
      }
    }
  }

  // Apply friction and detect full settle
  let anyMoving = false;
  for (const body of [...coins, ...(striker && !striker.scratched ? [striker] : [])]) {
    body.vx *= friction;
    body.vy *= friction;
    const spd = Math.hypot(body.vx, body.vy);
    if (spd < stopThreshold) {
      body.vx = 0;
      body.vy = 0;
    } else {
      anyMoving = true;
    }
  }

  return {
    pocketed,
    collisions,
    wallHits,
    strikerScratched,
    allStopped: !anyMoving,
  };
}

if (typeof window !== 'undefined') {
  window.CarromBrainDumpLogic = {
    BOARD_SIZE,
    FRAME_WIDTH,
    PLAY_MIN,
    PLAY_MAX,
    PLAY_CENTER,
    COIN_RADIUS,
    STRIKER_RADIUS,
    POCKET_RADIUS,
    POCKET_RIM_RADIUS,
    POCKET_INSET,
    POCKET_CAPTURE_RADIUS,
    STRIKER_BASELINE_Y,
    STRIKER_MIN_X,
    STRIKER_MAX_X,
    MAX_SHOT_SPEED,
    CARROM_POCKETS,
    clamp,
    createInitialStriker,
    layoutBrainDumpCoins,
    computeStrikerShotVelocity,
    computeAssistedPocketImpulse,
    stepCarromPhysics,
  };
  if (typeof window.initCarromBoardIfActive === 'function') {
    window.initCarromBoardIfActive();
  }
}
