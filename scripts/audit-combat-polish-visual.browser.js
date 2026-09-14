(() => {
 const game=n3onGame,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const report=globalThis.__n3onLayoutAudit={running:true,cases:[],errors:[],screenshots:[]};
 report.promise=(async()=>{
  let scene,vfx;
  try{
   const {MechanicalDestructionVfx}=await import('/src/game/vfx/MechanicalDestructionVfx.ts');
   for(const s of game.scene.getScenes(false))if(s.sys.isActive()||s.sys.isPaused()||s.sys.isSleeping())game.scene.stop(s.scene.key);
   scene=new Phaser.Scene({key:'combat-polish-vfx'});game.scene.add('combat-polish-vfx',scene,true);await wait(100);
   scene.cameras.main.setBackgroundColor('#172331');
   const circles={obtain:s=>scene.add.circle(s.x,s.y,s.radius,s.color,s.alpha).setDepth(s.depth).setStrokeStyle(s.strokeWidth??0,s.strokeColor,s.strokeAlpha),release:c=>c.destroy()};
   vfx=new MechanicalDestructionVfx(scene,circles,true);vfx.prewarm(100);
   const w=scene.scale.width;
   scene.add.text(w/2,80,'MECHANICAL DESTRUCTION / GAMEPLAY SCALE',{fontFamily:'Orbitron',fontSize:'22px',color:'#baf5ff'}).setOrigin(.5);
   for(const [i,type] of ['grunt','drone','tank'].entries()){
    const x=w*(.25+i*.25);
    scene.add.image(x,200,'enemy-'+type,0).setDisplaySize(64,64);
    scene.add.text(x,255,type.toUpperCase(),{fontFamily:'Rajdhani',fontSize:'18px',color:'#ffffff'}).setOrigin(.5);
    vfx.emitEnemy(type,x,450,type==='grunt'?0xff5f7c:type==='tank'?0xc06eff:0x59e5ff,0);
   }
   let previous=0;
   for(const age of [64,176,320,640]){
    for(let time=previous+16;time<=age;time+=16)vfx.update(time,16);previous=age;
    report.screenshots.push({label:'mechanical-death-'+age+'ms',png:await new Promise(r=>game.renderer.snapshot(img=>r(img.src)))});
   }
   vfx.update(1500,16);report.cases.push({ok:vfx.stats().activeFragments===0&&vfx.stats().activeBursts===0,label:'Visual sample completely expires'});
  }catch(e){report.errors.push(String(e.stack??e));}
  finally{vfx?.destroy();if(scene?.scene){game.scene.stop('combat-polish-vfx');game.scene.remove('combat-polish-vfx');}report.running=false;}
 })();return 'Mechanical destruction visual review started';
})();
