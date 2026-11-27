/**
 * Pure domain logic for:
 *  - Task location proximity & check-in verification (Haversine distance)
 *  - Android / Samsung-style If -> Then Automation trigger evaluation
 *  - Step-by-Step Sticky Notes progress & Google Drive Markdown export
 *
 * Shared between index.html / google-integrations.js (via window.RoutinesAutomationLogic)
 * and Node unit tests (via ES module exports).
 */

export const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DEFAULT_CHECKIN_RADIUS_METERS = 150;

function toFiniteCoord(val) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const a1 = toFiniteCoord(lat1);
  const o1 = toFiniteCoord(lng1);
  const a2 = toFiniteCoord(lat2);
  const o2 = toFiniteCoord(lng2);
  if (a1 === null || o1 === null || a2 === null || o2 === null) {
    return null;
  }

  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return Math.round(R * c);
}

export function formatDistanceMeters(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters >= 10000) return `${Math.round(meters / 1000)} km`;
  return `${(Math.round(meters / 100) / 10).toFixed(1)} km`;
}

export function evaluateTaskLocationStatus(task, userPos) {
  const hasCoords =
    task != null &&
    typeof task.locationLat === 'number' &&
    Number.isFinite(task.locationLat) &&
    typeof task.locationLng === 'number' &&
    Number.isFinite(task.locationLng);

  const radiusMeters =
    typeof task?.locationRadiusMeters === 'number' && task.locationRadiusMeters >= 25
      ? Math.round(task.locationRadiusMeters)
      : DEFAULT_CHECKIN_RADIUS_METERS;

  const verifyMode =
    task?.locationVerifyMode === 'off' ||
    task?.locationVerifyMode === 'auto' ||
    task?.locationVerifyMode === 'prompt'
      ? task.locationVerifyMode
      : 'prompt';

  if (
    !hasCoords ||
    !userPos ||
    typeof userPos.lat !== 'number' ||
    typeof userPos.lng !== 'number'
  ) {
    return {
      hasCoords,
      distanceMeters: null,
      radiusMeters,
      isInside: false,
      verifyMode,
    };
  }

  const distanceMeters = haversineDistanceMeters(
    userPos.lat,
    userPos.lng,
    task.locationLat,
    task.locationLng
  );

  return {
    hasCoords: true,
    distanceMeters,
    radiusMeters,
    isInside: distanceMeters !== null && distanceMeters <= radiusMeters,
    verifyMode,
  };
}

/**
 * Hysteresis-safe geofence transition detector.
 * - 'location_arrive': fires when entering from outside (prevInside === false && nowInside === true)
 *   OR on first GPS fix while already at the destination (prevInside === null && nowInside === true).
 * - 'location_leave': fires ONLY when transitioning from inside to outside (prevInside === true && nowInside === false).
 */
export function evaluateGeofenceTransition({ prevInside, nowInside, triggerType }) {
  if (typeof nowInside !== 'boolean') return false;
  if (triggerType === 'location_arrive') {
    return (prevInside === false || prevInside === null || prevInside === undefined) && nowInside === true;
  }
  if (triggerType === 'location_leave') {
    return prevInside === true && nowInside === false;
  }
  return false;
}

export function pad2(n) {
  return String(Math.floor(Math.abs(Number(n) || 0))).padStart(2, '0');
}

export function getMinuteTriggerKey(dateObj) {
  const d = dateObj instanceof Date && !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function evaluateTimeTriggerMatch(rule, nowDate = new Date(), lastFiredMinuteKey = '') {
  if (!rule || !rule.enabled || rule.trigger?.type !== 'time') {
    return { matched: false, minuteKey: '' };
  }
  const targetTime = String(rule.trigger.time || '').trim();
  if (!/^\d{2}:\d{2}$/.test(targetTime)) {
    return { matched: false, minuteKey: '' };
  }

  const d = nowDate instanceof Date && !Number.isNaN(nowDate.getTime()) ? nowDate : new Date();
  const currentHHMM = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const minuteKey = getMinuteTriggerKey(d);
  if (currentHHMM !== targetTime) {
    return { matched: false, minuteKey };
  }
  if (lastFiredMinuteKey && lastFiredMinuteKey === minuteKey) {
    return { matched: false, minuteKey };
  }

  const days = Array.isArray(rule.trigger.days) ? rule.trigger.days : [];
  if (days.length > 0) {
    const todayCode = WEEKDAY_CODES[d.getDay()];
    if (!days.includes(todayCode)) {
      return { matched: false, minuteKey };
    }
  }

  return { matched: true, minuteKey };
}

export function evaluateCompartmentTriggerMatch(rule, compartmentId) {
  if (!rule || !rule.enabled || rule.trigger?.type !== 'compartment') return false;
  return Boolean(compartmentId) && String(rule.trigger.compartmentId) === String(compartmentId);
}

export function getActiveStickyNoteStepIndex(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return -1;
  return steps.findIndex((s) => !s?.done);
}

export function computeStickyNoteProgress(steps) {
  const arr = Array.isArray(steps) ? steps : [];
  const total = arr.length;
  const done = arr.filter((s) => Boolean(s?.done)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const activeIndex = getActiveStickyNoteStepIndex(arr);
  return {
    total,
    done,
    pct,
    activeIndex,
    isComplete: total > 0 && done === total,
  };
}

export function sanitizeDriveNoteFilename(title) {
  const slug = String(title || 'sticky-note')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `structured-note-${slug || 'untitled'}.md`;
}

export function formatStickyNoteMarkdown(note) {
  const title = String(note?.title || 'Untitled Sticky Note').trim();
  const win = String(note?.window || 'Daily').trim();
  const summary = String(note?.note || '').trim();
  const steps = Array.isArray(note?.steps) ? note.steps : [];
  const driveFiles = Array.isArray(note?.driveFiles) ? note.driveFiles : [];
  const prog = computeStickyNoteProgress(steps);

  const lines = [
    `# ${title}`,
    ``,
    `- **Tag / Window:** ${win}`,
    `- **Progress:** ${prog.done}/${prog.total} steps complete (${prog.pct}%)`,
    `- **Exported:** ${new Date().toISOString()}`,
    ``,
  ];

  if (summary) {
    lines.push(`## Overview`, ``, summary, ``);
  }

  lines.push(`## Step-by-Step Guide`, ``);
  if (steps.length === 0) {
    lines.push(`_No steps added yet._`, ``);
  } else {
    steps.forEach((step, idx) => {
      const box = step?.done ? '[x]' : '[ ]';
      const dur = step?.duration ? ` (${step.duration})` : '';
      lines.push(`${idx + 1}. ${box} **${step?.title || 'Step'}**${dur}`);
      if (step?.note) {
        lines.push(`   - ${step.note}`);
      }
    });
    lines.push(``);
  }

  if (driveFiles.length > 0) {
    lines.push(`## Attached Google Drive Files`, ``);
    driveFiles.forEach((f) => {
      const name = f?.name || 'Drive File';
      const url = f?.webViewLink || '';
      lines.push(url ? `- [${name}](${url})` : `- ${name}`);
    });
    lines.push(``);
  }

  return lines.join('\n');
}

if (typeof window !== 'undefined') {
  window.RoutinesAutomationLogic = {
    WEEKDAY_CODES,
    DEFAULT_CHECKIN_RADIUS_METERS,
    haversineDistanceMeters,
    formatDistanceMeters,
    evaluateTaskLocationStatus,
    evaluateGeofenceTransition,
    pad2,
    getMinuteTriggerKey,
    evaluateTimeTriggerMatch,
    evaluateCompartmentTriggerMatch,
    getActiveStickyNoteStepIndex,
    computeStickyNoteProgress,
    sanitizeDriveNoteFilename,
    formatStickyNoteMarkdown,
  };
}
