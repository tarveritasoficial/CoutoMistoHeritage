(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const ui = {menu:$('menu'),loading:$('loading'),hud:$('hud'),pause:$('pause'),over:$('gameover'),orders:$('orders'),mobile:$('mobile-controls'),wave:$('wave'),score:$('score'),guards:$('guards'),health:$('health-bar'),healthText:$('health-text'),fort:$('fort-bar'),fortText:$('fort-text'),ammo:$('ammo'),reload:$('reload-state'),banner:$('wave-banner'),toast:$('toast'),walls:$('walls'),camps:$('camps')};
// Enemy strength: wave size and toughness multipliers.
const DIFFICULTIES=[{name:'RECRUIT',count:.7,hp:.85},{name:'SOLDIER',count:1,hp:1},{name:'VETERAN',count:1.35,hp:1.25}];
let difficulty=1;
const MAX_ROLE=100,MAX_TOTAL=200,MAX_FARMERS=16;
const WORLD = {w:4400,h:3600,cx:2200,cy:1800};
const FACTIONS = {
  couto:{name:'Couto Misto',a:'#244b36',b:'#d8b65f',dark:'#152e21'},
  portugal:{name:'Portugal',a:'#a83235',b:'#287447',dark:'#681f27'},
  spain:{name:'Spain',a:'#e3c23e',b:'#b8322d',dark:'#772521'},
  france:{name:'France',a:'#315f9b',b:'#e7e8e3',dark:'#1c3557'},
  england:{name:'England',a:'#b63c3c',b:'#eee9dc',dark:'#702323'}
};
const keys = Object.create(null), mouse = {x:0,y:0,down:false};
let escortFormation='wedge',friendlyUnits=[],farmAnimals=[],peasants=[],hudRefreshTimer=0;
let dpr=1, vw=0,vh=0, camera={x:WORLD.cx,y:WORLD.cy}, zoom=1, state='menu', last=0, elapsed=0, wave=0, score=0, fortress=100, spawnClock=0, waveGap=3, enemies=[], bullets=[], particles=[], guards=[], escorts=[], cavalryCharges=[], defenders=[], villagers=[], sheep=[], cows=[], chickens=[], walls=[], camps=[], victoryTimer=0, waveActive=false, player, cannonCooldown=0, toastTimer=0, bannerTimer=0, reloadTimer=0, swordTimer=0, mobileMove={x:0,y:0}, mobileAim={x:0,y:0}, mobileAimActive=false, touchFire=false, idCounter=0, floaters=[];
const MAX_ACTIVE_ENEMIES=220,MAX_WAVE_ENEMIES=72,MAX_PARTICLES=900,MAX_BULLETS=320;
const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
function addParticle(p){if(particles.length<MAX_PARTICLES)particles.push(p)}
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
 // One unbroken river: across the north, down the east, then sweeping
 // around the southern edge and back toward the southwest map boundary.
 {curves:[
  [[-80,985],[760,1075],[1450,932],[2200,1002]],
  [[2200,1002],[2700,1050],[3150,982],[3600,1010]],
  [[3600,1010],[3670,1510],[3530,2090],[3600,2590]],
  [[3600,2590],[3650,3000],[3200,3500],[2200,3605]],
  [[2200,3605],[1250,3570],[530,3500],[300,3400]],
  [[300,3400],[70,3300],[0,2910],[-100,2600]]
 ],bridges:[
  {x:560,y:1010,angle:0},
  {x:3089,y:1000,angle:0},
  {x:3600,y:1600,angle:Math.PI/2},
  {x:3600,y:2300,angle:Math.PI/2},
  // Southwest crossing, aligned with the local river bend.
  {x:155,y:3290,angle:-2.29}
 ]}
];
function riverCurvePoints(r){
 const out=[];
 const curves=r.curves;
 for(const c of curves)for(let i=0;i<=70;i++){
  if(out.length&&i===0)continue;
  const t=i/70,u=1-t;
  out.push({x:u*u*u*c[0][0]+3*u*u*t*c[1][0]+3*u*t*t*c[2][0]+t*t*t*c[3][0],y:u*u*u*c[0][1]+3*u*u*t*c[1][1]+3*u*t*t*c[2][1]+t*t*t*c[3][1]});
 }
 return out;
}
const RIVER_LINES=RIVER_DEFS.map(r=>riverCurvePoints(r));
// Snap every bridge onto the true river centreline, perpendicular to the current. Some decks sat up to
// 20px off the water, leaving a gap between the bank and the deck that units could not step across.
RIVER_DEFS.forEach((r,i)=>r.bridges.forEach(b=>{const p=riverNearestPoint(RIVER_LINES[i],b.x,b.y);if(p){b.x=Math.round(p.x);b.y=Math.round(p.y);b.angle=Math.atan2(p.ty,p.tx)}}));
function riverYAtX(points,x){
 let best=points[0],bd=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,t=clamp((x-a.x)/(dx||1),0,1),px=a.x+dx*t,d=Math.abs(px-x);
  if(d<bd){bd=d;best={x:px,y:a.y+(b.y-a.y)*t}}
 }
 return best.y;
}
function riverBridgeAt(x,y,r){
 for(const b of r.bridges){
  const a=b.angle||0,dx=x-b.x,dy=y-b.y;
  const lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a);
  if(Math.abs(lx)<=40&&Math.abs(ly)<=82)return b;
 }
 return null;
}
function riverBridgePass(x,y,r){return !!riverBridgeAt(x,y,r)}
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
// Spatial hash for exact river collision checks. Every segment is indexed into the
// 96px cells touched by its 64px collision margin, so movement checks only nearby segments.
const RIVER_COLLISION_CELL=96,RIVER_COLLISION_GRID=new Map();
(function buildRiverCollisionGrid(){
 for(let ri=0;ri<RIVER_LINES.length;ri++){
  const pts=RIVER_LINES[ri];
  for(let si=1;si<pts.length;si++){
   const a=pts[si-1],b=pts[si],seg={ri,ax:a.x,ay:a.y,dx:b.x-a.x,dy:b.y-a.y,len2:(b.x-a.x)**2+(b.y-a.y)**2};
   const x0=Math.floor((Math.min(a.x,b.x)-64)/RIVER_COLLISION_CELL),x1=Math.floor((Math.max(a.x,b.x)+64)/RIVER_COLLISION_CELL);
   const y0=Math.floor((Math.min(a.y,b.y)-64)/RIVER_COLLISION_CELL),y1=Math.floor((Math.max(a.y,b.y)+64)/RIVER_COLLISION_CELL);
   for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
    const key=gx+','+gy;let bucket=RIVER_COLLISION_GRID.get(key);
    if(!bucket){bucket=[];RIVER_COLLISION_GRID.set(key,bucket)}
    bucket.push(seg);
   }
  }
 }
})();
let riverCollisionChecks=0,campHintAt=-99;
function riverBlocked(x,y){
 const bucket=RIVER_COLLISION_GRID.get(Math.floor(x/RIVER_COLLISION_CELL)+','+Math.floor(y/RIVER_COLLISION_CELL));
 if(!bucket)return false;
 const limit2=64*64;
 for(const seg of bucket){
  // Preserve the original per-river bridge exception: a bridge over one river
  // must never make a nearby second river passable.
  if(riverBridgePass(x,y,RIVER_DEFS[seg.ri]))continue;
  riverCollisionChecks++;
  const t=clamp(((x-seg.ax)*seg.dx+(y-seg.ay)*seg.dy)/(seg.len2||1),0,1);
  const dx=x-(seg.ax+t*seg.dx),dy=y-(seg.ay+t*seg.dy);
  if(dx*dx+dy*dy<limit2)return true;
 }
 return false;
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
// ---------- Navigation: the river can only be crossed on a bridge ----------
// A coarse grid is built once from the exact river collision test. Cells that touch water (or
// the bank margin) are closed, bridge decks stay open, and units use A* to walk around the
// water and through the nearest bridge. Replaces the old single-sign "which side am I on"
// guess, which froze units whenever the straight line crossed the C-shaped river twice.
const NAV={cell:24,cols:Math.ceil(WORLD.w/24),rows:Math.ceil(WORLD.h/24)};
const navBlocked=new Uint8Array(NAV.cols*NAV.rows);
(function buildNav(){
 // centre, edge midpoints and corners: a free cell is entirely free of water
 const probes=[[0,0],[12,0],[-12,0],[0,12],[0,-12],[12,12],[-12,12],[12,-12],[-12,-12]];
 // Only cells near the river need the (expensive) exact test: flag them from the river polyline first.
 const near=new Uint8Array(NAV.cols*NAV.rows);
 for(const pts of RIVER_LINES)for(const q of pts){
  const c0=Math.max(0,Math.floor((q.x-96)/NAV.cell)),c1=Math.min(NAV.cols-1,Math.floor((q.x+96)/NAV.cell));
  const r0=Math.max(0,Math.floor((q.y-96)/NAV.cell)),r1=Math.min(NAV.rows-1,Math.floor((q.y+96)/NAV.cell));
  for(let ry=r0;ry<=r1;ry++)for(let rx=c0;rx<=c1;rx++)near[ry*NAV.cols+rx]=1;
 }
 for(let cy=0;cy<NAV.rows;cy++)for(let cx=0;cx<NAV.cols;cx++){
  if(!near[cy*NAV.cols+cx])continue;
  const x=(cx+.5)*NAV.cell,y=(cy+.5)*NAV.cell;
  if(riverDistance(x,y)>110)continue;
  for(const pr of probes)if(riverBlocked(x+pr[0],y+pr[1])){navBlocked[cy*NAV.cols+cx]=1;break}
 }
})();
function navAt(x,y){const cx=clamp(Math.floor(x/NAV.cell),0,NAV.cols-1),cy=clamp(Math.floor(y/NAV.cell),0,NAV.rows-1);return navBlocked[cy*NAV.cols+cx]===1}
// true when the straight segment stays on open ground (samples within 14px of the start are ignored
// so a unit hugging the bank can always walk away from it)
function navClear(x0,y0,x1,y1){
 const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy);if(len<1)return true;
 const n=Math.ceil(len/10);
 for(let i=1;i<=n;i++){const t=i/n;if(t*len<14&&i<n)continue;if(navAt(x0+dx*t,y0+dy*t))return false}
 return true;
}
function navFreeCell(x,y){
 const C=NAV.cols,R=NAV.rows,cx=clamp(Math.floor(x/NAV.cell),0,C-1),cy=clamp(Math.floor(y/NAV.cell),0,R-1);
 if(!navBlocked[cy*C+cx])return cy*C+cx;
 for(let r=1;r<=10;r++){
  let best=-1,bd=Infinity;
  for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
   if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;
   const nx=cx+ox,ny=cy+oy;if(nx<0||ny<0||nx>=C||ny>=R||navBlocked[ny*C+nx])continue;
   const d=ox*ox+oy*oy;if(d<bd){bd=d;best=ny*C+nx}
  }
  if(best>=0)return best;
 }
 return -1;
}
const navSeen=new Int32Array(NAV.cols*NAV.rows),navClosed=new Int32Array(NAV.cols*NAV.rows),navPrev=new Int32Array(NAV.cols*NAV.rows),navG=new Float32Array(NAV.cols*NAV.rows);
let navStamp=0;
function navPath(sx,sy,gx,gy){
 const s=navFreeCell(sx,sy),g=navFreeCell(gx,gy);if(s<0||g<0)return null;
 const C=NAV.cols,R=NAV.rows,tx=g%C,ty=(g/C)|0,heap=[];
 const h=i=>{const dx=Math.abs(i%C-tx),dy=Math.abs(((i/C)|0)-ty);return dx+dy-.5858*Math.min(dx,dy)};
 const push=(i,f)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;const t=heap[p];heap[p]=heap[k];heap[k]=t;k=p}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;const t=heap[m];heap[m]=heap[k];heap[k]=t;k=m}}return top};
 navStamp++;navSeen[s]=navStamp;navG[s]=0;navPrev[s]=-1;push(s,h(s));
 let found=false;
 while(heap.length){
  const i=pop()[1];if(navClosed[i]===navStamp)continue;navClosed[i]=navStamp;
  if(i===g){found=true;break}
  const cx=i%C,cy=(i/C)|0;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
   if(!ox&&!oy)continue;const nx=cx+ox,ny=cy+oy;if(nx<0||ny<0||nx>=C||ny>=R)continue;
   const j=ny*C+nx;if(navBlocked[j]||navClosed[j]===navStamp)continue;
   if(ox&&oy&&(navBlocked[cy*C+nx]||navBlocked[ny*C+cx]))continue; // never cut a corner of the water
   const ng=navG[i]+(ox&&oy?1.4142:1);
   if(navSeen[j]!==navStamp||ng<navG[j]){navSeen[j]=navStamp;navG[j]=ng;navPrev[j]=i;push(j,ng+h(j))}
  }
 }
 if(!found)return null;
 const pts=[];for(let i=g;i>=0;i=navPrev[i])pts.push({x:(i%C+.5)*NAV.cell,y:(((i/C)|0)+.5)*NAV.cell});
 pts.reverse();pts.shift();
 return pts;
}
// One movement step toward p. Walks straight when the way is clear, otherwise follows an A* route
// around the water (through a bridge). Returns the heading used.
function navMove(u,p,len){
 let heading=angle(u,p),goal=p;
 const forced=u.navForce>0; // set by stuck detection: follow the A* route even if the straight line looks clear
 if(!forced&&navClear(u.x,u.y,p.x,p.y))u.nav=null;
 else{
  let n=u.nav;
  if(!n||dist(n.goal,p)>110||n.travel>150){n=u.nav={goal:{x:p.x,y:p.y},path:navPath(u.x,u.y,p.x,p.y)||[],travel:0}}
  n.travel+=len;if(forced)u.navForce-=len;
  while(n.path.length&&dist(u,n.path[0])<16)n.path.shift();
  while(n.path.length>1&&navClear(u.x,u.y,n.path[1].x,n.path[1].y))n.path.shift();
  if(n.path.length)goal=n.path[0];
  heading=angle(u,goal);
 }
 const ox=u.x,oy=u.y,step=Math.min(len,dist(u,goal));
 moveLand(u,Math.cos(heading)*step,Math.sin(heading)*step);
 // The water slid the unit along the bank instead of letting it advance: switch to the A* route.
 if(step>.3){const moved=Math.hypot(u.x-ox,u.y-oy);if(moved<step*.35){if((u.stuck=(u.stuck||0)+1)>5){u.navForce=220;u.nav=null;u.stuck=0}}else u.stuck=0}
 return heading;
}
function moveEnemyToward(e,p,len){const h=navMove(e,p,len);if(e.nav)e.dir=h;return h}
function moveToward(u,p,len){return navMove(u,p,len)}
function stepTo(u,p,len){return navMove(u,p,len)}
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
 // Enemy camps are protected through waves 1–9. Damage becomes possible once wave 10 begins.
 if(wave<10){c.flash=.08;if(elapsed-campHintAt>6){campHintAt=elapsed;toast('The camps are fortified until wave 10 · hold the fortress')}return}
 c.hp=Math.max(0,c.hp-amount);c.flash=.14;
 for(let i=0;i<3;i++)addParticle({x:c.x+rand(-40,40),y:c.y+rand(-40,40),vx:rand(-50,50),vy:rand(-70,-10),life:rand(.3,.7),max:.7,color:i%2?'#7d6a4a':'#c9b88a',r:rand(2,4)});
 if(c.hp>0)return;
 c.destroyed=true;c.destroyedAt=elapsed;score+=500;floaters.push({x:c.x,y:c.y-34,text:'+500 · '+c.name+' DESTROYED',life:2.4,max:2.4,big:true});
 for(let i=0;i<46;i++)addParticle({x:c.x+rand(-70,70),y:c.y+rand(-70,70),vx:rand(-120,120),vy:rand(-150,-10),life:rand(.6,1.6),max:1.6,color:i%3?'#d9803a':'#4a4338',r:rand(2,7)});
 for(const e of enemies)if(e.camp===c&&e.hp>0)e.hp=0;
 const left=camps.filter(k=>!k.destroyed).length;
 if(left===0){banner('ALL ENEMY CAMPS DESTROYED');toast('Victory is yours!');victoryTimer=3}
 else{banner(c.name+' DESTROYED');toast(left+(left===1?' enemy camp remains':' enemy camps remain'))}
}
function campGuardAI(e,dt){
 let t=null,bd=300;
 for(const f of [player,...friendlyUnits]){if(f.hp<=0)continue;const d=dist(e,f);if(d<bd){bd=d;t=f}}
 if(!t){const hd=dist(e,e.home);if(hd>10){e.dir=angle(e,e.home);moveEnemyToward(e,e.home,60*dt)}return}
 e.dir=angle(e,t);const d=dist(e,t);
 if(e.type==='rifleman'){if(d>200)moveEnemyToward(e,t,50*dt);else if(e.attack<=0){shoot(e,e.dir,'enemy',13,390);e.attack=1.65}}
 else if(d>31)moveEnemyToward(e,t,82*dt);
 else if(e.attack<=0){if(t===player){if(player.invuln<=0){player.hp-=15;player.invuln=.48}}else t.hp-=19;e.attack=.78}
}
function updateCamps(dt){
 for(const c of camps){
  c.flash=Math.max(0,c.flash-dt);if(c.destroyed)continue;
  c.respawn-=dt;
  if(c.respawn<=0){c.respawn=20;const n=enemies.filter(e=>e.camp===c&&e.hp>0).length;if(n<CAMP_GARRISON&&dist(player,c)>420)addCampGuard(c,n)}
 }
}
// ---------- Peaceful wildlife: sheep grazing in the open fields ----------
function sheepFieldSafe(x,y){
 if(x<150||y<150||x>WORLD.w-150||y>WORLD.h-150)return false;
 if(Math.hypot(x-WORLD.cx,y-WORLD.cy)<570)return false;
 if(riverDistance(x,y)<158)return false;
 for(const c of CAMP_SITES)if(Math.hypot(x-c.x,y-c.y)<540)return false;
 return true;
}
function buildSheep(){
 const flockList=[];
 // Several small flocks are scattered through the meadows, never beside enemy camps or the keep.
 for(let f=0;f<6;f++){
  let home=null;
  for(let tries=0;tries<1800&&!home;tries++){
   const x=rand(170,WORLD.w-170),y=rand(170,WORLD.h-170);
   if(sheepFieldSafe(x,y))home={x,y};
  }
  if(!home)continue;
  const count=3+(f%2);
  for(let i=0;i<count;i++){
   let p=null;
   for(let tries=0;tries<80&&!p;tries++){
    const x=home.x+rand(-62,62),y=home.y+rand(-48,48);
    if(sheepFieldSafe(x,y))p={x,y};
   }
   if(!p)continue;
   flockList.push({x:p.x,y:p.y,hp:36,max:36,dead:false,home:{x:home.x,y:home.y},target:{x:home.x,y:home.y},dir:rand(0,Math.PI*2),speed:rand(17,25),pause:rand(0,2.5),think:rand(2,5),wool:rand(.88,1.12),phase:rand(0,Math.PI*2)});
  }
 }
 return flockList;
}
function buildFarmAnimals(kind,count){
 const herd=[];
 for(let i=0;i<count;i++){let p=null;for(let tries=0;tries<1800&&!p;tries++){const x=rand(170,WORLD.w-170),y=rand(170,WORLD.h-170);if(sheepFieldSafe(x,y))p={x,y}}if(!p)continue;
 herd.push({kind,x:p.x,y:p.y,hp:kind==='cow'?70:18,max:kind==='cow'?70:18,dead:false,home:{x:p.x,y:p.y},target:{x:p.x,y:p.y},dir:rand(0,Math.PI*2),speed:kind==='cow'?rand(10,16):rand(18,27),pause:rand(0,3),think:rand(2,6),phase:rand(0,Math.PI*2),flash:0,scale:kind==='cow'?rand(.9,1.12):rand(.85,1.15)});
 }return herd;
}
function damageAnimal(a,amount){if(!a||a.hp<=0)return;a.hp=Math.max(0,a.hp-amount);a.flash=.14;for(let i=0;i<(a.hp<=0?10:3);i++)addParticle({x:a.x+rand(-8,8),y:a.y+rand(-6,6),vx:rand(-48,48),vy:rand(-48,48),life:rand(.2,.5),max:.5,color:i%2?'#e7dfc9':'#8e806b',r:rand(1.5,3.5)});if(a.hp<=0)a.dead=true;}
function updateFarmAnimals(dt,herd){for(const a of herd){a.phase+=dt*4;a.flash=Math.max(0,(a.flash||0)-dt);a.pause=Math.max(0,a.pause-dt);a.think-=dt;if(a.think<=0||dist(a,a.target)<12){let found=false;for(let tries=0;tries<20;tries++){const radius=rand(25,115),dir=rand(0,Math.PI*2),x=a.home.x+Math.cos(dir)*radius,y=a.home.y+Math.sin(dir)*radius;if(sheepFieldSafe(x,y)){a.target={x,y};found=true;break}}a.think=rand(3,7);if(!found)a.target={x:a.home.x,y:a.home.y}}if(a.pause>0)continue;const d=dist(a,a.target);if(d<2)continue;const step=Math.min(d,a.speed*dt),dir=angle(a,a.target),ox=a.x,oy=a.y;a.dir=dir;moveLand(a,Math.cos(dir)*step,Math.sin(dir)*step);if(Math.hypot(a.x-ox,a.y-oy)<step*.35){a.pause=rand(.5,1.5);a.think=0}}return herd.filter(a=>!a.dead);}
function chooseSheepTarget(s){
 for(let tries=0;tries<24;tries++){
  const radius=rand(35,155),a=rand(0,Math.PI*2),x=s.home.x+Math.cos(a)*radius,y=s.home.y+Math.sin(a)*radius;
  if(sheepFieldSafe(x,y)){s.target={x,y};s.think=rand(3,7);return}
 }
 s.target={x:s.home.x,y:s.home.y};s.think=rand(3,5);
}
function damageSheep(s,amount){if(!s||s.hp<=0)return;s.hp=Math.max(0,s.hp-amount);s.flash=.12;for(let i=0;i<(s.hp<=0?9:3);i++)addParticle({x:s.x+rand(-7,7),y:s.y+rand(-5,5),vx:rand(-45,45),vy:rand(-45,45),life:rand(.2,.5),max:.5,color:i%2?'#e7dfc9':'#8e806b',r:rand(1.5,3.5)});if(s.hp<=0)s.dead=true;}
function updateSheep(dt){
 for(const s of sheep){
  s.phase+=dt*5;
  s.pause=Math.max(0,s.pause-dt);
  s.think-=dt;
  if(s.think<=0||dist(s,s.target)<13)chooseSheepTarget(s);
  if(s.pause>0)continue;
  const d=dist(s,s.target);
  if(d<2)continue;
  const step=Math.min(d,s.speed*dt),a=angle(s,s.target),ox=s.x,oy=s.y;
  s.dir=a;moveLand(s,Math.cos(a)*step,Math.sin(a)*step);
  if(Math.hypot(s.x-ox,s.y-oy)<step*.35){chooseSheepTarget(s);s.pause=rand(.4,1.4)}
 }
 sheep=sheep.filter(s=>!s.dead);cows=updateFarmAnimals(dt,cows);chickens=updateFarmAnimals(dt,chickens);
}
function victory(){
 state='victory';showZoom(false);SFX.play('victory');recordRun(true);ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');
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
 w.hp=Math.max(0,w.hp-amount);w.flash=.16;SFX.play(w.hp<=0?'break':'wallhit',x,y);
 for(let i=0;i<(w.hp<=0?16:3);i++)addParticle({x:x+rand(-6,6),y:y+rand(-6,6),vx:rand(-60,60),vy:rand(-60,60),life:rand(.3,.7),max:.7,color:i%2?'#b9ad8e':'#7d7358',r:rand(1.5,4)});
 if(w.hp<=0&&!w.down){w.down=true;toast(w.label.toUpperCase()+' BREACHED!')}
}
function repairWalls(){
 let fixed=0,rebuilt=0;const fortBefore=fortress;fortress=Math.min(100,fortress+8);
 for(const w of walls){if(w.hp<=0){w.hp=w.max*.4;w.down=false;rebuilt++}else if(w.hp<w.max){w.hp=Math.min(w.max,w.hp+w.max*.35);fixed++}}
 if(rebuilt)toast('Masons rebuild breaches · fortress reinforced');else if(fixed||fortress>fortBefore)toast('Masons repair the walls · fortress reinforced')
}
// Where an enemy outside the fort should go: the nearest weak point, or straight through an existing breach.
function assaultPlan(e){
 // Once any section is breached, attackers prioritise the nearest opening instead
 // of wasting time damaging another intact section.
 let breach=null,breachDistance=Infinity;
 for(const w of walls)if(w.hp<=0){
  const pt={x:w.gx,y:w.gy},d=dist(e,pt);
  if(d<breachDistance){breachDistance=d;breach={w,pt,breach:true}}
 }
 if(breach)return breach;
 let best=null,bs=Infinity;
 for(const w of walls){
  const c=wallContact(w,e),score=c.d*(w.kind==='gate'?.6:w.kind==='bastion'?1.8:1);
  if(score<bs){bs=score;best={w,pt:c,breach:false}}
 }
 return best;
}
function siege(e,dt,rad){
 const plan=assaultPlan(e);
 // A missing wall plan can occur after all defensive structures are destroyed.
 // Do not let an enemy update dereference an absent plan.
 if(!plan||!plan.w||!plan.pt){moveEnemyToward(e,{x:WORLD.cx,y:WORLD.cy},(e.type==='elephant'?42:e.type==='cavalry'?105:82)*dt);return}
 e.wallId=plan.w.id;
 e.dir=Math.atan2(plan.pt.y-e.y,plan.pt.x-e.x);
 const speed=e.type==='elephant'?42:e.type==='cavalry'?105:e.type==='spearman'?68:82;
 const move=()=>moveEnemyToward(e,plan.pt,speed*dt);
 if(plan.breach){move();return}
 const c=wallContact(plan.w,e);
 if(c.sep>rad+8)move();
 else if(e.attack<=0){
  if(e.type==='cannon'){shoot(e,e.dir,'enemy',30,285,true);e.attack=3.1;return}
  const unitSiegeDamage=SIEGE_DMG[e.type];
  const wallDamage=(unitSiegeDamage&&Number.isFinite(unitSiegeDamage[plan.w.kind])?unitSiegeDamage[plan.w.kind]:null)
   ??(e.type==='spearman'?5:e.type==='archer'?1:e.type==='rifleman'?2:e.type==='cannon'?18:e.type==='elephant'?26:e.type==='cavalry'?3:4);
  damageWall(plan.w,wallDamage,c.x,c.y);
  e.attack=e.type==='swordsman'?.78:1.05;
 }
}
function makeSoldier(x,y,faction,type='rifleman',friendly=false,elite=false){return {id:++idCounter,x,y,vx:0,vy:0,dir:0,hp:type==='elephant'?210:elite?145:type==='cavalry'?85:type==='spearman'?78:type==='archer'?44:55,max:type==='elephant'?210:elite?145:type==='cavalry'?85:type==='spearman'?78:type==='archer'?44:55,faction,type,friendly,elite,attack:rand(.2,1),reload:rand(.2,1.5),flash:0,dead:false,charge:0}}
function reset(){
 cavalryCharges=[];for(const r of RIVER_DEFS)for(const b of r.bridges)b.chargeSent=false;
 camera.x=clamp(WORLD.cx,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(WORLD.cy,vh/(2*zoom),WORLD.h-vh/(2*zoom));
 wave=0;score=0;fortress=100;escortFormation='wedge';$('touch-formation').textContent='LINE';elapsed=0;campHintAt=-99;lastPlayerHp=100;lastPlayerHp=100;spawnClock=0;waveGap=2;
 enemies=[];bullets=[];particles=[];floaters=[];corpses.length=0;villagers=[];sheep=[];guards=[];escorts=[];defenders=[];peasants=[];idCounter=0;
 const wallCount=clamp(Math.floor(Number($('wall-count').value)||0),0,MAX_ROLE);
 const guardCount=clamp(Math.floor(Number($('guard-count').value)||0),0,MAX_ROLE);
 const activeCount=clamp(Math.floor(Number($('active-count').value)||0),0,MAX_ROLE);
 walls=buildWalls();waveActive=false;victoryTimer=0;camps=buildCamps();sheep=buildSheep();cows=buildFarmAnimals('cow',9);chickens=buildFarmAnimals('chicken',20);
 const farmerCount=clamp(Math.floor(Number($('farmer-count').value)||0),0,MAX_FARMERS);
 // Local peasants defend each safe farm field with slings, spread in a loose ring around the plots.
 for(const farm of FARM_SITES){if(!farmSiteSafe(farm))continue;for(let i=0;i<farmerCount;i++){const a=i*Math.PI*2/farmerCount+farm.turn,r=55+(i%3)*14,p=makeSoldier(farm.x+Math.cos(a)*r*1.15,farm.y+Math.sin(a)*r*.85,'couto','archer',true,false);p.peasant=true;p.hp=p.max=32;p.home={x:p.x,y:p.y};p.attack=rand(.3,1.4);p.reload=rand(.3,1.4);peasants.push(p)}}
 wallPosts(wallCount).forEach((p,i)=>{
  const g=makeSoldier(p.x,p.y,'couto','rifleman',true,true);g.slot=i;g.home={x:p.x,y:p.y};g.dir=p.a;guards.push(g);
 });
 for(let i=0;i<guardCount;i++){
  const a=-Math.PI/2+i*Math.PI*2/Math.max(1,guardCount),p={x:WORLD.cx+Math.cos(a)*78,y:WORLD.cy+Math.sin(a)*78};
  const g=makeSoldier(WORLD.cx+rand(-12,12),WORLD.cy+rand(-12,12),'couto','swordsman',true,false);
  g.followSlot=i;g.attack=rand(.1,.7);escorts.push(g);
 }
 activePosts(activeCount).forEach((p,i)=>{
  const d=makeSoldier(p.x,p.y,'couto',i%3===2?'spearman':'swordsman',true,false);
  d.post={x:p.x,y:p.y};d.dir=p.a;d.attack=rand(.1,.8);d.line=p.line;defenders.push(d);
 });
 player={x:WORLD.cx,y:WORLD.cy+65,vx:0,vy:0,dir:-Math.PI/2,hp:100,max:100,ammo:8,maxAmmo:8,reload:0,fire:0,sword:0,invuln:0};
 for(let i=0;i<15;i++)villagers.push({x:WORLD.cx+rand(-205,205),y:WORLD.cy+rand(-165,165),dir:rand(0,6.28),speed:rand(8,17),panic:0});
 friendlyUnits=guards.concat(escorts,defenders,peasants);farmAnimals=sheep.concat(cows,chickens);hudRefreshTimer=0;ui.wave.textContent='0';ui.score.textContent='0';updateHud()
}
function updateCampObjectives(){const remaining=camps.filter(c=>!c.destroyed).length;const count=$('camp-objective-count');if(count)count.textContent=remaining+' / '+camps.length+' REMAINING';for(const c of camps){const row=$('camp-objective-'+c.id);if(!row)continue;const ratio=c.destroyed?0:clamp(c.hp/c.max,0,1);row.classList.toggle('destroyed',c.destroyed);const bar=row.querySelector('.camp-objective-fill');if(bar)bar.style.width=(ratio*100)+'%';const value=row.querySelector('.camp-objective-value');if(value)value.textContent=c.destroyed?'DESTROYED':Math.ceil(ratio*100)+'%';}}
function updateHud(){updateCampObjectives();const playerRatio=clamp(player.hp/player.max,0,1),fortRatio=clamp(fortress/100,0,1);ui.health.style.width=(playerRatio*100)+'%';ui.health.style.background=playerRatio>.55?'#75ad69':playerRatio>.25?'#d1b46c':'#c64d3d';ui.healthText.textContent=Math.ceil(player.hp)+'%';ui.fort.style.width=(fortRatio*100)+'%';ui.fort.style.background=fortRatio>.55?'#d1b46c':fortRatio>.25?'#df9148':'#c64d3d';ui.fortText.textContent=Math.ceil(fortress)+'%';ui.ammo.textContent=player.ammo+' / '+player.maxAmmo;ui.reload.textContent=player.reload>0?'RELOADING':'READY';const rb=$('reload-bar');if(rb)rb.style.width=(player.reload>0?clamp(1-player.reload/1.25,0,1)*100:0)+'%';ui.guards.textContent=(guards.filter(g=>g.hp>0).length+escorts.filter(g=>g.hp>0).length+defenders.filter(g=>g.hp>0).length)+'/'+(guards.length+escorts.length+defenders.length);ui.wave.textContent=wave;ui.score.textContent=score;const up=walls.filter(w=>w.hp>0).length;ui.walls.textContent=up+'/'+walls.length;ui.walls.style.color=up<walls.length?'#f0a58f':'';const cl=camps.filter(c=>!c.destroyed).length;ui.camps.textContent=cl+'/'+camps.length}

function launchCavalryCharge(bridge){
 if(bridge.chargeSent)return;
 const active=enemies.reduce((n,e)=>n+(e.hp>0?1:0),0);
 if(active+20>MAX_ACTIVE_ENEMIES)return; // wait until there is room for the complete 20-horse charge
 bridge.chargeSent=true;
 const targets=camps.filter(c=>!c.destroyed);
 if(!targets.length)return;
 const target=targets.sort((a,b)=>dist(player,a)-dist(player,b))[0];
 const edgeX=target.x<WORLD.cx?18:WORLD.w-18,edgeY=target.y<WORLD.cy?18:WORLD.h-18;
 const useX=Math.abs(target.x-WORLD.cx)>Math.abs(target.y-WORLD.cy);
 // Portuguese cavalry stages at the centre of the western edge, well clear
 // of the southwest river bend and its bridge. Other factions retain edge spawns.
 const portuguese=target.faction==='portugal';
 const spawnX=portuguese?260:(useX?edgeX:target.x);
 const spawnY=portuguese?1800:(useX?target.y:edgeY);
 const formation={x:spawnX,y:spawnY,dir:angle({x:spawnX,y:spawnY},player),members:[],leader:null};
 for(let i=0;i<20;i++){
  const spread=(i-9.5)*13;
  const x=clamp(useX||portuguese?spawnX:target.x+spread,18,WORLD.w-18);
  const y=clamp(useX||portuguese?spawnY+spread:edgeY,18,WORLD.h-18);
  const h=makeSoldier(x,y,target.faction,'cavalry',false,false);
  h.hp=h.max=105;h.chargeCamp=target;h.chargeSpeed=235;h.attack=rand(.05,.45);h.campGuard=false;
  h.chargeFormation=formation;h.chargeIndex=i;
  formation.members.push(h);if(i===0)formation.leader=h;
  enemies.push(h);
 }
 banner('ENEMY CAVALRY · 20 HORSEMEN');
 toast(target.name+' sends 20 cavalry to defend the camp!');
}
function updateCavalryCharges(dt){}

// Virtual joysticks only appear on touch devices (or once a finger has touched the screen).
let touchSeen=false;
const touchUI=()=>touchSeen||matchMedia('(pointer:coarse)').matches;
let lastPlayerHp=100,buzzAt=0;
function hurtBuzz(){if(player.hp<lastPlayerHp-1)SFX.play('hurt');if(!touchSeen&&!matchMedia('(pointer:coarse)').matches)return;if(player.hp<lastPlayerHp-1&&elapsed-buzzAt>.25&&navigator.vibrate){buzzAt=elapsed;navigator.vibrate(player.hp<=0?[80,40,80]:25)}lastPlayerHp=player.hp}
function syncTouchUI(){ui.mobile.classList.toggle('hidden',!touchUI()||state!=='playing'&&state!=='paused')}
window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touchSeen){touchSeen=true;syncTouchUI()}},{capture:true,passive:true});
// ---- Saved progress: best run and the last army you deployed (browser storage may be unavailable) ----
const SAVE_KEY='cmh-save-v1';
function loadSave(){try{return JSON.parse(localStorage.getItem(SAVE_KEY))||{}}catch(e){return {}}}
function writeSave(patch){try{localStorage.setItem(SAVE_KEY,JSON.stringify(Object.assign(loadSave(),patch)))}catch(e){}}
// Returns true when this run beat the saved best score.
function recordRun(won){
 const s=loadSave(),newBest=score>(s.bestScore||0);
 writeSave({bestScore:Math.max(score,s.bestScore||0),bestWave:Math.max(wave,s.bestWave||0),wins:(s.wins||0)+(won?1:0),runs:(s.runs||0)+1});
 updateBest();return newBest&&score>0;
}
function updateBest(){
 const s=loadSave(),el=$('best-record');if(!el)return;
 el.textContent=s.runs?'BEST SCORE '+(s.bestScore||0)+' · BEST WAVE '+(s.bestWave||0)+' · VICTORIES '+(s.wins||0):'';
}
function saveDeployment(){writeSave({difficulty,army:['wall-count','guard-count','active-count','farmer-count'].map(id=>Number($(id).value)||0)})}
function setDifficulty(i){difficulty=clamp(Math.floor(i)||0,0,2);document.querySelectorAll('[data-diff]').forEach(b=>b.classList.toggle('on',Number(b.dataset.diff)===difficulty))}
function restoreDeployment(){
 setDifficulty(loadSave().difficulty??1);
 const a=loadSave().army;if(!Array.isArray(a)||a.length!==4)return;
 ['wall-count','guard-count','active-count','farmer-count'].forEach((id,i)=>{const max=i===3?MAX_FARMERS:MAX_ROLE;$(id).value=clamp(Math.floor(a[i])||0,0,max)});
}
const showZoom=v=>$('zoom-controls').classList.toggle('hidden',!v);
function start(){showZoom(true);saveDeployment();resize();setZoom(defaultZoom());$('victory-video').pause();$('victory-video').currentTime=0;reset();spawnOpeningArmy();wave=1;waveActive=true;ui.wave.textContent='1';state='playing';ui.menu.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');$('victory-screen').classList.add('hidden');ui.orders.classList.add('hidden');ui.hud.classList.remove('hidden');syncTouchUI();banner('WAVE 1 · OPENING ASSAULT');if(touchUI()&&innerHeight>innerWidth)setTimeout(()=>{if(state==='playing')toast('Tip: rotate your phone to landscape for a wider view')},3200);toast('80 soldiers and 12 cannons from all four nations are advancing');last=performance.now()}
function pause(){if(state==='playing'){state='paused';ui.pause.classList.remove('hidden')}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden');last=performance.now()}}function mainMenu(){showZoom(false);$('victory-video').pause();$('victory-video').currentTime=0;state='menu';ui.menu.classList.remove('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');$('victory-screen').classList.add('hidden');ui.orders.classList.add('hidden');ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');last=performance.now()}
function gameOver(){state='over';showZoom(false);SFX.play('defeat');const newBest=recordRun(false);$('over-eyebrow').textContent='THE FORTRESS HAS FALLEN';$('over-title').textContent='DEFEAT';ui.over.classList.remove('hidden');ui.hud.classList.add('hidden');ui.mobile.classList.add('hidden');$('final-stats').textContent=(newBest?'NEW BEST SCORE! ':'')+DIFFICULTIES[difficulty].name+' · Waves held: '+wave+' · Score: '+score+' · Defenders remaining: '+(guards.filter(g=>g.hp>0).length+escorts.filter(g=>g.hp>0).length+defenders.filter(g=>g.hp>0).length)+'/'+(guards.length+escorts.length+defenders.length)}
function reload(){if(player.reload<=0&&player.ammo<player.maxAmmo){player.reload=1.25;toast('Reloading musket…')}}
function shoot(from,dir,faction,damage=24,speed=520,siege=false){SFX.play(siege||damage>=80?'cannon':'musket',from.x,from.y);if(bullets.length<MAX_BULLETS)bullets.push({x:from.x+Math.cos(dir)*17,y:from.y+Math.sin(dir)*17,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,life:1.7,faction,damage,r:siege?5:4,siege});for(let i=0;i<4;i++)addParticle({x:from.x+Math.cos(dir)*12,y:from.y+Math.sin(dir)*12,vx:rand(-35,35)+Math.cos(dir)*rand(15,55),vy:rand(-35,35)+Math.sin(dir)*rand(15,55),life:rand(.12,.28),max:.28,color:'#f4d58c',r:rand(1,3)})}
function sword(){if(player.sword>0)return;player.sword=.42;SFX.play('sword');let hit=0;for(const s of farmAnimals){if(s.hp>0&&dist(player,s)<(s.kind==='cow'?62:48)&&Math.abs(Math.atan2(Math.sin(angle(player,s)-player.dir),Math.cos(angle(player,s)-player.dir)))<1.25){damageAnimal(s,36);hit++}}for(const e of enemies){if(e.hp>0&&dist(player,e)<58&&Math.abs(Math.atan2(Math.sin(angle(player,e)-player.dir),Math.cos(angle(player,e)-player.dir)))<1.25){e.hp-=48;hit++ ;if(e.hp<=0)kill(e)}}for(const c of camps){if(!c.destroyed&&dist(player,c)<c.r+40){damageCamp(c,70);hit++}}if(hit)toast('Sword strike!')}
function spawnWave(){
 const alive=camps.filter(c=>!c.destroyed);if(!alive.length)return;
 wave++;ui.wave.textContent=wave;banner('ENEMY WAVE '+wave);SFX.play('horn');
 // fewer camps standing means smaller waves
 const active=enemies.reduce((n,e)=>n+(e.hp>0?1:0),0);
 const available=Math.max(0,MAX_ACTIVE_ENEMIES-active);
 const D=DIFFICULTIES[difficulty],count=Math.min(MAX_WAVE_ENEMIES,available,Math.max(Math.round(12*D.count),Math.ceil((18+Math.min(wave,14)*6)*alive.length/camps.length*D.count)));
 if(count<=0)return;
 const waveGroups=[];
 for(let i=0;i<count;i++){
  const campIndex=i%alive.length,camp=alive[campIndex];let type='rifleman';const roll=Math.random();
  if(wave>=7&&roll<.045)type='elephant';else if(wave>=3&&roll<.15)type='cavalry';else if(wave>=2&&roll<.34)type='archer';else if(wave>=2&&roll<.52)type='spearman';else if(roll<(wave>=2?.68:.3))type='swordsman';
  const e=makeSoldier(camp.x+rand(-90,90),camp.y+rand(-90,90),camp.faction,type,false);e.hp=Math.round((e.hp+Math.min(45,Math.floor(wave*.6)))*D.hp);e.max=e.hp;
  const groupIndex=Math.floor(i/6),groupKey=campIndex+':'+groupIndex;
  let formation=waveGroups.find(g=>g.key===groupKey);
  if(!formation){formation={key:groupKey,members:[],leader:null,x:e.x,y:e.y,dir:angle(e,{x:WORLD.cx,y:WORLD.cy}),kind:groupIndex%2?'line':'wedge'};waveGroups.push(formation)}
  e.waveFormation=formation;e.waveFormationIndex=formation.members.length;formation.members.push(e);if(!formation.leader)formation.leader=e;
  enemies.push(e);
 }
 if(wave>=4&&wave%2===0&&active+count<MAX_ACTIVE_ENEMIES){const camp=alive[Math.floor(rand(0,alive.length))],a=Math.atan2(camp.y-WORLD.cy,camp.x-WORLD.cx),cr=rand(580,640),e=makeSoldier(WORLD.cx+Math.cos(a)*cr+rand(-70,70),WORLD.cy+Math.sin(a)*cr+rand(-70,70),camp.faction,'cannon',false);e.hp=130;e.max=130;enemies.push(e)}
 spawnClock=0;waveActive=true;
}
// One scripted opening assault: deployed once by start(), never by spawnWave().
function spawnOpeningArmy(){
 // Four national armies attack from their camps, plus a fifth multinational army
 // deployed on the middle-left flank. This scripted force appears only at battle start.
 const nations=[
  {faction:'france',camp:CAMP_SITES[0]},
  {faction:'spain',camp:CAMP_SITES[1]},
  {faction:'portugal',camp:CAMP_SITES[2]},
  {faction:'england',camp:CAMP_SITES[3]}
 ];
 const troopTypes=[
  'swordsman','swordsman','spearman','spearman','rifleman',
  'swordsman','spearman','rifleman','rifleman','rifleman',
  'swordsman','swordsman','spearman','rifleman','rifleman',
  'swordsman','spearman','spearman','rifleman','rifleman'
 ];
 for(const nation of nations){
  const camp=nation.camp,dx=WORLD.cx-camp.x,dy=WORLD.cy-camp.y,len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len,px=-uy,py=ux;
  const infantryX=camp.x+ux*310,infantryY=camp.y+uy*310;
  // Four five-man formations spread across each country's front.
  for(let groupIndex=0;groupIndex<4;groupIndex++){
   const offset=(groupIndex-1.5)*76,leaderX=infantryX+px*offset,leaderY=infantryY+py*offset;
   const formation={members:[],leader:null,x:leaderX,y:leaderY,dir:Math.atan2(uy,ux),kind:groupIndex%2?'line':'wedge'};
   for(let slot=0;slot<5;slot++){
    const type=troopTypes[groupIndex*5+slot];
    const e=makeSoldier(leaderX+rand(-15,15),leaderY+rand(-15,15),nation.faction,type,false);
    e.waveFormation=formation;e.waveFormationIndex=formation.members.length;
    formation.members.push(e);if(!formation.leader)formation.leader=e;
    enemies.push(e);
   }
  }
  // Three artillery pieces per country, positioned behind the infantry.
  for(let gun=0;gun<3;gun++){
   const offset=(gun-1)*118;
   const e=makeSoldier(camp.x+ux*145+px*offset+rand(-10,10),camp.y+uy*145+py*offset+rand(-10,10),nation.faction,'cannon',false);
   e.hp=e.max=145;e.attack=rand(.5,2.2);e.openingArtillery=true;enemies.push(e);
  }
 }
 // Fifth force: 4 national detachments converge from the middle-left of the map.
 // Each contributes 15 infantry and 4 cannons: 60 soldiers + 16 artillery.
 const flank={x:620,y:1800};
 for(let n=0;n<nations.length;n++){
  const nation=nations[n],baseAngle=(-.30+n*.20),ux=Math.cos(baseAngle),uy=Math.sin(baseAngle);
  const infantryX=flank.x+ux*150,infantryY=flank.y+uy*150;
  // Three five-man groups per nation, arranged as alternating wedge/line formations.
  for(let groupIndex=0;groupIndex<3;groupIndex++){
   const offset=(groupIndex-1)*92,px=-uy,py=ux,leaderX=infantryX+px*offset,leaderY=infantryY+py*offset;
   const formation={members:[],leader:null,x:leaderX,y:leaderY,dir:baseAngle,kind:groupIndex%2?'line':'wedge'};
   for(let slot=0;slot<5;slot++){
    const type=troopTypes[(groupIndex*5+slot)%troopTypes.length];
    const e=makeSoldier(leaderX+rand(-14,14),leaderY+rand(-14,14),nation.faction,type,false);
    e.waveFormation=formation;e.waveFormationIndex=formation.members.length;
    formation.members.push(e);if(!formation.leader)formation.leader=e;
    enemies.push(e);
   }
  }
  // Four additional cannons per nation support the central-left assault.
  for(let gun=0;gun<4;gun++){
   const offset=(gun-1.5)*105;
   const e=makeSoldier(flank.x-ux*95+(-uy)*offset+rand(-9,9),flank.y-uy*95+ux*offset+rand(-9,9),nation.faction,'cannon',false);
   e.hp=e.max=145;e.attack=rand(.5,2.2);e.openingArtillery=true;enemies.push(e);
  }
 }
 banner('FIVE-ARMY ASSAULT · 140 SOLDIERS · 28 CANNONS');
 toast('Four nations attack from their camps, reinforced by a multinational army on the middle-left flank');
}
const corpses=[];
function kill(e){if(e.dead)return;e.dead=true;SFX.play('kill',e.x,e.y);if(e.type!=='cannon'){corpses.push({x:e.x,y:e.y,dir:(e.dir||0)+rand(.8,2.2),faction:e.faction,type:e.type,life:16,max:16});if(corpses.length>90)corpses.shift()}const pts=e.type==='elephant'?120:e.type==='cavalry'?55:25;score+=pts;floaters.push({x:e.x,y:e.y-12,text:'+'+pts,life:1,max:1});for(let i=0;i<9;i++)addParticle({x:e.x,y:e.y,vx:rand(-80,80),vy:rand(-80,80),life:rand(.25,.65),max:.65,color:i%2?'#b8a27a':'#6e3d32',r:rand(2,5)})}
function nearestEnemy(p,max=900){let best=null,bd=max;for(const e of enemies){if(e.hp<=0)continue;const d=dist(p,e);if(d<bd){bd=d;best=e}}return best}
// Reserves hold their line: they only react to enemies inside the fort or pressing against its walls.
function nearestThreat(p,max=900){let best=null,bd=max;for(const e of enemies){if(e.hp<=0||Math.hypot(e.x-WORLD.cx,e.y-WORLD.cy)>440)continue;const d=dist(p,e);if(d<bd){bd=d;best=e}}return best}
function update(dt){if(state!=='playing')return;const breachOpen=walls.some(w=>w.hp<=0);if(victoryTimer>0){victoryTimer-=dt;if(victoryTimer<=0){victory();return}}elapsed+=dt;hudRefreshTimer+=dt;toastTimer=Math.max(0,toastTimer-dt);if(!toastTimer)ui.toast.classList.remove('show');bannerTimer=Math.max(0,bannerTimer-dt);if(!bannerTimer)ui.banner.classList.remove('show');
const mx=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+mobileMove.x,my=(keys.KeyS||keys.ArrowDown?1:0)-(keys.KeyW||keys.ArrowUp?1:0)+mobileMove.y;const ml=Math.hypot(mx,my)||1,mobileMoving=Math.hypot(mobileMove.x,mobileMove.y)>.12;player.vx=mx/ml*190;player.vy=my/ml*190;moveLand(player,player.vx*dt,player.vy*dt);pushOutOfWalls(player,12,true);
const aim=worldPoint(mouse.x,mouse.y);if(mobileAimActive)player.dir=Math.atan2(mobileAim.y,mobileAim.x);else if(mobileMoving)player.dir=Math.atan2(mobileMove.y,mobileMove.x);else if(mouse.x||mouse.y)player.dir=angle(player,aim);if(touchFire&&!mobileAimActive&&!mobileMoving){const target=nearestEnemy(player,1000);if(target)player.dir=angle(player,target);else{const camp=camps.filter(c=>!c.destroyed).sort((a,b)=>dist(player,a)-dist(player,b))[0];if(camp)player.dir=angle(player,camp)}}player.fire=Math.max(0,player.fire-dt);player.sword=Math.max(0,player.sword-dt);player.invuln=Math.max(0,player.invuln-dt);
if(player.reload>0){player.reload-=dt;if(player.reload<=0){player.ammo=player.maxAmmo;toast('Musket reloaded')}}if((mouse.down||touchFire)&&player.fire<=0&&player.reload<=0){if(player.ammo>0){shoot(player,player.dir,'couto',40,760);player.ammo--;player.fire=.28}else reload()}
if(cannonCooldown>0)cannonCooldown-=dt;
 for(const r of RIVER_DEFS)for(const b of r.bridges){if(riverBridgeAt(player.x,player.y,r)===b&&!b.chargeSent)launchCavalryCharge(b)}
if(!enemies.some(e=>!e.campGuard)){if(waveActive){waveActive=false;repairWalls()}spawnClock+=dt;if(spawnClock>waveGap)spawnWave()}else spawnClock=0;
for(const w of walls)w.flash=Math.max(0,w.flash-dt);updateCamps(dt);updateSheep(dt);updateCavalryCharges(dt);
for(const g of guards){if(g.hp<=0)continue;const target=nearestEnemy(g,215);if(target){g.dir=angle(g,target);g.attack-=dt;if(g.attack<=0){shoot(g,g.dir,'couto',eliteDamage(g),500);g.attack=rand(1.2,2.1)}}else{const dx=g.home.x-g.x,dy=g.home.y-g.y;moveToward(g,g.home,Math.hypot(dx,dy)*Math.min(1,dt*1.5))}}
for(let i=0;i<escorts.length;i++){
 const g=escorts[i];if(g.hp<=0)continue;
 const a=escortFormation==='line'?player.dir+Math.PI/2:-Math.PI/2+i*Math.PI*2/Math.max(1,escorts.length);
  const slot=escortFormation==='line'?{x:player.x-Math.cos(player.dir)*42+Math.cos(a)*(i-(escorts.length-1)/2)*28,y:player.y-Math.sin(player.dir)*42+Math.sin(a)*(i-(escorts.length-1)/2)*28}:{x:player.x+Math.cos(a)*48,y:player.y+Math.sin(a)*48};
 const target=nearestEnemy(g,185);let camp=null;
 if(!target)for(const c of camps){if(!c.destroyed&&dist(g,c)<c.r+45&&dist(player,c)<c.r+260){camp=c;break}}
 if(target){const dd=dist(g,target);g.dir=angle(g,target);if(dd>29)stepTo(g,routeTo(g,target),105*dt);else{g.attack-=dt;if(g.attack<=0){target.hp-=34;g.attack=.68;if(target.hp<=0)kill(target)}}}
 else if(camp){g.dir=angle(g,camp);g.attack-=dt;if(g.attack<=0){damageCamp(camp,40);g.attack=.68}}
 else{const dd=dist(g,slot);if(dd>13)g.dir=stepTo(g,routeTo(g,slot),Math.min(230*dt,dd))}
}
for(const d of defenders){
 if(d.hp<=0)continue;
 const target=nearestThreat(d,430);
 if(target){
  const dd=dist(d,target);d.dir=angle(d,target);
  if(dd>38)moveToward(d,target,86*dt)
  else{d.attack-=dt;if(d.attack<=0){target.hp-=d.type==='spearman'&&target.type==='cavalry'?52:30;if(d.type==='spearman'&&target.type==='cavalry')target.hp-=24;d.attack=d.type==='spearman'?.82:.72;if(target.hp<=0)kill(target)}}
 }else if(d.post){
  const pd=dist(d,d.post);if(pd>4)d.dir=moveToward(d,d.post,Math.min(86*dt,pd))
 }
}
// Farm peasants hold their ground and pelt nearby attackers with stones from slings.
for(const p of peasants){
 if(p.hp<=0)continue;
 const target=nearestEnemy(p,310);
 if(target){
  p.dir=angle(p,target);p.attack-=dt;
  if(p.attack<=0){shoot(p,p.dir,'couto',9,450);p.attack=rand(1.65,2.05)}
 }else{
  const d=dist(p,p.home);if(d>3)p.dir=moveToward(p,p.home,Math.min(48*dt,d));
 }
}
for(const e of enemies){
 if(e.hp<=0)continue;
 e.attack-=dt;
 if(e.impactReset>0){e.impactReset-=dt;if(e.impactReset<=0)e.chargeImpactReady=true}
  if(e.chargeCamp){
  const camp=e.chargeCamp;
  if(camp.destroyed){e.chargeCamp=null;continue}
  let threat=player,td=dist(e,player);
  for(const ally of friendlyUnits)if(ally.hp>0&&dist(e,ally)<td){threat=ally;td=dist(e,ally)}
  const goal=td<620?threat:player,gd=dist(e,goal),formation=e.chargeFormation;
  if(formation){
   // If the point horse is killed, promote the first surviving rider and
   // rebuild the remaining wedge around that rider instead of freezing.
   if(!formation.leader||formation.leader.hp<=0){
    const survivors=formation.members.filter(h=>h.hp>0).sort((a,b)=>a.chargeIndex-b.chargeIndex);
    formation.leader=survivors[0]||null;
    survivors.forEach((h,i)=>h.chargeIndex=i);
    if(formation.leader){formation.x=formation.leader.x;formation.y=formation.leader.y;formation.dir=angle(formation.leader,goal)}
   }
   if(e===formation.leader){
    e.dir=angle(e,goal);
    if(gd>34)moveEnemyToward(e,goal,e.chargeSpeed*dt);
    formation.x=e.x;formation.y=e.y;formation.dir=e.dir;
    // A wide wedge cannot fit on the narrow bridge deck. Collapse the whole
    // charge into a single-file column while the leader is near any river.
    formation.column=riverDistance(e.x,e.y)<245;
   }else{
    const fd=formation.dir,index=e.chargeIndex;
    let slot;
    if(formation.column){
     // Queue riders behind the leader; each rider independently follows the
     // same bridge-safe navigation route to its moving slot.
     const back=index*27;
     slot={x:formation.x-Math.cos(fd)*back,y:formation.y-Math.sin(fd)*back};
    }else{
     let row=0,start=0;while(index>=start+row+1){start+=row+1;row++}
     const col=index-start,cols=row===5?5:row+1;
     const lateral=(col-(cols-1)/2)*31,back=row*38;
     slot={x:formation.x-Math.cos(fd)*back-Math.sin(fd)*lateral,y:formation.y-Math.sin(fd)*back+Math.cos(fd)*lateral};
    }
    e.dir=angle(e,slot);
    if(dist(e,slot)>13)moveEnemyToward(e,slot,e.chargeSpeed*dt);
   }
  }else{e.dir=angle(e,goal);if(gd>34)moveEnemyToward(e,goal,e.chargeSpeed*dt)}
  if(gd<=34&&e.attack<=0){const impact=e.chargeImpactReady===false?22:30;if(goal===player){if(player.invuln<=0){player.hp-=impact;player.invuln=.45}}else{goal.hp-=impact;if(goal.type==='spearman')e.hp-=34;else if(goal.hp>0){const shove=angle(e,goal);moveLand(goal,Math.cos(shove)*26,Math.sin(shove)*26)}}e.chargeImpactReady=false;e.impactReset=goal.type==='spearman'?1.9:1.15;e.attack=.72}
  continue;
 }
 if(e.campGuard){campGuardAI(e,dt);continue}
 // Once a breach exists, every ground assault unit uses it to enter the courtyard.
 // Keep each unit committed to one opening until it has crossed the wall line.
 if(breachOpen&&e.type!=='cannon'){
  if(insideFort(e)){e.breachStage=2;e.breachWallId=null}
  else{
   if(e.breachStage===2){e.breachStage=0;e.breachWallId=null}
   let breach=e.breachWallId?walls.find(w=>w.id===e.breachWallId):null;
   if(!breach||breach.hp>0){
    breach=null;let nearest=Infinity;
    for(const w of walls)if(w.hp<=0){const d=dist(e,{x:w.mx,y:w.my});if(d<nearest){nearest=d;breach=w}}
    if(breach){e.breachWallId=breach.id;e.breachStage=0}
   }
   if(breach){
    // Bastions are circular and their centres sit outside the curtain line.
    // Offset waypoints beyond each structure's thickness so the inner waypoint
    // is actually inside the fortress for both bastion and curtain breaches.
    const breachThickness=breach.kind==='bastion'?breach.r:breach.half;
    const outerOffset=breachThickness+52,innerOffset=breachThickness+68;
    const outer={x:breach.mx+breach.nx*outerOffset,y:breach.my+breach.ny*outerOffset};
    const inner={x:breach.mx-breach.nx*innerOffset,y:breach.my-breach.ny*innerOffset};
    if(e.breachStage!==1&&dist(e,outer)<28)e.breachStage=1;
    const entry=e.breachStage===1?inner:outer;
    const assaultSpeed=e.type==='elephant'?42:e.type==='cavalry'?105:e.type==='spearman'?68:82;
    e.dir=angle(e,entry);moveEnemyToward(e,entry,assaultSpeed*dt);
    continue;
   }
  }
 }
 // Wave infantry and ranged troops advance in compact line/wedge groups.
 // Formations dissolve near combat range so units can siege and fight normally.
 const waveFormation=e.waveFormation;
 if(waveFormation){
  const nearby=nearbyFriendly(e,520);const formationTarget=nearby||(!breachOpen&&dist(e,player)<240?player:{x:WORLD.cx,y:WORLD.cy});
  if(dist(e,formationTarget)>270){
   if(!waveFormation.leader||waveFormation.leader.hp<=0){
    waveFormation.leader=waveFormation.members.find(m=>m.hp>0)||null;
    if(waveFormation.leader){waveFormation.x=waveFormation.leader.x;waveFormation.y=waveFormation.leader.y}
   }
   if(waveFormation.leader){
    if(e===waveFormation.leader){
     e.dir=angle(e,formationTarget);
     moveEnemyToward(e,formationTarget,(e.type==='elephant'?42:e.type==='cavalry'?82:66)*dt);
     waveFormation.x=e.x;waveFormation.y=e.y;waveFormation.dir=e.dir;
    }else{
     const index=e.waveFormationIndex;let sx=0,sy=0;
     if(waveFormation.kind==='line'){
      const lateral=(index-(waveFormation.members.length-1)/2)*25;
      sx=waveFormation.x-Math.sin(waveFormation.dir)*lateral-Math.cos(waveFormation.dir)*34;
      sy=waveFormation.y+Math.cos(waveFormation.dir)*lateral-Math.sin(waveFormation.dir)*34;
     }else{
      const row=Math.ceil((Math.sqrt(8*index+1)-1)/2),start=row*(row-1)/2,col=index-start;
      const lateral=(col-(row-1)/2)*27,back=row*32;
      sx=waveFormation.x-Math.cos(waveFormation.dir)*back-Math.sin(waveFormation.dir)*lateral;
      sy=waveFormation.y-Math.sin(waveFormation.dir)*back+Math.cos(waveFormation.dir)*lateral;
     }
     const slot={x:sx,y:sy};e.dir=angle(e,slot);
     if(dist(e,slot)>12)moveEnemyToward(e,slot,78*dt);
    }
    continue;
   }
  }
  e.waveFormation=null;
 }
 // Wave enemies assault the fortress by default. They only divert to the
 // player when the player comes within close engagement range, then resume
 // the fortress assault once the player moves away.
 const playerDistance=dist(e,player),nearby=nearbyFriendly(e,520);
 const target=nearby||(!breachOpen&&playerDistance<240?player:{x:WORLD.cx,y:WORLD.cy});
 const d=dist(e,target);e.dir=angle(e,target);
 if(e.type==='cannon'){
  // Opening artillery advances from the western staging line, then holds siege range.
  if(d>390)moveEnemyToward(e,target,36*dt);
  else if(e.attack<=0){shoot(e,e.dir,'enemy',30,285,true);e.attack=3.1}
  continue;
 }
 const rad=unitRadius(e),inside=insideFort(e),coreDistance=Math.hypot(e.x-WORLD.cx,e.y-WORLD.cy);
 if(coreDistance<145&&e.attack<=0){fortress=Math.max(0,fortress-(e.type==='elephant'?8:e.type==='cavalry'?4.5:2.4));e.attack=1.0;continue;}
 // melee troops outside the fort cannot reach the defenders: they must break a wall, gate or bastion first
 if(e.type!=='rifleman'&&!inside&&behindWalls(target)&&!target.peasant){siege(e,dt,rad);continue}
 if(e.type==='archer'){
   if(d>255)moveEnemyToward(e,target,66*dt);else if(d<175)moveEnemyToward(e,{x:e.x-Math.cos(e.dir)*70,y:e.y-Math.sin(e.dir)*70},48*dt);
   else if(e.attack<=0){shoot(e,e.dir,'enemy',10,470);e.attack=1.9}
   continue;
  }
  if(e.type==='elephant'||e.type==='cavalry'){
  const speed=e.type==='elephant'?42:105;
  if(d>34)moveEnemyToward(e,target,speed*dt)
  else if(e.attack<=0){if(target===player){if(player.invuln<=0){player.hp-=e.type==='elephant'?22:15;player.invuln=.45}}else if(target.hp!==undefined){if(target.type==='spearman'){target.hp-=e.type==='elephant'?32:20;e.hp-=e.type==='cavalry'?30:0}else target.hp-=e.type==='elephant'?32:20}e.attack=1.05}
  continue;
 }
 if(e.type==='swordsman'||e.type==='spearman'){
  const reach=e.type==='spearman'?39:31;
  if(d>reach)moveEnemyToward(e,target,(e.type==='spearman'?68:82)*dt)
  else if(e.attack<=0){const damage=e.type==='spearman'?21:19;if(target===player){if(player.invuln<=0){player.hp-=damage;player.invuln=.48}}else if(target.hp!==undefined)target.hp-=damage;e.attack=e.type==='spearman'?1.0:.78}
  continue;
 }
 // Musketeers keep a firing distance and shoot at the closest defender.
 // Pressed against the walls they fire from there: the walls give the defenders cover.
 const atWalls=!inside&&coreDistance<440&&d<450;
 if(d>190&&!atWalls){const sp=coreDistance>700?85:47;moveEnemyToward(e,target,sp*dt)}
 else if(e.attack<=0){shoot(e,e.dir,'enemy',13,390);e.attack=1.65}
}
// intact walls, gates and bastions are solid
for(const e of enemies)if(e.hp>0&&e.type!=='cannon')pushOutOfWalls(e,unitRadius(e));
for(const g of escorts)if(g.hp>0)pushOutOfWalls(g,9,true);

for(const d of defenders)if(d.hp>0)pushOutOfWalls(d,9,true);
for(const e of enemies){if(e.hp<=0&&!e.dead)kill(e)}
let aliveEnemyCount=0;for(const e of enemies)if(e.hp>0)enemies[aliveEnemyCount++]=e;enemies.length=aliveEnemyCount;
for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.faction==='enemy'){if(dist(b,player)<17&&player.invuln<=0){player.hp-=b.damage;player.invuln=.4;b.life=0;continue}for(const g of friendlyUnits){if(g.hp>0&&dist(b,g)<15){g.hp-=b.damage;b.life=0;break}}if(b.life>0)for(const s of farmAnimals){if(s.hp>0&&dist(b,s)<(s.kind==='cow'?19:13)){damageAnimal(s,b.damage);b.life=0;break}}if(b.life>0)for(const w of walls){if(w.hp>0&&wallContact(w,b).sep<(b.siege?6:3)){damageWall(w,b.siege?55:b.damage*.08,b.x,b.y);b.life=0;break}}}else{for(const c of camps){if(!c.destroyed&&dist(b,c)<c.r*.8){damageCamp(c,b.damage*.85);b.life=0;break}}if(b.life>0)for(const e of enemies){if(e.hp>0&&dist(b,e)<(e.type==='elephant'?27:14)){e.hp-=b.damage;b.life=0;break}}if(b.life>0)for(const s of farmAnimals){if(s.hp>0&&dist(b,s)<(s.kind==='cow'?19:13)){damageAnimal(s,b.damage);b.life=0;break}}}}
let liveBulletCount=0;for(const b of bullets)if(b.life>0)bullets[liveBulletCount++]=b;bullets.length=liveBulletCount;
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt}let liveParticleCount=0;for(const p of particles)if(p.life>0)particles[liveParticleCount++]=p;particles.length=liveParticleCount;
for(let i=corpses.length-1;i>=0;i--){corpses[i].life-=dt;if(corpses[i].life<=0)corpses.splice(i,1)}
for(const f of floaters){f.y-=26*dt;f.life-=dt}let liveFloaterCount=0;for(const f of floaters)if(f.life>0)floaters[liveFloaterCount++]=f;floaters.length=liveFloaterCount;
for(const v of villagers){v.panic=Math.max(0,v.panic-dt);if(!v.panic&&enemies.some(e=>e.hp>0&&dist(v,e)<210))v.panic=1.5;if(v.panic){v.x+=Math.cos(v.dir+Math.PI)*v.speed*2*dt;v.y+=Math.sin(v.dir+Math.PI)*v.speed*2*dt}else{v.dir+=rand(-.4,.4)*dt;v.x+=Math.cos(v.dir)*v.speed*dt;v.y+=Math.sin(v.dir)*v.speed*dt}v.x=clamp(v.x,WORLD.cx-205,WORLD.cx+205);v.y=clamp(v.y,WORLD.cy-165,WORLD.cy+165)}
hurtBuzz();if(victoryTimer<=0&&(player.hp<=0||fortress<=0))gameOver();SFX.listener.x=player.x;SFX.listener.y=player.y;camera.x=clamp(player.x,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(player.y,vh/(2*zoom),WORLD.h-vh/(2*zoom));if(hudRefreshTimer>=.12){hudRefreshTimer=0;updateHud()}}
function eliteDamage(){return 24}
function nearestFriendly(e){let best=player,bd=dist(e,player);for(const g of friendlyUnits){if(g.hp>0&&dist(e,g)<bd){best=g;bd=dist(e,g)}}return best}
function nearbyFriendly(e,max=520){const target=nearestFriendly(e);return dist(e,target)<=max?target:null}
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
function buildCartRoadRoutes(){
 const routes=[];
 for(const river of RIVER_DEFS)for(const b of river.bridges){
  let gate=GATE_ANGLES[0],gateScore=Infinity;
  for(const a of GATE_ANGLES){const d=Math.hypot(WORLD.cx+Math.cos(a)*430-b.x,WORLD.cy+Math.sin(a)*430-b.y);if(d<gateScore){gateScore=d;gate=a}}
  let camp=CAMP_SITES[0],campScore=Infinity;
  for(const c of CAMP_SITES){const d=Math.hypot(c.x-b.x,c.y-b.y);if(d<campScore){campScore=d;camp=c}}
  const start={x:WORLD.cx+Math.cos(gate)*430,y:WORLD.cy+Math.sin(gate)*430};
  const axis={x:-Math.sin(b.angle||0),y:Math.cos(b.angle||0)};
  const p1={x:b.x-axis.x*88,y:b.y-axis.y*88},p2={x:b.x+axis.x*88,y:b.y+axis.y*88};
  const first=Math.hypot(start.x-p1.x,start.y-p1.y)<=Math.hypot(start.x-p2.x,start.y-p2.y);
  const entry=first?p1:p2,exit=first?p2:p1;
  const campDx=b.x-camp.x,campDy=b.y-camp.y,campD=Math.max(1,Math.hypot(campDx,campDy));
  const finish={x:camp.x+campDx/campD*92,y:camp.y+campDy/campD*92};
  const dx=entry.x-start.x,dy=entry.y-start.y,d=Math.max(1,Math.hypot(dx,dy));
  const side=(Math.round(b.x/100)+Math.round(b.y/100))%2?1:-1;
  const bend=b.x<700?34:145+(Math.round(b.x/10)%4)*38;
  const approach={x:(start.x+entry.x)*.5-(dy/d)*bend*side,y:(start.y+entry.y)*.5+(dx/d)*bend*side};
  const ex=finish.x-exit.x,ey=finish.y-exit.y,ed=Math.max(1,Math.hypot(ex,ey));
  const departBend=b.x<700?26:115+(Math.round(b.y/10)%4)*34;
  const departure={x:(exit.x+finish.x)*.5-(ey/ed)*departBend*side,y:(exit.y+finish.y)*.5+(ex/ed)*departBend*side};
  routes.push({start,approach,entry,exit,departure,finish});
 }
 // Four outward roads leave each camp and continue all the way to the map edge.
 for(let i=0;i<CAMP_SITES.length;i++){
  const camp=CAMP_SITES[i],dx=camp.x-WORLD.cx,dy=camp.y-WORLD.cy,d=Math.max(1,Math.hypot(dx,dy)),ux=dx/d,uy=dy/d;
  const tx=ux>0?(WORLD.w-camp.x)/ux:ux<0?(0-camp.x)/ux:Infinity;
  const ty=uy>0?(WORLD.h-camp.y)/uy:uy<0?(0-camp.y)/uy:Infinity;
  const t=Math.min(tx,ty),start={x:camp.x+ux*92,y:camp.y+uy*92},finish={x:camp.x+ux*t,y:camp.y+uy*t};
  const bend=(i%2?1:-1)*125,control={x:(start.x+finish.x)*.5-uy*bend,y:(start.y+finish.y)*.5+ux*bend};
  routes.push({edge:true,start,control,finish});
 }
 return routes;
}
const CART_ROAD_ROUTES=buildCartRoadRoutes();
function drawCartRoads(project,scale){
 const routes=CART_ROAD_ROUTES,p=project||((p)=>p);
 ctx.lineCap='round';ctx.lineJoin='round';
 routes.forEach((r,index)=>{
  const drawPath=()=>{
   ctx.beginPath();
   if(r.edge){const a=p(r.start),b=p(r.control),c=p(r.finish);ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(b.x,b.y,c.x,c.y)}
   else{const a=p(r.start),b=p(r.approach),c=p(r.entry),d=p(r.exit),e=p(r.departure),f=p(r.finish);ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(b.x,b.y,c.x,c.y);ctx.lineTo(d.x,d.y);ctx.quadraticCurveTo(e.x,e.y,f.x,f.y)}
  };
  const width=(index%3===0?1.08:index%3===1?.92:1)*scale;
  // Uneven, dark verges and layered compacted earth create an old muddy cart track.
  drawPath();ctx.strokeStyle='rgba(42,37,27,.58)';ctx.lineWidth=43*width;ctx.stroke();
  drawPath();ctx.strokeStyle='#665239';ctx.lineWidth=36*width;ctx.stroke();
  drawPath();ctx.strokeStyle=index%2?'#89724e':'#927b54';ctx.lineWidth=27*width;ctx.stroke();
  // Pale worn centre, with broken muddy patches instead of a painted road marking.
  drawPath();ctx.strokeStyle='rgba(180,157,112,.30)';ctx.lineWidth=12*width;ctx.setLineDash([34*scale,22*scale,12*scale,18*scale]);ctx.lineDashOffset=index*13*scale;ctx.stroke();
  // Two dark wheel ruts, deliberately irregular and intermittent.
  drawPath();ctx.strokeStyle='rgba(52,43,31,.58)';ctx.lineWidth=2.8*scale;ctx.setLineDash([18*scale,13*scale,7*scale,21*scale]);ctx.lineDashOffset=index*7*scale;ctx.stroke();
  drawPath();ctx.strokeStyle='rgba(194,170,124,.34)';ctx.lineWidth=1.4*scale;ctx.setLineDash([5*scale,31*scale,12*scale,20*scale]);ctx.lineDashOffset=index*17*scale;ctx.stroke();
  ctx.setLineDash([]);
 });
 ctx.lineCap='butt';ctx.lineJoin='miter';ctx.lineDashOffset=0;
}
// Small countryside farms, safely separated from all strategic map features.
// Traditional medieval field clusters: no modern buildings, just irregular crop strips,
// rough hedges, timber fencing, hay and narrow footpaths.
const FARM_SITES=[
 // Northern fields
 {x:1320,y:390,turn:-.12,kind:0},{x:2100,y:390,turn:.11,kind:1},{x:2860,y:390,turn:.16,kind:1},
 // Western and central-western countryside
 {x:760,y:1450,turn:-.18,kind:1},{x:760,y:2110,turn:.28,kind:0},{x:650,y:2650,turn:-.12,kind:1},
 {x:1400,y:2400,turn:.2,kind:0},
 // Eastern fields
 {x:3160,y:1450,turn:.16,kind:0},{x:3160,y:2050,turn:-.22,kind:1},{x:2900,y:2400,turn:-.1,kind:0},
 // Southern farmland, above the river bend
 {x:1260,y:3170,turn:.18,kind:1},{x:2100,y:3100,turn:-.2,kind:0},{x:2910,y:3160,turn:-.14,kind:0}
];
function farmSiteSafe(f){
 if(f.x<260||f.y<260||f.x>WORLD.w-260||f.y>WORLD.h-260)return false;
 if(Math.hypot(f.x-WORLD.cx,f.y-WORLD.cy)<650||riverDistance(f.x,f.y)<230)return false;
 for(const c of CAMP_SITES)if(Math.hypot(f.x-c.x,f.y-c.y)<520)return false;
 for(const r of RIVER_DEFS)for(const b of r.bridges)if(Math.hypot(f.x-b.x,f.y-b.y)<250)return false;
 return true;
}
function drawFieldPlot(x,y,w,h,seed,crop){
 ctx.save();ctx.translate(x,y);ctx.rotate(seed*.17);
 // Uneven earth boundary, deliberately hand-shaped rather than a rectangle.
 ctx.beginPath();ctx.moveTo(-w*.48,-h*.34);ctx.quadraticCurveTo(-w*.2,-h*.58,w*.18,-h*.48);
 ctx.quadraticCurveTo(w*.58,-h*.42,w*.48,-h*.05);ctx.quadraticCurveTo(w*.58,h*.42,w*.12,h*.48);
 ctx.quadraticCurveTo(-w*.28,h*.55,-w*.49,h*.19);ctx.quadraticCurveTo(-w*.58,-h*.08,-w*.48,-h*.34);ctx.closePath();
 ctx.fillStyle='#55452f';ctx.fill();ctx.strokeStyle='#776044';ctx.lineWidth=3;ctx.stroke();
 ctx.save();ctx.clip();
 // Furrows follow the field's long axis with subtle irregularity.
 for(let row=-h*.42;row<=h*.42;row+=Math.max(7,h*.19)){
  ctx.beginPath();ctx.moveTo(-w*.56,row);
  ctx.bezierCurveTo(-w*.2,row-3,w*.16,row+4,w*.56,row-1);
  ctx.strokeStyle='rgba(35,31,23,.48)';ctx.lineWidth=2.4;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-w*.55,row+2.5);ctx.bezierCurveTo(-w*.2,row,w*.16,row+7,w*.55,row+2);
  ctx.strokeStyle='rgba(190,158,99,.24)';ctx.lineWidth=1.4;ctx.stroke();
 }
 // Sparse crop tufts, with alternating crop colours and natural gaps.
 for(let row=-h*.34,ri=0;row<=h*.34;row+=Math.max(11,h*.28),ri++){
  for(let col=-w*.4,ci=0;col<=w*.4;col+=Math.max(13,w*.13),ci++){
   if(((ci*7+ri*11+seed*13)|0)%9===0)continue;
   const px=col+Math.sin(ci*2+seed)*2,py=row+Math.cos(ri+ci+seed)*2;
   ctx.fillStyle=crop?(ci+ri)%3?'#78864a':'#a18b4f':'#718047';
   ctx.beginPath();ctx.ellipse(px,py,2.1,3.3,.35,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.restore();ctx.restore();
}
function drawRoughFence(points,gateAt=-1){
 ctx.strokeStyle='#493a29';ctx.lineWidth=3;ctx.lineCap='round';
 ctx.beginPath();points.forEach((p,i)=>{if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1])});ctx.stroke();
 for(let i=0;i<points.length;i++){
  if(i===gateAt)continue;
  const [x,y]=points[i];ctx.fillStyle='#765b39';ctx.save();ctx.translate(x,y);ctx.rotate((i%2?.18:-.12));
  ctx.fillRect(-2,-5,4,11);ctx.fillStyle='#a08354';ctx.fillRect(-3,-5,6,2);ctx.restore();
 }
}
function drawFarm(f){
 if(!farmSiteSafe(f)||!onScreen(f.x,f.y,250))return;
 ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.turn);
 // Small, separated field parcels with grassy margins: an old patchwork farm landscape.
 ctx.fillStyle='rgba(55,47,31,.15)';ctx.beginPath();ctx.ellipse(0,0,205,142,-.08,0,Math.PI*2);ctx.fill();
 drawFieldPlot(-91,-43,108,73,f.kind+1,true);
 drawFieldPlot(57,-58,118,62,f.kind+3,false);
 drawFieldPlot(69,48,132,72,f.kind+5,true);
 drawFieldPlot(-91,65,83,55,f.kind+7,false);
 // Broken hedge lines and short timber rails divide the plots without boxing them in.
 ctx.strokeStyle='#405637';ctx.lineWidth=7;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(-171,-92);ctx.quadraticCurveTo(-117,-116,-59,-105);
 ctx.moveTo(107,-108);ctx.quadraticCurveTo(155,-94,170,-54);
 ctx.moveTo(-165,108);ctx.quadraticCurveTo(-126,126,-92,117);ctx.stroke();
 for(let i=0;i<9;i++){
  const x=-158+i*37,y=-116+Math.sin(i*.8)*5;
  ctx.fillStyle=i%2?'#536c3d':'#647747';ctx.beginPath();ctx.arc(x,y,5+(i%3),0,Math.PI*2);ctx.fill();
 }
 drawRoughFence([[-171,-20],[-178,12],[-167,42]],1);
 drawRoughFence([[132,82],[165,99],[185,86],[194,58]]);
 // Two tiny haystacks and a feeding trough, not buildings.
 for(const [x,y,r] of [[-148,5,10],[145,-17,8]]){
  ctx.fillStyle='rgba(42,34,24,.2)';ctx.beginPath();ctx.ellipse(x+2,y+5,r+3,r*.55,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#b49a58';ctx.beginPath();ctx.ellipse(x,y,r,r*.72,-.2,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#d1b76f';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y-2,r*.65,Math.PI,Math.PI*2);ctx.stroke();
 }
 // A narrow worn footpath joins the plots; it stays within the farm cluster.
 ctx.strokeStyle='#88734f';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();
 ctx.moveTo(-16,132);ctx.quadraticCurveTo(6,109,18,84);ctx.quadraticCurveTo(28,58,16,29);ctx.stroke();
 ctx.strokeStyle='rgba(193,168,119,.36)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,130);ctx.quadraticCurveTo(7,108,19,83);ctx.stroke();
 ctx.restore();
}
function drawFarms(){for(const f of FARM_SITES)drawFarm(f)}
function drawTerrain(){ctx.fillStyle='#526b43';ctx.fillRect(0,0,vw,vh);ctx.save();ctx.translate(vw/2,vh/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
 // Layered meadow colours, grass tufts and small stones make the open field feel lived-in.
 ctx.fillStyle='#65784a';for(let i=0;i<260;i++){const x=(i*197)%WORLD.w,y=(i*317)%WORLD.h;if(!onScreen(x,y,50))continue;const rx=12+(i*17)%24,ry=7+(i*11)%12,rotation=((i*13)%60)/10;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);ctx.fill()}
 drawTerrainDetails();
 // Organic cart roads with varied bends, shared with the minimap.
 drawCartRoads(null,1);
 drawRiversAndBridges();
 for(const c of camps)drawEnemyCamp(c);
 drawTrees();drawFarms();drawFortress();ctx.restore()}
function drawRiverPath(r){
 ctx.beginPath();
 for(let i=0;i<r.curves.length;i++){
  const c=r.curves[i];
  if(i===0)ctx.moveTo(c[0][0],c[0][1]);
  ctx.bezierCurveTo(c[1][0],c[1][1],c[2][0],c[2][1],c[3][0],c[3][1]);
 }
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
   const drift=Math.sin(performance.now()/1000*.9+k*1.3)*7;ctx.globalAlpha=.7+.3*Math.sin(performance.now()/1000*1.6+k);
   ctx.moveTo(x-15+drift,cy+Math.sin(k*1.7)*24);ctx.quadraticCurveTo(x,cy+Math.cos(k*1.2)*18,x+20,cy+Math.sin(k*.8)*22);ctx.stroke();
  }
  ctx.globalAlpha=1;
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
 // Restore compact bridge dimensions; fixed centre and vertical orientation unchanged.
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
let TREE_DECORATIONS=null;
function drawTrees(){
 // Tree placement and river/camp clearance are static: calculate them once, not 360 times per frame.
 if(!TREE_DECORATIONS){
  TREE_DECORATIONS=[];
  for(let i=0;i<360;i++){
   const x=(i*271+85)%WORLD.w,y=(i*193+40)%WORLD.h;
   if(Math.hypot(x-WORLD.cx,y-WORLD.cy)<540||riverDistance(x,y)<92)continue;
   let near=false;for(const camp of CAMP_SITES)if(Math.hypot(x-camp.x,y-camp.y)<190){near=true;break}
   if(!near)TREE_DECORATIONS.push({i,x,y,r:10+(i*7)%11,leaf:5+(i*3)%6});
  }
 }
 for(const t of TREE_DECORATIONS){
  const {i,x,y,r,leaf}=t;if(!onScreen(x,y,38))continue;
  ctx.fillStyle='rgba(24,34,23,.28)';ctx.beginPath();ctx.ellipse(x+3,y+7,r+3,r*.65,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=i%3===0?'#304a30':'#3d5a36';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=i%4===0?'#83905a':'#6c8150';ctx.beginPath();ctx.arc(x-4,y-5,leaf,0,Math.PI*2);ctx.fill();
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
// ---------- Detailed creatures: animated gait, uniforms, equipment and breeds ----------
const TAU=Math.PI*2;
// Accumulates a stride phase from the distance actually walked, so legs only move when the body does.
function walkPhase(c,k=.2){
 if(c.wpx===undefined){c.wpx=c.x;c.wpy=c.y;c.wp=Math.random()*TAU;c.moving=false}
 const d=Math.hypot(c.x-c.wpx,c.y-c.wpy);c.wpx=c.x;c.wpy=c.y;
 c.moving=d>.04&&d<40;if(c.moving)c.wp+=d*k;
 return c.wp;
}
function creatureSeed(c){if(c.seed===undefined)c.seed=Math.abs(Math.floor((c.home?c.home.x:c.x)*13+(c.home?c.home.y:c.y)*7+c.x*3))%997+1;return c.seed}
function seededRng(seed){let r=seed*9301+49297;return()=>{r=(r*9301+49297)%233280;return r/233280}}
function disc(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}
function oval(x,y,rx,ry,fill,rot=0){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,TAU);ctx.fill()}
function line(x1,y1,x2,y2,color,w){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function drawHealthBar(c,y,w=22){
 if(!(c.hp<c.max))return;
 ctx.save();ctx.translate(c.x,c.y);
 ctx.fillStyle='#251b16';ctx.fillRect(-w/2-1,y-1,w+2,5);
 const r=clamp(c.hp/c.max,0,1);ctx.fillStyle=r>.5?'#79a85f':r>.25?'#d1b46c':'#c64d3d';ctx.fillRect(-w/2,y,w*r,3);
 ctx.restore();
}
// ----- animals -----
function drawFarmAnimal(a){
 if(!onScreen(a.x,a.y,42))return;
 const sc=a.scale||1,seed=creatureSeed(a),wp=walkPhase(a,a.kind==='cow'?.3:.55),mv=a.moving;
 ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.dir||0);ctx.scale(sc,sc);
 if(a.kind==='cow'){
  const bob=mv?Math.sin(wp*2)*.5:Math.sin(a.phase*.25)*.3,v=seed%5;
  const base=v===3?'#8a5a35':v===4?'#7a4228':'#efeadc',patch=v===3?'#efeadc':v===4?'#c9a27a':'#2b2824';
  oval(1,6,22,12,'rgba(22,29,20,.26)');
  // hooves peek out beyond the flanks and swing with the gait
  for(const [lx,ly,ph] of [[-11,-1,0],[-11,1,Math.PI],[9,-1,Math.PI],[9,1,0]]){const sw=mv?Math.sin(wp+ph)*4:0;oval(lx+sw,ly*11.5,3.2,2.2,'#2d241c')}
  // tail swishes behind the rump
  const tw=Math.sin(a.phase*.9)*6;ctx.strokeStyle=base;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-20,0);ctx.quadraticCurveTo(-27,tw*.4,-30,tw);ctx.stroke();oval(-31,tw,2.2,3,'#2b2824');
  // body with a breed-specific coat, patched deterministically
  oval(-2,bob,21,12.5,base);
  ctx.save();ctx.beginPath();ctx.ellipse(-2,bob,21,12.5,0,0,TAU);ctx.clip();
  const rnd=seededRng(seed);for(let k=0;k<5;k++)oval(-17+rnd()*28,-8+rnd()*16+bob,4+rnd()*6,3+rnd()*5,patch,rnd()*3);
  ctx.restore();
  ctx.strokeStyle='rgba(0,0,0,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(-2,bob,21,12.5,0,0,TAU);ctx.stroke();
  line(-17,bob,10,bob,'rgba(0,0,0,.16)',1.4); // spine
  oval(-12,bob-6,5,3,'rgba(255,255,255,.12)');oval(-12,bob+6,5,3,'rgba(0,0,0,.1)');
  // neck, bell collar, head
  oval(12,bob,8.5,8,base);ctx.strokeStyle='#c9a24a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(14,bob-7);ctx.lineTo(14,bob+7);ctx.stroke();disc(14,bob+7,2,'#d9b24c');
  oval(20,bob,8,6.8,base);oval(26,bob,4.5,4.6,'#d5a58f');
  disc(27.5,bob-1.7,.9,'#6d4a3c');disc(27.5,bob+1.7,.9,'#6d4a3c');
  disc(21,bob-5,1.1,'#17140f');disc(21,bob+5,1.1,'#17140f');
  oval(17,bob-8.5,3.6,1.9,v>2?base:patch,-.4);oval(17,bob+8.5,3.6,1.9,v>2?base:patch,.4);
  ctx.strokeStyle='#cdbf97';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(18,bob-5);ctx.quadraticCurveTo(17,bob-9.5,20,bob-11);ctx.moveTo(18,bob+5);ctx.quadraticCurveTo(17,bob+9.5,20,bob+11);ctx.stroke();
 }else{
  // chicken: breed from seed, one in seven is a rooster
  const rooster=seed%7===0,v=seed%4,body=['#f2eee3','#b07a45','#3b332d','#9a6a3a'][v],wing=['#d9d3c3','#8d5c30','#241f1b','#74502c'][v];
  const pk=Math.max(0,Math.sin(a.phase*.9));const peck=pk*pk*pk,hb=mv?Math.sin(wp*2)*.8:0;
  oval(0,4,9,5,'rgba(22,29,20,.24)');
  // scratching feet
  for(const [ph,s] of [[0,-1],[Math.PI,1]]){const sw=mv?Math.sin(wp+ph)*3:0;line(0+sw,s*2.2,-1+sw+3,s*4.6,'#d38b3a',1.3);line(sw+3,s*4.6,sw+5,s*4.8,'#d38b3a',1)}
  // fanned tail
  const tc=rooster?['#24493a','#1f6b52','#7a4a22']:[wing,body,wing];
  for(let k=-2;k<=2;k++){ctx.strokeStyle=tc[Math.abs(k)%3];ctx.lineWidth=rooster?2.2:2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-6,k);ctx.quadraticCurveTo(-11,k*2.4,-(rooster?17:13),k*3.8+hb);ctx.stroke()}
  oval(-1,0,7.6,5.2,body);oval(-2,-3.5,5,2.5,wing,.1);oval(-2,3.5,5,2.5,wing,-.1);
  ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(-1,0,7.6,5.2,0,0,TAU);ctx.stroke();
  // head dips while pecking
  const hx=6.2+peck*2.6;oval(hx,0,3.3,3,body);
  oval(hx+.3,0,rooster?1.5:1,rooster?3.6:2.6,'#cf3b34'); // comb
  ctx.fillStyle='#e0a13a';ctx.beginPath();ctx.moveTo(hx+3,-1.4);ctx.lineTo(hx+6.4,0);ctx.lineTo(hx+3,1.4);ctx.closePath();ctx.fill();
  disc(hx+2.2,0,.8,'#cf3b34');disc(hx+1.3,-2,.7,'#17140f');disc(hx+1.3,2,.7,'#17140f');
 }
 ctx.restore();
 if(a.hp<a.max||a.flash>0){const sy=a.kind==='cow'?-22:-14,w=(a.kind==='cow'?30:18);ctx.save();ctx.translate(a.x,a.y);ctx.fillStyle='#241f19';ctx.fillRect(-w/2,sy,w,3);ctx.fillStyle=a.hp/a.max>.35?'#8eaf68':'#c65343';ctx.fillRect(-w/2+1,sy+1,(w-2)*clamp(a.hp/a.max,0,1),1.5);ctx.restore()}
}
function drawSheep(s){
 if(!onScreen(s.x,s.y,34))return;
 const seed=creatureSeed(s),wp=walkPhase(s,.5),mv=s.moving,v=seed%4;
 const face=['#554b40','#3a322b','#6e5e4c','#4a3f35'][v],wool=['#ece5d1','#e3dcc8','#d9d3c3','#f0ead8'][v],shade=['#c9bfa2','#bdb59b','#b0a994','#cfc6aa'][v];
 const sc=s.wool||1,bob=mv?Math.sin(wp*2)*.5:Math.sin(s.phase*.3)*.3,graze=mv?0:Math.max(0,Math.sin(s.phase*.35))*2.2;
 ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.dir||0);
 oval(0,6,16*sc,9,'rgba(22,29,20,.25)');
 // dark hooves step out from under the fleece
 for(const [lx,ly,ph] of [[-8,-1,0],[-8,1,Math.PI],[7,-1,Math.PI],[7,1,0]]){const sw=mv?Math.sin(wp+ph)*2.6:0;oval(lx*sc+sw,ly*9.2*sc,2.3,1.7,face)}
 // fleece: a shaded underlayer, then lighter overlapping curls
 const curls=[[-10,-4],[-5,-8],[2,-9],[9,-5],[10,2],[4,7],[-5,7],[-12,2],[-1,0],[-7,-1],[4,-2],[0,-5],[0,5]];
 ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(-.4,-.4+bob,14.6*sc,10.6*sc,0,0,TAU);ctx.fill();
 for(const p of curls){disc(p[0]*sc+.7,p[1]*sc+bob+.8,4.7*sc,shade)}
 for(let i=0;i<curls.length;i++){const p=curls[i];disc(p[0]*sc,p[1]*sc+bob,4.5*sc,wool);if(i%3===0)disc(p[0]*sc-1.2,p[1]*sc+bob-1.2,1.5*sc,'rgba(255,255,255,.35)')}
 oval(-14.5*sc,bob,3.1,2.7,wool);oval(-15.2*sc,bob+.4,1.4,1.2,shade); // woolly tail
 // head with drooping ears, muzzle and eyes; it dips while grazing
 const hx=12.5*sc-graze;oval(hx-3,bob,4,4.6,shade);
 oval(hx,bob,5.4,4.3,face);oval(hx+4.4,bob,2.7,2.3,'#8a7864');disc(hx+6.3,bob-.8,.6,'#1b1713');disc(hx+6.3,bob+.8,.6,'#1b1713');
 oval(hx-1,bob-5,3.3,1.5,'#6a5a49',-.6);oval(hx-1,bob+5,3.3,1.5,'#6a5a49',.6);
 disc(hx+1.8,bob-2.5,.8,'#f1ead6');disc(hx+1.8,bob+2.5,.8,'#f1ead6');disc(hx+2.1,bob-2.5,.45,'#17140f');disc(hx+2.1,bob+2.5,.45,'#17140f');
 ctx.restore();
 if(s.hp<s.max||s.flash>0){ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#241f19';ctx.fillRect(-13,-20,26,3);ctx.fillStyle=s.hp/s.max>.35?'#8eaf68':'#c65343';ctx.fillRect(-12,-19,24*clamp(s.hp/s.max,0,1),1.5);ctx.restore()}
}
function drawCannon(x,y,a){
 ctx.save();ctx.translate(x,y);ctx.rotate(a);
 oval(0,2,27,13,'rgba(20,22,16,.28)');
 // timber trail and spoked wheels seen from above
 ctx.fillStyle='#5a4630';ctx.fillRect(-27,-2.6,18,5.2);ctx.fillStyle='#493724';ctx.fillRect(-27,-2.6,18,1.3);
 for(const wy of [-13,9]){ctx.fillStyle='#2f261b';ctx.fillRect(-10,wy,20,4.2);ctx.fillStyle='#8a6d43';ctx.fillRect(-10,wy+.7,20,2.8);for(let sx=-8;sx<=8;sx+=4)line(sx,wy,sx,wy+4.2,'#3b2d1d',.9);ctx.fillStyle='#b5a06c';ctx.fillRect(-1.5,wy+.6,3,3)}
 line(0,-9,0,9,'#3b2d1d',2.2); // axle
 // iron barrel with brass reinforcing rings, breech button and muzzle swell
 ctx.fillStyle='#262a28';ctx.beginPath();ctx.moveTo(-22,-3.2);ctx.lineTo(14,-4.6);ctx.lineTo(23,-5.4);ctx.lineTo(23,5.4);ctx.lineTo(14,4.6);ctx.lineTo(-22,3.2);ctx.closePath();ctx.fill();
 ctx.fillStyle='rgba(190,200,190,.18)';ctx.fillRect(-20,-2.5,40,1.5);
 for(const rx of [-9,3,14]){ctx.fillStyle='#b58f45';ctx.fillRect(rx,-4.8-rx*.01,3,9.6+rx*.02)}
 disc(-23.5,0,2.8,'#1f2321');ctx.fillStyle='#14110e';ctx.fillRect(22,-3,2,6);
 ctx.restore();
}
// Uniform pieces shared by every foot soldier.
function drawHat(c,f,isPlayer,leader){
 const militia=c.friendly&&!c.elite&&!isPlayer;
 if(militia){oval(.8,.8,9,9,'rgba(0,0,0,.25)');disc(0,0,8.6,'#b99a5e');ctx.strokeStyle='#8c7040';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,8.6,0,TAU);ctx.stroke();disc(0,0,4.6,'#9b7e48');ctx.strokeStyle='#5d4429';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,4.6,0,TAU);ctx.stroke();return}
 if(c.type==='archer'){disc(0,0,5.8,'#5a4a30');ctx.strokeStyle='#3a2e1c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,5.8,0,TAU);ctx.stroke();line(1,-3,-7,-6,'#9bb06b',2);return}
 if(c.type==='rifleman'&&!isPlayer&&!c.elite){
  // shako: dark cylinder with a coloured band and pompom
  disc(0,0,5.2,f.dark);ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,5.2,0,TAU);ctx.stroke();
  ctx.strokeStyle=f.b;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,3.8,0,TAU);ctx.stroke();disc(0,0,2.8,'rgba(255,255,255,.08)');disc(0,0,1.4,f.b);
  if(leader)line(0,0,-8,4,'#d9533d',2.6);return;
 }
 // bicorne worn side-on, with gold lace, cockade and a feather for officers and the player
 oval(0,0,4.4,8.4,f.dark);ctx.strokeStyle=f.b;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(0,0,4.4,8.4,0,0,TAU);ctx.stroke();
 line(-2,0,2,0,'rgba(255,255,255,.2)',1.1);disc(1.4,-6.8,1.7,f.b);disc(1.4,-6.8,.7,'#f6f1df');
 if(leader||isPlayer){ctx.strokeStyle=isPlayer?'#f1d477':'#d9533d';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-1,1);ctx.quadraticCurveTo(-7,5,-10,2);ctx.stroke();ctx.lineCap='butt'}
}
function drawSoldier(c,f,isPlayer,wp){
 const mv=c.moving,sw=mv?Math.sin(wp)*4:0,coat=isPlayer?'#244b36':c.friendly&&!c.elite?'#8b6843':f.a,trim=f.b;
 const leader=!!((c.waveFormation&&c.waveFormation.leader===c)||(c.chargeFormation&&c.chargeFormation.leader===c));
 const type=isPlayer?(player&&player.sword>0?'swordsman':'rifleman'):c.type;
 oval(1,3,11,13,'rgba(15,20,14,.28)');
 // boots swing with the stride; the knapsack rides on the back
 oval(sw,-4.6,4.2,2.7,'#22190f');oval(-sw,4.6,4.2,2.7,'#22190f');
 ctx.fillStyle='#3a2d1d';ctx.fillRect(-12.5,-5.5,6,11);ctx.fillStyle='#4d3b26';ctx.fillRect(-12.5,-5.5,6,2.4);
 if(type==='archer'){ctx.fillStyle='#5b4128';ctx.fillRect(-10,3,10,4);line(-9,5,-14,7,'#d9c79d',1);line(-6,5,-11,8,'#d9c79d',1)}
 // greatcoat, facings and white cross-belts
 oval(0,0,7.8,11.2,coat);ctx.strokeStyle='rgba(0,0,0,.42)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,7.8,11.2,0,0,TAU);ctx.stroke();
 oval(1,0,3.4,10,'rgba(255,255,255,.07)');
 line(-5.5,-8.5,5.5,6.5,'#e6dfc8',1.7);line(-5.5,8.5,5.5,-6.5,'#e6dfc8',1.7);disc(0,0,1.6,'#c9a24a');
 disc(0,-10.6,2.7,trim);disc(0,10.6,2.7,trim);ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(0,-10.6,2.7,0,TAU);ctx.arc(0,10.6,2.7,0,TAU);ctx.stroke();
 // arms and weapon
 ctx.lineCap='round';
 if(type==='swordsman'){
  ctx.strokeStyle=coat;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(8,3);ctx.moveTo(2,-9);ctx.lineTo(6,-8.5);ctx.stroke();
  // buckler on the off arm, bright steel blade with gilt guard
  disc(7,-9.5,5,'#6b4f2d');ctx.strokeStyle=trim;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(7,-9.5,5,0,TAU);ctx.stroke();disc(7,-9.5,1.7,'#c9c2a8');
  line(8,3,10,2,'#5a3f24',2.4);line(10,-1.5,10,5.5,'#c9a24a',2);
  ctx.strokeStyle='#e4e8ea';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(10.5,2);ctx.lineTo(27,1);ctx.stroke();line(11,1.2,26,.4,'rgba(255,255,255,.7)',.8);
 }else if(type==='spearman'){
  ctx.strokeStyle=coat;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(9,3);ctx.moveTo(2,-9);ctx.lineTo(17,-1);ctx.stroke();
  line(-9,2,36,1.2,'#8a6a3f',2.4);ctx.fillStyle='#d4d8da';ctx.beginPath();ctx.moveTo(35,-2.2);ctx.lineTo(44,1.2);ctx.lineTo(35,4.6);ctx.closePath();ctx.fill();
  ctx.fillStyle=f.a;ctx.beginPath();ctx.moveTo(29,1.2);ctx.lineTo(23,-4.5);ctx.lineTo(23,6.5);ctx.closePath();ctx.fill();
 }else if(type==='archer'){
  ctx.strokeStyle=coat;ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(8,2);ctx.moveTo(2,-9);ctx.lineTo(15,-4);ctx.stroke();
  ctx.strokeStyle='#5a3e26';ctx.lineWidth=2.6;ctx.beginPath();ctx.arc(13,0,10,-1.2,1.2);ctx.stroke();line(13+10*Math.cos(1.2),10*Math.sin(1.2),13+10*Math.cos(1.2),-10*Math.sin(1.2),'#d9c79d',.9);
  line(5,0,24,0,'#d9c79d',1.1);ctx.fillStyle='#ddd0ad';ctx.beginPath();ctx.moveTo(24,-1.4);ctx.lineTo(28,0);ctx.lineTo(24,1.4);ctx.fill();
 }else{
  // musket: walnut stock, blued barrel, brass bands and a bayonet
  ctx.strokeStyle=coat;ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(9,3);ctx.moveTo(2,-9);ctx.lineTo(17,-.5);ctx.stroke();
  line(1,2.4,14,1.6,'#6b4a2b',3.2);line(14,1.6,28,.4,'#3a3d3d',2);line(15,.9,27,-.1,'rgba(190,200,200,.5)',.7);
  disc(18,.9,1.2,'#b58f45');disc(24,.5,1.2,'#b58f45');line(28,.4,36,0,'#cfd3d6',1.1);
 }
 ctx.lineCap='butt';
 // bare hands, then the head and hat seen from above
 disc(type==='spearman'?17:type==='archer'?15:type==='swordsman'?6:17,type==='swordsman'?-8.5:-.5,1.9,'#d8b990');disc(9,3,1.9,'#d8b990');
 disc(1.2,0,5.6,'#d8b990');drawHat(c,f,isPlayer,leader);
 if(isPlayer){ctx.strokeStyle='#f6df9a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,17,0,TAU);ctx.stroke()}
 if(c.elite){ctx.strokeStyle='#f1d477';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,15,0,TAU);ctx.stroke()}
}
function drawPeasant(c,f,wp){
 const sw=c.moving?Math.sin(wp)*3.5:0;
 oval(1,3,10,12,'rgba(15,20,14,.26)');
 oval(sw,-4.5,3.8,2.5,'#3a2a1a');oval(-sw,4.5,3.8,2.5,'#3a2a1a');
 // rough smock with a rope belt and a sling bag
 oval(0,0,7.8,11,'#9b7548');ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,7.8,11,0,0,TAU);ctx.stroke();
 oval(-1,0,2.5,9,'rgba(255,255,255,.08)');line(1,-9.5,1,9.5,'#6f5233',2);ctx.fillStyle='#6b5030';ctx.fillRect(-11,-4,6,8);
 disc(0,-10.4,2.6,'#8a643a');disc(0,10.4,2.6,'#8a643a');
 // sling: loaded pouch swings from the hand
 const swing=Math.sin(c.attack*8)*.4;ctx.strokeStyle='#57412c';ctx.lineWidth=3.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(2,9);ctx.lineTo(9,5);ctx.moveTo(2,-9);ctx.lineTo(8,-5);ctx.stroke();ctx.lineCap='butt';
 ctx.strokeStyle='#d8c69b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(9,5);ctx.quadraticCurveTo(17,4+swing*10,20,-1+swing*8);ctx.stroke();disc(20,-1+swing*8,2.2,'#7d7a72');
 disc(9,5,1.8,'#d8b990');disc(8,-5,1.8,'#d8b990');
 disc(1.2,0,5.4,'#d8b990');oval(.8,.8,9.6,9.6,'rgba(0,0,0,.22)');disc(0,0,9,'#c4a568');ctx.strokeStyle='#8c7040';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,9,0,TAU);ctx.stroke();disc(0,0,4.6,'#a88a4f');ctx.strokeStyle='#57412c';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(0,0,4.6,0,TAU);ctx.stroke();
}
const HORSE_COATS=['#5e4934','#3b2d22','#8a6a45','#74726c','#2a2420'];
function drawHorseman(c,f,wp){
 const mv=c.moving,coat=HORSE_COATS[(c.id||0)%5],dark='#2b221a';
 oval(0,5,27,13,'rgba(15,20,14,.28)');
 // four legs in a gallop; hooves reach beyond the body outline
 for(const [lx,ly,ph] of [[9,-1,0],[9,1,.9],[-12,-1,Math.PI],[-12,1,Math.PI+.9]]){const sx=mv?Math.sin(wp*1.1+ph)*7:0;line(lx,ly*5.5,lx+sx,ly*8.5,'#3f3022',3.2);oval(lx+sx,ly*9,2.6,1.9,dark)}
 // tail streams behind
 const tw=mv?Math.sin(wp*.8)*5:Math.sin(c.attack*3)*2;ctx.strokeStyle=dark;ctx.lineWidth=3.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-21,0);ctx.quadraticCurveTo(-29,tw*.4,-35,tw);ctx.stroke();ctx.lineCap='butt';
 oval(-3,0,20.5,9.6,coat);oval(-10,-3.5,7,3,'rgba(255,255,255,.1)');oval(-10,3.5,7,3,'rgba(0,0,0,.14)');
 ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(-3,0,20.5,9.6,0,0,TAU);ctx.stroke();
 // neck, mane, head with ears and a pale muzzle
 oval(14,0,9.5,5.6,coat);line(8,0,19,0,dark,2.4);
 oval(23,0,7,4.4,coat);oval(28,0,3.4,3.2,'#4a3a2c');disc(29.5,-1.2,.7,'#17120d');disc(29.5,1.2,.7,'#17120d');disc(23.6,-3.4,.9,'#14100c');disc(23.6,3.4,.9,'#14100c');
 ctx.fillStyle=coat;ctx.beginPath();ctx.moveTo(19.5,-3);ctx.lineTo(17,-5.8);ctx.lineTo(21.5,-4.4);ctx.moveTo(19.5,3);ctx.lineTo(17,5.8);ctx.lineTo(21.5,4.4);ctx.fill();
 // saddle cloth and bridle
 oval(-2,0,6.4,8,f.a);ctx.strokeStyle=f.b;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(-2,0,6.4,8,0,0,TAU);ctx.stroke();
 line(17,-2,26,-2.6,'#2b2118',.9);line(17,2,26,2.6,'#2b2118',.9);
 // rider: coat, reins, helmet with a trailing plume, drawn sabre
 oval(-2,0,5.2,7.4,f.a);line(-6,-6,2,5,'#e6dfc8',1.4);line(-6,6,2,-5,'#e6dfc8',1.4);disc(-2,-7,2.2,f.b);disc(-2,7,2.2,f.b);
 ctx.strokeStyle=f.a;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-6.5);ctx.lineTo(14,-2);ctx.moveTo(0,6.5);ctx.lineTo(8,8);ctx.stroke();ctx.lineCap='butt';
 line(8,8,27,14,'#e4e8ea',2.2);line(7,6.5,8,9.5,'#c9a24a',2);disc(8,8,1.8,'#d8b990');disc(14,-2,1.8,'#d8b990');
 disc(-1,0,4.4,'#d8b990');disc(-1,0,5.4,'#6f7478');ctx.strokeStyle=f.b;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(-1,0,5.4,0,TAU);ctx.stroke();disc(-1,0,2,'#9aa0a4');
 ctx.strokeStyle='#d9533d';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-5,0);ctx.quadraticCurveTo(-11,mv?Math.sin(wp)*3:0,-14,0);ctx.stroke();ctx.lineCap='butt';
}
function drawElephant(c,f,wp){
 const mv=c.moving,sway=mv?Math.sin(wp)*5:0,flap=mv?Math.sin(wp*1.4)*.12:Math.sin(c.attack*2)*.05;
 oval(0,6,34,25,'rgba(15,20,14,.3)');
 for(const [lx,ly,ph] of [[15,-1,0],[15,1,Math.PI],[-15,-1,Math.PI],[-15,1,0]]){const s=mv?Math.sin(wp+ph)*5:0;oval(lx+s,ly*15,7,5.6,'#5f5849');oval(lx+s,ly*15,4.6,3.4,'#8c8266')}
 const tw=mv?Math.sin(wp*1.2)*4:0;ctx.strokeStyle='#6a6354';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-29,0);ctx.quadraticCurveTo(-35,tw,-37,tw*1.6);ctx.stroke();ctx.lineCap='butt';
 oval(0,0,30,21,'#756e5c');ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(0,0,30,21,0,0,TAU);ctx.stroke();
 for(let k=-3;k<=3;k++)line(-22,k*5.2,22,k*5.2+1,'rgba(40,36,28,.18)',1);
 oval(-2,-4,16,5,'rgba(255,255,255,.07)');
 // ears flap behind the head
 ctx.save();ctx.translate(19,0);for(const s of [-1,1]){ctx.save();ctx.rotate(s*(.35+flap));oval(-2,s*11,9.5,6.4,'#8a7f68');oval(-2,s*11,6,3.8,'rgba(180,120,110,.35)');ctx.restore()}ctx.restore();
 oval(28,0,12,10.8,'#7f7562');disc(35,-5,1.1,'#17140f');disc(35,5,1.1,'#17140f');
 // ivory tusks and a swinging trunk
 ctx.strokeStyle='#efe6cc';ctx.lineWidth=3.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(34,-6);ctx.quadraticCurveTo(43,-9,48,-5);ctx.moveTo(34,6);ctx.quadraticCurveTo(43,9,48,5);ctx.stroke();
 ctx.strokeStyle='#8c8068';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(36,0);ctx.quadraticCurveTo(46+sway*.3,4,45,12+sway*.4);ctx.stroke();ctx.strokeStyle='#6f6552';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(45,10+sway*.4);ctx.lineTo(44,15+sway*.4);ctx.stroke();ctx.lineCap='butt';
 // painted war blanket, howdah canopy and the mahout
 ctx.fillStyle=f.a;ctx.beginPath();ctx.ellipse(-1,0,22,16.5,0,0,TAU);ctx.fill();ctx.strokeStyle=f.b;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(-1,0,22,16.5,0,0,TAU);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#6b4f2d';ctx.fillRect(-13,-9.5,25,19);ctx.fillStyle=f.b;ctx.fillRect(-13,-9.5,25,3);ctx.fillRect(-13,6.5,25,3);ctx.fillStyle='#d8c79c';ctx.fillRect(-10,-6.5,19,13);line(-10,0,9,0,'rgba(0,0,0,.18)',1);
 disc(-1,0,3.6,f.dark);disc(-1,0,2.3,'#d8b990');
 disc(16,0,4.3,'#d8b990');disc(16,0,5.4,f.b);disc(16,0,3.2,'#d8b990');
}
// Level of detail: when many units are on screen (or zoomed far out) foot soldiers get a cheaper silhouette.
let drawnThisFrame=0,crowded=false;
function updateCrowding(){crowded=drawnThisFrame>(crowded?100:135)||zoom<.7;drawnThisFrame=0}
function drawSimpleSoldier(c,f,isPlayer,wp){
 const sw=c.moving?Math.sin(wp)*3.5:0,peasant=c.peasant,coat=isPlayer?'#244b36':peasant?'#9b7548':c.friendly&&!c.elite?'#8b6843':f.a;
 oval(1,3,10,12,'rgba(15,20,14,.26)');oval(sw,-4.6,4,2.6,'#22190f');oval(-sw,4.6,4,2.6,'#22190f');
 oval(0,0,7.6,11,coat);line(-5,-8,5,6,'#e6dfc8',1.5);line(-5,8,5,-6,'#e6dfc8',1.5);
 if(c.type==='spearman')line(-9,2,40,1.2,'#8a6a3f',2.2);else if(c.type==='swordsman'&&!peasant)line(8,2,26,1,'#e4e8ea',2.3);else if(c.type==='archer'&&!peasant)disc(13,0,3,'#5a3e26');else if(!peasant)line(2,2,34,0,'#4a4338',2.4);
 disc(1,0,5.4,'#d8b990');
 if(peasant||(c.friendly&&!c.elite&&!isPlayer))disc(0,0,8.4,'#b99a5e'),disc(0,0,4.4,'#9b7e48');else oval(0,0,c.type==='rifleman'?5:4.4,c.type==='rifleman'?5:8.2,f.dark);
 if(isPlayer){ctx.strokeStyle='#f6df9a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,17,0,TAU);ctx.stroke()}
 if(c.elite){ctx.strokeStyle='#f1d477';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,15,0,TAU);ctx.stroke()}
}
function drawCharacter(c,isPlayer=false){
 if(!onScreen(c.x,c.y,70/zoom))return;drawnThisFrame++;
 const f=FACTIONS[c.faction]||FACTIONS.couto,type=isPlayer?'player':c.type;
 const wp=walkPhase(c,type==='elephant'?.06:type==='cavalry'?.085:.2);
 ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.dir||0);
 if(type==='cannon'){drawCannon(0,0,0);ctx.fillStyle=f.a;ctx.fillRect(-3,-12,9,6);ctx.fillStyle=f.b;ctx.fillRect(-3,-10,9,2)}
 else if(type==='elephant')drawElephant(c,f,wp);
 else if(type==='cavalry')drawHorseman(c,f,wp);
 else if(crowded&&!isPlayer)drawSimpleSoldier(c,f,false,wp);
 else if(c.peasant)drawPeasant(c,f,wp);
 else drawSoldier(c,f,isPlayer,wp);
 ctx.restore();
 if(!isPlayer)drawHealthBar(c,type==='elephant'?-36:type==='cavalry'?-30:type==='cannon'?-27:-25,type==='elephant'?34:type==='cavalry'?28:22);
}
function drawCorpse(k){
 if(!onScreen(k.x,k.y,50))return;
 const f=FACTIONS[k.faction]||FACTIONS.couto,big=k.type==='elephant'?2.4:k.type==='cavalry'?1.6:1;
 ctx.save();ctx.globalAlpha=clamp(k.life/4,0,1)*.9;ctx.translate(k.x,k.y);ctx.rotate(k.dir);ctx.scale(big,big);
 oval(0,1,13,9,'rgba(92,30,24,.38)');
 if(k.type==='cavalry'||k.type==='elephant'){oval(0,0,17,8,k.type==='elephant'?'#6d6657':'#5e4934');oval(15,1,6,4,k.type==='elephant'?'#7f7562':'#6e543a');oval(-2,0,5,6,f.a)}
 else{oval(0,0,8,5.4,k.faction==='couto'?'#8b6843':f.a);line(-4,-4,4,3,'#e6dfc8',1.2);oval(8,1,3.6,3.4,'#d8b990');oval(9,1,4,4.2,f.dark);line(-6,5,-14,7,'#22190f',2.6);line(-6,-4,-13,-6,'#22190f',2.6)}
 ctx.restore();
}
function draw(){updateCrowding();ctx.clearRect(0,0,vw,vh);drawTerrain();ctx.save();ctx.translate(vw/2,vh/2);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
for(const k of corpses)drawCorpse(k);
for(const v of villagers){ctx.fillStyle='#d1c19c';ctx.beginPath();ctx.arc(v.x,v.y,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#594d3b';ctx.fillRect(v.x-3,v.y-3,6,5)}
for(const s of sheep)drawSheep(s);for(const a of cows)drawFarmAnimal(a);for(const a of chickens)drawFarmAnimal(a);
for(const g of guards){if(g.hp>0)drawCharacter(g)}for(const g of escorts){if(g.hp>0)drawCharacter(g)}for(const d of defenders){if(d.hp>0)drawCharacter(d)}for(const p of peasants){if(p.hp>0)drawCharacter(p)}for(const e of enemies)if(e.hp>0)drawCharacter(e);drawCharacter(player,true);
for(const b of bullets){ctx.fillStyle=b.faction==='enemy'?'#e76d43':'#f4df9e';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill()}
for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
// floating score popups
ctx.textAlign='center';for(const f of floaters){ctx.globalAlpha=clamp(f.life/f.max*1.8,0,1);ctx.font=(f.big?'bold 15px':'bold 12px')+' Inter,Arial,sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#101a15';ctx.fillStyle=f.big?'#f0d38c':'#f3e6c5';ctx.strokeText(f.text,f.x,f.y);ctx.fillText(f.text,f.x,f.y)}ctx.globalAlpha=1;ctx.textAlign='left';
if(player.sword>0){const s={x:player.x,y:player.y};ctx.strokeStyle='#f7e2a4';ctx.lineWidth=4;ctx.beginPath();ctx.arc(s.x,s.y,38,player.dir-.8,player.dir+.8);ctx.stroke()}
ctx.restore();if(state==='playing'||state==='paused'){drawCampMarkers();drawOffscreenMarkers();drawMinimap()}if(state==='menu')drawMenuPreview()}
// arrows at the screen edge point to attackers that are outside the camera view
function drawCampMarkers(){
 const margin=32,top=116,bottom=vh-30,cx=vw/2,cy=(top+bottom)/2;
 // keep markers clear of the minimap (top-left) so their labels are never hidden behind it
 const mmW=Math.round(clamp(vw*.17,112,190)),mmR=12+mmW+8,mmB=88+Math.round(mmW*WORLD.h/WORLD.w)+10;
 for(const c of camps){if(c.destroyed)continue;const sp=screenPoint(c),sx=sp.x,sy=sp.y;if(sx>=margin&&sx<=vw-margin&&sy>=top&&sy<=bottom)continue;const dx=sx-cx,dy=sy-cy,hw=Math.max(1,vw/2-margin),hh=Math.max(1,(bottom-top)/2),k=Math.min(hw/Math.abs(dx||1e-6),hh/Math.abs(dy||1e-6)),px0=cx+dx*k,py=cy+dy*k,px=(px0<mmR+52&&py<mmB)?Math.min(mmR+52,vw-margin):px0,a=Math.atan2(dy,dx),f=FACTIONS[c.faction];
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

let MINIMAP_FOREST=null;
function drawMinimap(){
 const mw=Math.round(clamp(vw*.17,112,190)),mh=Math.round(mw*WORLD.h/WORLD.w),mx=12,my=88,sx=mw/WORLD.w,sy=mh/WORLD.h,X=x=>mx+x*sx,Y=y=>my+y*sy;
 ctx.save();
 // Framed map with subtle terrain relief.
 ctx.globalAlpha=.96;ctx.fillStyle='#101a15';ctx.fillRect(mx-5,my-5,mw+10,mh+10);
 ctx.fillStyle='#66794b';ctx.fillRect(mx,my,mw,mh);
 ctx.globalAlpha=1;
 for(let i=0;i<90;i++){
  const x=(i*173+61)%WORLD.w,y=(i*293+117)%WORLD.h;
  ctx.fillStyle=i%3?'rgba(35,63,38,.22)':'rgba(185,172,118,.16)';
  ctx.fillRect(X(x),Y(y),Math.max(1,mw/WORLD.w*34),Math.max(1,mh/WORLD.h*34));
 }
 // Rivers follow the same cubic curves as the main battlefield.
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const r of RIVER_DEFS){
  ctx.beginPath();
  for(let i=0;i<r.curves.length;i++){
   const c=r.curves[i];
   if(i===0)ctx.moveTo(X(c[0][0]),Y(c[0][1]));
   ctx.bezierCurveTo(X(c[1][0]),Y(c[1][1]),X(c[2][0]),Y(c[2][1]),X(c[3][0]),Y(c[3][1]));
  }
  ctx.strokeStyle='#263e40';ctx.lineWidth=Math.max(5,mw/WORLD.w*142);ctx.stroke();
  ctx.strokeStyle='#39777d';ctx.lineWidth=Math.max(3,mw/WORLD.w*94);ctx.stroke();
  ctx.strokeStyle='rgba(156,205,197,.48)';ctx.lineWidth=Math.max(1,mw/WORLD.w*3);ctx.stroke();
 }
 // Same varied road paths as the main battlefield, projected to minimap coordinates.
 drawCartRoads(p=>({x:X(p.x),y:Y(p.y)}),mw/WORLD.w);
 // Bridge decks are visible as short, bright cross-river markers.
 for(const river of RIVER_DEFS)for(const b of river.bridges){
  ctx.save();ctx.translate(X(b.x),Y(b.y));ctx.rotate(b.angle||0);
  ctx.fillStyle='#c59a61';ctx.fillRect(-Math.max(2,mw/WORLD.w*30),-Math.max(3,mh/WORLD.h*72),Math.max(4,mw/WORLD.w*60),Math.max(6,mh/WORLD.h*144));
  ctx.strokeStyle='#493321';ctx.lineWidth=1;ctx.strokeRect(-Math.max(2,mw/WORLD.w*30),-Math.max(3,mh/WORLD.h*72),Math.max(4,mw/WORLD.w*60),Math.max(6,mh/WORLD.h*144));
  ctx.restore();
 }
 // Fortress footprint, walls and gates.
 const fortPts=BASTION_ANGLES.map(a=>({x:X(WORLD.cx+Math.cos(a)*FORT.bastionR),y:Y(WORLD.cy+Math.sin(a)*FORT.bastionR)}));
 ctx.beginPath();fortPts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
 ctx.fillStyle='#a9a080';ctx.fill();ctx.strokeStyle='#e0d0a0';ctx.lineWidth=2;ctx.stroke();
 for(const a of GATE_ANGLES){
  const gx=X(WORLD.cx+Math.cos(a)*430),gy=Y(WORLD.cy+Math.sin(a)*430);
  ctx.fillStyle='#e4c47f';ctx.beginPath();ctx.arc(gx,gy,2.2,0,Math.PI*2);ctx.fill();
 }
 // Camps and their faction colours.
 for(const c of camps){
  const cx=X(c.x),cy=Y(c.y),f=FACTIONS[c.faction]||FACTIONS.couto;
  ctx.fillStyle=c.destroyed?'#59554b':f.a;ctx.fillRect(cx-3.5,cy-3.5,7,7);
  ctx.strokeStyle='#101a15';ctx.lineWidth=1;ctx.strokeRect(cx-3.5,cy-3.5,7,7);
  if(c.destroyed){ctx.strokeStyle='#eee1c7';ctx.beginPath();ctx.moveTo(cx-3,cy-3);ctx.lineTo(cx+3,cy+3);ctx.moveTo(cx+3,cy-3);ctx.lineTo(cx-3,cy+3);ctx.stroke()}
 }
 // Static minimap forest patches are also filtered once; only their projection changes with size.
 if(!MINIMAP_FOREST){
  MINIMAP_FOREST=[];
  for(let i=0;i<28;i++){
   const x=(i*317+190)%WORLD.w,y=(i*541+370)%WORLD.h;
   if(riverDistance(x,y)>=95&&Math.hypot(x-WORLD.cx,y-WORLD.cy)>=560)MINIMAP_FOREST.push({x,y});
  }
 }
 for(const p of MINIMAP_FOREST){
  ctx.fillStyle='rgba(27,49,30,.58)';ctx.beginPath();ctx.arc(X(p.x),Y(p.y),Math.max(1.2,mw/WORLD.w*38),0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(119,139,78,.8)';ctx.beginPath();ctx.arc(X(p.x)-1,Y(p.y)-1,Math.max(.7,mw/WORLD.w*17),0,Math.PI*2);ctx.fill();
 }
 // Enemy wave positions.
 ctx.fillStyle='#f06a5d';for(const e of enemies){if(e.hp>0&&!e.campGuard){ctx.beginPath();ctx.arc(X(e.x),Y(e.y),1.6,0,Math.PI*2);ctx.fill()}}
 // Current camera viewport and player marker.
 ctx.strokeStyle='rgba(255,238,185,.9)';ctx.lineWidth=1;
 ctx.strokeRect(X(camera.x-vw/(2*zoom)),Y(camera.y-vh/(2*zoom)),(vw/zoom)*sx,(vh/zoom)*sy);
 ctx.fillStyle='#fff0a8';ctx.beginPath();ctx.arc(X(player.x),Y(player.y),3,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#172019';ctx.stroke();
 ctx.strokeStyle='#d8c28c';ctx.lineWidth=1.2;ctx.strokeRect(mx-.5,my-.5,mw+1,mh+1);
 ctx.restore();
}
function drawMenuPreview(){ctx.save();ctx.globalAlpha=.18;ctx.translate(vw/2-camera.x*zoom,vh/2-camera.y*zoom);ctx.scale(zoom,zoom);ctx.strokeStyle='#d4b36a';ctx.lineWidth=3;pathPoly(starPoints(WORLD.cx,WORLD.cy,500,395));ctx.stroke();ctx.restore()}
const vignetteEl=$('vignette');
let runtimeError=null,debugOverlay=false,perfFrameMs=0,perfUpdateMs=0,perfDrawMs=0,perfFps=0,perfSamples=0;
function drawDebugOverlay(){
 if(!debugOverlay)return;
 const alive=enemies.reduce((n,e)=>n+(e.hp>0?1:0),0),friendly=guards.filter(e=>e.hp>0).length+escorts.filter(e=>e.hp>0).length+defenders.filter(e=>e.hp>0).length;
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=.94;ctx.fillStyle='#101812';ctx.fillRect(12,vh-150,285,138);
 ctx.globalAlpha=1;ctx.fillStyle='#e8d6a8';ctx.font='12px monospace';
 const lines=['DEBUG · F3 TO HIDE','FPS '+perfFps+'  FRAME '+perfFrameMs.toFixed(1)+' ms','UPDATE '+perfUpdateMs.toFixed(1)+' ms  DRAW '+perfDrawMs.toFixed(1)+' ms','ENEMIES '+alive+'  FRIENDLY '+friendly,'BULLETS '+bullets.length+'  PARTICLES '+particles.length,'RIVER SEGMENT TESTS '+riverCollisionChecks];
 lines.forEach((line,i)=>ctx.fillText(line,22,vh-130+i*19));ctx.restore();
}
function loop(now){
 const rawDt=(now-last)/1000||0,dt=Math.min(rawDt,.033);last=now;
 if(!runtimeError){
  try{
   let t=performance.now();if(state==='playing')update(dt);perfUpdateMs=performance.now()-t;
   t=performance.now();draw();perfDrawMs=performance.now()-t;
   perfFrameMs=perfUpdateMs+perfDrawMs;perfFps=rawDt>0?Math.round(1/rawDt):0;
   if(vignetteEl)vignetteEl.classList.toggle('hurt',state==='playing'&&!!player&&player.hp>0&&player.hp/player.max<.3);
   drawDebugOverlay();
  }catch(err){
   runtimeError=err;state='error';console.error('Couto Misto runtime stopped safely:',err);
   ui.toast.textContent='GAME ERROR · OPEN THE BROWSER CONSOLE AND RELOAD';ui.toast.classList.add('show');
   ui.pause.classList.add('hidden');ui.over.classList.remove('hidden');
   $('over-eyebrow').textContent='A GAME ERROR OCCURRED';$('over-title').textContent='BATTLE PAUSED';
   const errorMessage=err&&err.message?err.message:String(err);
   const errorStack=err&&err.stack?String(err.stack).split('\n').slice(0,5).join('\n'):'No stack trace available';
   const errorDetails=$('final-stats');
   errorDetails.textContent='ERROR: '+errorMessage+'\n\n'+errorStack;
   errorDetails.classList.add('runtime-error-details');
   $('again-btn').textContent='RELOAD DEFENCE';
  }
 }
 requestAnimationFrame(loop);
}
function canvasPos(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
// Small screens start zoomed out so a phone sees a useful slice of the battlefield.
const defaultZoom=()=>clamp(Math.min(vw,vh*1.1)/760,.55,1);
function setZoom(next){const oldZoom=zoom;zoom=clamp(next,.5,1.8);if(zoom===oldZoom)return;camera.x=clamp(camera.x,vw/(2*zoom),WORLD.w-vw/(2*zoom));camera.y=clamp(camera.y,vh/(2*zoom),WORLD.h-vh/(2*zoom));}
$('zoom-in').addEventListener('click',()=>setZoom(zoom*1.2));
$('zoom-out').addEventListener('click',()=>setZoom(zoom/1.2));
$('zoom-reset').addEventListener('click',()=>setZoom(defaultZoom()));
canvas.addEventListener('wheel',e=>{if(state!=='playing'&&state!=='paused')return;e.preventDefault();setZoom(zoom*(e.deltaY<0?1.12:1/1.12))},{passive:false});
// Two-finger pinch on the map zooms; a touch drag no longer hijacks the mouse-aim position.
const pinchPts=new Map();let pinchLast=0;
const pinchDist=()=>{const [a,b]=[...pinchPts.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
canvas.addEventListener('pointermove',e=>{
 if(e.pointerType!=='touch'){const p=canvasPos(e);mouse.x=p.x;mouse.y=p.y;return}
 if(!pinchPts.has(e.pointerId))return;
 pinchPts.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinchPts.size===2){const d=pinchDist();if(pinchLast>0&&(state==='playing'||state==='paused'))setZoom(zoom*d/pinchLast);pinchLast=d}
});
canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;pinchPts.set(e.pointerId,{x:e.clientX,y:e.clientY});pinchLast=pinchPts.size===2?pinchDist():0});
const pinchEnd=e=>{if(pinchPts.delete(e.pointerId))pinchLast=0};
window.addEventListener('pointerup',pinchEnd);window.addEventListener('pointercancel',pinchEnd);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){mouse.down=true;const p=canvasPos(e);mouse.x=p.x;mouse.y=p.y}});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')mouse.down=false});
function syncSoundBtn(){const b=$('sound-btn');b.classList.toggle('off',SFX.muted);b.setAttribute('aria-pressed',String(!SFX.muted));b.title=SFX.muted?'Sound off (M)':'Sound on (M)'}
$('sound-btn').addEventListener('click',()=>{SFX.init();SFX.resume();SFX.toggle();syncSoundBtn()});syncSoundBtn();
window.addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat){SFX.init();SFX.resume();SFX.toggle();syncSoundBtn()}if(e.code==='F3'){e.preventDefault();debugOverlay=!debugOverlay;return}keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&state==='playing')sword();if(e.code==='KeyF'&&state==='playing'){escortFormation=escortFormation==='wedge'?'line':'wedge';banner(escortFormation==='line'?'GUARD FORMATION · LINE':'GUARD FORMATION · WEDGE');toast('Personal guard formation changed')}if(e.code==='KeyR'&&state==='playing')reload();if(e.code==='KeyE'&&state==='playing'){if(cannonCooldown<=0){shoot(player,player.dir,'couto',88,390);cannonCooldown=4.5;toast('Bastion cannon fired · reloading')}else toast('Cannon reloading…')}});window.addEventListener('keyup',e=>keys[e.code]=false);
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
 const n=counts.map(v=>clamp(Math.floor(v)||0,0,MAX_ROLE));
 wallPosts(n[0]).forEach(p=>dot(p.x,p.y,8,'#f1d477'));
 activePosts(n[2]).forEach(p=>dot(p.x,p.y,7,'#7fc4a0'));
 const px=WORLD.cx,py=WORLD.cy+65;
 for(let i=0;i<n[1];i++){const a=-Math.PI/2+i*Math.PI*2/n[1];dot(px+Math.cos(a)*48,py+Math.sin(a)*48,6,'#e6dcc0')}
 dot(px,py,9,'#d4a53a');g.fillStyle='#f3e7c7';g.fillText('YOU',X(px),Y(py)+(n[1]?46:24));
}
function updateDeployment(){
 const values=ROLE_IDS.map(id=>Math.floor(Number($(id).value)||0));
 const invalid=values.some(value=>value<0||value>MAX_ROLE);
 const total=values.reduce((sum,value)=>sum+value,0);
 $('deployment-total').textContent=total;
 $('deployment-error').textContent=invalid?'Each role must be between 0 and '+MAX_ROLE+' soldiers.':total===0?'Choose at least one soldier.':total>MAX_TOTAL?'Maximum deployment is '+MAX_TOTAL+' soldiers.':'';
 $('start-btn').disabled=invalid||total===0||total>MAX_TOTAL;
 document.querySelectorAll('.step').forEach(b=>{const v=Math.floor(Number($(b.dataset.target).value)||0);const farm=b.dataset.target==='farmer-count';b.disabled=Number(b.dataset.step)>0?(farm?v>=MAX_FARMERS:(v>=MAX_ROLE||total>=MAX_TOTAL)):v<=0});
 document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('on',b.dataset.preset===values.join(',')));
 drawBlueprint(values);
}
ROLE_IDS.forEach(id=>$(id).addEventListener('input',updateDeployment));
document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>{const inp=$(b.dataset.target);inp.value=clamp((Math.floor(Number(inp.value)||0))+Number(b.dataset.step),0,b.dataset.target==='farmer-count'?MAX_FARMERS:MAX_ROLE);updateDeployment()}));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.preset.split(',');ROLE_IDS.forEach((id,i)=>{$(id).value=v[i]});updateDeployment()}));
document.querySelectorAll('[data-diff]').forEach(b=>b.addEventListener('click',()=>setDifficulty(Number(b.dataset.diff))));
showZoom(false);restoreDeployment();updateDeployment();updateBest();
$('start-btn').addEventListener('click',start);$('menu-btn').addEventListener('click',mainMenu);$('over-menu-btn').addEventListener('click',mainMenu);$('pause-btn').addEventListener('click',pause);$('resume-btn').addEventListener('click',pause);$('restart-btn').addEventListener('click',start);$('again-btn').addEventListener('click',()=>{if(runtimeError)location.reload();else start()});$('how-btn').addEventListener('click',()=>ui.orders.classList.remove('hidden'));$('close-orders').addEventListener('click',()=>ui.orders.classList.add('hidden'));
$('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();touchFire=true});$('touch-fire').addEventListener('pointerup',()=>touchFire=false);$('touch-fire').addEventListener('pointercancel',()=>touchFire=false);$('touch-fire').addEventListener('lostpointercapture',()=>touchFire=false);$('touch-sword').addEventListener('pointerdown',e=>{e.preventDefault();sword()});$('touch-reload').addEventListener('pointerdown',e=>{e.preventDefault();reload()});
$('touch-formation').addEventListener('pointerdown',e=>{e.preventDefault();if(state==='playing'){escortFormation=escortFormation==='wedge'?'line':'wedge';$('touch-formation').textContent=escortFormation==='line'?'WEDGE':'LINE';toast('Guard formation · '+escortFormation.toUpperCase())}});
$('touch-cannon').addEventListener('pointerdown',e=>{e.preventDefault();if(state==='playing'){if(cannonCooldown<=0){shoot(player,player.dir,'couto',88,390);cannonCooldown=4.5;toast('Bastion cannon fired · reloading')}else toast('Cannon reloading…')}});
const joy=$('joystick'),stick=$('stick'),aimJoy=$('aim-joystick'),aimStick=$('aim-stick');let joyId=null,aimJoyId=null;
function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=Math.min(1,43/(len||1));mobileMove={x:dx/43*scale,y:dy/43*scale};stick.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)'}
function resetJoy(){joyId=null;mobileMove={x:0,y:0};stick.style.transform='translate(0,0)'}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyId=e.pointerId;joy.setPointerCapture(joyId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveJoy(e)});joy.addEventListener('pointerup',e=>{if(e.pointerId===joyId)resetJoy()});joy.addEventListener('pointercancel',resetJoy);
function moveAim(e){const r=aimJoy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=Math.min(1,38/(len||1));if(len>7){mobileAim={x:dx/Math.max(len,1),y:dy/Math.max(len,1)};mobileAimActive=true}else mobileAimActive=false;aimStick.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)'}
function resetAim(){aimJoyId=null;mobileAimActive=false;mobileAim={x:0,y:0};aimStick.style.transform='translate(0,0)'}
aimJoy.addEventListener('pointerdown',e=>{e.preventDefault();aimJoyId=e.pointerId;aimJoy.setPointerCapture(aimJoyId);moveAim(e)});aimJoy.addEventListener('pointermove',e=>{if(e.pointerId===aimJoyId)moveAim(e)});aimJoy.addEventListener('pointerup',e=>{if(e.pointerId===aimJoyId)resetAim()});aimJoy.addEventListener('pointercancel',resetAim);
window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(!ui.orders.classList.contains('hidden')){ui.orders.classList.add('hidden');return}pause()}});
// Drop held keys / fire when the window loses focus so the soldier never runs away on its own.
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouse.down=false;touchFire=false;resetJoy();resetAim()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});
window.addEventListener('pointercancel',()=>{mouse.down=false;touchFire=false;resetJoy();resetAim()});
// A mouse-clicked button keeps focus; Space (sword) would then re-activate it. Release focus after pointer clicks.
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(b&&e.detail>0)b.blur()});
$('stage').addEventListener('contextmenu',e=>e.preventDefault());
const victoryVideo=$('victory-video'),victorySound=$('victory-sound');
$('victory-skip').addEventListener('click',showVictoryResults);
// Victory results buttons were previously unwired (dead buttons).
$('victory-again').addEventListener('click',start);
$('victory-menu').addEventListener('click',mainMenu);
$('victory-sound').addEventListener('click',()=>{victoryVideo.muted=!victoryVideo.muted;victorySound.textContent=victoryVideo.muted?'ENABLE SOUND':'MUTE SOUND';if(victoryVideo.paused)victoryVideo.play().catch(()=>{})});
victoryVideo.addEventListener('ended',showVictoryResults);
victoryVideo.addEventListener('error',()=>{if(state==='victory'){toast('Victory video could not be loaded');showVictoryResults()}});
const trailerScreen=$('trailer-screen'),trailerVideo=$('trailer-video'),trailerSound=$('trailer-sound'),trailerPlay=$('trailer-play');
let trailerAutoplayAttempted=false;
function showTrailerPlay(label='PLAY INTRO'){trailerPlay.textContent=label;trailerPlay.classList.remove('hidden')}
function hideTrailerPlay(){trailerPlay.classList.add('hidden')}
function playTrailer(fromUser=false){
 if(fromUser)trailerVideo.muted=true;
 const attempt=trailerVideo.play();
 if(attempt&&typeof attempt.then==='function')attempt.then(()=>{hideTrailerPlay();trailerSound.textContent=trailerVideo.muted?'ENABLE SOUND':'MUTE SOUND'}).catch(()=>showTrailerPlay('PLAY INTRO'));
 else hideTrailerPlay();
}
function finishTrailer(){if(!trailerScreen.classList.contains('hidden')){trailerScreen.classList.add('hidden');trailerVideo.pause();ui.menu.classList.remove('hidden');state='menu';last=performance.now()}}
$('trailer-skip').addEventListener('click',finishTrailer);
trailerPlay.addEventListener('click',()=>{if(trailerVideo.error||trailerVideo.networkState===HTMLMediaElement.NETWORK_NO_SOURCE){trailerSound.textContent='LOADING…';trailerVideo.load()}playTrailer(true)});
$('trailer-sound').addEventListener('click',()=>{if(trailerVideo.paused){playTrailer(true);return}trailerVideo.muted=!trailerVideo.muted;trailerSound.textContent=trailerVideo.muted?'ENABLE SOUND':'MUTE SOUND'});
trailerVideo.addEventListener('playing',()=>{hideTrailerPlay();trailerSound.textContent=trailerVideo.muted?'ENABLE SOUND':'MUTE SOUND'});
trailerVideo.addEventListener('ended',finishTrailer);
trailerVideo.addEventListener('error',()=>{showTrailerPlay('RETRY INTRO');trailerSound.textContent='VIDEO ERROR';const caption=trailerScreen.querySelector('.trailer-caption');if(caption)caption.textContent='INTRO VIDEO COULD NOT LOAD · RETRY OR SKIP'});
trailerVideo.addEventListener('canplay',()=>{trailerSound.textContent='ENABLE SOUND';const caption=trailerScreen.querySelector('.trailer-caption');if(caption)caption.textContent='HOLD THE FORTRESS · DEFEND YOUR HERITAGE';if(!trailerAutoplayAttempted&&!trailerScreen.classList.contains('hidden')){trailerAutoplayAttempted=true;playTrailer(false)}});
trailerVideo.addEventListener('loadeddata',()=>{if(trailerVideo.paused&&!trailerAutoplayAttempted&&!trailerScreen.classList.contains('hidden')){trailerAutoplayAttempted=true;playTrailer(false)}});
reset();
setTimeout(()=>{ui.loading.classList.add('hidden');trailerScreen.classList.remove('hidden');state='menu';last=performance.now();trailerVideo.muted=true;trailerVideo.load();trailerAutoplayAttempted=true;playTrailer(false);setTimeout(()=>{if(trailerVideo.paused&&!trailerVideo.error)showTrailerPlay('PLAY INTRO')},1800);requestAnimationFrame(loop)},650);
})();