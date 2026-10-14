export const PHASES = ['solid','liquid','gas'];
export const COLORS = {solid:'#d6f486',liquid:'#82d9df',gas:'#c5b5ed'};
export const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
const block = (x,y,w,h,kind='stone') => ({x,y,w,h,kind});
const bounds = width => [block(0,600,width,80,'ground'),block(0,60,40,540),block(width-40,60,40,540),block(0,60,width,20,'ceiling')];
export const LEVELS = [
  {title:'Matter in motion',category:'PARTICLE PHYSICS',initialPhase:'liquid',width:1280,start:{x:249,y:445},exit:{x:1150,y:505,w:54,h:95},caption:'Drag the material to stir it. Press 3 to evaporate. 1 to freeze.',hint:'Use GAS (3) to rise over the wall. Use LIQUID (2) to pour through the blue grate. SPACE splashes liquid upward.',blocks:[...bounds(1280),block(430,300,100,300),block(840,80,28,520,'grate'),block(220,550,100,12)],molds:[],ice:[],sparks:[{x:265,y:490},{x:575,y:238},{x:1030,y:490}],labels:[{x:220,y:520,text:'POUR OVER THE EDGE',color:'liquid'},{x:440,y:260,text:'01 / EXPAND & RISE',color:'gas'},{x:790,y:375,text:'02 / FLOW THROUGH',color:'liquid'}]},
  {title:'Freeze the flow',category:'LIVE SHAPE CAPTURE',width:1280,start:{x:140,y:530},exit:{x:1145,y:505,w:54,h:95},caption:'Fill the tray. Let the water settle. Freeze its actual shape.',hint:'Move above the tray as GAS, then press 2 to pour into it. Let the water settle. Press 1 to freeze. Hold right + SPACE to slide out.',blocks:[...bounds(1280),block(485,80,440,492),block(535,572,18,28,'sieve')],molds:[{x:330,y:576,w:130,h:24}],ice:[{x:320,y:600,w:635}],sparks:[{x:270,y:480},{x:715,y:586},{x:1050,y:490}],labels:[{x:325,y:520,text:'01 / POUR · SETTLE · FREEZE',color:'liquid'},{x:600,y:535,text:'02 / KEEP YOUR SHAPE',color:'solid'}]},
  {title:'A change of state',category:'ONE BODY · THREE BEHAVIORS',width:1760,start:{x:125,y:530},exit:{x:1630,y:505,w:54,h:95},caption:'All the same matter. A different set of forces.',hint:'Rise over the wall, condense through the grate, then settle in the tray and freeze. If your ice is too tall, melt and let it settle longer.',blocks:[...bounds(1760),block(360,325,100,275),block(645,80,26,520,'grate'),block(1050,80,380,492),block(1110,572,18,28,'sieve')],molds:[{x:865,y:576,w:130,h:24}],ice:[{x:850,y:600,w:605}],sparks:[{x:490,y:260},{x:780,y:535},{x:1235,y:586}],labels:[{x:360,y:285,text:'RISE',color:'gas'},{x:600,y:380,text:'FLOW',color:'liquid'},{x:855,y:520,text:'SETTLE & FREEZE',color:'solid'},{x:1200,y:535,text:'GLIDE',color:'solid'}]}
];
import { MatterSimulation } from './physics.mjs';
export class Game extends MatterSimulation {
  constructor(index = 0) { super(LEVELS, index); }
}
