import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Retention policy (#4 §6, V3-a) against `npm run dev`. The daily Cron
// Trigger is fired through the Cloudflare Vite plugin's dev-only
// /cdn-cgi/handler/scheduled?time=<ms>, so a future `time` simulates "31 days
// later" for the retention job. Request handlers still use the real clock.
//
// DESTRUCTIVE for the local D1: a run at now+30 days deletes every
// non-approved story, feedback, writing attempt and session in it, not only
// this test's. Run it on a disposable .wrangler/state (CI: fresh per job).
//
// Rows are inspected (and a few backdated rows inserted, for what the clock
// can't simulate) with `wrangler d1 execute --local`, which opens the same
// .wrangler/state database as the dev server.
const root=fileURLToPath(new URL('..',import.meta.url));
const token=process.env.DEV_ADMIN_TOKEN||readFileSync(new URL('../.wrangler/dev-admin-token',import.meta.url),'utf8').trim();
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const ADMIN={'x-dev-admin-token':token,'x-dev-admin-email':'dev-admin@localhost'};
const DAY=24*60*60*1000, AGE=30*DAY;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

/**
 * fetch(), retried once when a kept-alive socket was closed by the dev server
 * while idle (its keep-alive timeout is 5 s; the sql() calls in between are
 * slow). No response was received, so the request never reached the app.
 */
async function request(url,init){
 try{return await fetch(url,init);}
 catch(e){if(e.cause?.code!=='UND_ERR_SOCKET')throw e;return fetch(url,init);}
}
async function call(method,path,{data,cookie='',admin=false}={}){
 const h={...(method!=='GET'?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(admin?ADMIN:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})};
 const r=await request(origin+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data),redirect:'manual'});
 const t=await r.text();let body;try{body=JSON.parse(t);}catch{body={raw:t};}
 return {status:r.status,data:body,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const session=async()=>{const r=await call('POST','/api/session');assert.equal(r.status,200);assert.ok(r.cookie);return r.cookie;};
const submit=async(cookie,extra={})=>{const r=await call('POST','/api/me/stories',{cookie,data:{...story,...extra}});assert.equal(r.status,200,JSON.stringify(r));return r.data.id;};
const moderate=async(id,status)=>assert.equal((await call('POST','/api/admin/stories/'+encodeURIComponent(id)+'/moderation',{admin:true,data:{status}})).status,200);
const queue=async()=>{const r=await call('GET','/api/admin/queue',{admin:true});assert.equal(r.status,200);return r.data;};
const publicIds=async()=>(await call('GET','/api/stories')).data.stories.map(x=>x.id);
const mineIds=async(cookie)=>(await call('GET','/api/me/stories',{cookie})).data.stories.map(x=>x.id);
const feedback=(story,cookie)=>call('POST','/api/feedback',{cookie,data:{story,kind:'resonate',note:'保留政策測試'}});
/** Fires the Cron Trigger as if it were `time` (ms). */
async function cron(time){
 const r=await request(`${origin}/cdn-cgi/handler/scheduled?time=${time}`);
 assert.equal(r.status,200,'scheduled handler failed');assert.equal(await r.text(),'ok');
}
/** Runs SQL on the local D1; returns the rows of the last statement. */
function sql(command){
 const out=execFileSync('npx',['wrangler','d1','execute','DB','--local','--json','--command',command],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 return JSON.parse(out).at(-1).results;
}
const q=(s)=>"'"+String(s).replaceAll("'","''")+"'";
const inList=(ids)=>'('+ids.map(q).join(',')+')';
const storyRows=(ids)=>Object.fromEntries(sql(`SELECT id,status,created,status_at AS statusAt,approved_at AS approvedAt FROM stories WHERE id IN ${inList(ids)}`).map(r=>[r.id,r]));
const eventsFor=(ids)=>sql(`SELECT story,action,consent_version AS version FROM consent_events WHERE story IN ${inList(ids)}`);
const feedbackOn=(ids)=>sql(`SELECT COUNT(*) AS n FROM feedback WHERE story IN ${inList(ids)}`)[0].n;
const story={title:'保留政策測試，結束即刪除',body:'這是一篇測試資料，用來驗證資料保留政策。這段內容不是真實使用者的經歷，測試完成後將刪除。',era:'測試日期',source:'recollection',adult:true,privacy:true,share:true};

// Approved stories never expire, so an earlier failed run's would stay: remove them first.
for(const x of (await queue()).stories)if(x.title===story.title)await moderate(x.id,'delete');

// --- Backdated rows (inserted directly: the request handlers use the real clock).
const t0=Date.now(), P='retention-test-';
const OLD={approved:P+'old-approved',privateStory:P+'old-private',feedback:P+'old-feedback',session:P+'old-session'};
sql(`DELETE FROM stories WHERE id LIKE '${P}%'; DELETE FROM consent_events WHERE story LIKE '${P}%'; DELETE FROM feedback WHERE id LIKE '${P}%'; DELETE FROM sessions WHERE hash LIKE '${P}%';
INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,status_at,approved_at) VALUES
 (${q(OLD.approved)},'${P}owner',${q(story.title)},${q(story.body)},'測試','recollection','approved','v2-2026-11-05:adult,privacy,share',${t0-400*DAY},${t0-400*DAY},${t0-400*DAY}),
 (${q(OLD.privateStory)},'${P}owner',${q(story.title)},${q(story.body)},'測試','recollection','private','v2-2026-11-05:adult,privacy,private',${t0-40*DAY},${t0-40*DAY},NULL);
INSERT INTO consent_events(story,action,consent_version,created) VALUES (${q(OLD.approved)},'submit','v2-2026-11-05',${t0-400*DAY}),(${q(OLD.privateStory)},'submit','v2-2026-11-05',${t0-40*DAY});
INSERT INTO feedback(id,owner,story,kind,note,created) VALUES (${q(OLD.feedback)},'${P}owner','demo-1','resonate','',${t0-40*DAY});
INSERT INTO sessions(hash,created,last_seen) VALUES (${q(OLD.session)},${t0-40*DAY},${t0-40*DAY});`);

// Read rules: approved stories never expire; others are hidden 30 days after their last status change.
assert.ok((await publicIds()).includes(OLD.approved),'a 400-day-old approved story is public');
assert.equal((await feedback(OLD.approved,await session())).status,200,'and accepts feedback');
let ids=(await queue()).stories.map(x=>x.id);
assert.ok(ids.includes(OLD.approved),'admin queue lists old approved stories');
assert.ok(!ids.includes(OLD.privateStory),'admin queue hides a private story 40 days after its last status change');
// Creating sessions no longer purges anything (v1 purged on every new session).
await session();
assert.equal(sql(`SELECT (SELECT COUNT(*) FROM stories WHERE id LIKE '${P}%')+(SELECT COUNT(*) FROM feedback WHERE id=${q(OLD.feedback)})+(SELECT COUNT(*) FROM sessions WHERE hash=${q(OLD.session)}) AS n`)[0].n,4,'POST /api/session must not delete anything');

// --- Fresh rows through the API.
const a=await session(), b=await session();
const attempt=crypto.randomUUID();
assert.equal((await call('POST','/api/writing-attempts',{cookie:a,data:{id:attempt,letterType:'present'}})).status,200);
const S={
 private:await submit(a,{share:false}),
 pending:await submit(a),
 rejected:await submit(a),
 approved:await submit(a),
 flip:await submit(a), // approved, later rejected
};
const all=Object.values(S);
// Submit writes one consent event with the current consent version.
const events=eventsFor(all);
assert.equal(events.length,all.length);
for(const e of events){assert.equal(e.action,'submit');assert.match(e.version,/^v\d+-\d{4}-\d{2}-\d{2}$/);assert.notEqual(e.version,'v2-2026-11-05');}
let rows=storyRows(all);
for(const id of all)assert.equal(rows[id].statusAt,rows[id].created,'status_at starts at created');
await moderate(S.rejected,'rejected');
await moderate(S.approved,'approved');
await moderate(S.flip,'approved');
rows=storyRows(all);
assert.ok(rows[S.approved].approvedAt>=rows[S.approved].created,'approval sets approved_at');
assert.equal(rows[S.rejected].approvedAt,null);
assert.equal(rows[S.private].approvedAt,null);
const approvedAt=rows[S.approved].approvedAt;
await sleep(5);
await moderate(S.approved,'approved'); // repeating a decision changes no timestamp
rows=storyRows(all);
assert.equal(rows[S.approved].approvedAt,approvedAt);assert.equal(rows[S.approved].statusAt,approvedAt);
assert.ok(rows[S.flip].approvedAt);

// Separate the creation times from what follows, so a cron time can sit in between.
await sleep(4000);
assert.equal((await feedback(S.approved,b)).status,200);
assert.equal((await feedback(S.flip,b)).status,200);
assert.equal((await feedback('demo-2',b)).status,200);
const beforeReject=Date.now();
await moderate(S.flip,'rejected');
const afterReject=Date.now();
rows=storyRows(all);
assert.equal(rows[S.flip].status,'rejected');
assert.equal(rows[S.flip].approvedAt,null,'leaving approved clears approved_at');
assert.ok(rows[S.flip].statusAt>=beforeReject&&rows[S.flip].statusAt<=afterReject,'rejection sets status_at');
assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE owner<>'${P}owner' AND created<${beforeReject-1500} AND story IN ${inList([S.approved,S.flip])}`)[0].n,0,'test too slow: feedback must be younger than the next cron cutoff');
assert.ok(((await queue()).metrics.find(x=>x.letterType==='present')?.starts||0)>=1);

// --- Cron at now+29 days: nothing of this run's is old enough yet.
await cron(Date.now()+29*DAY);
assert.deepEqual(Object.keys(storyRows(all)).sort(),[...all].sort(),'recent stories survive');
assert.equal(eventsFor(all).length,all.length);
assert.equal(feedbackOn([S.approved,S.flip]),2);
assert.equal(sql(`SELECT COUNT(*) AS n FROM writing_attempts WHERE id=${q(attempt)}`)[0].n,1);
assert.equal((await mineIds(a)).length,all.length,'the session survives too');
// ...but the backdated rows are past 30 days: all deleted except the old approved story.
assert.equal(sql(`SELECT COUNT(*) AS n FROM stories WHERE id=${q(OLD.privateStory)}`)[0].n,0,'old private story deleted');
assert.equal(eventsFor([OLD.privateStory]).length,0,'with its consent events');
assert.equal(sql(`SELECT COUNT(*) AS n FROM feedback WHERE id=${q(OLD.feedback)}`)[0].n,0,'old feedback deleted');
assert.equal(sql(`SELECT COUNT(*) AS n FROM sessions WHERE hash=${q(OLD.session)}`)[0].n,0,'old session deleted');
assert.ok((await publicIds()).includes(OLD.approved),'old approved story survives');
assert.equal(eventsFor([OLD.approved]).length,1);

// --- Cron just under 30 days after the rejection: the stories' created (and
// status_at, for those never moderated) are past 30 days; the flipped story's
// status_at and the feedback are not.
await cron(beforeReject+AGE-1500);
rows=storyRows(all);
for(const k of ['private','pending','rejected'])assert.ok(!rows[S[k]],`${k} story deleted 30 days after its last status change`);
assert.equal(eventsFor([S.private,S.pending,S.rejected]).length,0,'with their consent events');
assert.ok(rows[S.approved],'approved story kept');
assert.ok(rows[S.flip],'approved-then-rejected story counts 30 days from the rejection, not from created');
assert.equal(eventsFor([S.approved,S.flip]).length,2);
assert.equal(feedbackOn([S.approved,S.flip]),2,'feedback younger than 30 days kept');
assert.equal(sql(`SELECT COUNT(*) AS n FROM writing_attempts WHERE id=${q(attempt)}`)[0].n,0,'writing attempt deleted after 30 days');
assert.equal(((await queue()).metrics.find(x=>x.letterType==='present')?.starts||0),sql("SELECT COUNT(*) AS n FROM writing_attempts WHERE letter_type='present'")[0].n,'metrics only count the remaining attempts');

// --- Cron 30 days after the rejection.
await cron(afterReject+AGE+1000);
rows=storyRows(all);
assert.ok(!rows[S.flip],'rejected story deleted 30 days after the rejection');
assert.equal(eventsFor([S.flip]).length,0);
assert.equal(feedbackOn([S.flip]),0,'with its feedback');
assert.equal(feedbackOn([S.approved]),0,'feedback deleted 30 days after created');
assert.ok(rows[S.approved],'approved story never auto-deleted');
assert.equal(eventsFor([S.approved]).length,1);
const pub=await publicIds();
assert.ok(pub.includes(S.approved)&&pub.includes(OLD.approved),'approved stories stay public');
assert.deepEqual(await mineIds(a),[],'sessions expire 30 days after created (v1 rule until V3-c)');
assert.equal((await call('GET','/api/me/stories',{cookie:a})).status,200);
assert.equal(sql(`SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)`)[0].n,0,'no orphaned consent events');

// --- Every other delete path removes consent events with the story.
const c=await session();
const w=await submit(c), e1=await submit(c,{share:false});
assert.equal(eventsFor([w,e1]).length,2);
assert.equal((await call('DELETE','/api/me/stories/'+w,{cookie:c})).status,200);
assert.equal(eventsFor([w]).length,0,'withdraw deletes consent events');
assert.equal((await call('DELETE','/api/me',{cookie:c})).status,200);
assert.equal(eventsFor([e1]).length,0,'erase-all deletes consent events');
for(const id of [S.approved,OLD.approved])await moderate(id,'delete');
assert.equal(eventsFor([S.approved,OLD.approved]).length,0,'admin delete deletes consent events');
assert.ok(!(await queue()).stories.some(x=>x.title===story.title),'test stories removed');
assert.equal(sql(`SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)`)[0].n,0,'no orphaned consent events');
console.log('PASS: retention — approved stories never expire (public, feedback, admin queue), non-approved stories hidden and deleted 30 days after status_at with feedback and consent events, approved→rejected restarts the window, feedback/attempts/sessions deleted after 30 days, session creation purges nothing, consent events written on submit and deleted on withdraw/erase/admin delete');
