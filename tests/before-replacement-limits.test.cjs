'use strict';
// Independent oracle: enumerate legal card orders and every compact day split.
// A multiplier threshold checks the state BEFORE a card; overshoot endpoints
// are allowed. The separate >45-day same-rate restriction remains in force.
const assert=require('node:assert/strict');
const {solve,CARDS}=require('../solver.js');
const DAY=1440,DEFAULTS={rate11Days:770,rate12Days:390,rate13Days:263,rate15Days:162,doubleBeforeDays:45,doubleEndDays:88};
const cardsOf=input=>input.cards===undefined?CARDS:input.cards;
const limitsOf=input=>Object.fromEntries(Object.keys(DEFAULTS).map(k=>{const v=input.limits?.[k];return[k,v===undefined||v===null||typeof v==='string'&&v.trim()===''?DEFAULTS[k]:v];}));
const beforeOf=input=>{const l=limitsOf(input);return{1:l.rate11Days,2:l.rate12Days,3:l.rate13Days,5:l.rate15Days,10:l.doubleBeforeDays};};
const blocked=(energy,rate,input)=>energy*100>Math.round(beforeOf(input)[rate]*100)*DAY*rate;
const initialLocked=input=>input.rate===10&&input.minutes*100>Math.round(limitsOf(input).doubleBeforeDays*100)*DAY;
const inventory=input=>input.counts.map((n,i)=>input.dayCardsOnly===true&&cardsOf(input)[i].minutes===5?0:n);
const doubleCount=(cards,counts)=>counts.reduce((sum,n,i)=>sum+(cards[i].rate===10?n:0),0);
const target=input=>doubleCount(cardsOf(input),inventory(input))>0||initialLocked(input)?10:5;
const budget=input=>input.maxRouteDays===undefined||input.maxRouteDays===null||typeof input.maxRouteDays==='string'&&input.maxRouteDays.trim()===''?null:input.maxRouteDays;
const spent15=(cards,used)=>used.reduce((sum,n,i)=>sum+(cards[i].rate===5?n*cards[i].minutes*5:0),0);
const later=(a,b)=>{for(let i=Math.max(a.length,b.length)-1;i>=0;i--){const x=a[i]??-1,y=b[i]??-1;if(x!==y)return x>y;}return false;};
function partitions(path,cards,stock){
  const n=path.length,d=Math.ceil(n/10),twos=path.filter(i=>cards[i].rate===10).length;
  if(!n||cards[path[n-1]].rate!==10||twos!==Math.min(stock,d))return null;
  let best=null;
  function divide(offset,left,dates){
    if(!left){if(offset===n&&(!best||later(dates,best)))best=dates.slice();return;}
    for(let n=Math.max(1,path.length-offset-10*(left-1));n<=Math.min(10,path.length-offset-(left-1));n++){
      const group=path.slice(offset,offset+n),twos=group.filter(i=>cards[i].rate===10).length,ends=cards[group[n-1]].rate===10;
      if(twos>1||twos===1&&!ends)continue;
      if(ends)dates.push(d-left+1);divide(offset+n,left-1,dates);if(ends)dates.pop();
    }
  }
  divide(0,d,[]);return best;
}
function oracle(input){
  const cards=cardsOf(input),left=inventory(input),stock=doubleCount(cards,left),goal=target(input),max=budget(input),mode=input.mode||'longest';
  const cap=goal===10?Math.round(limitsOf(input).doubleEndDays*100)*DAY*10/100:Infinity;
  const used=cards.map(()=>0),path=[];let best=null;
  function visit(energy,rate,used2){
    if(max!==null&&path.length>max*10)return;
    if(rate===goal&&energy<=cap){
      const dates=mode==='daily-double'&&stock&&!initialLocked(input)?partitions(path,cards,stock):[];
      if(dates!==null){const score=spent15(cards,used);if(!best||energy>best.energy||energy===best.energy&&(score>best.score||score===best.score&&(path.length<best.steps||path.length===best.steps&&mode==='daily-double'&&later(dates,best.dates))))best={energy,score,steps:path.length,dates:dates.slice()};}
    }
    if(blocked(energy,rate,input)||mode==='final-double'&&used2>0||max!==null&&path.length===max*10)return;
    for(let i=0;i<cards.length;i++){
      const c=cards[i];if(!left[i]||rate===c.rate&&energy>45*DAY*rate)continue;
      left[i]--;used[i]++;path.push(i);visit(energy+c.minutes*c.rate,c.rate,used2+Number(c.rate===10));path.pop();used[i]--;left[i]++;
    }
  }
  visit(input.minutes*input.rate,input.rate,0);return best;
}
function validate(input,r,name='case'){
  const cards=cardsOf(input),l=limitsOf(input),goal=target(input),mode=input.mode||'longest',max=budget(input);
  assert.equal(r.mode,mode,`${name}: mode`);assert.equal(r.rate,goal);assert.equal(r.dayCardsOnly,input.dayCardsOnly===true);
  assert.deepEqual(r.limits,l);assert.deepEqual(r.beforeLimits,beforeOf(input));assert.equal(r.initialLocked,initialLocked(input));
  assert.equal(r.initialReplacementBlocked,blocked(input.minutes*input.rate,input.rate,input));assert.equal(r.maxRouteDays,max);
  assert.equal(r.targetDays,goal===10?l.doubleEndDays:null,`${name}: 1.5 has no endpoint hard cap`);
  assert.deepEqual(r.cards.map(({minutes,rate})=>({minutes,rate})),cards.map(({minutes,rate})=>({minutes,rate})));
  if(!r.found){assert.deepEqual(r.route,[]);assert.deepEqual(r.days,[]);return;}
  let energy=input.minutes*input.rate,rate=input.rate;const used=cards.map(()=>0);
  r.route.forEach((step,i)=>{
    const c=cards[step.card];assert(c);assert(!blocked(energy,rate,input),`${name}: current multiplier exceeds before-use threshold`);
    assert(!(rate===c.rate&&energy>45*DAY*rate),`${name}: same-rate restriction`);assert(++used[step.card]<=input.counts[step.card]);
    if(input.dayCardsOnly===true)assert.notEqual(c.minutes,5);
    energy+=c.minutes*c.rate;rate=c.rate;assert.equal(step.minutes,energy/rate);assert.equal(step.rate,rate);
    if(mode==='final-double'&&c.rate===10)assert.equal(i,r.route.length-1);
  });
  assert.equal(rate,goal);assert.equal(r.minutes,energy/rate);assert.deepEqual(r.used,used);
  if(goal===10)assert(energy<=Math.round(l.doubleEndDays*100)*DAY*10/100);
  assert.deepEqual(r.days.flatMap(d=>d.steps),r.route);assert.equal(r.days.length,Math.ceil(r.route.length/10));
  if(max!==null)assert(r.days.length<=max);
  const dates=[];
  r.days.forEach((day,i)=>{
    assert.equal(day.day,i+1);assert(day.steps.length>0&&day.steps.length<=10);day.steps.forEach(s=>assert.equal(s.day,day.day));
    const ends=cards[day.steps[day.steps.length-1].card].rate===10;assert.equal(day.endsWithDouble,ends);if(ends)dates.push(day.day);
    if(mode==='daily-double'){const twos=day.steps.filter(s=>cards[s.card].rate===10);assert(twos.length<=1);if(twos.length)assert.equal(twos[0],day.steps[day.steps.length-1]);}
  });
  assert.equal(r.doubleEndingDays,dates.length);
  const used2=doubleCount(cards,used),stock=doubleCount(cards,inventory(input));
  if(mode==='final-double')assert(used2<=1);
  if(mode==='daily-double'&&stock&&!initialLocked(input)){assert.equal(used2,Math.min(stock,r.days.length));assert.equal(cards[r.route[r.route.length-1].card].rate,10);}
  if(initialLocked(input))assert.equal(r.route.length,0);
  return dates;
}
function compare(input,name){
  const before=JSON.stringify(input),r=solve(input),e=oracle(input);assert.equal(JSON.stringify(input),before,`${name}: immutable input`);assert(r.complete,`${name}: tiny search incomplete`);
  const dates=validate(input,r,name);assert.equal(r.found,!!e,`${name}: found`);
  if(e){assert.equal(r.minutes*r.rate,e.energy,`${name}: final duration`);assert.equal(spent15(cardsOf(input),r.used),e.score,`${name}: 1.5 consumption`);assert.equal(r.route.length,e.steps,`${name}: operation count`);if(input.mode==='daily-double')assert.deepEqual(dates,e.dates);}
  return r;
}
function run(){
  // Every exact boundary can be used; a one-minute excess cannot be used.
  for(const [rate,days,nextRate]of [[1,770,5],[2,390,5],[3,263,5],[5,162,10],[10,45,5]]){
    const exact={minutes:days*DAY,rate,cards:[{minutes:DAY,rate:nextRate}],counts:[1]};
    const at=compare(exact,`rate-${rate} exact before threshold`);assert(at.found);assert.equal(at.route.length,1);
    const over=compare({...exact,minutes:days*DAY+1},`rate-${rate} beyond before threshold`);
    assert(over.initialReplacementBlocked);assert.equal(over.route.length,0);
    if(rate===10){assert(over.found);assert.equal(over.minutes,days*DAY+1);}else if(rate===5){assert(!over.found);assert.equal(over.reason,'replacement-limit');}else assert(!over.found);
  }
  const overshoot=compare({minutes:770*DAY,rate:1,cards:[{minutes:14*DAY,rate:5},{minutes:DAY,rate:5}],counts:[1,1]},'overshoot 1.5 threshold is a valid endpoint');
  assert.equal(overshoot.minutes,168*DAY);assert.equal(overshoot.route.length,1);assert.equal(overshoot.used[0],1);
  const hold=compare({minutes:170*DAY,rate:5,cards:[{minutes:DAY,rate:1}],counts:[1]},'already over-threshold 1.5 can be kept at zero operations');
  assert(hold.found);assert(hold.initialReplacementBlocked);assert.equal(hold.minutes,170*DAY);assert.equal(hold.route.length,0);
  const dead13=compare({minutes:160*DAY,rate:5,cards:[{minutes:DAY,rate:3},{minutes:DAY,rate:10}],counts:[1,1]},'generated 1.3 overshoot cannot continue to double');
  assert.equal(dead13.minutes,81*DAY);assert.equal(dead13.used[0],0);
  const dead12=compare({minutes:263*DAY,rate:3,cards:[{minutes:DAY,rate:2},{minutes:DAY,rate:10}],counts:[1,1]},'generated 1.2 overshoot cannot continue');
  assert.equal(dead12.minutes,799*DAY/10);assert.equal(dead12.used[0],0);
  const fractional=compare({minutes:789*DAY-14,rate:1,cards:[{minutes:5,rate:3},{minutes:DAY,rate:10}],counts:[1,1],limits:{rate11Days:800}},'fractional-minute generated 1.3 threshold excess');
  assert.equal(fractional.used[0],0);
  for(const rate of [1,2,3,5]){
    const same=compare({minutes:45*DAY+1,rate,cards:[{minutes:DAY,rate},{minutes:DAY,rate:10}],counts:[1,1]},`same-rate >45 still forbidden at rate-${rate}`);
    assert.equal(same.used[0],0);
  }
  console.log('PASS: exact and exceeded before-replacement limits for all five rates, valid overshoot endpoints, fractional boundaries and retained same-rate rule.');
}
if(require.main===module)run();
module.exports={assert,solve,CARDS,DAY,DEFAULTS,cardsOf,limitsOf,beforeOf,blocked,initialLocked,inventory,doubleCount,target,budget,spent15,oracle,validate,compare};
