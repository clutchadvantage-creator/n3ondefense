// Run after the polish fixture and screenshots, in its isolated DEV profile.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],checks:[],errors:[]};
  const check=(ok,label)=>{report.checks.push({ok:!!ok,label});if(!ok)throw Error(label);};
  report.promise=(async()=>{try {
    const sky=globalThis.__sky,roots=sky.children.list.slice(),game=globalThis.n3onGame;
    report.texturePixels=Object.entries(sky.textures.list).filter(([key])=>key.startsWith('sky-'))
      .reduce((sum,[,texture])=>sum+texture.source.reduce((n,source)=>n+source.width*source.height,0),0);
    sky.scene.resume();sky.returnToArena(false,'player-dead');
    await new Promise(resolve=>setTimeout(resolve,700));
    check(game.scene.isActive('arena')&&!game.scene.isActive('anomaly-skybreach'),'Arena resumes after maximum-density fixture');
    check(!sky.seekers.size&&!sky.skyShots.size&&!sky.bossCues.length&&!sky.bossBursts.length,'all new attack ownership retires');
    check(!sky.flights.size&&!sky.hardpoints.length&&!sky.projectiles.length,'aircraft, hardpoints and projectiles retire');
    check(roots.every(root=>!root.scene),'all captured scene-owned visual roots are destroyed');
    check(!sky.mechanicalDestruction.stats().activeFragments&&!sky.mechanicalDestruction.stats().activeBursts,'pooled destruction references retire');
    await new Promise(resolve=>setTimeout(resolve,700));
    check(!sky.skyShots.size&&!sky.bossCues.length,'retired boss cannot emit delayed attacks');
    check(!(globalThis.__skyBrowserErrors?.length),'no captured page errors or unhandled rejections');
    report.cases.push({passed:true});
  }catch(error){report.errors.push(String(error.stack??error));}finally{report.running=false;}})();
  return {started:true};
})();
