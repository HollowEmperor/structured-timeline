import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFourWaySwipe,
  directionToBatchKey,
  computeSwipeStampOpacities,
  groupBatchedItems,
  buildBatchedTimelinePlan,
} from './task-batch-swipe-logic.js';

test('classifyFourWaySwipe and directionToBatchKey map all 4 axes accurately', () => {
  assert.equal(classifyFourWaySwipe(90, 12), 'right');
  assert.equal(directionToBatchKey('right'), 'location');

  assert.equal(classifyFourWaySwipe(-85, 20), 'left');
  assert.equal(directionToBatchKey('left'), 'energy');

  assert.equal(classifyFourWaySwipe(10, -90), 'up');
  assert.equal(directionToBatchKey('up'), 'urgency');

  assert.equal(classifyFourWaySwipe(-14, 88), 'down');
  assert.equal(directionToBatchKey('down'), 'time');

  assert.equal(classifyFourWaySwipe(25, -30), null);
});

test('computeSwipeStampOpacities isolates dominant axis stamp cleanly', () => {
  const rightStamps = computeSwipeStampOpacities(70, 10);
  assert.ok(rightStamps.right > 0.7);
  assert.equal(rightStamps.left, 0);
  assert.equal(rightStamps.up, 0);
  assert.equal(rightStamps.down, 0);

  const upStamps = computeSwipeStampOpacities(8, -80);
  assert.ok(upStamps.up > 0.9);
  assert.equal(upStamps.down, 0);
  assert.equal(upStamps.right, 0);
});

test('groupBatchedItems sorts urgency, energy, location, and time buckets properly', () => {
  const groups = groupBatchedItems([
    { id: 1, title: 'Low Pri', batchKey: 'urgency', priority: 2 },
    { id: 2, title: 'Top Pri', batchKey: 'urgency', priority: 4 },
    { id: 3, title: 'Pharmacy', batchKey: 'location', location: 'Main St' },
    { id: 4, title: 'Bank', batchKey: 'location', location: 'Downtown' },
    { id: 5, title: 'Deep Code', batchKey: 'energy', energy: 3 },
    { id: 6, title: 'Admin', batchKey: 'energy', energy: 1 },
  ]);

  assert.equal(groups.urgency[0].id, 2);
  assert.equal(groups.location[0].id, 4);
  assert.equal(groups.energy[0].id, 5);
});

test('buildBatchedTimelinePlan packs urgency -> energy -> location -> time without overlaps', () => {
  const plan = buildBatchedTimelinePlan(
    [
      { id: 'a', title: 'Urgent Fix', batchKey: 'urgency', durationMin: 30 },
      { id: 'b', title: 'Deep Design', batchKey: 'energy', durationMin: 45 },
      { id: 'c', title: 'Groceries', batchKey: 'location', location: 'Market', durationMin: 30 },
      { id: 'd', title: 'Standup', batchKey: 'time', preferredStartMin: 720, durationMin: 30 },
    ],
    { startMin: 540, gapMin: 10, batchBreakMin: 15 }
  );

  assert.equal(plan.length, 4);
  assert.equal(plan[0].id, 'a');
  assert.equal(plan[0].startMin, 540);
  assert.equal(plan[0].priority, 3);
  assert.equal(plan[1].id, 'b');
  assert.ok(plan[1].startMin >= plan[0].startMin + plan[0].durationMin);
  assert.equal(plan[2].id, 'c');
  assert.ok(plan[2].startMin >= plan[1].startMin + plan[1].durationMin);
  assert.equal(plan[3].id, 'd');
  assert.equal(plan[3].startMin, 720);
});
