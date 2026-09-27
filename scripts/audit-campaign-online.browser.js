// Mocked transport only: never submits a score to an external service.
(() => {
  const report = globalThis.__n3onLayoutAudit = { running: true, current: 'online-contract', cases: [], errors: [] };
  const check = (ok, label) => { report.cases.push({ ok: !!ok, label }); if (!ok) throw Error(label); };
  report.promise = (async () => {
    const dependency = async (url, symbol) => (await fetch(url).then(r => r.text()))
      .match(new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)`))[1];
    const runUrl = await dependency('/src/game/scenes/ArenaScene.ts', 'OnlineRunManager');
    const { LeaderboardClient: Client } = await import(await dependency(runUrl, 'LeaderboardClient'));
    const { OnlineRunManager: Runs } = await import(runUrl);
    const { PendingSubmissionQueue: Queue } = await import('/src/online/PendingSubmissionQueue.ts');
    const { OnlineCredentialStore: Credentials } = await import('/src/online/OnlineCredentialStore.ts');
    const { SaveSystem: Save } = await import(await dependency(runUrl, 'SaveSystem'));
    const originals = { fetch, configured: Client.configured, flush: Runs.flushQueue };
    const profile = Save.getActiveProfileSummary();
    const previousCredentials = Credentials.load(profile.id);
    const runIds = new Set();
    const requests = [];
    let acknowledge = true;
    const credentials = { profileId: profile.id, publicId: 'test', displayName: 'Test', accessToken: 'isolated-test', refreshToken: 'isolated-test', accessExpiresAt: Date.now() + 999999, refreshExpiresAt: Date.now() + 999999 };
    Credentials.save(credentials);
    Runs.flushQueue = async () => {};
    Client.configured = () => true;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      const body = init?.body ? JSON.parse(init.body) : null;
      requests.push({ path: url.pathname, search: url.search, body });
      if (url.pathname.endsWith('/v1/runs')) {
        const id = crypto.randomUUID(); runIds.add(id);
        return Response.json({ run_id: id, seed: 123, run_token: 'test', run_token_expires_in_seconds: 9999, status: 'pending',
          ...(acknowledge ? { campaign_version: body.campaign_version, campaign_mode: body.campaign_mode, starting_round: body.starting_round } : {}) });
      }
      if (url.pathname.includes('/leaderboards/')) return Response.json({ entries: [], ...(acknowledge ? { campaign: url.searchParams.get('campaign') } : {}) });
      throw Error('Unexpected mock route: ' + url.pathname);
    };
    try {
      for (const campaign of ['normal', 'overdrive', 'supreme', 'legacy']) {
        check((await Client.leaderboard('highest_round', campaign)).length === 0, `${campaign}: explicit board response`);
        await Client.aroundPlayer(profile.id, 'highest_round', campaign);
        await Client.personalBests(profile.id, campaign);
        check(requests.slice(-3).every(r => new URLSearchParams(r.search).get('campaign') === campaign), `${campaign}: all board routes carry mode`);
      }
      acknowledge = false;
      let refused = false;
      try { await Client.leaderboard('highest_round', 'normal'); } catch { refused = true; }
      check(refused, 'old server cannot masquerade as a new mode leaderboard');
      check(!(await Runs.beginRun(profile.id, profile.name, 'normal', [], 10)).ok, 'old server cannot start an unversioned campaign run');
      acknowledge = true;
      check((await Runs.beginRun(profile.id, profile.name, 'overdrive', [], 10)).ok, 'mode and checkpoint acknowledged on run start');
      const start = requests.at(-1).body;
      check(start.campaign_version === 2 && start.campaign_mode === 'overdrive' && start.starting_round === 10, 'start uses local checkpoint and version 2');
      Runs.recordMilestone(10);
      Runs.recordMilestone(10); // repeated acknowledgement cannot count twice
      Runs.complete('player_dead', 11);
      const queue = Queue.due().filter(item => runIds.has(item.runId));
      check(queue.length === 2, 'duplicate successful-round notification does not duplicate milestone');
      check(queue.every(item => item.body.highest_round === 10 && item.body.boss_rounds_completed === 1), 'death on 11 preserves cleared round 10 and one boss');
      // Render the real mode control with the mocked, empty service.
      const game = globalThis.n3onGame;
      game.scene.start('online-leaderboards');
      await new Promise(resolve => setTimeout(resolve, 150));
      const scene = game.scene.keys['online-leaderboards'];
      check(scene?.sys.isActive() && scene.campaign === 'normal', 'online screen defaults to Normal');
      for (const campaign of ['overdrive', 'supreme', 'legacy']) {
        scene.campaign = campaign;
        await scene.loadBoards();
        check(requests.slice(-3).every(r => new URLSearchParams(r.search).get('campaign') === campaign), `screen loads ${campaign} independently`);
      }
      game.scene.stop('online-leaderboards');
      await new Promise(resolve => setTimeout(resolve, 60));
      check(scene.children.list.length === 0, 'leaderboard scene retires its objects');
    } catch (error) { report.errors.push(String(error.stack ?? error)); }
    finally {
      for (const item of Queue.due()) if (runIds.has(item.runId)) Queue.remove(item.id);
      Runs.beginLocalRun(); Runs.flushQueue = originals.flush; Client.configured = originals.configured;
      window.fetch = originals.fetch;
      if (previousCredentials) Credentials.save(previousCredentials); else Credentials.clear(profile.id);
      report.running = false;
    }
  })();
  return { started: true };
})();
