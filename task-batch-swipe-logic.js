/**
 * Pure domain logic for 4-Way Tinder Swipe Task Batch Scheduling:
 *  - Right -> 'location' (Location / Route batching)
 *  - Down  -> 'time'     (Time-window batching)
 *  - Up    -> 'urgency'  (Urgency / priority batching)
 *  - Left  -> 'energy'   (Energy-tier batching)
 *
 * Shared between index.html (via window.TaskBatchSwipeLogic) and Node unit tests.
 */

export const BATCH_DIRECTIONS = {
  right: {
    key: 'location',
    direction: 'right',
    label: 'Location / Route',
    shortLabel: 'Route',
    hint: 'Group errands & place-based tasks together',
    colorKey: 'coral',
    hex: '#F28B82',
  },
  down: {
    key: 'time',
    direction: 'down',
    label: 'Time Block',
    shortLabel: 'Time',
    hint: 'Keep anchored to specific clock windows',
    colorKey: 'sky',
    hex: '#6EA8D8',
  },
  up: {
    key: 'urgency',
    direction: 'up',
    label: 'Urgency',
    shortLabel: 'Urgent',
    hint: 'Front-load critical tasks first in the day',
    colorKey: 'amber',
    hex: '#F6C244',
  },
  left: {
    key: 'energy',
    direction: 'left',
    label: 'Energy',
    shortLabel: 'Energy',
    hint: 'Cluster deep-focus & low-energy blocks',
    colorKey: 'lime',
    hex: '#81C953',
  },
};

export const BATCH_META_BY_KEY = {
  location: BATCH_DIRECTIONS.right,
  time: BATCH_DIRECTIONS.down,
  urgency: BATCH_DIRECTIONS.up,
  energy: BATCH_DIRECTIONS.left,
};

/**
 * Classifies a 2D drag delta into 'up' | 'down' | 'left' | 'right' | null.
 */
export function classifyFourWaySwipe(dx, dy, threshold = 64) {
  const absX = Math.abs(dx || 0);
  const absY = Math.abs(dy || 0);
  const mag = Math.max(absX, absY);
  if (mag < threshold) return null;
  if (absX >= absY) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

/**
 * Maps a swipe direction to its task batch category key.
 */
export function directionToBatchKey(direction) {
  return BATCH_DIRECTIONS[direction]?.key || null;
}

/**
 * Computes live opacity weights (0..1) for each directional stamp during drag.
 */
export function computeSwipeStampOpacities(dx, dy, deadzone = 16, fullAt = 82) {
  const absX = Math.abs(dx || 0);
  const absY = Math.abs(dy || 0);
  const scale = (v) => Math.max(0, Math.min(1, (v - deadzone) / Math.max(1, fullAt - deadzone)));
  const out = { right: 0, left: 0, up: 0, down: 0 };
  if (absX >= absY) {
    if (dx > 0) out.right = scale(dx);
    else if (dx < 0) out.left = scale(-dx);
  } else {
    if (dy > 0) out.down = scale(dy);
    else if (dy < 0) out.up = scale(-dy);
  }
  return out;
}

/**
 * Groups items into the 4 batch buckets, sorted intelligently inside each bucket.
 */
export function groupBatchedItems(items) {
  const groups = {
    urgency: [],
    energy: [],
    location: [],
    time: [],
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = item?.batchKey;
    if (key && groups[key]) {
      groups[key].push(item);
    }
  });

  // Sort inside each bucket by its primary organizing principle
  groups.urgency.sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3) || (a.startMin ?? 540) - (b.startMin ?? 540));
  groups.energy.sort((a, b) => (b.energy ?? 2) - (a.energy ?? 2) || (a.startMin ?? 540) - (b.startMin ?? 540));
  groups.location.sort((a, b) => {
    const locA = String(a.location || 'zzz').toLowerCase();
    const locB = String(b.location || 'zzz').toLowerCase();
    return locA.localeCompare(locB) || (a.startMin ?? 540) - (b.startMin ?? 540);
  });
  groups.time.sort((a, b) => (a.startMin ?? 540) - (b.startMin ?? 540));

  return groups;
}

/**
 * Packs batched items into non-overlapping contiguous timeline slots starting from startMin.
 * Order:
 *  1. Urgency (front-loaded high priority)
 *  2. Energy (deep work peak focus blocks)
 *  3. Location / Route (clustered together into one errand window)
 *  4. Time (chronological blocks)
 */
export function buildBatchedTimelinePlan(items, options = {}) {
  const groups = groupBatchedItems(items);
  const startBase = Math.max(360, Math.min(1200, Math.round(options.startMin ?? 540))); // default 9:00 AM
  const gapMin = Math.max(0, Math.round(options.gapMin ?? 10));
  const batchBreakMin = Math.max(gapMin, Math.round(options.batchBreakMin ?? 15));

  const order = ['urgency', 'energy', 'location', 'time'];
  const placements = [];
  let cursor = startBase;

  order.forEach((batchKey) => {
    const list = groups[batchKey];
    if (list.length === 0) return;

    if (placements.length > 0) {
      cursor += batchBreakMin - gapMin;
    }

    list.forEach((item) => {
      const durationMin = Math.max(15, Math.min(180, Math.round(Number(item.durationMin) || 30)));
      let assignedStart = cursor;

      // For Time batch, respect explicit pre-existing time slot if it doesn't collide backward
      if (batchKey === 'time' && typeof item.preferredStartMin === 'number' && item.preferredStartMin >= cursor) {
        assignedStart = item.preferredStartMin;
      }

      assignedStart = Math.min(1380, assignedStart);
      const priority = batchKey === 'urgency' ? Math.max(3, Number(item.priority) || 3) : (item.priority ?? 2);
      const energy = batchKey === 'energy' ? Math.max(2, Number(item.energy) || 2) : (item.energy ?? 1);

      placements.push({
        ...item,
        batchKey,
        startMin: assignedStart,
        durationMin,
        priority,
        energy,
        color: item.color || BATCH_META_BY_KEY[batchKey]?.colorKey || 'coral',
      });

      cursor = assignedStart + durationMin + gapMin;
    });
  });

  return placements;
}

if (typeof window !== 'undefined') {
  window.TaskBatchSwipeLogic = {
    BATCH_DIRECTIONS,
    BATCH_META_BY_KEY,
    classifyFourWaySwipe,
    directionToBatchKey,
    computeSwipeStampOpacities,
    groupBatchedItems,
    buildBatchedTimelinePlan,
  };
}
