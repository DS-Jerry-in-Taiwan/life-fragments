import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Runs against `npm run dev`. The dev server only grants an admin identity to
// requests carrying its per-run secret (vite.config.ts devAdminIdentity()).
const token=process.env.DEV_ADMIN_TOKEN||readFileSync(new URL('../.wrangler/dev-admin-token',import.meta.url),'utf8').trim();
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const ADMIN={'x-dev-admin-token':token,'x-dev-admin-email':'dev-admin@localhost'};
// The vinext dev server itself answers foreign origins with a plain 403
// "Forbidden" before the app runs; another localhost port gets through to the
// app's own same-origin check (lib/server/same-origin.ts).
const ATTACKER='https://attacker.example', OTHER_PORT='http://localhost:1';
async function body(r){const t=await r.text();try{return JSON.parse(t);}catch{return {raw:t};}}
/** One request. `data` (when given) is sent as JSON unless `raw` is set; non-GET requests carry Origin unless `source` is null. */
async function call(method,path,{data,raw,type='application/json',cookie='',admin=false,source=origin,headers={}}={}){
 const h={...(source&&method!=='GET'?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(admin?ADMIN:{}),...headers};
 let payload;if(raw!==undefined){payload=raw;h['Content-Type']=type;}else if(data!==undefined){payload=JSON.stringify(data);h['Content-Type']=type;}
 const r=await fetch(origin+path,{method,headers:h,body:payload,redirect:'manual'});
 return {status:r.status,data:await body(r),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};
}
const session=(o)=>call('POST','/api/session',o);
const stories=()=>call('GET','/api/stories');
const mine=(cookie)=>call('GET','/api/me/stories',{cookie});
const submit=(data,cookie,o={})=>call('POST','/api/me/stories',{data,cookie,...o});
const start=(data,cookie,o={})=>call('POST','/api/writing-attempts',{data,cookie,...o});
const withdraw=(id,cookie,o={})=>call('DELETE','/api/me/stories/'+encodeURIComponent(id),{cookie,...o});
const erase=(cookie,o={})=>call('DELETE','/api/me',{cookie,...o});
const feedback=(data,cookie)=>call('POST','/api/feedback',{data,cookie});
const adminGet=(admin=true,headers={})=>call('GET','/api/admin/queue',{admin,headers});
const moderate=(id,data,{cookie='',admin=false,source=origin}={})=>call('POST','/api/admin/stories/'+encodeURIComponent(id)+'/moderation',{data,cookie,admin,source});

// The v1 action endpoints are gone (no compatibility layer).
for(const [m,p] of [['GET','/api/letter'],['POST','/api/letter'],['GET','/api/admin'],['POST','/api/admin']])
 assert.equal((await call(m,p,{data:m==='POST'?{action:'session'}:undefined})).status,404,`${m} ${p}`);
// Methods a route doesn't export → 405 from the framework.
for(const [m,p] of [['POST','/api/stories'],['DELETE','/api/stories'],['GET','/api/session'],['GET','/api/writing-attempts'],['GET','/api/me'],['POST','/api/me'],['PUT','/api/me/stories'],['GET','/api/me/stories/x'],['POST','/api/me/stories/x'],['GET','/api/feedback'],['POST','/api/admin/queue'],['GET','/api/admin/stories/x/moderation'],['DELETE','/api/admin/stories/x/moderation']])
 assert.equal((await call(m,p,{admin:true})).status,405,`${m} ${p}`);

// Same-origin check on every POST and DELETE (missing Origin is rejected too).
assert.equal((await session({source:ATTACKER})).status,403);
assert.equal((await session({source:null})).status,403);
for(const source of [ATTACKER,OTHER_PORT,null]){
 assert.equal((await erase('',{source})).status,403);
 assert.equal((await withdraw('x','',{source})).status,403);
 assert.equal((await call('POST','/api/feedback',{data:{},source})).status,403);
 assert.equal((await submit({},'',{source})).status,403);
 assert.equal((await start({},'',{source})).status,403);
 assert.equal((await moderate('x',{status:'approved'},{admin:true,source})).status,403);
}
for(const source of [OTHER_PORT,null]){
 assert.deepEqual((await erase('',{source})).data,{error:'來源驗證失敗'});
 assert.deepEqual((await withdraw('x','',{source})).data,{error:'來源驗證失敗'});
 assert.deepEqual((await session({source})).data,{error:'來源驗證失敗'});
}
// Session required (after the body checks, as in v1).
assert.equal((await submit({})).status,401);
assert.equal((await start({})).status,401);
assert.equal((await feedback({})).status,401);
assert.equal((await erase('')).status,401);
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

const a=await session(), b=await session();assert.equal(a.status,200);assert.ok(a.cookie);assert.ok(b.cookie);
const again=await session({cookie:a.cookie});assert.deepEqual(again.data,{ok:true});assert.equal(again.setCookie,null);
const story={title:'自動測試文章，結束即刪除',body:'這是一篇測試資料，用來驗證投稿與權限流程。這段內容不是真實使用者的經歷，測試完成後將刪除。',era:'測試日期',source:'recollection',adult:true,privacy:true,share:true};
assert.equal((await submit({...story,body:'太短'},a.cookie)).status,400);
assert.equal((await submit({...story,adult:false},a.cookie)).status,400);
const s=await submit(story,a.cookie);assert.equal(s.status,200);assert.equal(s.data.status,'pending');const id=s.data.id;
assert.ok(!(await stories()).data.stories.some(x=>x.id===id));
assert.ok((await mine(a.cookie)).data.stories.some(x=>x.id===id));
assert.ok(!(await mine(b.cookie)).data.stories.some(x=>x.id===id));
assert.deepEqual((await withdraw(id,b.cookie)),{status:404,data:{error:'找不到屬於這個瀏覽器的片段。'},cookie:undefined,setCookie:null});
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
assert.ok((await adminGet()).data.feedback.some(x=>x.story===id));
const privateStory=await submit({...story,share:false},a.cookie);assert.equal(privateStory.status,200);assert.equal(privateStory.data.status,'private');
assert.equal((await moderate(privateStory.data.id,{status:'approved'},{admin:true})).status,400);
assert.deepEqual((await withdraw(id,a.cookie)).data,{ok:true});
assert.ok(!(await stories()).data.stories.some(x=>x.id===id));
assert.ok(!(await adminGet()).data.feedback.some(x=>x.story===id),'withdraw deletes the story\'s feedback');
assert.equal((await feedback({story:id,kind:'resonate',note:''},b.cookie)).status,404);
const before=(await adminGet()).data.metrics;
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
 const metric=(await adminGet()).data.metrics.find(x=>x.letterType===type);const old=before.find(x=>x.letterType===type);assert.equal(metric.starts,(old?.starts||0)+1);assert.equal(metric.completions,(old?.completions||0)+1);
}
// Admin delete removes any story, private ones included.
const extra=await submit({...story,share:false},b.cookie);assert.equal(extra.status,200);
assert.equal((await moderate(extra.data.id,{status:'delete'},{admin:true})).status,200);
assert.ok(!(await mine(b.cookie)).data.stories.some(x=>x.id===extra.data.id));
const erased=await erase(a.cookie);assert.equal(erased.status,200);assert.match(erased.setCookie,/^rl_session=;.*Max-Age=0/);
assert.equal((await erase(a.cookie)).status,401);
assert.equal((await erase(b.cookie)).status,200);
assert.ok(!(await adminGet()).data.stories.some(x=>x.title===story.title));
console.log('PASS: removed v1 endpoints (404), unsupported methods (405), cross-origin rejection on POST and DELETE, body checks, session and admin auth (forged legacy header rejected), validation, path ids, isolation, moderation, private consent, durable reads, feedback, withdrawal, erase, cleanup');
