class OriginalAudio {
  constructor(port,fmod,context){this.p=port;this.f=fmod;this.context=context;this.music=new Map();this.callbacks=[];this.calls=0;this.eventsStarted=0;this.errors=[];}
  async preload(){
    for(const [path,bytes]of this.p.assets){
      if(path.endsWith('.bank'))this.f.FS_createDataFile('/',path.split('/').pop(),bytes,true,false);
      if(path.endsWith('.mp3'))this.music.set(path,await this.context.decodeAudioData(bytes.slice().buffer));
    }
  }
  resume(){this.context.resume();(this.f.mContext||this.f.context)?.resume();if(this.core){this.core.mixerSuspend();this.core.mixerResume();}}
  setMuted(muted){if(muted)this.context.suspend();else this.resume();if(this.core){const out={};this.core.getMasterChannelGroup(out);out.val?.setMute(muted);}}
  flushCallbacks(){for(const event of this.callbacks.splice(0)){const receiver=this.p.objects.get(event.handle);if(event.fn&&receiver?.guestCallback===event.fn)this.p.call(event.fn,[event.type,event.handle,0]);}}
  makeChannel(sound,paused){
    const ch={music:true,sound,paused:true,position:0,volume:1,loop:sound.loop!==0,source:null,gain:this.context.createGain(),started:0};ch.gain.connect(this.context.destination);
    ch.stop=()=>{if(ch.source){try{ch.source.stop();}catch{}ch.source=null;}ch.paused=true;};
    ch.pause=value=>{if(value){if(!ch.paused)ch.position+=(this.context.currentTime-ch.started);ch.stop();}else if(ch.paused){ch.source=this.context.createBufferSource();ch.source.buffer=sound.buffer;ch.source.loop=ch.loop;ch.source.connect(ch.gain);ch.started=this.context.currentTime;ch.source.start(0,ch.position%sound.buffer.duration);ch.paused=false;}};
    ch.pause(paused);return ch;
  }
  call(c,name){
    const p=this.p,f=this.f,x=i=>p.u64(c+8*i),fp=i=>p.view.getFloat32(c+288+i*16,true),get=i=>p.objects.get(x(i)),receiver=get(0),out={},wrap=o=>p.object(o),put=(i,o)=>p.w64(x(i),wrap(o));let r=0;this.calls++;
    if(name==='FMOD_Debug_Initialize'){p.w64(c,0);return;}
    if(name.includes('Studio6System6create')){r=f.Studio_System_Create(out);this.system=out.val;put(0,out.val);}
    else if(name.includes('getCoreSystem')){r=receiver.getCoreSystem(out);this.core=out.val;this.core.setDSPBufferSize(2048,2);this.outputMode=this.context.audioWorklet?f.OUTPUTTYPE_AUDIOWORKLET:f.OUTPUTTYPE_WEBAUDIO;this.core.setOutput(this.outputMode);put(1,out.val);}
    else if(name.includes('System10initialize')){r=receiver.initialize(x(1),f.STUDIO_INIT_NORMAL,f.INIT_NORMAL,null);}
    else if(name.includes('setOutput')||name.includes('setFileSystem')){}
    else if(name.includes('loadBankFile')){const file=p.text(x(1)).split('/').pop();r=receiver.loadBankFile('/'+file,x(2),out);if(!r)put(3,out.val);}
    else if(name.includes('getEventCount')){r=receiver.getEventCount(out);p.view.setUint32(x(1),out.val??0,true);}
    else if(name.includes('loadSampleData'))r=receiver.loadSampleData();
    else if(name.includes('System8getEvent')){r=receiver.getEvent(p.text(x(1)),out);if(!r)put(2,out.val);}
    else if(name.includes('System6getBus')){r=receiver.getBus(p.text(x(1)),out);if(!r)put(2,out.val);}
    else if(name.includes('createInstance')){r=receiver.createInstance(out);if(!r)put(1,out.val);}
    else if(name.includes('setUserData')){receiver.guestUserData=x(1);}
    else if(name.includes('getUserData'))p.w64(x(1),receiver.guestUserData??0);
    else if(name.includes('setCallback')){const fn=x(1),handle=x(0);receiver.guestCallback=fn;r=receiver.setCallback((type,event,parameters)=>{if(fn&&receiver.guestCallback===fn)this.callbacks.push({fn,handle,type});return 0;},x(2));}
    else if(name.includes('createStream')){const path=p.text(x(1)).replace(/^bundle:\/\//,'');const buffer=this.music.get(path);if(!buffer)throw Error('Missing music '+path);put(4,{music:true,buffer,path,loop:-1});}
    else if(name.includes('getSubSound')&&receiver?.music)p.w64(x(2),x(0));
    else if(name.includes('setLoopCount')&&receiver?.music)receiver.loop=Number(p.view.getBigInt64(c+8,true));
    else if(name.includes('playSound')&&get(1)?.music)put(4,this.makeChannel(get(1),!!x(3)));
    else if(name.includes('getOpenState')&&receiver?.music){if(x(1))p.view.setUint32(x(1),0,true);if(x(2))p.view.setUint32(x(2),100,true);if(x(3))p.M.HEAPU8[x(3)]=0;if(x(4))p.M.HEAPU8[x(4)]=0;}
    else if(name.includes('getMasterChannelGroup')){r=receiver.getMasterChannelGroup(out);if(!r)put(1,out.val);}
    else if(name.includes('createDSPByType')){r=receiver.createDSPByType(x(1),out);if(!r)put(2,out.val);}
    else if(name.includes('setParameterFloat'))r=receiver.setParameterFloat(x(1),fp(0));
    else if(name.includes('setBypass'))r=receiver.setBypass(!!x(1));
    else if(name.includes('setParameterByName'))r=receiver.setParameterByName(p.text(x(1)),fp(0),!!x(2));
    else if(name.includes('setVolume')){if(receiver?.music){receiver.volume=fp(0);if(receiver.gain)receiver.gain.gain.value=fp(0);}else r=receiver.setVolume(fp(0));}
    else if(name.includes('setMute')){if(receiver?.music){receiver.gain.gain.value=x(1)?0:receiver.volume;}else r=receiver.setMute(!!x(1));}
    else if(name.includes('setPaused')){if(receiver?.music)receiver.pause(!!x(1));else r=receiver.setPaused(!!x(1));}
    else if(name.includes('getFrequency')){if(receiver?.music)p.view.setFloat32(x(1),receiver.sound.buffer.sampleRate,true);else{r=receiver.getFrequency(out);p.view.setFloat32(x(1),out.val??44100,true);}}
    else if(name.includes('setPosition')){if(receiver?.music){const paused=receiver.paused;receiver.stop();receiver.position=x(1)/1000;receiver.pause(paused);}else r=receiver.setPosition(x(1),x(2));}
    else if(name.includes('isPlaying')){if(receiver?.music)p.M.HEAPU8[x(1)]=!receiver.paused;else{r=receiver.isPlaying(out);p.M.HEAPU8[x(1)]=!!out.val;}}
    else if(name.includes('isVirtual')){r=receiver.isVirtual(out);p.M.HEAPU8[x(1)]=!!out.val;}
    else if(name.includes('addDSP')){if(!receiver?.music)r=receiver.addDSP(x(1),get(2));}
    else if(name.includes('stopAllEvents'))r=receiver.stopAllEvents(x(1));
    else if(name.includes('4stopE'))r=receiver.stop(x(1));
    else if(name.includes('4stopEv')){if(receiver?.music)receiver.stop();else r=receiver.stop();}
    else if(name.includes('5startEv')){r=receiver.start();this.eventsStarted++;}
    else if(name.includes('6keyOffEv'))r=receiver.keyOff();
    else if(name.includes('7releaseEv')){if(!receiver?.music)r=receiver.release();}
    else if(name.includes('6updateEv'))r=receiver.update();
    else if(name.includes('mixerSuspend'))r=receiver.mixerSuspend();
    else if(name.includes('mixerResume'))r=receiver.mixerResume();
    else throw Error('Missing audio bridge '+name);
    if(r){const message=name+': '+f.ErrorString(r);if(!this.errors.includes(message)){this.errors.push(message);p.log(message);}}
    p.w64(c,r??0);
  }
}
globalThis.OriginalAudio=OriginalAudio;
