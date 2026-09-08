// Compare preserved baseline art with current art through the real WebGL
// camera. Baseline source copies and full screenshots stay in artifacts/.
(() => {
  const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],startedAt:new Date().toISOString()};
  const game=n3onGame,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  report.promise=(async()=>{
    let scene;
    try{
      const {ArenaVisualRenderer:Before}=await import('/artifacts/layout-baseline/ArenaVisualRenderer.ts');
      const {ArenaVisualRenderer:After}=await import('/src/game/arena/ArenaVisualRenderer.ts');
      const baseline=await fetch('/artifacts/layout-before.json').then(r=>r.json());
      const authored=await fetch('/artifacts/layout-before-authored.json').then(r=>r.json());
      const arenaCases=[...baseline.cases,...authored.cases].filter(c=>c.kind.startsWith('arena'));
      const selected=[...new Set(arenaCases.map(c=>c.template))].map(template=>arenaCases.filter(c=>c.template===template).sort((a,b)=>b.render.mean-a.render.mean)[0]);
      for(const current of game.scene.getScenes(true))game.scene.stop(current.scene.key);
      scene=new Phaser.Scene({key:'layout-art-check'});game.scene.add('layout-art-check',scene,true);await wait(100);
      const capture=()=>new Promise(resolve=>game.renderer.snapshot(image=>{
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        resolve({data:context.getImageData(0,0,canvas.width,canvas.height).data,url:image.src});
      }));
      for(const candidate of selected)for(const zoom of [1,.9,.65]){
        report.current=`${candidate.label}/zoom-${zoom}`;
        const shots=[];
        for(const Renderer of [Before,After]){
          const visual=new Renderer(scene,candidate.layout);
          for(const tween of visual.tweens)tween.remove();
          for(const target of visual.ambientPulseTargets)target.setAlpha(.6);
          scene.cameras.main.setBounds(0,0,2400,1600).setZoom(zoom).centerOn(1200,800);
          await wait(100);shots.push(await capture());visual.destroy();await wait(50);
        }
        let total=0,changed=0,severe=0,max=0;
        const [a,b]=shots.map(s=>s.data);
        for(let i=0;i<a.length;i+=4){let pixel=0;for(let ch=0;ch<3;ch++){const d=Math.abs(a[i+ch]-b[i+ch]);total+=d;pixel=Math.max(pixel,d);max=Math.max(max,d);}if(pixel>3)changed++;if(pixel>40)severe++;}
        const pixels=a.length/4;
        report.cases.push({label:report.current,template:candidate.template,zoom,meanChannelDifference:total/(pixels*3),
          changedFraction:changed/pixels,severeFraction:severe/pixels,maxChannelDifference:max,
          ...(candidate===selected[0]?{beforeImage:shots[0].url,afterImage:shots[1].url}:{})});
        if(total/(pixels*3)>1||severe/pixels>.015)throw new Error(`Art changed beyond rasterization tolerance: ${report.current}`);
      }
    }catch(error){report.errors.push(String(error.stack??error));}
    finally{if(scene){game.scene.stop(scene.scene.key);game.scene.remove(scene.scene.key);}report.running=false;report.finishedAt=new Date().toISOString();}
  })();
  return {started:true};
})();
