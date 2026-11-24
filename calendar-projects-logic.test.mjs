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
} from './calendar-projects-logic.js';

test('buildMonthGrid produces 42 real Monday-first cells for any month/year including leap years', () => {
  const feb2024 = buildMonthGrid(2024, 1); // Feb 2024 (leap year, starts Thu)
  assert.equal(feb2024.length, 42);
  const inMonth = feb2024.filter((c) => !c.out);
  assert.equal(inMonth.length, 29);
  assert.equal(inMonth[0].dateKey, '2024-02-01');
  assert.equal(inMonth[0].weekdayIdx, 3); // Thu = 3 in Mon=0..Sun=6
  assert.equal(inMonth[28].dateKey, '2024-02-29');

  const nov2026 = buildMonthGrid(2026, 10); // Nov 2026 (starts Sun)
  assert.equal(nov2026.length, 42);
  const firstNov = nov2026.find((c) => c.dateKey === '2026-11-01');
  assert.equal(firstNov.weekdayIdx, 6); // Sun = 6
  assert.equal(nov2026[0].dateKey, '2026-10-26');
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
