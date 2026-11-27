import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARROM_POCKETS,
  PLAY_MIN,
  PLAY_MAX,
  POCKET_RIM_RADIUS,
  STRIKER_BASELINE_Y,
  createInitialStriker,
  layoutBrainDumpCoins,
  computeStrikerShotVelocity,
  computeAssistedPocketImpulse,
  stepCarromPhysics,
} from './carrom-braindump-logic.js';

test('CARROM_POCKETS defines all 4 brain dump destinations strictly inside playing surface bounds', () => {
  const ids = CARROM_POCKETS.map((p) => p.id);
  assert.deepEqual(ids, ['scheduling', 'notes', 'journal', 'archive']);
  const corners = new Set(CARROM_POCKETS.map((p) => p.corner));
  assert.equal(corners.size, 4);
  for (const p of CARROM_POCKETS) {
    assert.ok(p.x - POCKET_RIM_RADIUS >= PLAY_MIN, `${p.id} overlaps left frame`);
    assert.ok(p.x + POCKET_RIM_RADIUS <= PLAY_MAX, `${p.id} overlaps right frame`);
    assert.ok(p.y - POCKET_RIM_RADIUS >= PLAY_MIN, `${p.id} overlaps top frame`);
    assert.ok(p.y + POCKET_RIM_RADIUS <= PLAY_MAX, `${p.id} overlaps bottom frame`);
  }
});

test('layoutBrainDumpCoins singleCoin mode spawns only the active head thought at center', () => {
  const items = [
    { id: 101, text: 'First thought' },
    { id: 102, text: 'Second thought' },
  ];
  const coins = layoutBrainDumpCoins(items, [], { singleCoin: true });
  assert.equal(coins.length, 1);
  assert.equal(coins[0].id, 101);
});

test('layoutBrainDumpCoins packs multiple items cleanly without overlapping', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, text: `Thought ${i + 1}` }));
  const coins = layoutBrainDumpCoins(items);
  assert.equal(coins.length, 8);
  for (let i = 0; i < coins.length; i += 1) {
    assert.ok(coins[i].x > PLAY_MIN && coins[i].x < PLAY_MAX);
    assert.ok(coins[i].y > PLAY_MIN && coins[i].y < STRIKER_BASELINE_Y);
    for (let j = i + 1; j < coins.length; j += 1) {
      const dist = Math.hypot(coins[i].x - coins[j].x, coins[i].y - coins[j].y);
      assert.ok(dist >= coins[i].r + coins[j].r - 0.5, `coins ${i} and ${j} overlapped (${dist})`);
    }
  }
});

test('computeStrikerShotVelocity shoots opposite the slingshot pull direction', () => {
  const shot = computeStrikerShotVelocity(210, 330, 210, 390);
  assert.ok(shot.vy < -5, 'pulling down should shoot striker upward');
  assert.ok(Math.abs(shot.vx) < 0.001);
  assert.ok(shot.power > 0.4 && shot.power <= 1);
});

test('striker collides with coin and transfers momentum into target pocket', () => {
  const pocket = CARROM_POCKETS.find((p) => p.id === 'scheduling');
  const coin = layoutBrainDumpCoins([{ id: 99, text: 'Book dentist' }])[0];
  coin.x = pocket.x + 55;
  coin.y = pocket.y + 55;

  const impulse = computeAssistedPocketImpulse(coin, 'scheduling', 14);
  coin.vx = impulse.vx;
  coin.vy = impulse.vy;

  const striker = createInitialStriker();
  let captured = null;
  for (let tick = 0; tick < 80; tick += 1) {
    const res = stepCarromPhysics([coin], striker);
    if (res.pocketed.length > 0) {
      captured = res.pocketed[0];
      break;
    }
  }

  assert.ok(captured, 'coin should be captured by the scheduling pocket');
  assert.equal(captured.pocket.id, 'scheduling');
  assert.equal(captured.coin.id, 99);
});

test('stepCarromPhysics resolves striker-coin elastic impact and settles smoothly', () => {
  const coins = layoutBrainDumpCoins([{ id: 1, text: 'Write roadmap' }]);
  coins[0].x = 210;
  coins[0].y = 220;
  const striker = createInitialStriker(210);
  striker.vy = -14;

  let hit = 0;
  let stopped = false;
  for (let tick = 0; tick < 260; tick += 1) {
    const res = stepCarromPhysics(coins, striker);
    hit += res.collisions;
    if (res.allStopped) {
      stopped = true;
      break;
    }
  }

  assert.ok(hit >= 1, 'striker should collide with coin');
  assert.equal(stopped, true, 'board should eventually come to rest via friction');
});
