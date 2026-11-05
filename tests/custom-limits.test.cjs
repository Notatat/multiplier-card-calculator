'use strict';
// Synthetic public-safe tests. This suite uses the current defaults (770/162/84),
// unlike older regression suites that explicitly request legacy 770/154.
const assert=require('node:assert/strict');
const {solve}=require('../solver.js');
const DAY=1440;
const defaults={rate11Days:770,rate15Days:162,doubleEndDays:84};
const limitsOf=input=>Object.fromEntries(Object.keys(defaults).map(k=>{const v=input.limits?.[k];return[k,v===null||v===undefined||typeof v==='string'&&v.trim()===''?defaults[k]:v];}));
const boundsOf=input=>{const l=limitsOf(input);return{1:Math.round(l.rate11Days*100),5:Math.round(l.rate15Days*100)};};
const locked=input=>input.rate===10&&input.minutes>45*DAY;
const effective=input=>input.counts.map((n,i)=>input.dayCardsOnly===true&&input.cards[i].minutes===5?0:n);
const doubles=(cards,counts)=>counts.reduce((sum,n,i)=>sum+(cards[i].rate===10?n:0),0);
const goal=input=>doubles(input.cards,effective(input))>0||locked(input)?10:5;
const e15=(cards,used)=>used.reduce((sum,n,i)=>sum+(cards[i].rate===5?n*cards[i].minutes*5:0),0);
const over=(energy,rate,bounds)=>bounds[rate]!==undefined&&energy*100>bounds[rate]*DAY*rate;
const budget=input=>input.maxRouteDays===null||input.maxRouteDays===undefined||typeof input.maxRouteDays==='string'&&input.maxRouteDays.trim()===''?null:input.maxRouteDays;
const later=(a,b)=>{for(let i=Math.max(a.length,b.length)-1;i>=0;i--){const x=a[i]??-1,y=b[i]??-1;if(x!==y)return x>y;}return false;};
function partitions(path,cards,stock){
  const n=path.length,d=Math.ceil(n/10),twos=path.filter(i=>cards[i].rate===10).length;
  if(!n||cards[path[n-1]].rate!==10||twos!==Math.min(stock,d))return null;
  let best=null;
  function split(offset,left,dates){
    if(!left){if(offset===n&&(!best||later(dates,best)))best=dates.slice();return;}
    for(let count=Math.max(1,n-offset-10*(left-1));count<=Math.min(10,n-offset-(left-1));count++){
      const chunk=path.slice(offset,offset+count),num=chunk.filter(i=>cards[i].rate===10).length,ends=cards[chunk[count-1]].rate===10;
      if(num>1||num===1&&!ends)continue;
      if(ends)dates.push(d-left+1);split(offset+count,left-1,dates);if(ends)dates.pop();
    }
  }
  split(0,d,[]);return best;
}
function oracle(input){
  const b=boundsOf(input),target=goal(input),cap=target===10?Math.round(limitsOf(input).doubleEndDays*100)*DAY*10/100:b[5]*DAY*5/100,mode=input.mode||'longest';
  if(over(input.minutes*input.rate,input.rate,b))return null;
  const cards=input.cards,left=effective(input),stock=doubles(cards,left),used=cards.map(()=>0),path=[],max=budget(input);let best=null;
  function visit(energy,rate,used2){
    if(max!==null&&path.length>max*10)return;
    if(rate===target&&energy<=cap){
      const dates=mode==='daily-double'&&stock&&!locked(input)?partitions(path,cards,stock):[];
      if(dates!==null){const score=e15(cards,used);if(!best||energy>best.energy||energy===best.energy&&(score>best.score||score===best.score&&(path.length<best.steps||path.length===best.steps&&mode==='daily-double'&&later(dates,best.dates))))best={energy,score,steps:path.length,dates:dates.slice()};}
    }
    if(rate===10&&energy>450*DAY||mode==='final-double'&&used2>0||max!==null&&path.length===max*10)return;
    for(let i=0;i<cards.length;i++){
      const c=cards[i];if(!left[i]||rate===c.rate&&energy>45*DAY*rate)continue;
      const next=energy+c.minutes*c.rate;if(over(next,c.rate,b))continue;
      left[i]--;used[i]++;path.push(i);visit(next,c.rate,used2+Number(c.rate===10));path.pop();used[i]--;left[i]++;
    }
  }
  visit(input.minutes*input.rate,input.rate,0);return best;
}
function validate(input,r,name){
  const l=limitsOf(input),b=boundsOf(input),cards=input.cards;
  assert.deepEqual(r.limits,l,`${name}: normalized limits`);assert.equal(r.rate,goal(input));assert.equal(r.targetDays,r.rate===10?l.doubleEndDays:l.rate15Days);
  if(!r.found){assert.deepEqual(r.route,[]);return;}
  let energy=input.minutes*input.rate,rate=input.rate;const used=cards.map(()=>0);
  assert(!over(energy,rate,b),`${name}: initial limit`);
  r.route.forEach((step,i)=>{
    const c=cards[step.card];assert(c);assert(++used[step.card]<=input.counts[step.card]);
    assert(!(rate===10&&energy>450*DAY),`${name}: 45-day lock is independent of custom caps`);
    assert(!(rate===c.rate&&energy>45*DAY*rate),`${name}: same-rate restriction unchanged`);
    if(input.dayCardsOnly===true)assert.notEqual(c.minutes,5);
    energy+=c.minutes*c.rate;rate=c.rate;assert(!over(energy,rate,b),`${name}: converted limit`);
    assert.equal(step.minutes,energy/rate);assert.equal(step.rate,rate);
    if(input.mode==='final-double'&&c.rate===10)assert.equal(i,r.route.length-1);
  });
  assert.equal(rate,r.rate);assert.equal(r.minutes,energy/rate);assert.deepEqual(r.used,used);
  if(rate===10)assert(r.minutes*100<=Math.round(l.doubleEndDays*100)*DAY,`${name}: configured double endpoint cap`);
  assert.equal(r.days.length,Math.ceil(r.route.length/10));if(budget(input)!==null)assert(r.days.length<=budget(input));
  assert.deepEqual(r.days.flatMap(d=>d.steps),r.route);const dates=[];
  r.days.forEach((day,i)=>{
    assert.equal(day.day,i+1);assert(day.steps.length>0&&day.steps.length<=10);day.steps.forEach(s=>assert.equal(s.day,day.day));
    const end2=cards[day.steps[day.steps.length-1].card].rate===10;assert.equal(day.endsWithDouble,end2);if(end2)dates.push(day.day);
    if(input.mode==='daily-double'){const twos=day.steps.filter(s=>cards[s.card].rate===10);assert(twos.length<=1);if(twos.length)assert.equal(twos[0],day.steps[day.steps.length-1]);}
  });
  const stock=doubles(cards,effective(input)),used2=doubles(cards,used);
  if(input.mode==='final-double')assert(used2<=1);
  if(input.mode==='daily-double'&&stock&&!locked(input)){assert.equal(used2,Math.min(stock,r.days.length));assert.equal(cards[r.route[r.route.length-1].card].rate,10);}
  return dates;
}
function compare(input,name){
  const before=JSON.stringify(input),r=solve(input),expected=oracle(input);assert.equal(JSON.stringify(input),before,`${name}: immutable input`);assert(r.complete,`${name}: tiny search complete`);
  const dates=validate(input,r,name);assert.equal(r.found,!!expected,`${name}: found`);
  if(expected){assert.equal(r.minutes*r.rate,expected.energy,`${name}: duration`);assert.equal(e15(input.cards,r.used),expected.score,`${name}: 1.5 preference`);assert.equal(r.route.length,expected.steps,`${name}: shortest route`);if(input.mode==='daily-double')assert.deepEqual(dates,expected.dates);}
  return r;
}

// Current default 162 is intentional, and explicit former 154 remains supported.
const defaultCap={minutes:740*DAY,rate:1,cards:[{minutes:14*DAY,rate:5}],counts:[1]};
const current=compare(defaultCap,'default 1.5 endpoint is 162 days');assert.equal(current.minutes,162*DAY);assert.deepEqual(current.limits,defaults);
const old=compare({...defaultCap,limits:{rate15Days:154}},'explicit former 154-day configuration');assert.equal(old.found,false);assert.equal(old.targetDays,154);
for(const limits of [undefined,null,{}, {rate11Days:null,rate15Days:''}, {rate11Days:' ',rate15Days:undefined}]){
  const r=compare({...defaultCap,limits},`default normalization ${JSON.stringify(limits)}`);assert.equal(r.minutes,current.minutes);assert.deepEqual(r.limits,defaults);
}

const high11={minutes:800*DAY,rate:1,cards:[{minutes:DAY,rate:10}],counts:[1]};
assert.equal(compare(high11,'default 1.1 initial limit').reason,'initial-limit');
const raised11=compare({...high11,limits:{rate11Days:1000}},'raise 1.1 initial limit');assert.equal(raised11.minutes,81*DAY);
assert.equal(compare({minutes:700*DAY,rate:1,cards:[],counts:[],limits:{rate11Days:600}},'lower 1.1 initial limit').reason,'initial-limit');
const high15={minutes:165*DAY,rate:5,cards:[{minutes:DAY,rate:10}],counts:[1]};
assert.equal(compare(high15,'default 1.5 initial limit').reason,'initial-limit');
const raised15=compare({...high15,limits:{rate15Days:170}},'raise 1.5 initial limit');assert.equal(raised15.minutes,83.5*DAY);
assert.equal(compare({minutes:160*DAY,rate:5,cards:[],counts:[],limits:{rate15Days:154}},'lower 1.5 initial limit').reason,'initial-limit');

const bridge11={minutes:153*DAY,rate:5,cards:[{minutes:14*DAY,rate:1},{minutes:DAY,rate:10}],counts:[1,1]};
const bridgeDefault=compare(bridge11,'default 1.1 bridge cap'),bridgeRaised=compare({...bridge11,limits:{rate11Days:800}},'raised 1.1 bridge cap');
assert.equal(bridgeDefault.used[0],0);assert.equal(bridgeRaised.used[0],1);assert.equal(bridgeRaised.minutes,789*DAY/10);
const bridge15={minutes:770*DAY,rate:1,cards:[{minutes:14*DAY,rate:5}],counts:[1]};
assert(!compare(bridge15,'default 1.5 bridge cap').found);
const bridge15Raised=compare({...bridge15,limits:{rate15Days:170}},'custom 1.5 bridge and final target cap');assert.equal(bridge15Raised.minutes,168*DAY);assert.equal(bridge15Raised.targetDays,170);
const lower15=compare({minutes:750*DAY,rate:1,cards:[{minutes:7*DAY,rate:5}],counts:[1],limits:{rate15Days:157}},'exact custom 157-day 1.5 cap');assert.equal(lower15.minutes,157*DAY);
assert(!compare({minutes:750*DAY,rate:1,cards:[{minutes:7*DAY,rate:5}],counts:[1],limits:{rate15Days:156.99}},'custom 1.5 cap just below endpoint').found);

// Decimal limits are compared with integer hundredths; no minute rounding is allowed.
const exact11={minutes:67,rate:1,cards:[{minutes:5,rate:1},{minutes:5,rate:5}],counts:[1,1],limits:{rate11Days:0.05}};
const at11=compare(exact11,'1.1 exact 0.05-day boundary');assert.equal(at11.route[0].minutes,72);assert.equal(at11.used[0],1);
const over11=compare({...exact11,minutes:68},'1.1 one minute beyond decimal boundary');assert.equal(over11.used[0],0);
const exact15={minutes:335,rate:1,cards:[{minutes:5,rate:5}],counts:[1],limits:{rate15Days:0.05}};
assert.equal(compare(exact15,'1.5 exact 0.05-day boundary').minutes,72);
assert(!compare({...exact15,minutes:336},'1.5 endpoint 0.2 minute over decimal boundary').found);
const tiny=compare({minutes:0,rate:5,cards:[{minutes:5,rate:5}],counts:[3],limits:{rate15Days:0.01}},'minimum custom cap still preserves fractions');assert.equal(tiny.minutes,10);assert.equal(tiny.used[0],2);
for(const value of [0.01,0.29,1.23,99998.99,99999]){
  const r=compare({minutes:0,rate:5,cards:[],counts:[],limits:{rate11Days:value,rate15Days:value}},`valid decimal ${value}`);assert.deepEqual(r.limits,{rate11Days:value,rate15Days:value,doubleEndDays:84});
}
for(const key of ['rate11Days','rate15Days','doubleEndDays'])for(const value of [0,-1,0.001,1.231,99999.01,NaN,Infinity,'154',true,[],{}]){
  assert.throws(()=>solve({minutes:0,rate:5,cards:[],counts:[],limits:{[key]:value}}),/上限须为0.01～99999天/);
}
for(const limits of ['',[],true,1])assert.throws(()=>solve({minutes:0,rate:5,cards:[],counts:[],limits}),/倍率上限设置无效/);

// Overriding only 1.1/1.5 retains the default 84-day double endpoint and the 45-day lock.
const twoCap=compare({minutes:160*DAY,rate:5,cards:[{minutes:7*DAY,rate:10},{minutes:DAY,rate:10}],counts:[1,1],mode:'final-double',limits:{rate11Days:1000,rate15Days:200}},'2x ceiling remains 84 despite large custom caps');
assert.equal(twoCap.targetDays,84);assert.equal(twoCap.used[0],0);assert.equal(twoCap.minutes,81*DAY);
const isLocked=compare({minutes:60*DAY,rate:10,cards:[{minutes:DAY,rate:5}],counts:[1],mode:'daily-double',maxRouteDays:1,limits:{rate11Days:0.01,rate15Days:0.01}},'custom caps cannot reopen locked initial 2x');
assert(isLocked.initialLocked);assert.equal(isLocked.route.length,0);assert.equal(isLocked.days.length,0);
const unaffected12=compare({minutes:200*DAY,rate:2,cards:[{minutes:DAY,rate:10}],counts:[1],limits:{rate11Days:0.01,rate15Days:0.01}},'custom limits do not invent a 1.2x cap');assert.equal(unaffected12.minutes,41*DAY);
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:14*DAY,rate:10}],counts:[0],limits:{rate11Days:99999,rate15Days:99999}}),/2倍卡时长最多7天/);

const daysInput={minutes:0,rate:5,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10}],counts:[11,1]};
for(const mode of ['longest','final-double','daily-double'])for(const dayCardsOnly of [false,true])for(const maxRouteDays of [1,2]){
  const input={...daysInput,mode,dayCardsOnly,maxRouteDays,limits:{rate11Days:0.29,rate15Days:0.1}};
  const r=compare(input,`${mode} × day-only=${dayCardsOnly} × route-days=${maxRouteDays}`);
  if(!dayCardsOnly)assert.equal(r.used[0],maxRouteDays===1?9:11);else assert.equal(r.used[0],0);
}
const immutable=Object.freeze({minutes:0,rate:5,cards:Object.freeze([{minutes:DAY,rate:5}].map(Object.freeze)),counts:Object.freeze([1]),limits:Object.freeze({rate11Days:0.29,rate15Days:162.25}),mode:'longest',maxRouteDays:1});
compare(immutable,'frozen custom-limit input');

// Configurable DOUBLE endpoint is distinct from card length, multiplier locks,
// and the per-rate 1.1/1.5 caps. All cases below are synthetic.
for(const value of [undefined,null,'','  ']){
  const r=compare({...defaultCap,limits:{doubleEndDays:value}},`default double endpoint ${JSON.stringify(value)}`);
  assert.equal(r.limits.doubleEndDays,84);
}
const highDouble={minutes:162*DAY,rate:5,cards:[{minutes:7*DAY,rate:10}],counts:[1],mode:'final-double'};
assert(!compare(highDouble,'default double ceiling rejects 88-day endpoint').found);
const raisedDouble=compare({...highDouble,limits:{doubleEndDays:90}},'raise double ceiling independently');
assert.equal(raisedDouble.minutes,88*DAY);assert.equal(raisedDouble.targetDays,90);
const lowerDouble=compare({minutes:154*DAY,rate:5,cards:[{minutes:7*DAY,rate:10},{minutes:DAY,rate:10}],counts:[1,1],mode:'final-double',limits:{doubleEndDays:80}},'lower double ceiling selects smaller card');
assert.equal(lowerDouble.minutes,78*DAY);assert.equal(lowerDouble.used[0],0);
const locked85={minutes:85*DAY,rate:10,cards:[{minutes:DAY,rate:5}],counts:[1],mode:'daily-double',maxRouteDays:1};
assert.equal(compare(locked85,'locked initial exceeds default double ceiling').reason,'locked-above-limit');
const keepLocked=compare({...locked85,limits:{doubleEndDays:90}},'raised double ceiling keeps locked initial without reopening it');
assert(keepLocked.initialLocked);assert.equal(keepLocked.minutes,85*DAY);assert.equal(keepLocked.route.length,0);
assert.equal(compare({...locked85,limits:{doubleEndDays:84.99}},'locked initial just over custom double ceiling').reason,'locked-above-limit');
const below45=compare({minutes:40*DAY,rate:10,cards:[{minutes:DAY,rate:5}],counts:[1],limits:{doubleEndDays:1}},'double endpoint does not constrain non-double final target');
assert.equal(below45.rate,5);assert.equal(below45.minutes,81*DAY);
const exactDouble={minutes:670,rate:1,cards:[{minutes:5,rate:10}],counts:[1],mode:'final-double',limits:{doubleEndDays:0.05}};
assert.equal(compare(exactDouble,'exact decimal double endpoint').minutes,72);
assert(!compare({...exactDouble,minutes:671},'0.1 minute above custom decimal double endpoint').found);
for(const mode of ['longest','final-double','daily-double'])for(const maxRouteDays of [1,2]){
  const input={minutes:0,rate:5,cards:[{minutes:5,rate:10}],counts:[15],mode,maxRouteDays,limits:{rate11Days:0.29,rate15Days:0.1,doubleEndDays:0.05}};
  const r=compare(input,`${mode} custom double ceiling × ${maxRouteDays} route days`);
  if(mode==='longest')assert.equal(r.minutes,maxRouteDays===1?50:70);else assert.equal(r.minutes,5);
  const filtered=compare({...input,dayCardsOnly:true},`${mode} custom double ceiling × minute filter`);
  assert.equal(filtered.rate,5);assert.equal(filtered.route.length,0);
}
for(const value of [0.01,0.29,1.23,99999]){
  const r=compare({minutes:0,rate:5,cards:[],counts:[],limits:{doubleEndDays:value}},`valid custom double limit ${value}`);
  assert.equal(r.limits.doubleEndDays,value);
}

// Random small stocks: independent nonmemoized path/day-partition oracle.
let seed=0x7315a;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>16)%n;}
const all=[5,DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
const choices=[0.01,0.05,0.29,1,10,45,60,100,154,162,200,770,1000];
for(let i=0;i<80;i++){
  const pool=all.slice(),cards=[];for(let n=1+rand(6);n--;)cards.push(pool.splice(rand(pool.length),1)[0]);
  const input={minutes:i%2===0?rand(200):rand(200*DAY),rate:[1,2,3,5,10][rand(5)],cards,counts:cards.map(()=>rand(2)),limits:{rate11Days:choices[rand(choices.length)],rate15Days:choices[rand(choices.length)],doubleEndDays:choices[rand(choices.length)]},dayCardsOnly:i%3===0,maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`custom-random-${i}-${mode}`);
}
for(let i=0;i<10;i++){
  const input={minutes:rand(20),rate:2,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts:[8+rand(4),1,1],limits:{rate11Days:0.29,rate15Days:[0.03,0.05,0.1][rand(3)],doubleEndDays:[0.01,0.05,7,84,90][rand(5)]},maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`custom-multiday-${i}-${mode}`);
}
console.log('PASS: current 770/162/84 defaults, explicit legacy 154, configurable double endpoints, decimal custom limits, initial/conversion/target bounds, 270 independent mode comparisons, unchanged locks/caps and route-day/filter interactions.');
