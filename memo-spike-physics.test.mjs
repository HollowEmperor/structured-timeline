import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMemoSpikeLayout, buildPaperPalette } from './memo-spike-physics.js';

const sampleTasks = [
  { id: 105, title: 'Wind Down', hex: '#C47B9B' },        // newest (top)
  { id: 104, title: 'I saw them', hex: '#F28B82' },
  { id: 103, title: 'meet new people', hex: '#169859' },
  { id: 102, title: 'Answer Emails', hex: '#F28B82' },
  { id: 101, title: 'Rise and Shine', hex: '#81C953' },   // oldest (bottom)
];

test('every stacked paper puncture point aligns strictly to centerX', () => {
  const layout = computeMemoSpikeLayout(sampleTasks, { stageWidth: 340 });
  assert.equal(layout.centerX, 170);
  assert.equal(layout.sheets.length, sampleTasks.length);

  for (const sheet of layout.sheets) {
    assert.equal(sheet.holeScreenX, layout.centerX, `Sheet ${sheet.task.id} puncture must align to centerX`);
    assert.equal(sheet.rodSegment.x, layout.centerX, `Sheet ${sheet.task.id} rod segment must align to centerX`);
    assert.ok(sheet.rodSegment.yTop < sheet.rodSegment.yBottom, 'Rod segment must extend upward from puncture');
  }
});

test('sheets stack chronologically bottom-to-top with gravity compression near the base', () => {
  const layout = computeMemoSpikeLayout(sampleTasks);

  assert.equal(layout.sheets[0].task.id, 101);
  assert.equal(layout.sheets[layout.sheets.length - 1].task.id, 105);
  assert.equal(layout.sheets[layout.sheets.length - 1].isTop, true);

  for (let i = 1; i < layout.sheets.length; i++) {
    assert.ok(
      layout.sheets[i].holeScreenY < layout.sheets[i - 1].holeScreenY,
      'Higher sheets must sit visually above lower sheets'
    );
    assert.ok(
      layout.sheets[i].zIndex > layout.sheets[i - 1].zIndex,
      'Higher sheets must paint over lower sheets'
    );
  }

  const bottomGapPx = layout.collarY - layout.sheets[0].holeScreenY;
  assert.ok(bottomGapPx >= 14 && bottomGapPx <= 32, `Bottom sheet should sit close above base collar, got ${bottomGapPx}px`);

  assert.ok(layout.sheets[0].weightLoad > layout.sheets[layout.sheets.length - 1].weightLoad);
  const bottomPitch = layout.sheets[1].zBase - layout.sheets[0].zBase;
  const topPitch = layout.sheets[4].zBase - layout.sheets[3].zBase;
  assert.ok(bottomPitch < topPitch, `Bottom pitch (${bottomPitch}) should be more compressed than top pitch (${topPitch})`);
});

test('every paper slip is square, stabbed dead-center, and obeys real perspective convergence', () => {
  const layout = computeMemoSpikeLayout(sampleTasks);

  // Unified pinhole camera projects the circular metallic base with realistic foreshortening
  assert.ok(layout.base.topPath.startsWith('M '), 'Base top disk must be projected through pinhole camera');
  assert.ok(layout.base.wallPath.startsWith('M '), 'Base cylindrical wall must be projected through pinhole camera');
  assert.ok(layout.base.ry > 12 && layout.base.ry < layout.base.rx * 0.45, 'Base aspect ratio must match low-angle 3D camera');

  for (let i = 0; i < layout.sheets.length; i++) {
    const s = layout.sheets[i];
    assert.equal(s.sheetW, s.sheetD, `Sheet ${s.task.id} must be square`);
    assert.equal(s.hx, 0, `Sheet ${s.task.id} horizontal puncture must be dead center (0)`);
    assert.equal(s.hy, 0, `Sheet ${s.task.id} depth puncture must be dead center (0)`);
    assert.ok(s.edgeThicknessPx > 0 && s.edgeThicknessPx <= 1.0, `Sheet ${s.task.id} paper edge must stay thin (<= 1px)`);

    // Real perspective convergence: nearer front edge must project strictly wider than farther back edge
    assert.ok(
      s.frontEdgeLen > s.backEdgeLen * 1.12,
      `Sheet ${s.task.id} front edge (${s.frontEdgeLen}) must converge wider than back edge (${s.backEdgeLen})`
    );

    if (i > 0) {
      const prev = layout.sheets[i - 1];
      const delta = Math.abs(s.yawDeg - prev.yawDeg);
      assert.ok(delta >= 12, `Adjacent sheets should fan out cleanly (got yaw delta ${delta}°)`);
    }
  }
});

test('falling drop distance stays cleanly below spike tip cap', () => {
  const layout = computeMemoSpikeLayout(sampleTasks);
  for (const sheet of layout.sheets) {
    assert.ok(
      sheet.holeScreenY - sheet.dropDistance >= layout.tipY + 10,
      'Falling sheet must start below the spike tip cap'
    );
  }
});

test('paper palette produces solid opaque matte tones', () => {
  const emeraldPaper = buildPaperPalette('#169859');
  assert.notEqual(emeraldPaper.face, '#169859');
  assert.match(emeraldPaper.face, /^#[0-9a-f]{6}$/i);
  assert.match(emeraldPaper.cutEdge, /^#[0-9a-f]{6}$/i);
  assert.match(emeraldPaper.edgeOutline, /^#[0-9a-f]{6}$/i);
});

test('empty spike produces valid stage geometry', () => {
  const layout = computeMemoSpikeLayout([]);
  assert.equal(layout.sheets.length, 0);
  assert.ok(layout.stageHeight >= 380);
  assert.ok(layout.tipY < layout.collarY);
});
