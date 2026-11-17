const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const ctx={window:{},Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/xcoin-storage.js','utf8'),ctx);
const {compactEntries,compactDocument}=ctx.window.DaymakerXCoinStorage;
const clean=v=>JSON.parse(JSON.stringify(v));
const day='2026-11-16';
const entry=(id,date,cents,note='private individual note')=>({id,date,amountCents:cents,note});
const base=[{id:'opening',kind:'opening',date:'2026-11-01',amountCents:-120000},entry('a','2026-11-14',-50000),entry('b','2026-11-15',40000),entry('c','2026-11-15',-10000),entry('d',day,70000),entry('e',day,-20000),entry('f',day,10000),entry('future','2026-11-17',101)];
const balance=xs=>xs.reduce((sum,x)=>sum+x.amountCents,0);
const months=xs=>xs.reduce((m,x)=>{if(x.kind!=='opening')m[x.date.slice(0,7)]=(m[x.date.slice(0,7)]||0)+x.amountCents;return m;},{});
test('past transactions become one daily record; today, future and opening stay intact',()=>{
 const before=JSON.stringify(base),next=compactEntries(base,day),s=next.find(x=>x.date==='2026-11-15');
 assert.equal(next.length,7);assert.equal(s.kind,'daily');assert.equal(s.amountCents,30000);assert.equal(s.inCents,40000);assert.equal(s.outCents,10000);
 assert.equal(s.id,'xcoin-day:2026-11-15');assert.deepEqual(clean(s.sourceIds),['b','c']);assert.ok(!('note' in s));
 assert.equal(next.find(x=>x.id==='d'),base[4]);assert.equal(next.find(x=>x.id==='opening'),base[0]);assert.equal(next.find(x=>x.id==='future'),base[7]);assert.equal(JSON.stringify(base),before);
 assert.equal(balance(next),balance(base));assert.deepEqual(months(next),months(base));
});
test('compaction is idempotent and strips individual metadata',()=>{
 const next=compactEntries(base,day);assert.equal(compactEntries(next,day),next);
 for(const s of next.filter(x=>x.kind==='daily'))assert.deepEqual(Object.keys(s).sort(),['amountCents','date','id','inCents','kind','outCents','sourceIds']);
});
test('local midnight and year/month rollover preserve exact cents and zero days',()=>{
 const xs=[entry('one','2026-12-31',101),entry('two','2026-12-31',-101)];
 assert.equal(compactEntries(xs,'2026-12-31'),xs);
 const n=compactEntries(xs,'2027-01-01');assert.equal(n.length,1);assert.equal(n[0].amountCents,0);assert.equal(n[0].inCents,101);assert.equal(n[0].outCents,101);
 const tomorrow=compactEntries(base,'2026-11-17');assert.equal(tomorrow.filter(x=>x.date===day).length,1);assert.equal(balance(tomorrow),balance(base));
});
test('stale raw entries cannot double count an already saved daily result',()=>{
 const next=compactEntries(base,day);const replay=[...next,base[2],base[3]];const compacted=compactEntries(replay,day);
 assert.equal(balance(compacted),balance(next));assert.deepEqual(clean(compacted),clean(next));
});
test('late offline entries add to the existing daily result exactly once',()=>{
 const next=compactEntries(base,day),late=entry('late','2026-11-15',777);
 const result=compactEntries([...next,late],day),s=result.find(x=>x.date==='2026-11-15');assert.equal(s.amountCents,30777);assert.equal(s.inCents,40777);
 assert.equal(balance(result),balance(next)+777);assert.deepEqual(clean(compactEntries([...result,late],day)),clean(result));
});
test('a day already sealed on another device does not discard new entries after a timezone change',()=>{
 const next=compactEntries(base,day),late=entry('late-same-local-day','2026-11-15',500);
 const result=compactEntries([...next,late],'2026-11-15');assert.equal(balance(result),balance(next)+500);assert.equal(result.find(x=>x.date==='2026-11-15').amountCents,30500);
});
test('summary IDs and coverage are deterministic for the same source records',()=>{
 const a=compactEntries(base,day).find(x=>x.date==='2026-11-15');const b=compactEntries([...base].reverse(),day).find(x=>x.date==='2026-11-15');assert.deepEqual(clean(a),clean(b));
});
test('other collections and settings are unchanged',()=>{
 const doc={profileName:'Example',rate:220,shifts:[{id:'work'}],expenses:[{id:'bill'}],wishes:[{id:'wish'}],gamblingEntries:base};const result=compactDocument(doc,day);
 assert.equal(result.shifts,doc.shifts);assert.equal(result.expenses,doc.expenses);assert.equal(result.wishes,doc.wishes);assert.equal(result.profileName,doc.profileName);
 assert.equal(compactDocument(result,day),result);
});
test('invalid records are preserved, unsafe totals and inconsistent daily summaries fail without mutation',()=>{
 const bad=[entry('broken','2026-02-30',10),{id:'nan',date:'2026-01-01',amountCents:NaN}];assert.equal(compactEntries(bad,day),bad);
 const tooBig=[entry('a','2026-01-01',Number.MAX_SAFE_INTEGER),entry('b','2026-01-01',1)];const snapshot=JSON.stringify(tooBig);assert.throws(()=>compactEntries(tooBig,day),/too large/);assert.equal(JSON.stringify(tooBig),snapshot);
 const corrupt=[{id:'x',kind:'daily',date:'2026-11-15',amountCents:100,inCents:80,outCents:10,sourceIds:[]}];assert.throws(()=>compactEntries(corrupt,day),/needs review/);
 assert.throws(()=>compactEntries([entry('same','2026-01-01',10),entry('same','2026-01-01',20)],day),/ID needs review/);
});
test('daily storage removes transaction objects and reduces a busy day payload',()=>{
 const xs=Array.from({length:100},(_,i)=>entry('00000000-0000-4000-8000-'+String(i).padStart(12,'0'),'2026-11-15',i%2?15000:-10000));
 const next=compactEntries(xs,day);assert.equal(next.length,1);assert.ok(JSON.stringify(next).length<JSON.stringify(xs).length*.5);assert.equal(balance(next),balance(xs));
});
test('app balances, In/Out totals, charts and zero-result rows accept daily records',()=>{
 const app=fs.readFileSync(root+'/src/app.js','utf8');
 const a={window:{},Intl,Date,dateKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,esc:String,longDate:String};vm.createContext(a);
 vm.runInContext(app.slice(app.indexOf('const gamblingMoney ='),app.indexOf('function renderGambling()'))+'\nwindow.financialTest={gamblingTotals,gamblingTodayTotals,gamblingMonthlyResults,gamblingTransactionRow};',a);
 const api=a.window.financialTest,after=compactEntries(base,'2026-11-17');
 assert.deepEqual(clean(api.gamblingTotals(after)),clean(api.gamblingTotals(base)));
 const through=new Date(2026,10,16);assert.deepEqual(clean(api.gamblingMonthlyResults(after,through)),clean(api.gamblingMonthlyResults(base,through)));
 assert.deepEqual(clean(api.gamblingTodayTotals(after,day)),{balance:60000,incoming:80000,outgoing:20000});
 const row=api.gamblingTransactionRow({id:'zero',kind:'daily',date:day,amountCents:0,inCents:100,outCents:100,sourceIds:['a','b']});assert.match(row,/Daily result/);assert.ok(!row.includes('−0,00'));assert.ok(!row.includes('expense-amount'));
});


test('X-Coin day changes at 06:00 local time, including month and year boundaries',()=>{
 const {xcoinDay}=ctx.window.DaymakerXCoinStorage;
 assert.equal(xcoinDay(new Date(2026,10,17,0,0)), '2026-11-16');
 assert.equal(xcoinDay(new Date(2026,10,17,5,59)), '2026-11-16');
 assert.equal(xcoinDay(new Date(2026,10,17,6,0)), '2026-11-17');
 assert.equal(xcoinDay(new Date(2027,0,1,5,59)), '2026-12-31');
 assert.equal(xcoinDay(new Date(2027,0,1,6,0)), '2027-01-01');
 const entries=[entry('late','2026-11-16',100),entry('later','2026-11-16',-30)];
 assert.equal(compactEntries(entries,xcoinDay(new Date(2026,10,17,5,59))),entries);
 const compacted=compactEntries(entries,xcoinDay(new Date(2026,10,17,6,0)));
 assert.equal(compacted.length,1);assert.equal(compacted[0].amountCents,70);
});
