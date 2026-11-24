// Procedural battlefield audio (Web Audio API): no sound files, nothing to download.
(function(){
 let ctx=null,master=null,noise=null,muted=false;
 try{muted=localStorage.getItem('cmh-muted')==='1'}catch(e){}
 const listener={x:0,y:0},lastPlayed={};
 // Minimum gap (seconds) per sound so a 200-man firing line stays a roar rather than a crash.
 const GAP={musket:.045,cannon:.12,sword:.07,kill:.06,wallhit:.09,break:.4,horn:2,hurt:.2,thud:.08};

 function init(){
  if(ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{
   ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:.6;
   const comp=ctx.createDynamicsCompressor();master.connect(comp);comp.connect(ctx.destination);
   noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
   const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }catch(e){ctx=null}
 }
 function resume(){if(ctx&&ctx.state==='suspended')ctx.resume()}
 // Louder when near the camera, quiet but audible across the battlefield.
 function loudness(x,y){if(x===undefined)return 1;return Math.max(0,1-Math.hypot(x-listener.x,y-listener.y)/1000)**1.5}
 function out(x,gain){
  const g=ctx.createGain();g.gain.value=gain;
  if(x!==undefined&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,(x-listener.x)/700));g.connect(p);p.connect(master)}else g.connect(master);
  return g;
 }
 // Filtered noise with a decaying envelope: gunpowder, impacts, rumble.
 function burst(t,dest,{dur=.2,type='lowpass',from=2000,to=400,q=.7,gain=1}){
  const s=ctx.createBufferSource();s.buffer=noise;s.loop=true;
  const f=ctx.createBiquadFilter();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);
  const e=ctx.createGain();e.gain.setValueAtTime(gain,t);e.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f);f.connect(e);e.connect(dest);s.start(t,Math.random()*.5);s.stop(t+dur+.05);
 }
 function tone(t,dest,{type='sine',from=200,to=60,dur=.2,gain=.6,attack=.004}){
  const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(Math.max(10,to),t+dur);
  const e=ctx.createGain();e.gain.setValueAtTime(.0001,t);e.gain.exponentialRampToValueAtTime(gain,t+attack);e.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(e);e.connect(dest);o.start(t);o.stop(t+dur+.05);
 }
 const SOUNDS={
  musket(t,o){burst(t,o,{dur:.22,from:3200,to:300,gain:.9});tone(t,o,{from:130,to:45,dur:.14,gain:.5})},
  cannon(t,o){burst(t,o,{dur:.8,from:1400,to:90,gain:1});tone(t,o,{from:75,to:28,dur:.7,gain:1});burst(t+.05,o,{dur:1.1,from:300,to:40,gain:.5})},
  sword(t,o){burst(t,o,{dur:.07,type:'highpass',from:3000,to:6000,gain:.5});tone(t,o,{type:'triangle',from:2100,to:1100,dur:.12,gain:.28});tone(t+.01,o,{type:'square',from:3300,to:2400,dur:.06,gain:.07})},
  kill(t,o){burst(t,o,{dur:.12,from:900,to:200,gain:.7});tone(t,o,{from:170,to:55,dur:.14,gain:.45})},
  wallhit(t,o){burst(t,o,{dur:.16,from:700,to:120,gain:.8});tone(t,o,{from:95,to:45,dur:.18,gain:.6})},
  break(t,o){burst(t,o,{dur:.9,from:900,to:60,gain:1});tone(t,o,{from:70,to:25,dur:.8,gain:.9});burst(t+.15,o,{dur:.6,type:'bandpass',from:600,to:200,q:1.5,gain:.5})},
  hurt(t,o){tone(t,o,{from:120,to:50,dur:.22,gain:.8});burst(t,o,{dur:.15,from:600,to:150,gain:.5})},
  thud(t,o){tone(t,o,{from:110,to:50,dur:.12,gain:.4})},
  // Two brass-like voices a fifth apart: the call to arms for each wave.
  horn(t,o){for(const f of [147,220]){const os=ctx.createOscillator();os.type='sawtooth';os.frequency.setValueAtTime(f*.96,t);os.frequency.linearRampToValueAtTime(f,t+.25);
   const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(500,t);lp.frequency.linearRampToValueAtTime(1500,t+.4);
   const e=ctx.createGain();e.gain.setValueAtTime(.0001,t);e.gain.linearRampToValueAtTime(.3,t+.12);e.gain.setValueAtTime(.3,t+.9);e.gain.exponentialRampToValueAtTime(.001,t+1.5);
   os.connect(lp);lp.connect(e);e.connect(o);os.start(t);os.stop(t+1.6)}},
  victory(t,o){[[262,0],[330,.22],[392,.44],[523,.7]].forEach(([f,d])=>tone(t+d,o,{type:'triangle',from:f,to:f*.99,dur:.7,gain:.35,attack:.02}))},
  defeat(t,o){[[262,0],[233,.4],[196,.8],[147,1.2]].forEach(([f,d])=>tone(t+d,o,{type:'triangle',from:f,to:f*.98,dur:.9,gain:.35,attack:.03}))}
 };
 function play(name,x,y){
  if(muted||!ctx||!SOUNDS[name])return;
  const now=ctx.currentTime;if(now-(lastPlayed[name]||-9)<(GAP[name]||0))return;
  const v=loudness(x,y);if(v<.03)return;
  lastPlayed[name]=now;SOUNDS[name](now,out(x,v));
 }
 function setMuted(m){muted=m;try{localStorage.setItem('cmh-muted',m?'1':'0')}catch(e){}if(master)master.gain.value=m?0:.6;return muted}
 window.SFX={listener,init,resume,play,setMuted,toggle(){return setMuted(!muted)},get muted(){return muted}};
 // Browsers only allow audio after a user gesture, so unlock on the first one.
 const unlock=()=>{init();resume()};
 for(const ev of ['pointerdown','keydown','touchstart'])window.addEventListener(ev,unlock,{passive:true});
})();
