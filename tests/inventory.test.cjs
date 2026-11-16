const assert=require('node:assert/strict');
const inventory=require('../inventory.js');
const raw=Object.freeze([Object.freeze({minutes:1440,rate:2,count:2}),Object.freeze({minutes:1440,rate:2,count:5}),Object.freeze({minutes:5,rate:10,count:1})]);
assert.deepEqual(inventory.normalize(raw),{cards:[{minutes:1440,rate:2},{minutes:5,rate:10}],counts:[7,1]});
assert.equal(raw[0].count,2);
assert.throws(()=>inventory.normalize([{minutes:1440,rate:2,count:9999},{minutes:1440,rate:2,count:1}]),/9999/);
assert.deepEqual(inventory.normalize([]),{cards:[],counts:[]});
assert.throws(()=>inventory.normalize([{minutes:1440,rate:2,count:1.5}]));
const legacy={minutes:25,rate:2,mode:'daily-double',maxRouteDays:2,dayCardsOnly:true,counts:[1,0,2,0,0,3,0]};
const restored=inventory.restore(legacy);
assert.equal(restored.minutes,25);assert.equal(restored.rate,2);assert.equal(restored.mode,'daily-double');assert.equal(restored.maxRouteDays,2);assert.equal(restored.dayCardsOnly,true);
assert.deepEqual(restored.cards,[inventory.LEGACY_CARDS[0],inventory.LEGACY_CARDS[2],inventory.LEGACY_CARDS[5]]);assert.deepEqual(restored.counts,[1,2,3]);
assert.equal(inventory.label({minutes:1440,rate:2}),'+1天1.2倍');
assert.equal(inventory.restore(null),null);
assert.equal(inventory.restore({minutes:0,counts:[1]}),null);

assert.throws(()=>inventory.normalize([{minutes:20160,rate:10,count:1}]),/7天/);
const review=inventory.restore({minutes:25,rate:5,cards:[{minutes:20160,rate:10},{minutes:1440,rate:5}],counts:[1,2]});
assert(review.needsCardReview);assert.deepEqual(review.counts,[1,2]);

// Three-day rows merge by duration+rate, preserving quantity and saved settings.
const DAY=1440;
const threeDayRows=Object.freeze([Object.freeze({minutes:3*DAY,rate:5,count:2}),Object.freeze({minutes:3*DAY,rate:5,count:5}),Object.freeze({minutes:3*DAY,rate:10,count:1})]);
const threeDay=inventory.normalize(threeDayRows);
assert.deepEqual(threeDay,{cards:[{minutes:3*DAY,rate:5},{minutes:3*DAY,rate:10}],counts:[7,1]});
assert.equal(threeDayRows[0].count,2);assert.equal(inventory.label(threeDay.cards[0]),'+3天1.5倍');
const threeDaySaved={minutes:30,rate:5,cards:threeDay.cards,counts:threeDay.counts,mode:'daily-double',maxRouteDays:2,dayCardsOnly:true};
const threeDayRestored=inventory.restore(threeDaySaved);
assert.deepEqual(threeDayRestored.cards,threeDay.cards);assert.deepEqual(threeDayRestored.counts,[7,1]);assert.equal(threeDayRestored.mode,'daily-double');assert.equal(threeDayRestored.maxRouteDays,2);assert.equal(threeDayRestored.dayCardsOnly,true);assert.equal(threeDayRestored.needsCardReview,false);
assert.throws(()=>inventory.normalize([{minutes:3*DAY,rate:5,count:9999},{minutes:3*DAY,rate:5,count:1}]),/9999/);

// All 24 valid combinations survive saved-input migration. A 25th legacy
// fourteen-day double row is restored for review, never silently accepted.
const catalog=[5,DAY,3*DAY,7*DAY,14*DAY].flatMap(minutes=>[1,2,3,5,10].map(rate=>({minutes,rate}))).filter(c=>c.rate!==10||c.minutes<=7*DAY);
assert.equal(catalog.length,24);
const allInventory=inventory.normalize(catalog.map(c=>({...c,count:1})));
assert.deepEqual(allInventory.cards,catalog);assert.deepEqual(allInventory.counts,Array(24).fill(1));
const allRestored=inventory.restore({minutes:0,rate:5,...allInventory});
assert(allRestored);assert.deepEqual(allRestored.cards,catalog);assert.deepEqual(allRestored.counts,Array(24).fill(1));assert.equal(allRestored.needsCardReview,false);
const withLegacy=catalog.concat({minutes:14*DAY,rate:10});
const fullReview=inventory.restore({minutes:0,rate:5,cards:withLegacy,counts:Array(25).fill(1)});
assert(fullReview);assert.equal(fullReview.cards.length,25);assert.equal(fullReview.needsCardReview,true);assert.deepEqual(fullReview.counts,Array(25).fill(1));
assert.throws(()=>inventory.normalize(withLegacy.map(c=>({...c,count:1}))),/7天/);
assert.equal(inventory.restore({minutes:0,rate:5,cards:withLegacy.concat(catalog[0]),counts:Array(26).fill(1)}),null);
console.log('PASS: three-day inventory merging, all 24 saved combinations, legacy review migration and immutable quantities');
