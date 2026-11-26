/**
 * Pure calendar, task-date matching, multi-project span lane assignment,
 * and shared chronological project timeline math.
 * Shared between index.html (via window.CalendarProjectsLogic) and Node unit tests.
 */

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function pad2(n) {
  return String(Math.floor(Math.abs(Number(n) || 0))).padStart(2, '0');
}

export function formatDateKey(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isValidDateKey(val) {
  if (typeof val !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  const check = new Date(y, mo - 1, da);
  return check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === da;
}

export function parseDateKey(dateKey) {
  if (isValidDateKey(dateKey)) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDaysToDateKey(dateKey, deltaDays) {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + Number(deltaDays || 0));
  return formatDateKey(d);
}

export function compareDateKeys(a, b) {
  const ka = isValidDateKey(a) ? a : '';
  const kb = isValidDateKey(b) ? b : '';
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

export function getWeekdayShort(dateKey) {
  return WEEKDAY_NAMES_SHORT[parseDateKey(dateKey).getDay()];
}

export function getOrdinalDay(dayNum) {
  const n = Number(dayNum);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function formatHumanDate(dateKey, style = 'short') {
  const d = parseDateKey(dateKey);
  const wShort = WEEKDAY_NAMES_SHORT[d.getDay()];
  const wFull = WEEKDAY_NAMES_FULL[d.getDay()];
  const mShort = MONTH_NAMES_SHORT[d.getMonth()];
  const mFull = MONTH_NAMES_FULL[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  if (style === 'compact') return `${mShort} ${day}`;
  if (style === 'compact-year') return `${mShort} ${day}, ${year}`;
  if (style === 'weekday-compact') return `${wShort}, ${mShort} ${day}`;
  if (style === 'full-ordinal') return `${wFull}, ${mFull} ${getOrdinalDay(day)}`;
  return `${wShort}, ${mShort} ${day}, ${year}`;
}

/**
 * Generates a real Saturday-first month grid (4, 5, or 6 rows x 7 cols) for any year & month (0-11),
 * including only rows that contain at least one day of the target month (no extra overflow rows).
 */
export function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  // Convert JS Sun=0..Sat=6 into Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  const startOffset = (firstOfMonth.getDay() + 1) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const cellYear = cellDate.getFullYear();
    const cellMonth = cellDate.getMonth();
    const cellDay = cellDate.getDate();
    cells.push({
      year: cellYear,
      month: cellMonth,
      d: cellDay,
      dateKey: formatDateKey(cellDate),
      out: cellYear !== year || cellMonth !== month,
      weekdayIdx: i % 7,
      r: [0, 0, 0],
    });
  }
  return cells;
}

/**
 * Resolves a task's primary dateKey ('YYYY-MM-DD') with clean legacy migration support.
 */
export function getTaskDateKey(task, fallbackDateKey) {
  if (task && isValidDateKey(task.dateKey)) return task.dateKey;
  if (task && task.day !== undefined && task.day !== null && !Number.isNaN(Number(task.day))) {
    const base = parseDateKey(fallbackDateKey || formatDateKey(new Date()));
    const dayNum = Math.max(1, Math.min(31, Number(task.day)));
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return formatDateKey(new Date(base.getFullYear(), base.getMonth(), Math.min(dayNum, daysInMonth)));
  }
  return isValidDateKey(fallbackDateKey) ? fallbackDateKey : formatDateKey(new Date());
}

/**
 * Determines if a task is scheduled on a given 'YYYY-MM-DD' dateKey.
 */
export function isTaskOnDateKey(task, dateKey, fallbackDateKey) {
  if (!task || !isValidDateKey(dateKey)) return false;
  const repeat = task.repeat || (task.recurring ? 'daily' : 'once');
  const anchorKey = getTaskDateKey(task, fallbackDateKey);

  if (repeat === 'daily') {
    if (isValidDateKey(task.dateKey) && compareDateKeys(dateKey, task.dateKey) < 0) return false;
    return true;
  }

  if (repeat === 'weekly') {
    if (isValidDateKey(task.dateKey) && compareDateKeys(dateKey, task.dateKey) < 0) return false;
    if (!Array.isArray(task.weekDays) || task.weekDays.length === 0) return true;
    return task.weekDays.includes(getWeekdayShort(dateKey));
  }

  if (repeat === 'monthly') {
    if (isValidDateKey(task.dateKey) && compareDateKeys(dateKey, task.dateKey) < 0) return false;
    const anchorDay = parseDateKey(anchorKey).getDate();
    const target = parseDateKey(dateKey);
    const lastOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return target.getDate() === Math.min(anchorDay, lastOfTargetMonth);
  }

  return anchorKey === dateKey;
}

export function isTaskDoneOnDateKey(task, dateKey) {
  if (!task) return false;
  const repeat = task.repeat || (task.recurring ? 'daily' : 'once');
  if (repeat !== 'once') {
    if (!task.doneDays || typeof task.doneDays !== 'object') return false;
    return Boolean(task.doneDays[dateKey]);
  }
  return Boolean(task.done);
}

/**
 * Computes normalized start/end dates for a project, expanding to include any checkpoints
 * that lie outside the declared range so no checkpoint is ever orphaned off the spine.
 */
export function getProjectEffectiveRange(project, fallbackDateKey) {
  const fallback = isValidDateKey(fallbackDateKey) ? fallbackDateKey : formatDateKey(new Date());
  let start = isValidDateKey(project?.startDate) ? project.startDate : fallback;
  let end = isValidDateKey(project?.endDate) ? project.endDate : addDaysToDateKey(start, 7);

  if (compareDateKeys(end, start) < 0) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const checkpoints = Array.isArray(project?.checkpoints) ? project.checkpoints : [];
  for (const cp of checkpoints) {
    if (!isValidDateKey(cp?.date)) continue;
    if (compareDateKeys(cp.date, start) < 0) start = cp.date;
    if (compareDateKeys(cp.date, end) > 0) end = cp.date;
  }

  return { startDate: start, endDate: end };
}

/**
 * Assigns non-overlapping horizontal lane indices (0, 1, 2...) to projects so
 * concurrent projects render cleanly as stacked continuous bars on the top calendar.
 */
export function assignProjectLanes(projects, fallbackDateKey) {
  const list = Array.isArray(projects) ? projects : [];
  const normalized = list.map((p, idx) => {
    const range = getProjectEffectiveRange(p, fallbackDateKey);
    return {
      project: p,
      order: idx,
      startDate: range.startDate,
      endDate: range.endDate,
    };
  });

  normalized.sort((a, b) => compareDateKeys(a.startDate, b.startDate) || a.order - b.order);

  const laneEnds = [];
  const laneById = new Map();

  for (const item of normalized) {
    let assigned = -1;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (compareDateKeys(laneEnds[lane], item.startDate) < 0) {
        assigned = lane;
        laneEnds[lane] = item.endDate;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(item.endDate);
    }
    laneById.set(item.project.id, {
      lane: assigned,
      startDate: item.startDate,
      endDate: item.endDate,
    });
  }

  return {
    laneCount: laneEnds.length,
    laneById,
  };
}

/**
 * Computes the calendar cell overlay metadata (project span bars + due checkpoint dots)
 * for a given 'YYYY-MM-DD' dateKey.
 */
export function getCalendarProjectDecorations(projects, dateKey, todayKey, laneInfo = null) {
  const list = Array.isArray(projects) ? projects : [];
  if (!isValidDateKey(dateKey) || list.length === 0) {
    return { spans: [], dueCheckpoints: [] };
  }

  const info = laneInfo || assignProjectLanes(list, todayKey);
  const spans = [];
  const dueCheckpoints = [];

  for (const p of list) {
    const meta = info.laneById.get(p.id);
    if (!meta) continue;
    const { lane, startDate, endDate } = meta;

    if (compareDateKeys(dateKey, startDate) >= 0 && compareDateKeys(dateKey, endDate) <= 0) {
      spans.push({
        projectId: p.id,
        title: p.title || 'Untitled Project',
        color: p.color || 'coral',
        lane,
        isStart: dateKey === startDate,
        isEnd: dateKey === endDate,
        isSingle: startDate === endDate,
      });
    }

    const cps = Array.isArray(p.checkpoints) ? p.checkpoints : [];
    for (const cp of cps) {
      if (cp && cp.date === dateKey) {
        const cmpToday = isValidDateKey(todayKey) ? compareDateKeys(cp.date, todayKey) : 1;
        dueCheckpoints.push({
          projectId: p.id,
          projectTitle: p.title || 'Project',
          checkpointId: cp.id,
          title: cp.title || 'Checkpoint',
          date: cp.date,
          color: p.color || 'coral',
          done: Boolean(cp.done),
          isOverdue: !cp.done && cmpToday < 0,
          isDueToday: !cp.done && cmpToday === 0,
        });
      }
    }
  }

  spans.sort((a, b) => a.lane - b.lane);
  return { spans, dueCheckpoints };
}

/**
 * Builds the shared chronological vertical timeline matrix across all concurrent projects.
 * Always includes `todayKey` so the current-date marker is guaranteed to exist on the spine.
 */
export function buildSharedProjectTimeline(projects, tasks, todayKey) {
  const today = isValidDateKey(todayKey) ? todayKey : formatDateKey(new Date());
  const projectList = Array.isArray(projects) ? projects : [];
  const taskList = Array.isArray(tasks) ? tasks : [];

  const dateSet = new Set([today]);

  const enrichedProjects = projectList.map((p) => {
    const range = getProjectEffectiveRange(p, today);
    dateSet.add(range.startDate);
    dateSet.add(range.endDate);

    const sortedCps = [...(Array.isArray(p.checkpoints) ? p.checkpoints : [])]
      .filter((cp) => cp && isValidDateKey(cp.date))
      .sort((a, b) => compareDateKeys(a.date, b.date) || String(a.id).localeCompare(String(b.id)))
      .map((cp, index) => {
        dateSet.add(cp.date);
        const cmp = compareDateKeys(cp.date, today);
        const status = cp.done ? 'done' : cmp < 0 ? 'overdue' : cmp === 0 ? 'due-today' : 'upcoming';
        return {
          ...cp,
          number: index + 1,
          status,
          isDue: !cp.done && cmp <= 0,
        };
      });

    const linkedTasks = taskList
      .filter((t) => t && t.projectId === p.id)
      .map((t) => {
        const dk = getTaskDateKey(t, today);
        dateSet.add(dk);
        return { ...t, resolvedDateKey: dk };
      });

    const totalCps = sortedCps.length;
    const doneCps = sortedCps.filter((cp) => cp.done).length;

    return {
      ...p,
      startDate: range.startDate,
      endDate: range.endDate,
      checkpoints: sortedCps,
      linkedTasks,
      doneCount: doneCps,
      totalCount: totalCps,
    };
  });

  const sortedDates = Array.from(dateSet).sort(compareDateKeys);

  const rows = sortedDates.map((dateKey) => {
    const cmpToday = compareDateKeys(dateKey, today);
    const cells = enrichedProjects.map((p) => {
      const inSpan = compareDateKeys(dateKey, p.startDate) >= 0 && compareDateKeys(dateKey, p.endDate) <= 0;
      const isStart = dateKey === p.startDate;
      const isEnd = dateKey === p.endDate;
      const checkpoints = p.checkpoints.filter((cp) => cp.date === dateKey);
      const tasksOnDate = p.linkedTasks.filter((t) => t.resolvedDateKey === dateKey);
      const hasDueCheckpoint = checkpoints.some((cp) => cp.isDue);
      return {
        projectId: p.id,
        color: p.color || 'coral',
        inSpan,
        isStart,
        isEnd,
        checkpoints,
        tasks: tasksOnDate,
        hasDueCheckpoint,
      };
    });

    return {
      dateKey,
      isToday: dateKey === today,
      isPast: cmpToday < 0,
      isFuture: cmpToday > 0,
      cells,
    };
  });

  // Compute current-day checkpoints (plus overdue or nearest upcoming active checkpoint per project)
  // so the sticky focus bar always keeps the current day's checkpoint(s) in view.
  const todayFocusItems = [];
  for (const p of enrichedProjects) {
    const dueToday = p.checkpoints.filter((cp) => cp.date === today);
    if (dueToday.length > 0) {
      for (const cp of dueToday) {
        todayFocusItems.push({
          projectId: p.id,
          projectTitle: p.title || 'Project',
          color: p.color || 'coral',
          checkpoint: cp,
          relation: cp.done ? 'done-today' : 'due-today',
        });
      }
      continue;
    }

    const overdue = p.checkpoints.filter((cp) => !cp.done && compareDateKeys(cp.date, today) < 0);
    if (overdue.length > 0) {
      const latestOverdue = overdue[overdue.length - 1];
      todayFocusItems.push({
        projectId: p.id,
        projectTitle: p.title || 'Project',
        color: p.color || 'coral',
        checkpoint: latestOverdue,
        relation: 'overdue',
      });
      continue;
    }

    const nextUp = p.checkpoints.find((cp) => !cp.done && compareDateKeys(cp.date, today) > 0);
    if (nextUp) {
      todayFocusItems.push({
        projectId: p.id,
        projectTitle: p.title || 'Project',
        color: p.color || 'coral',
        checkpoint: nextUp,
        relation: 'next-up',
      });
    }
  }

  return {
    todayKey: today,
    projects: enrichedProjects,
    rows,
    todayFocusItems,
  };
}

/**
 * Resolves a calendar pointer gesture delta into a discrete horizontal month-swipe
 * or vertical expand/collapse action while ignoring sub-threshold taps.
 */
export function resolveCalendarSwipeGesture(dx, dy, options = {}) {
  const horizontalThreshold = Number(options.horizontalThreshold) || 42;
  const verticalThreshold = Number(options.verticalThreshold) || 40;
  const lockThreshold = Number(options.lockThreshold) || 10;
  const isExpanded = Boolean(options.isExpanded);

  const deltaX = Number(dx) || 0;
  const deltaY = Number(dy) || 0;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (Math.hypot(absX, absY) < lockThreshold) {
    return { action: 'none', axis: null };
  }

  if (absX > absY) {
    if (deltaX <= -horizontalThreshold) return { action: 'month-next', axis: 'x' };
    if (deltaX >= horizontalThreshold) return { action: 'month-prev', axis: 'x' };
    return { action: 'none', axis: 'x' };
  }

  if (!isExpanded && deltaY > verticalThreshold) {
    return { action: 'vertical-expand', axis: 'y' };
  }
  if (isExpanded && deltaY < -verticalThreshold) {
    return { action: 'vertical-collapse', axis: 'y' };
  }
  return { action: 'none', axis: 'y' };
}

/**
 * Returns the Saturday 'YYYY-MM-DD' dateKey of the Saturday-first week containing `dateKey`.
 */
export function getMondayDateKey(dateKey) {
  const d = parseDateKey(dateKey);
  const weekStartOffset = (d.getDay() + 1) % 7;
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekStartOffset);
  return formatDateKey(weekStart);
}

/**
 * Computes how many Saturday-first calendar weeks a [startDate, endDate] range spans in total.
 */
export function getProjectWeekSpanCount(startDate, endDate) {
  const sKey = isValidDateKey(startDate) ? startDate : formatDateKey(new Date());
  const eKey = isValidDateKey(endDate) ? endDate : sKey;
  const [firstKey, lastKey] = compareDateKeys(sKey, eKey) <= 0 ? [sKey, eKey] : [eKey, sKey];
  const startMon = parseDateKey(getMondayDateKey(firstKey));
  const endMon = parseDateKey(getMondayDateKey(lastKey));
  const diffDays = Math.round((endMon.getTime() - startMon.getTime()) / 86400000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * Computes which week rows (0..5) of the 42-cell month grid should open when expanding the top calendar.
 * - If no project timeframes overlap the displayed month grid, expands the full 6-row month (rows 0..5).
 * - If project timeframe(s) exist and span <= maxWeeks (default 5), opens ONLY the week row(s) covering
 *   that timeframe instead of the whole month.
 * - If project timeframe(s) span > maxWeeks (more than 5 weeks) and no <=5-week timeframe applies,
 *   does not expand the calendar (stays compact on the selected week row).
 */
export function computeCalendarTimeframeWindow(monthCells, projects, selectedDate, options = {}) {
  const cells = Array.isArray(monthCells) ? monthCells : [];
  const totalRows = Math.max(1, Math.floor(cells.length / 7) || 6);
  const maxWeeks = Number(options.maxWeeks) || 5;
  const rowHeight = Number(options.rowHeight) || 52;
  const rowStride = Number(options.rowStride) || 56;

  const selIdx = cells.findIndex((c) => c && c.dateKey === selectedDate);
  const selectedRow = selIdx >= 0 ? Math.floor(selIdx / 7) : 0;

  if (cells.length < 7) {
    return {
      mode: 'full-month',
      canExpand: true,
      selectedRow: 0,
      expandedStartRow: 0,
      expandedEndRow: totalRows - 1,
      expandedRowCount: totalRows,
      expandedHeight: rowHeight + (totalRows - 1) * rowStride,
    };
  }

  const gridStartKey = cells[0].dateKey;
  const gridEndKey = cells[cells.length - 1].dateKey;
  const projectList = Array.isArray(projects) ? projects : [];

  const overlapping = [];
  for (const p of projectList) {
    if (!p) continue;
    const range = getProjectEffectiveRange(p, selectedDate);
    if (compareDateKeys(range.endDate, gridStartKey) < 0 || compareDateKeys(range.startDate, gridEndKey) > 0) {
      continue;
    }

    let firstRow = -1;
    let lastRow = -1;
    for (let r = 0; r < totalRows; r++) {
      const rowStart = cells[r * 7]?.dateKey;
      const rowEnd = cells[r * 7 + 6]?.dateKey;
      if (!rowStart || !rowEnd) continue;
      if (compareDateKeys(range.endDate, rowStart) >= 0 && compareDateKeys(range.startDate, rowEnd) <= 0) {
        if (firstRow === -1) firstRow = r;
        lastRow = r;
      }
    }

    if (firstRow === -1 || lastRow === -1) continue;
    const totalWeeks = getProjectWeekSpanCount(range.startDate, range.endDate);
    const gridRowSpan = lastRow - firstRow + 1;
    const exceedsMaxWeeks = totalWeeks > maxWeeks || gridRowSpan > maxWeeks;
    const containsSelectedDate =
      isValidDateKey(selectedDate) &&
      compareDateKeys(selectedDate, range.startDate) >= 0 &&
      compareDateKeys(selectedDate, range.endDate) <= 0;
    const containsSelectedRow = selectedRow >= firstRow && selectedRow <= lastRow;

    overlapping.push({
      project: p,
      startDate: range.startDate,
      endDate: range.endDate,
      firstRow,
      lastRow,
      gridRowSpan,
      totalWeeks,
      exceedsMaxWeeks,
      containsSelectedDate,
      containsSelectedRow,
    });
  }

  if (overlapping.length === 0) {
    return {
      mode: 'full-month',
      canExpand: true,
      selectedRow,
      expandedStartRow: 0,
      expandedEndRow: totalRows - 1,
      expandedRowCount: totalRows,
      expandedHeight: rowHeight + (totalRows - 1) * rowStride,
    };
  }

  const eligible = overlapping.filter((item) => !item.exceedsMaxWeeks);

  if (eligible.length === 0) {
    // All overlapping projects span more than 5 weeks -> do not expand the whole calendar
    return {
      mode: 'exceeds-max-weeks',
      canExpand: false,
      selectedRow,
      expandedStartRow: selectedRow,
      expandedEndRow: selectedRow,
      expandedRowCount: 1,
      expandedHeight: rowHeight,
    };
  }

  // Prefer eligible timeframes covering the selected date/row if the union of all eligible projects would exceed maxWeeks
  let targetGroup = eligible;
  let minRow = Math.min(...targetGroup.map((item) => item.firstRow));
  let maxRow = Math.max(...targetGroup.map((item) => item.lastRow));

  if (maxRow - minRow + 1 > maxWeeks) {
    const onDate = eligible.filter((item) => item.containsSelectedDate || item.containsSelectedRow);
    if (onDate.length > 0) {
      targetGroup = onDate;
      minRow = Math.min(...targetGroup.map((item) => item.firstRow));
      maxRow = Math.max(...targetGroup.map((item) => item.lastRow));
    }
    if (maxRow - minRow + 1 > maxWeeks) {
      const closest = [...eligible].sort(
        (a, b) =>
          Math.min(Math.abs(a.firstRow - selectedRow), Math.abs(a.lastRow - selectedRow)) -
          Math.min(Math.abs(b.firstRow - selectedRow), Math.abs(b.lastRow - selectedRow))
      )[0];
      minRow = closest.firstRow;
      maxRow = closest.lastRow;
    }
  }

  const expandedRowCount = Math.max(1, maxRow - minRow + 1);
  const canExpand = expandedRowCount > 1 || minRow !== selectedRow;

  return {
    mode: 'timeframe',
    canExpand,
    selectedRow,
    expandedStartRow: minRow,
    expandedEndRow: maxRow,
    expandedRowCount,
    expandedHeight: rowHeight + (expandedRowCount - 1) * rowStride,
  };
}

/**
 * Computes stretched selection-box descriptors for a calendar cell (`colIndex` 0..6)
 * so each project timeframe renders as a continuous colored selection box stretching
 * across its entire [startDate, endDate] span instead of a bottom underline.
 */
export function computeCalendarCellTimeframeBoxes(spans, colIndex) {
  const list = Array.isArray(spans) ? spans : [];
  const col = Math.max(0, Math.min(6, Number(colIndex) || 0));

  return list.slice(0, 3).map((sp, idx) => {
    const continuesLeft = !sp.isStart && col > 0;
    const continuesRight = !sp.isEnd && col < 6;
    const insetPx = idx * 3;

    return {
      projectId: sp.projectId,
      title: sp.title || 'Project',
      color: sp.color || 'coral',
      lane: sp.lane ?? idx,
      isStart: Boolean(sp.isStart),
      isEnd: Boolean(sp.isEnd),
      continuesLeft,
      continuesRight,
      insetPx,
      leftPx: continuesLeft ? -2 : insetPx,
      rightPx: continuesRight ? -2 : insetPx,
      topPx: insetPx,
      bottomPx: insetPx,
      borderLeftWidth: continuesLeft ? 0 : 2,
      borderRightWidth: continuesRight ? 0 : 2,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      radiusTopLeft: continuesLeft ? 0 : Math.max(6, 12 - insetPx),
      radiusBottomLeft: continuesLeft ? 0 : Math.max(6, 12 - insetPx),
      radiusTopRight: continuesRight ? 0 : Math.max(6, 12 - insetPx),
      radiusBottomRight: continuesRight ? 0 : Math.max(6, 12 - insetPx),
    };
  });
}

/**
 * Computes seamless, single-element row-level stretched selection box segments
 * for a 7-day calendar week row so each project timeframe renders with zero
 * inter-cell seams and a uniform inset across its entire row span.
 */
export function computeCalendarRowTimeframeBoxes(rowCells, projects, todayKey, laneInfo = null) {
  const cells = Array.isArray(rowCells) ? rowCells : [];
  const list = Array.isArray(projects) ? projects : [];
  if (cells.length === 0 || list.length === 0) return [];
  const info = laneInfo || assignProjectLanes(list, todayKey);
  const rowFirstKey = cells[0].dateKey;
  const rowLastKey = cells[cells.length - 1].dateKey;

  const rawSegments = [];
  for (const p of list) {
    const meta = info.laneById.get(p.id);
    if (!meta) continue;
    const { lane, startDate: startKey, endDate: endKey } = meta;
    if (endKey < rowFirstKey || startKey > rowLastKey) continue;

    let startCol = -1;
    let endCol = -1;
    for (let col = 0; col < cells.length; col++) {
      const dk = cells[col].dateKey;
      if (dk >= startKey && dk <= endKey) {
        if (startCol === -1) startCol = col;
        endCol = col;
      }
    }
    if (startCol === -1) continue;

    rawSegments.push({
      projectId: p.id,
      title: p.title || 'Project',
      color: p.color || 'coral',
      lane,
      startCol,
      endCol,
      isStart: cells[startCol].dateKey === startKey,
      isEnd: cells[endCol].dateKey === endKey,
    });
  }

  rawSegments.sort((a, b) => a.lane - b.lane || a.startCol - b.startCol || b.endCol - a.endCol);

  const slotEndCol = [];
  return rawSegments.map((seg) => {
    let rowSlot = slotEndCol.findIndex((lastCol) => lastCol < seg.startCol);
    if (rowSlot === -1) {
      rowSlot = slotEndCol.length;
      slotEndCol.push(seg.endCol);
    } else {
      slotEndCol[rowSlot] = seg.endCol;
    }
    const insetPx = Math.min(2, rowSlot) * 3;
    return {
      ...seg,
      rowSlot,
      insetPx,
      radiusPx: Math.max(7, 12 - insetPx),
    };
  });
}

if (typeof window !== 'undefined') {
  window.CalendarProjectsLogic = {
    MONTH_NAMES_FULL,
    MONTH_NAMES_SHORT,
    WEEKDAY_NAMES_SHORT,
    WEEKDAY_NAMES_FULL,
    pad2,
    formatDateKey,
    isValidDateKey,
    parseDateKey,
    addDaysToDateKey,
    compareDateKeys,
    getWeekdayShort,
    getOrdinalDay,
    formatHumanDate,
    buildMonthGrid,
    getTaskDateKey,
    isTaskOnDateKey,
    isTaskDoneOnDateKey,
    getProjectEffectiveRange,
    assignProjectLanes,
    getCalendarProjectDecorations,
    buildSharedProjectTimeline,
    resolveCalendarSwipeGesture,
    getMondayDateKey,
    getProjectWeekSpanCount,
    computeCalendarTimeframeWindow,
    computeCalendarCellTimeframeBoxes,
    computeCalendarRowTimeframeBoxes,
  };
}
