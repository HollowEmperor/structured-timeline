import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceMeters,
  formatDistanceMeters,
  evaluateTaskLocationStatus,
  evaluateGeofenceTransition,
  evaluateTimeTriggerMatch,
  evaluateCompartmentTriggerMatch,
  computeStickyNoteProgress,
  sanitizeDriveNoteFilename,
  formatStickyNoteMarkdown,
} from './routines-automation-logic.js';

test('haversineDistanceMeters calculates accurate distances and rejects invalid coords', () => {
  assert.equal(haversineDistanceMeters(37.7749, -122.4194, 37.7749, -122.4194), 0);
  // ~111m per 0.001 deg latitude
  const d = haversineDistanceMeters(37.7749, -122.4194, 37.7759, -122.4194);
  assert.ok(d >= 105 && d <= 118, `Expected ~111m, got ${d}`);
  assert.equal(haversineDistanceMeters(null, -122.4, 37.7, -122.4), null);
  assert.equal(haversineDistanceMeters('bad', 0, 0, 0), null);
});

test('formatDistanceMeters formats meters and kilometers cleanly', () => {
  assert.equal(formatDistanceMeters(45), '45 m');
  assert.equal(formatDistanceMeters(999), '999 m');
  assert.equal(formatDistanceMeters(1450), '1.5 km');
  assert.equal(formatDistanceMeters(12400), '12 km');
  assert.equal(formatDistanceMeters(null), '');
});

test('evaluateTaskLocationStatus detects inside vs outside radius and respects defaults', () => {
  const task = {
    id: 1,
    title: 'Gym Session',
    locationLat: 37.7749,
    locationLng: -122.4194,
    locationRadiusMeters: 150,
    locationVerifyMode: 'auto',
  };

  const near = evaluateTaskLocationStatus(task, { lat: 37.7754, lng: -122.4194 });
  assert.equal(near.hasCoords, true);
  assert.equal(near.isInside, true);
  assert.equal(near.verifyMode, 'auto');
  assert.ok(near.distanceMeters < 80);

  const far = evaluateTaskLocationStatus(task, { lat: 37.7849, lng: -122.4194 });
  assert.equal(far.hasCoords, true);
  assert.equal(far.isInside, false);
  assert.ok(far.distanceMeters > 1000);

  const noCoords = evaluateTaskLocationStatus({ id: 2, title: 'Read' }, { lat: 37.77, lng: -122.41 });
  assert.equal(noCoords.hasCoords, false);
  assert.equal(noCoords.isInside, false);
  assert.equal(noCoords.verifyMode, 'prompt');
  assert.equal(noCoords.radiusMeters, 150);
});

test('evaluateGeofenceTransition enforces hysteresis and prevents duplicate firing', () => {
  // Arrive
  assert.equal(evaluateGeofenceTransition({ prevInside: false, nowInside: true, triggerType: 'location_arrive' }), true);
  assert.equal(evaluateGeofenceTransition({ prevInside: null, nowInside: true, triggerType: 'location_arrive' }), true);
  assert.equal(evaluateGeofenceTransition({ prevInside: true, nowInside: true, triggerType: 'location_arrive' }), false);
  assert.equal(evaluateGeofenceTransition({ prevInside: true, nowInside: false, triggerType: 'location_arrive' }), false);

  // Leave
  assert.equal(evaluateGeofenceTransition({ prevInside: true, nowInside: false, triggerType: 'location_leave' }), true);
  assert.equal(evaluateGeofenceTransition({ prevInside: null, nowInside: false, triggerType: 'location_leave' }), false);
  assert.equal(evaluateGeofenceTransition({ prevInside: false, nowInside: false, triggerType: 'location_leave' }), false);
});

test('evaluateTimeTriggerMatch fires once per matching minute and respects weekday filter', () => {
  const rule = {
    id: 'a1',
    enabled: true,
    trigger: { type: 'time', time: '07:30', days: ['Mon', 'Wed', 'Fri'] },
  };
  // 2026-11-23 is Monday
  const mon0730 = new Date(2026, 10, 23, 7, 30, 12);
  const first = evaluateTimeTriggerMatch(rule, mon0730, '');
  assert.equal(first.matched, true);
  assert.equal(first.minuteKey, '2026-11-23 07:30');

  // Same minute should not fire twice
  const repeat = evaluateTimeTriggerMatch(rule, mon0730, first.minuteKey);
  assert.equal(repeat.matched, false);

  // Tuesday should not match Mon/Wed/Fri
  const tue0730 = new Date(2026, 10, 24, 7, 30, 0);
  assert.equal(evaluateTimeTriggerMatch(rule, tue0730, '').matched, false);

  // Disabled rule should not match
  assert.equal(evaluateTimeTriggerMatch({ ...rule, enabled: false }, mon0730, '').matched, false);
});

test('evaluateCompartmentTriggerMatch matches enabled compartment rules', () => {
  const rule = {
    enabled: true,
    trigger: { type: 'compartment', compartmentId: 'morning' },
  };
  assert.equal(evaluateCompartmentTriggerMatch(rule, 'morning'), true);
  assert.equal(evaluateCompartmentTriggerMatch(rule, 'evening'), false);
  assert.equal(evaluateCompartmentTriggerMatch({ ...rule, enabled: false }, 'morning'), false);
});

test('computeStickyNoteProgress tracks active sequential step and completion state', () => {
  const prog = computeStickyNoteProgress([
    { id: '1', title: 'Step 1', done: true },
    { id: '2', title: 'Step 2', done: false },
    { id: '3', title: 'Step 3', done: false },
  ]);
  assert.equal(prog.done, 1);
  assert.equal(prog.total, 3);
  assert.equal(prog.pct, 33);
  assert.equal(prog.activeIndex, 1);
  assert.equal(prog.isComplete, false);

  const full = computeStickyNoteProgress([
    { id: '1', title: 'Step 1', done: true },
    { id: '2', title: 'Step 2', done: true },
  ]);
  assert.equal(full.activeIndex, -1);
  assert.equal(full.isComplete, true);
});

test('formatStickyNoteMarkdown and sanitizeDriveNoteFilename produce clean Drive export output', () => {
  assert.equal(sanitizeDriveNoteFilename('Dawn Ignition! 2026'), 'structured-note-dawn-ignition-2026.md');
  const md = formatStickyNoteMarkdown({
    title: 'Gym Warmup',
    window: 'Morning',
    note: 'Keep heart rate steady.',
    steps: [
      { id: '1', title: '5m incline walk', duration: '5m', done: true, note: 'Zone 2 pace' },
      { id: '2', title: 'Shoulder mobility', duration: '4m', done: false },
    ],
    driveFiles: [{ name: 'Training Split.pdf', webViewLink: 'https://drive.google.com/file/d/abc/view' }],
  });
  assert.ok(md.includes('# Gym Warmup'));
  assert.ok(md.includes('1. [x] **5m incline walk** (5m)'));
  assert.ok(md.includes('2. [ ] **Shoulder mobility** (4m)'));
  assert.ok(md.includes('[Training Split.pdf](https://drive.google.com/file/d/abc/view)'));
});
