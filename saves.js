class BrowserSaves {
  constructor(M,log){this.M=M;this.log=log;this.key='zombie-tsunami-4.7.4-save-v1';this.last='';}
  restore(){for(const path of ['/save','/external'])this.M.FS.mkdirTree(path);try{const raw=localStorage.getItem(this.key);if(!raw)return;const data=JSON.parse(raw);if(data.version!==1)return;for(const [path,encoded]of Object.entries(data.files)){if(!/^\/(save|external)\//.test(path)||path.includes('..'))continue;const bytes=Uint8Array.from(atob(encoded),s=>s.charCodeAt(0));this.M.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));this.M.FS.writeFile(path,bytes);}this.last=raw;this.log('Restored browser save.');}catch(e){this.log('Save restore: '+e.message);}}
  snapshot(){const files={};const walk=dir=>{for(const name of this.M.FS.readdir(dir)){if(name==='.'||name==='..')continue;const path=dir+'/'+name,stat=this.M.FS.stat(path);if(this.M.FS.isDir(stat.mode))walk(path);else{const bytes=this.M.FS.readFile(path);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));files[path]=btoa(s);}}};walk('/save');walk('/external');return {version:1,files};}
  flush(){try{const raw=JSON.stringify(this.snapshot());if(raw!==this.last){localStorage.setItem(this.key,raw);this.last=raw;}}catch(e){this.log('Save storage: '+e.message);}}
}
globalThis.BrowserSaves=BrowserSaves;
