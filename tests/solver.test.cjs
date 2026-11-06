'use strict';
const {assert,solve,CARDS,DAY,compare,doubleCount}=require('./before-replacement-limits.test.cjs');
const allCards=[5,DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
const table=compare({minutes:0,rate:5,cards:allCards,counts:allCards.map(()=>0)},'19 available card types');
assert.equal(table.cards.length,19);
for(let i=0;i<allCards.length;i++){
  const c=allCards[i],cards=c.minutes===5&&c.rate===5?[c]:[c,{minutes:5,rate:5}],counts=cards.length===1?[2]:[1,1];
  for(const mode of ['longest','final-double','daily-double'])compare({minutes:0,rate:5,cards,counts,mode},`combination-${i}-${mode}`);
}
const noImplicitCap=compare({minutes:300*DAY,rate:2,cards:[{minutes:DAY,rate:5}],counts:[1]},'1.2 uses its 390-day before limit');
assert.equal(noImplicitCap.minutes,121*DAY);
assert(!compare({minutes:391*DAY,rate:2,cards:[{minutes:DAY,rate:5}],counts:[1]},'1.2 cannot replace above 390 days').found);
for(const mode of ['longest','final-double','daily-double']){
  const r=compare({minutes:0,rate:5,cards:[{minutes:5,rate:10},{minutes:DAY,rate:10},{minutes:7*DAY,rate:10}],counts:[1,1,1],mode},`aggregate double inventory-${mode}`);
  if(mode!=='longest'){assert.equal(r.minutes,7*DAY);assert.equal(r.route.length,1);assert.equal(doubleCount(r.cards,r.used),1);}
}
const smaller=compare({minutes:160*DAY,rate:5,cards:[{minutes:7*DAY,rate:10},{minutes:DAY,rate:10}],counts:[1,1],mode:'final-double',limits:{doubleEndDays:84}},'choose shorter double card to fit endpoint cap');
assert.equal(smaller.minutes,81*DAY);assert.equal(smaller.used[0],0);
const mixedDaily=compare({minutes:0,rate:2,cards:[{minutes:DAY,rate:10},{minutes:7*DAY,rate:10},{minutes:5,rate:5}],counts:[1,1,10],mode:'daily-double'},'multiple double durations across compact days');
assert.equal(mixedDaily.route.length,12);assert.equal(mixedDaily.days.length,2);assert(mixedDaily.days.every(d=>d.endsWithDouble));
for(const mode of ['longest','final-double','daily-double']){
  const cards=Object.freeze(allCards.map(c=>Object.freeze({...c}))),counts=Object.freeze(allCards.map(c=>c.minutes===5?1:0));
  const input=Object.freeze({minutes:0,rate:5,cards,counts,mode,dayCardsOnly:true});
  const filtered=compare(input,`all minute types filtered-${mode}`);assert(!filtered.hasDouble);assert.equal(filtered.route.length,0);
  const enabled=compare({...input,dayCardsOnly:false},`minute cards enabled-${mode}`);assert(enabled.hasDouble);assert.equal(enabled.rate,10);
  assert(enabled.used.some(n=>n>0));assert.deepEqual(counts,allCards.map(c=>c.minutes===5?1:0));
  assert.equal(solve({...input,dayCardsOnly:'true'}).dayCardsOnly,false);
}
for(const qty of [0,1])for(const mode of ['longest','final-double','daily-double'])assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:14*DAY,rate:10}],counts:[qty],mode}),/2倍卡时长最多7天/);
assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:2},{minutes:DAY,rate:2}],counts:[1,2]}),/重复/);
assert.throws(()=>solve({minutes:0,rate:5,cards:allCards.concat(allCards[0]),counts:Array(20).fill(0)}));
for(const cards of [[{minutes:10,rate:2}],[{minutes:DAY,rate:4}]])assert.throws(()=>solve({minutes:0,rate:5,cards,counts:[1]}));
for(const counts of [[],[-1],[1.2],[10000]])assert.throws(()=>solve({minutes:0,rate:5,cards:[{minutes:DAY,rate:2}],counts}));
compare({minutes:0,rate:5,cards:[],counts:[]},'empty card table');
const labelInput={minutes:0,rate:5,cards:[{minutes:DAY,rate:2,label:'ignored input'}],counts:[1]};
assert.equal(solve(labelInput).cards[0].label,'+1天1.2倍');assert.equal(labelInput.cards[0].label,'ignored input');
assert.equal(CARDS.length,7);
for(const mode of ['longest','final-double','daily-double'])compare({minutes:3*DAY+5,rate:5,counts:[1,1,1,1,1,1,1],mode},`legacy input form-${mode}`);
let seed=0x17d291;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>16)%n;}
for(let i=0;i<90;i++){
  const available=allCards.slice(),cards=[];for(let n=1+rand(6);n--;)cards.push(available.splice(rand(available.length),1)[0]);
  const input={minutes:i%3===0?rand(100):rand(420*DAY),rate:[1,2,3,5,10][rand(5)],cards,counts:cards.map(()=>rand(2)),dayCardsOnly:i%4===0};
  for(const mode of ['longest','final-double','daily-double'])compare({...input,mode},`card-oracle-${i}-${mode}`);
}
console.log('PASS: dynamic 19-card catalog, aggregate double strategies, minute filtering, legacy inputs and 270 independent before-limit mode comparisons.');
