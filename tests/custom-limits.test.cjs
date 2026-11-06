'use strict';
// All fixtures are synthetic. Thresholds apply before replacement; the only
// separate final-duration hard ceiling is the configurable double endpoint.
const {assert,solve,DAY,DEFAULTS,compare}=require('./before-replacement-limits.test.cjs');
const empty={minutes:0,rate:5,cards:[],counts:[]};
assert.deepEqual(DEFAULTS,{rate11Days:770,rate12Days:390,rate13Days:263,rate15Days:162,doubleBeforeDays:45,doubleEndDays:88});
for(const limits of [undefined,null,{},Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,null])),Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,'  ']))]){
  const r=compare({...empty,limits},'default or empty advanced settings');assert.deepEqual(r.limits,DEFAULTS);
}
for(const [key,rate,initialDays,raised,nextRate,expectedDays]of [
  ['rate11Days',1,800,810,5,161],
  ['rate12Days',2,400,410,5,161],
  ['rate13Days',3,270,280,5,163],
  ['rate15Days',5,170,180,10,86]
]){
  const input={minutes:initialDays*DAY,rate,cards:[{minutes:DAY,rate:nextRate}],counts:[1],limits:{doubleEndDays:100}};
  const blocked=compare(input,`${key}: default before threshold blocks conversion`);assert(!blocked.found);assert.equal(blocked.reason,'replacement-limit');
  const raisedResult=compare({...input,limits:{[key]:raised,doubleEndDays:100}},`${key}: custom threshold allows conversion`);
  assert.equal(raisedResult.minutes,expectedDays*DAY);assert.equal(raisedResult.route.length,1);assert.equal(raisedResult.initialReplacementBlocked,false);
}
const held=compare({minutes:170*DAY,rate:5,cards:[{minutes:DAY,rate:1}],counts:[1],limits:{rate15Days:100}},'lower 1.5 before threshold still permits retaining the current target state');
assert(held.found);assert.equal(held.minutes,170*DAY);assert.equal(held.route.length,0);assert(held.initialReplacementBlocked);
// Incoming 1.5 results may exceed its before threshold, which is not an end cap.
for(const rate15Days of [0.01,154,162,170]){
  const r=compare({minutes:770*DAY,rate:1,cards:[{minutes:14*DAY,rate:5}],counts:[1],limits:{rate15Days}},`incoming 168-day 1.5 endpoint with before cap ${rate15Days}`);
  assert.equal(r.minutes,168*DAY);assert.equal(r.targetDays,null);
}
const bridge={minutes:153*DAY,rate:5,cards:[{minutes:14*DAY,rate:1},{minutes:14*DAY,rate:5}],counts:[1,1]};
const originalBridge=compare(bridge,'default 1.1 before threshold blocks returning from overshoot');
const customBridge=compare({...bridge,limits:{rate11Days:800}},'raised 1.1 before threshold enables returning to 1.5');
assert.equal(originalBridge.minutes,153*DAY);assert.equal(customBridge.minutes,849*DAY/5);assert(customBridge.minutes>162*DAY);

// doubleBeforeDays controls replacement eligibility, not the independent
// >45-day SAME-rate ban and not the double endpoint ceiling.
const fifty={minutes:50*DAY,rate:10,cards:[{minutes:DAY,rate:10},{minutes:DAY,rate:5}],counts:[1,1]};
const originallyLocked=compare(fifty,'default 45-day double before threshold');assert(originallyLocked.initialLocked);assert.equal(originallyLocked.route.length,0);
for(const mode of ['longest','final-double','daily-double']){
  const r=compare({...fifty,mode,limits:{doubleBeforeDays:60}},`${mode}: 50-day 2x can change multiplier with before limit 60`);
  assert(!r.initialLocked);assert.equal(r.minutes,51.5*DAY);assert.deepEqual(r.route.map(s=>s.card),[1,0]);
}
const shorterBefore=compare({minutes:45*DAY,rate:10,cards:[{minutes:DAY,rate:5}],counts:[1],limits:{doubleBeforeDays:40}},'lower double before threshold locks without invalidating current endpoint');
assert(shorterBefore.initialLocked);assert.equal(shorterBefore.minutes,45*DAY);assert.equal(shorterBefore.route.length,0);
const same15=compare({minutes:170*DAY,rate:5,cards:[{minutes:DAY,rate:5},{minutes:DAY,rate:10}],counts:[1,1],limits:{rate15Days:200,doubleEndDays:100}},'raising before threshold never relaxes same-rate 45-day restriction');
assert.equal(same15.used[0],0);assert.equal(same15.minutes,86*DAY);

// Fractional thresholds are checked against the pre-card energy exactly.
const eleven={minutes:67,rate:1,cards:[{minutes:5,rate:1},{minutes:5,rate:5}],counts:[2,1],limits:{rate11Days:0.05}};
const exact11=compare(eleven,'exact decimal 1.1 before threshold');assert.equal(exact11.minutes,19.4);assert.equal(exact11.used[0],1);
assert.equal(compare({...eleven,minutes:68},'one-minute excess prevents returning through 1.1').used[0],0);
const fifteen={minutes:335,rate:1,cards:[{minutes:5,rate:5}],counts:[2],limits:{rate15Days:0.05}};
assert.equal(compare(fifteen,'exact decimal 1.5 before threshold allows one final overshoot').minutes,77);
assert.equal(compare({...fifteen,minutes:336},'fractional overshoot is a valid endpoint but cannot continue').minutes,72.2);
const tiny=compare({minutes:0,rate:5,cards:[{minutes:5,rate:5}],counts:[5],limits:{rate15Days:0.01}},'minimum threshold is checked before, not after the final card');assert.equal(tiny.minutes,15);assert.equal(tiny.used[0],3);
for(const [key,rate]of [['rate12Days',2],['rate13Days',3]]){
  const input={minutes:72,rate,cards:[{minutes:5,rate:5}],counts:[1],limits:{[key]:0.05}};
  assert(compare(input,`${key}: exact 72-minute threshold`).found);assert(!compare({...input,minutes:73},`${key}: exceeded 72-minute threshold`).found);
}
const doubleDecimal=compare({minutes:72,rate:10,cards:[{minutes:5,rate:5}],counts:[1],limits:{doubleBeforeDays:0.05}},'double exact decimal before threshold can still convert');assert.equal(doubleDecimal.rate,5);assert.equal(doubleDecimal.minutes,149);
const doubleDecimalOver=compare({minutes:73,rate:10,cards:[{minutes:5,rate:5}],counts:[1],limits:{doubleBeforeDays:0.05}},'double over decimal before threshold keeps locked current endpoint');assert(doubleDecimalOver.initialLocked);assert.equal(doubleDecimalOver.minutes,73);assert.equal(doubleDecimalOver.rate,10);

// Current default double endpoint is 88; explicit former 84 remains supported.
const eightyEight={minutes:162*DAY,rate:5,cards:[{minutes:7*DAY,rate:10}],counts:[1],mode:'final-double'};
assert.equal(compare(eightyEight,'default 88-day double endpoint').minutes,88*DAY);
assert(!compare({...eightyEight,limits:{doubleEndDays:84}},'explicit 84-day double endpoint').found);
const aboveDefault={minutes:166*DAY,rate:5,cards:[{minutes:7*DAY,rate:10}],counts:[1],limits:{rate15Days:170}};
assert(!compare(aboveDefault,'90-day endpoint exceeds default 88').found);
assert.equal(compare({...aboveDefault,limits:{rate15Days:170,doubleEndDays:92}},'custom double endpoint permits 90 days').minutes,90*DAY);
const lowerEnd=compare({minutes:154*DAY,rate:5,cards:[{minutes:7*DAY,rate:10},{minutes:DAY,rate:10}],counts:[1,1],mode:'final-double',limits:{doubleEndDays:80}},'lower double endpoint selects a shorter card');assert.equal(lowerEnd.minutes,78*DAY);assert.equal(lowerEnd.used[0],0);
const locked89={minutes:89*DAY,rate:10,cards:[{minutes:DAY,rate:5}],counts:[1],maxRouteDays:1};
assert.equal(compare(locked89,'locked initial above current end ceiling').reason,'locked-above-limit');
const kept89=compare({...locked89,limits:{doubleEndDays:90}},'raised endpoint keeps locked initial but never reopens it');assert.equal(kept89.minutes,89*DAY);assert.equal(kept89.route.length,0);
const exactEnd={minutes:670,rate:1,cards:[{minutes:5,rate:10}],counts:[1],limits:{doubleEndDays:0.05}};
assert.equal(compare(exactEnd,'exact decimal double endpoint').minutes,72);assert(!compare({...exactEnd,minutes:671},'decimal double endpoint excess').found);

for(const key of Object.keys(DEFAULTS)){
  for(const value of [0.01,0.29,1.23,99999])assert.equal(compare({...empty,limits:{[key]:value}},`${key}: valid decimal`).limits[key],value);
  for(const value of [0,-1,0.001,1.231,99999.01,NaN,Infinity,'154',true,[],{}])assert.throws(()=>solve({...empty,limits:{[key]:value}}),/上限须为0.01～99999天/);
}
for(const limits of ['',[],true,1])assert.throws(()=>solve({...empty,limits}),/倍率上限设置无效/);
const all=[5,DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:14*DAY,rate:10}],counts:[0],limits:{doubleEndDays:99999}}),/2倍卡时长最多7天/);
for(const mode of ['longest','final-double','daily-double'])for(const dayCardsOnly of [false,true])for(const maxRouteDays of [1,2]){
  const r=compare({minutes:0,rate:5,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10}],counts:[11,1],mode,dayCardsOnly,maxRouteDays,limits:{rate11Days:0.29,rate12Days:1,rate13Days:1,rate15Days:0.1,doubleBeforeDays:60,doubleEndDays:90}},`${mode}: advanced settings × filter × route days`);
  assert.equal(r.used[0],dayCardsOnly?0:maxRouteDays===1?9:11);
}
const immutable=Object.freeze({minutes:0,rate:5,cards:Object.freeze([{minutes:DAY,rate:5}].map(Object.freeze)),counts:Object.freeze([1]),limits:Object.freeze({rate11Days:0.29,rate12Days:390,rate13Days:263,rate15Days:162.25,doubleBeforeDays:60,doubleEndDays:88}),mode:'longest'});
compare(immutable,'frozen advanced configuration');
let seed=0x7816c;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>16)%n;}
const choices=[0.01,0.05,0.29,1,10,45,60,100,154,162,263,390,770,1000];
for(let i=0;i<80;i++){
  const pool=all.slice(),cards=[];for(let n=1+rand(6);n--;)cards.push(pool.splice(rand(pool.length),1)[0]);
  const limits=Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,choices[rand(choices.length)]]));
  const input={minutes:i%3===0?rand(200):rand(420*DAY),rate:[1,2,3,5,10][rand(5)],cards,counts:cards.map(()=>rand(2)),limits,dayCardsOnly:i%4===0,maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`advanced-oracle-${i}-${mode}`);
}
for(let i=0;i<10;i++){
  const input={minutes:rand(20),rate:2,cards:[{minutes:5,rate:5},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts:[8+rand(4),1,1],limits:{rate11Days:0.29,rate12Days:1,rate13Days:1,rate15Days:[0.03,0.05,0.1][rand(3)],doubleBeforeDays:45,doubleEndDays:[0.05,7,84,88,90][rand(5)]},maxRouteDays:1+rand(2)};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`advanced-multi-day-${i}-${mode}`);
}
console.log('PASS: all five configurable before-use thresholds, default 88-day double endpoint, decimal boundaries, same-rate 45 rule and 270 independent advanced-setting mode comparisons.');
