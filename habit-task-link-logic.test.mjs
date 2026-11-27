import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parseTimeLabelToMinutes,
  formatMinutesTo12h,
  formatMinutesDelta,
  cadenceToTaskSchedule,
  buildLinkedTaskForHabit,
  getLinkedTasksForHabit,
  evaluateHabitScheduleStatus,
  computeHabitAutoPunchSync,
} from './habit-task-link-logic.js';

const require = createRequire(import.meta.url);
const CalLogic = require('./calendar-projects-logic.js');

test('parseTimeLabelToMinutes & formatMinutesTo12h round-trip accurately', () => {
  assert.equal(parseTimeLabelToMinutes('08:00 AM'), 480);
  assert.equal(parseTimeLabelToMinutes('12:00 AM'), 0);
  assert.equal(parseTimeLabelToMinutes('12:30 PM'), 750);
  assert.equal(parseTimeLabelToMinutes('09:45 PM'), 1305);
  assert.equal(parseTimeLabelToMinutes('invalid'), null);
  assert.equal(formatMinutesTo12h(480), '8:00 AM');
  assert.equal(formatMinutesTo12h(0), '12:00 AM');
  assert.equal(formatMinutesTo12h(750), '12:30 PM');
  assert.equal(formatMinutesDelta(45), '45m');
  assert.equal(formatMinutesDelta(60), '1h');
  assert.equal(formatMinutesDelta(95), '1h 35m');
});

test('cadenceToTaskSchedule maps daily, weekdays, and custom cadences cleanly', () => {
  assert.deepEqual(cadenceToTaskSchedule('daily'), {
    repeat: 'daily',
    recurring: true,
    weekDays: null,
  });
  assert.deepEqual(cadenceToTaskSchedule('weekdays'), {
    repeat: 'weekly',
    recurring: true,
    weekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  });
  assert.deepEqual(cadenceToTaskSchedule('custom'), {
    repeat: 'weekly',
    recurring: true,
    weekDays: ['Mon', 'Wed', 'Fri'],
  });
});

test('buildLinkedTaskForHabit creates a recurring timeline task bound to habitId', () => {
  const habit = {
    id: 777,
    title: 'Morning Mobility',
    timeLabel: '07:30 AM',
    cadence: 'weekdays',
    durationMin: 25,
    color: 'lime',
    icon: 'stretch',
    createdAtDateKey: '2026-11-27',
  };
  const task = buildLinkedTaskForHabit(habit, { dateKey: '2026-11-27', compartment: 'morning', id: 9001 });
  assert.equal(task.habitId, 777);
  assert.equal(task.startMin, 450);
  assert.equal(task.durationMin, 25);
  assert.equal(task.repeat, 'weekly');
  assert.equal(task.recurring, true);
  assert.deepEqual(task.weekDays, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.equal(getLinkedTasksForHabit([task, { id: 1, habitId: null }], 777).length, 1);
});

test('evaluateHabitScheduleStatus tracks upcoming, active, overdue, next_day, and completed states', () => {
  const habit = { id: 42, title: 'Read 20 Pages', timeLabel: '09:00 AM', done: false, completedDates: [] };
  const dailyTask = buildLinkedTaskForHabit(habit, {
    dateKey: '2026-11-27',
    cadence: 'daily',
    durationMin: 30,
    id: 501,
  });

  // 8:15 AM -> upcoming in 45m
  const upcoming = evaluateHabitScheduleStatus(habit, [dailyTask], new Date(2026, 10, 27, 8, 15), CalLogic);
  assert.equal(upcoming.state, 'upcoming');
  assert.equal(upcoming.minutesUntil, 45);
  assert.match(upcoming.label, /In 45m/);

  // 9:10 AM -> due now (active)
  const active = evaluateHabitScheduleStatus(habit, [dailyTask], new Date(2026, 10, 27, 9, 10), CalLogic);
  assert.equal(active.state, 'active');
  assert.match(active.label, /Due now/);

  // 10:15 AM -> overdue
  const overdue = evaluateHabitScheduleStatus(habit, [dailyTask], new Date(2026, 10, 27, 10, 15), CalLogic);
  assert.equal(overdue.state, 'overdue');
  assert.match(overdue.label, /Overdue/);

  // Completed via task
  const doneTask = { ...dailyTask, doneDays: { '2026-11-27': true } };
  const completed = evaluateHabitScheduleStatus(habit, [doneTask], new Date(2026, 10, 27, 10, 15), CalLogic);
  assert.equal(completed.state, 'completed');
  assert.match(completed.label, /Auto-punched/);

  // Weekday-only task evaluated on Saturday Nov 28, 2026 -> Next: Mon
  const weekdayTask = buildLinkedTaskForHabit(habit, {
    dateKey: '2026-11-23',
    cadence: 'weekdays',
    durationMin: 30,
    id: 502,
  });
  const nextDay = evaluateHabitScheduleStatus(habit, [weekdayTask], new Date(2026, 10, 28, 10, 0), CalLogic);
  assert.equal(nextDay.state, 'next_day');
  assert.equal(nextDay.nextDateKey, '2026-11-30');
  assert.match(nextDay.label, /Next: Mon/);
});

test('computeHabitAutoPunchSync auto-punches today/past dates, blocks future dates, and respects sibling tasks', () => {
  const habit = { id: 10, completedDates: ['2026-11-25'] };

  // Punch today
  const res1 = computeHabitAutoPunchSync({
    habit,
    dateKey: '2026-11-27',
    nextDone: true,
    todayKey: '2026-11-27',
    calLogic: CalLogic,
  });
  assert.equal(res1.changed, true);
  assert.equal(res1.action, 'punched');
  assert.deepEqual(res1.completedDates, ['2026-11-25', '2026-11-27']);

  // Block future date
  const resFuture = computeHabitAutoPunchSync({
    habit: { ...habit, completedDates: res1.completedDates },
    dateKey: '2026-11-28',
    nextDone: true,
    todayKey: '2026-11-27',
    calLogic: CalLogic,
  });
  assert.equal(resFuture.changed, false);
  assert.equal(resFuture.blockedFuture, true);

  // Unchecking task when another sibling linked task is still done keeps punch
  const resKept = computeHabitAutoPunchSync({
    habit: { ...habit, completedDates: res1.completedDates },
    dateKey: '2026-11-27',
    nextDone: false,
    todayKey: '2026-11-27',
    otherLinkedTasksDoneOnDate: true,
    calLogic: CalLogic,
  });
  assert.equal(resKept.changed, false);
  assert.equal(resKept.action, 'kept_by_sibling_task');

  // Unchecking when no sibling task is done removes punch
  const resUnpunch = computeHabitAutoPunchSync({
    habit: { ...habit, completedDates: res1.completedDates },
    dateKey: '2026-11-27',
    nextDone: false,
    todayKey: '2026-11-27',
    otherLinkedTasksDoneOnDate: false,
    calLogic: CalLogic,
  });
  assert.equal(resUnpunch.changed, true);
  assert.equal(resUnpunch.action, 'unpunched');
  assert.deepEqual(resUnpunch.completedDates, ['2026-11-25']);
});
