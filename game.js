(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const ui = {menu:$('menu'),loading:$('loading'),hud:$('hud'),pause:$('pause'),over:$('gameover'),orders:$('orders'),mobile:$('mobile-controls'),wave:$('wave'),score:$('score'),guards:$('guards'),health:$('health-bar'),healthText:$('health-text'),fort:$('fort-bar'),fortText:$('fort-text'),ammo:$('ammo'),reload:$('reload-state'),banner:$('wave-banner'),toast:$('toast'),walls:$('walls'),camps:$('camps')};
const WORLD = {w:4400,h:3600,cx:2200,cy:1800};
const FACTIONS = {
  couto:{name:'Couto Misto',a:'#244b36',b:'#d8b65f',dark:'#152e21'},
  portugal:{name:'Portugal',a:'#a83235',b:'#287447',dark:'#681f27'},
  spain:{name:'Spain',a:'#e3c23e',b:'#b8322d',dark:'#772521'},
  france:{name:'France',a:'#315f9b',b:'#e7e8e3',dark:'#1c3557'},
  england:{name:'England',a:'#b63c3c',b:'#eee9dc',dark:'#702323'}
};
const keys = Object.create(null), mouse = {x:0,y:0,down:false};
let dpr=1, vw=0,vh=0, camera={x:WORLD.cx,y:WORLD.cy}, zoom=1, state='menu', last=0, elapsed=0, wave=0, score=0, fortress=100, spawnClock=0, waveGap=3, enemies=[], bullets=[], particles=[], guards=[], escorts=[], defenders=[], villagers=[], walls=[], camps=[], victoryTimer=0, waveActive=false, player, cannonCooldown=0, toastTimer=0, bannerTimer=0, reloadTimer=0, swordTimer=0, mobileMove={x:0,y:0}, touchFire=false, idCounter=0;
const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);vw=r.width;vh=r.height;canvas.width=Math.round(vw*dpr);canvas.height=Math.round(vh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
window.addEventListener('resize',resize); resize();
function worldPoint(sx,sy){return {x:camera.x+(sx-vw/2)/zoom,y:camera.y+(sy-vh/2)/zoom}}
function screenPoint(p){return {x:(p.x-camera.x)*zoom+vw/2,y:(p.y-camera.y)*zoom+vh/2}}
function toast(t){ui.toast.textContent=t;ui.toast.classList.add('show');toastTimer=2.1}
function banner(t){ui.banner.textContent=t;ui.banner.classList.add('show');bannerTimer=2.8}
function polygonPoints(cx,cy,r,n,rot=-Math.PI/2,inner){const pts=[];for(let i=0;i<n;i++){const a=rot+i*Math.PI*2/n;pts.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r})}return pts}
function starPoints(cx,cy,outer,inner,n=5){const pts=[];for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n,r=i%2===0?outer:inner;pts.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r})}return pts}
function pathPoly(pts){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath()}
// ---------- Fortress geometry ----------
// Five bastions joined by five curtain walls. Every curtain is split into wall / gate / wall sections.
// Enemies cannot cross an intact section: they must break a wall, a gate or a bastion first.
const FORT={bastionR:380,bastionRad:40,thick:18,apothem:380*Math.cos(Math.PI/5)};
const WALL_STATS={wall:{hp:480,name:'WALL'},gate:{hp:320,name:'GATE'},bastion:{hp:700,name:'BASTION'}};
// damage per hit by enemy type: [gate, wall, bastion]. Musketeers cannot breach, they only suppress.
const SIEGE_DMG={swordsman:{gate:10,wall:3,bastion:2},cavalry:{gate:14,wall:3,bastion:2},elephant:{gate:70,wall:38,bastion:26}};
const BASTION_NAMES=['North','East','Southeast','Southwest','West'], CURTAIN_NAMES=['Northeast','Southeast','South','Southwest','Northwest'];
const BASTION_ANGLES=Array.from({length:5},(_,i)=>-Math.PI/2+i*Math.PI*2/5);
const GATE_ANGLES=BASTION_ANGLES.map(a=>a+Math.PI/5);
const GATE_ORDER=[0,2,4,1,3]; // spreads small garrisons evenly around the fort
const CURTAIN_DIRS=GATE_ANGLES.map(a=>({x:Math.cos(a),y:Math.sin(a)}));
function buildWalls(){
 const out=[],B=BASTION_ANGLES.map(a=>({x:WORLD.cx+Math.cos(a)*FORT.bastionR,y:WORLD.cy+Math.sin(a)*FORT.bastionR,a}));
 B.forEach((b,i)=>{const nx=Math.cos(b.a),ny=Math.sin(b.a);out.push({id:'B'+i,kind:'bastion',label:BASTION_NAMES[i]+' bastion',x:b.x,y:b.y,r:FORT.bastionRad,a:b.a,mx:b.x,my:b.y,nx,ny,gx:b.x-nx*34,gy:b.y-ny*34,hp:WALL_STATS.bastion.hp,max:WALL_STATS.bastion.hp,flash:0,down:false})});
 for(let i=0;i<5;i++){
  const p=B[i],q=B[(i+1)%5],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=Math.cos(GATE_ANGLES[i]),ny=Math.sin(GATE_ANGLES[i]);
  const s0=FORT.bastionRad-6,span=len-2*s0,cuts=[0,.32,.68,1],kinds=['wall','gate','wall'];
  for(let k=0;k<3;k++){
   const s=s0+span*cuts[k],e=s0+span*cuts[k+1],x1=p.x+ux*s,y1=p.y+uy*s,x2=p.x+ux*e,y2=p.y+uy*e,kind=kinds[k],st=WALL_STATS[kind],mx=(x1+x2)/2,my=(y1+y2)/2;
   out.push({id:'C'+i+k,kind,label:CURTAIN_NAMES[i]+' '+st.name.toLowerCase(),x1,y1,x2,y2,half:FORT.thick/2,a:GATE_ANGLES[i],mx,my,nx,ny,gx:mx-nx*34,gy:my-ny*34,len2:(x2-x1)**2+(y2-y1)**2,hp:st.hp,max:st.hp,flash:0,down:false});
  }
 }
 return out;
}
const wallLayout=buildWalls();
const wallById=id=>wallLayout.find(w=>w.id===id);
// Wall defenders stand on the ramparts: gates first (weakest points), then bastions, then wall sections.
function wallPosts(n){
 const order=[...GATE_ORDER.map(c=>wallById('C'+c+'1')),...GATE_ORDER.map(c=>wallById('B'+c)),...[0,2].flatMap(k=>GATE_ORDER.map(c=>wallById('C'+c+k)))];
 return Array.from({length:n},(_,i)=>{const w=order[i%order.length],lap=Math.floor(i/order.length),off=lap?(lap%2?1:-1)*Math.ceil(lap/2)*20:0;return {x:w.mx-w.ny*off,y:w.my+w.nx*off,a:w.a,piece:w.id}});
}
// Active defenders: the outer reserve waits just behind the gates, the inner reserve guards the keep.
function activePosts(n){
 const outerN=Math.ceil(n/2),innerN=n-outerN,out=[];
 for(let j=0;j<outerN;j++){const a=outerN<=5?GATE_ANGLES[GATE_ORDER[j]]:GATE_ANGLES[0]+j*Math.PI*2/outerN;out.push({x:WORLD.cx+Math.cos(a)*250,y:WORLD.cy+Math.sin(a)*250,a,line:2})}
 for(let j=0;j<innerN;j++){const a=GATE_ANGLES[0]+(j+.5)*Math.PI*2/innerN;out.push({x:WORLD.cx+Math.cos(a)*165,y:WORLD.cy+Math.sin(a)*165,a,line:3})}
 return out;
}
function insideFort(p){for(const n of CURTAIN_DIRS)if((p.x-WORLD.cx)*n.x+(p.y-WORLD.cy)*n.y>FORT.apothem-3)return false;return true}
// closest point of a wall section (or bastion centre) to p, and the clearance between p and the wall surface
function wallContact(w,p){
 if(w.kind==='bastion'){const d=Math.hypot(p.x-w.x,p.y-w.y);return {x:w.x,y:w.y,d,sep:d-w.r}}
 const t=clamp(((p.x-w.x1)*(w.x2-w.x1)+(p.y-w.y1)*(w.y2-w.y1))/w.len2,0,1),x=w.x1+(w.x2-w.x1)*t,y=w.y1+(w.y2-w.y1)*t,d=Math.hypot(p.x-x,p.y-y);
 return {x,y,d,sep:d-w.half};
}
function pushOutOfWalls(u,rad,friendly=false){
 for(const w of walls){if(w.hp<=0||(friendly&&w.kind==='gate'))continue;const c=wallContact(w,u),min=(w.kind==='bastion'?w.r:w.half)+rad;
  if(c.d<min){let dx=u.x-c.x,dy=u.y-c.y;if(c.d<.001){dx=w.nx;dy=w.ny}else{dx/=c.d;dy/=c.d}const push=min-c.d;u.x+=dx*push;u.y+=dy*push}}
}

// true for points on or inside the wall line (the side the defenders live on)
function behindWalls(p,m=14){for(const n of CURTAIN_DIRS)if((p.x-WORLD.cx)*n.x+(p.y-WORLD.cy)*n.y>FORT.apothem+m)return false;return true}
const RIVER_DEFS=[
 // All bridges stay at their existing positions and run vertically across
 // the mostly horizontal rivers. Their road approaches line up north-to-south.
 {y:1010,bridges:[{x:1311,y:1010,angle:0},{x:3089,y:1010,angle:0}]},
 {y:2590,bridges:[{x:956,y:2590,angle:0},{x:3444,y:2590,angle:0}]}
];
function riverCurvePoints(r){
 const out=[];
 const curves=[
  [[-80,r.y-25],[760,r.y+65],[1450,r.y-78],[2200,r.y-8]],
  [[2200,r.y-8],[2950,r.y+62],[3660,r.y-68],[4480,r.y+18]]
 ];
 for(const c of curves)for(let i=0;i<=70;i++){
  if(out.length&&i===0)continue;
  const t=i/70,u=1-t;
  out.push({x:u*u*u*c[0][0]+3*u*u*t*c[1][0]+3*u*t*t*c[2][0]+t*t*t*c[3][0],y:u*u*u*c[0][1]+3*u*u*t*c[1][1]+3*u*t*t*c[2][1]+t*t*t*c[3][1]});
 }
 return out;
}
const RIVER_LINES=RIVER_DEFS.map(r=>riverCurvePoints(r));
function riverYAtX(points,x){
 let best=points[0],bd=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,t=clamp((x-a.x)/(dx||1),0,1),px=a.x+dx*t,d=Math.abs(px-x);
  if(d<bd){bd=d;best={x:px,y:a.y+(b.y-a.y)*t}}
 }
 return best.y;
}
function riverBridgePass(x,y,r){return r.bridges.some(b=>{const a=b.angle||0,dx=x-b.x,dy=y-b.y,lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a);return Math.abs(lx)<30&&Math.abs(ly)<76})}
function riverNearestPoint(points,x,y){
 let best=null,bestD=Infinity;
 for(let j=1;j<points.length;j++){
  const a=points[j-1],b=points[j],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(l||1),0,1);
  const px=a.x+t*dx,py=a.y+t*dy,d=Math.hypot(x-px,y-py);
  if(d<bestD){bestD=d;best={x:px,y:py,tx:dx/(Math.sqrt(l)||1),ty:dy/(Math.sqrt(l)||1),distance:d}}
 }
 return best;
}
function riverDistance(x,y){
 let best=Infinity;
 for(const pts of RIVER_LINES){const p=riverNearestPoint(pts,x,y);if(p&&p.distance<best)best=p.distance}
 return best;
}
function riverBlocked(x,y){
 for(let i=0;i<RIVER_DEFS.length;i++){
  const r=RIVER_DEFS[i];if(riverBridgePass(x,y,r))continue;
  const p=riverNearestPoint(RIVER_LINES[i],x,y);
  if(p&&p.distance<64)return true;
 }
 return false;
}
function riverRouteTarget(from,to){
 for(let i=0;i<RIVER_DEFS.length;i++){
  const r=RIVER_DEFS[i];
  if(riverBridgePass(from.x,from.y,r))continue;
  const a=riverNearestPoint(RIVER_LINES[i],from.x,from.y),b=riverNearestPoint(RIVER_LINES[i],to.x,to.y);
  if(!a||!b)continue;
  const crossA=a.tx*(from.y-a.y)-a.ty*(from.x-a.x),crossB=b.tx*(to.y-b.y)-b.ty*(to.x-b.x);
  if(crossA*crossB>=0)continue;
  let bridge=r.bridges[0],best=Infinity;
  for(const candidate of r.bridges){const score=dist(from,candidate)+dist(candidate,to);if(score<best){best=score;bridge=candidate}}
  // The bridge's long axis is its local Y axis. Approach from the bank on the
  // unit's current side, then walk onto the deck before continuing.
  const nx=-Math.sin(bridge.angle||0),ny=Math.cos(bridge.angle||0);
  const side=Math.sign((from.x-bridge.x)*nx+(from.y-bridge.y)*ny)||1;
  const approach={x:bridge.x+nx*side*88,y:bridge.y+ny*side*88};
  return dist(from,approach)>9?approach:bridge;
 }
 return to;
}
function moveLand(u,dx,dy){
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5)),sx=dx/steps,sy=dy/steps;
 for(let i=0;i<steps;i++){
  const nx=clamp(u.x+sx,12,WORLD.w-12),ny=clamp(u.y+sy,12,WORLD.h-12);
  // Try the real movement vector first so diagonal bridges remain traversable.
  if(!riverBlocked(nx,ny)){u.x=nx;u.y=ny;continue}
  // If water blocks the diagonal, slide along the bank instead of freezing.
  if(!riverBlocked(nx,u.y))u.x=nx;
  if(!riverBlocked(u.x,ny))u.y=ny;
 }
}
function moveToward(u,p,len){
 const goal=riverRouteTarget(u,p),d=dist(u,goal),a=angle(u,goal),step=Math.min(len,d);
 moveLand(u,Math.cos(a)*step,Math.sin(a)*step);return a;
}
function stepTo(u,p,len){return moveToward(u,p,len)}
// Friendly troops cross the wall line through a gate (or a breach). Returns the next point to walk to.
function routeTo(from,to){
 const fi=behindWalls(from),ti=behindWalls(to);
 if(fi===ti)return to;
 let best=null,bs=Infinity;
 for(const w of walls){if(w.kind!=='gate'&&w.hp>0)continue;const s=Math.hypot(from.x-w.mx,from.y-w.my)+Math.hypot(w.mx-to.x,w.my-to.y);if(s<bs){bs=s;best=w}}
 if(!best)return to;
 // line up with the gate on our own side first, then walk straight through it
 const lateral=(from.x-best.mx)*(-best.ny)+(from.y-best.my)*best.nx;
 const inner={x:best.mx-best.nx*50,y:best.my-best.ny*50},outer={x:best.mx+best.nx*60,y:best.my+best.ny*60};
 if(fi)return Math.abs(lateral)>22?inner:outer;
 return Math.abs(lateral)>22?outer:inner;
}
// ---------- enemy camps ----------
const CAMP_SITES=[
 {faction:'france',name:'FRENCH CAMP',x:420,y:520},
 {faction:'spain',name:'SPANISH CAMP',x:3980,y:520},
 {faction:'portugal',name:'PORTUGUESE CAMP',x:420,y:3080},
 {faction:'england',name:'ENGLISH CAMP',x:3980,y:3080}
];
const CAMP_HP=600,CAMP_R=80,CAMP_GARRISON=5;
function addCampGuard(camp,i){
 const a=rand(0,Math.PI*2),r=rand(55,105),type=i%2?'swordsman':'rifleman',e=makeSoldier(camp.x+Math.cos(a)*r,camp.y+Math.sin(a)*r,camp.faction,type,false);
 e.hp=e.max=62;e.campGuard=true;e.camp=camp;e.home={x:e.x,y:e.y};enemies.push(e);return e;
}
function buildCamps(){
 return CAMP_SITES.map((s,k)=>{const camp={id:k,faction:s.faction,name:s.name,x:s.x,y:s.y,r:CAMP_R,hp:CAMP_HP,max:CAMP_HP,destroyed:false,flash:0,respawn:20};for(let i=0;i<CAMP_GARRISON-1;i++)addCampGuard(camp,i);return camp});
}
function damageCamp(c,amount){
 if(c.destroyed)return;
 c.hp=Math.max(0,c.hp-amount);c.flash=.14;
 for(let i=0;i<3;i++)particles.push({x:c.x+rand(-40,40),y:c.y+rand(-40,40),vx:rand(-50,50),vy:rand(-70,-10),life:rand(.3,.7),max:.7,color:i%2?'#7d6a4a':'#c9b88a',r:rand(2,4)});
 if(c.hp>0)return;
 c.destroyed=true;c.destroyedAt=elapsed;score+=500;
 for(let i=0;i<46;i++)particles.push({x:c.x+rand(-70,70),y:c.y+rand(-70,70),vx:rand(-120,120),vy:rand(-150,-10),life:rand(.6,1.6),max:1.6,color:i%3?'#d9803a':'#4a4338',r:rand(2,7)});
 for(const e of enemies)if(e.camp===c&&e.hp>0)e.hp=0;
 const left=camps.filter(k=>!k.destroyed).length;
 if(left===0){banner('ALL ENEMY CAMPS DESTROYED');toast('Victory is yours!');victoryTimer=3}
 else{banner(c.name+' DESTROYED');toast(left+(left===1?' enemy camp remains':' enemy camps remain'))}
}
function campGuardAI(e,dt){
 let t=null,bd=300;
 for(const f of [player,...escorts]){if(f.hp<=0)continue;const d=dist(e,f);if(d<bd){bd=d;t=f}}
 if(!t){const hd=dist(e,e.home);if(hd>10){e.dir=angle(e,e.home);stepTo(e,e.home,60*dt)}return}
 e.dir=angle(e,t);const d=dist(e,t);
 if(e.type==='rifleman'){if(d>200)stepTo(e,t,50*dt);else if(e.attack<=0){shoot(e,e.dir,'enemy',13,390);e.attack=1.65}}
 else if(d>31)stepTo(e,t,82*dt);
 else if(e.attack<=0){if(t===player){if(player.invuln<=0){player.hp-=15;player.invuln=.48}}else t.hp-=19;e.attack=.78}
}
function updateCamps(dt){
 for(const c of camps){
  c.flash=Math.max(0,c.flash-dt);if(c.destroyed)continue;
  c.respawn-=dt;
  if(c.respawn<=0){c.respawn=20;const n=enemies.filter(e=>e.camp===c&&e.hp>0).length;if(n<CAMP_GARRISON&&dist(player,c)>420)addCampGuard(c,n)}
 }
}
function victory(){
 state='victory';ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');
 const alive=guards.filter(g=>g.hp>0).length+escorts.filter(g=>g.hp>0).length+defenders.filter(g=>g.hp>0).length;
 const total=guards.length+escorts.length+defenders.length;
 $('victory-score').textContent=score.toLocaleString();$('victory-waves').textContent=wave;$('victory-soldiers').textContent=alive+'/'+total;
 const mins=Math.floor(elapsed/60),secs=Math.floor(elapsed%60);$('victory-time').textContent=mins+':'+String(secs).padStart(2,'0');
 $('victory-cinematic').classList.remove('hidden');$('victory-results').classList.add('hidden');$('victory-screen').classList.remove('hidden');
 const video=$('victory-video');
 video.pause();video.currentTime=0;video.muted=true;$('victory-sound').textContent='ENABLE SOUND';
 video.play().catch(()=>{toast('Press play on the victory video to start it')});
}
function showVictoryResults(){if(state!=='victory')return;$('victory-video').pause();$('victory-cinematic').classList.add('hidden');$('victory-results').classList.remove('hidden')}

const unitRadius=e=>e.type==='elephant'?22:e.type==='cavalry'?13:9;
function damageWall(w,amount,x=w.mx,y=w.my){
 if(w.hp<=0)return;
 w.hp=Math.max(0,w.hp-amount);w.flash=.16;
 for(let i=0;i<(w.hp<=0?16:3);i++)particles.push({x:x+rand(-6,6),y:y+rand(-6,6),vx:rand(-60,60),vy:rand(-60,60),life:rand(.3,.7),max:.7,color:i%2?'#b9ad8e':'#7d7358',r:rand(1.5,4)});
 if(w.hp<=0&&!w.down){w.down=true;toast(w.label.toUpperCase()+' BREACHED!')}
}
function repairWalls(){
 let fixed=0,rebuilt=0;const fortBefore=fortress;fortress=Math.min(100,fortress+8);
 for(const w of walls){if(w.hp<=0){w.hp=w.max*.4;w.down=false;rebuilt++}else if(w.hp<w.max){w.hp=Math.min(w.max,w.hp+w.max*.35);fixed++}}
 if(rebuilt)toast('Masons rebuild breaches · fortress reinforced');else if(fixed||fortress>fortBefore)toast('Masons repair the walls · fortress reinforced')
}
// Where an enemy outside the fort should go: the nearest weak point, or straight through an existing breach.
function assaultPlan(e){
 let best=null,bs=Infinity;
 for(const w of walls){
  let pt,score;
  if(w.hp<=0){pt={x:w.gx,y:w.gy};score=dist(e,pt)*.45}
  else{const c=wallContact(w,e);pt=c;score=c.d*(w.kind==='gate'?.6:w.kind==='bastion'?1.8:1)}
  if(w.id===e.wallId)score*=.8;
  if(score<bs){bs=score;best={w,pt,breach:w.hp<=0}}
 }
 return best;
}
function siege(e,dt,rad){
 const plan=assaultPlan(e);e.wallId=plan.w.id;
 e.dir=Math.atan2(plan.pt.y-e.y,plan.pt.x-e.x);
 const speed=e.type==='elephant'?42:e.type==='cavalry'?105:82;
 const move=()=>moveToward(e,plan.pt,speed*dt);
 if(plan.breach){move();return}
 const c=wallContact(plan.w,e);
 if(c.sep>rad+8)move();
 else if(e.attack<=0){damageWall(plan.w,SIEGE_DMG[e.type][plan.w.kind],c.x,c.y);e.attack=e.type==='swordsman'?.78:1.05}
}
function makeSoldier(x,y,faction,type='rifleman',friendly=false,elite=false){return {id:++idCounter,x,y,vx:0,vy:0,dir:0,hp:type==='elephant'?210:elite?145:type==='cavalry'?85:55,max:type==='elephant'?210:elite?145:type==='cavalry'?85:55,faction,type,friendly,elite,attack:rand(.2,1),reload:rand(.2,1.5),flash:0,dead:false,charge:0}}
function reset(){
 camera.x=clamp(WORLD.cx,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(WORLD.cy,vh/(2*zoom),WORLD.h-vh/(2*zoom));
 wave=0;score=0;fortress=100;elapsed=0;spawnClock=0;waveGap=2;
 enemies=[];bullets=[];particles=[];villagers=[];guards=[];escorts=[];defenders=[];idCounter=0;
 const wallCount=clamp(Math.floor(Number($('wall-count').value)||0),0,40);
 const guardCount=clamp(Math.floor(Number($('guard-count').value)||0),0,40);
 const activeCount=clamp(Math.floor(Number($('active-count').value)||0),0,40);
 walls=buildWalls();waveActive=false;victoryTimer=0;camps=buildCamps();
 wallPosts(wallCount).forEach((p,i)=>{
  const g=makeSoldier(p.x,p.y,'couto','rifleman',true,true);g.slot=i;g.home={x:p.x,y:p.y};g.dir=p.a;guards.push(g);
 });
 for(let i=0;i<guardCount;i++){
  const a=-Math.PI/2+i*Math.PI*2/Math.max(1,guardCount),p={x:WORLD.cx+Math.cos(a)*78,y:WORLD.cy+Math.sin(a)*78};
  const g=makeSoldier(WORLD.cx+rand(-12,12),WORLD.cy+rand(-12,12),'couto','swordsman',true,false);
  g.followSlot=i;g.attack=rand(.1,.7);escorts.push(g);
 }
 activePosts(activeCount).forEach(p=>{
  const d=makeSoldier(p.x,p.y,'couto','swordsman',true,false);
  d.post={x:p.x,y:p.y};d.dir=p.a;d.attack=rand(.1,.8);d.line=p.line;defenders.push(d);
 });
 player={x:WORLD.cx,y:WORLD.cy+65,vx:0,vy:0,dir:-Math.PI/2,hp:100,max:100,ammo:8,maxAmmo:8,reload:0,fire:0,sword:0,invuln:0};
 for(let i=0;i<15;i++)villagers.push({x:WORLD.cx+rand(-205,205),y:WORLD.cy+rand(-165,165),dir:rand(0,6.28),speed:rand(8,17),panic:0});
 ui.wave.textContent='0';ui.score.textContent='0';updateHud()
}
function updateCampObjectives(){const remaining=camps.filter(c=>!c.destroyed).length;const count=$('camp-objective-count');if(count)count.textContent=remaining+' / '+camps.length+' REMAINING';for(const c of camps){const row=$('camp-objective-'+c.id);if(!row)continue;const ratio=c.destroyed?0:clamp(c.hp/c.max,0,1);row.classList.toggle('destroyed',c.destroyed);const bar=row.querySelector('.camp-objective-fill');if(bar)bar.style.width=(ratio*100)+'%';const value=row.querySelector('.camp-objective-value');if(value)value.textContent=c.destroyed?'DESTROYED':Math.ceil(ratio*100)+'%';}}
function updateHud(){updateCampObjectives();const playerRatio=clamp(player.hp/player.max,0,1),fortRatio=clamp(fortress/100,0,1);ui.health.style.width=(playerRatio*100)+'%';ui.health.style.background=playerRatio>.55?'#75ad69':playerRatio>.25?'#d1b46c':'#c64d3d';ui.healthText.textContent=Math.ceil(player.hp)+'%';ui.fort.style.width=(fortRatio*100)+'%';ui.fort.style.background=fortRatio>.55?'#d1b46c':fortRatio>.25?'#df9148':'#c64d3d';ui.fortText.textContent=Math.ceil(fortress)+'%';ui.ammo.textContent=player.ammo+' / '+player.maxAmmo;ui.reload.textContent=player.reload>0?'RELOADING':'READY';ui.guards.textContent=(guards.filter(g=>g.hp>0).length+escorts.filter(g=>g.hp>0).length+defenders.filter(g=>g.hp>0).length)+'/'+(guards.length+escorts.length+defenders.length);ui.wave.textContent=wave;ui.score.textContent=score;const up=walls.filter(w=>w.hp>0).length;ui.walls.textContent=up+'/'+walls.length;ui.walls.style.color=up<walls.length?'#f0a58f':'';const cl=camps.filter(c=>!c.destroyed).length;ui.camps.textContent=cl+'/'+camps.length}
function start(){$('victory-video').pause();$('victory-video').currentTime=0;reset();state='playing';ui.menu.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');$('victory-screen').classList.add('hidden');ui.orders.classList.add('hidden');ui.hud.classList.remove('hidden');ui.mobile.classList.remove('hidden');banner('DEFEND THE STAR FORTRESS');toast('The gates open for you: leave the fort and destroy the enemy camps');last=performance.now()}
function pause(){if(state==='playing'){state='paused';ui.pause.classList.remove('hidden')}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden');last=performance.now()}}function mainMenu(){$('victory-video').pause();$('victory-video').currentTime=0;state='menu';ui.menu.classList.remove('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');$('victory-screen').classList.add('hidden');ui.orders.classList.add('hidden');ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');last=performance.now()}
function gameOver(){state='over';$('over-eyebrow').textContent='THE FORTRESS HAS FALLEN';$('over-title').textContent='DEFEAT';ui.over.classList.remove('hidden');ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');$('final-stats').textContent='Waves held: '+wave+' · Score: '+score+' · Defenders remaining: '+(guards.filter(g=>g.hp>0).length+escorts.filter(g=>g.hp>0).length+defenders.filter(g=>g.hp>0).length)+'/'+(guards.length+escorts.length+defenders.length)}
function reload(){if(player.reload<=0&&player.ammo<player.maxAmmo){player.reload=1.25;toast('Reloading musket…')}}
function shoot(from,dir,faction,damage=24,speed=520,siege=false){bullets.push({x:from.x+Math.cos(dir)*17,y:from.y+Math.sin(dir)*17,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,life:1.7,faction,damage,r:siege?5:4,siege});for(let i=0;i<4;i++)particles.push({x:from.x+Math.cos(dir)*12,y:from.y+Math.sin(dir)*12,vx:rand(-35,35)+Math.cos(dir)*rand(15,55),vy:rand(-35,35)+Math.sin(dir)*rand(15,55),life:rand(.12,.28),max:.28,color:'#f4d58c',r:rand(1,3)})}
function sword(){if(player.sword>0)return;player.sword=.42;let hit=0;for(const e of enemies){if(e.hp>0&&dist(player,e)<58&&Math.abs(Math.atan2(Math.sin(angle(player,e)-player.dir),Math.cos(angle(player,e)-player.dir)))<1.25){e.hp-=48;hit++ ;if(e.hp<=0)kill(e)}}for(const c of camps){if(!c.destroyed&&dist(player,c)<c.r+40){damageCamp(c,70);hit++}}if(hit)toast('Sword strike!')}
function spawnWave(){
 const alive=camps.filter(c=>!c.destroyed);if(!alive.length)return;
 wave++;ui.wave.textContent=wave;banner('ENEMY WAVE '+wave);
 // fewer camps standing means smaller waves
 const count=Math.max(4,Math.ceil((5+wave*3)*alive.length/camps.length));
 for(let i=0;i<count;i++){
  const camp=alive[i%alive.length];let type='rifleman';const roll=Math.random();
  if(wave>=7&&roll<.055)type='elephant';else if(wave>=3&&roll<.17)type='cavalry';else if(roll<(wave>=2?.43:.3))type='swordsman';
  const e=makeSoldier(camp.x+rand(-90,90),camp.y+rand(-90,90),camp.faction,type,false);e.hp+=Math.floor(wave*.6);e.max=e.hp;enemies.push(e);
 }
 if(wave>=4&&wave%2===0){const camp=alive[Math.floor(rand(0,alive.length))],a=Math.atan2(camp.y-WORLD.cy,camp.x-WORLD.cx),cr=rand(580,640),e=makeSoldier(WORLD.cx+Math.cos(a)*cr+rand(-70,70),WORLD.cy+Math.sin(a)*cr+rand(-70,70),camp.faction,'cannon',false);e.hp=130;e.max=130;enemies.push(e)}
 spawnClock=0;waveActive=true;
}
function kill(e){if(e.dead)return;e.dead=true;score+=e.type==='elephant'?120:e.type==='cavalry'?55:25;for(let i=0;i<9;i++)particles.push({x:e.x,y:e.y,vx:rand(-80,80),vy:rand(-80,80),life:rand(.25,.65),max:.65,color:i%2?'#b8a27a':'#6e3d32',r:rand(2,5)})}
function nearestEnemy(p,max=900){let best=null,bd=max;for(const e of enemies){if(e.hp<=0)continue;const d=dist(p,e);if(d<bd){bd=d;best=e}}return best}
// Reserves hold their line: they only react to enemies inside the fort or pressing against its walls.
function nearestThreat(p,max=900){let best=null,bd=max;for(const e of enemies){if(e.hp<=0||Math.hypot(e.x-WORLD.cx,e.y-WORLD.cy)>440)continue;const d=dist(p,e);if(d<bd){bd=d;best=e}}return best}
function update(dt){if(state!=='playing')return;if(victoryTimer>0){victoryTimer-=dt;if(victoryTimer<=0){victory();return}}elapsed+=dt;toastTimer=Math.max(0,toastTimer-dt);if(!toastTimer)ui.toast.classList.remove('show');bannerTimer=Math.max(0,bannerTimer-dt);if(!bannerTimer)ui.banner.classList.remove('show');
const mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+mobileMove.x,my=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+mobileMove.y;const ml=Math.hypot(mx,my)||1;player.vx=mx/ml*190;player.vy=my/ml*190;moveLand(player,player.vx*dt,player.vy*dt);pushOutOfWalls(player,12,true);
const aim=worldPoint(mouse.x,mouse.y);if(mouse.x||mouse.y)player.dir=angle(player,aim);if(touchFire){const target=nearestEnemy(player,1000);if(target)player.dir=angle(player,target);else{const camp=camps.filter(c=>!c.destroyed).sort((a,b)=>dist(player,a)-dist(player,b))[0];if(camp)player.dir=angle(player,camp)}}player.fire=Math.max(0,player.fire-dt);player.sword=Math.max(0,player.sword-dt);player.invuln=Math.max(0,player.invuln-dt);
if(player.reload>0){player.reload-=dt;if(player.reload<=0){player.ammo=player.maxAmmo;toast('Musket reloaded')}}if((mouse.down||touchFire)&&player.fire<=0&&player.reload<=0){if(player.ammo>0){shoot(player,player.dir,'couto',40,760);player.ammo--;player.fire=.28}else reload()}
if(cannonCooldown>0)cannonCooldown-=dt;
if(!enemies.some(e=>!e.campGuard)){if(waveActive){waveActive=false;repairWalls()}spawnClock+=dt;if(spawnClock>waveGap)spawnWave()}else spawnClock=0;
for(const w of walls)w.flash=Math.max(0,w.flash-dt);updateCamps(dt);
for(const g of guards){if(g.hp<=0)continue;const target=nearestEnemy(g,215);if(target){g.dir=angle(g,target);g.attack-=dt;if(g.attack<=0){shoot(g,g.dir,'couto',eliteDamage(g),500);g.attack=rand(1.2,2.1)}}else{const dx=g.home.x-g.x,dy=g.home.y-g.y;moveToward(g,g.home,Math.hypot(dx,dy)*Math.min(1,dt*1.5))}}
for(let i=0;i<escorts.length;i++){
 const g=escorts[i];if(g.hp<=0)continue;
 const a=-Math.PI/2+i*Math.PI*2/Math.max(1,escorts.length),slot={x:player.x+Math.cos(a)*48,y:player.y+Math.sin(a)*48};
 const target=nearestEnemy(g,185);let camp=null;
 if(!target)for(const c of camps){if(!c.destroyed&&dist(g,c)<c.r+45&&dist(player,c)<c.r+260){camp=c;break}}
 if(target){const dd=dist(g,target);g.dir=angle(g,target);if(dd>29)stepTo(g,routeTo(g,target),105*dt);else{g.attack-=dt;if(g.attack<=0){target.hp-=34;g.attack=.68;if(target.hp<=0)kill(target)}}}
 else if(camp){g.dir=angle(g,camp);g.attack-=dt;if(g.attack<=0){damageCamp(camp,40);g.attack=.68}}
 else{const dd=dist(g,slot);if(dd>13)g.dir=stepTo(g,routeTo(g,slot),Math.min(145*dt,dd))}
}
for(const d of defenders){
 if(d.hp<=0)continue;
 const target=nearestThreat(d,430);
 if(target){
  const dd=dist(d,target);d.dir=angle(d,target);
  if(dd>38)moveToward(d,target,86*dt)
  else{d.attack-=dt;if(d.attack<=0){target.hp-=30;d.attack=.72;if(target.hp<=0)kill(target)}}
 }else if(d.post){
  const pd=dist(d,d.post);if(pd>4)d.dir=moveToward(d,d.post,Math.min(86*dt,pd))
 }
}
for(const e of enemies){
 if(e.hp<=0)continue;
 e.attack-=dt;
 if(e.campGuard){campGuardAI(e,dt);continue}
 const target=nearestFriendly(e)||{x:WORLD.cx,y:WORLD.cy};
 const d=dist(e,target);e.dir=angle(e,target);
 if(e.type==='cannon'){
  // siege gun: shells are stopped by the walls and batter them
  if(e.attack<=0&&d<420){shoot(e,e.dir,'enemy',30,285,true);e.attack=3.1}
  continue;
 }
 const rad=unitRadius(e),inside=insideFort(e),coreDistance=Math.hypot(e.x-WORLD.cx,e.y-WORLD.cy);
 if(coreDistance<145&&e.attack<=0){fortress=Math.max(0,fortress-(e.type==='elephant'?8:e.type==='cavalry'?4.5:2.4));e.attack=1.0;continue;}
 // melee troops outside the fort cannot reach the defenders: they must break a wall, gate or bastion first
 if(e.type!=='rifleman'&&!inside&&behindWalls(target)){siege(e,dt,rad);continue}
 if(e.type==='elephant'||e.type==='cavalry'){
  const speed=e.type==='elephant'?42:105;
  if(d>34)moveToward(e,target,speed*dt)
  else if(e.attack<=0){if(target===player){if(player.invuln<=0){player.hp-=e.type==='elephant'?22:15;player.invuln=.45}}else if(target.hp!==undefined)target.hp-=e.type==='elephant'?32:20;e.attack=1.05}
  continue;
 }
 if(e.type==='swordsman'){
  if(d>31)moveToward(e,target,82*dt)
  else if(e.attack<=0){if(target===player){if(player.invuln<=0){player.hp-=15;player.invuln=.48}}else if(target.hp!==undefined)target.hp-=19;e.attack=.78}
  continue;
 }
 // Musketeers keep a firing distance and shoot at the closest defender.
 // Pressed against the walls they fire from there: the walls give the defenders cover.
 const atWalls=!inside&&coreDistance<440&&d<450;
 if(d>190&&!atWalls){const sp=coreDistance>700?85:47;moveToward(e,target,sp*dt)}
 else if(e.attack<=0){shoot(e,e.dir,'enemy',13,390);e.attack=1.65}
}
// intact walls, gates and bastions are solid
for(const e of enemies)if(e.hp>0&&e.type!=='cannon')pushOutOfWalls(e,unitRadius(e));
for(const g of escorts)if(g.hp>0)pushOutOfWalls(g,9,true);
for(const d of defenders)if(d.hp>0)pushOutOfWalls(d,9,true);
for(const e of enemies){if(e.hp<=0&&!e.dead)kill(e)}enemies=enemies.filter(e=>e.hp>0);
for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(riverBlocked(b.x,b.y)){b.life=0;continue}if(b.faction==='enemy'){if(dist(b,player)<17&&player.invuln<=0){player.hp-=b.damage;player.invuln=.4;b.life=0;continue}for(const g of [...guards,...escorts,...defenders]){if(g.hp>0&&dist(b,g)<15){g.hp-=b.damage;b.life=0;break}}if(b.life>0)for(const w of walls){if(w.hp>0&&wallContact(w,b).sep<(b.siege?6:3)){damageWall(w,b.siege?55:b.damage*.08,b.x,b.y);b.life=0;break}}}else{for(const c of camps){if(!c.destroyed&&dist(b,c)<c.r*.8){damageCamp(c,b.damage*.85);b.life=0;break}}if(b.life>0)for(const e of enemies){if(e.hp>0&&dist(b,e)<(e.type==='elephant'?27:14)){e.hp-=b.damage;b.life=0;break}}}}bullets=bullets.filter(b=>b.life>0);
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt}particles=particles.filter(p=>p.life>0);
for(const v of villagers){v.panic=Math.max(0,v.panic-dt);if(enemies.some(e=>dist(v,e)<210))v.panic=1.5;if(v.panic){v.x+=Math.cos(v.dir+Math.PI)*v.speed*2*dt;v.y+=Math.sin(v.dir+Math.PI)*v.speed*2*dt}else{v.dir+=rand(-.4,.4)*dt;v.x+=Math.cos(v.dir)*v.speed*dt;v.y+=Math.sin(v.dir)*v.speed*dt}v.x=clamp(v.x,WORLD.cx-205,WORLD.cx+205);v.y=clamp(v.y,WORLD.cy-165,WORLD.cy+165)}
if(player.hp<=0||fortress<=0)gameOver();camera.x=clamp(player.x,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(player.y,vh/(2*zoom),WORLD.h-vh/(2*zoom));updateHud()}
function eliteDamage(){return 24}
function nearestFriendly(e){let best=player,bd=dist(e,player);for(const g of [...guards,...escorts,...defenders]){if(g.hp>0&&dist(e,g)<bd){best=g;bd=dist(e,g)}}return best}
function onScreen(x,y,m=60){const hw=vw/(2*zoom),hh=vh/(2*zoom);return x>camera.x-hw-m&&x<camera.x+hw+m&&y>camera.y-hh-m&&y<camera.y+hh+m}
function drawTerrainDetails(){
 // Fine, deterministic ground texture: the pattern never flickers between frames.
 for(let i=0;i<620;i++){
  const x=(i*173+61)%WORLD.w,y=(i*293+117)%WORLD.h;
  if(!onScreen(x,y,24))continue;
  const nearFort=Math.hypot(x-WORLD.cx,y-WORLD.cy)<485;
  if(nearFort&&i%3!==0)continue;
  if(i%4===0){
   ctx.strokeStyle=i%8===0?'rgba(191,190,126,.28)':'rgba(38,65,39,.30)';
   ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4+(i%5),y-3-(i%4));ctx.moveTo(x+5,y+2);ctx.lineTo(x+8,y-1);ctx.stroke();
  }else if(i%4===1){
   ctx.fillStyle='rgba(37,48,32,.22)';ctx.beginPath();ctx.ellipse(x,y,5+(i%7),3+(i%4),(i%9)*.3,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='rgba(174,164,121,.18)';ctx.beginPath();ctx.arc(x-2,y-1,1.5,0,Math.PI*2);ctx.fill();
  }else if(i%4===2){
   ctx.fillStyle='rgba(202,185,137,.18)';ctx.beginPath();ctx.arc(x,y,1.2+(i%3),0,Math.PI*2);ctx.fill();
  }
 }
 // Broad, softly blended clearings give the countryside a natural patchwork.
 for(let i=0;i<18;i++){
  const x=(i*613+330)%WORLD.w,y=(i*887+210)%WORLD.h;
  if(!onScreen(x,y,230))continue;
  ctx.fillStyle=i%2?'rgba(167,151,96,.075)':'rgba(28,57,36,.10)';
  ctx.beginPath();ctx.ellipse(x,y,105+(i%4)*22,58+(i%3)*17,(i%7)*.31,0,Math.PI*2);ctx.fill();
 }
}
function drawTerrain(){ctx.fillStyle='#526b43';ctx.fillRect(0,0,vw,vh);ctx.save();ctx.translate(vw/2,vh/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
 // Layered meadow colours, grass tufts and small stones make the open field feel lived-in.
 ctx.fillStyle='#65784a';for(let i=0;i<260;i++){const x=(i*197)%WORLD.w,y=(i*317)%WORLD.h;if(!onScreen(x,y,50))continue;const rx=12+(i*17)%24,ry=7+(i*11)%12,rotation=((i*13)%60)/10;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);ctx.fill()}
 drawTerrainDetails();
 // Cart roads meet the fortress exits and cross each river exactly along
 // the fixed bridge deck axis. Bridge positions and bridge orientation are unchanged.
 const routes=[];
 for(const river of RIVER_DEFS)for(const b of river.bridges){
  let gate=GATE_ANGLES[0],gateScore=Infinity;
  for(const angle of GATE_ANGLES){
   const gx=WORLD.cx+Math.cos(angle)*430,gy=WORLD.cy+Math.sin(angle)*430;
   const d=Math.hypot(gx-b.x,gy-b.y);
   if(d<gateScore){gateScore=d;gate=angle}
  }
  let camp=CAMP_SITES[0],campScore=Infinity;
  for(const c of CAMP_SITES){const d=Math.hypot(c.x-b.x,c.y-b.y);if(d<campScore){campScore=d;camp=c}}
  const start={x:WORLD.cx+Math.cos(gate)*430,y:WORLD.cy+Math.sin(gate)*430};
  const finish={x:camp.x,y:camp.y};
  // The bridge's deck runs along its local Y axis. Use that exact axis for
  // both road approaches so the road cannot cut diagonally across the deck.
  const axis={x:-Math.sin(b.angle||0),y:Math.cos(b.angle||0)};
  const p1={x:b.x-axis.x*88,y:b.y-axis.y*88};
  const p2={x:b.x+axis.x*88,y:b.y+axis.y*88};
  const startFirst=Math.hypot(start.x-p1.x,start.y-p1.y)<=Math.hypot(start.x-p2.x,start.y-p2.y);
  const entry=startFirst?p1:p2,exit=startFirst?p2:p1;
  routes.push([start,entry,exit,finish]);
 }
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const route of routes){
  ctx.beginPath();ctx.moveTo(route[0].x,route[0].y);
  for(let i=1;i<route.length;i++)ctx.lineTo(route[i].x,route[i].y);
  ctx.strokeStyle='#66563b';ctx.lineWidth=38;ctx.stroke();
  ctx.strokeStyle='#a99a70';ctx.lineWidth=28;ctx.stroke();
  ctx.strokeStyle='rgba(226,207,157,.52)';ctx.lineWidth=2;ctx.setLineDash([10,15]);ctx.stroke();
  ctx.setLineDash([]);
 }
 ctx.lineCap='butt';ctx.lineJoin='miter';
 drawRiversAndBridges();
 drawVillage(1000,820);drawVillage(2300,1700);drawVillage(1500,2060);
 for(const c of camps)drawEnemyCamp(c);
 drawTrees();drawFortress();ctx.restore()}
function drawRiverPath(r){
 const y=r.y;ctx.beginPath();ctx.moveTo(-80,y-25);
 ctx.bezierCurveTo(760,y+65,1450,y-78,2200,y-8);
 ctx.bezierCurveTo(2950,y+62,3660,y-68,4480,y+18);
}
function drawRiversAndBridges(){
 for(const r of RIVER_DEFS){
  ctx.lineCap='round';ctx.lineJoin='round';
  // Soft shadow, layered sandy banks and a deep blue-green water channel.
  drawRiverPath(r);ctx.strokeStyle='rgba(20,28,23,.30)';ctx.lineWidth=142;ctx.stroke();
  drawRiverPath(r);ctx.strokeStyle='#8b805d';ctx.lineWidth=126;ctx.stroke();
  drawRiverPath(r);ctx.strokeStyle='#b2a078';ctx.lineWidth=112;ctx.stroke();
  drawRiverPath(r);ctx.strokeStyle='#315d62';ctx.lineWidth=98;ctx.stroke();
  drawRiverPath(r);ctx.strokeStyle='#477b80';ctx.lineWidth=82;ctx.stroke();
  drawRiverPath(r);ctx.strokeStyle='rgba(25,65,72,.62)';ctx.lineWidth=54;ctx.stroke();
  // Irregular ripples and glints make this read as water, not a road.
  for(let k=0;k<34;k++){
   const x=80+k*128+(k%3)*17,cy=riverYAtX(RIVER_LINES[RIVER_DEFS.indexOf(r)],x);
   if(!onScreen(x,cy,90))continue;
   ctx.strokeStyle=k%2?'rgba(190,220,207,.38)':'rgba(18,53,61,.32)';
   ctx.lineWidth=k%3===0?3:1.5;ctx.beginPath();
   ctx.moveTo(x-15,cy+Math.sin(k*1.7)*24);ctx.quadraticCurveTo(x,cy+Math.cos(k*1.2)*18,x+20,cy+Math.sin(k*.8)*22);ctx.stroke();
  }
  // Reeds and stones along the banks, kept clear of bridge decks.
  for(let k=0;k<24;k++){
   const x=110+k*183+(k%2)*31,cy=riverYAtX(RIVER_LINES[RIVER_DEFS.indexOf(r)],x);
   if(!onScreen(x,cy,110)||r.bridges.some(b=>Math.abs(x-b.x)<95))continue;
   for(const side of [-1,1]){
    const rx=x+(k%3-1)*7,ry=cy+side*(61+(k%4)*3);
    ctx.strokeStyle='#52633c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rx,ry+7);ctx.lineTo(rx-3,ry-5);ctx.moveTo(rx,ry+7);ctx.lineTo(rx+4,ry-7);ctx.stroke();
    ctx.fillStyle='#b3a27b';ctx.beginPath();ctx.arc(rx+8,ry+2,2,0,Math.PI*2);ctx.fill();
   }
  }
  for(const b of r.bridges)drawWoodenBridge(b.x,b.y,b.angle||0);
 }
 ctx.lineCap='butt';ctx.lineJoin='miter';
}
function drawWoodenBridge(x,y,rotation=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation);
 // Narrow stone abutments and a compact timber deck, aligned with the road.
 ctx.fillStyle='rgba(26,31,24,.38)';ctx.fillRect(-39,-70,78,140);
 ctx.fillStyle='#706b58';ctx.fillRect(-36,-67,8,134);ctx.fillRect(28,-67,8,134);
 ctx.fillStyle='#60472e';ctx.fillRect(-29,-67,58,134);
 ctx.fillStyle='#9a7447';ctx.fillRect(-25,-67,50,134);
 for(let yy=-62;yy<=62;yy+=13){
  ctx.fillStyle=(yy/13)%2?'#a98553':'#8d6b42';ctx.fillRect(-24,yy,48,10);
  ctx.strokeStyle='rgba(54,39,25,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-23,yy+10);ctx.lineTo(23,yy+10);ctx.stroke();
 }
 ctx.strokeStyle='#4e3927';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-29,-58);ctx.lineTo(-29,58);ctx.moveTo(29,-58);ctx.lineTo(29,58);ctx.stroke();
 ctx.strokeStyle='#c09a62';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-29,-48);ctx.lineTo(-29,48);ctx.moveTo(29,-48);ctx.lineTo(29,48);ctx.stroke();
 for(const yy of [-58,-20,20,58]){ctx.fillStyle='#62472d';ctx.fillRect(-32,yy-3,7,8);ctx.fillRect(25,yy-3,7,8)}
 ctx.restore();
}
function drawVillage(x,y){
 // A small fenced hamlet with timber-and-stone cottages, gardens and a shared well.
 ctx.save();ctx.translate(x,y);ctx.scale(1.65,1.65);
 ctx.fillStyle='rgba(25,31,22,.24)';ctx.beginPath();ctx.ellipse(64,43,125,76,-.08,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#5b432b';ctx.lineWidth=5;ctx.setLineDash([12,5]);ctx.strokeRect(-16,-24,172,112);ctx.setLineDash([]);
 ctx.strokeStyle='#b18b54';ctx.lineWidth=2;ctx.strokeRect(-16,-24,172,112);
 // fenced vegetable plots
 for(let p=0;p<2;p++){const px=p?100:0;ctx.fillStyle='#52633a';ctx.fillRect(px,62,42,20);ctx.strokeStyle='#8c7448';ctx.lineWidth=2;ctx.strokeRect(px,62,42,20);for(let k=0;k<4;k++){ctx.strokeStyle='#91a05c';ctx.beginPath();ctx.moveTo(px+5+k*10,64);ctx.lineTo(px+5+k*10,80);ctx.stroke()}}
 for(let i=0;i<5;i++){
  const xx=(i%3)*48,yy=Math.floor(i/3)*42;
  ctx.fillStyle='rgba(24,25,19,.28)';ctx.fillRect(xx-2,yy+4,34,26);
  ctx.fillStyle='#a98a58';ctx.fillRect(xx,yy,30,24);
  ctx.fillStyle='#d0b17a';ctx.beginPath();ctx.moveTo(xx-5,yy+1);ctx.lineTo(xx+15,yy-18);ctx.lineTo(xx+35,yy+1);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#63452f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx-5,yy+1);ctx.lineTo(xx+15,yy-18);ctx.lineTo(xx+35,yy+1);ctx.stroke();
  ctx.fillStyle='#493625';ctx.fillRect(xx+11,yy+10,8,14);ctx.fillStyle='#d6c59a';ctx.fillRect(xx+3,yy+7,5,5);
 }
 // Stone well and water trough
 ctx.fillStyle='#776d56';ctx.beginPath();ctx.arc(78,39,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6f8a83';ctx.beginPath();ctx.arc(78,39,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d1c39b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(78,39,10,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#e6d4a7';ctx.font='bold 11px Cinzel';ctx.textAlign='center';ctx.fillText('VILLAGE',70,112);ctx.restore();
}
function drawEnemyCamp(c){
 if(!onScreen(c.x,c.y,170))return;
 const f=FACTIONS[c.faction],face=Math.atan2(WORLD.cy-c.y,WORLD.cx-c.x);
 if(c.destroyed){
  ctx.fillStyle='rgba(38,32,26,.7)';ctx.beginPath();ctx.arc(c.x,c.y,96,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2b2620';for(let k=0;k<7;k++){const a=k*.9+1,r=18+(k*13)%52;ctx.fillRect(c.x+Math.cos(a)*r-9,c.y+Math.sin(a)*r-4,18,8)}
  ctx.strokeStyle='#4a3f30';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(c.x-4,c.y+22);ctx.lineTo(c.x+26,c.y-4);ctx.stroke();
  ctx.fillStyle='#8c8577';ctx.font='bold 9px Inter';ctx.textAlign='center';ctx.fillText(c.name+' · DESTROYED',c.x,c.y-112);ctx.textAlign='left';return;
 }
 ctx.fillStyle='rgba(72,58,38,.5)';ctx.beginPath();ctx.arc(c.x,c.y,112,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#5a4328';for(let k=0;k<34;k++){const a=k*Math.PI*2/34;if(Math.abs(Math.atan2(Math.sin(a-face),Math.cos(a-face)))<.24)continue;ctx.beginPath();ctx.arc(c.x+Math.cos(a)*100,c.y+Math.sin(a)*100,4.5,0,Math.PI*2);ctx.fill()}
 for(let k=0;k<6;k++){const a=k*Math.PI/3+.3,tx=c.x+Math.cos(a)*50,ty=c.y+Math.sin(a)*50+8;ctx.fillStyle='#d5c69b';ctx.beginPath();ctx.moveTo(tx-16,ty);ctx.lineTo(tx,ty-28);ctx.lineTo(tx+16,ty);ctx.closePath();ctx.fill();ctx.fillStyle=f.a;ctx.fillRect(tx-5,ty-10,10,10)}
 ctx.fillStyle='#3b2f20';ctx.fillRect(c.x-2,c.y-62,4,62);ctx.fillStyle=f.a;ctx.fillRect(c.x+2,c.y-60,32,18);ctx.fillStyle=f.b;ctx.fillRect(c.x+2,c.y-54,32,6);
 ctx.fillStyle='rgba(235,140,60,'+(.7+.3*Math.sin(elapsed*9+c.id))+')';ctx.beginPath();ctx.arc(c.x+14,c.y+20,5,0,Math.PI*2);ctx.fill();
 if(c.flash>0){ctx.fillStyle='rgba(255,236,190,'+Math.min(.55,c.flash*4)+')';ctx.beginPath();ctx.arc(c.x,c.y,c.r+8,0,Math.PI*2);ctx.fill()}
 const r=c.hp/c.max;ctx.fillStyle='#1a1510';ctx.fillRect(c.x-40,c.y-122,80,7);ctx.fillStyle=r>.5?'#c9a24a':r>.25?'#d98a3a':'#c64d3d';ctx.fillRect(c.x-39,c.y-121,78*r,5);
 ctx.fillStyle='#e8dcb8';ctx.font='bold 9px Inter';ctx.textAlign='center';ctx.fillText(c.name,c.x,c.y-129);ctx.textAlign='left';
}
function drawTrees(){
 for(let i=0;i<360;i++){
  const x=(i*271+85)%WORLD.w,y=(i*193+40)%WORLD.h;
  if(!onScreen(x,y,38)||Math.hypot(x-WORLD.cx,y-WORLD.cy)<540||riverDistance(x,y)<92)continue;
  let near=false;for(const s of CAMP_SITES)if(Math.hypot(x-s.x,y-s.y)<190){near=true;break}
  if(near)continue;
  const r=10+(i*7)%11;
  ctx.fillStyle='rgba(24,34,23,.28)';ctx.beginPath();ctx.ellipse(x+3,y+7,r+3,r*.65,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=i%3===0?'#304a30':'#3d5a36';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=i%4===0?'#83905a':'#6c8150';ctx.beginPath();ctx.arc(x-4,y-5,5+(i*3)%6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(181,173,117,.22)';ctx.beginPath();ctx.arc(x-5,y-7,2.2,0,Math.PI*2);ctx.fill();
 }
}
const mixColor=(a,b,t)=>{const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16),m=s=>Math.round(((pa>>s)&255)*(1-t)+((pb>>s)&255)*t);return 'rgb('+m(16)+','+m(8)+','+m(0)+')'};
function drawCracks(w,ratio){
 const n=Math.floor((1-ratio)*8);if(!n)return;
 ctx.strokeStyle='#2a2519';ctx.lineWidth=1.6;ctx.beginPath();
 for(let k=0;k<n;k++){
  const j=(k*37+w.id.charCodeAt(1)*13)%9-4;
  if(w.kind==='bastion'){const a=k*2.4+j*.3;ctx.moveTo(w.x+Math.cos(a)*10,w.y+Math.sin(a)*10);ctx.lineTo(w.x+Math.cos(a+.2)*(w.r-3),w.y+Math.sin(a+.2)*(w.r-3))}
  else{const u=(k+.5)/n,px=w.x1+(w.x2-w.x1)*u,py=w.y1+(w.y2-w.y1)*u,tx=-w.ny,ty=w.nx;ctx.moveTo(px+w.nx*w.half*.9,py+w.ny*w.half*.9);ctx.lineTo(px+tx*j*1.2,py+ty*j*1.2);ctx.lineTo(px-w.nx*w.half*.9+tx*j*2,py-w.ny*w.half*.9+ty*j*2)}
 }
 ctx.stroke();
}
function drawSection(w,ratio){
 const t=w.half*2,line=()=>{ctx.beginPath();ctx.moveTo(w.x1,w.y1);ctx.lineTo(w.x2,w.y2);ctx.stroke()};
 ctx.lineCap='butt';
 if(w.hp<=0){
  ctx.strokeStyle='rgba(235,96,64,'+(.16+.12*Math.sin(elapsed*6))+')';ctx.lineWidth=t+16;line();
  ctx.strokeStyle='#3d372b';ctx.lineWidth=t*.85;ctx.setLineDash([6,10]);line();
  ctx.strokeStyle='#6b6350';ctx.lineWidth=t*.4;ctx.setLineDash([4,16]);line();ctx.setLineDash([]);return;
 }
 ctx.strokeStyle='#2a251b';ctx.lineWidth=t+6;line();
 const dmg=(1-ratio)*.75;
 if(w.kind==='gate'){
  ctx.strokeStyle=mixColor('#8a6338','#4a3623',dmg);ctx.lineWidth=t;line();
  ctx.strokeStyle='#5a4128';ctx.lineWidth=1;line();
  ctx.strokeStyle='#2c2f31';ctx.lineWidth=3;ctx.beginPath();
  for(const u of [.18,.5,.82]){const px=w.x1+(w.x2-w.x1)*u,py=w.y1+(w.y2-w.y1)*u;ctx.moveTo(px+w.nx*w.half,py+w.ny*w.half);ctx.lineTo(px-w.nx*w.half,py-w.ny*w.half)}
  ctx.stroke();
 }else{
  ctx.strokeStyle=mixColor('#aca183','#5d5547',dmg);ctx.lineWidth=t;line();
  ctx.strokeStyle=mixColor('#d6cbaa','#7a705c',dmg);ctx.lineWidth=t*.34;ctx.setLineDash([12,9]);line();ctx.setLineDash([]);
 }
 drawCracks(w,ratio);
 if(w.flash>0){ctx.strokeStyle='rgba(255,236,190,'+Math.min(1,w.flash*3)+')';ctx.lineWidth=t;line()}
}
function drawBastion(w,ratio){
 const dmg=(1-ratio)*.75;
 if(w.hp<=0){
  ctx.fillStyle='rgba(235,96,64,'+(.16+.12*Math.sin(elapsed*6))+')';ctx.beginPath();ctx.arc(w.x,w.y,w.r+10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#3d372b';ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#6b6350';for(let k=0;k<7;k++){const a=k*.9,r=8+(k*7)%24;ctx.fillRect(w.x+Math.cos(a)*r-4,w.y+Math.sin(a)*r-3,8,6)}
  return;
 }
 ctx.fillStyle='#2a251b';ctx.beginPath();ctx.arc(w.x,w.y,w.r+4,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=mixColor('#85887a','#4f4a3e',dmg);ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=mixColor('#d0c4a2','#7a705c',dmg);ctx.lineWidth=5;ctx.setLineDash([10,7]);ctx.beginPath();ctx.arc(w.x,w.y,w.r-5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 drawCannon(w.x,w.y,w.a);
 drawCracks(w,ratio);
 ctx.fillStyle='#3b2f20';ctx.fillRect(w.x-3,w.y-52,3,40);ctx.fillStyle='#244b36';ctx.fillRect(w.x,w.y-52,26,14);ctx.fillStyle='#d8b65f';ctx.fillRect(w.x,w.y-47,26,4);
 if(w.flash>0){ctx.fillStyle='rgba(255,236,190,'+Math.min(.6,w.flash*3)+')';ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,Math.PI*2);ctx.fill()}
}
function drawWalls(){
 for(const w of walls){const ratio=w.hp/w.max;if(w.kind==='bastion')drawBastion(w,ratio);else drawSection(w,ratio)}
 // labels, breach markers and health bars sit on top of the stonework
 ctx.textAlign='center';
 for(const w of walls){
  const off=w.kind==='bastion'?w.r+16:26;
  if(w.hp<=0){ctx.fillStyle='rgba(255,138,106,'+(.65+.35*Math.sin(elapsed*6))+')';ctx.font='bold 10px Inter';ctx.fillText('BREACH',w.mx+w.nx*(off+14),w.my+w.ny*(off+14)+3);continue}
  if(w.kind==='gate'){ctx.fillStyle='#ecd9a0';ctx.font='bold 9px Inter';ctx.fillText('GATE',w.mx+w.nx*44,w.my+w.ny*44+3)}
  if(w.hp<w.max){
   const bx=w.mx+w.nx*off,by=w.my+w.ny*off,r=w.hp/w.max;
   ctx.fillStyle='#1a1510';ctx.fillRect(bx-24,by-3,48,6);ctx.fillStyle=r>.5?'#75ad69':r>.25?'#d1b46c':'#c64d3d';ctx.fillRect(bx-23,by-2,46*r,4);
  }
 }
 ctx.textAlign='left';
}
function drawFortress(){const cx=WORLD.cx,cy=WORLD.cy;
// earthworks and ditch around the walls, crossed by a causeway at every gate
pathPoly(starPoints(cx,cy,500,395));ctx.globalAlpha=.55;ctx.fillStyle='#43533a';ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#493f2d';ctx.lineWidth=24;ctx.stroke();ctx.strokeStyle='#9b8355';ctx.lineWidth=7;ctx.setLineDash([18,10]);ctx.stroke();ctx.setLineDash([]);
ctx.lineCap='round';ctx.strokeStyle='#a99a70';ctx.lineWidth=30;ctx.beginPath();for(const a of GATE_ANGLES){ctx.moveTo(cx+Math.cos(a)*320,cy+Math.sin(a)*320);ctx.lineTo(cx+Math.cos(a)*430,cy+Math.sin(a)*430)}ctx.stroke();ctx.lineCap='butt';
// courtyard inside the curtain walls
pathPoly(BASTION_ANGLES.map(a=>({x:cx+Math.cos(a)*FORT.bastionR,y:cy+Math.sin(a)*FORT.bastionR})));ctx.fillStyle='#9d9677';ctx.fill();
pathPoly(starPoints(cx,cy,255,195));ctx.fillStyle='#a5a080';ctx.fill();ctx.strokeStyle='#c9bd9b';ctx.lineWidth=9;ctx.stroke();
ctx.fillStyle='#68764d';ctx.beginPath();ctx.arc(cx,cy,190,0,Math.PI*2);ctx.fill();
ctx.fillStyle='#9a8d68';ctx.fillRect(cx-48,cy-30,96,60);ctx.fillStyle='#5b4a35';ctx.fillRect(cx-18,cy-30,36,60);ctx.fillStyle='#c4b58d';ctx.fillRect(cx-80,cy+78,160,8);ctx.fillRect(cx-80,cy-86,160,8);
drawWalls();
ctx.fillStyle='#d7c28a';ctx.font='bold 9px Inter';ctx.textAlign='center';ctx.fillText('INNER RESERVE',cx,cy-245);
ctx.fillStyle='#e1d2a9';ctx.font='bold 16px Cinzel';ctx.fillText('COUTO MISTO',cx,cy-135);ctx.font='9px Cinzel';ctx.fillText('THE STAR FORTRESS · INNER KEEP',cx,cy-118);ctx.textAlign='left'}
function drawCannon(x,y,a){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#493d2b';ctx.fillRect(-17,-7,34,14);ctx.fillStyle='#252a25';ctx.fillRect(-22,-4,44,8);ctx.fillStyle='#96784a';ctx.beginPath();ctx.arc(-13,12,8,0,Math.PI*2);ctx.arc(13,12,8,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawCharacter(c,isPlayer=false){const s={x:c.x,y:c.y};if(!onScreen(c.x,c.y,55/zoom))return;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(c.dir||0);const f=FACTIONS[c.faction]||FACTIONS.couto;
if(c.type==='cannon'){drawCannon(0,0,0);ctx.fillStyle=f.a;ctx.fillRect(-4,-14,8,5);ctx.rotate(-(c.dir||0));if(c.hp<c.max){ctx.fillStyle='#251b16';ctx.fillRect(-14,-27,28,3);ctx.fillStyle='#c64d3d';ctx.fillRect(-14,-27,28*c.hp/c.max,3)}ctx.restore();return}
if(c.type==='elephant'){ctx.fillStyle='#756e5c';ctx.beginPath();ctx.ellipse(0,0,29,21,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c8068';ctx.beginPath();ctx.arc(24,-4,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#9b8e75';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(32,0);ctx.quadraticCurveTo(43,12,32,22);ctx.stroke();ctx.fillStyle=f.a;ctx.fillRect(-12,-20,27,12);ctx.fillStyle=f.b;ctx.fillRect(-8,-18,18,4);ctx.fillStyle='#d8c79c';ctx.fillRect(-9,-30,18,12);ctx.restore();return}
if(c.type==='cavalry'){ctx.fillStyle='#5e4934';ctx.beginPath();ctx.ellipse(-5,5,21,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6e543a';ctx.beginPath();ctx.arc(13,0,8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#493b2b';ctx.lineWidth=3;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*10,10);ctx.lineTo(i*11+4,22);ctx.stroke()}ctx.fillStyle=f.a;ctx.beginPath();ctx.arc(0,-10,8,0,Math.PI*2);ctx.fill();ctx.fillStyle=f.b;ctx.fillRect(-5,-14,10,5);ctx.restore();return}
ctx.fillStyle='#18231b';ctx.beginPath();ctx.ellipse(0,3,9,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.friendly&&!c.elite?'#8b6843':f.a;ctx.beginPath();ctx.ellipse(0,0,8,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=f.b;ctx.fillRect(-6,-4,12,4);ctx.fillStyle='#d8b990';ctx.beginPath();ctx.arc(0,-11,6,0,Math.PI*2);ctx.fill();if(c.friendly&&!c.elite){ctx.fillStyle='#b99a5e';ctx.beginPath();ctx.ellipse(0,-17,9,3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#80603d';ctx.fillRect(-5,-20,10,3)}else{ctx.fillStyle=f.dark;ctx.fillRect(-7,-17,14,4);ctx.fillStyle=f.b;ctx.fillRect(-5,-19,10,2)}
ctx.strokeStyle=c.type==='swordsman'?'#d8d0b9':'#40372a';ctx.lineWidth=c.type==='swordsman'?3:2.5;ctx.beginPath();ctx.moveTo(2,-1);ctx.lineTo(c.type==='swordsman'?22:19,-1);ctx.stroke();ctx.fillStyle='#ddd0ad';ctx.fillRect(c.type==='swordsman'?20:17,-3,4,4);
if(isPlayer){ctx.strokeStyle='#f6df9a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke()}
if(c.elite){ctx.strokeStyle='#f1d477';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.stroke()}
if(c.hp<c.max){ctx.fillStyle='#251b16';ctx.fillRect(-11,-27,22,3);ctx.fillStyle='#c64d3d';ctx.fillRect(-11,-27,22*c.hp/c.max,3)}
ctx.restore()}
function draw(){ctx.clearRect(0,0,vw,vh);drawTerrain();ctx.save();ctx.translate(vw/2,vh/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
for(const v of villagers){ctx.fillStyle='#d1c19c';ctx.beginPath();ctx.arc(v.x,v.y,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#594d3b';ctx.fillRect(v.x-3,v.y-3,6,5)}
for(const g of guards){if(g.hp>0)drawCharacter(g)}for(const g of escorts){if(g.hp>0)drawCharacter(g)}for(const d of defenders){if(d.hp>0)drawCharacter(d)}for(const e of enemies)if(e.hp>0)drawCharacter(e);drawCharacter(player,true);
for(const b of bullets){ctx.fillStyle=b.faction==='enemy'?'#e76d43':'#f4df9e';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill()}
for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
if(player.sword>0){const s={x:player.x,y:player.y};ctx.strokeStyle='#f7e2a4';ctx.lineWidth=4;ctx.beginPath();ctx.arc(s.x,s.y,38,player.dir-.8,player.dir+.8);ctx.stroke()}
ctx.restore();if(state==='playing'||state==='paused'){drawCampMarkers();drawOffscreenMarkers();drawMinimap()}if(state==='menu')drawMenuPreview()}
// arrows at the screen edge point to attackers that are outside the camera view
function drawCampMarkers(){
 const margin=32,top=116,bottom=vh-30,cx=vw/2,cy=(top+bottom)/2;
 for(const c of camps){if(c.destroyed)continue;const sp=screenPoint(c),sx=sp.x,sy=sp.y;if(sx>=margin&&sx<=vw-margin&&sy>=top&&sy<=bottom)continue;const dx=sx-cx,dy=sy-cy,hw=Math.max(1,vw/2-margin),hh=Math.max(1,(bottom-top)/2),k=Math.min(hw/Math.abs(dx||1e-6),hh/Math.abs(dy||1e-6)),px=cx+dx*k,py=cy+dy*k,a=Math.atan2(dy,dx),f=FACTIONS[c.faction];
 ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.fillStyle=f.a;ctx.strokeStyle='#f3e6c5';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-7,-7);ctx.lineTo(-4,0);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 const pct=Math.ceil(c.hp/c.max*100);ctx.font='bold 9px Inter';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#101a15';ctx.fillStyle='#f3e6c5';const label=c.name.replace(' CAMP','');ctx.strokeText(label+' · '+pct+'%',px,py-12);ctx.fillText(label+' · '+pct+'%',px,py-12);ctx.textAlign='left';
 }
}
function drawOffscreenMarkers(){
 const m=24,top=78,cx=vw/2,cy=(top+vh-m)/2;let n=0;
 const list=enemies.filter(e=>{if(e.hp<=0||e.campGuard)return false;const sp=screenPoint(e),sx=sp.x,sy=sp.y;return sx<0||sx>vw||sy<0||sy>vh}).sort((a,b)=>dist(a,player)-dist(b,player));
 for(const e of list){
  if(n++>=14)break;
  const sp=screenPoint(e),dx=sp.x-cx,dy=sp.y-cy,hw=vw/2-m,hh=(vh-top-m)/2,k=Math.min(hw/Math.abs(dx||1e-6),hh/Math.abs(dy||1e-6)),px=cx+dx*k,py=cy+dy*k,a=Math.atan2(dy,dx),f=FACTIONS[e.faction]||FACTIONS.couto;
  ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.globalAlpha=.9;ctx.fillStyle=f.a;ctx.strokeStyle='#0d1510';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-6,-7);ctx.lineTo(-3,0);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 }
}

function drawMinimap(){
 const mw=Math.round(clamp(vw*.15,96,168)),mh=Math.round(mw*WORLD.h/WORLD.w),mx=12,my=88,sx=mw/WORLD.w,sy=mh/WORLD.h,X=x=>mx+x*sx,Y=y=>my+y*sy;
 ctx.save();ctx.globalAlpha=.9;ctx.fillStyle='#101a15';ctx.fillRect(mx-2,my-2,mw+4,mh+4);ctx.fillStyle='#3d5532';ctx.fillRect(mx,my,mw,mh);ctx.globalAlpha=1;
 ctx.strokeStyle='#bda365';ctx.lineWidth=1;ctx.strokeRect(mx-2.5,my-2.5,mw+5,mh+5);
 pathPoly(BASTION_ANGLES.map(a=>({x:X(WORLD.cx+Math.cos(a)*FORT.bastionR),y:Y(WORLD.cy+Math.sin(a)*FORT.bastionR)})));ctx.fillStyle='#a9a080';ctx.fill();
 for(const c of camps){ctx.fillStyle=c.destroyed?'#59554b':(FACTIONS[c.faction].a);ctx.fillRect(X(c.x)-3.5,Y(c.y)-3.5,7,7);ctx.strokeStyle=c.destroyed?'#2a2620':'#101a15';ctx.lineWidth=1;ctx.strokeRect(X(c.x)-3.5,Y(c.y)-3.5,7,7);if(c.destroyed){ctx.strokeStyle='#d9d2bd';ctx.beginPath();ctx.moveTo(X(c.x)-3,Y(c.y)-3);ctx.lineTo(X(c.x)+3,Y(c.y)+3);ctx.moveTo(X(c.x)+3,Y(c.y)-3);ctx.lineTo(X(c.x)-3,Y(c.y)+3);ctx.stroke()}}
 ctx.fillStyle='#e2574a';for(const e of enemies){if(e.hp>0&&!e.campGuard)ctx.fillRect(X(e.x)-1,Y(e.y)-1,2.2,2.2)}
 ctx.strokeStyle='rgba(240,225,170,.75)';ctx.lineWidth=1;ctx.strokeRect(X(camera.x),Y(camera.y),vw*sx,vh*sy);
 ctx.fillStyle='#f6df9a';ctx.beginPath();ctx.arc(X(player.x),Y(player.y),2.8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#101a15';ctx.stroke();
 ctx.restore();
}
function drawMenuPreview(){ctx.save();ctx.globalAlpha=.18;ctx.translate(vw/2-camera.x*zoom,vh/2-camera.y*zoom);ctx.scale(zoom,zoom);ctx.strokeStyle='#d4b36a';ctx.lineWidth=3;pathPoly(starPoints(WORLD.cx,WORLD.cy,500,395));ctx.stroke();ctx.restore()}
function loop(now){const dt=Math.min((now-last)/1000||0,.033);last=now;if(state==='playing')update(dt);draw();requestAnimationFrame(loop)}
function canvasPos(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
function setZoom(next){const oldZoom=zoom;zoom=clamp(next,.65,1.8);if(zoom===oldZoom)return;camera.x=clamp(camera.x,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(camera.y,vh/(2*zoom),WORLD.h-vh/(2*zoom));}
$('zoom-in').addEventListener('click',()=>setZoom(zoom*1.2));
$('zoom-out').addEventListener('click',()=>setZoom(zoom/1.2));
$('zoom-reset').addEventListener('click',()=>setZoom(1));
canvas.addEventListener('wheel',e=>{if(state!=='playing'&&state!=='paused')return;e.preventDefault();setZoom(zoom*(e.deltaY<0?1.12:1/1.12))},{passive:false});
canvas.addEventListener('pointermove',e=>{const p=canvasPos(e);mouse.x=p.x;mouse.y=p.y});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){mouse.down=true;const p=canvasPos(e);mouse.x=p.x;mouse.y=p.y}});
window.addEventListener('pointerup',()=>{mouse.down=false;touchFire=false});
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&state==='playing')sword();if(e.code==='KeyR'&&state==='playing')reload();if(e.code==='KeyE'&&state==='playing'){if(cannonCooldown<=0){shoot(player,player.dir,'couto',88,390);cannonCooldown=4.5;toast('Bastion cannon fired · reloading')}else toast('Cannon reloading…')}});window.addEventListener('keyup',e=>keys[e.code]=false);
// ---------- Start screen: garrison deployment and fortress blueprint ----------
const ROLE_IDS=['wall-count','guard-count','active-count'];
function drawBlueprint(counts){
 const c=$('fort-preview');if(!c)return;
 const g=c.getContext('2d'),S=c.height/1040,X=x=>c.width/2+(x-WORLD.cx)*S,Y=y=>c.height/2+(y-WORLD.cy)*S;
 const poly=pts=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(X(p.x),Y(p.y)):g.moveTo(X(p.x),Y(p.y)));g.closePath()};
 const dot=(x,y,r,fill)=>{g.beginPath();g.arc(X(x),Y(y),r,0,Math.PI*2);g.fillStyle=fill;g.fill();g.lineWidth=2;g.strokeStyle='#101a15';g.stroke()};
 g.clearRect(0,0,c.width,c.height);g.lineJoin='round';
 // earthworks and courtyard
 poly(starPoints(WORLD.cx,WORLD.cy,500,395));g.fillStyle='#1b2a20';g.fill();g.strokeStyle='#6a5d3c';g.lineWidth=5;g.setLineDash([14,9]);g.stroke();g.setLineDash([]);
 poly(BASTION_ANGLES.map(a=>({x:WORLD.cx+Math.cos(a)*FORT.bastionR,y:WORLD.cy+Math.sin(a)*FORT.bastionR})));g.fillStyle='#2f4033';g.fill();
 // walls, gates and bastions
 for(const w of wallLayout){
  if(w.kind==='bastion'){g.beginPath();g.arc(X(w.x),Y(w.y),w.r*S*1.05,0,Math.PI*2);g.fillStyle='#98a08c';g.fill();g.strokeStyle='#e3d9b8';g.lineWidth=3;g.stroke()}
  else{g.lineCap='butt';g.strokeStyle=w.kind==='gate'?'#c98d4a':'#cfc4a2';g.lineWidth=w.half*2*S*1.3;g.beginPath();g.moveTo(X(w.x1),Y(w.y1));g.lineTo(X(w.x2),Y(w.y2));g.stroke()}
 }
 g.textAlign='center';g.font='700 11px Inter, Arial, sans-serif';g.fillStyle='#e0b676';
 for(let i=0;i<5;i++){const w=wallById('C'+i+'1');g.fillText('GATE',X(w.mx+w.nx*62),Y(w.my+w.ny*62)+4)}
 // soldiers
 const n=counts.map(v=>clamp(Math.floor(v)||0,0,40));
 wallPosts(n[0]).forEach(p=>dot(p.x,p.y,8,'#f1d477'));
 activePosts(n[2]).forEach(p=>dot(p.x,p.y,7,'#7fc4a0'));
 const px=WORLD.cx,py=WORLD.cy+65;
 for(let i=0;i<n[1];i++){const a=-Math.PI/2+i*Math.PI*2/n[1];dot(px+Math.cos(a)*48,py+Math.sin(a)*48,6,'#e6dcc0')}
 dot(px,py,9,'#d4a53a');g.fillStyle='#f3e7c7';g.fillText('YOU',X(px),Y(py)+(n[1]?46:24));
}
function updateDeployment(){
 const values=ROLE_IDS.map(id=>Math.floor(Number($(id).value)||0));
 const invalid=values.some(value=>value<0||value>40);
 const total=values.reduce((sum,value)=>sum+value,0);
 $('deployment-total').textContent=total;
 $('deployment-error').textContent=invalid?'Each role must be between 0 and 40 soldiers.':total===0?'Choose at least one soldier.':total>40?'Maximum deployment is 40 soldiers.':'';
 $('start-btn').disabled=invalid||total===0||total>40;
 document.querySelectorAll('.step').forEach(b=>{const v=Math.floor(Number($(b.dataset.target).value)||0);b.disabled=Number(b.dataset.step)>0?(v>=40||total>=40):v<=0});
 document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('on',b.dataset.preset===values.join(',')));
 drawBlueprint(values);
}
ROLE_IDS.forEach(id=>$(id).addEventListener('input',updateDeployment));
document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>{const inp=$(b.dataset.target);inp.value=clamp((Math.floor(Number(inp.value)||0))+Number(b.dataset.step),0,40);updateDeployment()}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.preset.split(',');ROLE_IDS.forEach((id,i)=>{$(id).value=v[i]});updateDeployment()}));
updateDeployment();
$('start-btn').addEventListener('click',start);$('menu-btn').addEventListener('click',mainMenu);$('over-menu-btn').addEventListener('click',mainMenu);$('pause-btn').addEventListener('click',pause);$('resume-btn').addEventListener('click',pause);$('restart-btn').addEventListener('click',start);$('again-btn').addEventListener('click',start);$('how-btn').addEventListener('click',()=>ui.orders.classList.remove('hidden'));$('close-orders').addEventListener('click',()=>ui.orders.classList.add('hidden'));
$('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();touchFire=true});$('touch-fire').addEventListener('pointerup',()=>touchFire=false);$('touch-sword').addEventListener('pointerdown',e=>{e.preventDefault();sword()});$('touch-reload').addEventListener('pointerdown',e=>{e.preventDefault();reload()});
const joy=$('joystick'),stick=$('stick');let joyId=null;joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(joyId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveJoy(e)});function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=Math.min(1,42/(len||1));mobileMove={x:dx/42*scale,y:dy/42*scale};stick.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)'}function resetJoy(){joyId=null;mobileMove={x:0,y:0};stick.style.transform='translate(0,0)'}joy.addEventListener('pointerup',resetJoy);joy.addEventListener('pointercancel',resetJoy);
window.addEventListener('keydown',e=>{if(e.code==='Escape')pause()});
const victoryVideo=$('victory-video'),victorySound=$('victory-sound');
$('victory-skip').addEventListener('click',showVictoryResults);
$('victory-sound').addEventListener('click',()=>{victoryVideo.muted=!victoryVideo.muted;victorySound.textContent=victoryVideo.muted?'ENABLE SOUND':'MUTE SOUND';if(victoryVideo.paused)victoryVideo.play().catch(()=>{})});
victoryVideo.addEventListener('ended',showVictoryResults);
victoryVideo.addEventListener('error',()=>{if(state==='victory'){toast('Victory video could not be loaded');showVictoryResults()}});
const trailerScreen=$('trailer-screen'),trailerVideo=$('trailer-video'),trailerSound=$('trailer-sound');
function finishTrailer(){if(!trailerScreen.classList.contains('hidden')){trailerScreen.classList.add('hidden');trailerVideo.pause();ui.menu.classList.remove('hidden');state='menu';last=performance.now()}}
$('trailer-skip').addEventListener('click',finishTrailer);
$('trailer-sound').addEventListener('click',()=>{trailerVideo.muted=!trailerVideo.muted;trailerSound.textContent=trailerVideo.muted?'ENABLE SOUND':'MUTE SOUND';if(trailerVideo.paused)trailerVideo.play().catch(()=>{})});
trailerVideo.addEventListener('ended',finishTrailer);
trailerVideo.addEventListener('error',()=>{finishTrailer();toast('Trailer could not be loaded. You can still play.')});
reset();setTimeout(()=>{ui.loading.classList.add('hidden');trailerScreen.classList.remove('hidden');state='menu';last=performance.now();trailerVideo.muted=true;trailerVideo.play().catch(()=>{trailerSound.textContent='PLAY TRAILER'});requestAnimationFrame(loop)},650);
})();