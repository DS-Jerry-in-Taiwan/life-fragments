import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Retention policy (#4 §6, V3-a) against `npm run dev`. The daily Cron
// Trigger is fired through the Cloudflare Vite plugin's dev-only
// /cdn-cgi/handler/scheduled?time=<ms>, so a future `time` simulates "31 days
// later" for the retention job. Request handlers still use the real clock.
//
// Rules (lib/server/db/stories.ts): stories under a permanent consent version
// (PERMANENT_CONSENT_VERSIONS, which no real submission produces until V3-c)
// never expire once approved and otherwise expire 30 days after their last
// status change; stories under any other version (the old "30 days" terms)
// expire 30 days after `created`, whatever their status. Permanent-version
// stories are therefore inserted directly here.
//
// DESTRUCTIVE for the local D1: a run at now+30 days deletes every story that
// is not permanent and approved, and every feedback, writing attempt and
// session in it, not only this test's. Run it on a disposable .wrangler/state
// (CI: fresh per job).
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
const V2='v2-2026-11-05', V3='v3-2026-11-12'; // old terms / permanent (PERMANENT_CONSENT_VERSIONS)
const ownerOf=(cookie)=>createHash('sha256').update(cookie.split('=')[1]).digest('hex');
const sqlNum=(s)=>sql(s)[0].n;
const has=(table,col,id)=>sqlNum(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col}=${q(id)}`)===1;

// Approved permanent stories never expire, so an earlier failed run's would stay: remove them first.
for(const x of (await queue()).stories)if(x.title===story.title)await moderate(x.id,'delete');

// --- Backdated rows (inserted directly: the request handlers use the real clock,
// and real submissions can't produce a permanent consent version).
const t0=Date.now(), P='retention-test-';
const m=await session(), mOwner=ownerOf(m);
const OLD={
 permApproved:P+'perm-approved',   // v3, approved 400 days ago: never expires
 permPrivate:P+'perm-private',     // v3, private, last change 40 days ago: expired
 permFlip:P+'perm-flip',           // v3, approved 400 days ago, rejected now: 30 days from the rejection
 v2Approved:P+'v2-approved',       // v2, approved, created 40 days ago: expired despite approval
 v2Flip:P+'v2-flip',               // v2, created 40 days ago, approved and rejected now: still expired
 legacyApproved:P+'legacy-approved', // consent without a version, approved, created 31 days ago: expired
 feedback:P+'old-feedback',session:P+'old-session',
};
const row=(id,status,consent,created,statusAt,approvedAt)=>`(${q(id)},${q(mOwner)},${q(story.title)},${q(story.body)},'測試','recollection',${q(status)},${q(consent)},${created},${statusAt},${approvedAt??'NULL'})`;
const ev=(id,version,created)=>`(${q(id)},'submit',${q(version)},${created})`;
sql(`DELETE FROM stories WHERE id LIKE '${P}%'; DELETE FROM consent_events WHERE story LIKE '${P}%'; DELETE FROM feedback WHERE id LIKE '${P}%'; DELETE FROM sessions WHERE hash LIKE '${P}%';
INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,status_at,approved_at) VALUES
 ${row(OLD.permApproved,'approved',V3+':adult,privacy,share',t0-400*DAY,t0-400*DAY,t0-400*DAY)},
 ${row(OLD.permPrivate,'private',V3+':adult,privacy,private',t0-40*DAY,t0-40*DAY,null)},
 ${row(OLD.permFlip,'approved',V3+':adult,privacy,share',t0-400*DAY,t0-400*DAY,t0-400*DAY)},
 ${row(OLD.v2Approved,'approved',V2+':adult,privacy,share',t0-40*DAY,t0-40*DAY,t0-40*DAY)},
 ${row(OLD.v2Flip,'pending',V2+':adult,privacy,share',t0-40*DAY,t0-40*DAY,null)},
 ${row(OLD.legacyApproved,'approved','legacy',t0-31*DAY,t0-31*DAY,t0-31*DAY)};
INSERT INTO consent_events(story,action,consent_version,created) VALUES ${ev(OLD.permApproved,V3,t0-400*DAY)},${ev(OLD.permPrivate,V3,t0-40*DAY)},${ev(OLD.permFlip,V3,t0-400*DAY)},${ev(OLD.v2Approved,V2,t0-40*DAY)},${ev(OLD.v2Flip,V2,t0-40*DAY)},${ev(OLD.legacyApproved,'legacy',t0-31*DAY)};
INSERT INTO feedback(id,owner,story,kind,note,created) VALUES (${q(OLD.feedback)},${q(mOwner)},'demo-1','resonate','',${t0-40*DAY});
INSERT INTO sessions(hash,created,last_seen) VALUES (${q(OLD.session)},${t0-40*DAY},${t0-40*DAY});`);
const oldStories=[OLD.permApproved,OLD.permPrivate,OLD.permFlip,OLD.v2Approved,OLD.v2Flip,OLD.legacyApproved];
// Moderation through the API: the v3 story is rejected 400 days after its approval,
// the v2 story approved and then rejected; both now have a recent status_at.
await moderate(OLD.permFlip,'rejected');
await moderate(OLD.v2Flip,'approved');
await moderate(OLD.v2Flip,'rejected');
let rows=storyRows(oldStories);
for(const id of [OLD.permFlip,OLD.v2Flip]){assert.ok(rows[id].statusAt>=t0,'moderation sets status_at');assert.equal(rows[id].approvedAt,null,'leaving approved clears approved_at');}

// Read rules, everywhere: public list, feedback, my stories, admin queue.
const pub0=await publicIds();
assert.ok(pub0.includes(OLD.permApproved),'a 400-day-old approved permanent-version story is public');
assert.ok(!pub0.includes(OLD.v2Approved),'an approved v2 story is hidden 30 days after created');
assert.ok(!pub0.includes(OLD.legacyApproved),'so is an approved story without a consent version');
assert.equal((await feedback(OLD.permApproved,m)).status,200,'the permanent one accepts feedback');
assert.equal((await feedback(OLD.v2Approved,m)).status,404,'the expired v2 one does not');
assert.equal((await feedback(OLD.legacyApproved,m)).status,404);
const visible=[OLD.permApproved,OLD.permFlip];
assert.deepEqual((await mineIds(m)).filter(id=>id.startsWith(P)).sort(),[...visible].sort(),'my stories: permanent approved, and permanent rejected within 30 days of the rejection');
assert.deepEqual((await queue()).stories.map(x=>x.id).filter(id=>id.startsWith(P)).sort(),[...visible].sort(),'admin queue: same rule');
// Creating sessions no longer purges anything (v1 purged on every new session).
await session();
assert.equal(sqlNum(`SELECT (SELECT COUNT(*) FROM stories WHERE id LIKE '${P}%')+(SELECT COUNT(*) FROM feedback WHERE id=${q(OLD.feedback)})+(SELECT COUNT(*) FROM sessions WHERE hash=${q(OLD.session)}) AS n`),oldStories.length+2,'POST /api/session must not delete anything');

// --- Fresh rows through the API: real submissions use the old (v2) terms.
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
const events=eventsFor(all);
assert.equal(events.length,all.length,'submit writes one consent event');
for(const e of events){assert.equal(e.action,'submit');assert.equal(e.version,V2,'real submissions are not permanent before V3-c');}
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM stories WHERE id IN ${inList(all)} AND consent LIKE ${q(V2+':%')}`),all.length);
rows=storyRows(all);
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

// Separate the creation times from what follows, so a cron time can sit in between.
await sleep(4000);
const attempt2=crypto.randomUUID();
assert.equal((await call('POST','/api/writing-attempts',{cookie:a,data:{id:attempt2,letterType:'present'}})).status,200);
assert.equal((await feedback(S.approved,b)).status,200);
assert.equal((await feedback(S.flip,b)).status,200);
assert.equal((await feedback('demo-2',b)).status,200);
const beforeReject=Date.now();
await moderate(S.flip,'rejected');
const afterReject=Date.now();
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM feedback WHERE owner=${q(ownerOf(b))} AND created<${beforeReject-1500}`)+sqlNum(`SELECT COUNT(*) AS n FROM writing_attempts WHERE id=${q(attempt2)} AND created<${beforeReject-1500}`),0,'test too slow: these rows must be younger than the next cron cutoff');
rows=storyRows(all);
assert.ok(rows[S.flip].statusAt>=beforeReject&&rows[S.flip].statusAt<=afterReject,'rejection sets status_at');
assert.ok((await publicIds()).includes(S.approved),'a fresh approved v2 story is public');

// --- Cron at now+29 days: this run's rows are not old enough yet.
await cron(Date.now()+29*DAY);
assert.deepEqual(Object.keys(storyRows(all)).sort(),[...all].sort(),'recent stories survive');
assert.equal(eventsFor(all).length,all.length);
assert.equal(feedbackOn([S.approved,S.flip]),2);
assert.ok(has('writing_attempts','id',attempt)&&has('writing_attempts','id',attempt2));
assert.equal((await mineIds(a)).length,all.length,'the session survives too');
// Backdated rows: only the permanent approved story and the recently rejected permanent one remain.
rows=storyRows(oldStories);
assert.deepEqual(Object.keys(rows).sort(),[...visible].sort(),'v2/legacy stories deleted 30 days after created, approved or not; permanent private deleted 30 days after status_at');
assert.deepEqual(eventsFor(oldStories).map(e=>e.story).sort(),[...visible].sort(),'with their consent events');
assert.equal(feedbackOn([OLD.v2Approved]),0);
assert.ok(!has('feedback','id',OLD.feedback),'old feedback deleted');
assert.ok(!has('sessions','hash',OLD.session),'old session deleted');

// --- Cron just under 30 days after the rejection: every v2 story was created
// more than 30 days before it, approved ones and the recently rejected one
// included; the newer feedback and attempt are not old enough.
const metricBefore=(await queue()).metrics.find(x=>x.letterType==='present')?.starts||0;
assert.ok(metricBefore>=2,'both attempts counted');
await cron(beforeReject+AGE-1500);
rows=storyRows(all);
assert.deepEqual(Object.keys(rows),[],'v2 stories deleted 30 days after created, whatever their status or status_at');
assert.equal(eventsFor(all).length,0,'with their consent events');
assert.equal(feedbackOn([S.approved,S.flip]),0,'and their feedback, even feedback younger than 30 days');
assert.ok(!(await publicIds()).includes(S.approved));
assert.ok(has('feedback','story','demo-2'),'feedback younger than 30 days kept');
assert.ok(!has('writing_attempts','id',attempt),'writing attempt deleted 30 days after created');
assert.ok(has('writing_attempts','id',attempt2),'a newer attempt kept');
const remaining=sqlNum("SELECT COUNT(*) AS n FROM writing_attempts WHERE letter_type='present'");
const metricAfter=(await queue()).metrics.find(x=>x.letterType==='present')?.starts||0;
assert.ok(remaining>=1&&remaining<metricBefore,'the cron removed some attempts and kept the newer one');
assert.equal(metricAfter,remaining,'metrics count exactly the remaining attempts');
assert.ok(!storyRows([OLD.permFlip])[OLD.permFlip],'permanent rejected story deleted 30 days after the rejection');
assert.ok(storyRows([OLD.permApproved])[OLD.permApproved],'permanent approved story never auto-deleted');

// --- Cron 30 days after everything: feedback and sessions go; the permanent approved story stays.
await cron(afterReject+AGE+1000);
assert.ok(!has('feedback','story','demo-2'),'feedback deleted 30 days after created');
assert.ok(!has('writing_attempts','id',attempt2));
assert.deepEqual(await mineIds(a),[],'sessions expire 30 days after created (v1 rule until V3-c)');
assert.ok((await publicIds()).includes(OLD.permApproved),'permanent approved story stays public');
assert.equal(eventsFor([OLD.permApproved]).length,1);
assert.equal(sqlNum('SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)'),0,'no orphaned consent events');

// --- Every other delete path removes consent events with the story.
const c=await session();
const w=await submit(c), e1=await submit(c,{share:false});
assert.equal(eventsFor([w,e1]).length,2);
assert.equal((await call('DELETE','/api/me/stories/'+w,{cookie:c})).status,200);
assert.equal(eventsFor([w]).length,0,'withdraw deletes consent events');
assert.equal((await call('DELETE','/api/me',{cookie:c})).status,200);
assert.equal(eventsFor([e1]).length,0,'erase-all deletes consent events');
await moderate(OLD.permApproved,'delete');
assert.equal(eventsFor([OLD.permApproved]).length,0,'admin delete deletes consent events');
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM stories WHERE title=${q(story.title)}`),0,'test stories removed');
assert.equal(sqlNum('SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)'),0,'no orphaned consent events');
console.log('PASS: retention — real submissions use the old consent version; old-version stories (approved included) hidden and deleted 30 days after created, a later approval/rejection never extends it; permanent-version approved stories never expire (public, feedback, my stories, admin queue), other permanent-version stories expire 30 days after status_at (rejection restarts it); feedback/attempts/sessions deleted after 30 days with exact metrics; session creation purges nothing; consent events written on submit and deleted with their story on retention, withdraw, erase and admin delete');
