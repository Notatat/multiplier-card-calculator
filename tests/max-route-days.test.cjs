'use strict';
// Oracle enumerates card orders and all legal compact day partitions. The
// budget is a bound on operation dates, never on the multiplier's duration.
const assert=require('node:assert/strict');
const {solve}=require('../solver.js');
const DAY=1440;
const LEGACY=[
  {minutes:14*DAY,rate:5},{minutes:7*DAY,rate:5},{minutes:7*DAY,rate:10},
  {minutes:7*DAY,rate:1},{minutes:5,rate:1},{minutes:5,rate:5},{minutes:5,rate:3}
];
const cardsOf=input=>input.cards===undefined?LEGACY:input.cards;
const limitOf=input=>input.maxRouteDays===undefined||input.maxRouteDays===null||typeof input.maxRouteDays==='string'&&input.maxRouteDays.trim()===''?null:input.maxRouteDays;
const locked=input=>input.rate===10&&input.minutes>45*DAY;
const invalidInitial=input=>input.rate===1&&input.minutes>770*DAY||input.rate===5&&input.minutes>154*DAY;
const inventory=input=>input.counts.map((n,i)=>input.dayCardsOnly===true&&cardsOf(input)[i].minutes===5?0:n);
const doubles=(cards,counts)=>counts.reduce((sum,n,i)=>sum+(cards[i].rate===10?n:0),0);
const target=input=>doubles(cardsOf(input),inventory(input))>0||locked(input)?10:5;
const e15=(cards,used)=>used.reduce((sum,n,i)=>sum+(cards[i].rate===5?n*cards[i].minutes*5:0),0);
const later=(a,b)=>{for(let i=Math.max(a.length,b.length)-1;i>=0;i--){const x=a[i]??-1,y=b[i]??-1;if(x!==y)return x>y;}return false;};

function partitions(path,cards,stock,limit){
  const n=path.length,d=Math.ceil(n/10),used2=path.filter(i=>cards[i].rate===10).length;
  if(limit!==null&&d>limit||!n||cards[path[n-1]].rate!==10||used2!==Math.min(stock,d))return null;
  let best=null;
  function divide(offset,left,dates){
    if(left===0){if(offset===n&&(!best||later(dates,best)))best=dates.slice();return;}
    for(let count=Math.max(1,n-offset-10*(left-1));count<=Math.min(10,n-offset-(left-1));count++){
      const segment=path.slice(offset,offset+count),twos=segment.filter(i=>cards[i].rate===10).length;
      const end2=cards[segment[count-1]].rate===10;
      if(twos>1||twos===1&&!end2)continue;
      if(end2)dates.push(d-left+1);divide(offset+count,left-1,dates);if(end2)dates.pop();
    }
  }
  divide(0,d,[]);return best;
}

function oracle(input){
  if(invalidInitial(input))return null;
  const cards=cardsOf(input),left=inventory(input),stock=doubles(cards,left),goal=target(input),cap=(goal===10?840:770)*DAY;
  const used=cards.map(()=>0),path=[],mode=input.mode||'longest',limit=limitOf(input);let best=null;
  function visit(energy,rate,usedDouble){
    const d=Math.ceil(path.length/10);
    if(limit!==null&&d>limit)return;
    if(rate===goal&&energy<=cap){
      const dates=mode==='daily-double'&&stock>0&&!locked(input)?partitions(path,cards,stock,limit):[];
      if(dates!==null){const score=e15(cards,used);if(!best||energy>best.energy||energy===best.energy&&(score>best.score||score===best.score&&(path.length<best.steps||path.length===best.steps&&mode==='daily-double'&&later(dates,best.dates))))best={energy,score,steps:path.length,dates:dates.slice()};}
    }
    if(rate===10&&energy>450*DAY||mode==='final-double'&&usedDouble>0)return;
    // Any schedule needs at least ceil(N/10) days, independent of its boundaries.
    if(limit!==null&&path.length===limit*10)return;
    for(let i=0;i<cards.length;i++){
      if(!left[i])continue;const c=cards[i];
      if(rate===c.rate&&energy>45*DAY*rate)continue;
      const next=energy+c.minutes*c.rate;
      if(c.rate===1&&next>770*DAY||c.rate===5&&next>154*DAY*5)continue;
      left[i]--;used[i]++;path.push(i);visit(next,c.rate,usedDouble+Number(c.rate===10));path.pop();used[i]--;left[i]++;
    }
  }
  visit(input.minutes*input.rate,input.rate,0);return best;
}

function validate(input,r,name){
  const cards=cardsOf(input),limit=limitOf(input),mode=input.mode||'longest';
  assert.equal(r.maxRouteDays,limit,`${name}: normalized day limit`);assert.equal(r.rate,target(input));
  if(!r.found){assert.deepEqual(r.route,[]);assert.deepEqual(r.days,[]);return;}
  assert(!invalidInitial(input));
  assert.equal(r.days.length,Math.ceil(r.route.length/10),`${name}: compact days`);
  if(limit!==null){assert(r.days.length<=limit,`${name}: output exceeds route-day budget`);assert(r.route.every(step=>step.day<=limit),`${name}: step exceeds budget`);}
  let energy=input.minutes*input.rate,rate=input.rate;const used=cards.map(()=>0);
  r.route.forEach((step,i)=>{
    const card=cards[step.card];assert(card);assert(!(rate===10&&energy>450*DAY),`${name}: locked 2x transition`);
    assert(!(rate===card.rate&&energy>45*DAY*rate));assert(++used[step.card]<=input.counts[step.card]);
    if(input.dayCardsOnly===true)assert.notEqual(card.minutes,5);
    energy+=card.minutes*card.rate;rate=card.rate;
    assert(rate!==1||energy<=770*DAY);assert(rate!==5||energy<=154*DAY*5);
    assert.equal(step.minutes,energy/rate);assert.equal(step.rate,rate);
    if(mode==='final-double'&&card.rate===10)assert.equal(i,r.route.length-1);
  });
  assert.equal(rate,r.rate);assert.equal(r.minutes,energy/rate);assert.deepEqual(r.used,used);
  if(rate===10)assert(r.minutes<=84*DAY);
  assert.deepEqual(r.days.flatMap(d=>d.steps),r.route);
  const dates=[];
  r.days.forEach((day,i)=>{
    assert.equal(day.day,i+1);assert(day.steps.length>0&&day.steps.length<=10);day.steps.forEach(s=>assert.equal(s.day,day.day));
    const end2=cards[day.steps[day.steps.length-1].card].rate===10;assert.equal(day.endsWithDouble,end2);if(end2)dates.push(day.day);
    if(mode==='daily-double'){
      const twos=day.steps.filter(s=>cards[s.card].rate===10);assert(twos.length<=1);if(twos.length)assert.equal(twos[0],day.steps[day.steps.length-1]);
    }
  });
  const used2=doubles(cards,used),stock=doubles(cards,inventory(input));
  if(mode==='final-double')assert(used2<=1);
  if(mode==='daily-double'&&stock&&!locked(input)){assert.equal(used2,Math.min(stock,r.days.length));assert.equal(cards[r.route[r.route.length-1].card].rate,10);}
  if(locked(input))assert.equal(r.route.length,0);
  return dates;
}
function compare(input,name){
  const snapshot=JSON.stringify(input),r=solve(input),e=oracle(input);assert(r.complete,`${name}: tiny search incomplete`);
  assert.equal(JSON.stringify(input),snapshot,`${name}: input mutation`);const dates=validate(input,r,name);
  assert.equal(r.found,!!e,`${name}: found`);
  if(e){assert.equal(r.minutes*r.rate,e.energy,`${name}: maximum duration`);assert.equal(e15(cardsOf(input),r.used),e.score,`${name}: 1.5 tiebreak`);assert.equal(r.route.length,e.steps,`${name}: step-count tiebreak`);if(input.mode==='daily-double')assert.deepEqual(dates,e.dates);}
  return r;
}

// Optional values normalize consistently and retain the unlimited result.
const simple={minutes:0,rate:5,cards:[{minutes:5,rate:5}],counts:[11]};
const unlimited=solve(simple);
for(const maxRouteDays of [undefined,null,'','   ',9999]){
  const r=compare({...simple,maxRouteDays},`normalization ${JSON.stringify(maxRouteDays)}`);
  assert.equal(r.minutes,unlimited.minutes);
}
for(const maxRouteDays of [0,-1,1.5,10000,NaN,Infinity,'1','0',true,false,[],{}]){
  assert.throws(()=>solve({...simple,maxRouteDays}),/路线最大天数/);
}

for(const mode of ['longest','final-double','daily-double']){
  const noDouble1=compare({...simple,mode,maxRouteDays:1},`${mode}: ten operations in one day`);
  const noDouble2=compare({...simple,mode,maxRouteDays:2},`${mode}: eleven operations in two days`);
  assert.equal(noDouble1.minutes,50);assert.equal(noDouble1.route.length,10);
  assert.equal(noDouble2.minutes,55);assert.equal(noDouble2.route.length,11);
  const input={minutes:0,rate:2,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10}],counts:[10,1],mode};
  const one=compare({...input,maxRouteDays:1},`${mode}: final double must occupy the last available slot`);
  const two=compare({...input,maxRouteDays:2},`${mode}: two-day route can include the last minute card`);
  assert.equal(one.route.length,10);assert.equal(one.used[0],9);assert.equal(one.used[1],1);
  assert.equal(two.route.length,11);assert.equal(two.used[0],10);assert.equal(two.used[1],1);
  assert(two.minutes>one.minutes);
  for(const dayCardsOnly of [false,true])compare({...input,maxRouteDays:1,dayCardsOnly},`${mode}: day filter × budget=${dayCardsOnly}`);
  const rawCards=Object.freeze([{minutes:DAY,rate:5},{minutes:5,rate:10}].map(c=>Object.freeze(c)));
  const frozen=Object.freeze({minutes:0,rate:2,cards:rawCards,counts:Object.freeze([1,1]),mode,maxRouteDays:1,dayCardsOnly:true});
  compare(frozen,`${mode}: immutable dynamic rows`);
}
const compact={minutes:0,rate:5,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts:[10,1,1],mode:'daily-double'};
const daily1=compare({...compact,maxRouteDays:1},'daily one day permits only one aggregate double');
const daily2=compare({...compact,maxRouteDays:2},'daily two days may close early with different doubles');
assert.equal(doubles(compact.cards,daily1.used),1);assert.equal(doubles(compact.cards,daily2.used),2);assert.equal(daily2.days.length,2);
assert(daily2.minutes>daily1.minutes);assert(daily2.days.every(d=>d.endsWithDouble));

// A shorter high-value route wins over a longer low-value route: this setting
// constrains elapsed operation days, not a request to spend the largest count.
const valuable={minutes:770*DAY,rate:1,cards:[{minutes:7*DAY,rate:10},{minutes:5,rate:2},{minutes:5,rate:3},{minutes:5,rate:10}],counts:[1,3,3,1],mode:'final-double',maxRouteDays:1};
const valuableResult=compare(valuable,'one high-value step beats seven low-value steps');
assert.equal(valuableResult.minutes,84*DAY);assert.equal(valuableResult.route.length,1);
assert(valuableResult.minutes>valuable.maxRouteDays*DAY,'final multiplier duration is independent of route-day budget');

const impossible={minutes:0,rate:2,cards:[],counts:[],maxRouteDays:1};
const none=compare(impossible,'no convertible cards');assert.equal(none.found,false);assert.equal(none.reason,'day-limit');
assert.equal(solve({...impossible,maxRouteDays:null}).reason,'no-route');
for(const mode of ['longest','final-double','daily-double']){
  const r=compare({minutes:60*DAY,rate:10,cards:[],counts:[],mode,maxRouteDays:1},`${mode}: locked initial uses zero operation days`);
  assert(r.initialLocked);assert.equal(r.days.length,0);assert.equal(r.route.length,0);assert.equal(r.minutes,60*DAY);
}
assert.equal(solve({minutes:154*DAY+1,rate:5,cards:[],counts:[],maxRouteDays:1}).reason,'initial-limit');
assert.equal(solve({minutes:84*DAY+1,rate:10,cards:[],counts:[],maxRouteDays:1}).reason,'locked-above-limit');
assert.equal(solve({minutes:500*DAY,rate:2,cards:[],counts:[],maxRouteDays:1}).reason,'energy-limit');

let seed=0x7ad09;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>16)%n;}
const all=[5,DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
for(let i=0;i<70;i++){
  const pool=all.slice(),cards=[];for(let n=1+rand(6);n--;){cards.push(pool.splice(rand(pool.length),1)[0]);}
  const rate=[1,2,3,5,10][rand(5)],maximum=rate===1?790:rate===5?165:rate===10?90:300;
  const input={minutes:i%4===0?rand(120):rand(maximum*DAY),rate,cards,counts:cards.map(()=>rand(2)),dayCardsOnly:i%3===0,maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`random-${i}-${mode}`);
}
for(let i=0;i<12;i++){
  const cards=[{minutes:5,rate:2},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts=[8+rand(4),1,1];
  for(const mode of ['longest','final-double','daily-double'])for(const maxRouteDays of [1,2])compare({minutes:rand(120),rate:2,cards,counts,mode,maxRouteDays},`multiday-${i}-${mode}-${maxRouteDays}`);
}

// Force the documented time budget at the first checkpoint. Even a partial
// best result must obey the route-day constraint in every search mode.
const nativeNow=Date.now;
try{
  for(const mode of ['longest','final-double','daily-double']){
    let calls=0;Date.now=()=>calls++?30000:0;
    const input={minutes:0,rate:5,cards:all,counts:all.map(()=>2),mode,maxRouteDays:1};
    const r=solve(input);assert.equal(r.complete,false,`${mode}: forced partial result`);assert(r.found);validate(input,r,`${mode}: partial respects day cap`);
    assert(r.days.length<=1);assert(r.route.length<=10);
  }
}finally{Date.now=nativeNow;}
console.log('PASS: route-day normalization, independent budgeted path/day oracle, all modes and filters, 1/2-day optima, zero-day locked states, and partial-result limits.');
