(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],startedAt:new Date().toISOString()};
  const game=n3onGame,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  report.promise=(async()=>{
    let scene;
    try{
      const {ArenaVisualRenderer}=await import('/src/game/arena/ArenaVisualRenderer.ts');
      const source=await fetch('/artifacts/layout-after.json').then(r=>r.json());
      const candidates=source.cases.filter(c=>c.kind==='arena');
      const selected=[...new Set(candidates.map(c=>c.template))].map(template=>candidates.filter(c=>c.template===template).sort((a,b)=>b.resources.renderTextures.length-a.resources.renderTextures.length)[0]);
      for(const current of game.scene.getScenes(true))game.scene.stop(current.scene.key);
      scene=new Phaser.Scene({key:'layout-lifetime'});game.scene.add('layout-lifetime',scene,true);await wait(100);
      for(let cycle=0;cycle<3;cycle++)for(const candidate of selected){
        if(!scene.sys.isActive()){game.scene.start(scene.scene.key);await wait(100);}
        const visuals=new ArenaVisualRenderer(scene,candidate.layout);
        scene.cameras.main.setBounds(0,0,2400,1600).setZoom(.9).centerOn(1200,800);await wait(100);
        const handles=new Set();
        const visit=o=>{const handle=o.type==='RenderTexture'?o.texture.getWebGLTexture()?.webGLTexture:null;
          if(handle)handles.add(handle);if(o.type==='Container')o.list.forEach(visit);};
        scene.children.list.forEach(visit);
        if(handles.size<3||[...handles].some(h=>!game.renderer.gl.isTexture(h)))throw new Error('Private textures were not live before retirement');
        const mode=cycle%2?'scene-shutdown':'encounter-destroy';
        if(mode==='scene-shutdown')game.scene.stop(scene.scene.key);else visuals.destroy();
        await wait(100);
        const retained=[...handles].filter(h=>game.renderer.gl.isTexture(h)).length;
        const canvasOwners=Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e.parent?.scene===scene).length;
        report.cases.push({label:`${cycle}/${candidate.template}`,mode,privateGpuTextures:handles.size,retained,canvasOwners,roots:scene.children.length});
        report.current=report.cases.at(-1).label;
        if(retained||canvasOwners||scene.children.length)throw new Error(`Layout retained resources: ${report.current}`);
      }
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{if(scene){game.scene.stop(scene.scene.key);game.scene.remove(scene.scene.key);}report.running=false;report.finishedAt=new Date().toISOString();}
  })();
  return {started:true};
})();
