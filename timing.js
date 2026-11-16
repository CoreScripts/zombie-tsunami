/* Fixed simulation ticks, independent of browser display frequency. */
(function(global){
class GameClock {
  constructor(){this.reset();this.droppedMs=0;}
  reset(){this.previous=null;this.accumulator=0;}
  advance(now){
    if(this.previous===null){this.previous=now;return 1;}
    const elapsed=Math.max(0,now-this.previous);this.previous=now;
    // Long interruptions are pauses, not a queue of jumps/deaths to replay.
    if(elapsed>250){this.accumulator=0;this.droppedMs+=elapsed;return 1;}
    this.accumulator+=elapsed;
    const due=Math.floor((this.accumulator+0.01)/(1000/60));
    if(!due)return 0;
    this.accumulator=Math.max(0,this.accumulator-due*1000/60);
    this.droppedMs+=Math.max(0,due-8)*1000/60;
    return Math.min(due,8);
  }
}
global.GameClock=GameClock;
})(globalThis);
