const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const copy=v=>JSON.parse(JSON.stringify(v));
const doc=entries=>({rate:220,paydayDay:25,profileName:'Demo',shifts:[{id:'shift',date:'2026-11-10',hours:6,rate:220}],expenses:[{id:'expense',date:'2026-11-10',amount:399}],monthlyExpenses:[],wishes:[{id:'wish',title:'A wish',target:2000,saved:100}],wishFolders:[],gamblingEntries:entries});
const raw=[{id:'open',kind:'opening',date:'2026-11-01',amountCents:-100000},{id:'a',date:'2026-11-15',amountCents:40000,note:'discard this'},{id:'b',date:'2026-11-15',amountCents:-10000,note:'discard this too'},{id:'today',date:'2026-11-16',amountCents:70000,note:'keep today'}];
function setup(){
 const values=new Map(),elements=new Map(),timers=[];
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const element=key=>{if(!elements.has(key))elements.set(key,{value:'',hidden:false,classList:{toggle(){}},setAttribute(){},addEventListener(){}});return elements.get(key);};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-16T12:00:00']));}static now(){return new Date('2026-11-16T12:00:00').getTime();}}
 const ctx={window:{},localStorage,document:{querySelector:element,hidden:false},navigator:{onLine:true},Date:FixedDate,crypto:{randomUUID:()=> 'backup-test-id'},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/src/xcoin-storage.js','utf8'),ctx);
 let cloud=fs.readFileSync(root+'/src/cloud.js','utf8');cloud=cloud.replace('  window.DaymakerCloud = {','  window.cloudTest = { normalize, merge, sync, setContext(c, id, h) { client = c; owner = id; session = { user: { id } }; hooks = h; } };\n  window.DaymakerCloud = {');vm.runInContext(cloud,ctx);
 return{ctx,values,timers,api:ctx.window.cloudTest,storage:ctx.window.DaymakerXCoinStorage};
}
function initialize(s,baseDoc,localDoc,remoteDoc){
 const id='fake-account',key='daymaker-account-v1:'+id;let shown=copy(localDoc),remote={document:copy(remoteDoc),revision:1};let writes=0,reads=0;let beforeWrite=null;
 s.values.set('daymaker-active-account-v1',id);s.values.set(key,JSON.stringify({local:copy(localDoc),base:copy(baseDoc),revision:1,backups:[]}));
 const client={from(table){assert.equal(table,'daymaker_accounts');return{select(){return{eq(){return{async maybeSingle(){reads++;return{data:copy(remote),error:null};}};}};}};},async rpc(name,args){assert.equal(name,'daymaker_save');writes++;if(beforeWrite){const result=await beforeWrite(args,writes);if(result)return result;}assert.equal(args.p_expected_revision,remote.revision);remote={document:copy(args.p_document),revision:remote.revision+1};return{data:{saved:true,...copy(remote)},error:null};}};
 s.api.setContext(client,id,{read:()=>shown,replace:document=>{shown=document;},closeAccountMenu(){},notify(){}});
 return{key,get remote(){return remote;},set remote(v){remote=v;},get writes(){return writes;},get reads(){return reads;},get shown(){return shown;},set beforeWrite(fn){beforeWrite=fn;},cache:()=>JSON.parse(s.values.get(key))};
}
test('sync writes compacted history even when the visible canonical documents already match',async()=>{
 const s=setup(),original=doc(raw),io=initialize(s,original,original,original);await s.api.sync();
 assert.equal(io.writes,1);assert.equal(io.remote.document.gamblingEntries.length,3);assert.equal(io.remote.document.gamblingEntries.find(e=>e.kind==='daily').amountCents,30000);
 assert.ok(!JSON.stringify(io.remote.document).includes('discard this'));assert.deepEqual(io.remote.document.shifts,original.shifts);assert.deepEqual(io.remote.document.expenses,original.expenses);assert.deepEqual(io.remote.document.wishes,original.wishes);
 assert.deepEqual(copy(io.shown),io.remote.document);assert.deepEqual(io.cache().local,io.cache().base);
 await s.api.sync();assert.equal(io.writes,1,'a normalized record should not rewrite every sync');
});
test('stale raw replay in the database is removed without changing the daily total',async()=>{
 const s=setup(),compacted=copy(s.storage.compactDocument(doc(raw))),remote=copy(compacted);remote.gamblingEntries.push(raw[1],raw[2]);const io=initialize(s,compacted,compacted,remote);await s.api.sync();
 assert.equal(io.writes,1);assert.deepEqual(io.remote.document,compacted);
});
test('local save compacts guest and account data without touching unrelated device keys',()=>{
 const s=setup();s.values.set('unrelated-app','keep');s.ctx.window.DaymakerCloud.save(doc(raw));const guest=JSON.parse(s.values.get('daymark-tracker-v1'));assert.equal(guest.gamblingEntries.filter(e=>e.kind==='daily').length,1);assert.equal(s.values.get('unrelated-app'),'keep');
 const io=initialize(s,doc(raw),doc(raw),doc(raw));s.ctx.window.DaymakerCloud.save(doc(raw));assert.equal(io.cache().local.gamblingEntries.filter(e=>e.kind==='daily').length,1);assert.equal(s.values.get('unrelated-app'),'keep');
});
test('record merge preserves unrelated edits and flags competing edits to one closed day',()=>{
 const s=setup(),base=doc(raw),local=copy(base),remote=copy(base);local.profileName='New name';remote.expenses.push({id:'other-expense',amount:100,date:'2026-11-16'});
 const merged=s.api.merge(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.document.profileName,'New name');assert.equal(merged.document.expenses.length,2);assert.equal(merged.document.gamblingEntries.filter(e=>e.kind==='daily').length,1);
 const a=copy(base),b=copy(base);a.gamblingEntries.push({id:'late-a',date:'2026-11-15',amountCents:500});b.gamblingEntries.push({id:'late-b',date:'2026-11-15',amountCents:700});
 const contested=s.api.merge(base,a,b);assert.equal(contested.conflicts.length,1);assert.match(contested.conflicts[0],/X-Coin 2026-11-15/);
 assert.equal(s.api.merge(base,a,b,'local').document.gamblingEntries.find(e=>e.kind==='daily').amountCents,30500);
 assert.equal(s.api.merge(base,a,b,'remote').document.gamblingEntries.find(e=>e.kind==='daily').amountCents,30700);
});
test('an edit during the save request stays queued and is not discarded by compaction',async()=>{
 const s=setup(),original=doc(raw),io=initialize(s,original,original,original);
 io.beforeWrite=(args,pass)=>{if(pass!==1)return;const cache=io.cache();cache.local.gamblingEntries.push({id:'during-save',date:'2026-11-16',amountCents:123});s.values.set(io.key,JSON.stringify(cache));};
 await s.api.sync();assert.ok(io.cache().local.gamblingEntries.some(e=>e.id==='during-save'));assert.ok(!io.cache().base.gamblingEntries.some(e=>e.id==='during-save'));
 await s.api.sync();assert.ok(io.remote.document.gamblingEntries.some(e=>e.id==='during-save'));assert.deepEqual(io.cache().local,io.cache().base);
});
test('a compare-and-swap retry preserves the other device change and stores daily history',async()=>{
 const s=setup(),original=doc(raw),io=initialize(s,original,original,original);
 io.beforeWrite=(args,pass)=>{if(pass!==1)return;io.remote={revision:2,document:{...copy(original),expenses:[...original.expenses,{id:'other-device',amount:50,date:'2026-11-16'}]}};return{data:{saved:false,...copy(io.remote)},error:null};};
 await s.api.sync();assert.equal(io.writes,2);assert.equal(io.remote.document.expenses.length,2);assert.equal(io.remote.document.gamblingEntries.filter(e=>e.kind==='daily').length,1);
});
test('offline save is compact locally and performs no database request',async()=>{
 const s=setup(),original=doc(raw),io=initialize(s,original,original,original);s.ctx.navigator.onLine=false;s.ctx.window.DaymakerCloud.save(original);await s.api.sync();assert.equal(io.reads,0);assert.equal(io.writes,0);assert.equal(io.cache().local.gamblingEntries.filter(e=>e.kind==='daily').length,1);
});
test('deleting a compacted day remains deleted when syncing with an old raw account document',async()=>{
 const s=setup(),original=doc(raw),compacted=copy(s.storage.compactDocument(original)),local=copy(compacted);local.gamblingEntries=local.gamblingEntries.filter(e=>e.kind!=='daily');
 const io=initialize(s,compacted,local,original);await s.api.sync();assert.equal(io.writes,1);assert.ok(!io.remote.document.gamblingEntries.some(e=>e.date==='2026-11-15'));assert.ok(io.remote.document.gamblingEntries.some(e=>e.id==='open'));assert.ok(io.remote.document.gamblingEntries.some(e=>e.id==='today'));
});
