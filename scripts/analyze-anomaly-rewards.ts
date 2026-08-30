import { HeistRewardService } from '../src/game/anomalies/heist/HeistRewardService.ts';

const RUNS = 10_000;
const ROUND = 30;

for (const cost of [100, 150, 200]) {
  const totals = { credits: 0, coreTokens: 0, plasmaChips: 0, fluxCores: 0, mods: 0 };
  let fullFluxRecoveries = 0;
  let totalContainers = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const rewards = new HeistRewardService(0x4e1a57 + run * 97, ROUND, 'overdrive-phoenix', cost);
    const loot = rewards.createEmpty();
    // Mirrors the authoritative 5–8 vault-container range without coupling the
    // report to Phaser Scene construction.
    const containers = 5 + run % 4;
    totalContainers += containers;
    for (let container = 0; container < containers; container += 1) rewards.add(loot, rewards.rollContainer());
    totals.credits += loot.credits;
    totals.coreTokens += loot.coreTokens;
    totals.plasmaChips += loot.plasmaChips;
    totals.fluxCores += loot.fluxCores;
    totals.mods += loot.modIds.length;
    if (loot.fluxCores >= cost) fullFluxRecoveries += 1;
  }
  const average = (value: number): string => (value / RUNS).toFixed(2);
  console.log(`HEIST ECONOMY // ENTRY ${cost} FLUX // ${RUNS.toLocaleString()} RUNS // 5–8 VAULT CONTAINERS (AVG ${(totalContainers / RUNS).toFixed(2)}) @ R${ROUND}`);
  console.log(`  AVG CREDITS ${average(totals.credits)} // CORE ${average(totals.coreTokens)} // PLASMA ${average(totals.plasmaChips)} // FLUX ${average(totals.fluxCores)} // MODS ${average(totals.mods)}`);
  console.log(`  FULL ENTRY-FLUX RECOVERY ${(fullFluxRecoveries / RUNS * 100).toFixed(3)}%`);
}
