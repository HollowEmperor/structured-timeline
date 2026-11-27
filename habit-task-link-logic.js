/**
 * Pure domain logic for connecting Habits to Timeline Tasks:
 *  - Mapping habit cadence + anchor time to recurring timeline tasks
 *  - Live schedule tracking ("when am I supposed to do this habit?")
 *  - Automatic punch-card completion sync when linked tasks are checked/unchecked
 *
 * Shared between index.html (via window.HabitTaskLinkLogic) and Node unit tests (via ES module exports).
 */

export function parseTimeLabelToMinutes(timeLabel) {
  if (typeof timeLabel === 'number' && Number.isFinite(timeLabel)) {
    return Math.max(0, Math.min(1439, Math.round(timeLabel)));
  }
  if (!timeLabel || typeof timeLabel !== 'string') return null;
  const trimmed = timeLabel.trim();
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hh = parseInt(match12[1], 10);
    const mm = parseInt(match12[2], 10);
    const mer = match12[3].toUpperCase();
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    if (mer === 'AM') hh = hh === 12 ? 0 : hh;
    else hh = hh === 12 ? 12 : hh + 12;
    return hh * 60 + mm;
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hh = parseInt(match24[1], 10);
    const mm = parseInt(match24[2], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }
  return null;
}

export function formatMinutesTo12h(totalMin) {
  const safe = ((Math.round(Number(totalMin) || 0) % 1440) + 1440) % 1440;
  const hh24 = Math.floor(safe / 60);
  const mm = safe % 60;
  const mer = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(mm).padStart(2, '0')} ${mer}`;
}

export function formatMinutesDelta(diffMin) {
  const mins = Math.max(0, Math.round(Number(diffMin) || 0));
  if (mins < 1) return 'now';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem}m`;
  if (rem === 0) return `${hrs}h`;
  return `${hrs}h ${rem}m`;
}

export function cadenceToTaskSchedule(cadence) {
  if (cadence === 'weekdays') {
    return {
      repeat: 'weekly',
      recurring: true,
      weekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    };
  }
  if (cadence === 'custom') {
    return {
      repeat: 'weekly',
      recurring: true,
      weekDays: ['Mon', 'Wed', 'Fri'],
    };
  }
  return {
    repeat: 'daily',
    recurring: true,
    weekDays: null,
  };
}

export function buildLinkedTaskForHabit(habit, options = {}) {
  if (!habit) return null;
  const startMin =
    typeof options.startMin === 'number' && Number.isFinite(options.startMin)
      ? Math.max(0, Math.min(1435, Math.round(options.startMin)))
      : parseTimeLabelToMinutes(habit.timeLabel) ?? 480;
  const durationMin = Math.max(
    15,
    Math.min(240, Math.round(Number(options.durationMin ?? habit.durationMin ?? 30) || 30))
  );
  const schedule = cadenceToTaskSchedule(options.cadence || habit.cadence || 'daily');
  const dateKey = options.dateKey || habit.createdAtDateKey || '';
  const day = typeof options.day === 'number' ? options.day : Number(dateKey.split('-')[2]) || 1;

  return {
    id: options.id ?? Date.now() + Math.floor(Math.random() * 1000),
    title: String(habit.title || 'Habit Session').trim(),
    dateKey,
    day,
    projectId: null,
    habitId: habit.id,
    startMin,
    durationMin,
    color: habit.color || 'coral',
    icon: habit.icon || 'spark',
    recurring: schedule.recurring,
    repeat: schedule.repeat,
    weekDays: schedule.weekDays ? [...schedule.weekDays] : null,
    energy: 1,
    priority: 2,
    alertStart: true,
    alertEnd: false,
    pinned: false,
    location: '',
    locationPlaceId: '',
    locationLat: null,
    locationLng: null,
    locationRadiusMeters: 150,
    locationVerifyMode: 'off',
    driveFiles: [],
    note: options.note ?? 'Linked habit — completing this task automatically punches your habit card.',
    prePrompts: '',
    intraPrompts: '',
    postPrompts: '',
    subtasks: null,
    done: false,
    doneDays: {},
    compartment: options.compartment || 'morning',
  };
}

export function getLinkedTasksForHabit(tasks, habitId) {
  if (!Array.isArray(tasks) || habitId === null || habitId === undefined) return [];
  const target = String(habitId);
  return tasks.filter(
    (t) => t && t.habitId !== null && t.habitId !== undefined && String(t.habitId) === target
  );
}

export function evaluateHabitScheduleStatus(habit, linkedTasks, nowDate, calLogic) {
  const now = nowDate instanceof Date ? nowDate : new Date();
  const todayKey = calLogic.formatDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tasks = Array.isArray(linkedTasks) ? linkedTasks : [];

  const habitDoneToday =
    Boolean(habit?.done) ||
    (Array.isArray(habit?.completedDates) && habit.completedDates.includes(todayKey));

  if (tasks.length === 0) {
    return {
      state: habitDoneToday ? 'completed' : 'unscheduled',
      label: habitDoneToday ? 'Punched today' : 'Not linked to a task',
      isLinked: false,
      task: null,
      startMin: parseTimeLabelToMinutes(habit?.timeLabel),
      endMin: null,
      minutesUntil: null,
      nextDateKey: null,
    };
  }

  const todayTasks = tasks
    .filter((t) => calLogic.isTaskOnDateKey(t, todayKey, todayKey))
    .slice()
    .sort((a, b) => (a.startMin || 0) - (b.startMin || 0));

  if (todayTasks.length > 0) {
    const completedTodayTask = todayTasks.find((t) => calLogic.isTaskDoneOnDateKey(t, todayKey));
    if (habitDoneToday || completedTodayTask) {
      const primary = completedTodayTask || todayTasks[0];
      const dur = Math.max(15, Number(primary.durationMin) || 30);
      return {
        state: 'completed',
        label: completedTodayTask ? 'Auto-punched via task' : 'Completed today',
        isLinked: true,
        task: primary,
        startMin: primary.startMin,
        endMin: primary.startMin + dur,
        minutesUntil: 0,
        nextDateKey: todayKey,
      };
    }

    // 1. Currently active window?
    const activeTask = todayTasks.find((t) => {
      const dur = Math.max(15, Number(t.durationMin) || 30);
      return nowMin >= t.startMin && nowMin < t.startMin + dur;
    });
    if (activeTask) {
      const dur = Math.max(15, Number(activeTask.durationMin) || 30);
      return {
        state: 'active',
        label: `Due now • ${formatMinutesTo12h(activeTask.startMin)}`,
        isLinked: true,
        task: activeTask,
        startMin: activeTask.startMin,
        endMin: activeTask.startMin + dur,
        minutesUntil: 0,
        nextDateKey: todayKey,
      };
    }

    // 2. Upcoming later today?
    const upcomingTask = todayTasks.find((t) => nowMin < t.startMin);
    if (upcomingTask) {
      const dur = Math.max(15, Number(upcomingTask.durationMin) || 30);
      const diff = upcomingTask.startMin - nowMin;
      return {
        state: 'upcoming',
        label: `In ${formatMinutesDelta(diff)} • ${formatMinutesTo12h(upcomingTask.startMin)}`,
        isLinked: true,
        task: upcomingTask,
        startMin: upcomingTask.startMin,
        endMin: upcomingTask.startMin + dur,
        minutesUntil: diff,
        nextDateKey: todayKey,
      };
    }

    // 3. Past scheduled time today and still unpunched
    const overdueTask = todayTasks[todayTasks.length - 1];
    const dur = Math.max(15, Number(overdueTask.durationMin) || 30);
    const lateMin = Math.max(1, nowMin - (overdueTask.startMin + dur));
    return {
      state: 'overdue',
      label: `Due ${formatMinutesTo12h(overdueTask.startMin)} • Overdue`,
      isLinked: true,
      task: overdueTask,
      startMin: overdueTask.startMin,
      endMin: overdueTask.startMin + dur,
      minutesUntil: -lateMin,
      nextDateKey: todayKey,
    };
  }

  // No linked task today — check if already done today
  if (habitDoneToday) {
    return {
      state: 'completed',
      label: 'Completed today',
      isLinked: true,
      task: tasks[0],
      startMin: tasks[0].startMin ?? null,
      endMin: null,
      minutesUntil: 0,
      nextDateKey: todayKey,
    };
  }

  // Find next upcoming occurrence within the next 7 days
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidateKey = calLogic.addDaysToDateKey(todayKey, offset);
    const matches = tasks
      .filter((t) => calLogic.isTaskOnDateKey(t, candidateKey, candidateKey))
      .sort((a, b) => (a.startMin || 0) - (b.startMin || 0));
    if (matches.length > 0) {
      const nextTask = matches[0];
      const dur = Math.max(15, Number(nextTask.durationMin) || 30);
      const dayLabel = offset === 1 ? 'Tomorrow' : calLogic.getWeekdayShort(candidateKey);
      return {
        state: 'next_day',
        label: `Next: ${dayLabel} • ${formatMinutesTo12h(nextTask.startMin)}`,
        isLinked: true,
        task: nextTask,
        startMin: nextTask.startMin,
        endMin: nextTask.startMin + dur,
        minutesUntil: null,
        nextDateKey: candidateKey,
      };
    }
  }

  const fallback = tasks[0];
  return {
    state: 'unscheduled',
    label: `Linked • ${formatMinutesTo12h(fallback.startMin)}`,
    isLinked: true,
    task: fallback,
    startMin: fallback.startMin ?? null,
    endMin: null,
    minutesUntil: null,
    nextDateKey: null,
  };
}

export function computeHabitAutoPunchSync({
  habit,
  dateKey,
  nextDone,
  todayKey,
  otherLinkedTasksDoneOnDate = false,
  calLogic,
}) {
  const existing = Array.isArray(habit?.completedDates) ? habit.completedDates : [];
  if (!habit || !calLogic?.isValidDateKey(dateKey) || !calLogic?.isValidDateKey(todayKey)) {
    return { changed: false, blockedFuture: false, action: 'noop', completedDates: [...existing] };
  }
  if (calLogic.compareDateKeys(dateKey, todayKey) > 0) {
    return { changed: false, blockedFuture: true, action: 'future_blocked', completedDates: [...existing] };
  }

  const set = new Set(existing.filter((dk) => calLogic.isValidDateKey(dk)));
  const hadDate = set.has(dateKey);

  if (nextDone) {
    if (!hadDate) set.add(dateKey);
    const sorted = Array.from(set).sort((a, b) => calLogic.compareDateKeys(a, b));
    return {
      changed: !hadDate,
      blockedFuture: false,
      action: !hadDate ? 'punched' : 'already_punched',
      completedDates: sorted,
    };
  }

  if (otherLinkedTasksDoneOnDate) {
    const sorted = Array.from(set).sort((a, b) => calLogic.compareDateKeys(a, b));
    return {
      changed: false,
      blockedFuture: false,
      action: 'kept_by_sibling_task',
      completedDates: sorted,
    };
  }

  if (hadDate) set.delete(dateKey);
  const sorted = Array.from(set).sort((a, b) => calLogic.compareDateKeys(a, b));
  return {
    changed: hadDate,
    blockedFuture: false,
    action: hadDate ? 'unpunched' : 'already_unpunched',
    completedDates: sorted,
  };
}

if (typeof window !== 'undefined') {
  window.HabitTaskLinkLogic = {
    parseTimeLabelToMinutes,
    formatMinutesTo12h,
    formatMinutesDelta,
    cadenceToTaskSchedule,
    buildLinkedTaskForHabit,
    getLinkedTasksForHabit,
    evaluateHabitScheduleStatus,
    computeHabitAutoPunchSync,
  };
  if (typeof window.renderHabits === 'function') {
    window.renderHabits();
  }
}
