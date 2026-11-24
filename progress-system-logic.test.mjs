import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_MIN,
  LEVEL_MAX,
  LEVEL_STEP_WEIGHTS,
  LEVEL_THRESHOLDS,
  DEFAULT_LIFE_AREAS,
  computeLevelFromRatio,
  collectTopicMilestones,
  computeTopicProgress,
  findTopicNodeByPath,
  ensureTopicTreeSchema,
  computeAreasOfLifeProgress,
  computeOverallProgressPct,
  recordDailyProgressChange,
  getPreviousDateKey,
  computeYesterdayProgressDelta,
} from './progress-system-logic.js';

test('slow-start curve: Level 1->2 requires strictly more progress than every higher level, capping at Level 10', () => {
  assert.equal(LEVEL_MIN, 1);
  assert.equal(LEVEL_MAX, 10);
  assert.equal(LEVEL_STEP_WEIGHTS.length, 9);
  assert.equal(LEVEL_THRESHOLDS.length, 10);

  // Strictly decreasing required milestone share per level transition
  for (let i = 0; i < LEVEL_STEP_WEIGHTS.length - 1; i++) {
    assert.ok(
      LEVEL_STEP_WEIGHTS[i] > LEVEL_STEP_WEIGHTS[i + 1],
      `Transition ${i + 1}->${i + 2} must be harder than ${i + 2}->${i + 3}`
    );
  }

  // 0% -> Level 1, 0%
  const r0 = computeLevelFromRatio(0);
  assert.equal(r0.level, 1);
  assert.equal(r0.levelProgressPct, 0);
  assert.equal(r0.isMaxLevel, false);

  // 10% (1/10 contents) -> still Level 1, 50% toward Level 2 (since L1->L2 takes 20%)
  const r10 = computeLevelFromRatio(0.1);
  assert.equal(r10.level, 1);
  assert.equal(r10.levelProgressPct, 50);

  // 20% (2/10 contents) -> Level 2, 0%
  const r20 = computeLevelFromRatio(0.2);
  assert.equal(r20.level, 2);
  assert.equal(r20.levelProgressPct, 0);

  // 50% (5/10 contents) -> still only Level 3 (slow start)
  const r50 = computeLevelFromRatio(0.5);
  assert.equal(r50.level, 3);

  // 90% (9/10 contents) -> Level 7 (accelerated late game)
  const r90 = computeLevelFromRatio(0.9);
  assert.equal(r90.level, 7);

  // 100% (10/10 contents) -> exact Level 10 MAX
  const r100 = computeLevelFromRatio(1);
  assert.equal(r100.level, 10);
  assert.equal(r100.isMaxLevel, true);
  assert.equal(r100.levelProgressPct, 100);

  // Over 100% still strictly clamps at Level 10 MAX
  const rOver = computeLevelFromRatio(1.5);
  assert.equal(rOver.level, 10);
  assert.equal(rOver.isMaxLevel, true);
});

test('10-content topic progresses slowly at start and accelerates to Level 10', () => {
  const lessons = Array.from({ length: 10 }, (_, i) => ({
    id: `l-${i + 1}`,
    title: `Content ${i + 1}`,
    done: false,
  }));
  const topic = {
    id: 1,
    title: 'Design Systems',
    lifeArea: 'Knowledge',
    milestones: [{ id: 'm-1', title: 'Core Curriculum', lessons }],
    subtopics: [],
  };

  let prevLevel = 1;
  const levelsAtEachCount = [computeTopicProgress(topic).level];
  for (let i = 0; i < 10; i++) {
    lessons[i].done = true;
    const stats = computeTopicProgress(topic);
    assert.equal(stats.doneMilestones, i + 1);
    assert.equal(stats.totalMilestones, 10);
    assert.ok(stats.level >= prevLevel, 'Level must be monotonically non-decreasing');
    prevLevel = stats.level;
    levelsAtEachCount.push(stats.level);
  }

  // First 5 milestones gain fewer levels than the last 5 milestones
  const firstHalfLevelsGained = levelsAtEachCount[5] - levelsAtEachCount[0];
  const secondHalfLevelsGained = levelsAtEachCount[10] - levelsAtEachCount[5];
  assert.ok(
    secondHalfLevelsGained > firstHalfLevelsGained,
    `Expected late levels gained (${secondHalfLevelsGained}) > early levels gained (${firstHalfLevelsGained})`
  );
  assert.equal(levelsAtEachCount[10], 10);
});

test('recursive subtopics roll up content milestones to parent topic and resolve arbitrary nesting paths', () => {
  const topics = [
    {
      id: 10,
      title: 'Architecture',
      lifeArea: 'Aesthetic',
      milestones: [
        {
          id: 'm-root',
          title: 'Root Module',
          lessons: [
            { id: 'l-1', title: 'Plan Views', done: true },
            { id: 'l-2', title: 'Sections', done: false },
          ],
        },
      ],
      subtopics: [
        {
          id: 'sub-1',
          title: 'Perspective',
          milestones: [
            {
              id: 'm-sub-1',
              title: 'Vanishing Points',
              lessons: [
                { id: 'l-3', title: '1-Point', done: true },
                { id: 'l-4', title: '2-Point', done: true },
              ],
            },
          ],
          subtopics: [
            {
              id: 'sub-1a',
              title: '3-Point Aerial',
              milestones: [
                {
                  id: 'm-sub-1a',
                  title: 'Skyline Plate',
                  lessons: [{ id: 'l-5', title: 'Bird Eye Grid', done: false }],
                },
              ],
              subtopics: [],
            },
          ],
        },
      ],
    },
  ];

  ensureTopicTreeSchema(topics[0]);

  const counts = collectTopicMilestones(topics[0]);
  assert.equal(counts.directDone, 1);
  assert.equal(counts.directTotal, 2);
  assert.equal(counts.done, 3);
  assert.equal(counts.total, 5);
  assert.equal(counts.subtopicCount, 1);
  assert.equal(counts.descendantSubtopicCount, 2);

  // Deep path resolution: Architecture -> Perspective -> 3-Point Aerial
  const deep = findTopicNodeByPath(topics, [10, 'sub-1', 'sub-1a']);
  assert.ok(deep);
  assert.equal(deep.rootTopic.title, 'Architecture');
  assert.equal(deep.activeNode.title, '3-Point Aerial');
  assert.equal(deep.chain.length, 3);
  assert.deepEqual(
    deep.chain.map((n) => n.title),
    ['Architecture', 'Perspective', '3-Point Aerial']
  );

  // Subtopic has its own independent progress stats
  const subStats = computeTopicProgress(deep.chain[1]);
  assert.equal(subStats.doneMilestones, 2);
  assert.equal(subStats.totalMilestones, 3);
  assert.equal(subStats.rawCompletionPct, 67);
});

test('Areas of Life linearly sum associated topics (no levels), include Karma, and move up/down on add/remove/toggle', () => {
  const topics = [
    {
      id: 1,
      title: 'Mindful Ethics',
      lifeArea: 'Karma',
      milestones: [
        {
          id: 'm-k1',
          title: 'Daily Practice',
          lessons: [
            { id: 'lk-1', title: 'Generosity', done: true },
            { id: 'lk-2', title: 'Patience', done: false },
          ],
        },
      ],
      subtopics: [],
    },
    {
      id: 2,
      title: 'Drafting',
      lifeArea: 'Aesthetic',
      milestones: [
        {
          id: 'm-a1',
          title: 'Basics',
          lessons: [
            { id: 'la-1', title: 'Line Weight', done: true },
            { id: 'la-2', title: 'Elevation', done: true },
          ],
        },
      ],
      subtopics: [],
    },
  ];

  const areas1 = computeAreasOfLifeProgress(topics, DEFAULT_LIFE_AREAS);
  assert.equal(areas1.length, 7);
  const karma1 = areas1.find((a) => a.label === 'Karma');
  const aesthetic1 = areas1.find((a) => a.label === 'Aesthetic');
  const social1 = areas1.find((a) => a.label === 'Social');

  assert.equal(karma1.linearSum, 50);
  assert.equal(karma1.radarValue, 50);
  assert.equal(aesthetic1.linearSum, 100);
  assert.equal(aesthetic1.radarValue, 100);
  assert.equal(social1.linearSum, 0);
  assert.equal(social1.radarValue, 0);

  // Add a second Karma topic with 100% completion -> Karma linearly sums to 150!
  topics.push({
    id: 3,
    title: 'Community Service',
    lifeArea: 'Karma',
    milestones: [
      {
        id: 'm-k2',
        title: 'Volunteering',
        lessons: [{ id: 'lk-3', title: 'Local Drive', done: true }],
      },
    ],
    subtopics: [],
  });

  const areas2 = computeAreasOfLifeProgress(topics, DEFAULT_LIFE_AREAS);
  const karma2 = areas2.find((a) => a.label === 'Karma');
  const aesthetic2 = areas2.find((a) => a.label === 'Aesthetic');
  assert.equal(karma2.linearSum, 150);
  assert.equal(karma2.radarValue, 100); // New max scale cap = 150
  assert.equal(aesthetic2.linearSum, 100);
  assert.equal(aesthetic2.radarValue, 67); // 100 / 150

  // Uncheck a milestone -> Karma goes DOWN
  topics[0].milestones[0].lessons[0].done = false;
  const areas3 = computeAreasOfLifeProgress(topics, DEFAULT_LIFE_AREAS);
  assert.equal(areas3.find((a) => a.label === 'Karma').linearSum, 100);

  // Remove the second Karma topic -> Karma goes DOWN to 0
  topics.pop();
  const areas4 = computeAreasOfLifeProgress(topics, DEFAULT_LIFE_AREAS);
  assert.equal(areas4.find((a) => a.label === 'Karma').linearSum, 0);
  assert.equal(areas4.find((a) => a.label === 'Karma').radarValue, 0);
});

test('daily progress log tracks today delta and computes yesterday progress percentage accurately', () => {
  assert.equal(getPreviousDateKey('2026-11-23'), '2026-11-22');
  assert.equal(getPreviousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(getPreviousDateKey('2026-01-01'), '2025-12-31');

  // No yesterday data -> 0% yesterday
  const emptyYesterday = computeYesterdayProgressDelta({}, '2026-11-23');
  assert.equal(emptyYesterday.deltaPct, 0);
  assert.equal(emptyYesterday.label, '0% yesterday');
  assert.equal(emptyYesterday.hasData, false);

  // Simulate completing milestones yesterday (2026-11-22): 40% -> 52% (+12%)
  let log = {};
  log = recordDailyProgressChange(log, '2026-11-22', 40, 46);
  log = recordDailyProgressChange(log, '2026-11-22', 46, 52);
  assert.equal(log['2026-11-22'].startPct, 40);
  assert.equal(log['2026-11-22'].endPct, 52);
  assert.equal(log['2026-11-22'].deltaPct, 12);

  // Today (2026-11-23) queries yesterday -> +12% yesterday
  const yest = computeYesterdayProgressDelta(log, '2026-11-23');
  assert.equal(yest.yesterdayKey, '2026-11-22');
  assert.equal(yest.deltaPct, 12);
  assert.equal(yest.label, '+12% yesterday');
  assert.equal(yest.hasData, true);

  // Negative progress yesterday (e.g. unchecked milestones): 50% -> 45% (-5%)
  const negLog = recordDailyProgressChange({}, '2026-11-22', 50, 45);
  const negYest = computeYesterdayProgressDelta(negLog, '2026-11-23');
  assert.equal(negYest.deltaPct, -5);
  assert.equal(negYest.label, '-5% yesterday');

  // Overall progress calculation across multiple topics
  const overall = computeOverallProgressPct([
    { milestones: [{ lessons: [{ done: true }, { done: false }] }], subtopics: [] },
    { milestones: [{ lessons: [{ done: true }, { done: true }] }], subtopics: [] },
  ]);
  assert.equal(overall, 75);
});
