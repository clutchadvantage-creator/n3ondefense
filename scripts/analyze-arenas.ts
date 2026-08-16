import { performance } from 'node:perf_hooks';
import { ARENA_ARCHETYPES, ARENA_GENERATION_CONFIG as CONFIG } from '../src/game/config/arenaGeneration.ts';
import { getRoundSiteCountBalanced as getRoundSiteCount } from '../src/game/config/balance/index.ts';
import type { ArenaTemplate } from '../src/game/types.ts';
import { ArenaHistory, compareArenaFingerprints, createArenaFingerprint, type ArenaFingerprint } from '../src/game/systems/ArenaFingerprint.ts';
import { createSafeArenaFallbacks } from '../src/game/systems/ArenaFallbacks.ts';
import { generateArenaTopology, type PointSpec } from '../src/game/systems/ArenaTopology.ts';
import { validateTopologyDraft } from '../src/game/systems/ArenaTopologyValidator.ts';
import { repairNarrowPassages } from '../src/game/systems/ArenaTraversal.ts';
import { SeededRandom } from '../src/game/systems/SeededRandom.ts';

const sequenceLength = Math.max(100, Number.parseInt(process.argv[2] ?? '500', 10) || 500);
const baseSeed = 0x4e334f4e;
const history = new ArenaHistory();
const requestedRecent: ArenaTemplate[] = [];
const fingerprints: ArenaFingerprint[] = [];
const counts = new Map<ArenaTemplate, number>(ARENA_ARCHETYPES.map((archetype) => [archetype, 0]));
let validationRejected = 0;
let similarityRejected = 0;
let fallbackCount = 0;

const selectSites = (random: SeededRandom, candidates: PointSpec[], count: number): PointSpec[] => {
  const selected: PointSpec[] = [];
  for (const candidate of random.shuffle([...candidates])) {
    if (selected.every((site) => Math.hypot(site.x - candidate.x, site.y - candidate.y) >= 200)) selected.push(candidate);
    if (selected.length >= count) break;
  }
  return selected;
};

const requestedArchetype = (round: number): ArenaTemplate => {
  const random = new SeededRandom(baseSeed ^ Math.imul(round, 0x45d9f3b));
  const candidates = random.shuffle([...ARENA_ARCHETYPES]);
  const archetype = candidates.find((candidate) => !requestedRecent.includes(candidate)) ?? candidates[0];
  requestedRecent.push(archetype);
  if (requestedRecent.length > CONFIG.archetypeCooldownRounds) requestedRecent.shift();
  return archetype;
};

const fingerprintTopology = (
  archetype: ArenaTemplate,
  attempt: number,
  draft: ReturnType<typeof generateArenaTopology>,
  sites: PointSpec[]
): ArenaFingerprint => createArenaFingerprint({
  archetype,
  bounds: draft.bounds,
  blockers: draft.walls,
  bombSites: sites,
  enemySpawns: draft.enemySpawns,
  attempt,
  majorStructureCount: draft.majorStructureCount,
  chokePointCount: draft.chokePointCount,
  connectedRegionCount: draft.connectedRegionCount,
  orientationBias: draft.orientationBias,
  validation: ['headless-traversal-valid']
});

const generateRound = (round: number): ArenaFingerprint => {
  const seed = (baseSeed ^ Math.imul(round, 0x9e3779b1) ^ Math.imul(Math.floor((round - 1) / ARENA_ARCHETYPES.length) + 7, 0x85ebca6b)) >>> 0;
  const requested = requestedArchetype(round);
  const archetypes = history.orderArchetypes(requested, ARENA_ARCHETYPES, seed ^ round).slice(0, 1 + CONFIG.alternateArchetypeCount);
  const alternateAttempts = Math.max(1, Math.floor((CONFIG.maximumCandidateAttempts - CONFIG.preferredArchetypeAttempts) / Math.max(1, archetypes.length - 1)));
  let candidateAttempt = 0;

  for (let archetypeIndex = 0; archetypeIndex < archetypes.length; archetypeIndex += 1) {
    const archetype = archetypes[archetypeIndex];
    const limit = archetypeIndex === 0 ? CONFIG.preferredArchetypeAttempts : alternateAttempts;
    for (let localAttempt = 1; localAttempt <= limit && candidateAttempt < CONFIG.maximumCandidateAttempts; localAttempt += 1) {
      candidateAttempt += 1;
      const attemptSeed = (seed
        ^ Math.imul(round + 31, 0x85ebca6b)
        ^ Math.imul(candidateAttempt, 0x9e3779b1)
        ^ Math.imul(ARENA_ARCHETYPES.indexOf(archetype) + 1, 0x27d4eb2d)) >>> 0;
      const draft = generateArenaTopology(archetype, attemptSeed || 1);
      draft.walls = repairNarrowPassages(draft.walls, CONFIG.minimumCorridorWidth, CONFIG.boundaryThickness).walls;
      const sites = selectSites(new SeededRandom(attemptSeed || 1), draft.objectiveCandidates, getRoundSiteCount(round));
      if (sites.length !== getRoundSiteCount(round) || !validateTopologyDraft(draft, sites).valid) {
        validationRejected += 1;
        continue;
      }
      const fingerprint = fingerprintTopology(archetype, candidateAttempt, draft, sites);
      const progress = Math.max(0, (candidateAttempt - CONFIG.preferredArchetypeAttempts) / Math.max(1, CONFIG.maximumCandidateAttempts - CONFIG.preferredArchetypeAttempts));
      const assessment = history.assess(fingerprint, CONFIG.maximumSimilarityRelaxation * progress);
      fingerprint.similarityScore = assessment.score;
      fingerprint.closestHistoryAge = assessment.closestHistoryAge;
      if (assessment.reject) {
        similarityRejected += 1;
        continue;
      }
      return fingerprint;
    }
  }

  fallbackCount += 1;
  let best: { fingerprint: ArenaFingerprint; score: number } | null = null;
  for (const fallback of createSafeArenaFallbacks(seed, round, getRoundSiteCount(round))) {
    const draft = {
      archetype: fallback.archetype,
      bounds: fallback.bounds,
      walls: fallback.walls,
      objectiveCandidates: fallback.bombSites,
      playerCandidates: [fallback.playerSpawn],
      enemySpawns: fallback.enemySpawns,
      majorStructureCount: fallback.majorStructureCount,
      chokePointCount: fallback.chokePointCount,
      connectedRegionCount: fallback.connectedRegionCount,
      orientationBias: fallback.orientationBias
    };
    if (!validateTopologyDraft(draft, fallback.bombSites).valid) continue;
    const fingerprint = fingerprintTopology(fallback.archetype, CONFIG.maximumCandidateAttempts + 1, draft, fallback.bombSites);
    fingerprint.fallbackUsed = true;
    const assessment = history.assess(fingerprint, CONFIG.maximumSimilarityRelaxation);
    fingerprint.similarityScore = assessment.score;
    const score = assessment.score + (assessment.exactPrevious ? 10 : assessment.reject ? 1 : 0);
    if (!best || score < best.score) best = { fingerprint, score };
    if (!assessment.reject) return fingerprint;
  }
  if (best && !history.assess(best.fingerprint).exactPrevious) return best.fingerprint;
  throw new Error(`No safe diverse arena was available for round ${round}.`);
};

const startedAt = performance.now();
for (let round = 1; round <= sequenceLength; round += 1) {
  const fingerprint = generateRound(round);
  history.add(fingerprint);
  fingerprints.push(fingerprint);
  counts.set(fingerprint.archetype, (counts.get(fingerprint.archetype) ?? 0) + 1);
}
const elapsedMs = performance.now() - startedAt;

let exactConsecutive = 0;
let consecutiveArchetypes = 0;
let nearDuplicatePairs = 0;
let nearDuplicateTriples = 0;
let similarityTotal = 0;
let highestConsecutiveSimilarity = 0;
for (let index = 1; index < fingerprints.length; index += 1) {
  const previous = fingerprints[index - 1];
  const current = fingerprints[index];
  const similarity = compareArenaFingerprints(previous, current);
  similarityTotal += similarity;
  highestConsecutiveSimilarity = Math.max(highestConsecutiveSimilarity, similarity);
  if (previous.hash === current.hash) exactConsecutive += 1;
  if (previous.archetype === current.archetype) consecutiveArchetypes += 1;
  if (similarity >= 0.88) nearDuplicatePairs += 1;
  if (index >= 2
    && similarity >= 0.88
    && compareArenaFingerprints(fingerprints[index - 2], previous) >= 0.88) nearDuplicateTriples += 1;
}

const summary = {
  generated: sequenceLength,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  averageMs: Number((elapsedMs / sequenceLength).toFixed(3)),
  validationRejected,
  similarityRejected,
  fallbackCount,
  exactConsecutive,
  consecutiveArchetypes,
  nearDuplicatePairs,
  nearDuplicateTriples,
  averageConsecutiveSimilarity: Number((similarityTotal / Math.max(1, fingerprints.length - 1)).toFixed(3)),
  highestConsecutiveSimilarity: Number(highestConsecutiveSimilarity.toFixed(3)),
  openArenas: fingerprints.filter((fingerprint) => fingerprint.structureClass === 'open').length,
  structuredArenas: fingerprints.filter((fingerprint) => fingerprint.structureClass === 'structured').length,
  denseArenas: fingerprints.filter((fingerprint) => fingerprint.structureClass === 'dense').length
};

console.table([...counts].map(([archetype, count]) => ({ archetype, count, percent: `${(count / sequenceLength * 100).toFixed(1)}%` })));
console.table(summary);
if (exactConsecutive !== 0) throw new Error(`${exactConsecutive} exact back-to-back duplicates detected.`);
if (nearDuplicateTriples !== 0) throw new Error(`${nearDuplicateTriples} three-round near-duplicate sequences detected.`);
if ([...counts.values()].some((count) => count === 0)) throw new Error('At least one arena archetype disappeared from the sequence.');
if (summary.openArenas === 0 || summary.structuredArenas === 0 || summary.denseArenas === 0) throw new Error('The sequence did not retain every structural density class.');
console.log(`PASS: ${sequenceLength} sequential arenas retained all archetypes with no exact consecutive duplicates or near-duplicate triples.`);
