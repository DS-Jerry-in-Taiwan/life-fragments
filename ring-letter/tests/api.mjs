import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Runs against `npm run dev`. The dev server only grants an admin identity to
// requests carrying its per-run secret (vite.config.ts devAdminIdentity()).
// A few checks read or backdate rows with `wrangler d1 execute --local`, which
// opens the same .wrangler/state database as the dev server (as in
// tests/retention.mjs).
const token=process.env.DEV_ADMIN_TOKEN||readFileSync(new URL('../.wrangler/dev-admin-token',import.meta.url),'utf8').trim();
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const ADMIN={'x-dev-admin-token':token,'x-dev-admin-email':'dev-admin@localhost'};
// The vinext dev server itself answers foreign origins with a plain 403
// "Forbidden" before the app runs; another localhost port gets through to the
// app's own same-origin check (lib/server/same-origin.ts).
const ATTACKER='https://attacker.example', OTHER_PORT='http://localhost:1';
const root=fileURLToPath(new URL('..',import.meta.url));
/** Runs SQL on the local D1; returns the rows of the last statement. */
function sql(command){
 const out=execFileSync('npx',['wrangler','d1','execute','DB','--local','--json','--command',command],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 return JSON.parse(out).at(-1).results;
}
const q=(s)=>"'"+String(s).replaceAll("'","''")+"'";
const hashOf=(cookie)=>createHash('sha256').update(cookie.split('=')[1]).digest('hex');
async function body(r){const t=await r.text();try{return JSON.parse(t);}catch{return {raw:t};}}
/**
 * fetch(), retried once when a kept-alive socket was closed by the dev server
 * while idle (its keep-alive timeout is 5 s; the synchronous sql() calls in
 * between block the event loop, so the client can't notice). No response was
 * received, so the request never reached the app. Same as tests/retention.mjs.
 */
async function request(url,init){
 try{return await fetch(url,init);}
 catch(e){if(e.cause?.code!=='UND_ERR_SOCKET')throw e;return fetch(url,init);}
}
/** One request. `data` (when given) is sent as JSON unless `raw` is set; non-GET requests carry Origin unless `source` is null. */
async function call(method,path,{data,raw,type='application/json',cookie='',admin=false,source=origin,headers={}}={}){
 const h={...(source&&method!=='GET'?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(admin?ADMIN:{}),...headers};
 let payload;if(raw!==undefined){payload=raw;h['Content-Type']=type;}else if(data!==undefined){payload=JSON.stringify(data);h['Content-Type']=type;}
 const r=await request(origin+path,{method,headers:h,body:payload,redirect:'manual'});
 return {status:r.status,data:await body(r),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};
}
const session=(o)=>call('POST','/api/session',o);
const stories=()=>call('GET','/api/stories');
const mine=(cookie)=>call('GET','/api/me/stories',{cookie});
const submit=(data,cookie,o={})=>call('POST','/api/me/stories',{data,cookie,...o});
const start=(data,cookie,o={})=>call('POST','/api/writing-attempts',{data,cookie,...o});
const withdraw=(id,cookie,o={})=>call('DELETE','/api/me/stories/'+encodeURIComponent(id),{cookie,...o});
const erase=(cookie,o={})=>call('DELETE','/api/me',{cookie,...o});
const logout=(cookie,o={})=>call('DELETE','/api/session',{cookie,...o});
const CONSENT={adult:true,privacy:true,share:true};
const sharing=(id,data,cookie,o={})=>call('PATCH','/api/me/stories/'+encodeURIComponent(id)+'/sharing',{data,cookie,...o});
const shareOn=(id,cookie,o)=>sharing(id,{share:true,consent:CONSENT},cookie,o);
const shareOff=(id,cookie,o)=>sharing(id,{share:false},cookie,o);
const feedback=(data,cookie)=>call('POST','/api/feedback',{data,cookie});
const adminGet=(admin=true,headers={})=>call('GET','/api/admin/summary',{admin,headers});
const moderate=(id,data,{cookie='',admin=false,source=origin}={})=>call('POST','/api/admin/stories/'+encodeURIComponent(id)+'/moderation',{data,cookie,admin,source});
const batchModerate=(data,{admin=true,source=origin,headers={}}={})=>call('POST','/api/admin/moderation',{data,admin,source,headers});
const deleteFeedback=(id,{admin=true,source=origin,headers={}}={})=>call('DELETE','/api/admin/feedback/'+encodeURIComponent(id),{admin,source,headers});
const adminList=(path,params={},{admin=true,headers={}}={})=>call('GET','/api/admin/'+path+'?'+new URLSearchParams(params),{admin,headers});
// Every page of an admin list (stories, feedback), following nextCursor.
const adminAll=async(path,params={})=>{const key=path.split('?')[0];let rows=[],cursor;do{const r=await adminList(path,cursor?{...params,cursor}:params);assert.equal(r.status,200,JSON.stringify(r.data));rows.push(...r.data[key]);cursor=r.data.nextCursor;}while(cursor);return rows;};
const adminStory=async(id)=>(await adminList('stories',{status:'all',id})).data.stories[0];
const metrics=async()=>(await adminGet()).data.metrics;
// Every admin_events row this run writes is removed at the end (rows above this id were there before).
const firstEvent=sql('SELECT COALESCE(MAX(id),0) AS n FROM admin_events')[0].n;
try{

// The v1 action endpoints are gone (no compatibility layer), and so is the admin queue (V6-b).
for(const [m,p] of [['GET','/api/letter'],['POST','/api/letter'],['GET','/api/admin'],['POST','/api/admin'],['GET','/api/admin/queue']])
 assert.equal((await call(m,p,{data:m==='POST'?{action:'session'}:undefined})).status,404,`${m} ${p}`);
// Methods a route doesn't export → 405 from the framework.
for(const [m,p] of [['POST','/api/stories'],['DELETE','/api/stories'],['GET','/api/session'],['PUT','/api/session'],['GET','/api/writing-attempts'],['GET','/api/me'],['POST','/api/me'],['PUT','/api/me/stories'],['GET','/api/me/stories/x'],['POST','/api/me/stories/x'],['GET','/api/feedback'],['GET','/api/admin/stories/x/moderation'],['GET','/api/me/stories/x/sharing'],['POST','/api/me/stories/x/sharing'],['PATCH','/api/me/stories/x'],['DELETE','/api/admin/stories/x/moderation'],['POST','/api/admin/summary'],['POST','/api/admin/stories'],['DELETE','/api/admin/stories'],['POST','/api/admin/feedback'],['GET','/api/admin/feedback/x'],['POST','/api/admin/feedback/x'],['GET','/api/admin/moderation'],['DELETE','/api/admin/moderation'],['POST','/api/admin/events']])
 assert.equal((await call(m,p,{admin:true})).status,405,`${m} ${p}`);

// Same-origin check on every POST and DELETE (missing Origin is rejected too).
assert.equal((await session({source:ATTACKER})).status,403);
assert.equal((await session({source:null})).status,403);
for(const source of [ATTACKER,OTHER_PORT,null]){
 assert.equal((await erase('',{source})).status,403);
 assert.equal((await logout('',{source})).status,403);
 assert.equal((await withdraw('x','',{source})).status,403);
 assert.equal((await call('POST','/api/feedback',{data:{},source})).status,403);
 assert.equal((await submit({},'',{source})).status,403);
 assert.equal((await start({},'',{source})).status,403);
 assert.equal((await shareOff('x','',{source})).status,403);
 assert.equal((await moderate('x',{status:'approved'},{admin:true,source})).status,403);
 assert.equal((await batchModerate({status:'delete',items:[{id:'x',statusAt:1,consentEvents:0}]},{source})).status,403);
 assert.equal((await deleteFeedback('x',{source})).status,403);
}
for(const source of [OTHER_PORT,null]){
 assert.deepEqual((await erase('',{source})).data,{error:'來源驗證失敗'});
 assert.deepEqual((await logout('',{source})).data,{error:'來源驗證失敗'});
 assert.deepEqual((await withdraw('x','',{source})).data,{error:'來源驗證失敗'});
 assert.deepEqual((await session({source})).data,{error:'來源驗證失敗'});
}
// Session required (after the body checks, as in v1).
assert.equal((await submit({})).status,401);
assert.equal((await start({})).status,401);
assert.equal((await feedback({})).status,401);
assert.equal((await erase('')).status,401);
assert.deepEqual((await shareOff('x','')).data,{error:'體驗工作階段已過期，請重新整理頁面。'});
assert.deepEqual((await withdraw('x','')).data,{error:'體驗工作階段已過期，請重新整理頁面。'});
assert.deepEqual((await mine('')),{status:200,data:{stories:[]},cookie:undefined,setCookie:null});
// JSON body checks: 415 / 413 / 400 come before the session check.
assert.equal((await submit(undefined,'',{raw:'{}',type:'text/plain'})).status,415);
assert.equal((await submit(undefined,'',{raw:JSON.stringify({body:'x'.repeat(12001)})})).status,413);
assert.deepEqual((await submit(undefined,'',{raw:'{'})).data,{error:'格式不正確'});
assert.deepEqual((await submit(null,'')).data,{error:'格式不正確'});
// Admin: Access identity only via the per-run dev secret.
assert.equal((await adminGet(false)).status,403);
assert.equal((await adminGet(false,{'oai-authenticated-user-email':'tom82523@gmail.com'})).status,403);
assert.equal((await adminGet(false,{'cf-access-authenticated-user-email':'dev-admin@localhost'})).status,403);
assert.equal((await adminGet(false,{'x-dev-admin-token':'0'.repeat(64),'x-dev-admin-email':'dev-admin@localhost'})).status,403);
assert.equal((await moderate('x',{status:'approved'})).status,403);
// Every new admin endpoint (V6-a) requires the admin identity too.
for(const path of ['summary','stories','feedback','events']){
 assert.deepEqual((await adminList(path,{},{admin:false})).data,{error:'只有管理者可以使用。'},path);
 assert.equal((await adminList(path,{},{admin:false,headers:{'cf-access-authenticated-user-email':'dev-admin@localhost'}})).status,403,path);
}
assert.deepEqual((await batchModerate({status:'delete',items:[{id:'x',statusAt:1,consentEvents:0}]},{admin:false})).data,{error:'只有管理者可以使用。'});
assert.deepEqual((await deleteFeedback('x',{admin:false})).data,{error:'只有管理者可以使用。'});

const a=await session(), b=await session();assert.equal(a.status,200);assert.ok(a.cookie);assert.ok(b.cookie);
// One-year cookie (#4 §6.2); a live session gets the same cookie re-issued on every request.
const YEAR=31536000, refreshed=(cookie)=>`${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${YEAR}`;
assert.match(a.setCookie,new RegExp(`^rl_session=[a-f0-9]{64}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${YEAR}$`));
const again=await session({cookie:a.cookie});assert.deepEqual(again.data,{ok:true});assert.equal(again.setCookie,refreshed(a.cookie),'reused session: cookie re-issued, not replaced');
const story={title:'自動測試文章，結束即刪除',body:'這是一篇測試資料，用來驗證投稿與權限流程。這段內容不是真實使用者的經歷，測試完成後將刪除。',era:'測試日期',source:'recollection',adult:true,privacy:true,share:true};
assert.equal((await submit({...story,body:'太短'},a.cookie)).status,400);
assert.equal((await submit({...story,adult:false},a.cookie)).status,400);
const s=await submit(story,a.cookie);assert.equal(s.status,200);assert.equal(s.data.status,'pending');const id=s.data.id;
assert.ok(!(await stories()).data.stories.some(x=>x.id===id));
assert.ok((await mine(a.cookie)).data.stories.some(x=>x.id===id));
assert.ok(!(await mine(b.cookie)).data.stories.some(x=>x.id===id));
{const r=await withdraw(id,b.cookie);assert.deepEqual([r.status,r.data],[404,{error:'找不到屬於這個瀏覽器的片段。'}]);}
// Ids come from the path: decoded, any string, unknown ones are not found.
assert.equal((await withdraw('中 文/../'+id,a.cookie)).status,404);
assert.equal((await call('DELETE','/api/me/stories/%ZZ',{cookie:a.cookie})).status,400);
assert.deepEqual((await withdraw(id,a.cookie,{source:OTHER_PORT})).data,{error:'來源驗證失敗'});
assert.ok((await mine(a.cookie)).data.stories.some(x=>x.id===id),'cross-origin DELETE must not withdraw');
assert.deepEqual((await erase(a.cookie,{source:OTHER_PORT})).data,{error:'來源驗證失敗'});
assert.ok((await mine(a.cookie)).data.stories.some(x=>x.id===id),'cross-origin DELETE must not erase');
assert.equal((await moderate(id,{status:'approved'},{cookie:a.cookie})).status,403);
assert.deepEqual((await moderate(id,{status:'approved'},{admin:true,source:OTHER_PORT})).data,{error:'來源驗證失敗'});
assert.deepEqual((await moderate(id,{status:'publish'},{admin:true})).data,{error:'無效操作'});
assert.deepEqual((await moderate(id,null,{admin:true})).data,{error:'無效操作'});
assert.deepEqual((await moderate('no-such-story',{status:'approved'},{admin:true})).data,{error:'文章不存在，或作者未同意分享'});
// A body `id` is ignored: the path decides which story is moderated.
assert.equal((await moderate(id,{id:'no-such-story',status:'approved'},{admin:true})).status,200);
assert.ok((await stories()).data.stories.some(x=>x.id===id));
assert.equal((await feedback({story:id,kind:'resonate',note:'測試'},b.cookie)).status,200);
assert.equal((await feedback({story:'demo-1',kind:'more',note:''},b.cookie)).status,200);
assert.ok((await adminAll('feedback',{story:id})).length>0);
assert.equal((await adminStory(id)).feedbackCount,1,'the admin card counts its feedback');
const privateStory=await submit({...story,share:false},a.cookie);assert.equal(privateStory.status,200);assert.equal(privateStory.data.status,'private');
assert.equal((await moderate(privateStory.data.id,{status:'approved'},{admin:true})).status,400);
// New submissions carry the current consent version (V3-c), in the story and its submit event.
assert.deepEqual(sql(`SELECT id,consent FROM stories WHERE id IN (${q(id)},${q(privateStory.data.id)}) ORDER BY id`),[{id,consent:'v3-2026-11-12:adult,privacy,share'},{id:privateStory.data.id,consent:'v3-2026-11-12:adult,privacy,private'}].sort((x,y)=>x.id<y.id?-1:1));
assert.deepEqual(sql(`SELECT DISTINCT action,consent_version AS version FROM consent_events WHERE story IN (${q(id)},${q(privateStory.data.id)})`),[{action:'submit',version:'v3-2026-11-12'}]);
assert.deepEqual((await withdraw(id,a.cookie)).data,{ok:true});
assert.ok(!(await stories()).data.stories.some(x=>x.id===id));
assert.equal((await adminAll('feedback',{story:id})).length,0,'withdraw deletes the story\'s feedback');
assert.equal((await feedback({story:id,kind:'resonate',note:''},b.cookie)).status,404);
const before=await metrics();
for(const type of ['past','present']){
 const attempt=crypto.randomUUID();
 assert.equal((await start({id:'not-a-uuid',letterType:type},a.cookie)).status,400);
 assert.equal((await start({id:attempt,letterType:type},a.cookie)).status,200);
 const payload={...story,title:'',body:'今天有點累',letterType:type,attempt,mood:type==='present'?'疲倦':'',reflection:type==='past'?'現在還不明白':'',share:false};
 assert.equal((await submit(payload,b.cookie)).status,400);
 if(type==='present')assert.equal((await submit({...payload,mood:''},a.cookie)).status,400);
 const result=await submit(payload,a.cookie);assert.equal(result.status,200,JSON.stringify(result));
 assert.equal((await submit(payload,a.cookie)).status,409);
 const own=(await mine(a.cookie)).data.stories.find(x=>x.id===result.data.id);assert.equal(own.letterType,type);assert.equal(own.mood,payload.mood);assert.equal(own.reflection,payload.reflection);assert.ok(own.created);assert.ok(own.title);
 const metric=(await metrics()).find(x=>x.letterType===type);const old=before.find(x=>x.letterType===type);assert.equal(metric.starts,(old?.starts||0)+1);assert.equal(metric.completions,(old?.completions||0)+1);
}
// --- Sliding sessions (#4 §6.2): validity is last_seen within a year; every
// request with a live cookie re-issues it (pages too, worker/index.ts), and
// last_seen is written at most once a day.
{
 const DAY=86400000, c=(await session()).cookie, h=hashOf(c);
 const lastSeen=()=>sql(`SELECT last_seen AS t FROM sessions WHERE hash=${q(h)}`)[0]?.t;
 const page=async(cookie)=>{const r=await request(origin+'/',{headers:{Cookie:cookie}});await r.arrayBuffer();return {status:r.status,setCookie:r.headers.get('set-cookie'),cache:r.headers.get('cache-control')};};
 // A pre-V3-c session: created 40 days ago, 30-day cookie, last seen 40 days ago. Still live, upgraded to one year.
 const old=Date.now()-40*DAY;
 sql(`UPDATE sessions SET created=${old},last_seen=${old} WHERE hash=${q(h)}`);
 const p=await page(c);assert.equal(p.status,200);assert.equal(p.setCookie,refreshed(c),'a page visit re-issues the cookie for a year');assert.equal(p.cache,'private','and is not cacheable for others');
 const seen=lastSeen();assert.ok(seen>Date.now()-60000,'and moves last_seen to now');
 {const r=await mine(c);assert.equal(r.setCookie,refreshed(c),'API reads too');}
 assert.equal(lastSeen(),seen,'at most one last_seen write a day');
 sql(`UPDATE sessions SET last_seen=${Date.now()-DAY+3600000} WHERE hash=${q(h)}`);
 const recent=lastSeen();await page(c);assert.equal(lastSeen(),recent,'last_seen younger than a day is not rewritten');
 // 364 days since the last visit: still live.
 sql(`UPDATE sessions SET last_seen=${Date.now()-364*DAY} WHERE hash=${q(h)}`);
 const kept=await submit({...story,share:false},c);assert.equal(kept.status,200);
 assert.ok(lastSeen()>Date.now()-60000);
 // More than a year since the last visit: dead everywhere, and no cookie re-issued.
 sql(`UPDATE sessions SET last_seen=${Date.now()-366*DAY} WHERE hash=${q(h)}`);
 const gone=await mine(c);assert.deepEqual(gone.data,{stories:[]});assert.equal(gone.setCookie,null);
 assert.equal((await page(c)).setCookie,null);
 assert.equal((await submit(story,c)).status,401);
 const fresh=await session({cookie:c});assert.ok(fresh.cookie&&fresh.cookie!==c,'an expired session is replaced');
 // An unknown token gets nothing either.
 assert.equal((await mine('rl_session='+'0'.repeat(64))).setCookie,null);
 assert.equal((await moderate(kept.data.id,{status:'delete'},{admin:true})).status,200);
 assert.equal((await erase(fresh.cookie)).status,200);
}

// --- 在這台裝置登出 (DELETE /api/session): the session goes, its stories stay.
{
 const c=(await session()).cookie, h=hashOf(c);
 const shared=await submit(story,c), kept=await submit({...story,share:false},c);
 assert.equal((await moderate(shared.data.id,{status:'approved'},{admin:true})).status,200);
 assert.equal((await feedback({story:shared.data.id,kind:'resonate',note:''},c)).status,200);
 assert.deepEqual((await logout(c,{source:OTHER_PORT})).data,{error:'來源驗證失敗'});
 assert.equal((await mine(c)).data.stories.length,2,'cross-origin DELETE must not log out');
 const out=await logout(c);
 assert.equal(out.status,200);assert.deepEqual(out.data,{ok:true});
 assert.equal(out.setCookie,'rl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0','clears the cookie (and no refresh on top)');
 assert.equal(sql(`SELECT COUNT(*) AS n FROM sessions WHERE hash=${q(h)}`)[0].n,0,'session row deleted');
 const after=await mine(c);assert.deepEqual(after.data,{stories:[]});assert.equal(after.setCookie,null);
 assert.equal((await submit(story,c)).status,401);
 assert.equal((await erase(c)).status,401,'erase-all needs the session too');
 assert.equal(sql(`SELECT COUNT(*) AS n FROM stories WHERE owner=${q(h)}`)[0].n,2,'stories stay');
 assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE owner=${q(h)}`)[0].n,1,'feedback stays');
 assert.ok((await stories()).data.stories.some(x=>x.id===shared.data.id),'the approved story stays public');
 // Without a session (none, unknown or already logged out): still clears the cookie and succeeds.
 for(const cookie of ['',c,'rl_session='+'0'.repeat(64)]){
  const r=await logout(cookie);assert.equal(r.status,200);assert.deepEqual(r.data,{ok:true});assert.match(r.setCookie,/^rl_session=;.*Max-Age=0$/);
 }
 for(const s of [shared,kept])assert.equal((await moderate(s.data.id,{status:'delete'},{admin:true})).status,200);
 assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE owner=${q(h)}`)[0].n,0,'admin delete takes the feedback with it');
}

// --- No cap (V6-b removed the queue's 200): every live story is reachable by
// paging, and an old approved one (approved v3 stories never expire, and the
// admin must be able to find one to delete it for its author) is found behind
// 210 newer ones, in its own status and in all.
{
 const P='api-cap-', now=Date.now(), old=now-60*86400000;
 const cols='id,owner,title,body,era,source,status,consent,created,status_at,approved_at';
 const del=`DELETE FROM stories WHERE id LIKE '${P}%'`;
 sql(`${del}; INSERT INTO stories(${cols}) VALUES (${q(P+'old-approved')},'cap-test','上限測試：舊的已核准','測試內容','測試','recollection','approved','v3-2026-11-12:adult,privacy,share',${old},${old},${old});
 WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<210)
 INSERT INTO stories(${cols}) SELECT '${P}'||i,'cap-test','上限測試：較新的待審','測試內容','測試','recollection','pending','v3-2026-11-12:adult,privacy,share',${now}-i,${now}-i,NULL FROM n;`);
 try{
  const all=(await adminAll('stories',{status:'all',q:'上限測試'})).filter(x=>x.id.startsWith(P));
  assert.equal(all.length,211,'all 211 reachable by paging, no 200 cap');
  assert.equal(all.at(-1).id,P+'old-approved','the old approved story is listed last, behind 210 newer ones');
  const created=all.map(x=>x.created);assert.deepEqual(created,[...created].sort((x,y)=>y-x),'newest first');
  assert.equal((await adminAll('stories',{q:'上限測試'})).length,210,'pending (default): every one, no cap');
  assert.ok((await adminAll('stories',{status:'approved'})).some(x=>x.id===P+'old-approved'),'approved: listed');
  const s=(await adminGet()).data.counts;assert.ok(s.pending>=210&&s.approved>=1,'summary counts them');
 }finally{sql(del);}
}

// --- 作者調整分享授權 (#4 §6.1): PATCH /api/me/stories/:id/sharing.
{
 const V3='v3-2026-11-12', V2='v2-2026-11-05';
 const c=(await session()).cookie, other=(await session()).cookie;
 const row=(id)=>sql(`SELECT status,consent,body,approved_at AS approvedAt,status_at AS statusAt FROM stories WHERE id=${q(id)}`)[0];
 const events=(id)=>sql(`SELECT action,consent_version AS version FROM consent_events WHERE story=${q(id)} ORDER BY id`).map(e=>`${e.action}:${e.version}`);
 const left=async(id,cookie=c)=>(await mine(cookie)).data.stories.find(x=>x.id===id)?.shareRequestsLeft;
 const isPublic=async(id)=>(await stories()).data.stories.some(x=>x.id===id);
 const queued=adminStory;
 const ok=(r,status,shareRequestsLeft)=>assert.deepEqual([r.status,r.data],[200,{ok:true,status,shareRequestsLeft}],JSON.stringify(r));
 const err=(r,status,error)=>assert.deepEqual([r.status,r.data],[status,{error}]);
 const NOT_SHARED='這篇目前沒有分享，不需要停止。', PENDING='這篇已在等待審閱。', PUBLIC='這篇已經公開分享，不需要再申請。';
 const CAP='這篇已申請分享 3 次，已達上限，無法再申請；仍可保持不公開，或撤回刪除。';

 const p=(await submit({...story,share:false},c)).data.id;
 assert.equal(await left(p),3,'my stories carry the share requests left');
 assert.deepEqual(events(p),['submit:'+V3]);
 // Body checks (before ownership), cross-origin, owner isolation.
 for(const data of [{},{share:'yes'},{share:'true'},{share:1},{share:null},[]])err(await sharing(p,data,c),400,'無效的分享設定');
 for(const consent of [undefined,{},{...CONSENT,adult:false},{...CONSENT,privacy:false},{...CONSENT,share:false},{adult:'true',privacy:true,share:true}])
  err(await sharing(p,{share:true,consent},c),400,'請勾選三項同意，才能申請分享。');
 assert.equal((await sharing(p,undefined,c,{raw:'{"share":false}',type:'text/plain'})).status,415);
 for(const source of [OTHER_PORT,null])err(await shareOn(p,c,{source}),403,'來源驗證失敗');
 err(await shareOn(p,other),404,'找不到屬於這個瀏覽器的片段。');
 err(await shareOn('no-such-story',c),404,'找不到屬於這個瀏覽器的片段。');
 assert.equal((await call('PATCH','/api/me/stories/%ZZ/sharing',{data:{share:false},cookie:c})).status,400);
 assert.equal(row(p).status,'private','rejected requests change nothing');
 assert.deepEqual(events(p),['submit:'+V3]);
 // private: stop → 409; share → pending (current consent, share event, status_at).
 err(await shareOff(p,c),409,NOT_SHARED);
 const t1=Date.now();
 ok(await shareOn(p,c),'pending',2);
 let r=row(p);assert.equal(r.status,'pending');assert.equal(r.consent,V3+':adult,privacy,share');assert.ok(r.statusAt>=t1);assert.equal(r.approvedAt,null);
 assert.deepEqual(events(p),['submit:'+V3,'share:'+V3]);
 assert.equal(await left(p),2);
 {const q=await queued(p);assert.equal(q.shareRequests,1,'admin list: share requests');assert.equal(q.consentEvents,2,'admin list: consent history count');}
 assert.ok(!(await isPublic(p)),'pending is not public');
 // pending: share → 409; another session cannot stop it; stop → private.
 err(await shareOn(p,c),409,PENDING);
 err(await shareOff(p,other),404,'找不到屬於這個瀏覽器的片段。');
 ok(await shareOff(p,c),'private',2);
 r=row(p);assert.equal(r.status,'private');assert.equal(r.consent,V3+':adult,privacy,private');
 assert.deepEqual(events(p),['submit:'+V3,'share:'+V3,'unshare:'+V3]);
 assert.equal((await moderate(p,{status:'approved'},{admin:true})).status,400,'private stories still cannot be approved');
 // Back to pending, approved: share → 409, stop → private, off the public list at once.
 ok(await shareOn(p,c),'pending',1);
 assert.equal((await moderate(p,{status:'approved'},{admin:true})).status,200);
 assert.ok(await isPublic(p));
 assert.equal((await feedback({story:p,kind:'resonate',note:''},other)).status,200);
 err(await shareOn(p,c),409,PUBLIC);
 const t2=Date.now();
 ok(await shareOff(p,c),'private',1);
 r=row(p);assert.equal(r.status,'private');assert.equal(r.approvedAt,null,'approved_at cleared');assert.ok(r.statusAt>=t2);assert.equal(r.consent,V3+':adult,privacy,private');
 assert.equal(r.body,story.body,'the text is never modified');
 assert.ok(!(await isPublic(p)),'approved → private leaves the public list');
 assert.equal((await feedback({story:p,kind:'resonate',note:''},other)).status,404,'and no longer accepts feedback');
 assert.ok((await mine(c)).data.stories.some(x=>x.id===p&&x.status==='private'),'it stays in my stories');
 // Re-sharing never reuses the earlier approval.
 ok(await shareOn(p,c),'pending',0);
 assert.ok(!(await isPublic(p)),'re-shared story waits for review again');
 assert.equal(row(p).approvedAt,null);
 {const q=await queued(p);assert.equal(q.status,'pending');assert.equal(q.shareRequests,3);}
 assert.equal((await moderate(p,{status:'approved'},{admin:true})).status,200);
 assert.ok(await isPublic(p),'public again only after a new approval');
 // The cap: three share requests used; stop stays available, a fourth share is refused.
 ok(await shareOff(p,c),'private',0);
 assert.equal(await left(p),0);
 err(await shareOn(p,c),409,CAP);
 assert.equal(row(p).status,'private');
 assert.deepEqual(events(p),['submit:'+V3,'share:'+V3,'unshare:'+V3,'share:'+V3,'unshare:'+V3,'share:'+V3,'unshare:'+V3]);
 // That was 6 changes today for this session (the refused ones don't count).

 // rejected: stop → 409, share → pending (再次申請分享), counted towards the same cap.
 const j=(await submit(story,c)).data.id;
 assert.equal((await moderate(j,{status:'rejected'},{admin:true})).status,200);
 err(await shareOff(j,c),409,NOT_SHARED);
 ok(await shareOn(j,c),'pending',2);
 {const q=await queued(j);assert.equal(q.shareRequests,1);assert.equal(q.consentEvents,2);}
 assert.deepEqual(events(j),['submit:'+V3,'share:'+V3]);
 // Stories submitted as shared: no share request used, no history beyond submit.
 const fresh=(await submit(story,c)).data.id;
 {const q=await queued(fresh);assert.equal(q.shareRequests,0);assert.equal(q.consentEvents,1);}
 // Daily cap: 10 changes per session per day, both directions (7 so far).
 ok(await shareOff(j,c),'private',2);
 ok(await shareOn(j,c),'pending',1);
 ok(await shareOff(j,c),'private',1);
 err(await shareOn(j,c),429,'今天已調整十次分享設定，明天再來。');
 err(await shareOff(fresh,c),429,'今天已調整十次分享設定，明天再來。');
 assert.equal(row(j).status,'private');assert.equal(row(fresh).status,'pending');
 // Withdraw stays available.
 assert.deepEqual((await withdraw(p,c)).data,{ok:true});

 // Old consent version (v2): sharing again moves the story onto the current
 // terms; stopping keeps its version.
 const h=hashOf(other), now=Date.now(), cols='id,owner,title,body,era,source,status,consent,created,status_at,approved_at';
 const v2p='api-share-v2-private', v2a='api-share-v2-approved';
 sql(`INSERT INTO stories(${cols}) VALUES (${q(v2p)},${q(h)},${q(story.title)},${q(story.body)},'測試','recollection','private',${q(V2+':adult,privacy,private')},${now},${now},NULL),(${q(v2a)},${q(h)},${q(story.title)},${q(story.body)},'測試','recollection','approved',${q(V2+':adult,privacy,share')},${now},${now},${now});
 INSERT INTO consent_events(story,action,consent_version,created) VALUES (${q(v2p)},'submit',${q(V2)},${now}),(${q(v2a)},'submit',${q(V2)},${now});`);
 ok(await shareOn(v2p,other),'pending',2);
 assert.equal(row(v2p).consent,V3+':adult,privacy,share','re-consent uses the current version');
 assert.deepEqual(events(v2p),['submit:'+V2,'share:'+V3]);
 assert.ok(await isPublic(v2a));
 ok(await shareOff(v2a,other),'private',3);
 assert.equal(row(v2a).consent,V2+':adult,privacy,private','stopping keeps the consent version');
 assert.deepEqual(events(v2a),['submit:'+V2,'unshare:'+V2]);
 assert.ok(!(await isPublic(v2a)));
 // Concurrent requests on one story: exactly one wins, one event is written,
 // the rest get 409 (the writes are conditional on the story being unchanged since it was read).
 {
  const id=(await submit({...story,share:false},other)).data.id, before=events(id).length;
  const rs=await Promise.all([shareOn(id,other),shareOn(id,other),shareOn(id,other),shareOff(id,other)]);
  assert.ok(rs.every(r=>r.status===200||r.status===409),JSON.stringify(rs.map(r=>r.status)));
  assert.equal(rs.filter(r=>r.status===200&&r.data.status==='pending').length,1,'one share request wins');
  assert.equal(events(id).length,before+rs.filter(r=>r.status===200).length,'one event per applied change');
  assert.deepEqual((await withdraw(id,other)).data,{ok:true});
 }
 // Moderation with the statusAt the admin list showed: refused (409) once the story changed since,
 // e.g. the author stopped sharing and asked again between loading the list and deciding.
 const STALE='這篇的狀態剛剛改變了，請重新整理後再審閱。';
 const listedAt=(await queued(v2p)).statusAt;
 assert.equal(typeof listedAt,'number','the admin list shows statusAt');
 ok(await shareOff(v2p,other),'private',2);
 err(await moderate(v2p,{status:'approved',statusAt:listedAt},{admin:true}),409,STALE);
 ok(await shareOn(v2p,other),'pending',1);
 err(await moderate(v2p,{status:'approved',statusAt:listedAt},{admin:true}),409,STALE);
 err(await moderate(v2p,{status:'rejected',statusAt:listedAt},{admin:true}),409,STALE);
 assert.equal(row(v2p).status,'pending','a refused decision changes nothing');
 const relisted=(await queued(v2p)).statusAt;
 assert.ok(relisted>listedAt);
 assert.equal((await moderate(v2p,{status:'approved',statusAt:relisted},{admin:true})).status,200);
 assert.ok(await isPublic(v2p));
 err(await moderate(v2p,{status:'rejected',statusAt:relisted},{admin:true}),409,STALE,'the approval itself changed it');
 for(const bad of ['1',-1,1.5,null])err(await moderate(v2p,{status:'rejected',statusAt:bad},{admin:true}),400,'無效操作');
 // Unchanged private story: still the private-consent 400; delete ignores statusAt.
 err(await moderate(v2a,{status:'approved',statusAt:(await queued(v2a)).statusAt},{admin:true}),400,'文章不存在，或作者未同意分享');
 err(await moderate('no-such-story',{status:'approved',statusAt:1},{admin:true}),400,'文章不存在，或作者未同意分享');
 // A change within the same millisecond leaves statusAt as listed; the consent-event count still differs.
 {
  ok(await shareOff(v2p,other),'private',1);ok(await shareOn(v2p,other),'pending',0);
  const listed=await queued(v2p);
  assert.equal(typeof listed.consentEvents,'number');
  sql(`INSERT INTO consent_events(story,action,consent_version,created) VALUES (${q(v2p)},'unshare',${q(V3)},${listed.statusAt}),(${q(v2p)},'share',${q(V3)},${listed.statusAt})`);
  err(await moderate(v2p,{status:'approved',statusAt:listed.statusAt,consentEvents:listed.consentEvents},{admin:true}),409,STALE);
  for(const bad of ['1',-1,1.5,null])err(await moderate(v2p,{status:'approved',consentEvents:bad},{admin:true}),400,'無效操作');
  assert.equal(row(v2p).status,'pending');
  const again=await queued(v2p);
  assert.equal((await moderate(v2p,{status:'approved',statusAt:again.statusAt,consentEvents:again.consentEvents},{admin:true})).status,200);
 }
 // Erase-all takes the history with it.
 assert.equal((await erase(c)).status,200);
 assert.equal((await erase(other)).status,200);
 assert.equal(sql(`SELECT COUNT(*) AS n FROM consent_events WHERE story IN (${[p,j,fresh,v2p,v2a].map(q).join(',')})`)[0].n,0);
}

// --- V6-a admin API (#4 §5.2): summary, filtered/paged stories, feedback,
// batch moderation and the admin operation log. Rows are inserted directly
// (marked by unique random words in the title, which `q` then isolates from
// whatever else the local D1 holds) and removed at the end.
{
 const DAY=86400000, HOUR=3600000, now=Date.now(), tag=now.toString(36);
 const P='api-v6-'+tag+'-', V3='v3-2026-11-12', V2='v2-2026-11-05';
 const M='甲'+tag, MD='丁'+tag, ME='戊'+tag, MP='乙'+tag, MB='丙'+tag;
 const cols='id,owner,title,body,era,source,status,consent,created,status_at,approved_at';
 const consentOf={v3s:V3+':adult,privacy,share',v3p:V3+':adult,privacy,private',v2s:V2+':adult,privacy,share',legacy:'legacy-consent'};
 const row=(id,title,status,consent,created,statusAt=created,body='測試內容')=>`(${q(P+id)},'v6-test',${q(title)},${q(body)},'測試','recollection',${q(status)},${q(consentOf[consent])},${created},${statusAt},${status==='approved'?statusAt:'NULL'})`;
 const insert=(rows)=>sql(`INSERT INTO stories(${cols}) VALUES ${rows.join(',')}`);
 const ids=(r)=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data.stories.map(x=>x.id.slice(P.length));};
 const set=(r)=>ids(r).sort();
 const list=(params)=>adminList('stories',params);
 const BAD='無效的篩選條件。', BAD_CURSOR='無效的分頁位置，請重新載入。';
 const cursorOf=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 let fb;
 const events=(targets)=>sql(`SELECT admin_email AS email,action,target_type AS type,target_id AS target FROM admin_events WHERE id>${firstEvent} AND target_id IN (${targets.map(q).join(',')}) ORDER BY id`).map(e=>`${e.email} ${e.action} ${e.type} ${e.target.startsWith(P)?e.target.slice(P.length):e.target}`);
 try{
  // Summary: counts per live status and expiring within 7 days, before/after inserting rows.
  const s0=(await adminList('summary')).data;
  assert.deepEqual(Object.keys(s0.counts).sort(),['approved','pending','private','rejected']);
  assert.equal(s0.expiringDays,7);
  assert.ok(Array.isArray(s0.metrics),'30-day writing metrics');
  insert([
   row('p1',M+' 待審','pending','v3s',now-HOUR),
   row('p2',M+' 重新申請','pending','v3s',now-HOUR-1),
   row('b1','只在內文','pending','v3s',now-HOUR-2,now-HOUR-2,'內文裡有 '+M),
   row('x1',M+' 私人','private','v3p',now-HOUR-3),
   row('a1',M+' 已核准','approved','v3s',now-2*HOUR),
   row('a2',M+' 舊條款','approved','v2s',now-25*DAY),
   row('l1',M+' 早期','approved','legacy',now-3*HOUR),
   row('r1',M+' 不通過','rejected','v3s',now-27*DAY,now-26*DAY),
   row('e1',M+' 過期舊條款','pending','v2s',now-31*DAY),
   row('e2',M+' 過期不通過','rejected','v3s',now-40*DAY,now-31*DAY),
  ]);
  sql(`INSERT INTO consent_events(story,action,consent_version,created) VALUES (${q(P+'p2')},'submit',${q(V3)},${now}),(${q(P+'p2')},'share',${q(V3)},${now})`);
  const s1=(await adminList('summary')).data;
  assert.deepEqual(Object.fromEntries(Object.entries(s1.counts).map(([k,n])=>[k,n-s0.counts[k]])),{pending:3,approved:3,rejected:1,private:1},'live stories only');
  assert.equal(s1.expiring-s0.expiring,2,'a2 (v2, 5 days left) and r1 (rejected, 4 days left)');

  // Filters, each alone and combined; expired stories (e1, e2) never appear.
  assert.deepEqual(set(await list({q:M})),['b1','p1','p2'],'pending by default; q matches the body too');
  assert.deepEqual(set(await list({q:M,status:'approved'})),['a1','a2','l1']);
  assert.deepEqual(set(await list({q:M,status:'rejected'})),['r1']);
  assert.deepEqual(set(await list({q:M,status:'private'})),['x1']);
  assert.deepEqual(set(await list({q:M,status:'all'})),['a1','a2','b1','l1','p1','p2','r1','x1']);
  assert.deepEqual(set(await list({q:M,status:'all',reshare:'1'})),['p2']);
  assert.deepEqual(set(await list({q:M,status:'all',consent:'v3'})),['a1','b1','p1','p2','r1','x1']);
  assert.deepEqual(set(await list({q:M,status:'all',consent:'v2'})),['a2','l1'],'v2: every non-permanent version, legacy included');
  assert.deepEqual(set(await list({q:M,status:'all',expiring:'7'})),['a2','r1']);
  assert.deepEqual(set(await list({q:M,status:'all',expiring:'30'})),['a2','b1','l1','p1','p2','r1','x1'],'permanent approved never expires');
  assert.deepEqual(set(await list({q:M,status:'approved',consent:'v2',expiring:'7'})),['a2']);
  assert.deepEqual(set(await list({q:M,status:'pending',consent:'v3',reshare:'1'})),['p2']);
  assert.deepEqual(set(await list({q:M,status:'rejected',consent:'v2'})),[]);
  assert.deepEqual(set(await list({id:P+'a1',status:'all'})),['a1'],'id: exact');
  assert.deepEqual(set(await list({id:P+'a1'})),[],'id still within the status filter');
  assert.deepEqual(set(await list({id:P+'e1',status:'all'})),[],'an expired story is not found even by id');
  assert.deepEqual(set(await list({id:P+'a',status:'all'})),[],'id is not a prefix match');
  {
   const byId=Object.fromEntries((await list({q:M,status:'all'})).data.stories.map(x=>[x.id.slice(P.length),x]));
   assert.equal(byId.a1.expiresAt,null,'permanent: expiresAt null');
   assert.equal(byId.a2.expiresAt,now-25*DAY+30*DAY,'v2: 30 days after created');
   assert.equal(byId.r1.expiresAt,now-26*DAY+30*DAY,'v3 not approved: 30 days after the status change');
   assert.deepEqual([byId.a1.terms,byId.a2.terms,byId.l1.terms],['v3','v2','v2']);
   assert.deepEqual([byId.p2.shareRequests,byId.p2.consentEvents,byId.p2.statusAt,byId.p2.consent],[1,2,now-HOUR-1,consentOf.v3s],'card fields, consent string');
   for(const k of ['id','title','body','era','source','status','consent','created','letterType','mood','reflection','statusAt','shareRequests','consentEvents','terms','expiresAt'])assert.ok(k in byId.p1,k);
  }

  // q is taken literally: %, _, quotes and backslashes are not patterns.
  insert([row('q-pct',ME+'%x','pending','v3s',now-HOUR),row('q-pp',ME+'yyx','pending','v3s',now-HOUR),row('q-us',ME+'a_b','pending','v3s',now-HOUR),row('q-ax',ME+'axb','pending','v3s',now-HOUR),row('q-qt',ME+`it's "q"`,'pending','v3s',now-HOUR),row('q-bs',ME+'\\z','pending','v3s',now-HOUR)]);
  assert.deepEqual(set(await list({q:ME+'%x'})),['q-pct']);
  assert.deepEqual(set(await list({q:ME+'a_'})),['q-us'],'_ is not a wildcard (axb does not match)');
  assert.deepEqual(set(await list({q:ME+'a_b'})),['q-us']);
  assert.deepEqual(set(await list({q:ME+`it's "q"`})),['q-qt']);
  assert.deepEqual(set(await list({q:ME+'\\'})),['q-bs']);
  assert.deepEqual(set(await list({q:ME+'\\z'})),['q-bs']);
  assert.deepEqual(set(await list({q:'  '+ME+'%x  '})),['q-pct'],'q is trimmed');
  assert.deepEqual(set(await list({q:ME+'%X'})),['q-pct'],'ASCII case-insensitive');
  assert.equal(set(await list({q:ME})).length,6);
  assert.equal((await list({q:'字'.repeat(100)})).status,200);
  assert.deepEqual((await list({q:'字'.repeat(101)})).data,{error:'搜尋文字最多 100 字。'});

  // from / to: Taipei calendar days, both inclusive (approved v3 stories never expire, so old dates stay live).
  const tpe=(y,m,d)=>Date.UTC(y,m-1,d)-8*HOUR;
  insert([row('d0',MD,'approved','v3s',tpe(2001,2,3)-1),row('d1',MD,'approved','v3s',tpe(2001,2,3)),row('d2',MD,'approved','v3s',tpe(2001,2,4)-1),row('d3',MD,'approved','v3s',tpe(2001,2,4))]);
  assert.deepEqual(ids(await list({q:MD,status:'all',from:'2001-02-03',to:'2001-02-03'})),['d2','d1']);
  assert.deepEqual(ids(await list({q:MD,status:'approved',from:'2001-02-03'})),['d3','d2','d1']);
  assert.deepEqual(ids(await list({q:MD,status:'approved',to:'2001-02-03'})),['d2','d1','d0']);
  assert.deepEqual(ids(await list({q:MD,status:'approved',from:'',to:'',consent:''})),['d3','d2','d1','d0'],'empty parameters are ignored');

  // Invalid parameters → 400.
  for(const params of [{status:'published'},{reshare:'0'},{reshare:'true'},{consent:'v4'},{expiring:'0'},{expiring:'abc'},{expiring:'1.5'},{expiring:'366'},{from:'2001-2-3'},{from:'2001-02-30'},{to:'yesterday'},{from:'2001-02-04',to:'2001-02-03'},{id:'x'.repeat(201)}])
   assert.deepEqual([(await list(params)).status,(await list(params)).data],[400,{error:BAD}],JSON.stringify(params));
  for(const cursor of ['%%%','abc',cursorOf(['x']),cursorOf([1,2]),cursorOf({created:1,id:'x'}),cursorOf([1.5,'x'])])
   assert.deepEqual((await list({cursor})).data,{error:BAD_CURSOR},cursor);

  // Cursor paging: created DESC, id DESC, 50 a page, no duplicates or gaps, ties on created broken by id.
  sql(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<120)
   INSERT INTO stories(${cols}) SELECT ${q(P+'pg-')}||printf('%03d',i),'v6-test',${q(MP)},'測試內容','測試','recollection','pending',${q(consentOf.v3s)},${now}-(i/3)*1000,${now}-(i/3)*1000,NULL FROM n`);
  const pageAll=async(params,count)=>{
   const sizes=[],seen=[];let cursor;
   do{const r=await list({...params,...(cursor?{cursor}:{})});sizes.push(r.data.stories.length);seen.push(...ids(r));cursor=r.data.nextCursor;}while(cursor);
   const expected=Array.from({length:count},(_,k)=>k+1).map(i=>({id:'pg-'+String(i).padStart(3,'0'),created:now-Math.floor(i/3)*1000}))
    .sort((x,y)=>y.created-x.created||(x.id<y.id?1:-1)).map(x=>x.id);
   assert.deepEqual(seen,expected,'every row once, in order');
   return sizes;
  };
  assert.deepEqual(await pageAll({q:MP},120),[50,50,20]);
  sql(`DELETE FROM stories WHERE id>=${q(P+'pg-101')} AND id LIKE ${q(P+'pg-%')}`);
  assert.deepEqual(await pageAll({q:MP},100),[50,50],'a full last page ends with nextCursor null');

  // --- Feedback list: kind / story filters, problem reports first, story titles, paging.
  fb=(await session()).cookie;
  // Inserted directly with distinct times, so the expected order does not depend on request timing.
  sql(`INSERT INTO feedback(id,owner,story,kind,note,created) VALUES (${q(P+'fa-1')},'v6-test',${q(P+'a1')},'resonate',${q('共鳴 '+tag)},${now-3000}),(${q(P+'fa-2')},'v6-test',${q(P+'a1')},'report',${q('回報 '+tag)},${now-2000}),(${q(P+'fa-3')},'v6-test',${q(P+'a1')},'comment',${q('留言 '+tag)},${now-1000})`);
  assert.equal((await feedback({story:'demo-1',kind:'report',note:'示範 '+tag},fb)).status,200);
  {
   const r=await adminList('feedback',{story:P+'a1'});
   assert.deepEqual(r.data.feedback.map(f=>f.kind),['report','comment','resonate'],'reports first, then newest first');
   assert.ok(r.data.feedback.every(f=>f.storyTitle===M+' 已核准'),'title from the story');
   assert.deepEqual(Object.keys(r.data.feedback[0]).sort(),['created','id','kind','note','story','storyTitle']);
   assert.equal(r.data.nextCursor,null);
   assert.deepEqual((await adminList('feedback',{story:P+'a1',kind:'report'})).data.feedback.map(f=>f.note),['回報 '+tag]);
   assert.deepEqual((await adminList('feedback',{story:P+'a1',kind:'all'})).data.feedback.length,3);
   const demo=(await adminList('feedback',{story:'demo-1',kind:'report'})).data.feedback.find(f=>f.note==='示範 '+tag);
   assert.equal(demo.storyTitle,null,'demo stories have no title (the UI labels them 示範故事)');
   assert.ok((await adminList('feedback')).data.feedback.length>=4);
   for(const params of [{kind:'spam'},{story:'x'.repeat(201)}])assert.deepEqual((await adminList('feedback',params)).data,{error:BAD});
   assert.deepEqual((await adminList('feedback',{cursor:cursorOf([2,1,'x'])})).data,{error:BAD_CURSOR});
  }
  sql(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<60)
   INSERT INTO feedback(id,owner,story,kind,note,created) SELECT ${q(P+'fb-')}||printf('%02d',i),'v6-test',${q(P+'l1')},CASE WHEN i%5=0 THEN 'report' ELSE 'resonate' END,'',${now}-(i/2)*1000 FROM n`);
  {
   const seen=[],sizes=[];let cursor;
   do{const r=await adminList('feedback',{story:P+'l1',...(cursor?{cursor}:{})});sizes.push(r.data.feedback.length);seen.push(...r.data.feedback.map(f=>f.id.slice(P.length)));cursor=r.data.nextCursor;}while(cursor);
   const expected=Array.from({length:60},(_,k)=>k+1).map(i=>({id:'fb-'+String(i).padStart(2,'0'),report:i%5===0?1:0,created:now-Math.floor(i/2)*1000}))
    .sort((x,y)=>y.report-x.report||y.created-x.created||(x.id<y.id?1:-1)).map(x=>x.id);
   assert.deepEqual(sizes,[50,10]);assert.deepEqual(seen,expected,'feedback pages: reports first, no duplicates or gaps');
  }
  // Delete one feedback row: logged, then 404.
  {
   const id=P+'fb-07';
   assert.deepEqual((await deleteFeedback(id,{source:OTHER_PORT})).data,{error:'來源驗證失敗'});
   assert.deepEqual((await deleteFeedback(id,{admin:false})).data,{error:'只有管理者可以使用。'});
   assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE id=${q(id)}`)[0].n,1,'refused deletes change nothing');
   assert.deepEqual((await deleteFeedback(id)).data,{ok:true});
   assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE id=${q(id)}`)[0].n,0);
   assert.deepEqual([(await deleteFeedback(id)).status,(await deleteFeedback(id)).data],[404,{error:'找不到這筆回饋，可能已經刪除。'}]);
   assert.deepEqual(events([id]),['dev-admin@localhost delete_feedback feedback fb-07'],'one event, none for the 404s');
  }

  // --- Single-story moderation is logged: real changes only.
  insert([row('s1',MB+' 單篇','pending','v3s',now-HOUR),row('k1',MB+' 待審','pending','v3s',now-HOUR),row('k2',MB+' 已核准','approved','v3s',now-HOUR),row('k3',MB+' 過時','pending','v3s',now-HOUR),row('k4',MB+' 私人','private','v3p',now-HOUR),row('k5',MB+' 已不通過','rejected','v3s',now-HOUR),row('k6',MB+' 授權變了','pending','v3s',now-HOUR)]);
  sql(`INSERT INTO consent_events(story,action,consent_version,created) SELECT id,'submit',${q(V3)},created FROM stories WHERE id LIKE ${q(P+'%')} AND title LIKE ${q(MB+'%')}`);
  const listed=async()=>Object.fromEntries((await list({q:MB,status:'all'})).data.stories.map(x=>[x.id.slice(P.length),x]));
  {
   const s=(await listed()).s1, id=P+'s1';
   assert.equal((await moderate(id,{status:'approved',statusAt:s.statusAt,consentEvents:s.consentEvents},{admin:true})).status,200);
   assert.equal((await moderate(id,{status:'approved'},{admin:true})).status,200,'repeating a decision still succeeds');
   assert.equal((await moderate(id,{status:'rejected',statusAt:s.statusAt},{admin:true})).status,409);
   assert.equal((await moderate(id,{status:'rejected'},{admin:true})).status,200);
   assert.equal((await moderate(P+'k4',{status:'approved'},{admin:true})).status,400,'private: never approved');
   assert.equal((await moderate(id,{status:'delete'},{admin:true})).status,200);
   assert.equal((await moderate(id,{status:'delete'},{admin:true})).status,200,'deleting a missing story still answers ok');
   assert.deepEqual(events([id,P+'k4']),['approve','reject','delete_story'].map(a=>`dev-admin@localhost ${a} story s1`),'one event per change: not the repeat, the 409, the 400 or the second delete; kept after the story is deleted');
  }

  // --- Batch moderation: per-item results, never all-or-nothing.
  const SECOND={'x-dev-admin-email':'Second-Admin@Example.test'};
  const item=(s,patch={})=>({id:s.id,statusAt:s.statusAt,consentEvents:s.consentEvents,...patch});
  {
   const L=await listed(), one=[item(L.k1)];
   assert.deepEqual((await batchModerate({status:'approved',items:one})).data,{error:'核准必須逐篇閱讀原文，不能批次操作。'});
   assert.equal((await batchModerate({status:'approved',items:[item(L.k4)]})).status,400);
   for(const data of [null,[],{},{status:'rejected'},{status:'rejected',items:[]},{status:'publish',items:one},{status:'rejected',items:Array.from({length:51},(_,i)=>({id:'x'+i,statusAt:1,consentEvents:0}))},{status:'rejected',items:[...one,...one]},{status:'delete',items:[{id:L.k1.id}]},{status:'delete',items:[{...one[0],statusAt:'1'}]},{status:'delete',items:[{...one[0],id:''}]}])
    assert.deepEqual([(await batchModerate(data)).status,(await batchModerate(data)).data],[400,{error:'無效操作'}],JSON.stringify(data)?.slice(0,80));
   assert.equal((await call('POST','/api/admin/moderation',{raw:'{}',type:'text/plain',admin:true})).status,415);
   assert.equal((await batchModerate({status:'rejected',items:Array.from({length:50},(_,i)=>({id:P+'none-'+i,statusAt:1,consentEvents:0}))})).status,200,'50 items allowed');
   const r=await batchModerate({status:'rejected',adminEmail:'forged@example.test',email:'forged@example.test',items:[item(L.k1,{email:'forged@example.test'}),item(L.k2),item(L.k3,{statusAt:L.k3.statusAt+1}),item(L.k4),item(L.k5),item(L.k6,{consentEvents:L.k6.consentEvents+1}),{id:P+'missing',statusAt:1,consentEvents:0}]},{headers:SECOND});
   assert.equal(r.status,200);
   assert.deepEqual(r.data,{results:[{id:P+'k1',ok:true},{id:P+'k2',ok:true},{id:P+'k3',ok:false,error:'conflict'},{id:P+'k4',ok:false,error:'not_allowed'},{id:P+'k5',ok:false,error:'not_allowed'},{id:P+'k6',ok:false,error:'conflict'},{id:P+'missing',ok:false,error:'missing'}]});
   const after=await listed();
   assert.deepEqual(['k1','k2','k3','k4','k5','k6'].map(k=>after[k].status),['rejected','rejected','pending','private','rejected','pending']);
   assert.equal(after.k5.statusAt,L.k5.statusAt,'a refused item is not touched');
   assert.ok(after.k1.statusAt>=now&&after.k2.statusAt>=now,'status_at set');
   assert.equal(sql(`SELECT approved_at AS t FROM stories WHERE id=${q(P+'k2')}`)[0].t,null,'taken down: approved_at cleared');
   assert.ok(!(await stories()).data.stories.some(x=>x.id===P+'k2'),'and off the public list');
   assert.deepEqual(events(['k1','k2','k3','k4','k5','k6','missing'].map(k=>P+k)),['k1','k2'].map(k=>`second-admin@example.test reject story ${k}`),'only the successes are logged, under the verified identity (lowercased), never a body value');
   // Batch delete: any status, with feedback and consent events; statusAt is not checked (as for a single delete).
   sql(`INSERT INTO feedback(id,owner,story,kind,note,created) VALUES (${q(P+'fb-k3')},'v6-test',${q(P+'k3')},'report','',${now})`);
   const d=await batchModerate({status:'delete',items:[item(after.k3,{statusAt:1}),item(after.k4),item(after.k1),{id:P+'missing',statusAt:1,consentEvents:0}]});
   assert.deepEqual(d.data,{results:[{id:P+'k3',ok:true},{id:P+'k4',ok:true},{id:P+'k1',ok:true},{id:P+'missing',ok:false,error:'missing'}]});
   assert.equal(sql(`SELECT COUNT(*) AS n FROM stories WHERE id IN (${['k1','k3','k4'].map(k=>q(P+k)).join(',')})`)[0].n,0);
   assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE story=${q(P+'k3')}`)[0].n,0,'with their feedback');
   assert.equal(sql(`SELECT COUNT(*) AS n FROM consent_events WHERE story IN (${['k1','k3','k4'].map(k=>q(P+k)).join(',')})`)[0].n,0,'and consent events');
   assert.deepEqual(events(['k1','k3','k4','missing'].map(k=>P+k)).sort(),['second-admin@example.test reject story k1',...['k1','k3','k4'].map(k=>`dev-admin@localhost delete_story story ${k}`)].sort(),'the earlier reject of k1 stays after it is deleted');
   assert.deepEqual((await batchModerate({status:'delete',items:[item(after.k3)]})).data,{results:[{id:P+'k3',ok:false,error:'missing'}]});
  }

  // --- An expired story the retention job has not deleted yet: no moderation path
  // gives it a new window (or makes it permanent); it counts as missing, nothing is logged.
  {
   const id=P+'ex1', statusAt=now-31*DAY;
   insert([row('ex1',MB+' 過期待刪','pending','v3s',now-40*DAY,statusAt)]);
   sql(`INSERT INTO consent_events(story,action,consent_version,created) VALUES (${q(id)},'submit',${q(V3)},${now-40*DAY})`);
   const MISSING='文章不存在，或作者未同意分享';
   for(const data of [{status:'approved'},{status:'approved',statusAt,consentEvents:1},{status:'rejected'},{status:'rejected',statusAt,consentEvents:1}]){
    const r=await moderate(id,data,{admin:true});assert.deepEqual([r.status,r.data],[400,{error:MISSING}],JSON.stringify(data));
   }
   assert.deepEqual((await batchModerate({status:'rejected',items:[{id,statusAt,consentEvents:1}]})).data,{results:[{id,ok:false,error:'missing'}]});
   assert.deepEqual(sql(`SELECT status,status_at AS t,approved_at AS a FROM stories WHERE id=${q(id)}`),[{status:'pending',t:statusAt,a:null}],'unchanged');
   assert.deepEqual(events([id]),[],'nothing logged');
  }

  // --- Operation log: newest first, admin filter, targetExists, paging.
  {
   const r=await adminList('events');
   assert.equal(r.status,200);
   assert.ok(r.data.admins.includes('dev-admin@localhost')&&r.data.admins.includes('second-admin@example.test'));
   const mine=r.data.events.filter(e=>e.targetId.startsWith(P));
   assert.deepEqual(Object.keys(mine[0]).sort(),['action','adminEmail','created','id','targetExists','targetId','targetType']);
   const byTarget=(t,a)=>mine.find(e=>e.targetId===P+t&&e.action===a);
   assert.equal(byTarget('k2','reject').targetExists,true,'a live story');
   assert.equal(byTarget('k1','reject').targetExists,false,'（已刪除）');
   assert.equal(byTarget('s1','approve').targetExists,false);
   assert.equal(byTarget('fb-07','delete_feedback').targetExists,false);
   const created=r.data.events.map(e=>e.created);assert.deepEqual(created,[...created].sort((x,y)=>y-x),'newest first');
   const second=await adminList('events',{admin:'Second-Admin@Example.test'});
   assert.ok(second.data.events.length>=2&&second.data.events.every(e=>e.adminEmail==='second-admin@example.test'),'admin filter (case-insensitive)');
   assert.deepEqual((await adminList('events',{admin:'nobody@example.test'})).data.events,[]);
   assert.deepEqual((await adminList('events',{cursor:cursorOf([1,'x'])})).data,{error:BAD_CURSOR});
   assert.deepEqual((await adminList('events',{admin:'x'.repeat(321)})).data,{error:BAD});
   const pager='pager-'+tag+'@example.test';
   sql(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<60)
    INSERT INTO admin_events(admin_email,action,target_type,target_id,created) SELECT ${q(pager)},'approve','story',${q(P+'ev-')}||i,${now}-(i/2)*1000 FROM n`);
   const seen=[],sizes=[];let cursor;
   do{const p=await adminList('events',{admin:pager,...(cursor?{cursor}:{})});sizes.push(p.data.events.length);seen.push(...p.data.events.map(e=>e.id));cursor=p.data.nextCursor;}while(cursor);
   const expected=sql(`SELECT id FROM admin_events WHERE admin_email=${q(pager)} ORDER BY created DESC,id DESC`).map(e=>e.id);
   assert.deepEqual(sizes,[50,10]);assert.deepEqual(seen,expected,'event pages: no duplicates or gaps');
  }
 }finally{
  if(fb)assert.equal((await erase(fb)).status,200);
  sql(`DELETE FROM feedback WHERE story LIKE ${q(P+'%')} OR id LIKE ${q(P+'%')}; DELETE FROM consent_events WHERE story LIKE ${q(P+'%')}; DELETE FROM stories WHERE id LIKE ${q(P+'%')}`);
 }
}

// Admin delete removes any story, private ones included.
const extra=await submit({...story,share:false},b.cookie);assert.equal(extra.status,200);
assert.equal((await moderate(extra.data.id,{status:'delete'},{admin:true})).status,200);
assert.ok(!(await mine(b.cookie)).data.stories.some(x=>x.id===extra.data.id));
const erased=await erase(a.cookie);assert.equal(erased.status,200);assert.match(erased.setCookie,/^rl_session=;.*Max-Age=0/);
assert.equal((await erase(a.cookie)).status,401);
assert.equal((await erase(b.cookie)).status,200);
assert.equal((await adminAll('stories',{status:'all',q:story.title})).length,0);
console.log('PASS: removed v1 endpoints (404), unsupported methods (405), cross-origin rejection on POST and DELETE, body checks, session and admin auth (forged legacy header rejected), validation, path ids, isolation, moderation, private consent, v3 consent version, admin story list pages through every story (no cap, old approved found), the queue removed (404), durable reads, feedback, withdrawal, one-year sliding sessions (cookie re-issue, daily last_seen, old-cookie upgrade, expiry), logout, author sharing changes (every §6.1 transition, 409s, consent strings and events, re-review, per-story and daily caps, old consent versions, admin list counts, concurrent changes, moderation refused when the story changed since it was listed), V6-a admin API (summary counts, every story filter alone and combined, literal q, Taipei date range, invalid params, cursor paging without duplicates or gaps, expired stories hidden, feedback filters/titles/ordering/paging/delete, batch rejection and delete with per-item results, no batch approval, operation log: one event per real change, successes only, verified email, kept after deletion, admin filter, paging), erase, cleanup');
}finally{
 // Runs even when a check fails, so a failed run leaves no admin_events behind (nothing else here empties the table, so ids are not reused).
 sql(`DELETE FROM admin_events WHERE id>${firstEvent}`);
}
