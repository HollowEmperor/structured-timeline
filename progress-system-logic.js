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

  const childNodes = [];
  const seenChildIds = new Set();
  const branches = Array.isArray(node.branches) ? node.branches : [];
  for (const b of branches) {
    if (!b || typeof b !== 'object') continue;
    const key = b.id != null ? String(b.id) : null;
    if (key) seenChildIds.add(key);
    childNodes.push(b);
  }
  const legacySubs = Array.isArray(node.subtopics) ? node.subtopics : [];
  for (const sub of legacySubs) {
    if (!sub || typeof sub !== 'object') continue;
    const key = sub.id != null ? String(sub.id) : null;
    if (key && seenChildIds.has(key)) continue;
    childNodes.push(sub);
  }

  let subDone = 0;
  let subTotal = 0;
  let descendantSubtopicCount = childNodes.length;

  for (const child of childNodes) {
    const childCounts = collectTopicMilestones(child);
    subDone += childCounts.done;
    subTotal += childCounts.total;
    descendantSubtopicCount += childCounts.descendantSubtopicCount;
  }

  return {
    done: directDone + subDone,
    total: directTotal + subTotal,
    directDone,
    directTotal,
    skillCount: childNodes.length,
    subtopicCount: childNodes.length,
    descendantSkillCount: descendantSubtopicCount,
    descendantSubtopicCount,
  };
}

/**
 * Computes complete progress stats for a topic or skill node.
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
    skillCount: counts.skillCount,
    subtopicCount: counts.subtopicCount,
    descendantSkillCount: counts.descendantSkillCount,
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
 * Resolves a navigation path [rootId, skillId, ...] through nested topics & skills.
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
    const branches = Array.isArray(current.branches) ? current.branches : [];
    const legacySubs = Array.isArray(current.subtopics) ? current.subtopics : [];
    const next =
      branches.find((b) => String(b.id) === String(pathIds[i])) ||
      legacySubs.find((s) => String(s.id) === String(pathIds[i]));
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
 * Ensures a topic or skill node has the full identical Topic schema recursively.
 * Any legacy `subtopics` entries are migrated seamlessly into `branches` (Skills).
 */
export function ensureTopicTreeSchema(node, fallbackArea = 'Knowledge', lifeAreas = DEFAULT_LIFE_AREAS) {
  if (!node || typeof node !== 'object') return node;
  node.lifeArea = normalizeLifeArea(node.lifeArea || node.category || fallbackArea, lifeAreas);
  if (!Array.isArray(node.branches)) node.branches = [];

  if (Array.isArray(node.subtopics) && node.subtopics.length > 0) {
    const existingIds = new Set(node.branches.map((b) => String(b.id)));
    node.subtopics.forEach((sub, idx) => {
      if (!sub || typeof sub !== 'object') return;
      if (sub.id != null && existingIds.has(String(sub.id))) return;
      node.branches.push({
        ...sub,
        tier: Number(sub.tier || 1),
        status: sub.status || 'unlocked',
        xp: Number(sub.xp || 100),
        drills: Array.isArray(sub.drills)
          ? sub.drills
          : [
              {
                id: `d-${sub.id || idx}-init`,
                title: `${sub.title || 'Core'} Practice Drill`,
                reps: '15m session',
                count: 0,
                done: false,
              },
            ],
      });
    });
    delete node.subtopics;
  }

  if (!Array.isArray(node.milestones)) node.milestones = [];
  node.milestones.forEach((m, idx) => {
    if (!Array.isArray(m.lessons)) {
      m.lessons = [{ id: `l-${m.id || idx}-1`, title: m.title || 'Content Item', done: Boolean(m.done) }];
    }
    m.done = m.lessons.length > 0 && m.lessons.every((l) => l.done);
  });
  if (!Array.isArray(node.achievements)) node.achievements = [];
  if (!Array.isArray(node.resources)) node.resources = [];

  node.branches.forEach((b, idx) => {
    if (!b || typeof b !== 'object') return;
    if (b.tier == null) b.tier = 1;
    if (!b.status) b.status = 'unlocked';
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
    ensureTopicTreeSchema(b, node.lifeArea, lifeAreas);
  });
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

/**
 * Builds a scoped Obsidian-style force-directed graph ({ width, height, nodes, edges })
 * rooted at `rootNode`.
 * - On a main Topic page, traverses all nested Skills (`branches`) recursively so
 *   every skill and sub-skill connection is visible.
 * - On a Skill (subtopic) page, starts from that Skill so only its own descendant
 *   connections appear.
 */
export function buildTopicSkillGraph(rootNode, rootPath = [], options = {}) {
  const width = Number(options.width) || 320;
  const height = Number(options.height) || 268;
  const cx = width / 2;
  const cy = height / 2;

  if (!rootNode || typeof rootNode !== 'object') {
    return { width, height, nodes: [], edges: [] };
  }

  const basePath = Array.isArray(rootPath) && rootPath.length > 0 ? rootPath.map((id) => id) : [rootNode.id];
  const nodes = [];
  const edges = [];
  const nodeByKey = new Map();

  function countSubtreeLeaves(n) {
    const kids = Array.isArray(n.branches) ? n.branches : [];
    if (kids.length === 0) return 1;
    let sum = 0;
    for (const k of kids) sum += countSubtreeLeaves(k);
    return Math.max(1, sum);
  }

  function walk(node, depth, pathIds, parentKey, angleStart, angleEnd) {
    const key = pathIds.map((p) => String(p)).join('>');
    const stats = computeTopicProgress(node);
    const children = Array.isArray(node.branches) ? node.branches : [];
    const midAngle = (angleStart + angleEnd) / 2;

    let x = cx;
    let y = cy;
    if (depth > 0) {
      const parent = nodeByKey.get(parentKey);
      const dist = depth === 1 ? Math.min(width, height) * 0.28 : Math.min(width, height) * 0.21;
      const baseX = parent ? parent.x : cx;
      const baseY = parent ? parent.y : cy;
      x = baseX + Math.cos(midAngle) * dist;
      y = baseY + Math.sin(midAngle) * dist;
    }

    const isMastered = stats.isMaxLevel || node.status === 'mastered';
    const isUnlocked = depth === 0 || isMastered || node.status === 'unlocked' || stats.doneMilestones > 0;

    const gNode = {
      key,
      id: node.id,
      title: node.title || 'Untitled',
      depth,
      isRoot: depth === 0,
      parentKey,
      pathIds: [...pathIds],
      status: isMastered ? 'mastered' : isUnlocked ? 'unlocked' : 'locked',
      tier: Number(node.tier || 1),
      level: stats.level,
      isMaxLevel: stats.isMaxLevel,
      rawCompletionPct: stats.rawCompletionPct,
      doneMilestones: stats.doneMilestones,
      totalMilestones: stats.totalMilestones,
      childCount: children.length,
      degree: (parentKey ? 1 : 0) + children.length,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: depth === 0 ? 11 : Math.max(5.5, Math.min(9.5, 6.2 + Math.min(3, children.length) * 1.1)),
    };

    nodes.push(gNode);
    nodeByKey.set(key, gNode);

    if (parentKey) {
      const parent = nodeByKey.get(parentKey);
      edges.push({
        id: `${parentKey}->${key}`,
        source: parentKey,
        target: key,
        sourceDepth: parent ? parent.depth : depth - 1,
        targetDepth: depth,
        mastered: isMastered && Boolean(parent && parent.status === 'mastered'),
        active: isUnlocked,
      });
    }

    if (children.length > 0) {
      const totalWeight = children.reduce((acc, ch) => acc + countSubtreeLeaves(ch), 0);
      let cursor = depth === 0 ? -Math.PI / 3 : angleStart;
      const fullSpan = depth === 0 ? Math.PI * 2 : Math.max(0.75, Math.min(Math.PI * 1.35, angleEnd - angleStart));
      if (depth > 0) {
        cursor = midAngle - fullSpan / 2;
      }

      for (const ch of children) {
        const w = countSubtreeLeaves(ch);
        const span = (w / totalWeight) * fullSpan;
        walk(ch, depth + 1, [...pathIds, ch.id], key, cursor, cursor + span);
        cursor += span;
      }
    }
  }

  walk(rootNode, 0, basePath, null, -Math.PI / 3, Math.PI * 2 - Math.PI / 3);

  // Deterministic force-directed relaxation for authentic Obsidian spacing
  const padX = 36;
  const padY = 28;
  const iterations = nodes.length > 1 ? 72 : 0;

  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / (iterations + 12);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = (i + 1) * 0.5;
          dy = (j + 1) * 0.5;
          distSq = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(distSq);
        const repulse = 1650 / distSq;
        const fx = (dx / dist) * repulse;
        const fy = (dy / dist) * repulse;
        if (!a.isRoot) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!b.isRoot) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const edge of edges) {
      const src = nodeByKey.get(edge.source);
      const dst = nodeByKey.get(edge.target);
      if (!src || !dst) continue;
      const dx = dst.x - src.x;
      const dy = dst.y - src.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const idealLen = edge.targetDepth === 1 ? (nodes.length <= 4 ? 86 : 70) : 56;
      const pull = (dist - idealLen) * 0.085;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      if (!src.isRoot) {
        src.vx += fx;
        src.vy += fy;
      }
      if (!dst.isRoot) {
        dst.vx -= fx;
        dst.vy -= fy;
      }
    }

    for (const n of nodes) {
      if (n.isRoot) {
        n.x = cx;
        n.y = cy;
        continue;
      }
      // Gentle center gravity keeps outer constellations compact
      n.vx += (cx - n.x) * 0.012;
      n.vy += (cy - n.y) * 0.012;
      n.vx *= 0.72;
      n.vy *= 0.72;
      n.x = Math.max(padX, Math.min(width - padX, n.x + n.vx * cooling));
      n.y = Math.max(padY, Math.min(height - padY - 12, n.y + n.vy * cooling));
    }
  }

  return {
    width,
    height,
    nodes: nodes.map(({ vx, vy, ...rest }) => ({
      ...rest,
      x: Math.round(rest.x * 10) / 10,
      y: Math.round(rest.y * 10) / 10,
    })),
    edges,
  };
}

