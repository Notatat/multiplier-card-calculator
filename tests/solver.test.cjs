'use strict';
// Dynamic-card regression uses independent ordered-path enumeration and, for
// daily mode, enumeration of every compact partition into 1..10 operations.
const assert=require('node:assert/strict');
const {solve:solveCore,CARDS}=require('../solver.js');
// This regression suite explicitly tests the former 770/154 configuration.
const solve=(input,progress)=>solveCore({limits:{rate11Days:770,rate15Days:154},...input},progress);
const DAY=1440,RATES=[1,2,3,5,10],MINUTES=[5,DAY,7*DAY,14*DAY];
const allCards=MINUTES.flatMap(minutes=>RATES.map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
const locked=input=>input.rate===10&&input.minutes>45*DAY;
const invalidInitial=input=>input.rate===1&&input.minutes>770*DAY||input.rate===5&&input.minutes>154*DAY;
const inventory=input=>input.counts.map((n,i)=>input.dayCardsOnly===true&&input.cards[i].minutes===5?0:n);
const doubleCount=(cards,counts)=>counts.reduce((sum,n,i)=>sum+(cards[i].rate===10?n:0),0);
const target=input=>doubleCount(input.cards,inventory(input))>0||locked(input)?10:5;
const spent15=(cards,used)=>used.reduce((sum,n,i)=>sum+(cards[i].rate===5?n*cards[i].minutes*5:0),0);
const later=(a,b)=>{for(let i=Math.max(a.length,b.length)-1;i>=0;i--){const x=a[i]??-1,y=b[i]??-1;if(x!==y)return x>y;}return false;};

function dailyPartitions(path,cards,stock){
  const n=path.length,d=Math.ceil(n/10),twos=path.filter(i=>cards[i].rate===10).length;
  if(!n||cards[path[n-1]].rate!==10||twos!==Math.min(stock,d))return null;
  let best=null;
  function partition(offset,left,dates){
    if(!left){if(offset===n&&(!best||later(dates,best)))best=dates.slice();return;}
    for(let length=Math.max(1,n-offset-10*(left-1));length<=Math.min(10,n-offset-(left-1));length++){
      const chunk=path.slice(offset,offset+length),ends=cards[chunk[length-1]].rate===10;
      const count=chunk.filter(i=>cards[i].rate===10).length;
      if(count>1||count===1&&!ends)continue;
      if(ends)dates.push(d-left+1);partition(offset+length,left-1,dates);if(ends)dates.pop();
    }
  }
  partition(0,d,[]);return best;
}

function oracle(input){
  if(invalidInitial(input))return null;
  const cards=input.cards,counts=inventory(input),stock=doubleCount(cards,counts),goal=target(input),cap=(goal===10?840:770)*DAY;
  const mode=input.mode||'longest',left=counts.slice(),used=counts.map(()=>0),path=[];let best=null;
  function visit(energy,rate,usedDouble){
    if(rate===goal&&energy<=cap){
      const dates=mode==='daily-double'&&stock>0&&!locked(input)?dailyPartitions(path,cards,stock):[];
      if(dates!==null){const s15=spent15(cards,used);if(!best||energy>best.energy||energy===best.energy&&(s15>best.s15||s15===best.s15&&(path.length<best.steps||path.length===best.steps&&mode==='daily-double'&&later(dates,best.dates))))best={energy,s15,steps:path.length,dates:dates.slice()};}
    }
    if(rate===10&&energy>450*DAY||mode==='final-double'&&usedDouble>0)return;
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

function verify(input,r,name){
  assert.equal(r.mode,input.mode||'longest',`${name}: mode`);assert.equal(r.rate,target(input),`${name}: goal`);
  assert.equal(r.dayCardsOnly,input.dayCardsOnly===true);assert.equal(r.initialLocked,locked(input));
  assert.deepEqual(r.cards.map(({minutes,rate})=>({minutes,rate})),input.cards.map(({minutes,rate})=>({minutes,rate})),`${name}: per-input table`);
  assert.equal(r.used.length,input.cards.length);
  for(let i=0;i<input.cards.length;i++){
    const c=input.cards[i],expected='+'+(c.minutes===5?'5分钟':c.minutes/DAY+'天')+(c.rate===10?'2':'1.'+c.rate)+'倍';
    assert.equal(r.cards[i].label,expected,`${name}: generated label`);
  }
  if(!r.found){assert.deepEqual(r.days,[]);return;}
  const used=input.counts.map(()=>0);let energy=input.minutes*input.rate,rate=input.rate;
  for(let j=0;j<r.route.length;j++){
    const step=r.route[j],c=input.cards[step.card];assert(c,`${name}: index remains aligned`);
    assert(!(rate===10&&energy>450*DAY),`${name}: 2x lock`);
    assert(!(rate===c.rate&&energy>45*DAY*rate),`${name}: same-rate restriction`);
    assert(++used[step.card]<=input.counts[step.card],`${name}: per-combination inventory`);
    if(input.dayCardsOnly===true)assert.notEqual(c.minutes,5,`${name}: minute filter`);
    energy+=c.minutes*c.rate;rate=c.rate;
    assert(rate!==1||energy<=770*DAY);assert(rate!==5||energy<=154*DAY*5);
    assert.equal(step.rate,rate);assert.equal(step.minutes,energy/rate);
    if(input.mode==='final-double'&&c.rate===10)assert.equal(j,r.route.length-1);
  }
  assert.equal(rate,r.rate);assert.equal(r.minutes,energy/rate);assert.deepEqual(r.used,used);
  if(rate===10)assert(r.minutes<=84*DAY);
  assert.equal(r.days.length,Math.ceil(r.route.length/10));assert.deepEqual(r.days.flatMap(d=>d.steps),r.route);
  const ending=[];
  r.days.forEach((day,i)=>{
    assert.equal(day.day,i+1);assert(day.steps.length>0&&day.steps.length<=10);
    day.steps.forEach(s=>assert.equal(s.day,day.day));
    const twos=day.steps.filter(s=>input.cards[s.card].rate===10);
    const ends=input.cards[day.steps[day.steps.length-1].card].rate===10;
    assert.equal(day.endsWithDouble,ends);if(ends)ending.push(day.day);
    if(input.mode==='daily-double'){assert(twos.length<=1);if(twos.length)assert.equal(day.steps[day.steps.length-1],twos[0]);}
  });
  const usedDouble=doubleCount(input.cards,used),stock=doubleCount(input.cards,inventory(input));
  if(input.mode==='final-double')assert(usedDouble<=1,`${name}: aggregate final-only double cap`);
  if(input.mode==='daily-double'&&stock&&!locked(input)){
    assert.equal(usedDouble,Math.min(stock,r.days.length));assert.equal(input.cards[r.route[r.route.length-1].card].rate,10);
  }
  assert.equal(r.doubleEndingDays,ending.length);return ending;
}
function compare(input,name){
  const before=JSON.stringify(input),r=solve(input),e=oracle(input);
  assert.equal(JSON.stringify(input),before,`${name}: input not mutated`);assert(r.complete,`${name}: tiny search complete`);
  const dates=verify(input,r,name);assert.equal(r.found,!!e,`${name}: found`);
  if(e){assert.equal(r.minutes*r.rate,e.energy,`${name}: duration`);assert.equal(spent15(input.cards,r.used),e.s15,`${name}: 1.5 preference`);assert.equal(r.route.length,e.steps,`${name}: steps`);if(input.mode==='daily-double')assert.deepEqual(dates,e.dates);}
  return r;
}

// All 19 valid combinations normalize successfully, including all one-day and 1.2x rows.
const table=compare({minutes:0,rate:5,cards:allCards,counts:allCards.map(()=>0)},'19-combination table');
assert.equal(table.cards.length,19);
for(let i=0;i<allCards.length;i++){
  const c=allCards[i];const cards=c.minutes===5&&c.rate===5?[c]:[c,{minutes:5,rate:5}];
  const counts=cards.length===1?[2]:[1,1];
  for(const mode of ['longest','final-double','daily-double'])compare({minutes:0,rate:5,cards,counts,mode},`combination-${i}-${mode}`);
}
compare({minutes:300*DAY,rate:2,cards:[{minutes:DAY,rate:5}],counts:[1]},'initial 1.2x has no invented 154-day cap');
const restored12=compare({minutes:70*DAY,rate:5,cards:[{minutes:DAY,rate:2},{minutes:DAY,rate:5}],counts:[1,1]},'1.2x bridge above 154 days');
assert(restored12.route.some(s=>s.rate===2&&s.minutes>154*DAY));
const same12=compare({minutes:45*DAY+1,rate:2,cards:[{minutes:DAY,rate:2},{minutes:DAY,rate:5}],counts:[1,1]},'1.2x same-rate ban above 45 days');
assert(!same12.route.length||same12.route[0].card!==0);
for(const mode of ['longest','final-double','daily-double']){
  const r=compare({minutes:0,rate:5,cards:[{minutes:5,rate:10},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts:[1,1,1],mode},`multiple double durations-${mode}`);
  if(mode!=='longest'){assert.equal(r.minutes,7*DAY);assert.equal(r.route.length,1);assert.equal(r.route[0].card,2);}
}
const capped=compare({minutes:400*DAY,rate:2,cards:[{minutes:7*DAY,rate:10},{minutes:DAY,rate:10}],counts:[1,1],mode:'final-double'},'largest available double can exceed cap, choose one-day duration');
assert.equal(capped.minutes,81*DAY);assert.equal(capped.route[0].card,1);
const sevenDayBoundary=compare({minutes:154*DAY,rate:5,cards:[{minutes:7*DAY,rate:10}],counts:[1],mode:'final-double'},'seven-day double reaches exact 84-day endpoint');
assert.equal(sevenDayBoundary.minutes,84*DAY);
const mixedDaily=compare({minutes:0,rate:2,cards:[{minutes:DAY,rate:10},{minutes:7*DAY,rate:10},{minutes:5,rate:5}],counts:[1,1,10],mode:'daily-double'},'daily coverage aggregates different double durations');
assert.equal(mixedDaily.route.length,12);assert.equal(mixedDaily.days.length,2);assert(mixedDaily.days.every(d=>d.endsWithDouble));assert.equal(mixedDaily.minutes,8*DAY+25);

for(const mode of ['longest','final-double','daily-double']){
  const cards=Object.freeze(allCards.map(c=>Object.freeze({...c}))),counts=Object.freeze(allCards.map(c=>c.minutes===5?1:0));
  const input=Object.freeze({minutes:0,rate:5,cards,counts,mode,dayCardsOnly:true});
  const filtered=compare(input,`all five minute types filtered-${mode}`);
  assert.equal(filtered.hasDouble,false);assert.equal(filtered.rate,5);assert.equal(filtered.route.length,0);
  assert.deepEqual(filtered.used,allCards.map(()=>0));assert.deepEqual(counts,allCards.map(c=>c.minutes===5?1:0));
  const enabled=compare({...input,dayCardsOnly:false},`all five minute types allowed-${mode}`);
  assert.equal(enabled.hasDouble,true);assert.equal(enabled.rate,10);assert(enabled.used.some(n=>n>0));
  const truthy=solve({...input,dayCardsOnly:'true'});assert.equal(truthy.dayCardsOnly,false);assert.equal(truthy.minutes,enabled.minutes);
}
const minuteDoubleRemoved=compare({minutes:0,rate:2,cards:[{minutes:5,rate:10},{minutes:DAY,rate:5}],counts:[1,1],mode:'daily-double',dayCardsOnly:true},'filtered minute-double stock must not force a double target');
assert.equal(minuteDoubleRemoved.hasDouble,false);assert.equal(minuteDoubleRemoved.rate,5);assert.equal(minuteDoubleRemoved.minutes,DAY);
compare({minutes:60*DAY,rate:10,cards:[],counts:[],mode:'daily-double'},'empty custom inventory and locked initial');
compare({minutes:0,rate:5,cards:[],counts:[],mode:'final-double'},'empty custom inventory');

for(const qty of [0,1])for(const mode of ['longest','final-double','daily-double'])assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:14*DAY,rate:10}],counts:[qty],mode,maxRouteDays:1,dayCardsOnly:true}),/2倍卡时长最多7天/);
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:2},{minutes:DAY,rate:2}],counts:[1,2]}),/重复/);
assert.throws(()=>solve({minutes:0,rate:5,cards:allCards.concat(allCards[0]),counts:Array(20).fill(0)}));
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:10,rate:2}],counts:[1]}));
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:4}],counts:[1]}));
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:2}],counts:[]}));
for(const qty of [-1,1.2,10000])assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:2}],counts:[qty]}));
// Generated labels ignore a caller's untrusted label; inputs remain untouched.
const labelInput={minutes:0,rate:5,cards:[{minutes:DAY,rate:2,label:'caller label'}],counts:[1]};
assert.equal(solve(labelInput).cards[0].label,'+1天1.2倍');assert.equal(labelInput.cards[0].label,'caller label');

let seed=0xa28c61;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>16)%n;}
for(let i=0;i<90;i++){
  const available=allCards.map(c=>({...c})),cards=[];
  for(let j=0,n=1+rand(6);j<n;j++)cards.push(available.splice(rand(available.length),1)[0]);
  const rate=RATES[rand(RATES.length)],maxDays=rate===1?790:rate===5?165:rate===10?90:300;
  const input={minutes:i%4===0?rand(180):rand(maxDays*DAY),rate,cards,counts:cards.map(()=>rand(2)),dayCardsOnly:i%3===0};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`dynamic-random-${i}-${mode}`);
}
for(let i=0;i<12;i++){
  const cards=[{minutes:5,rate:2},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}];
  compare({minutes:rand(120),rate:2,cards,counts:[8+rand(4),1,1],mode:'daily-double'},`dynamic-multiday-${i}`);
}
console.log('PASS: 19 dynamic combinations, forbidden 14-day doubles, aggregate double limits, 1.2x/one-day cards, all-minute filtering, immutable inputs, invalid combinations, 270 random mode comparisons and multiday schedules.');
