import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  isTaskOnDateKey,
  isTaskDoneOnDateKey,
  assignProjectLanes,
  getCalendarProjectDecorations,
  buildSharedProjectTimeline,
  addDaysToDateKey,
  resolveCalendarSwipeGesture,
  getProjectWeekSpanCount,
  computeCalendarTimeframeWindow,
  computeCalendarCellTimeframeBoxes,
  computeCalendarRowTimeframeBoxes,
} from './calendar-projects-logic.js';

test('buildMonthGrid produces 42 real Saturday-first cells for any month/year including leap years', () => {
  const feb2024 = buildMonthGrid(2024, 1); // Feb 2024 (leap year, starts Thu)
  assert.equal(feb2024.length, 42);
  const inMonth = feb2024.filter((c) => !c.out);
  assert.equal(inMonth.length, 29);
  assert.equal(inMonth[0].dateKey, '2024-02-01');
  assert.equal(inMonth[0].weekdayIdx, 5); // Thu = 5 in Sat=0..Fri=6
  assert.equal(inMonth[28].dateKey, '2024-02-29');

  const nov2026 = buildMonthGrid(2026, 10); // Nov 2026 (starts Sun)
  assert.equal(nov2026.length, 42);
  const firstNov = nov2026.find((c) => c.dateKey === '2026-11-01');
  assert.equal(firstNov.weekdayIdx, 1); // Sun = 1 in Sat=0..Fri=6
  assert.equal(nov2026[0].dateKey, '2026-10-31'); // Sat Oct 31
  assert.equal(nov2026[0].out, true);
});

test('tasks save and match on any selected dateKey instead of defaulting to day 22', () => {
  const taskNov25 = { id: 1, title: 'Ship Release', dateKey: '2026-11-25', repeat: 'once', done: false };
  assert.equal(isTaskOnDateKey(taskNov25, '2026-11-25', '2026-11-23'), true);
  assert.equal(isTaskOnDateKey(taskNov25, '2026-11-22', '2026-11-23'), false);
  assert.equal(isTaskOnDateKey(taskNov25, '2026-12-25', '2026-11-23'), false);

  const weeklyTask = {
    id: 2,
    title: 'Design Critique',
    dateKey: '2026-11-23', // Monday
    repeat: 'weekly',
    weekDays: ['Mon', 'Wed'],
    doneDays: { '2026-11-23': true },
  };
  assert.equal(isTaskOnDateKey(weeklyTask, '2026-11-23'), true);
  assert.equal(isTaskOnDateKey(weeklyTask, '2026-11-25'), true); // Wed
  assert.equal(isTaskOnDateKey(weeklyTask, '2026-11-24'), false); // Tue
  assert.equal(isTaskOnDateKey(weeklyTask, '2026-11-16'), false); // before start date
  assert.equal(isTaskDoneOnDateKey(weeklyTask, '2026-11-23'), true);
  assert.equal(isTaskDoneOnDateKey(weeklyTask, '2026-11-25'), false);
});

test('assignProjectLanes stacks concurrent projects cleanly on separate lanes and reuses lanes when non-overlapping', () => {
  const projects = [
    { id: 'p1', title: 'Alpha', color: 'coral', startDate: '2026-11-20', endDate: '2026-11-26', checkpoints: [] },
    { id: 'p2', title: 'Beta', color: 'sky', startDate: '2026-11-22', endDate: '2026-11-28', checkpoints: [] },
    { id: 'p3', title: 'Gamma', color: 'lime', startDate: '2026-11-27', endDate: '2026-11-30', checkpoints: [] },
  ];

  const lanes = assignProjectLanes(projects, '2026-11-23');
  assert.equal(lanes.laneCount, 2);
  assert.equal(lanes.laneById.get('p1').lane, 0);
  assert.equal(lanes.laneById.get('p2').lane, 1);
  assert.equal(lanes.laneById.get('p3').lane, 0); // starts after p1 ends on Nov 26
});

test('getCalendarProjectDecorations marks timeframes and due checkpoints with exact project colors', () => {
  const projects = [
    {
      id: 'p1',
      title: 'Mobile Launch',
      color: 'coral',
      startDate: '2026-11-22',
      endDate: '2026-11-26',
      checkpoints: [
        { id: 'c1', title: 'QA Freeze', date: '2026-11-23', done: false },
      ],
    },
    {
      id: 'p2',
      title: 'Brand System',
      color: 'sky',
      startDate: '2026-11-23',
      endDate: '2026-11-29',
      checkpoints: [
        { id: 'c2', title: 'Type Scale', date: '2026-11-23', done: false },
      ],
    },
  ];

  const dec = getCalendarProjectDecorations(projects, '2026-11-23', '2026-11-23');
  assert.equal(dec.spans.length, 2);
  assert.equal(dec.spans[0].color, 'coral');
  assert.equal(dec.spans[1].color, 'sky');
  assert.equal(dec.spans[1].isStart, true);
  assert.equal(dec.dueCheckpoints.length, 2);
  assert.equal(dec.dueCheckpoints[0].isDueToday, true);
  assert.equal(dec.dueCheckpoints[0].color, 'coral');
  assert.equal(dec.dueCheckpoints[1].color, 'sky');
});

test('buildSharedProjectTimeline always includes todayKey and aligns side-by-side projects on shared dates', () => {
  const today = '2026-11-23';
  const projects = [
    {
      id: 'p1',
      title: 'Website Refresh',
      color: 'coral',
      startDate: '2026-11-21',
      endDate: '2026-11-28',
      checkpoints: [
        { id: 'cp1', title: 'Wireframes', date: '2026-11-22', done: false },
        { id: 'cp2', title: 'Hero Build', date: '2026-11-25', done: false },
      ],
    },
    {
      id: 'p2',
      title: 'Audio Engine',
      color: 'lime',
      startDate: '2026-11-22',
      endDate: '2026-11-27',
      checkpoints: [
        { id: 'cp3', title: 'Ring Buffer', date: '2026-11-23', done: false },
      ],
    },
  ];

  const timeline = buildSharedProjectTimeline(projects, [], today);
  const todayRow = timeline.rows.find((r) => r.isToday);
  assert.ok(todayRow, 'Today row must always exist even if one project has no checkpoint on today');
  assert.equal(todayRow.dateKey, today);
  assert.equal(todayRow.cells.length, 2);
  assert.equal(todayRow.cells[0].inSpan, true);
  assert.equal(todayRow.cells[1].checkpoints[0].status, 'due-today');

  // Sticky focus bar includes overdue for p1 and due-today for p2
  assert.equal(timeline.todayFocusItems.length, 2);
  assert.equal(timeline.todayFocusItems[0].relation, 'overdue');
  assert.equal(timeline.todayFocusItems[1].relation, 'due-today');
  assert.equal(addDaysToDateKey('2026-11-30', 1), '2026-12-01');
});

test('resolveCalendarSwipeGesture distinguishes left/right month swipes, vertical drawer pulls, and taps', () => {
  // Small movement stays a tap (no gesture)
  assert.deepEqual(resolveCalendarSwipeGesture(4, -3, { isExpanded: false }), { action: 'none', axis: null });

  // Horizontal swipe left advances to next month; swipe right goes to previous month
  assert.deepEqual(resolveCalendarSwipeGesture(-68, 12, { isExpanded: false }), { action: 'month-next', axis: 'x' });
  assert.deepEqual(resolveCalendarSwipeGesture(72, -10, { isExpanded: true }), { action: 'month-prev', axis: 'x' });

  // Short horizontal drag locks x-axis without triggering month change
  assert.deepEqual(resolveCalendarSwipeGesture(-25, 4, { isExpanded: false }), { action: 'none', axis: 'x' });

  // Vertical pull down expands when collapsed; pull up collapses when expanded
  assert.deepEqual(resolveCalendarSwipeGesture(8, 55, { isExpanded: false }), { action: 'vertical-expand', axis: 'y' });
  assert.deepEqual(resolveCalendarSwipeGesture(-6, -52, { isExpanded: true }), { action: 'vertical-collapse', axis: 'y' });
  assert.deepEqual(resolveCalendarSwipeGesture(0, 55, { isExpanded: true }), { action: 'none', axis: 'y' });
});

test('computeCalendarTimeframeWindow opens only timeframe week rows (<= 5 weeks) and refuses full expansion for > 5 weeks', () => {
  const nov2026 = buildMonthGrid(2026, 10); // Sat-first: Row 0: Oct 31..Nov 6, Row 1: Nov 7..13, Row 2: Nov 14..20, Row 3: Nov 21..27, Row 4: Nov 28..Dec 4, Row 5: Dec 5..11

  // 1) No projects -> full 6-row month expansion
  const emptyWin = computeCalendarTimeframeWindow(nov2026, [], '2026-11-24');
  assert.equal(emptyWin.mode, 'full-month');
  assert.equal(emptyWin.canExpand, true);
  assert.equal(emptyWin.selectedRow, 3);
  assert.equal(emptyWin.expandedStartRow, 0);
  assert.equal(emptyWin.expandedEndRow, 5);
  assert.equal(emptyWin.expandedRowCount, 6);
  assert.equal(emptyWin.expandedHeight, 332);

  // 2) 2-week project timeframe (Nov 16 -> Nov 26, rows 2..3) -> opens ONLY rows 2..3 (108px)
  const twoWeekProjects = [
    { id: 'p2w', title: 'Sprint', startDate: '2026-11-16', endDate: '2026-11-26', checkpoints: [] },
  ];
  assert.equal(getProjectWeekSpanCount('2026-11-16', '2026-11-26'), 2);
  const twoWeekWin = computeCalendarTimeframeWindow(nov2026, twoWeekProjects, '2026-11-24');
  assert.equal(twoWeekWin.mode, 'timeframe');
  assert.equal(twoWeekWin.canExpand, true);
  assert.equal(twoWeekWin.expandedStartRow, 2);
  assert.equal(twoWeekWin.expandedEndRow, 3);
  assert.equal(twoWeekWin.expandedRowCount, 2);
  assert.equal(twoWeekWin.expandedHeight, 108);

  // 3) 5-week project timeframe (Nov 2 -> Dec 4, rows 0..4) -> opens rows 0..4 (276px)
  const fiveWeekProjects = [
    { id: 'p5w', title: 'Release', startDate: '2026-11-02', endDate: '2026-12-04', checkpoints: [] },
  ];
  assert.equal(getProjectWeekSpanCount('2026-11-02', '2026-12-04'), 5);
  const fiveWeekWin = computeCalendarTimeframeWindow(nov2026, fiveWeekProjects, '2026-11-24');
  assert.equal(fiveWeekWin.mode, 'timeframe');
  assert.equal(fiveWeekWin.canExpand, true);
  assert.equal(fiveWeekWin.expandedStartRow, 0);
  assert.equal(fiveWeekWin.expandedEndRow, 4);
  assert.equal(fiveWeekWin.expandedRowCount, 5);
  assert.equal(fiveWeekWin.expandedHeight, 276);

  // 4) > 5-week project timeframe (Nov 1 -> Dec 20, 8 weeks total) -> does NOT expand the calendar
  const overFiveWeekProjects = [
    { id: 'p8w', title: 'Quarter Initiative', startDate: '2026-11-01', endDate: '2026-12-20', checkpoints: [] },
  ];
  assert.ok(getProjectWeekSpanCount('2026-11-01', '2026-12-20') > 5);
  const cappedWin = computeCalendarTimeframeWindow(nov2026, overFiveWeekProjects, '2026-11-24');
  assert.equal(cappedWin.mode, 'exceeds-max-weeks');
  assert.equal(cappedWin.canExpand, false);
  assert.equal(cappedWin.expandedStartRow, 3);
  assert.equal(cappedWin.expandedEndRow, 3);
  assert.equal(cappedWin.expandedRowCount, 1);
  assert.equal(cappedWin.expandedHeight, 52);
});

test('computeCalendarCellTimeframeBoxes stretches continuous colored selection boxes across start, middle, and end days', () => {
  const startSpan = [{ projectId: 'p1', title: 'Launch', color: 'sky', lane: 0, isStart: true, isEnd: false }];
  const midSpan = [{ projectId: 'p1', title: 'Launch', color: 'sky', lane: 0, isStart: false, isEnd: false }];
  const endSpan = [{ projectId: 'p1', title: 'Launch', color: 'sky', lane: 0, isStart: false, isEnd: true }];

  // Start cell on Tue (col 1): rounded left, open/stretched right
  const [boxStart] = computeCalendarCellTimeframeBoxes(startSpan, 1);
  assert.equal(boxStart.color, 'sky');
  assert.equal(boxStart.continuesLeft, false);
  assert.equal(boxStart.continuesRight, true);
  assert.equal(boxStart.borderLeftWidth, 2);
  assert.equal(boxStart.borderRightWidth, 0);
  assert.equal(boxStart.radiusTopLeft, 12);
  assert.equal(boxStart.radiusTopRight, 0);

  // Middle cell on Wed (col 2): stretched seamlessly on both left & right
  const [boxMid] = computeCalendarCellTimeframeBoxes(midSpan, 2);
  assert.equal(boxMid.continuesLeft, true);
  assert.equal(boxMid.continuesRight, true);
  assert.equal(boxMid.borderLeftWidth, 0);
  assert.equal(boxMid.borderRightWidth, 0);

  // End cell on Thu (col 3): stretched left, rounded right cap
  const [boxEnd] = computeCalendarCellTimeframeBoxes(endSpan, 3);
  assert.equal(boxEnd.continuesLeft, true);
  assert.equal(boxEnd.continuesRight, false);
  assert.equal(boxEnd.borderRightWidth, 2);
  assert.equal(boxEnd.radiusTopRight, 12);

  // Overlapping second project insets cleanly so both project colors stay visible
  const multi = computeCalendarCellTimeframeBoxes(
    [
      { projectId: 'p1', title: 'A', color: 'coral', lane: 0, isStart: false, isEnd: false },
      { projectId: 'p2', title: 'B', color: 'lime', lane: 1, isStart: true, isEnd: false },
    ],
    2
  );
  assert.equal(multi.length, 2);
  assert.equal(multi[0].insetPx, 0);
  assert.equal(multi[1].insetPx, 3);
  assert.equal(multi[1].color, 'lime');
});

test('computeCalendarRowTimeframeBoxes builds single seamless row spans with uniform inset on overlaps', () => {
  const nov2026 = buildMonthGrid(2026, 10);
  const week3 = nov2026.slice(21, 28); // Sat 2026-11-21 .. Fri 2026-11-27
  const projects = [
    { id: 'p1', title: 'Launch', color: 'coral', startDate: '2026-11-18', endDate: '2026-11-25' },
    { id: 'p2', title: 'Growth', color: 'sky', startDate: '2026-11-24', endDate: '2026-11-26' },
  ];
  const segments = computeCalendarRowTimeframeBoxes(week3, projects, '2026-11-24');
  assert.equal(segments.length, 2);

  const coral = segments.find((s) => s.projectId === 'p1');
  const sky = segments.find((s) => s.projectId === 'p2');
  assert.deepEqual(
    { startCol: coral.startCol, endCol: coral.endCol, isStart: coral.isStart, isEnd: coral.isEnd, rowSlot: coral.rowSlot, insetPx: coral.insetPx },
    { startCol: 0, endCol: 4, isStart: false, isEnd: true, rowSlot: 0, insetPx: 0 }
  );
  assert.deepEqual(
    { startCol: sky.startCol, endCol: sky.endCol, isStart: sky.isStart, isEnd: sky.isEnd, rowSlot: sky.rowSlot, insetPx: sky.insetPx },
    { startCol: 3, endCol: 5, isStart: true, isEnd: true, rowSlot: 1, insetPx: 3 }
  );
});

