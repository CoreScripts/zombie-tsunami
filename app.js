const $=s=>document.querySelector(s),lines=[];
const log=s=>{console.log(s);lines.push(String(s));if(lines.length>600)lines.shift();if(!$('#debug').hidden)$('#log').textContent=lines.join('\n');};
let muted=false,paused=false,lastSave=0;
const gameClock=new GameClock();
let messageTimer;window.offlineMessage=message=>{let toast=$('#offline-message');if(!toast){toast=document.createElement('div');toast.id='offline-message';toast.setAttribute('role','status');$('#game').append(toast);}toast.textContent=message;toast.hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>toast.hidden=true,3500);};
const credit=document.createElement('div');credit.id='port-credit';credit.textContent='port by kkeep.fun';credit.hidden=true;$('#game').append(credit);
function placeCredit(){const r=$('#canvas').getBoundingClientRect(),parent=$('#game').getBoundingClientRect(),s=Math.min(r.width/960,r.height/640);credit.style.left=(r.left-parent.left+(r.width-960*s)/2+390*s)+'px';credit.style.top=(r.top-parent.top+(r.height-640*s)/2+322*s)+'px';credit.style.fontSize=(28*s)+'px';}
new ResizeObserver(placeCredit).observe($('#game'));placeCredit();
function failure(e){window.portError=String(e)+'\n'+(e.stack||'');log(window.portError);$('#stats').textContent='The engine stopped. Diagnostic details are below.';$('#debug').hidden=false;$('#log').textContent=lines.join('\n');}
function canvasPoint(e){const r=$('#canvas').getBoundingClientRect(),scale=Math.min(r.width/960,r.height/640),left=r.left+(r.width-960*scale)/2,top=r.top+(r.height-640*scale)/2;return [(e.clientX-left)/scale,(e.clientY-top)/scale];}
window.runPort=async()=>{
  if(window.portStarting)return;window.portStarting=true;
  $('#start').disabled=true;$('#start').hidden=true;$('#progress').hidden=false;$('#progress').value=0;
  const setStatus=text=>{const el=$('#status');if(el)el.textContent=text;};
  setStatus('Loading engine…');
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;const audioContext=Audio?new Audio():null;window.bootAudioContext=audioContext;if(audioContext)audioContext.resume().catch(()=>{});
    const M=await PortEngine({locateFile:name=>new URL(name.replace(/\.wasm$/,'.bin'),document.baseURI).href,canvas:$('#canvas'),print:log,printErr:log});window.engine=M;const p=new ZombiePort(M,log);window.port=p;
    const read=async name=>{if(!name.startsWith('assets/'))setStatus('Loading '+name+'…');const r=await fetch(name);if(!r.ok)throw Error(name+' '+r.status);return r.arrayBuffer();};
    setStatus('Loading game data…');await p.load(read);
    setStatus('Restoring save…');
    const saves=new BrowserSaves(M,log);window.browserSaves=saves;saves.restore();
    setStatus('Loading resources…');
    const names=await(await fetch('assets.json')).json();let next=0,loaded=0;
    await Promise.all(Array.from({length:8},async()=>{while(next<names.length){const name=names[next++],bytes=new Uint8Array(await read('assets/'+name));p.assets.set(name,bytes);const file='/assets/'+name;M.FS.mkdirTree(file.slice(0,file.lastIndexOf('/')));M.FS.writeFile(file,bytes);loaded++;$('#progress').value=loaded*100/names.length;setStatus('Loading resources ('+loaded+'/'+names.length+') — '+name.replace(/^.*\//,''));}}));
    $('#progress').value=100;
    setStatus('Preparing audio…');
    if(audioContext){const fmod=await FMODModule({locateFile:name=>new URL('fmod/'+name.replace(/\.wasm$/,'.bin'),document.baseURI).href,INITIAL_MEMORY:67108864,print:log,printErr:log});p.audio=new OriginalAudio(p,fmod,audioContext);setStatus('Loading audio…');await p.audio.preload();}
    else{p.audio={call:(c,n)=>p.fmod(c,n),flushCallbacks(){},resume(){},setMuted(){},eventsStarted:0,errors:[],context:{state:'unavailable'}};$('#sound').textContent='Audio unavailable';$('#sound').disabled=true;}
    M.FS.chdir('/assets');log('Loaded '+names.length+' original resources.');log('WebGL context '+M._create_gl());$('#status').textContent='Starting the game…';await new Promise(requestAnimationFrame);p.boot(960,640);window.portReady=true;$('#welcome').hidden=true;
    let sampleStart=0,sampleFrames=0,sampleWork=0,lastDebug=0;window.runtimeStats={fps:0,frameMs:0,ticks:0,droppedMs:0};
    const frame=now=>{if(window.portError)return;try{const steps=paused?0:gameClock.advance(now);if(steps){const begin=performance.now();p.audio.flushCallbacks();p.pumpWorkers();p.renderSteps(steps);p.installOfflineMenus();window.framesRendered=(window.framesRendered||0)+1;runtimeStats.ticks+=steps;runtimeStats.droppedMs=gameClock.droppedMs;sampleFrames++;sampleWork+=performance.now()-begin;if(!sampleStart)sampleStart=now;if(now-sampleStart>=1000){runtimeStats.fps=Math.round(sampleFrames*1000/(now-sampleStart));runtimeStats.frameMs=Math.round(sampleWork/sampleFrames*10)/10;sampleStart=now;sampleFrames=sampleWork=0;}if(now-lastSave>5000){saves.flush();lastSave=now;}}
      credit.hidden=!p.titleMenuVisible();
      if(!$('#debug').hidden&&now-lastDebug>500){lastDebug=now;$('#stats').textContent=`${runtimeStats.fps} FPS · ${runtimeStats.frameMs} ms/frame · Frames: ${window.framesRendered||0} · Simulation: ${(runtimeStats.ticks/60).toFixed(1)} s · Audio events: ${p.audio.eventsStarted} · Memory: ${Math.round(M.HEAPU8.length/1048576)} MB`;$('#log').textContent=lines.join('\n');}requestAnimationFrame(frame);
    }catch(e){failure(e);}};requestAnimationFrame(frame);
  }catch(e){failure(e);$('#status').textContent='Unable to start. Open Details for the error.';}
};
$('#start').onclick=window.runPort;
for(const [event,type]of [['pointerdown',0],['pointermove',2],['pointerup',1],['pointercancel',3]])$('#canvas').addEventListener(event,e=>{if(!window.portReady||paused||window.portError)return;if(event==='pointermove'&&!e.buttons)return;e.preventDefault();try{if(event==='pointerdown'){$('#canvas').setPointerCapture(e.pointerId);if(!muted)port.audio.resume();}port.entry('GameViewRenderer_nativeTouch',[0,type],canvasPoint(e));}catch(err){failure(err);}});
for(const [event,type]of [['keydown',0],['keyup',1]])document.addEventListener(event,e=>{if(e.code==='Space'&&!e.repeat&&window.portReady&&!paused&&!window.portError){e.preventDefault();port.entry('GameViewRenderer_nativeTouch',[0,type],[480,320]);}});
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
$('#sound').onclick=()=>{muted=!muted;$('#sound').textContent=muted?'Sound off':'Sound on';$('#sound').setAttribute('aria-pressed',String(muted));window.port?.audio?.setMuted(muted);};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch(e){log(e.message);}};
$('#diagnostics').onclick=()=>{$('#debug').hidden=!$('#debug').hidden;$('#log').textContent=lines.join('\n');};$('#close-debug').onclick=()=>$('#debug').hidden=true;
$('#export-save').onclick=()=>{if(!window.browserSaves)return;browserSaves.flush();const blob=new Blob([JSON.stringify(browserSaves.snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zombie-tsunami-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('visibilitychange',()=>{if(!window.portReady||window.portError)return;try{paused=document.hidden;gameClock.reset();if(paused){port.entry('GameViewRenderer_nativeOnPause');port.audio.setMuted(true);browserSaves.flush();}else{port.entry('GameViewRenderer_nativeOnResume');port.audio.setMuted(muted);}}catch(e){failure(e);}});
window.addEventListener('pagehide',()=>window.browserSaves?.flush());

// Start visually without another browser Play button. Browser audio unlocks
// on the first actual touch/key gesture, without delaying asset loading.
function unlockAudio(){window.bootAudioContext?.resume().catch(()=>{});if(!muted)window.port?.audio?.resume();}
document.addEventListener('pointerdown',unlockAudio,{capture:true});
document.addEventListener('keydown',unlockAudio,{capture:true});
requestAnimationFrame(()=>window.runPort());
