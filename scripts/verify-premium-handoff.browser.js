// Run after the mixed soak in its isolated DEV profile. This exercises the
// normal Continue button and outgoing animation, including consecutive cards.
(async () => {
  if (globalThis.__n3onMixedSoak?.running) throw new Error('Wait for the mixed soak to finish');
  const game = globalThis.n3onGame;
  const { MOD_DEFINITIONS } = await import('/src/game/mods/definitions.ts');
  const { startArenaLoad } = await import('/src/game/utils/runFlow.ts');
  const until = async (predicate, label) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now()-start>30000) throw new Error(`Timed out: ${label}`);
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  };
  const finished = game.scene.getScene('round-finished');
  if (!finished.sys.isActive()) throw new Error('Run after Round Finished');
  startArenaLoad(finished, {reason:'continue-next-round', session:{baseSeed:550055,round:54,
    objectiveMode:'open',protocol:'supreme-leo',runStartedAt:Date.now(),modsEarned:[],modFocus:null,
    contract:null,creditsSpentBeforeRun:0,upgradeCompletionPercentage:0,accountProgressionTier:'endgame',runCreditsEarned:0}});
  const arena=game.scene.getScene('arena');
  await until(()=>arena.sys.isActive()&&arena.roundRuntime.phase==='active','Arena');
  const supreme=MOD_DEFINITIONS.find(d=>d.rarity==='supreme');
  arena.player.invulnUntil=Infinity;
  arena.awardResolvedMod(supreme,'boss',arena.player.x,arena.player.y);
  arena.awardResolvedMod(supreme,'boss',arena.player.x,arena.player.y);
  arena.completeRound();
  let continued=0;
  const start=performance.now();
  while (!finished.sys.isActive()) {
    if (performance.now()-start>45000) throw new Error('Consecutive premium handoff stalled');
    const reveal=game.scene.getScene('legendary-mod-reveal');
    const hit=reveal.continueButton?.getByName('button-hit');
    if(reveal.sys.isActive()&&hit?.input?.enabled) {
      // The actual button handler acknowledges, animates out, then finishes.
      hit.emit('pointerdown');
      continued++;
    }
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  await new Promise(resolve=>setTimeout(resolve,100));
  const reveal=game.scene.getScene('legendary-mod-reveal');
  if(continued<2||reveal.sys.isActive()||reveal.children.list.length||reveal.tweens.tweens.length)
    throw new Error('Premium reveal did not fully retire');
  return {passed:true,continued,roundFinished:true,revealDisplay:reveal.children.list.length,
    revealTweens:reveal.tweens.tweens.length,seconds:(performance.now()-start)/1000};
})()
