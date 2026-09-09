import type Phaser from 'phaser';
import { HEIST_ROOM_ROLES, type HeistRoomDetail } from './HeistRoomPlan.ts';
import { drawBeveledTechPlate, drawPanelBolts, drawVentSlats } from '../../rendering/LayeredArtPrimitives.ts';

const key = (role: string, part: string): string => `heist-room-${role}-${part}-v1`;

const ensureDetailTextures = (scene: Phaser.Scene): void => {
  for (const role of HEIST_ROOM_ROLES) {
    if (scene.textures.exists(key(role.id, 'floor'))) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    try {
      // Flush floor inlay: no raised prop silhouette in a walkable lane.
      g.fillStyle(0x0b202b, .65).fillRoundedRect(1, 1, 238, 206, 4);
      g.lineStyle(1, 0x31515f, .65).strokeRoundedRect(1, 1, 238, 206, 4);
      for (const x of [12, 216]) for (const y of [12, 182]) {
        g.lineStyle(2, role.accent, .4).lineBetween(x, y, x + 12, y).lineBetween(x, y, x, y + 12);
      }
      g.fillStyle(0x030e17, .65).fillRect(22, 171, 196, 20);
      for (let x = 26; x < 210; x += 8) g.fillStyle(role.accent, .16).fillRect(x, 176, 3, 10);
      g.lineStyle(2, role.accent, .22);
      if (role.id === 'coolant') {
        g.strokeCircle(90, 90, 26).strokeCircle(150, 90, 26);
        g.lineBetween(38, 90, 62, 90).lineBetween(178, 90, 202, 90);
        g.lineBetween(90, 118, 90, 142).lineBetween(90, 142, 150, 142).lineBetween(150, 142, 150, 118);
        for (const x of [90,150]) g.lineBetween(x-12, 90, x+12, 90).lineBetween(x,78,x,102);
      } else if (role.id === 'relay') {
        for (let x=62;x<=178;x+=29) {
          g.strokeRect(x-7,60,14,56);
          g.lineBetween(x,116,x,134).lineBetween(62,134,178,134);
        }
      } else if (role.id === 'security') {
        g.strokeCircle(120,94,39).strokeCircle(120,94,21);
        g.lineBetween(68,94,172,94).lineBetween(120,42,120,146);
        g.fillStyle(role.accent,.18).fillTriangle(120,94,158,73,158,115);
      } else if (role.id === 'freight') {
        for (const x of [58,126]) for(const y of [58,108]) g.strokeRect(x,y,56,40);
        g.lineBetween(52,158,188,158).lineBetween(52,48,188,48);
      } else {
        g.strokeRect(64,56,112,88).strokeCircle(120,100,25);
        for (let y=66;y<140;y+=16) g.lineBetween(44,y,58,y).lineBetween(182,y,196,y);
      }
      g.generateTexture(key(role.id,'floor'),240,208);
      g.clear();
      // Instrument casing sits wholly on the existing 58px wall cap.
      drawBeveledTechPlate(g,1,1,114,46,{face:0x152b39,inset:0x07101a,edge:role.accent,
        side:0x02070c,highlight:0xa0b8c4,depth:5});
      drawPanelBolts(g,5,5,103,34,0x718893,4);
      if(role.id==='coolant') {
        for(const x of [29,59,89]) {
          g.fillStyle(0x070e16,1).fillCircle(x,23,13);
          g.lineStyle(2,0x516977,1).strokeCircle(x,23,11);
          g.lineStyle(1,role.accent,.65).strokeCircle(x,23,7);
          g.lineBetween(x-6,23,x+6,23).lineBetween(x,17,x,29);
        }
      } else {
        drawVentSlats(g,12,12,36,22,true,0x567d8a);
        g.fillStyle(0x040a11,1).fillRect(56,11,43,24);
        for(let row=0;row<4;row++) {
          g.fillStyle(role.accent,.5+row*.1).fillRect(61,15+row*5,8+row*6,2);
          g.fillStyle(0xb4d5d8,.8).fillRect(93,15+row*5,2,2);
        }
      }
      g.generateTexture(key(role.id,'wall'),116,48);
    } finally { g.destroy(); }
  }
};

export const createHeistRoomDetails = (
  scene: Phaser.Scene, rooms: readonly HeistRoomDetail[], projectionX: number, projectionY: number
): { visuals: Phaser.GameObjects.GameObject[]; labels: Phaser.GameObjects.Text[] } => {
  ensureDetailTextures(scene);
  const visuals: Phaser.GameObjects.GameObject[] = [], labels: Phaser.GameObjects.Text[] = [];
  for(const room of rooms) {
    visuals.push(scene.add.image(room.x,room.y,key(room.role.id,'floor')).setDepth(.25));
    // The cabinet's long axis follows the wall; the nozzle-facing rotation
    // uses a perpendicular convention and is deliberately converted here.
    visuals.push(scene.add.image(room.mount.x-Math.cos(room.mount.rotation)*24-projectionX,
      room.mount.y-Math.sin(room.mount.rotation)*24-projectionY,key(room.role.id,'wall'))
      .setRotation(room.mount.rotation-Math.PI/2).setDepth(30.35));
    labels.push(scene.add.text(room.x,room.y-80,room.role.name,{
      fontFamily:'Rajdhani, sans-serif',fontSize:'13px',fontStyle:'bold',letterSpacing:1,
      color:`#${room.role.accent.toString(16).padStart(6,'0')}`
    }).setOrigin(.5).setAlpha(.74).setDepth(.3));
    labels.push(scene.add.text(room.x,room.y+66,`${room.role.code}  //  ${room.nodeId.replace('cell-','')}`,{
      fontFamily:'Rajdhani, sans-serif',fontSize:'11px',color:'#65828f',letterSpacing:1
    }).setOrigin(.5).setDepth(.3));
  }
  return {visuals,labels};
};
