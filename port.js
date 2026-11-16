(function(global){
class ZombiePort {
  constructor(M,log=console.log){this.M=M;this.log=log;this.names=new Map();this.pointers=new Map();this.objects=new Map();this.nextObject=0xd0000000;this.lastImports=[];this.seen=new Set();this.assets=new Map();}
  get view(){return new DataView(this.M.HEAPU8.buffer);}
  u64(p){return Number(this.view.getBigUint64(p,true));}
  w64(p,v){this.view.setBigUint64(p,BigInt.asUintN(64,BigInt(v)),true);}
  alloc(n){const p=this.M._malloc(n);this.M.HEAPU8.fill(0,p,p+n);return p;}
  str(s){if(!this.pointers.has(s)){const b=new TextEncoder().encode(s+'\0');const p=this.alloc(b.length);this.M.HEAPU8.set(b,p);this.pointers.set(s,p);}return this.pointers.get(s);}
  text(p){return p?this.M.UTF8ToString(p):'';}
  object(value){const id=this.nextObject;this.nextObject+=16;this.objects.set(id,value);return id;}
  importAddress(name){for(const [p,n]of this.names)if(n===name)return p;const p=0xf0000000+this.names.size*16;this.names.set(p,name);return p;}
  async load(read){
    this.images=JSON.parse(new TextDecoder().decode(await read('images.json')));
    for(let i=0;i<this.images.length;i++){const im=this.images[i];im.base=this.alloc(im.span+4096);this.M.HEAPU8.set(new Uint8Array(await read(im.name+'.bin')),im.base);this.M._set_image(i,im.base,im.span);}
    const globals={__stack_chk_guard:this.alloc(8),__sF:this.alloc(4096),stderr:this.alloc(8)};
    for(const im of this.images)for(const [off,type,add,name,value,defined]of im.relocations){
      let v=0;
      if(type===1027)v=im.base+add;
      else if([257,1025,1026].includes(type)){
        const owner=this.images.find(x=>Object.hasOwn(x.exports,name));
        v=(defined?im.base+value:globals[name]??(owner?owner.base+owner.exports[name]:this.importAddress(name)))+add;
      }else if(type===1032){throw Error('Unsupported IRELATIVE relocation');}
      else throw Error('Unsupported relocation '+type);
      this.w64(im.base+off,v);
    }
    this.context=this.M._create_context();this.initialSP=this.u64(this.context+256);
    for(const [target,name]of this.names)this.M._register_import(target,this.str(name));
    this.M.hostImport=(c,target)=>this.hostImport(c,target);
    this.env=this.alloc(8);const et=this.alloc(256*8);this.w64(this.env,et);for(let i=0;i<256;i++)this.w64(et+i*8,0xe1000000+i*16);
    this.vm=this.alloc(8);const vt=this.alloc(8*8);this.w64(this.vm,vt);for(let i=0;i<8;i++)this.w64(vt+i*8,0xe2000000+i*16);
    this.log('Mapped original engine and C++ runtime into WebAssembly memory.');
  }
  call(address,args=[],floats=[]){const c=this.context;for(let i=0;i<8;i++)this.w64(c+i*8,args[i]??0);for(let i=0;i<floats.length;i++)this.view.setFloat32(c+288+i*16,floats[i],true);this.w64(c+256,this.initialSP);this.M._invoke(c,address);return this.u64(c);}
  entry(name,args=[],floats=[]){const im=this.images[0];const full='Java_net_mobigame_artemis_'+name;if(!(full in im.exports))throw Error('Missing '+full);return this.call(im.base+im.exports[full],[this.env,0,...args],floats);}
  renderSteps(steps){
    // The Android JNI wrapper always uses 1/60. SceneMgr's original catch-up
    // loop updates without rendering, then updates/draws its final step.
    const base=this.images[0].base,scene=this.sceneManager??=this.call(base+0x3e1680);
    // The browser clock owns catch-up. The Android renderer can switch its
    // target to 30 and double native updates; leaving that on would apply
    // compensation twice after a slow frame.
    this.view.setFloat32(scene+0x68,60,true);
    const speed=this.view.getFloat32(scene+0xec,true);
    this.view.setFloat32(scene+0xec,steps*Math.max(1,Math.floor(speed)),true);
    try{return this.call(base+0x3e22d0,[scene],[Math.min(speed,1)/60]);}
    finally{this.view.setFloat32(scene+0xec,speed,true);}
  }
  hookVirtual(object,offset,handler){
    if(!object)return;
    const slot=this.u64(object)+offset,original=this.u64(slot);
    this.nativeHooks??=new Map();
    if(this.nativeHooks.has(original))return;
    const address=0xe3000000+this.nativeHooks.size*16;
    this.nativeHooks.set(address,c=>handler(c,()=>this.M._invoke(c,original)));
    this.w64(slot,address);
  }
  installOfflineMenus(){
    if(this.offlineMenusInstalled)return;
    const base=this.images[0].base,root=this.u64(base+0x497e58);
    if(!root)return;
    const title=this.u64(root+0x2b0),shop=this.u64(root+0x2e0);
    if(!title||!shop||!this.u64(shop+0x2d0))return;
    this.hookVirtual(title,0x3b8,(c,next)=>{
      // The first event is the timed diamond sales promotion. Leave the
      // gameplay events in the original event list and remove this offer.
      for(let node=this.u64(title+0x9c8),guard=0;node&&guard++<32;node=this.u64(node)){
        const item=this.u64(node+24);
        if(this.view.getInt32(item+0x100,true)===1){const button=this.u64(item+0x130);this.M.HEAPU8[item+0x118]=0;this.M.HEAPU8[button+0x28c]=0;this.M.HEAPU8[button+0x28d]=0;}
      }
      next();
    });
    for(const field of [0x2b0,0x2b8,0x2c0,0x2c8,0x2d0]){
      const panel=this.u64(shop+field);
      this.hookVirtual(panel,0x98,(c)=>{global.offlineMessage?.('Earn more '+(this.u64(c+8)===2?'diamonds':'coins')+' by playing to buy this item.');this.w64(c,0);});
      this.hookVirtual(panel,0x90,(c,next)=>{
        const id=this.u64(c+8);
        if(this.removedOffers.includes(id)){this.w64(c,0);return;}
        next();
      });
    }
    // This text is read by the original font renderer. Its shorter replacement
    // fits the existing localized string allocation without changing its owner.
    const text=this.call(base+0x3695a0,[607,0]),oldLength=new TextEncoder().encode(this.text(text)).length;
    this.M.stringToUTF8('Collect coins while running. Complete missions and open reward tickets to earn more. Exchange earned diamonds for coins here.',text,oldLength+1);
    this.offlineMenusInstalled=true;
  }
  titleMenuVisible(){
    const base=this.images[0].base,root=this.u64(base+0x497e58),dialogs=this.u64(base+0x49d2b8);
    return !!(root&&this.sceneManager&&this.u64(this.sceneManager+0x158)===root&&this.u64(root+0x310)===this.u64(root+0x2b0)&&(!dialogs||!this.u64(dialogs+0x18)));
  }
  pumpWorkers(){
    let didWork=0;
    for(const worker of this.workers??[]){
      const closure=this.u64(worker.arg+48);if(!closure)continue;
      const target=this.u64(this.u64(closure)+48),c=worker.ctx;
      this.w64(c,closure);this.w64(c+256,worker.sp);
      this.activeWorker=worker;
      try{this.M._invoke(c,target);didWork++;}catch(e){if(!e.workerYield)throw e;}finally{this.activeWorker=null;}
    }
    return didWork;
  }
  constructors(){for(const im of [...this.images].reverse()){let count=0;for(let i=0;i<im.init[1];i++){const p=this.u64(im.base+im.init[0]+i*8);if(p&&p!==0xffffffffffffffff){this.log('Constructor '+im.name+' '+(p-im.base).toString(16));this.call(p);count++;}}this.log('Completed '+count+' constructors for '+im.name);}}
  boot(width=960,height=640){
    this.constructors();
    // Keep catalog IDs available to original lookups, but exclude every cash,
    // advertising, and external-offer product from the offline market lists.
    const base=this.images[0].base,start=this.u64(base+0x498b40),end=this.u64(base+0x498b48);
    this.removedOffers=[];
    for(let row=start;row<end;row+=56)if(this.view.getInt32(row+44,true)===1){this.removedOffers.push(this.view.getInt32(row,true));this.view.setInt32(row+16,-1,true);this.view.setInt32(row+40,-1,true);this.view.setUint32(row+48,0,true);}
    const im=this.images[0];if(im.exports.JNI_OnLoad){this.log('JNI_OnLoad');this.call(im.base+im.exports.JNI_OnLoad,[this.vm,0]);}
    for(const d of ['/save','/external','/assets']){try{this.M.FS.mkdir(d);}catch{}}
    this.entry('MobiActivity_nativeSetFilesDir',[this.object('/save')]);
    this.entry('MobiActivity_nativeSetExternalFilesDir',[this.object('/external')]);
    this.entry('MobiActivity_nativeSetDisplayDpi',[160]);
    this.log('nativeGetOpenGLVersion');this.entry('GameGLSurfaceView_nativeGetOpenGLVersion');
    this.log('nativeInit');this.entry('GameViewRenderer_nativeInit',[this.object('AssetManager'),width,height]);
    this.log('Initialization returned');
  }
  hostImport(c,target){
    target=target>>>0;
    if(this.nativeHooks?.has(target))return this.nativeHooks.get(target)(c);
    const x=i=>this.u64(c+i*8),ret=v=>this.w64(c,v??0);
    if(target>=0xe1000000&&target<0xe1001000)return this.jni(c,(target-0xe1000000)/16);
    if(target>=0xe2000000&&target<0xe2000100){const slot=(target-0xe2000000)/16;if(slot===4||slot===6){this.w64(x(1),this.env);ret(0);return;}ret(0);return;}
    let name=this.names.get(target);if(!name){const im=this.images.find(i=>target>=i.base&&target<i.base+i.span);name=im&&Object.entries(im.exports).find(([n,a])=>a===target-im.base)?.[0];if(!name)throw Error('Unknown call 0x'+target.toString(16)+(im?' '+im.name+'+0x'+(target-im.base).toString(16):''));this.names.set(target,name);}
    if(['_Znwm','_Znam','_ZnwmRKSt9nothrow_t'].includes(name)){ret(this.M._malloc(x(0)));return;}
    if(['_ZdlPv','_ZdaPv','_ZdlPvm','_ZdaPvm'].includes(name)){this.M._free(x(0));ret(0);return;}
    this.lastImports.push(name);if(this.lastImports.length>30)this.lastImports.shift();
    if(this.M._host_call(c,this.str(name)))return;
    if(name==='usleep'||name==='sched_yield'){ret(0);return;}
    if(name==='localtime'||name==='gmtime'){
      const d=new Date(Number(this.view.getBigInt64(x(0),true))*1000),p=this.tmBuffer??=this.alloc(56),pre=name==='gmtime'?'getUTC':'get';
      const get=n=>d[pre+n]();const jan=new Date(d);if(name==='gmtime')jan.setUTCMonth(0,1);else jan.setMonth(0,1);
      const values=[get('Seconds'),get('Minutes'),get('Hours'),get('Date'),get('Month'),get('FullYear')-1900,get('Day'),Math.floor((d-jan)/86400000),0];
      values.forEach((v,i)=>this.view.setInt32(p+4*i,v,true));this.w64(p+40,name==='gmtime'?0:-d.getTimezoneOffset()*60);this.w64(p+48,this.str(name==='gmtime'?'UTC':'Local'));ret(p);return;
    }
    if(name==='mktime'){
      const p=x(0),v=i=>this.view.getInt32(p+4*i,true),d=new Date(v(5)+1900,v(4),v(3),v(2),v(1),v(0));ret(Math.floor(d.getTime()/1000));return;
    }
    if(name==='ctime'){const d=new Date(Number(this.view.getBigInt64(x(0),true))*1000),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],z=n=>String(n).padStart(2,'0');ret(this.str(`${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2,' ')} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())} ${d.getFullYear()}\n`));return;}
    if(name==='strcasestr'){const hay=this.text(x(0)).toLowerCase(),needle=this.text(x(1)).toLowerCase();const i=hay.indexOf(needle);ret(i<0?0:x(0)+new TextEncoder().encode(hay.slice(0,i)).length);return;}
    if(name==='qsort'){
      const base=x(0),n=x(1),size=x(2),compare=x(3);if(n>1000000)throw Error('Invalid qsort count '+n);
      const cc=this.compareContext??=(this.M._create_context());const sp=this.compareSP??=this.u64(cc+256);
      const order=Array.from({length:n},(_,i)=>i);order.sort((a,b)=>{this.w64(cc,base+a*size);this.w64(cc+8,base+b*size);this.w64(cc+256,sp);this.M._invoke(cc,compare);return this.view.getInt32(cc,true);});
      const source=this.M.HEAPU8.slice(base,base+n*size);for(let i=0;i<n;i++)this.M.HEAPU8.set(source.subarray(order[i]*size,(order[i]+1)*size),base+i*size);ret(0);return;
    }
    if(name==='pthread_create'){
      if(x(2)!==this.images[0].base+0x39b7d8)throw Error('Unknown worker entry '+x(2).toString(16));
      const arg=x(3),ctx=this.M._create_context(),label=this.text(this.u64(arg+80));
      (this.workers??=[]).push({arg,ctx,sp:this.u64(ctx+256),label});this.w64(x(0),this.workers.length);this.log('Cooperative worker: '+label);ret(0);return;
    }
    if(name==='pthread_cond_wait'||name==='pthread_cond_timedwait'){
      if(this.activeWorker)throw Object.assign(new Error('Worker waiting'),{workerYield:true});
      if(!this.pumpWorkers())throw Error('Main thread wait has no runnable worker');ret(0);return;
    }
    if(name==='syscall'&&x(0)===178){ret(1);return;}
    if(name==='syscall'&&x(0)===98){if((x(2)&127)===1){ret(0);return;}throw Error('Unexpected synchronous futex wait');}
    if(name==='AAssetManager_fromJava'){ret(1);return;}
    if(name==='AAssetManager_open'){const path=this.text(x(1));const data=this.assets.get(path);if(!data){this.log('Missing asset '+path);ret(0);return;}this.log('Asset '+path+' '+data.length);ret(this.object({data,pos:0,path}));return;}
    if(name.startsWith('AAsset_')){const a=this.objects.get(x(0));if(!a)throw Error('Invalid asset');if(name==='AAsset_getLength')ret(a.data.length);else if(name==='AAsset_close'){this.objects.delete(x(0));ret(0);}else if(name==='AAsset_read'){const n=Math.min(x(2),a.data.length-a.pos);this.M.HEAPU8.set(a.data.subarray(a.pos,a.pos+n),x(1));a.pos+=n;ret(n);}else if(name==='AAsset_seek'){const off=Number(this.view.getBigInt64(c+8,true));a.pos=(x(2)===0?0:x(2)===1?a.pos:a.data.length)+off;ret(a.pos);}return;}
    if(['__android_log_print','printf','fprintf','snprintf','sprintf','vsnprintf','__vsnprintf_chk'].includes(name)){this.formatCall(c,name);return;}
    if(name==='stat'||name==='lstat'){try{const st=this.M.FS.stat(this.text(x(0)));const p=x(1);this.M.HEAPU8.fill(0,p,p+128);this.view.setUint32(p+16,st.mode,true);this.w64(p+48,st.size);ret(0);}catch{ret(-1);}return;}
    if(name==='mkdir'){try{this.M.FS.mkdir(this.text(x(0)));ret(0);}catch{ret(-1);}return;}
    if(name.includes('FMOD')||name==='FMOD_Debug_Initialize'){if(this.audio)this.audio.call(c,name);else this.fmod(c,name);return;}
    throw Error('Unimplemented import '+name+' at pc=0x'+this.u64(c+808).toString(16));
  }
  fmod(c,name){
    const x=i=>this.u64(c+i*8),out=(i,value)=>this.w64(x(i),value??this.object({audio:name}));
    if(!this.audioNotice){this.audioNotice=true;this.log('This browser does not provide Web Audio; sound is disabled.');}
    if(name.includes('Studio6System6create'))out(0);
    else if(name.includes('getCoreSystem')||name.includes('getMasterChannelGroup'))out(1);
    else if(name.includes('loadBankFile'))out(3);
    else if(name.includes('System8getEvent')||name.includes('System6getBus'))out(2,this.object({event:this.text(x(1))}));
    else if(name.includes('createInstance'))out(1,this.object({description:x(0)}));
    else if(name.includes('createDSPByType'))out(2);
    else if(name.includes('createStream'))out(4,this.object({path:this.text(x(1))}));
    else if(name.includes('playSound'))out(4,this.object({sound:x(1)}));
    else if(name.includes('getSubSound'))out(2,x(0));
    else if(name.includes('getEventCount'))this.view.setUint32(x(1),0,true);
    else if(name.includes('getOpenState')){if(x(1))this.view.setUint32(x(1),0,true);if(x(2))this.view.setUint32(x(2),100,true);if(x(3))this.M.HEAPU8[x(3)]=0;if(x(4))this.M.HEAPU8[x(4)]=0;}
    else if(name.includes('setUserData')){const a=this.objects.get(x(0));if(a)a.user=x(1);}
    else if(name.includes('getUserData'))out(1,this.objects.get(x(0))?.user??0);
    else if(name.includes('isPlaying')||name.includes('isVirtual'))this.M.HEAPU8[x(1)]=0;
    else if(name.includes('getFrequency'))this.view.setFloat32(x(1),44100,true);
    this.w64(c,0);
  }
  vaArgs(p){let gr=this.view.getInt32(p+24,true),vr=this.view.getInt32(p+28,true),stack=this.u64(p);const top=this.u64(p+8),vtop=this.u64(p+16);return (floating=false,raw=false)=>{let address;if(floating&&vr<0){address=vtop+vr;vr+=16;}else if(!floating&&gr<0){address=top+gr;gr+=8;}else{address=stack;stack+=8;}return floating?this.view.getFloat64(address,true):raw?this.view.getBigUint64(address,true):this.u64(address);};}
  formatCall(c,name){const x=i=>this.u64(c+i*8);let fmt,next,out=0,max=0;
    if(name==='__android_log_print'){fmt=this.text(x(2));let n=3;next=()=>x(n++);}
    else if(name==='snprintf'){out=x(0);max=x(1);fmt=this.text(x(2));let n=3;next=()=>n<8?x(n++):this.u64(this.u64(c+256)+(n++-8)*8);}
    else if(name==='sprintf'){out=x(0);max=1048576;fmt=this.text(x(1));let n=2;next=()=>x(n++);}
    else if(name==='vsnprintf'){out=x(0);max=x(1);fmt=this.text(x(2));next=this.vaArgs(x(3));}
    else if(name==='__vsnprintf_chk'){out=x(0);max=x(1);fmt=this.text(x(4));next=this.vaArgs(x(5));}
    else {let n=name==='fprintf'?2:1;fmt=this.text(x(n-1));next=()=>x(n++);}
    if(!['vsnprintf','__vsnprintf_chk'].includes(name)){let gr=name==='__android_log_print'||name==='snprintf'?3:name==='sprintf'||name==='fprintf'?2:1,vr=0,stack=this.u64(c+256);next=(floating=false,raw=false)=>{let address;if(floating&&vr<8)address=c+288+16*vr++;else if(!floating&&gr<8)address=c+8*gr++;else{address=stack;stack+=8;}return floating?this.view.getFloat64(address,true):raw?this.view.getBigUint64(address,true):this.u64(address);};}
    const result=fmt.replace(/%([-+ #0]*)(\*|\d*)(?:\.(\*|\d*))?(hh|ll|[lzhtjL])?([diuoxXscpfFeEgG%])/g,(all,flags,width,precision,length,type)=>{
      if(type==='%')return '%';let w=width==='*'?Number(BigInt.asIntN(32,next(false,true))):Number(width)||0;if(w<0){w=-w;flags+='-';}
      let prec=precision==='*'?Number(BigInt.asIntN(32,next(false,true))):precision===undefined?undefined:Number(precision);if(prec<0)prec=undefined;
      const floating=/[fFeEgG]/.test(type),v=next(floating,!floating),kind=type.toLowerCase();let s,sign='',prefix='';
      if(kind==='s'){s=this.text(Number(v));if(prec!==undefined)s=s.slice(0,prec);}
      else if(kind==='c')s=String.fromCharCode(Number(v));
      else if(floating){let n=v;if(n<0||Object.is(n,-0)){sign='-';n=-n;}else if(flags.includes('+'))sign='+';else if(flags.includes(' '))sign=' ';
        const digits=Math.min(100,prec??6);s=kind==='f'?n.toFixed(digits):kind==='e'?n.toExponential(digits):n.toPrecision(Math.max(1,digits));if(kind==='g'&&!flags.includes('#'))s=s.replace(/(\.\d*?[1-9])0+(?=e|$)|\.0+(?=e|$)/g,'$1');s=s.replace(/e([+-])(\d)$/,'e$10$2');
      }else{const bits=length==='hh'?8:length==='h'?16:length&&length!=='L'?64:32;let n=kind==='d'||kind==='i'?BigInt.asIntN(bits,v):BigInt.asUintN(kind==='p'?64:bits,v);if(n<0){sign='-';n=-n;}else if((kind==='d'||kind==='i')&&flags.includes('+'))sign='+';else if((kind==='d'||kind==='i')&&flags.includes(' '))sign=' ';
        const radix=kind==='x'||kind==='p'?16:kind==='o'?8:10;s=n.toString(radix);if(prec===0&&n===0n)s='';if(prec!==undefined)s=s.padStart(prec,'0');if(kind==='p'||flags.includes('#')&&kind==='x'&&n)prefix='0x';else if(flags.includes('#')&&kind==='o'&&!s.startsWith('0'))prefix='0';}
      if(type===type.toUpperCase()){s=s.toUpperCase();prefix=prefix.toUpperCase();}const pad=Math.max(0,w-sign.length-prefix.length-s.length);return flags.includes('-')?sign+prefix+s+' '.repeat(pad):flags.includes('0')&&(floating||prec===undefined)&&!['s','c'].includes(kind)?sign+prefix+'0'.repeat(pad)+s:' '.repeat(pad)+sign+prefix+s;
    });
    if(out&&max){const bytes=new TextEncoder().encode(result);const n=Math.min(bytes.length,max-1);this.M.HEAPU8.set(bytes.subarray(0,n),out);this.M.HEAPU8[out+n]=0;}else this.log(result);
    this.w64(c,new TextEncoder().encode(result).length);
  }
  jni(c,slot){
    const x=i=>this.u64(c+i*8),ret=v=>this.w64(c,v??0),obj=p=>this.objects.get(p);
    if(slot===6){ret(this.object({class:this.text(x(1))}));return;}
    if([21,25,29].includes(slot)){ret(x(1));return;}
    if([22,23,170,16,17].includes(slot)){ret(0);return;}
    if([15,228].includes(slot)){ret(0);return;}
    if(slot===31){ret(this.object({class:'java/lang/Class'}));return;}
    if(slot===33||slot===113){ret(this.object({method:this.text(x(2)),signature:this.text(x(3)),class:obj(x(1))}));return;}
    if(slot===167){ret(this.object(this.text(x(1))));return;}
    if(slot===169){ret(this.str(String(obj(x(1))??'')));return;}
    if(slot===168){ret(String(obj(x(1))??'').length);return;}
    if(slot===171){ret(obj(x(1))?.length??0);return;}
    if(slot===172){ret(this.object(Array(x(1)).fill(x(3))));return;}
    if(slot===173){ret(obj(x(1))?.[x(2)]??0);return;}
    if(slot===174){obj(x(1))[x(2)]=x(3);ret(0);return;}
    if(slot>=175&&slot<=182){const widths=[1,1,2,2,4,8,4,8];ret(this.object({length:x(1),width:widths[slot-175],ptr:this.alloc(x(1)*widths[slot-175])}));return;}
    if(slot>=183&&slot<=190){ret(obj(x(1)).ptr);return;}
    if(slot>=191&&slot<=198){ret(0);return;}
    if(slot>=199&&slot<=214){const a=obj(x(1)),start=a.ptr+x(2)*a.width,bytes=x(3)*a.width;if(slot<207)this.M.HEAPU8.copyWithin(x(4),start,start+bytes);else this.M.HEAPU8.copyWithin(start,x(4),x(4)+bytes);ret(0);return;}
    if(slot===229){ret(this.object({ptr:x(1),length:x(2),width:1}));return;}
    if(slot===230){ret(obj(x(1))?.ptr??0);return;}
    if(slot===231){ret(obj(x(1))?.length??0);return;}
    if(slot===219){this.w64(x(1),this.vm);ret(0);return;}
    if((slot>=34&&slot<=63)||(slot>=114&&slot<=143)){
      const method=obj(x(2));if(!method?.method)throw Error('Unknown Java method '+x(2));
      // No advertising or billing service exists in this offline edition.
      // Availability checks stay false and these actions cannot grant rewards.
      if(/^(ReloadAds|HasRewardedVideo|ShowRewardedVideo|ShowInterstitial)$/.test(method.method)){
        this.blockedAdCalls=(this.blockedAdCalls||0)+1;ret(0);return;
      }
      if(!this.seen.has(method.method)){this.seen.add(method.method);this.log('Java '+method.method+method.signature);}
      const next=(slot-(slot>=114?114:34))%3===1?this.vaArgs(x(3)):(()=>{let i=3;return ()=>x(i++);})();
      if(method.method==='getClassLoader'){ret(this.object({class:'java/lang/ClassLoader'}));return;}
      if(method.method==='findClass'){ret(this.object({class:obj(next())}));return;}
      if(method.signature.endsWith('Ljava/lang/String;')){
        let val='';if(/language/i.test(method.method))val='en';else if(/country/i.test(method.method))val='US';else if(/version/i.test(method.method))val='4.7.4';else if(/path|directory|dir/i.test(method.method))val='/save';
        ret(this.object(val));return;
      }
      if(method.method==='setOpenGLVersion'){this.log('Requested OpenGL '+next());ret(0);return;}
      if(method.method==='getMemoryClass'){ret(512);return;}
      if(method.method==='GetAndroidSdkVersion'){ret(29);return;}
      if(method.signature.endsWith(')F')){this.view.setFloat32(c+288,method.method==='GetForcedFrameRate'?60:0,true);return;}
      ret(0);return;
    }
    throw Error('Unimplemented JNI slot '+slot);
  }
}
global.ZombiePort=ZombiePort;
if(typeof module!=='undefined')module.exports=ZombiePort;
})(globalThis);
