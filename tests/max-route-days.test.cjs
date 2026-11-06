'use strict';
const {assert,solve,DAY,compare,validate}=require('./before-replacement-limits.test.cjs');
const simple={minutes:0,rate:5,cards:[{minutes:5,rate:5}],counts:[11]};
for(const maxRouteDays of [undefined,null,'','   ',9999])assert.equal(compare({...simple,maxRouteDays},'unlimited normalization').minutes,55);
for(const maxRouteDays of [0,-1,1.5,10000,NaN,Infinity,'1',true,false,[],{}])assert.throws(()=>solve({...simple,maxRouteDays}),/路线最大天数/);
for(const mode of ['longest','final-double','daily-double']){
  const one=compare({...simple,mode,maxRouteDays:1},`${mode}: one day`),two=compare({...simple,mode,maxRouteDays:2},`${mode}: two days`);
  assert.equal(one.minutes,50);assert.equal(one.route.length,10);assert.equal(two.minutes,55);assert.equal(two.route.length,11);
  const input={minutes:0,rate:2,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10}],counts:[20,1],mode};
  const a=compare({...input,maxRouteDays:1},`${mode}: reserve final slot`),b=compare({...input,maxRouteDays:2},`${mode}: more operations on second day`);
  assert.equal(a.used[0],9);assert.equal(a.used[1],1);assert.equal(b.used[0],19);assert.equal(b.used[1],1);assert(b.minutes>a.minutes);
  for(const dayCardsOnly of [false,true])compare({...input,maxRouteDays:1,dayCardsOnly},`${mode}: filter and route-day limit`);
}
const early={minutes:0,rate:5,cards:[{minutes:14*DAY,rate:5},{minutes:DAY,rate:2},{minutes:DAY,rate:3},{minutes:7*DAY,rate:10}],counts:[2,2,5,2],mode:'daily-double'};
const earlyOne=compare({...early,maxRouteDays:1},'daily one-day fallback'),earlyTwo=compare({...early,maxRouteDays:2},'daily real early first-day close');
assert(earlyTwo.minutes>earlyOne.minutes);assert.equal(earlyTwo.route.length,11);assert.deepEqual(earlyTwo.days.map(d=>d.steps.length),[9,2]);assert(earlyTwo.days.every(d=>d.endsWithDouble));
const valuable={minutes:770*DAY,rate:1,cards:[{minutes:7*DAY,rate:10},{minutes:5,rate:2},{minutes:5,rate:3},{minutes:5,rate:10}],counts:[1,3,3,1],mode:'final-double',maxRouteDays:1,limits:{doubleEndDays:84}};
const valuableResult=compare(valuable,'maximize final time rather than number of cards');assert.equal(valuableResult.minutes,84*DAY);assert.equal(valuableResult.route.length,1);
assert(valuableResult.minutes>DAY,'operation days and final multiplier duration are different quantities');
const cannotConvert=compare({minutes:391*DAY,rate:2,cards:[{minutes:DAY,rate:5}],counts:[1],maxRouteDays:1},'replacement-block reason takes priority over route-day limit');
assert(!cannotConvert.found);assert.equal(cannotConvert.reason,'replacement-limit');
const noCards={minutes:0,rate:2,cards:[],counts:[]};assert.equal(compare({...noCards,maxRouteDays:1},'no feasible conversion within limit').reason,'day-limit');assert.equal(solve(noCards).reason,'no-route');
for(const mode of ['longest','final-double','daily-double']){
  const locked=compare({minutes:60*DAY,rate:10,cards:[],counts:[],mode,maxRouteDays:1},`${mode}: initial double needs zero days`);assert(locked.found);assert.equal(locked.days.length,0);
  const held=compare({minutes:200*DAY,rate:5,cards:[{minutes:DAY,rate:1}],counts:[1],mode,maxRouteDays:1},`${mode}: blocked 1.5 remains a valid zero-day endpoint`);assert(held.found);assert.equal(held.route.length,0);assert.equal(held.minutes,200*DAY);
}
assert.equal(solve({minutes:89*DAY,rate:10,cards:[],counts:[],maxRouteDays:1}).reason,'locked-above-limit');
assert.equal(solve({minutes:500*DAY,rate:2,cards:[{minutes:DAY,rate:10}],counts:[1],maxRouteDays:1}).reason,'energy-limit');
let seed=0x8917b;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>16)%n;}
const all=[5,DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
for(let i=0;i<65;i++){
  const pool=all.slice(),cards=[];for(let n=1+rand(6);n--;)cards.push(pool.splice(rand(pool.length),1)[0]);
  const input={minutes:i%3===0?rand(150):rand(420*DAY),rate:[1,2,3,5,10][rand(5)],cards,counts:cards.map(()=>rand(2)),dayCardsOnly:i%3===0,maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`route-budget-oracle-${i}-${mode}`);
}
for(let i=0;i<10;i++){
  const cards=[{minutes:5,rate:2},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts=[8+rand(4),1,1];
  for(const mode of ['longest','final-double','daily-double'])for(const maxRouteDays of [1,2])compare({minutes:rand(120),rate:2,cards,counts,mode,maxRouteDays},`multi-day-${i}-${mode}-${maxRouteDays}`);
}
const nativeNow=Date.now;
try{
  for(const mode of ['longest','final-double','daily-double']){
    let calls=0;Date.now=()=>calls++?30000:0;
    const input={minutes:0,rate:5,cards:all,counts:all.map(()=>2),mode,maxRouteDays:1},r=solve(input);
    assert.equal(r.complete,false,`${mode}: force incomplete search`);assert(r.found);validate(input,r,`${mode}: partial result obeys day budget`);assert(r.days.length<=1);
  }
}finally{Date.now=nativeNow;}
console.log('PASS: route-day budgets with before-use thresholds, early daily closes, terminal overshoots, independent oracle comparisons and bounded partial results.');
