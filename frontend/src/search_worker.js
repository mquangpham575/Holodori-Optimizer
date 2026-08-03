"use strict";
const CARDS = __CARDS__;
const CARD_BY_KEY = new Map(CARDS.map((c,i)=>[c.key,i]));
const CARD_BY_ID = new Map(CARDS.map((c,i)=>[c.id,i]));
function uniqueOutfitIds(sourceIds){
  const out=[],seen=new Set();
  for(const i of sourceIds){const sig=JSON.stringify(CARDS[i].outfit?.effects||[]);if(!seen.has(sig)){seen.add(sig);out.push(i);}}
  return out;
}
const OUTFIT_UNIQUE_IDS=uniqueOutfitIds(CARDS.map((_,i)=>i));
const ALL_OUTFIT_IDS=OUTFIT_UNIQUE_IDS;
const BIT_INDEX = new Int8Array(32); BIT_INDEX[1]=0; BIT_INDEX[2]=1; BIT_INDEX[4]=2; BIT_INDEX[8]=3; BIT_INDEX[16]=4;
const SUBSET_POP = new Int8Array(32); for(let s=1;s<32;s++) SUBSET_POP[s]=SUBSET_POP[s>>1]+(s&1);
const COUNTS = new Int32Array(32), INTER = new Uint32Array(32), MAPPED_COUNTS = new Int32Array(32);
const QPERF=new Float64Array(5), QTECH=new Float64Array(5), QSENSE=new Float64Array(5), QALL=new Float64Array(5), QSUPPORT=new Float64Array(5);
const QAMAG=new Float64Array(5),QAPROB=new Float64Array(5),QSDIRECT=new Float64Array(5),QSRAWSAR=new Float64Array(5),QSPASSIVESAR=new Float64Array(5),QSORDER=new Int8Array(5);
let MASKS=[], UPTIME=[], BOARD_MASKS=[], BOARD_UPTIME=[], WORDS=0, SONG=140;
const BOARD_COUNTS=new Int32Array(32);
const BOARD_MAX_NODES_PER_MEMBER=3, BOARD_INTERVAL_REDUCTION_PER_NODE=0.04;

function popcount32(x){x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return ((((x+(x>>>4))&0x0F0F0F0F)*0x01010101)>>>24);}
function memberId(card){return card.characterId;}
function cardLabel(card){return card.displayKey||`${card.member} | ${card.skin}`;}
const ELIGIBILITY_CODES=new Map();
function eligibilityCode(id){if(!id)return -1;let code=ELIGIBILITY_CODES.get(id);if(code===undefined){code=ELIGIBILITY_CODES.size;ELIGIBILITY_CODES.set(id,code);}return code;}
function registerEligibility(x){if(x&&(x.kind==='attribute'||x.kind==='group'))eligibilityCode(x.id);}
for(const c of CARDS){eligibilityCode(c.attributeId);for(const gid of c.groupIds||[])eligibilityCode(gid);registerEligibility(c.active?.trigger);registerEligibility(c.passive?.target);registerEligibility(c.passive?.trigger);registerEligibility(c.special?.sarTrigger);for(const e of c.outfit?.effects||[])registerEligibility(e.trigger);}
const ELIGIBILITY_WORDS=Math.max(1,Math.ceil(ELIGIBILITY_CODES.size/32));
function setEligibility(words,id){const code=eligibilityCode(id);if(code>=0)words[code>>>5]|=1<<(code&31);}
for(const c of CARDS){const words=new Uint32Array(ELIGIBILITY_WORDS);setEligibility(words,c.attributeId);for(const gid of c.groupIds||[])setEligibility(words,gid);c._eligibilityWords=words;}
function annotateEligibility(x){if(x&&(x.kind==='attribute'||x.kind==='group')){const code=eligibilityCode(x.id);x._word=code>>>5;x._bit=1<<(code&31);}}
for(const c of CARDS){annotateEligibility(c.active?.trigger);annotateEligibility(c.passive?.target);annotateEligibility(c.passive?.trigger);annotateEligibility(c.special?.sarTrigger);for(const e of c.outfit?.effects||[])annotateEligibility(e.trigger);}
function targetEligible(card,target){if(!target)return false;if(target.kind==='all')return true;if(target.kind==='attribute'||target.kind==='group')return (card._eligibilityWords[target._word]&target._bit)!==0;return false;}
function triggerSatisfied(trigger,ids){
  if(!trigger)return true;
  if(trigger.kind==='attribute'||trigger.kind==='group'){let n=0;const word=trigger._word,bit=trigger._bit;for(let i=0;i<5;i++)if(CARDS[ids[i]]._eligibilityWords[word]&bit)n++;return n>=(trigger.count||1);}
  // The score model deliberately assumes gameplay-state conditions are satisfied.
  if(trigger.kind==='combo_gte'||trigger.kind==='life_gte'||trigger.kind==='life_lte'||trigger.kind==='judgement_gte')return true;
  return false;
}
function activeMagnitude(card,ids){
  const a=card.active;
  return a.conditionalMagnitude!==null&&a.conditionalMagnitude!==undefined&&triggerSatisfied(a.trigger,ids)?a.conditionalMagnitude:a.baseMagnitude;
}
function baseActiveProbability(card){return Math.max(0,Math.min(1,Number(card.active.probability)||0));}
function effectiveActiveProbability(card,sarMultiplier=1){return Math.min(1,baseActiveProbability(card)*sarMultiplier);}

const COMBO_SPECIAL_WEIGHTS=[0.894342157744536,1.1912388493878143,1.4104057162046644,1.5165205256249472,1.062966970534175];
const COMBO_SPECIAL_WEIGHT_ORDER=[0,4,1,2,3];
const NEUTRAL_SPECIAL_WEIGHTS=[1,1,1,1,1];
function specialData(card,ids){
  const s=card.special||{magnitude:0,duration:0,sarPct:0,sarTrigger:null,text:'Not modeled'};
  const sarPct=s.sarPct>0&&triggerSatisfied(s.sarTrigger,ids)?s.sarPct:0;
  return {magnitude:Number(s.magnitude)||0,duration:Number(s.duration)||0,hasSar:sarPct>0,sarPct,text:String(s.text||'')};
}
function specialForOrder(ids,params){
  if(params.specialMode==='off')return {supportExposure:0,supportUplift:0,values:[],sarWindows:[],sarCount:0};
  const weights=params.specialMode==='neutral'?NEUTRAL_SPECIAL_WEIGHTS:COMBO_SPECIAL_WEIGHTS;
  let supportExposure=0;const values=[],sarWindows=[];
  for(let i=0;i<5;i++){
    const card=CARDS[ids[i]],sp=specialData(card,ids),exposure=Math.min(sp.duration,SONG)/SONG,weight=weights[i],supportPct=sp.magnitude/100,weightedExposure=exposure*weight;
    supportExposure+=supportPct*weightedExposure;
    const value={position:i+1,member:card.member,magnitude:sp.magnitude,supportPct,duration:sp.duration,weight,exposure,weightedExposure,bonus:0,hasSar:sp.hasSar,sarPct:sp.sarPct,text:sp.text};
    values.push(value);
    if(sp.sarPct>0&&sp.duration>0)sarWindows.push({...value,multiplier:1+sp.sarPct});
  }
  return {supportExposure,supportUplift:0,values,sarWindows,sarCount:sarWindows.length};
}
function activeAtGenericSecond(t,iv,d){if(!(iv>0&&d>0)||t<iv)return false;const n=Math.floor(t/iv+1e-12);if(n<1)return false;const phase=t-n*iv;return phase>=-1e-9&&phase<d-1e-9;}
function boardInterval(card,nodes=0){const iv=Number(card.active?.interval)||0,n=Math.max(0,Math.min(BOARD_MAX_NODES_PER_MEMBER,Math.round(Number(nodes)||0)));return iv>0?iv*(1-BOARD_INTERVAL_REDUCTION_PER_NODE*n):0;}
function buildMasks(song){SONG=song;WORDS=Math.ceil(song/32);BOARD_UPTIME=Array.from({length:4},()=>new Int32Array(CARDS.length));BOARD_MASKS=Array.from({length:4},()=>new Array(CARDS.length));for(let n=0;n<=BOARD_MAX_NODES_PER_MEMBER;n++){for(let ci=0;ci<CARDS.length;ci++){const c=CARDS[ci],a=new Uint32Array(WORDS),d=Number(c.active.duration)||0,iv=boardInterval(c,n);let up=0;if(d>0&&iv>0){for(let t=1;t<=song;t++){if(activeAtGenericSecond(t,iv,d)){const z=t-1;a[z>>>5]|=(1<<(z&31));up++;}}}BOARD_UPTIME[n][ci]=up;BOARD_MASKS[n][ci]=a;}}MASKS=BOARD_MASKS[0];UPTIME=BOARD_UPTIME[0];}
function calcCounts(ids,out=COUNTS){out.fill(0);for(let w=0;w<WORDS;w++){INTER[0]=0xFFFFFFFF;for(let s=1;s<32;s++){const bit=s&-s,idx=BIT_INDEX[bit];INTER[s]=INTER[s^bit]&MASKS[ids[idx]][w];out[s]+=popcount32(INTER[s]);}}return out;}
function calcCountsWithBoard(ids,nodes,out=BOARD_COUNTS){out.fill(0);for(let w=0;w<WORDS;w++){INTER[0]=0xFFFFFFFF;for(let s=1;s<32;s++){const bit=s&-s,idx=BIT_INDEX[bit],n=Math.max(0,Math.min(3,Number(nodes?.[idx])||0));INTER[s]=INTER[s^bit]&BOARD_MASKS[n][ids[idx]][w];out[s]+=popcount32(INTER[s]);}}return out;}
function mapCounts(base,perm,out=MAPPED_COUNTS){out[0]=0;for(let s=1;s<32;s++){let m=0;for(let p=0;p<5;p++)if(s&(1<<p))m|=1<<perm[p];out[s]=base[m];}return out;}
function permutations(arr){const out=[];function rec(a,l){if(l===a.length){out.push(a.slice());return;}for(let i=l;i<a.length;i++){[a[l],a[i]]=[a[i],a[l]];rec(a,l+1);[a[l],a[i]]=[a[i],a[l]];}}rec(arr.slice(),0);return out;}
const PERM4=permutations([1,2,3,4]).map(p=>[0,...p]);
const PERM5=permutations([0,1,2,3,4]);
class MinHeap{constructor(limit){this.a=[];this.limit=limit;}push(x){const a=this.a;if(a.length<this.limit){a.push(x);this.up(a.length-1);}else if(x.score>a[0].score){a[0]=x;this.down(0);}}up(i){const a=this.a;while(i){const p=(i-1)>>1;if(a[p].score<=a[i].score)break;[a[p],a[i]]=[a[i],a[p]];i=p;}}down(i){const a=this.a,n=a.length;for(;;){let l=i*2+1,r=l+1,m=i;if(l<n&&a[l].score<a[m].score)m=l;if(r<n&&a[r].score<a[m].score)m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}sorted(){return this.a.sort((x,y)=>y.score-x.score);}}

const TP=new Float64Array(5),TRANK=new Int8Array(5),TMAG=new Float64Array(5),TPRIORITY=new Int8Array([0,1,2,3,4]);
function timing(ids,counts,support,params,sarMultiplier=1,withDetails=false){
  const p=TP,rank=TRANK,magnitudes=TMAG,priority=TPRIORITY;for(let i=0;i<5;i++)priority[i]=i;
  for(let i=0;i<5;i++){p[i]=effectiveActiveProbability(CARDS[ids[i]],sarMultiplier);magnitudes[i]=activeMagnitude(CARDS[ids[i]],ids);}
  priority.sort((a,b)=>magnitudes[b]-magnitudes[a] || a-b);
  for(let r=0;r<5;r++)rank[priority[r]]=r;
  let raw=0,supported=0;
  for(let i=0;i<5;i++){
    let higher=0;for(let j=0;j<5;j++)if(rank[j]<rank[i])higher|=1<<j;
    let factor=0,sub=higher;
    for(;;){let prod=1;for(let j=0;j<5;j++)if(sub&(1<<j))prod*=p[j];factor+=(SUBSET_POP[sub]&1?-1:1)*prod*counts[(1<<i)|sub];if(sub===0)break;sub=(sub-1)&higher;}
    const contribution=magnitudes[i]*p[i]*factor/SONG;raw+=contribution;supported+=contribution*(1+support[i]);
  }
  let coverage=0;for(let s=1;s<32;s++){let prod=1;for(let j=0;j<5;j++)if(s&(1<<j))prod*=p[j];coverage+=(SUBSET_POP[s]&1?1:-1)*prod*counts[s]/SONG;}
  const out={raw,supported,coverage};if(withDetails){out.probabilities=Array.from(p);out.magnitudes=Array.from(magnitudes);}return out;
}
function sarForOrder(ids,counts,support,params,sp,baseTiming,withDetails=false){
  if(params.specialMode==='off'||!sp.sarWindows.length)return {rawUplift:0,passiveUplift:0,specialSupportUplift:0,coverage:baseTiming.coverage,coverageUplift:0,values:[]};
  let rawUplift=0,passiveUplift=0,specialSupportUplift=0,coverageUplift=0;const values=withDetails?[]:null;
  for(const window of sp.sarWindows){
    const boosted=timing(ids,counts,support,params,window.multiplier,withDetails);
    const scale=window.exposure*window.weight,rawDelta=(boosted.raw-baseTiming.raw)*scale,passiveDelta=(boosted.supported-baseTiming.supported)*scale,specialDelta=rawDelta*window.supportPct;
    const coverageDelta=(boosted.coverage-baseTiming.coverage)*window.exposure;
    rawUplift+=rawDelta;passiveUplift+=passiveDelta;specialSupportUplift+=specialDelta;coverageUplift+=coverageDelta;
    if(withDetails)values.push({...window,rawUplift:rawDelta,passiveUplift:passiveDelta,specialSupportUplift:specialDelta,coverageUplift:coverageDelta,boostedProbabilities:boosted.probabilities});
  }
  return {rawUplift,passiveUplift,specialSupportUplift,coverage:Math.min(1,baseTiming.coverage+coverageUplift),coverageUplift,values:values||[]};
}
function outfitBonuses(ids,outfitId,withDetails=false){
  const out=CARDS[outfitId].outfit||{effects:[]};
  let perf=0,tech=0,sense=0,all=0,support=0,triggeredCount=0;const details=withDetails?[]:null;
  for(const effect of out.effects||[]){
    const triggered=triggerSatisfied(effect.trigger,ids);if(withDetails)details.push({kind:effect.kind,pct:effect.pct,triggered});
    if(!triggered)continue;triggeredCount++;
    if(effect.kind==='perf')perf+=effect.pct;else if(effect.kind==='tech')tech+=effect.pct;else if(effect.kind==='sense')sense+=effect.pct;else if(effect.kind==='all')all+=effect.pct;else if(effect.kind==='support')support+=effect.pct;
  }
  return {perf,tech,sense,all,support,triggeredCount,details:details||[]};
}
function outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails=false){
  const owner=CARDS[outfitId],bon=outfitBonuses(ids,outfitId,withDetails);
  const stat=baseStat+sumPerf*(bon.perf+bon.all)+sumTech*(bon.tech+bon.all)+sumSense*(bon.sense+bon.all);
  const supportUplift=(tm.supported-tm.raw)+bon.support*tm.raw;
  const specialSupportUplift=Number(sp.supportUplift)||0;
  const sarUplift=(Number(sar.passiveUplift)||0)+bon.support*(Number(sar.rawUplift)||0)+(Number(sar.specialSupportUplift)||0);
  const adjusted=tm.raw+supportUplift+specialSupportUplift+sarUplift,totalBonus=adjusted+params.other,index=stat*(1+totalBonus/100);
  return {score:index,stat,raw:tm.raw,uplift:supportUplift,sarUplift,supported:adjusted,coverage:sar.coverage,specialSupportUplift,specialBonus:specialSupportUplift,totalBonus,
    outfitCard:owner.id,outfitKey:owner.key,outfitOwner:owner.member,outfitText:owner.outfit.text,outfitTriggered:bon.triggeredCount>0||!(owner.outfit.effects||[]).length,outfitSupport:bon.support,outfitExternal:!ids.includes(outfitId),outfitEffectDetails:bon.details};
}

let ACTIVE_CHART=null;
function lowerBoundNumeric(arr,value){let lo=0,hi=arr.length;while(lo<hi){const mid=(lo+hi)>>>1;if(arr[mid]<value)lo=mid+1;else hi=mid;}return lo;}
function prepareChart(params){
  if(params.scoringMode!=='chart'){ACTIVE_CHART=null;return null;}
  const c=params.chart;if(!c||!c.timelineAvailable||!Array.isArray(c.notes)||!Array.isArray(c.specialTimesMs)||c.specialTimesMs.length!==5)throw new Error('The selected chart does not contain a validated v3 note timeline. Import or build a chart snapshot with timelines first.');
  if(c._ctx){ACTIVE_CHART=c._ctx;return ACTIVE_CHART;}
  const n=c.notes.length,times=new Int32Array(n),prefix=new Float64Array(n+1);let total=0;
  for(let i=0;i<n;i++){const row=c.notes[i];times[i]=Number(row[0])|0;const w=Number(row[1])||0;if(i&&times[i]<times[i-1])throw new Error('Chart notes are not sorted by timestamp.');total+=w;prefix[i+1]=total;}
  if(!n||!(total>0))throw new Error('The selected chart has no usable Perfect-FC note weights.');
  const ctx={chart:c,times,prefix,total,lastMs:times[n-1],specialTimesMs:c.specialTimesMs.map(x=>Number(x)||0)};c._ctx=ctx;ACTIVE_CHART=ctx;return ctx;
}
function chartWeightBetween(ctx,startMs,endMs){if(endMs<=startMs)return 0;const a=lowerBoundNumeric(ctx.times,startMs),b=lowerBoundNumeric(ctx.times,endMs);return ctx.prefix[b]-ctx.prefix[a];}
function chartComboBefore(ctx,timeMs){return lowerBoundNumeric(ctx.times,timeMs);}
function chartActiveMagnitude(card,ids,checkMs,ctx){
  const a=card.active||{},conditional=a.conditionalMagnitude;
  if(conditional===null||conditional===undefined)return Number(a.baseMagnitude)||0;
  const tr=a.trigger;if(!tr)return Number(conditional)||0;
  if(tr.kind==='combo_gte')return chartComboBefore(ctx,checkMs)>=(Number(tr.threshold)||0)?Number(conditional)||0:Number(a.baseMagnitude)||0;
  if(tr.kind==='life_gte'||tr.kind==='life_lte'||tr.kind==='judgement_gte')return Number(conditional)||0; // Perfect-FC model.
  return triggerSatisfied(tr,ids)?Number(conditional)||0:Number(a.baseMagnitude)||0;
}
function chartSpecialForOrder(ids,params,ctx){
  if(params.specialMode==='off')return {supportUplift:0,values:[],supportWindows:[],sarWindows:[],sarCount:0};
  const values=[],supportWindows=[],sarWindows=[];
  for(let i=0;i<5;i++){
    const card=CARDS[ids[i]],sp=specialData(card,ids),start=ctx.specialTimesMs[i],end=start+Math.max(0,sp.duration)*1000,weight=chartWeightBetween(ctx,start,end),share=weight/ctx.total,supportPct=sp.magnitude/100;
    const value={position:i+1,member:card.member,magnitude:sp.magnitude,supportPct,duration:sp.duration,weight:share,bonus:0,triggerTime:start/1000,chartWindowShare:share,hasSar:sp.hasSar,sarPct:sp.sarPct,text:sp.text,startMs:start,endMs:end};
    values.push(value);if(sp.magnitude>0&&sp.duration>0)supportWindows.push({...value});if(sp.sarPct>0&&sp.duration>0)sarWindows.push({...value,multiplier:1+sp.sarPct});
  }
  return {supportUplift:0,values,supportWindows,sarWindows,sarCount:sarWindows.length};
}
function sarMultiplierAtCheck(checkMs,sp){let pct=0;for(const win of sp.sarWindows)if(checkMs>=win.startMs&&checkMs<win.endMs)pct+=Number(win.sarPct)||0;return 1+pct;}
function chartActivationWindows(ids,ctx,sp,useSar){
  const windows=[];const checkCounts=new Int32Array(5),sarCheckCounts=new Int32Array(5);
  for(let i=0;i<5;i++){
    const card=CARDS[ids[i]],a=card.active||{},intervalMs=Math.round((Number(a.interval)||0)*1000),durationMs=Math.round((Number(a.duration)||0)*1000);if(intervalMs<=0||durationMs<=0)continue;
    for(let check=intervalMs;check<=ctx.lastMs;check+=intervalMs){const mag=chartActiveMagnitude(card,ids,check,ctx),mult=useSar?sarMultiplierAtCheck(check,sp):1,p=Math.min(1,baseActiveProbability(card)*mult);checkCounts[i]++;if(mult>1)sarCheckCounts[i]++;if(mag>0&&p>0&&chartWeightBetween(ctx,check,check+durationMs)>0)windows.push({start:check,end:check+durationMs,card:i,mag,p,check,mult});}
  }
  return {windows,checkCounts,sarCheckCounts};
}
function chartTiming(ids,support,params,ctx,sp,useSar,withDetails=false){
  const built=chartActivationWindows(ids,ctx,sp,useSar),events=new Map(),boundarySet=new Set([0,ctx.lastMs+1]);
  const addEvent=(t,e)=>{if(!events.has(t))events.set(t,[]);events.get(t).push(e);boundarySet.add(t);};
  for(let w=0;w<built.windows.length;w++){const x=built.windows[w];addEvent(x.start,{start:true,w});addEvent(x.end,{start:false,w});}
  for(const win of sp.supportWindows||[]){boundarySet.add(win.startMs);boundarySet.add(win.endMs);}
  const boundaries=[...boundarySet].sort((a,b)=>a-b),active=new Map(),specialUplifts=new Float64Array(5);let raw=0,supported=0,specialSupportUplift=0,coverage=0;
  for(let bi=0;bi<boundaries.length-1;bi++){
    const t=boundaries[bi],evs=events.get(t);if(evs){evs.sort((a,b)=>(a.start?1:0)-(b.start?1:0));for(const e of evs){const x=built.windows[e.w];if(e.start)active.set(x.card,x);else active.delete(x.card);}}
    const next=boundaries[bi+1];if(next<=t||!active.size)continue;const segmentWeight=chartWeightBetween(ctx,t,next);if(segmentWeight<=0)continue;
    const xs=[...active.values()].sort((a,b)=>b.mag-a.mag||a.card-b.card);let survive=1,segRaw=0,segSupported=0;for(const x of xs){const win=survive*x.p;segRaw+=x.mag*win;segSupported+=x.mag*win*(1+support[x.card]);survive*=1-x.p;}
    const share=segmentWeight/ctx.total;raw+=segRaw*share;supported+=segSupported*share;coverage+=(1-survive)*share;
    let specialPct=0;for(const win of sp.supportWindows||[])if(t>=win.startMs&&t<win.endMs){specialPct+=win.supportPct;specialUplifts[win.position-1]+=segRaw*win.supportPct*share;}
    specialSupportUplift+=segRaw*specialPct*share;
  }
  const out={raw,supported,specialSupportUplift,specialUplifts:Array.from(specialUplifts),coverage,checkCounts:Array.from(built.checkCounts),sarCheckCounts:Array.from(built.sarCheckCounts)};
  if(withDetails){out.probabilities=ids.map(id=>baseActiveProbability(CARDS[id]));out.magnitudes=ids.map(id=>activeMagnitude(CARDS[id],ids));}
  return out;
}
function chartSarDetails(ids,sp,ctx){const values=[];for(const win of sp.sarWindows){let affected=0;const byCard=[];for(let i=0;i<5;i++){const iv=Math.round((Number(CARDS[ids[i]].active?.interval)||0)*1000);let n=0;if(iv>0)for(let t=iv;t<=ctx.lastMs;t+=iv)if(t>=win.startMs&&t<win.endMs)n++;affected+=n;byCard.push(n);}values.push({...win,affectedChecks:affected,affectedChecksByCard:byCard});}return values;}
function evaluateOrderChartBase(ids,params,withDetails=false,compareOutfits=false){
  const ctx=ACTIVE_CHART||prepareChart(params),perf=new Float64Array(5),tech=new Float64Array(5),sense=new Float64Array(5),all=new Float64Array(5),support=new Float64Array(5),passiveDetails=[];
  for(let s=0;s<5;s++){const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);if(!nRecipients)continue;for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')support[i]+=pa.pct;else if(pa.kind==='perf')perf[i]+=pa.pct;else if(pa.kind==='tech')tech[i]+=pa.pct;else if(pa.kind==='sense')sense[i]+=pa.pct;else if(pa.kind==='all')all[i]+=pa.pct;}if(withDetails){const names=[];for(let q=0;q<nRecipients;q++)names.push(CARDS[ids[RECIPIENT_BUF[q]]].member);passiveDetails.push(`${src.member}: ${pa.text} → ${names.join(', ')}`);}}
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0;for(let i=0;i<5;i++){const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+perf[i]+all[i])+c.tech*(1+tech[i]+all[i])+c.sense*(1+sense[i]+all[i]);}
  const sp=chartSpecialForOrder(ids,params,ctx),tm=chartTiming(ids,support,params,ctx,sp,false,withDetails),boosted=sp.sarWindows.length?chartTiming(ids,support,params,ctx,sp,true,withDetails):tm;
  sp.supportUplift=tm.specialSupportUplift;for(let i=0;i<sp.values.length;i++)sp.values[i].bonus=tm.specialUplifts[i]||0;
  const sar={rawUplift:boosted.raw-tm.raw,passiveUplift:boosted.supported-tm.supported,specialSupportUplift:boosted.specialSupportUplift-tm.specialSupportUplift,coverage:boosted.coverage,coverageUplift:boosted.coverage-tm.coverage,values:withDetails?chartSarDetails(ids,sp,ctx):[]};
  let bestTeam=null;for(let o=0;o<5;o++){const x=outfitOutcome(ids,ids[o],baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);if(!bestTeam||x.score>bestTeam.score)bestTeam=x;}
  let bestAny=bestTeam;if(params.outfitMode==='any'||(params.outfitMode==='fixed'&&compareOutfits)){for(const outfitId of params.ownedOutfitIds){const x=outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);if(!bestAny||x.score>bestAny.score)bestAny=x;}}
  let used=bestTeam,comparison=bestTeam;if(params.outfitMode==='any'){used=bestAny;comparison=bestAny;}else if(params.outfitMode==='fixed'){const fixed=CARD_BY_KEY.get(params.outfitKey);if(fixed===undefined)return null;used=outfitOutcome(ids,fixed,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);comparison=compareOutfits?bestAny:used;}else if(params.outfitMode==='oshi'){const oid=ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);if(oid===undefined)return null;used=outfitOutcome(ids,oid,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);comparison=bestTeam;}
  const result={...used,bestAvailableScore:comparison.score,bestAvailableOutfitCard:comparison.outfitCard,bestAvailableOutfitKey:comparison.outfitKey,bestAvailableOutfitOwner:comparison.outfitOwner,bestAvailableOutfitText:comparison.outfitText,bestAvailableOutfitTriggered:comparison.outfitTriggered,bestAvailableOutfitExternal:comparison.outfitExternal,scoringMode:'chart',chartKey:ctx.chart.key,chartTitle:ctx.chart.title,chartDifficulty:ctx.chart.difficulty,chartNoteCount:ctx.times.length};
  if(withDetails){result.activeProbabilities=tm.probabilities;result.activeMagnitudes=tm.magnitudes;result.activeCheckCounts=boosted.checkCounts;result.sarCheckCounts=boosted.sarCheckCounts;result.ids=ids.slice();result.cards=ids.map(i=>cardLabel(CARDS[i]));result.cardIds=ids.map(i=>CARDS[i].id);result.cardKeys=ids.map(i=>CARDS[i].key);result.cardProgress=ids.map(i=>({level:CARDS[i].level,bloom:CARDS[i].bloom,rarity:CARDS[i].rarity,boardFrequencyNodes:Number(CARDS[i].boardActiveFrequencyNodes)||Math.round((Number(CARDS[i].boardActiveFrequencyPct)||0)/4),boardActiveFrequencyPct:Number(CARDS[i].boardActiveFrequencyPct)||0,activeInterval:Number(CARDS[i].active?.interval)||0}));result.members=ids.map(i=>CARDS[i].member);result.passiveDetails=passiveDetails;result.support=Array.from(support);result.specialDetails=sp.values;result.sarDetails=sar.values;result.sarCount=sp.sarCount;result.coverageUplift=sar.coverageUplift;}
  return result;
}
function quickEvaluateChartBase(ids,params){
  const ctx=ACTIVE_CHART||prepareChart(params);QPERF.fill(0);QTECH.fill(0);QSENSE.fill(0);QALL.fill(0);QSUPPORT.fill(0);
  for(let s=0;s<5;s++){const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')QSUPPORT[i]+=pa.pct;else if(pa.kind==='perf')QPERF[i]+=pa.pct;else if(pa.kind==='tech')QTECH[i]+=pa.pct;else if(pa.kind==='sense')QSENSE[i]+=pa.pct;else if(pa.kind==='all')QALL[i]+=pa.pct;}}
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0,raw=0,supported=0;for(let i=0;i<5;i++){const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+QPERF[i]+QALL[i])+c.tech*(1+QTECH[i]+QALL[i])+c.sense*(1+QSENSE[i]+QALL[i]);const a=c.active||{},iv=Math.round((Number(a.interval)||0)*1000),dur=Math.round((Number(a.duration)||0)*1000),p=baseActiveProbability(c);if(iv>0&&dur>0&&p>0)for(let t=iv;t<=ctx.lastMs;t+=iv){const share=chartWeightBetween(ctx,t,t+dur)/ctx.total,con=chartActiveMagnitude(c,ids,t,ctx)*p*share;raw+=con;supported+=con*(1+QSUPPORT[i]);}}
  let specialSupport=0;if(params.specialMode!=='off'){for(let i=0;i<5;i++){const sp=specialData(CARDS[ids[i]],ids),start=ctx.specialTimesMs[i],share=chartWeightBetween(ctx,start,start+sp.duration*1000)/ctx.total;specialSupport+=raw*(sp.magnitude/100)*share;}}
  function scoreWithOutfit(outfitId){const bon=outfitBonuses(ids,outfitId);const stat=baseStat+sumPerf*(bon.perf+bon.all)+sumTech*(bon.tech+bon.all)+sumSense*(bon.sense+bon.all);const adjusted=supported+bon.support*raw+specialSupport;return stat*(1+(adjusted+params.other)/100);}
  if(params.outfitMode==='fixed'){const fixed=CARD_BY_KEY.get(params.outfitKey);return fixed===undefined?-Infinity:scoreWithOutfit(fixed);}if(params.outfitMode==='oshi'){const oid=ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);return oid===undefined?-Infinity:scoreWithOutfit(oid);}let best=-Infinity;const sources=params.outfitMode==='any'?(params._screening&&params.screenOutfitIds?params.screenOutfitIds:params.ownedOutfitIds):ids;for(const outfitId of sources){const score=scoreWithOutfit(outfitId);if(score>best)best=score;}return best;
}

const RECIPIENT_BUF=new Int8Array(5);
function passiveRecipients(ids,sourceIndex,pa,out=RECIPIENT_BUF){
  if(!triggerSatisfied(pa.trigger,ids))return 0;
  if(pa.target.kind==='self'){out[0]=sourceIndex;return 1;}
  let n=0;for(let i=0;i<5;i++)if(targetEligible(CARDS[ids[i]],pa.target))out[n++]=i;
  const count=pa.target.count||n;if(n<count)return 0;
  for(let i=1;i<n;i++){const v=out[i],vt=CARDS[ids[v]].total;let j=i-1;while(j>=0){const u=out[j],ut=CARDS[ids[u]].total;if(ut>vt||(ut===vt&&u<v))break;out[j+1]=u;j--;}out[j+1]=v;}
  return count;
}
function evaluateOrderGenericBase(ids,counts,params,withDetails=false,compareOutfits=false){
  const perf=new Float64Array(5),tech=new Float64Array(5),sense=new Float64Array(5),all=new Float64Array(5),support=new Float64Array(5);
  const passiveDetails=[];
  for(let s=0;s<5;s++){
    const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);if(!nRecipients)continue;
    for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')support[i]+=pa.pct;else if(pa.kind==='perf')perf[i]+=pa.pct;else if(pa.kind==='tech')tech[i]+=pa.pct;else if(pa.kind==='sense')sense[i]+=pa.pct;else if(pa.kind==='all')all[i]+=pa.pct;}
    if(withDetails){const names=[];for(let q=0;q<nRecipients;q++)names.push(CARDS[ids[RECIPIENT_BUF[q]]].member);passiveDetails.push(`${src.member}: ${pa.text} → ${names.join(', ')}`);}
  }
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0;
  for(let i=0;i<5;i++){const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+perf[i]+all[i])+c.tech*(1+tech[i]+all[i])+c.sense*(1+sense[i]+all[i]);}
  const sp=specialForOrder(ids,params),tm=timing(ids,counts,support,params,1,withDetails);sp.supportUplift=tm.raw*sp.supportExposure;for(const v of sp.values)v.bonus=tm.raw*v.supportPct*v.weightedExposure;const sar=sarForOrder(ids,counts,support,params,sp,tm,withDetails);
  let bestTeam=null;
  for(let o=0;o<5;o++){const x=outfitOutcome(ids,ids[o],baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);if(!bestTeam||x.score>bestTeam.score)bestTeam=x;}
  let bestAny=bestTeam;
  if(params.outfitMode==='any'||(params.outfitMode==='fixed'&&compareOutfits)){
    for(const outfitId of params.ownedOutfitIds){const x=outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);if(!bestAny||x.score>bestAny.score)bestAny=x;}
  }
  let used=bestTeam,comparison=bestTeam;
  if(params.outfitMode==='any'){used=bestAny;comparison=bestAny;}
  else if(params.outfitMode==='fixed'){
    const fixed=CARD_BY_KEY.get(params.outfitKey);if(fixed===undefined)return null;
    used=outfitOutcome(ids,fixed,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);comparison=compareOutfits?bestAny:used;
  }else if(params.outfitMode==='oshi'){const oid=ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);if(oid===undefined)return null;used=outfitOutcome(ids,oid,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,withDetails);comparison=bestTeam;}
  const result={...used,bestAvailableScore:comparison.score,bestAvailableOutfitCard:comparison.outfitCard,bestAvailableOutfitKey:comparison.outfitKey,bestAvailableOutfitOwner:comparison.outfitOwner,bestAvailableOutfitText:comparison.outfitText,bestAvailableOutfitTriggered:comparison.outfitTriggered,bestAvailableOutfitExternal:comparison.outfitExternal};
  if(withDetails){result.activeProbabilities=tm.probabilities;result.activeMagnitudes=tm.magnitudes;result.ids=ids.slice();result.cards=ids.map(i=>cardLabel(CARDS[i]));result.cardIds=ids.map(i=>CARDS[i].id);result.cardKeys=ids.map(i=>CARDS[i].key);result.cardProgress=ids.map(i=>({level:CARDS[i].level,bloom:CARDS[i].bloom,rarity:CARDS[i].rarity,boardFrequencyNodes:Number(CARDS[i].boardActiveFrequencyNodes)||Math.round((Number(CARDS[i].boardActiveFrequencyPct)||0)/4),boardActiveFrequencyPct:Number(CARDS[i].boardActiveFrequencyPct)||0,activeInterval:Number(CARDS[i].active?.interval)||0}));result.members=ids.map(i=>CARDS[i].member);result.passiveDetails=passiveDetails;result.support=Array.from(support);result.specialDetails=sp.values;result.sarDetails=sar.values;result.sarCount=sp.sarCount;result.coverageUplift=sar.coverageUplift;}
  return result;
}
function quickEvaluateGenericBase(ids,params){
  QPERF.fill(0);QTECH.fill(0);QSENSE.fill(0);QALL.fill(0);QSUPPORT.fill(0);
  for(let s=0;s<5;s++){
    const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);
    for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')QSUPPORT[i]+=pa.pct;else if(pa.kind==='perf')QPERF[i]+=pa.pct;else if(pa.kind==='tech')QTECH[i]+=pa.pct;else if(pa.kind==='sense')QSENSE[i]+=pa.pct;else if(pa.kind==='all')QALL[i]+=pa.pct;}
  }
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0,raw=0,supported=0;
  for(let i=0;i<5;i++){
    const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+QPERF[i]+QALL[i])+c.tech*(1+QTECH[i]+QALL[i])+c.sense*(1+QSENSE[i]+QALL[i]);
    const p=baseActiveProbability(c),mag=activeMagnitude(c,ids),contribution=mag*p*UPTIME[ids[i]]/SONG;QAPROB[i]=p;QAMAG[i]=mag;raw+=contribution;supported+=contribution*(1+QSUPPORT[i]);
  }
  let specialSupport=0,rawSar=0,passiveSar=0,specialSar=0;
  if(params.specialMode!=='off'){
    for(let k=0;k<5;k++){
      const c=CARDS[ids[k]],sp=specialData(c,ids),sarPct=sp.sarPct,duration=sp.duration,supportPct=sp.magnitude/100;
      QSDIRECT[k]=supportPct*duration/SONG;QSRAWSAR[k]=0;QSPASSIVESAR[k]=0;QSORDER[k]=k;
      if(sarPct>0&&duration>0){let boostedRaw=0,boostedSupported=0;const mult=1+sarPct;for(let i=0;i<5;i++){const p=Math.min(1,QAPROB[i]*mult),contribution=QAMAG[i]*p*UPTIME[ids[i]]/SONG;boostedRaw+=contribution;boostedSupported+=contribution*(1+QSUPPORT[i]);}const exposure=Math.min(duration,SONG)/SONG;QSRAWSAR[k]=(boostedRaw-raw)*exposure;QSPASSIVESAR[k]=(boostedSupported-supported)*exposure;}
    }
    if(params.specialMode==='combo')for(let i=1;i<5;i++){const v=QSORDER[i],vv=QSDIRECT[v]+QSPASSIVESAR[v]/Math.max(1,raw);let j=i-1;while(j>=0){const u=QSORDER[j],uv=QSDIRECT[u]+QSPASSIVESAR[u]/Math.max(1,raw);if(uv<=vv)break;QSORDER[j+1]=u;j--;}QSORDER[j+1]=v;}
    const weights=params.specialMode==='combo'?COMBO_SPECIAL_WEIGHTS:NEUTRAL_SPECIAL_WEIGHTS;
    for(let i=0;i<5;i++){const k=QSORDER[i],wi=params.specialMode==='combo'?COMBO_SPECIAL_WEIGHT_ORDER[i]:i;specialSupport+=raw*QSDIRECT[k]*weights[wi];rawSar+=QSRAWSAR[k]*weights[wi];passiveSar+=QSPASSIVESAR[k]*weights[wi];specialSar+=QSRAWSAR[k]*(CARDS[ids[k]].special.magnitude/100)*weights[wi];}
  }
  function scoreWithOutfit(outfitId){const bon=outfitBonuses(ids,outfitId);const stat=baseStat+sumPerf*(bon.perf+bon.all)+sumTech*(bon.tech+bon.all)+sumSense*(bon.sense+bon.all);const adjusted=supported+passiveSar+bon.support*(raw+rawSar)+specialSupport+specialSar;return stat*(1+(adjusted+params.other)/100);}
  if(params.outfitMode==='fixed'){const fixed=CARD_BY_KEY.get(params.outfitKey);return fixed===undefined?-Infinity:scoreWithOutfit(fixed);}
  if(params.outfitMode==='oshi'){const oid=ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);return oid===undefined?-Infinity:scoreWithOutfit(oid);}
  let best=-Infinity;const sources=params.outfitMode==='any'?(params._screening&&params.screenOutfitIds?params.screenOutfitIds:params.ownedOutfitIds):ids;for(const outfitId of sources){const score=scoreWithOutfit(outfitId);if(score>best)best=score;}return best;
}
function boardBudget(params){return Math.max(0,Math.min(12,Math.round(Number(params.boardFrequencyNodes)||0)));}
function boardModeEnabled(params){return params?.boardMode==='optimize'&&boardBudget(params)>0;}
function boardLeaderIndex(ids,outfitId){if(outfitId===undefined||outfitId===null)return -1;const leaderCharacter=memberId(CARDS[outfitId]);return ids.findIndex(id=>memberId(CARDS[id])===leaderCharacter);}
function chooseBoardNodesFromValues(values,leaderIndex,budget){
  const B=Math.max(0,Math.min(12,Math.round(Number(budget)||0))),neg=-1e300,picks=Array.from({length:5},()=>new Int8Array(B+1)),froms=Array.from({length:5},()=>new Int8Array(B+1));
  let prev=new Float64Array(B+1);prev.fill(neg);prev[0]=0;
  for(let i=0;i<5;i++){
    const cur=new Float64Array(B+1);cur.fill(neg);picks[i].fill(-1);froms[i].fill(-1);const maxN=i===leaderIndex?0:BOARD_MAX_NODES_PER_MEMBER;
    for(let used=0;used<=B;used++){if(prev[used]<=neg/2)continue;for(let n=0;n<=maxN&&used+n<=B;n++){const score=prev[used]+(Number(values[i]?.[n])||0),next=used+n;if(score>cur[next]+1e-12){cur[next]=score;picks[i][next]=n;froms[i][next]=used;}}}
    prev=cur;
  }
  let bestB=0,best=prev[0];for(let b=1;b<=B;b++)if(prev[b]>best+1e-12){best=prev[b];bestB=b;}
  const nodes=new Int8Array(5);let b=bestB;for(let i=4;i>=0;i--){const n=picks[i][b];nodes[i]=n<0?0:n;b=froms[i][b]<0?0:froms[i][b];}return Array.from(nodes);
}
function genericBoardValues(ids,support){const values=[];for(let i=0;i<5;i++){const c=CARDS[ids[i]],mag=activeMagnitude(c,ids),p=baseActiveProbability(c),row=[];for(let n=0;n<=3;n++)row.push(mag*p*BOARD_UPTIME[n][ids[i]]/SONG*(1+(support?.[i]||0)));values.push(row);}return values;}
function chartBoardValues(ids,support,ctx){const values=[];for(let i=0;i<5;i++){const c=CARDS[ids[i]],a=c.active||{},dur=Math.round((Number(a.duration)||0)*1000),p=baseActiveProbability(c),row=[];for(let n=0;n<=3;n++){const iv=Math.round(boardInterval(c,n)*1000);let value=0;if(iv>0&&dur>0&&p>0)for(let t=iv;t<=ctx.lastMs;t+=iv){const share=chartWeightBetween(ctx,t,t+dur)/ctx.total;value+=chartActiveMagnitude(c,ids,t,ctx)*p*share*(1+(support?.[i]||0));}row.push(value);}values.push(row);}return values;}
function chooseBoardNodesGeneric(ids,support,params,outfitId){return chooseBoardNodesFromValues(genericBoardValues(ids,support),boardLeaderIndex(ids,outfitId),boardBudget(params));}
function chooseBoardNodesChart(ids,support,params,outfitId,ctx){return chooseBoardNodesFromValues(chartBoardValues(ids,support,ctx),boardLeaderIndex(ids,outfitId),boardBudget(params));}
function boardQuickOutfitId(ids,params){if(params.outfitMode==='fixed')return CARD_BY_KEY.get(params.outfitKey);if(params.outfitMode==='oshi')return ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);return null;}
function boardShortlist(sources,ids,scoreFn,limit=2){const ranked=[];const seen=new Set();for(const outfitId of sources||[]){if(outfitId===undefined||outfitId===null||seen.has(outfitId))continue;seen.add(outfitId);const score=scoreFn(outfitId);if(Number.isFinite(score))ranked.push({outfitId,score,leader:boardLeaderIndex(ids,outfitId)});}ranked.sort((a,b)=>b.score-a.score);const out=ranked.slice(0,Math.max(1,limit)).map(x=>x.outfitId),ext=ranked.find(x=>x.leader<0);if(ext&&!out.includes(ext.outfitId))out.push(ext.outfitId);return out;}
function boardUsedSources(ids,params){if(params.outfitMode==='fixed'){const fixed=CARD_BY_KEY.get(params.outfitKey);return fixed===undefined?[]:[fixed];}if(params.outfitMode==='oshi'){const oid=ids.find(id=>memberId(CARDS[id])===params.oshiCharacterId);return oid===undefined?[]:[oid];}return params.outfitMode==='any'?params.ownedOutfitIds:ids;}
function boardAttachDetails(out,ids,nodes,support,passiveDetails,tm,sp,sar,params,scoringMode,ctx=null){
  out.boardMode='optimize';out.boardFrequencyNodes=nodes.slice();out.boardFrequencyNodesAvailable=boardBudget(params);out.boardFrequencyNodesUsed=nodes.reduce((a,b)=>a+b,0);out.boardLeaderCharacterId=CARDS[out._outfitIndex]?.characterId||null;
  out.activeProbabilities=tm.probabilities||ids.map(id=>baseActiveProbability(CARDS[id]));out.activeMagnitudes=tm.magnitudes||ids.map(id=>activeMagnitude(CARDS[id],ids));out.ids=ids.slice();out.cards=ids.map(i=>cardLabel(CARDS[i]));out.cardIds=ids.map(i=>CARDS[i].id);out.cardKeys=ids.map(i=>CARDS[i].key);out.cardProgress=ids.map((id,i)=>({level:CARDS[id].level,bloom:CARDS[id].bloom,rarity:CARDS[id].rarity,boardFrequencyNodes:nodes[i]||0,boardActiveFrequencyNodes:nodes[i]||0,boardActiveFrequencyPct:(nodes[i]||0)*4,activeInterval:boardInterval(CARDS[id],nodes[i]||0)}));out.members=ids.map(i=>CARDS[i].member);out.passiveDetails=passiveDetails;out.support=Array.from(support);out.specialDetails=sp.values;out.sarDetails=sar.values;out.sarCount=sp.sarCount;out.coverageUplift=sar.coverageUplift;
  if(scoringMode==='chart'){out.activeCheckCounts=tm.checkCounts;out.sarCheckCounts=tm.sarCheckCounts;out.scoringMode='chart';out.chartKey=ctx.chart.key;out.chartTitle=ctx.chart.title;out.chartDifficulty=ctx.chart.difficulty;out.chartNoteCount=ctx.times.length;}
}
function chartActivationWindowsBoard(ids,ctx,sp,useSar,nodes){const windows=[];const checkCounts=new Int32Array(5),sarCheckCounts=new Int32Array(5);for(let i=0;i<5;i++){const card=CARDS[ids[i]],a=card.active||{},intervalMs=Math.round(boardInterval(card,nodes?.[i]||0)*1000),durationMs=Math.round((Number(a.duration)||0)*1000);if(intervalMs<=0||durationMs<=0)continue;for(let check=intervalMs;check<=ctx.lastMs;check+=intervalMs){const mag=chartActiveMagnitude(card,ids,check,ctx),mult=useSar?sarMultiplierAtCheck(check,sp):1,p=Math.min(1,baseActiveProbability(card)*mult);checkCounts[i]++;if(mult>1)sarCheckCounts[i]++;if(mag>0&&p>0&&chartWeightBetween(ctx,check,check+durationMs)>0)windows.push({start:check,end:check+durationMs,card:i,mag,p,check,mult});}}return {windows,checkCounts,sarCheckCounts};}
function chartTimingBoard(ids,support,params,ctx,sp,useSar,nodes,withDetails=false){const built=chartActivationWindowsBoard(ids,ctx,sp,useSar,nodes),events=new Map(),boundarySet=new Set([0,ctx.lastMs+1]);const addEvent=(t,e)=>{if(!events.has(t))events.set(t,[]);events.get(t).push(e);boundarySet.add(t);};for(let w=0;w<built.windows.length;w++){const x=built.windows[w];addEvent(x.start,{start:true,w});addEvent(x.end,{start:false,w});}for(const win of sp.supportWindows||[]){boundarySet.add(win.startMs);boundarySet.add(win.endMs);}const boundaries=[...boundarySet].sort((a,b)=>a-b),active=new Map(),specialUplifts=new Float64Array(5);let raw=0,supported=0,specialSupportUplift=0,coverage=0;for(let bi=0;bi<boundaries.length-1;bi++){const t=boundaries[bi],evs=events.get(t);if(evs){evs.sort((a,b)=>(a.start?1:0)-(b.start?1:0));for(const e of evs){const x=built.windows[e.w];if(e.start)active.set(x.card,x);else active.delete(x.card);}}const next=boundaries[bi+1];if(next<=t||!active.size)continue;const segmentWeight=chartWeightBetween(ctx,t,next);if(segmentWeight<=0)continue;const xs=[...active.values()].sort((a,b)=>b.mag-a.mag||a.card-b.card);let survive=1,segRaw=0,segSupported=0;for(const x of xs){const win=survive*x.p;segRaw+=x.mag*win;segSupported+=x.mag*win*(1+support[x.card]);survive*=1-x.p;}const share=segmentWeight/ctx.total;raw+=segRaw*share;supported+=segSupported*share;coverage+=(1-survive)*share;let specialPct=0;for(const win of sp.supportWindows||[])if(t>=win.startMs&&t<win.endMs){specialPct+=win.supportPct;specialUplifts[win.position-1]+=segRaw*win.supportPct*share;}specialSupportUplift+=segRaw*specialPct*share;}const out={raw,supported,specialSupportUplift,specialUplifts:Array.from(specialUplifts),coverage,checkCounts:Array.from(built.checkCounts),sarCheckCounts:Array.from(built.sarCheckCounts)};if(withDetails){out.probabilities=ids.map(id=>baseActiveProbability(CARDS[id]));out.magnitudes=ids.map(id=>activeMagnitude(CARDS[id],ids));}return out;}
function chartSarDetailsBoard(ids,sp,ctx,nodes){const values=[];for(const win of sp.sarWindows){let affected=0;const byCard=[];for(let i=0;i<5;i++){const iv=Math.round(boardInterval(CARDS[ids[i]],nodes?.[i]||0)*1000);let n=0;if(iv>0)for(let t=iv;t<=ctx.lastMs;t+=iv)if(t>=win.startMs&&t<win.endMs)n++;affected+=n;byCard.push(n);}values.push({...win,affectedChecks:affected,affectedChecksByCard:byCard});}return values;}
function evaluateOrderGenericBoard(ids,baseCounts,params,withDetails=false,compareOutfits=false){
  const perf=new Float64Array(5),tech=new Float64Array(5),sense=new Float64Array(5),all=new Float64Array(5),support=new Float64Array(5),passiveDetails=[];for(let s=0;s<5;s++){const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);if(!nRecipients)continue;for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')support[i]+=pa.pct;else if(pa.kind==='perf')perf[i]+=pa.pct;else if(pa.kind==='tech')tech[i]+=pa.pct;else if(pa.kind==='sense')sense[i]+=pa.pct;else if(pa.kind==='all')all[i]+=pa.pct;}if(withDetails){const names=[];for(let q=0;q<nRecipients;q++)names.push(CARDS[ids[RECIPIENT_BUF[q]]].member);passiveDetails.push(`${src.member}: ${pa.text} → ${names.join(', ')}`);}}
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0;for(let i=0;i<5;i++){const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+perf[i]+all[i])+c.tech*(1+tech[i]+all[i])+c.sense*(1+sense[i]+all[i]);}
  const baseSp=specialForOrder(ids,params),baseTm=timing(ids,baseCounts,support,params,1,false);baseSp.supportUplift=baseTm.raw*baseSp.supportExposure;for(const v of baseSp.values)v.bonus=baseTm.raw*v.supportPct*v.weightedExposure;const baseSar=sarForOrder(ids,baseCounts,support,params,baseSp,baseTm,false);const baseScore=outfitId=>outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,baseTm,baseSp,baseSar,params,false).score;
  const evalOutfit=(outfitId,detail=false)=>{const nodes=chooseBoardNodesGeneric(ids,support,params,outfitId);calcCountsWithBoard(ids,nodes,BOARD_COUNTS);const sp=specialForOrder(ids,params),tm=timing(ids,BOARD_COUNTS,support,params,1,detail);sp.supportUplift=tm.raw*sp.supportExposure;for(const v of sp.values)v.bonus=tm.raw*v.supportPct*v.weightedExposure;const sar=sarForOrder(ids,BOARD_COUNTS,support,params,sp,tm,detail),out=outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,detail);out._outfitIndex=outfitId;out.boardFrequencyNodes=nodes.slice();out.boardFrequencyNodesAvailable=boardBudget(params);out.boardFrequencyNodesUsed=nodes.reduce((a,b)=>a+b,0);if(detail)boardAttachDetails(out,ids,nodes,support,passiveDetails,tm,sp,sar,params,'generic');return out;};
  const usedSources=boardUsedSources(ids,params);if(!usedSources.length)return null;const usedPool=(params.outfitMode==='fixed'||params.outfitMode==='oshi')?usedSources:boardShortlist(usedSources,ids,baseScore,withDetails?5:2);let used=null;for(const oid of usedPool){const x=evalOutfit(oid,false);if(!used||x.score>used.score)used=x;}if(!used)return null;if(withDetails)used=evalOutfit(used._outfitIndex,true);
  let comparison=used;if(params.outfitMode==='fixed'&&compareOutfits){const pool=boardShortlist(params.ownedOutfitIds,ids,baseScore,withDetails?5:2);for(const oid of pool){const x=evalOutfit(oid,false);if(!comparison||x.score>comparison.score)comparison=x;}}else if(params.outfitMode==='oshi'){const pool=boardShortlist(ids,ids,baseScore,withDetails?5:2);comparison=null;for(const oid of pool){const x=evalOutfit(oid,false);if(!comparison||x.score>comparison.score)comparison=x;}comparison=comparison||used;}
  return {...used,bestAvailableScore:comparison.score,bestAvailableOutfitCard:comparison.outfitCard,bestAvailableOutfitKey:comparison.outfitKey,bestAvailableOutfitOwner:comparison.outfitOwner,bestAvailableOutfitText:comparison.outfitText,bestAvailableOutfitTriggered:comparison.outfitTriggered,bestAvailableOutfitExternal:comparison.outfitExternal};
}
function evaluateOrderChartBoard(ids,params,withDetails=false,compareOutfits=false){
  const ctx=ACTIVE_CHART||prepareChart(params),perf=new Float64Array(5),tech=new Float64Array(5),sense=new Float64Array(5),all=new Float64Array(5),support=new Float64Array(5),passiveDetails=[];for(let s=0;s<5;s++){const src=CARDS[ids[s]],pa=src.passive,nRecipients=passiveRecipients(ids,s,pa);if(!nRecipients)continue;for(let q=0;q<nRecipients;q++){const i=RECIPIENT_BUF[q];if(pa.kind==='support')support[i]+=pa.pct;else if(pa.kind==='perf')perf[i]+=pa.pct;else if(pa.kind==='tech')tech[i]+=pa.pct;else if(pa.kind==='sense')sense[i]+=pa.pct;else if(pa.kind==='all')all[i]+=pa.pct;}if(withDetails){const names=[];for(let q=0;q<nRecipients;q++)names.push(CARDS[ids[RECIPIENT_BUF[q]]].member);passiveDetails.push(`${src.member}: ${pa.text} → ${names.join(', ')}`);}}
  let baseStat=0,sumPerf=0,sumTech=0,sumSense=0;for(let i=0;i<5;i++){const c=CARDS[ids[i]];sumPerf+=c.perf;sumTech+=c.tech;sumSense+=c.sense;baseStat+=c.perf*(1+perf[i]+all[i])+c.tech*(1+tech[i]+all[i])+c.sense*(1+sense[i]+all[i]);}
  const baseSp=chartSpecialForOrder(ids,params,ctx),baseTm=chartTiming(ids,support,params,ctx,baseSp,false,false),baseBoosted=baseSp.sarWindows.length?chartTiming(ids,support,params,ctx,baseSp,true,false):baseTm;baseSp.supportUplift=baseTm.specialSupportUplift;for(let i=0;i<baseSp.values.length;i++)baseSp.values[i].bonus=baseTm.specialUplifts[i]||0;const baseSar={rawUplift:baseBoosted.raw-baseTm.raw,passiveUplift:baseBoosted.supported-baseTm.supported,specialSupportUplift:baseBoosted.specialSupportUplift-baseTm.specialSupportUplift,coverage:baseBoosted.coverage,coverageUplift:baseBoosted.coverage-baseTm.coverage,values:[]};const baseScore=outfitId=>outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,baseTm,baseSp,baseSar,params,false).score;
  const evalOutfit=(outfitId,detail=false)=>{const nodes=chooseBoardNodesChart(ids,support,params,outfitId,ctx),sp=chartSpecialForOrder(ids,params,ctx),tm=chartTimingBoard(ids,support,params,ctx,sp,false,nodes,detail),boosted=sp.sarWindows.length?chartTimingBoard(ids,support,params,ctx,sp,true,nodes,detail):tm;sp.supportUplift=tm.specialSupportUplift;for(let i=0;i<sp.values.length;i++)sp.values[i].bonus=tm.specialUplifts[i]||0;const sar={rawUplift:boosted.raw-tm.raw,passiveUplift:boosted.supported-tm.supported,specialSupportUplift:boosted.specialSupportUplift-tm.specialSupportUplift,coverage:boosted.coverage,coverageUplift:boosted.coverage-tm.coverage,values:detail?chartSarDetailsBoard(ids,sp,ctx,nodes):[]},out=outfitOutcome(ids,outfitId,baseStat,sumPerf,sumTech,sumSense,tm,sp,sar,params,detail);out._outfitIndex=outfitId;out.boardFrequencyNodes=nodes.slice();out.boardFrequencyNodesAvailable=boardBudget(params);out.boardFrequencyNodesUsed=nodes.reduce((a,b)=>a+b,0);if(detail){tm.checkCounts=boosted.checkCounts;tm.sarCheckCounts=boosted.sarCheckCounts;boardAttachDetails(out,ids,nodes,support,passiveDetails,tm,sp,sar,params,'chart',ctx);}return out;};
  const usedSources=boardUsedSources(ids,params);if(!usedSources.length)return null;const usedPool=(params.outfitMode==='fixed'||params.outfitMode==='oshi')?usedSources:boardShortlist(usedSources,ids,baseScore,withDetails?5:2);let used=null;for(const oid of usedPool){const x=evalOutfit(oid,false);if(!used||x.score>used.score)used=x;}if(!used)return null;if(withDetails)used=evalOutfit(used._outfitIndex,true);
  let comparison=used;if(params.outfitMode==='fixed'&&compareOutfits){const pool=boardShortlist(params.ownedOutfitIds,ids,baseScore,withDetails?5:2);for(const oid of pool){const x=evalOutfit(oid,false);if(!comparison||x.score>comparison.score)comparison=x;}}else if(params.outfitMode==='oshi'){const pool=boardShortlist(ids,ids,baseScore,withDetails?5:2);comparison=null;for(const oid of pool){const x=evalOutfit(oid,false);if(!comparison||x.score>comparison.score)comparison=x;}comparison=comparison||used;}
  return {...used,bestAvailableScore:comparison.score,bestAvailableOutfitCard:comparison.outfitCard,bestAvailableOutfitKey:comparison.outfitKey,bestAvailableOutfitOwner:comparison.outfitOwner,bestAvailableOutfitText:comparison.outfitText,bestAvailableOutfitTriggered:comparison.outfitTriggered,bestAvailableOutfitExternal:comparison.outfitExternal,scoringMode:'chart',chartKey:ctx.chart.key,chartTitle:ctx.chart.title,chartDifficulty:ctx.chart.difficulty,chartNoteCount:ctx.times.length};
}
function quickEvaluateGeneric(ids,params){const base=quickEvaluateGenericBase(ids,params);if(!boardModeEnabled(params)||!Number.isFinite(base))return base;const outfitId=boardQuickOutfitId(ids,params),nodes=chooseBoardNodesGeneric(ids,QSUPPORT,params,outfitId),values=genericBoardValues(ids,QSUPPORT);let delta=0;for(let i=0;i<5;i++)delta+=values[i][nodes[i]]-values[i][0];return base*(1+Math.max(-0.5,delta)/100);}
function quickEvaluateChart(ids,params){const base=quickEvaluateChartBase(ids,params);if(!boardModeEnabled(params)||!Number.isFinite(base))return base;const ctx=ACTIVE_CHART||prepareChart(params),outfitId=boardQuickOutfitId(ids,params),nodes=chooseBoardNodesChart(ids,QSUPPORT,params,outfitId,ctx),values=chartBoardValues(ids,QSUPPORT,ctx);let delta=0;for(let i=0;i<5;i++)delta+=values[i][nodes[i]]-values[i][0];return base*(1+Math.max(-0.5,delta)/100);}
function evaluateOrderGeneric(ids,counts,params,withDetails=false,compareOutfits=false){return boardModeEnabled(params)?evaluateOrderGenericBoard(ids,counts,params,withDetails,compareOutfits):evaluateOrderGenericBase(ids,counts,params,withDetails,compareOutfits);}
function evaluateOrderChart(ids,params,withDetails=false,compareOutfits=false){return boardModeEnabled(params)?evaluateOrderChartBoard(ids,params,withDetails,compareOutfits):evaluateOrderChartBase(ids,params,withDetails,compareOutfits);}
function evaluateOrder(ids,counts,params,withDetails=false,compareOutfits=false){return params.scoringMode==='chart'?evaluateOrderChart(ids,params,withDetails,compareOutfits):evaluateOrderGeneric(ids,counts,params,withDetails,compareOutfits);}
function quickEvaluate(ids,params){return params.scoringMode==='chart'?quickEvaluateChart(ids,params):quickEvaluateGeneric(ids,params);}
function validateComparisonTeam(keys,label){if(!Array.isArray(keys)||keys.length!==5)throw new Error(`${label} must contain exactly five ordered cards.`);const ids=keys.map(key=>CARD_BY_KEY.get(key));if(ids.some(id=>id===undefined))throw new Error(`${label} contains a card that is not in the current database.`);const members=new Set();for(const id of ids){const member=memberId(CARDS[id]);if(members.has(member))throw new Error(`${label} cannot contain two cards of the same holomem.`);members.add(member);}return ids;}
function hashSeed(value){const text=JSON.stringify(value);let h=2166136261>>>0;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function seededRandom(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function percentileSorted(sorted,q){if(!sorted.length)return 0;const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos),f=pos-lo;return sorted[lo]*(1-f)+sorted[hi]*f;}
function meanAndSd(values){let sum=0;for(const v of values)sum+=v;const mean=sum/values.length;let ss=0;for(const v of values){const d=v-mean;ss+=d*d;}return {mean,sd:Math.sqrt(ss/Math.max(1,values.length-1))};}
function simulateTeamScoresGeneric(ids,result,params,draws,rng){
  const magnitudes=ids.map(id=>activeMagnitude(CARDS[id],ids)),priorities=[0,1,2,3,4].sort((a,b)=>magnitudes[b]-magnitudes[a]||a-b);
  const passiveSupport=result.support||[0,0,0,0,0],outfitSupport=result.outfitSupport||0,sp=specialForOrder(ids,params),averageSpecialSupport=sp.supportExposure,scores=new Float64Array(draws),activeUntil=new Float64Array(5),nextCheck=new Float64Array(5),probabilities=ids.map(id=>baseActiveProbability(CARDS[id]));
  const intervals=ids.map(id=>Number(CARDS[id].active?.interval)||0),durations=ids.map(id=>Math.max(0,Number(CARDS[id].active?.duration)||0));
  const fixedBonus=(result.sarUplift||0)+(params.other||0);
  for(let run=0;run<draws;run++){
    activeUntil.fill(0);for(let i=0;i<5;i++)nextCheck[i]=intervals[i]>0?intervals[i]:Infinity;let activeTotal=0;
    for(let t=1;t<=SONG;t++){
      for(let i=0;i<5;i++){const iv=intervals[i];if(!(iv>0))continue;while(nextCheck[i]<=t+1e-9){const check=nextCheck[i];if(rng()<probabilities[i])activeUntil[i]=check+durations[i];nextCheck[i]+=iv;}}
      for(const i of priorities){if(activeUntil[i]>t+1e-9){activeTotal+=magnitudes[i]*(1+passiveSupport[i]+outfitSupport+averageSpecialSupport);break;}}
    }
    const activeAverage=activeTotal/SONG;scores[run]=result.stat*(1+(activeAverage+fixedBonus)/100);
  }
  const stats=meanAndSd(scores),shift=result.score-stats.mean;if(Math.abs(shift)>1e-12)for(let i=0;i<scores.length;i++)scores[i]+=shift;return scores;
}
function buildChartSimulationPlan(ids,result,params){
  const ctx=ACTIVE_CHART||prepareChart(params),sp=chartSpecialForOrder(ids,params,ctx),checksByTime=new Map(),boundarySet=new Set([0,ctx.lastMs+1]);
  for(let i=0;i<5;i++){
    const card=CARDS[ids[i]],a=card.active||{},intervalMs=Math.round((Number(a.interval)||0)*1000),durationMs=Math.round((Number(a.duration)||0)*1000);if(intervalMs<=0||durationMs<=0)continue;
    for(let check=intervalMs;check<=ctx.lastMs;check+=intervalMs){const end=check+durationMs,mag=chartActiveMagnitude(card,ids,check,ctx),mult=sarMultiplierAtCheck(check,sp),p=Math.min(1,baseActiveProbability(card)*mult);if(!checksByTime.has(check))checksByTime.set(check,[]);checksByTime.get(check).push({card:i,end,mag,p});boundarySet.add(check);boundarySet.add(end);}
  }
  for(const win of sp.supportWindows||[]){boundarySet.add(win.startMs);boundarySet.add(win.endMs);}
  const boundaries=[...boundarySet].sort((a,b)=>a-b),segments=[];
  for(let i=0;i<boundaries.length-1;i++){const t=boundaries[i],next=boundaries[i+1];if(t>ctx.lastMs)break;const share=chartWeightBetween(ctx,t,next)/ctx.total;let specialSupportPct=0;for(const win of sp.supportWindows||[])if(t>=win.startMs&&t<win.endMs)specialSupportPct+=win.supportPct;if(share>0||checksByTime.has(t))segments.push({t,next,share,checks:checksByTime.get(t)||[],specialSupportPct});}
  return {ctx,segments,passiveSupport:result.support||[0,0,0,0,0],outfitSupport:result.outfitSupport||0,fixedBonus:(params.other||0)};
}
function simulateTeamScoresChart(ids,result,params,draws,rng){
  const plan=buildChartSimulationPlan(ids,result,params),scores=new Float64Array(draws),activeUntil=new Float64Array(5),activeMag=new Float64Array(5);
  for(let run=0;run<draws;run++){
    activeUntil.fill(0);activeMag.fill(0);let activeBonus=0;
    for(const seg of plan.segments){const t=seg.t;for(let i=0;i<5;i++)if(activeUntil[i]<=t){activeUntil[i]=0;activeMag[i]=0;}for(const ck of seg.checks)if(rng()<ck.p){activeUntil[ck.card]=ck.end;activeMag[ck.card]=ck.mag;}if(seg.share<=0)continue;let best=-1,bestMag=-Infinity;for(let i=0;i<5;i++)if(activeUntil[i]>t&&(activeMag[i]>bestMag||(activeMag[i]===bestMag&&i<best))){best=i;bestMag=activeMag[i];}if(best>=0)activeBonus+=bestMag*(1+plan.passiveSupport[best]+plan.outfitSupport+seg.specialSupportPct)*seg.share;}
    scores[run]=result.stat*(1+(activeBonus+plan.fixedBonus)/100);
  }
  const stats=meanAndSd(scores),shift=result.score-stats.mean;if(Math.abs(shift)>1e-12)for(let i=0;i<scores.length;i++)scores[i]+=shift;return scores;
}
function simulateTeamScores(ids,result,params,draws,rng){return params.scoringMode==='chart'?simulateTeamScoresChart(ids,result,params,draws,rng):simulateTeamScoresGeneric(ids,result,params,draws,rng);}
function compareSummary(values){const sorted=Array.from(values).sort((a,b)=>a-b),stats=meanAndSd(sorted);return {mean:stats.mean,sd:stats.sd,p05:percentileSorted(sorted,0.05),median:percentileSorted(sorted,0.5),p95:percentileSorted(sorted,0.95)};}
function comparisonInterpretation(advantage){if(advantage<0.02)return 'Practical near-tie: normal Active proc luck can readily reverse the expected order.';if(advantage<0.05)return 'Small expected advantage: meaningful over repeated runs, but often reversible in a single run.';if(advantage<0.10)return 'Meaningful expected advantage: the stronger team should win most comparisons, though unlucky sets can still lose.';return 'Proc-robust expected advantage under this model: ordinary Active luck should overturn it only occasionally.';}
function compareTeams(params){
  const idsA=validateComparisonTeam(params.teamA,'Team A'),idsB=validateComparisonTeam(params.teamB,'Team B');const outfitA=CARD_BY_KEY.get(params.outfitA),outfitB=CARD_BY_KEY.get(params.outfitB);if(outfitA===undefined||outfitB===undefined)throw new Error('Select a valid Outfit card for both teams.');
  const runs=Math.max(1,Math.round(Number(params.runsPerAverage)||1));if(![1,3,5,10,20].includes(runs))throw new Error('Choose 1, 3, 5, 10, or 20 runs per average.');const scoringMode=params.scoringMode==='chart'?'chart':'generic';let song=Number(params.song);
  const modelParams={scoringMode,chart:params.chart||null,song,specialMode:scoringMode==='chart'?'exact':'combo',other:Number(params.other)||0,outfitMode:'fixed',ownedOutfitIds:OUTFIT_UNIQUE_IDS};
  if(scoringMode==='chart'){const ctx=prepareChart(modelParams);song=Math.max(30,Math.ceil(Number(ctx.chart.playingSeconds)||ctx.lastMs/1000||140));modelParams.song=song;}else{if(!Number.isFinite(song)||song<30||song>600)throw new Error('Song length must be between 30 and 600 seconds.');ACTIVE_CHART=null;}buildMasks(song);
  calcCounts(idsA,COUNTS);const countsA=new Int32Array(COUNTS);modelParams.outfitKey=CARDS[outfitA].key;const resultA=evaluateOrder(idsA,countsA,modelParams,true,false);
  calcCounts(idsB,COUNTS);const countsB=new Int32Array(COUNTS);modelParams.outfitKey=CARDS[outfitB].key;const resultB=evaluateOrder(idsB,countsB,modelParams,true,false);if(!resultA||!resultB)throw new Error('The selected teams could not be evaluated.');
  const individualDraws=scoringMode==='chart'?16000:25000,comparisonDraws=scoringMode==='chart'?16000:20000,seed=hashSeed({teamA:params.teamA,outfitA:params.outfitA,teamB:params.teamB,outfitB:params.outfitB,scoringMode,chartKey:modelParams.chart?.key||null,song,runs,other:modelParams.other});const rng=seededRandom(seed);
  self.postMessage({type:'compareProgress',phase:`Simulating Team A · ${scoringMode==='chart'?'Choose a song':'Any song'}`,progress:0.1});const scoresA=simulateTeamScores(idsA,resultA,modelParams,individualDraws,rng);
  self.postMessage({type:'compareProgress',phase:`Simulating Team B · ${scoringMode==='chart'?'Choose a song':'Any song'}`,progress:0.45});const scoresB=simulateTeamScores(idsB,resultB,modelParams,individualDraws,rng);
  self.postMessage({type:'compareProgress',phase:`Comparing ${runs}-run averages`,progress:0.78});const avgA=new Float64Array(comparisonDraws),avgB=new Float64Array(comparisonDraws);let winsA=0,winsB=0,ties=0;
  for(let d=0;d<comparisonDraws;d++){let totalA=0,totalB=0;for(let r=0;r<runs;r++){totalA+=scoresA[Math.floor(rng()*scoresA.length)];totalB+=scoresB[Math.floor(rng()*scoresB.length)];}const a=totalA/runs,b=totalB/runs;avgA[d]=a;avgB[d]=b;if(a>b)winsA++;else if(b>a)winsB++;else ties++;}
  const expectedRatio=resultB.score?resultA.score/resultB.score:Infinity,expectedDiff=expectedRatio-1,winner=resultA.score>=resultB.score?'A':'B',stronger=Math.max(resultA.score,resultB.score),weaker=Math.min(resultA.score,resultB.score),advantage=weaker?stronger/weaker-1:Infinity;
  return {teamA:resultA,teamB:resultB,scoringMode,chartKey:modelParams.chart?.key||null,chartTitle:modelParams.chart?.title||null,chartDifficulty:modelParams.chart?.difficulty||null,runsPerAverage:runs,individualDraws,comparisonDraws,expectedDiff,advantage,winner,winProbabilityA:winsA/comparisonDraws,winProbabilityB:winsB/comparisonDraws,tieProbability:ties/comparisonDraws,rangeA:compareSummary(avgA),rangeB:compareSummary(avgB),individualA:compareSummary(scoresA),individualB:compareSummary(scoresB),interpretation:comparisonInterpretation(advantage),seed};
}

const SEARCH_PROFILES={
  upgrade:{beam:1800,global:1500,rescue:300,featureQuota:20,finalScreen:2400,polishSeeds:20,polishRounds:1,refine:700,exactFinalists:80,extensionTop:24,featureExtensions:6,spreadExtensions:6},
  fast:{beam:6000,global:5000,rescue:1000,featureQuota:55,finalScreen:8000,polishSeeds:60,polishRounds:1,refine:2500,exactFinalists:250,extensionTop:36,featureExtensions:8,spreadExtensions:8},
  balanced:{beam:18000,global:15000,rescue:3000,featureQuota:160,finalScreen:24000,polishSeeds:180,polishRounds:1,refine:6000,exactFinalists:600,extensionTop:64,featureExtensions:14,spreadExtensions:12},
  thorough:{beam:50000,global:42000,rescue:8000,featureQuota:430,finalScreen:65000,polishSeeds:450,polishRounds:2,refine:12000,exactFinalists:1500,extensionTop:110,featureExtensions:24,spreadExtensions:18}
};
class BeamHeap{
  constructor(limit){this.a=[];this.limit=Math.max(1,limit|0);}
  consider(score,ids,lastPos){if(!Number.isFinite(score))return;const a=this.a;if(a.length<this.limit){const x={score,ids:ids.slice(),lastPos};a.push(x);this.up(a.length-1);}else if(score>a[0].score){a[0]={score,ids:ids.slice(),lastPos};this.down(0);}}
  considerNode(node){this.consider(node.score,node.ids,node.lastPos);}
  up(i){const a=this.a;while(i){const p=(i-1)>>1;if(a[p].score<=a[i].score)break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
  down(i){const a=this.a,n=a.length;for(;;){let l=i*2+1,r=l+1,m=i;if(l<n&&a[l].score<a[m].score)m=l;if(r<n&&a[r].score<a[m].score)m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}
  sorted(){return this.a.sort((x,y)=>y.score-x.score);}
}
function teamPoolAllows(card,cardPool){return cardPool==='all'||card.rarity===5;}
function countValidCompositions(candidateIds,k){
  if(k<0)return 0;if(k===0)return 1;
  const multiplicity=new Map();for(const id of candidateIds){const m=memberId(CARDS[id]);multiplicity.set(m,(multiplicity.get(m)||0)+1);}
  const dp=new Float64Array(k+1);dp[0]=1;
  for(const m of multiplicity.values())for(let j=k;j>=1;j--)dp[j]+=dp[j-1]*m;
  return Math.round(dp[k]);
}
function searchStaticPotential(id){
  const c=CARDS[id],a=c.active||{},s=c.special||{},pa=c.passive||{},p=baseActiveProbability(c),mag=Math.max(Number(a.baseMagnitude)||0,Number(a.conditionalMagnitude)||0),active=mag*p*(UPTIME[id]||0)/Math.max(1,SONG),specialSupport=active*((Number(s.magnitude)||0)/100)*(Number(s.duration)||0)/Math.max(1,SONG),sar=(Number(s.sarPct)||0)*(Number(s.duration)||0)/Math.max(1,SONG),passive=(Number(pa.pct)||0)*(pa.target?.count||1);
  return c.total*(1+(active+specialSupport)/100)+c.total*passive*0.22+c.total*sar*0.12;
}
function screeningOutfits(sourceIds){
  const bestByBucket=new Map(),overall=[];
  for(const id of sourceIds){const effects=CARDS[id].outfit?.effects||[];let strength=0;for(const e of effects){const kind=e.kind||'x',tr=e.trigger,ts=tr&&(tr.kind==='attribute'||tr.kind==='group')?`${tr.kind}:${tr.id}:${tr.count||1}`:'none';const weight=kind==='support'?1.15:1;const val=(Number(e.pct)||0)*weight;strength+=val;const key=`${ts}|${kind}`;const prev=bestByBucket.get(key);if(!prev||val>prev.val)bestByBucket.set(key,{id,val});}overall.push({id,strength});}
  overall.sort((a,b)=>b.strength-a.strength);const out=[],seen=new Set();const add=id=>{if(id!==undefined&&!seen.has(id)){seen.add(id);out.push(id);}};for(const [key,x] of bestByBucket)if(key.endsWith('|support'))add(x.id);for(let i=0;i<Math.min(12,overall.length);i++)add(overall[i].id);for(const x of bestByBucket.values())add(x.id);return out.slice(0,32);
}
function teamHasMember(ids,charId){for(const id of ids)if(memberId(CARDS[id])===charId)return true;return false;}
function greedyComplete(partial,staticOrder){
  const out=partial.slice();if(out.length>=5)return out;
  const members=new Set(out.map(id=>memberId(CARDS[id]))),chosen=new Set(out);
  for(const id of staticOrder){if(out.length>=5)break;if(chosen.has(id))continue;const m=memberId(CARDS[id]);if(members.has(m))continue;members.add(m);chosen.add(id);out.push(id);}
  return out.length===5?out:null;
}
function partialFeatureCount(ids,trigger){if(!trigger||(trigger.kind!=='attribute'&&trigger.kind!=='group'))return 0;let n=0;const word=trigger._word,bit=trigger._bit;for(const id of ids)if(CARDS[id]._eligibilityWords[word]&bit)n++;return n;}
function openConditionBonus(partial,slotsRemaining,projected,projectedStat){
  if(slotsRemaining<=0)return 0;let bonus=0;
  const maybe=(trigger)=>{if(!trigger||(trigger.kind!=='attribute'&&trigger.kind!=='group'))return 0;const need=trigger.count||1,have=partialFeatureCount(partial,trigger);if(have>=need||have+slotsRemaining<need||triggerSatisfied(trigger,projected))return 0;return Math.min(1,have/Math.max(1,need));};
  for(const id of partial){const c=CARDS[id],a=c.active||{},pa=c.passive||{};let f=maybe(a.trigger);if(f&&a.conditionalMagnitude!==null&&a.conditionalMagnitude!==undefined){const delta=Math.max(0,Number(a.conditionalMagnitude)-Number(a.baseMagnitude||0))*baseActiveProbability(c)*(UPTIME[id]||0)/Math.max(1,SONG);bonus+=projectedStat*(delta/100)*0.50*f;}
    f=maybe(pa.trigger);if(f){const pct=Number(pa.pct)||0,count=pa.target?.count||1;if(pa.kind==='support')bonus+=projectedStat*pct*0.025*count*f;else bonus+=projectedStat*pct*0.10*count*f;}
    if(c.outfit?.effects)for(const e of c.outfit.effects){f=maybe(e.trigger);if(f){const pct=Number(e.pct)||0;bonus+=projectedStat*pct*(e.kind==='support'?0.025:0.10)*f;}}
  }
  return bonus;
}
function screenPartial(partial,staticOrder,params){
  const projected=greedyComplete(partial,staticOrder);if(!projected)return -Infinity;const prior=params._screening;params._screening=true;const base=quickEvaluate(projected,params);params._screening=prior;let projectedStat=0;for(const id of projected)projectedStat+=CARDS[id].total;return base+openConditionBonus(partial,5-partial.length,projected,projectedStat);
}
function searchFeatureCodes(){
  const set=new Set();const add=x=>{if(x&&(x.kind==='attribute'||x.kind==='group'))set.add(eligibilityCode(x.id));};
  for(const c of CARDS){add(c.active?.trigger);add(c.passive?.trigger);add(c.passive?.target);add(c.special?.sarTrigger);for(const e of c.outfit?.effects||[])add(e.trigger);}return [...set];
}
const SEARCH_FEATURE_CODES=searchFeatureCodes();
for(const c of CARDS){const a=[];for(const code of SEARCH_FEATURE_CODES){const word=code>>>5,bit=1<<(code&31);if(c._eligibilityWords[word]&bit)a.push(code);}c._searchFeatureCodes=a;}
function featureCodesForTeam(ids,outSet){outSet.clear();for(const id of ids)for(const code of CARDS[id]._searchFeatureCodes||[])outSet.add(code);return outSet;}
function desiredFeatureCodes(ids,outSet){
  outSet.clear();const add=x=>{if(x&&(x.kind==='attribute'||x.kind==='group'))outSet.add(eligibilityCode(x.id));};
  for(const id of ids){const c=CARDS[id];for(const code of c._searchFeatureCodes||[])outSet.add(code);add(c.active?.trigger);add(c.passive?.trigger);add(c.passive?.target);add(c.special?.sarTrigger);for(const e of c.outfit?.effects||[])add(e.trigger);}return outSet;
}
function buildFeatureCandidateLists(staticOrder){const out=new Map(SEARCH_FEATURE_CODES.map(code=>[code,[]]));for(const id of staticOrder)for(const code of CARDS[id]._searchFeatureCodes||[])out.get(code)?.push(id);return out;}
function extensionPositions(parent,staticOrder,positionById,featureLists,profile,desiredScratch){
  const start=parent.lastPos+1,n=staticOrder.length;if(parent.ids.length<2){const all=[];for(let p=start;p<n;p++)all.push(p);return all;}
  const set=new Set();let added=0;for(let p=start;p<n&&added<profile.extensionTop;p++){set.add(p);added++;}
  desiredFeatureCodes(parent.ids,desiredScratch);for(const code of desiredScratch){const list=featureLists.get(code)||[];let take=0;for(const id of list){const p=positionById.get(id);if(p===undefined||p<start)continue;set.add(p);if(++take>=profile.featureExtensions)break;}}
  const remain=n-start;if(remain>0&&profile.spreadExtensions>0){for(let j=1;j<=profile.spreadExtensions;j++){const p=start+Math.floor(j*remain/(profile.spreadExtensions+1));if(p>=start&&p<n)set.add(p);}}
  return [...set].sort((a,b)=>a-b);
}
function mergeBeam(globalHeap,featureHeaps,profile){
  const global=globalHeap.sorted(),seen=new Set(global.map(n=>n.ids.join(','))),rescues=[];
  for(const h of featureHeaps.values())for(const n of h.sorted()){const key=n.ids.join(',');if(!seen.has(key)){seen.add(key);rescues.push(n);}}
  rescues.sort((a,b)=>b.score-a.score);return global.concat(rescues.slice(0,profile.rescue)).sort((a,b)=>b.score-a.score).slice(0,profile.beam);
}
function canonicalComposition(ids,requiredIds,positionById,lockedCountOverride=null){if(lockedCountOverride!==null){const n=Math.max(0,Math.min(ids.length,lockedCountOverride|0)),locked=ids.slice(0,n),rest=ids.slice(n).sort((a,b)=>(positionById.get(a)??1e9)-(positionById.get(b)??1e9));return locked.concat(rest);}const locked=Array.isArray(requiredIds)?requiredIds:requiredIds===null?[]:[requiredIds],lockSet=new Set(locked),rest=ids.filter(id=>!lockSet.has(id)).sort((a,b)=>(positionById.get(a)??1e9)-(positionById.get(b)??1e9));return locked.filter(id=>ids.includes(id)).concat(rest);}
function polishCompositions(initial,candidates,requiredIds,staticOrder,positionById,params,profile,counters,lockedCountOverride=null){
  let current=initial.slice();const lockedCount=lockedCountOverride===null?(Array.isArray(requiredIds)?requiredIds.length:(requiredIds===null?0:1)):lockedCountOverride;
  for(let round=0;round<profile.polishRounds;round++){
    const seedCount=Math.min(profile.polishSeeds,current.length),heap=new BeamHeap(profile.finalScreen),seen=new Set();for(const x of current){heap.consider(x.score,x.ids,x.lastPos??-1);seen.add(x.ids.join(','));}
    for(let s=0;s<seedCount;s++){const seed=current[s].ids;for(let pos=0;pos<5;pos++){if(pos<lockedCount)continue;for(const cid of candidates){if(seed[pos]===cid)continue;const cm=memberId(CARDS[cid]);let bad=false;for(let j=0;j<5;j++)if(j!==pos&&memberId(CARDS[seed[j]])===cm){bad=true;break;}if(bad)continue;const trial=seed.slice();trial[pos]=cid;const canon=canonicalComposition(trial,requiredIds,positionById,lockedCount),key=canon.join(',');if(seen.has(key))continue;seen.add(key);params._screening=true;const score=quickEvaluate(canon,params);params._screening=false;counters.polishEvaluated++;heap.consider(score,canon,positionById.get(canon[canon.length-1])??-1);}}
      if(!params.suppressProgress&&(s+1)%20===0)self.postMessage({type:'progress',phase:`Polishing candidate neighborhoods (round ${round+1})`,done:s+1,total:seedCount,valid:counters.completeScreened,best:heap.a.length?Math.max(...heap.a.map(x=>x.score)):0});}
    current=heap.sorted();
  }
  return current;
}
function representativePerms(canon,params){
  const seeds=[[0,1,2,3,4],[1,2,3,4,0],[2,3,4,0,1],[3,4,0,1,2],[4,0,1,2,3],[4,3,2,1,0]],idx=[0,1,2,3,4];
  const specialValue=i=>{const s=CARDS[canon[i]].special||{};return (Number(s.magnitude)||0)*(Number(s.duration)||0)+(Number(s.sarPct)||0)*1000;};
  const activeValue=i=>Math.max(Number(CARDS[canon[i]].active?.baseMagnitude)||0,Number(CARDS[canon[i]].active?.conditionalMagnitude)||0)*baseActiveProbability(CARDS[canon[i]]);
  seeds.push(idx.slice().sort((a,b)=>specialValue(a)-specialValue(b)||a-b));
  seeds.push(idx.slice().sort((a,b)=>specialValue(b)-specialValue(a)||a-b));
  seeds.push(idx.slice().sort((a,b)=>activeValue(b)-activeValue(a)||a-b));
  seeds.push(idx.slice().sort((a,b)=>activeValue(a)-activeValue(b)||a-b));
  seeds.push(idx.slice().sort((a,b)=>CARDS[canon[b]].total-CARDS[canon[a]].total||a-b));
  seeds.push(idx.slice().sort((a,b)=>CARDS[canon[a]].total-CARDS[canon[b]].total||a-b));
  const out=[],seen=new Set();for(const p of seeds){const k=p.join('');if(!seen.has(k)){seen.add(k);out.push(p);}}return out;
}
function optimize(params){
  params.cardPool=params.cardPool==='all'?'all':'five';params.boardMode=params.boardMode==='optimize'?'optimize':'off';params.boardFrequencyNodes=Math.max(0,Math.min(12,Math.round(Number(params.boardFrequencyNodes)||0)));params.searchQuality=SEARCH_PROFILES[params.searchQuality]?params.searchQuality:'balanced';const profile=SEARCH_PROFILES[params.searchQuality];
  const oshiMode=params.searchMode==='oshi';let anchor=null;if(params.searchMode==='anchor'){anchor=CARD_BY_KEY.get(params.anchor);if(anchor===undefined)throw new Error('Select a valid oshi card.');if(!teamPoolAllows(CARDS[anchor],params.cardPool))throw new Error('The selected oshi card is outside the chosen team-card pool.');}if(oshiMode&&!params.oshiCharacterId)throw new Error('Choose your oshi first.');
  let fixedOutfit=null;if(params.outfitMode==='fixed'){fixedOutfit=CARD_BY_KEY.get(params.outfitKey);if(fixedOutfit===undefined)throw new Error('Select a valid specific outfit.');}
  const ownedKeys=params.ownedOnly?new Set(params.ownedKeys||[]):null,ownedIds=params.ownedOnly?new Set():null;
  if(params.ownedOnly){for(const key of ownedKeys){const id=CARD_BY_KEY.get(key);if(id!==undefined)ownedIds.add(id);}const eligibleOwned=Array.from(ownedIds).filter(i=>teamPoolAllows(CARDS[i],params.cardPool));if(eligibleOwned.length<5)throw new Error('Select at least five owned cards in the chosen team-card pool.');const distinctOwned=new Set(eligibleOwned.map(i=>memberId(CARDS[i])));if(distinctOwned.size<5)throw new Error('Your owned selection must contain at least five different holomems in the chosen team-card pool.');if(anchor!==null&&!ownedIds.has(anchor))throw new Error('The selected oshi card is not marked as owned.');if(fixedOutfit!==null&&!ownedIds.has(fixedOutfit))throw new Error('The selected specific Outfit belongs to a card that is not marked as owned.');}
  params.ownedIdSet=ownedIds;params.ownedOutfitIds=params.ownedOnly?uniqueOutfitIds(Array.from(ownedIds)):ALL_OUTFIT_IDS;params.screenOutfitIds=screeningOutfits(params.ownedOutfitIds);if(params.scoringMode==='chart'){const ctx=prepareChart(params);params.song=Math.max(30,Math.ceil(Number(ctx.chart.playingSeconds)||ctx.lastMs/1000||140));}else ACTIVE_CHART=null;buildMasks(params.song);
  const excludedMembers=new Set(),excludedCards=new Set();for(const value of params.excluded||[]){if(value.startsWith('member:'))excludedMembers.add(value.slice(7));else if(value.startsWith('card:'))excludedCards.add(value.slice(5));}
  const required=[];if(anchor!==null)required.push(anchor);for(const cardId of params.requiredCards||[]){const idx=CARD_BY_ID.get(cardId);if(idx===undefined)throw new Error('A required card is no longer present in the card database.');if(!teamPoolAllows(CARDS[idx],params.cardPool))throw new Error(`Required card ${CARDS[idx].member} — ${CARDS[idx].skin} is outside the chosen team-card pool.`);if(params.ownedOnly&&!ownedIds.has(idx))throw new Error(`Required card ${CARDS[idx].member} — ${CARDS[idx].skin} is not marked as owned.`);if(!required.includes(idx))required.push(idx);}
  if(required.length>5)throw new Error('A five-member team cannot contain more than five required cards.');const requiredMemberMap=new Map();for(const x of required){const mid=memberId(CARDS[x]),prior=requiredMemberMap.get(mid);if(prior!==undefined&&prior!==x)throw new Error(`Multiple required cards belong to ${CARDS[x].member}; only one card per Holomem can be used.`);requiredMemberMap.set(mid,x);if(excludedMembers.has(mid)||excludedCards.has(CARDS[x].id))throw new Error(`Required card ${CARDS[x].member} — ${CARDS[x].skin} is also excluded.`);}
  const fixedMemberIds=new Set(required.map(i=>memberId(CARDS[i]))),requestedMemberIds=[];for(const mid of params.requiredMembers||[]){if(!mid||fixedMemberIds.has(mid)||requestedMemberIds.includes(mid))continue;if(excludedMembers.has(mid))throw new Error('A required Holomem is also excluded.');requestedMemberIds.push(mid);}if(required.length+requestedMemberIds.length>5)throw new Error('A five-member team cannot contain more than five required Holomems.');
  const variableGroups=[];for(const mid of requestedMemberIds){const opts=[];for(let i=0;i<CARDS.length;i++){if(memberId(CARDS[i])!==mid||!teamPoolAllows(CARDS[i],params.cardPool))continue;if(params.ownedOnly&&!ownedIds.has(i))continue;if(excludedCards.has(CARDS[i].id))continue;opts.push(i);}if(!opts.length)throw new Error('No eligible owned card is available for one of the required Holomems.');variableGroups.push(opts);}
  let oshiAlreadyRequired=false;if(oshiMode){if(fixedMemberIds.has(params.oshiCharacterId)||requestedMemberIds.includes(params.oshiCharacterId))oshiAlreadyRequired=true;else{const opts=[];for(let i=0;i<CARDS.length;i++){if(memberId(CARDS[i])!==params.oshiCharacterId||!teamPoolAllows(CARDS[i],params.cardPool))continue;if(params.ownedOnly&&!ownedIds.has(i))continue;if(excludedMembers.has(params.oshiCharacterId)||excludedCards.has(CARDS[i].id))continue;opts.push(i);}if(!opts.length)throw new Error('No eligible owned card for the selected oshi is available in this card pool.');variableGroups.push(opts);}}
  let seedCombos=[required.slice()];for(const group of variableGroups){const next=[];for(const seed of seedCombos)for(const id of group)next.push(seed.concat(id));seedCombos=next;}const reservedMembers=new Set([...fixedMemberIds,...requestedMemberIds]);if(oshiMode)reservedMembers.add(params.oshiCharacterId);
  const candidates=[];for(let i=0;i<CARDS.length;i++){if(!teamPoolAllows(CARDS[i],params.cardPool))continue;if(params.ownedOnly&&!ownedIds.has(i))continue;if(required.includes(i)||reservedMembers.has(memberId(CARDS[i])))continue;if(excludedMembers.has(memberId(CARDS[i]))||excludedCards.has(CARDS[i].id))continue;candidates.push(i);}
  const lockedCount=required.length+variableGroups.length,need=5-lockedCount;if(need<0||candidates.length<need)throw new Error('Not enough eligible cards remain to form a five-member team.');let rawValid=countValidCompositions(candidates,need)*seedCombos.length;if(!rawValid)throw new Error('No valid five-member teams remain after the current filters.');
  const staticOrder=candidates.slice().sort((a,b)=>searchStaticPotential(b)-searchStaticPotential(a)||CARDS[a].id.localeCompare(CARDS[b].id)),positionById=new Map(staticOrder.map((id,i)=>[id,i])),featureCandidateLists=buildFeatureCandidateLists(staticOrder);
  const counters={partialEvaluated:0,completeScreened:0,polishEvaluated:0};let beam=seedCombos.map(ids=>({score:0,ids,lastPos:-1})),depth=lockedCount;const featureScratch=new Set(),desiredScratch=new Set();
  while(depth<5){const nextDepth=depth+1,globalHeap=new BeamHeap(profile.global),featureHeaps=new Map(SEARCH_FEATURE_CODES.map(code=>[code,new BeamHeap(profile.featureQuota)]));let parentDone=0;
    for(const parent of beam){const extensionList=extensionPositions(parent,staticOrder,positionById,featureCandidateLists,profile,desiredScratch);for(const pos of extensionList){const cid=staticOrder[pos],cm=memberId(CARDS[cid]);if(teamHasMember(parent.ids,cm))continue;const ids=parent.ids.concat(cid);counters.partialEvaluated++;const score=screenPartial(ids,staticOrder,params);if(nextDepth===5)counters.completeScreened++;globalHeap.consider(score,ids,pos);featureCodesForTeam(ids,featureScratch);for(const code of featureScratch)featureHeaps.get(code)?.consider(score,ids,pos);}
      parentDone++;if(!params.suppressProgress&&(parentDone%Math.max(1,Math.floor(beam.length/40))===0||parentDone===beam.length))self.postMessage({type:'progress',phase:`Building ${nextDepth}-card candidates`,done:parentDone,total:beam.length,valid:counters.completeScreened,best:globalHeap.a.length?Math.max(...globalHeap.a.map(x=>x.score)):0});}
    beam=mergeBeam(globalHeap,featureHeaps,profile);depth=nextDepth;if(!beam.length)throw new Error('Search beam became empty; loosen exclusions or change the team-card pool.');
  }
  beam=beam.slice(0,profile.finalScreen);if(!params.suppressProgress)self.postMessage({type:'progress',phase:'Local neighborhood polish',done:0,total:Math.min(profile.polishSeeds,beam.length),valid:counters.completeScreened,best:beam[0]?.score||0});beam=polishCompositions(beam,candidates,required,staticOrder,positionById,params,profile,counters,lockedCount);
  const refineLimit=Math.min(profile.refine,Math.max(1500,params.topN*180)),refinedHeap=new MinHeap(refineLimit);params._screening=false;
  if(!params.suppressProgress)self.postMessage({type:'progress',phase:'Refining scalable-search finalists',done:0,total:beam.length,valid:counters.completeScreened,best:beam[0]?.score||0});
  for(let q=0;q<beam.length;q++){const canon=beam[q].ids;calcCounts(canon,COUNTS);const baseCounts=new Int32Array(COUNTS);let best=-Infinity;for(const perm of representativePerms(canon,params)){const ids=perm.map(i=>canon[i]);mapCounts(baseCounts,perm,MAPPED_COUNTS);const ev=evaluateOrder(ids,MAPPED_COUNTS,params,false);if(ev&&ev.score>best)best=ev.score;}if(best>-Infinity)refinedHeap.push({score:best,ids:canon.slice()});if(!params.suppressProgress&&(q%100===0||q===beam.length-1))self.postMessage({type:'progress',phase:'Refining scalable-search finalists',done:q+1,total:beam.length,valid:counters.completeScreened,best:refinedHeap.a.length?Math.max(...refinedHeap.a.map(x=>x.score)):0});}
  const shortlist=refinedHeap.sorted(),exactCount=Math.min(shortlist.length,Math.max(profile.exactFinalists,params.topN*10)),exactShortlist=shortlist.slice(0,exactCount);if(!params.suppressProgress)self.postMessage({type:'progress',phase:'Exhaustive order verification',done:0,total:exactShortlist.length,valid:counters.completeScreened,best:exactShortlist[0]?.score||0});const finalHeap=new MinHeap(params.topN),perms=(anchor===null||params.fullOrder)?PERM5:PERM4;
  for(let q=0;q<exactShortlist.length;q++){const canon=exactShortlist[q].ids;calcCounts(canon,COUNTS);const baseCounts=new Int32Array(COUNTS);let bestCombo=null,bestIds=null,bestFree=null,bestFreeIds=null;for(const perm of perms){const ids=perm.map(i=>canon[i]);mapCounts(baseCounts,perm,MAPPED_COUNTS);const ev=evaluateOrder(ids,MAPPED_COUNTS,params,false,params.outfitMode==='fixed');if(!ev)continue;if(!bestCombo||ev.score>bestCombo.score){bestCombo=ev;bestIds=ids.slice();}if(!bestFree||ev.bestAvailableScore>bestFree.bestAvailableScore){bestFree=ev;bestFreeIds=ids.slice();}}if(!bestCombo)continue;const posMap=bestIds.map(x=>canon.indexOf(x));mapCounts(baseCounts,posMap,MAPPED_COUNTS);const detailed=evaluateOrder(bestIds,MAPPED_COUNTS,params,true,params.outfitMode==='fixed');detailed.bestAvailableScore=bestFree.bestAvailableScore;detailed.bestAvailableOutfitCard=bestFree.bestAvailableOutfitCard;detailed.bestAvailableOutfitKey=bestFree.bestAvailableOutfitKey;detailed.bestAvailableOutfitOwner=bestFree.bestAvailableOutfitOwner;detailed.bestAvailableOutfitText=bestFree.bestAvailableOutfitText;detailed.bestAvailableOutfitTriggered=bestFree.bestAvailableOutfitTriggered;detailed.bestAvailableOutfitExternal=bestFree.bestAvailableOutfitExternal;detailed.bestAvailableOrder=bestFreeIds.map(i=>cardLabel(CARDS[i]));detailed.outfitPenalty=bestFree.bestAvailableScore?Math.max(0,(bestFree.bestAvailableScore-detailed.score)/bestFree.bestAvailableScore):0;finalHeap.push(detailed);if(!params.suppressProgress&&(q%25===0||q===exactShortlist.length-1))self.postMessage({type:'progress',phase:'Exhaustive order verification',done:q+1,total:exactShortlist.length,valid:counters.completeScreened,best:finalHeap.a.length?Math.max(...finalHeap.a.map(x=>x.score)):0});}
  const results=finalHeap.sorted(),best=results[0]?.score||1;for(const r of results)r.gap=(best-r.score)/best;return {results,tested:counters.partialEvaluated,valid:counters.completeScreened,shortlisted:exactShortlist.length,rawValid,anchor:anchor===null?null:CARDS[anchor].id,oshiCharacterId:oshiMode?params.oshiCharacterId:null,searchMode:params.searchMode,outfitMode:params.outfitMode,outfitKey:params.outfitKey,searchStats:{strategy:params.scoringMode==='chart'?'v3 chart-aware bounded beam + diversity rescue + local polish':'v2.3 bounded beam + diversity rescue + local polish',quality:params.searchQuality,cardPool:params.cardPool,rawValid,partialEvaluated:counters.partialEvaluated,completeScreened:counters.completeScreened,polishEvaluated:counters.polishEvaluated,beamWidth:profile.beam,refined:shortlist.length,exactOrderFinalists:exactShortlist.length,screenOutfits:params.screenOutfitIds.length}};
}
function bestNextCard(params){
  if(!params.ownedOnly)throw new Error('Best next card requires an owned roster.');
  const raw=structuredClone(params);delete raw.action;raw.searchMode='owned';raw.anchor=null;raw.oshiCharacterId=null;raw.topN=1;raw.suppressProgress=true;
  const upgradeOshiCardId=raw.upgradeOshiCardId||null;delete raw.upgradeOshiCardId;if(upgradeOshiCardId){const oi=CARD_BY_ID.get(upgradeOshiCardId);if(oi===undefined)throw new Error('The selected Oshi card is not available in this card database.');if(!(raw.ownedKeys||[]).includes(CARDS[oi].key))throw new Error('Best next card with my oshi requires the selected Oshi card to be in your owned roster.');raw.requiredCards=[...(raw.requiredCards||[]).filter(id=>id!==upgradeOshiCardId),upgradeOshiCardId];}
  if(raw.outfitMode==='oshi')raw.outfitMode='best';
  const baselineOut=optimize(structuredClone(raw)),baseline=baselineOut.results[0];if(!baseline)throw new Error(upgradeOshiCardId?'Could not calculate a current team containing your selected Oshi card.':'Could not calculate your current best team.');const baselineScore=baseline.score||0;
  const owned=new Set(raw.ownedKeys||[]),ownedIds=[];for(const key of owned){const id=CARD_BY_KEY.get(key);if(id!==undefined)ownedIds.push(id);}
  const excluded=new Set();for(const x of raw.excluded||[])if(String(x).startsWith('card:'))excluded.add(String(x).slice(5));
  const requiredIds=[],requiredMemberIds=new Set();for(const id of raw.requiredCards||[]){const idx=CARD_BY_ID.get(id);if(idx!==undefined){requiredIds.push(idx);requiredMemberIds.add(memberId(CARDS[idx]));}}
  const candidates=[];for(const c of CARDS){if(c.rarity!==5||owned.has(c.key)||excluded.has(c.id)||requiredMemberIds.has(memberId(c)))continue;candidates.push(c);}
  if(!candidates.length)return {baseline,baselineScore,recommendations:[],candidateCount:0,upgradeOshiCardId};
  // Cheap roster-aware screen: complete each candidate + required cards greedily from the owned roster,
  // then use the same quick team evaluator and open-condition bonus used by the main beam search.
  const coarse=[];for(let i=0;i<candidates.length;i++){
    const c=candidates[i],cid=CARD_BY_ID.get(c.id),seed=requiredIds.concat(cid),seedMembers=new Set(seed.map(x=>memberId(CARDS[x]))),eligibleOwned=ownedIds.filter(id=>teamPoolAllows(CARDS[id],raw.cardPool)&&!excluded.has(CARDS[id].id)&&!seed.includes(id)&&!seedMembers.has(memberId(CARDS[id]))),staticOrder=eligibleOwned.sort((a,b)=>searchStaticPotential(b)-searchStaticPotential(a)||CARDS[a].id.localeCompare(CARDS[b].id));
    if(seed.length+staticOrder.length<5)continue;const p=structuredClone(raw),allOwned=ownedIds.concat(cid);p.ownedOutfitIds=uniqueOutfitIds(allOwned);p.screenOutfitIds=screeningOutfits(p.ownedOutfitIds);p._screening=true;const score=screenPartial(seed,staticOrder,p);p._screening=false;if(Number.isFinite(score))coarse.push({cardId:c.id,score});
  }
  coarse.sort((a,b)=>b.score-a.score);const refineCount=Math.min(coarse.length,12),refined=[];
  for(let i=0;i<refineCount;i++){const x=coarse[i],c=CARDS[CARD_BY_ID.get(x.cardId)],p=structuredClone(raw);p.ownedKeys=[...owned,c.key];p.requiredCards=[...(raw.requiredCards||[]),c.id];p.searchQuality='upgrade';p.topN=1;p.suppressProgress=true;try{const out=optimize(p),r=out.results[0];if(r)refined.push({cardId:c.id,score:r.score,result:r});}catch(_){}self.postMessage({type:'upgradeProgress',phase:'Testing the strongest upgrade candidates',done:i+1,total:refineCount});}
  refined.sort((a,b)=>b.score-a.score);const recommendations=refined.slice(0,10).map(x=>({...x,gain:baselineScore?Math.max(0,(x.score-baselineScore)/baselineScore):0,improves:x.score>baselineScore}));return {baseline,baselineScore,recommendations,candidateCount:candidates.length,refinedCount:refineCount,upgradeOshiCardId};
}

self.onmessage=e=>{try{if(e.data&&e.data.action==='upgrade'){const out=bestNextCard(e.data);self.postMessage({type:'upgradeDone',...out});}else if(e.data&&e.data.action==='compare'){const out=compareTeams(e.data);self.postMessage({type:'compareDone',...out});}else if(e.data?.searchMode==='oshi-prefer'){const base=structuredClone(e.data),oshi=optimize({...structuredClone(base),searchMode:'oshi'}),absolute=optimize({...structuredClone(base),searchMode:'owned',outfitMode:base.outfitMode==='oshi'?'best':base.outfitMode}),ob=oshi.results[0]?.score||0,ab=absolute.results[0]?.score||0,useOshi=ob>=ab*.98,out=useOshi?oshi:absolute;out.oshiPreference={mode:'within-2pct',usedOshi:useOshi,oshiBest:ob,absoluteBest:ab,gap:ab?Math.max(0,(ab-ob)/ab):0};self.postMessage({type:'done',...out});}else{const out=optimize(e.data);self.postMessage({type:'done',...out});}}catch(err){self.postMessage({type:'error',message:err.message,stack:err.stack});}};
