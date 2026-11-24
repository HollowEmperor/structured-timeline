// Pure, deterministic Progress System logic:
// - Recursive Topics & Subtopics (arbitrary nesting depth)
// - Content-driven Milestones (recursively rolled up from descendant subtopics)
// - Slow-start accelerating Level 1 -> Level 10 (max) curve
// - Linear Areas of Life accumulation (no levels) & dynamic Radar scaling
// - Daily progress log & Yesterday's progress percentage

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;

// Decreasing step weights for transitions 1->2, 2->3, ..., 9->10.
// Level 1->2 takes 9/45 (20.0%) of total content milestones (slowest),
// Level 9->10 takes 1/45 (2.2%) of total content milestones (easiest).
export const LEVEL_STEP_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2, 1];
export const LEVEL_TOTAL_WEIGHT = LEVEL_STEP_WEIGHTS.reduce((sum, w) => sum + w, 0); // 45

// Precomputed cumulative ratio thresholds for Levels 1..10:
// [0, 9/45, 17/45, 24/45, 30/45, 35/45, 39/45, 42/45, 44/45, 45/45]
export const LEVEL_THRESHOLDS = (() => {
  const thresholds = [0];
  let acc = 0;
  for (let i = 0; i < LEVEL_STEP_WEIGHTS.length; i++) {
    acc += LEVEL_STEP_WEIGHTS[i];
    thresholds.push(acc / LEVEL_TOTAL_WEIGHT);
  }
  return thresholds;
})();

export const DEFAULT_LIFE_AREAS = [
  'Karma',
  'Social',
  'Knowledge',
  'Personality',
  'Strength',
  'Portfolio',
  'Aesthetic',
];

export function normalizeLifeArea(area, lifeAreas = DEFAULT_LIFE_AREAS) {
  const val = String(area || '').trim().toLowerCase();
  const match = lifeAreas.find((a) => a.toLowerCase() === val);
  return match || 'Knowledge';
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes Level (1..10 max) and within-level progress percentage from a raw
 * milestone completion ratio (0..1) using the slow-start accelerating curve.
 */
export function computeLevelFromRatio(rawRatio) {
  const ratio = clamp(Number(rawRatio) || 0, 0, 1);
  const rawCompletionPct = Math.round(ratio * 100);

  if (ratio >= 1 - 1e-9) {
    return {
      level: LEVEL_MAX,
      maxLevel: LEVEL_MAX,
      isMaxLevel: true,
      levelProgressPct: 100,
      rawCompletionPct: 100,
      currentThreshold: 1,
      nextThreshold: 1,
    };
  }

  let level = LEVEL_MIN;
  for (let idx = LEVEL_THRESHOLDS.length - 2; idx >= 0; idx--) {
    if (ratio + 1e-9 >= LEVEL_THRESHOLDS[idx]) {
      level = idx + 1;
      break;
    }
  }

  const startThreshold = LEVEL_THRESHOLDS[level - 1];
  const endThreshold = LEVEL_THRESHOLDS[level];
  const span = Math.max(1e-9, endThreshold - startThreshold);
  const within = clamp((ratio - startThreshold) / span, 0, 1);
  const levelProgressPct = Math.round(within * 100);

  return {
    level,
    maxLevel: LEVEL_MAX,
    isMaxLevel: false,
    levelProgressPct,
    rawCompletionPct,
    currentThreshold: startThreshold,
    nextThreshold: endThreshold,
  };
}

/**
 * Recursively collects content milestone counts ({ done, total, directDone, directTotal, subtopicCount })
 * from a topic or subtopic node and all of its nested subtopics.
 */
export function collectTopicMilestones(node) {
  if (!node || typeof node !== 'object') {
    return {
      done: 0,
      total: 0,
      directDone: 0,
      directTotal: 0,
      subtopicCount: 0,
      descendantSubtopicCount: 0,
    };
  }

  let directDone = 0;
  let directTotal = 0;
  const milestones = Array.isArray(node.milestones) ? node.milestones : [];
  for (const mod of milestones) {
    if (!mod || typeof mod !== 'object') continue;
    if (Array.isArray(mod.lessons) && mod.lessons.length > 0) {
      for (const les of mod.lessons) {
        if (!les || typeof les !== 'object') continue;
        directTotal += 1;
        if (les.done) directDone += 1;
      }
    } else if (!Array.isArray(mod.lessons)) {
      directTotal += 1;
      if (mod.done) directDone += 1;
    }
  }

  const subtopics = Array.isArray(node.subtopics) ? node.subtopics : [];
  let subDone = 0;
  let subTotal = 0;
  let descendantSubtopicCount = subtopics.length;

  for (const sub of subtopics) {
    const childCounts = collectTopicMilestones(sub);
    subDone += childCounts.done;
    subTotal += childCounts.total;
    descendantSubtopicCount += childCounts.descendantSubtopicCount;
  }

  return {
    done: directDone + subDone,
    total: directTotal + subTotal,
    directDone,
    directTotal,
    subtopicCount: subtopics.length,
    descendantSubtopicCount,
  };
}

/**
 * Computes complete progress stats for a topic or subtopic node.
 */
export function computeTopicProgress(node) {
  const counts = collectTopicMilestones(node);
  const ratio = counts.total === 0 ? 0 : counts.done / counts.total;
  const levelInfo = computeLevelFromRatio(ratio);

  return {
    doneMilestones: counts.done,
    totalMilestones: counts.total,
    directDoneMilestones: counts.directDone,
    directTotalMilestones: counts.directTotal,
    subtopicCount: counts.subtopicCount,
    descendantSubtopicCount: counts.descendantSubtopicCount,
    ratio,
    rawCompletionPct: levelInfo.rawCompletionPct,
    // Linear contribution of this topic to its Area of Life (0..100, uncurved)
    linearProgressValue: counts.total === 0 ? 0 : Math.round(ratio * 100),
    level: levelInfo.level,
    maxLevel: LEVEL_MAX,
    isMaxLevel: levelInfo.isMaxLevel,
    levelProgressPct: levelInfo.levelProgressPct,
  };
}

/**
 * Resolves a navigation path [rootId, subId, ...] through nested topics & subtopics.
 * Returns { rootTopic, activeNode, chain } or null if not found.
 */
export function findTopicNodeByPath(topics, pathIds) {
  if (!Array.isArray(topics) || !Array.isArray(pathIds) || pathIds.length === 0) {
    return null;
  }
  const rootId = pathIds[0];
  const rootTopic = topics.find((t) => String(t.id) === String(rootId));
  if (!rootTopic) return null;

  const chain = [rootTopic];
  let current = rootTopic;
  for (let i = 1; i < pathIds.length; i++) {
    const subs = Array.isArray(current.subtopics) ? current.subtopics : [];
    const next = subs.find((s) => String(s.id) === String(pathIds[i]));
    if (!next) break;
    chain.push(next);
    current = next;
  }

  return {
    rootTopic,
    activeNode: current,
    chain,
  };
}

/**
 * Ensures a topic or subtopic node has the full identical Topic schema recursively.
 */
export function ensureTopicTreeSchema(node, fallbackArea = 'Knowledge', lifeAreas = DEFAULT_LIFE_AREAS) {
  if (!node || typeof node !== 'object') return node;
  node.lifeArea = normalizeLifeArea(node.lifeArea || node.category || fallbackArea, lifeAreas);
  if (!Array.isArray(node.branches)) node.branches = [];
  node.branches.forEach((b, idx) => {
    if (!Array.isArray(b.drills)) {
      b.drills = [
        {
          id: `d-${b.id || idx}-init`,
          title: `${b.title || 'Core'} Practice Drill`,
          reps: '15m session',
          count: 0,
          done: false,
        },
      ];
    }
  });
  if (!Array.isArray(node.milestones)) node.milestones = [];
  node.milestones.forEach((m, idx) => {
    if (!Array.isArray(m.lessons)) {
      m.lessons = [{ id: `l-${m.id || idx}-1`, title: m.title || 'Content Item', done: Boolean(m.done) }];
    }
    m.done = m.lessons.length > 0 && m.lessons.every((l) => l.done);
  });
  if (!Array.isArray(node.achievements)) node.achievements = [];
  if (!Array.isArray(node.resources)) node.resources = [];
  if (!Array.isArray(node.subtopics)) node.subtopics = [];
  node.subtopics.forEach((sub) => ensureTopicTreeSchema(sub, node.lifeArea, lifeAreas));
  return node;
}

/**
 * Computes linear Areas of Life progress across all 7 areas (including Karma)
 * with NO leveling curve. Each Area's progress is the linear sum of accumulated
 * progress (0..100 each) across all root topics assigned to that Area.
 *
 * Radar chart values dynamically move up/down as milestones are toggled or topics
 * are added, removed, or reassigned.
 */
export function computeAreasOfLifeProgress(topics, lifeAreas = DEFAULT_LIFE_AREAS) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const rawAreas = lifeAreas.map((label) => {
    const matchingTopics = safeTopics.filter(
      (t) => normalizeLifeArea(t && (t.lifeArea || t.category), lifeAreas) === label
    );

    let linearSum = 0;
    let doneMilestones = 0;
    let totalMilestones = 0;

    for (const topic of matchingTopics) {
      const p = computeTopicProgress(topic);
      linearSum += p.linearProgressValue;
      doneMilestones += p.doneMilestones;
      totalMilestones += p.totalMilestones;
    }

    return {
      label,
      linearSum: Math.round(linearSum),
      topicCount: matchingTopics.length,
      doneMilestones,
      totalMilestones,
    };
  });

  const maxAreaSum = rawAreas.reduce((max, a) => Math.max(max, a.linearSum), 0);
  const scaleCap = Math.max(100, maxAreaSum);

  return rawAreas.map((a) => ({
    ...a,
    radarValue: scaleCap === 0 ? 0 : Math.min(100, Math.round((a.linearSum / scaleCap) * 100)),
    barPct: scaleCap === 0 ? 0 : Math.min(100, Math.round((a.linearSum / scaleCap) * 100)),
    scaleCap,
  }));
}

/**
 * Computes overall progress percentage (0..100, 1-decimal precision) across all root topics.
 */
export function computeOverallProgressPct(topics) {
  const safeTopics = Array.isArray(topics) ? topics : [];
  let done = 0;
  let total = 0;
  for (const topic of safeTopics) {
    const counts = collectTopicMilestones(topic);
    done += counts.done;
    total += counts.total;
  }
  if (total === 0) return 0;
  return Math.round((done / total) * 1000) / 10;
}

/**
 * Updates the daily progress log for `todayKey` ('YYYY-MM-DD') given the
 * previous overall progress percentage and the new overall progress percentage.
 * Returns a fresh log object with updated deltaPct for today.
 */
export function recordDailyProgressChange(dailyProgressLog, todayKey, prevOverallPct, nextOverallPct) {
  const log = dailyProgressLog && typeof dailyProgressLog === 'object' ? { ...dailyProgressLog } : {};
  const existing = log[todayKey];
  const startPct = existing && typeof existing.startPct === 'number' ? existing.startPct : Number(prevOverallPct) || 0;
  const endPct = Number(nextOverallPct) || 0;
  const deltaPct = Math.round((endPct - startPct) * 10) / 10;

  log[todayKey] = {
    startPct,
    endPct,
    deltaPct,
  };
  return log;
}

/**
 * Subtracts 1 calendar day from a 'YYYY-MM-DD' date key without timezone drift.
 */
export function getPreviousDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return '';
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes the percentage of progress completed yesterday (the day before `todayKey`).
 */
export function computeYesterdayProgressDelta(dailyProgressLog, todayKey) {
  const yesterdayKey = getPreviousDateKey(todayKey);
  const entry =
    dailyProgressLog && typeof dailyProgressLog === 'object' && yesterdayKey
      ? dailyProgressLog[yesterdayKey]
      : null;

  let rawDelta = 0;
  if (entry && typeof entry === 'object') {
    if (typeof entry.deltaPct === 'number' && Number.isFinite(entry.deltaPct)) {
      rawDelta = entry.deltaPct;
    } else if (typeof entry.endPct === 'number' && typeof entry.startPct === 'number') {
      rawDelta = entry.endPct - entry.startPct;
    }
  } else if (typeof entry === 'number' && Number.isFinite(entry)) {
    rawDelta = entry;
  }

  const rounded = Math.round(rawDelta);
  const sign = rounded > 0 ? '+' : '';
  return {
    yesterdayKey,
    deltaPct: rounded,
    rawDeltaPct: Math.round(rawDelta * 10) / 10,
    hasData: Boolean(entry),
    label: `${sign}${rounded}% yesterday`,
  };
}
