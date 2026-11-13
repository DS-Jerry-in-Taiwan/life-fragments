import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Retention policy (#4 §6, V3-a; sessions and the consent switch, V3-c) against `npm run dev`. The daily Cron
// Trigger is fired through the Cloudflare Vite plugin's dev-only
// /cdn-cgi/handler/scheduled?time=<ms>, so a future `time` simulates "31 days
// later" for the retention job. Request handlers still use the real clock.
//
// Rules (lib/server/db/stories.ts): stories under a permanent consent version
// (PERMANENT_CONSENT_VERSIONS; every real submission since V3-c) never expire
// once approved and otherwise expire 30 days after their last status change;
// stories under any other version (the old "30 days" terms) expire 30 days
// after `created`, whatever their status. Old-version stories are therefore
// inserted directly here. Sessions expire one year after their last visit
// (last_seen), whenever they were created.
//
// DESTRUCTIVE for the local D1: a run at now+30 days deletes every story that
// is not permanent and approved, and every feedback and writing attempt in it,
// and a run at now+366 days every session, not only this test's. Run it on a
// disposable .wrangler/state (CI: fresh per job).
//
// Rows are inspected (and a few backdated rows inserted, for what the clock
// can't simulate) with `wrangler d1 execute --local`, which opens the same
// .wrangler/state database as the dev server.
const root=fileURLToPath(new URL('..',import.meta.url));
const token=process.env.DEV_ADMIN_TOKEN||readFileSync(new URL('../.wrangler/dev-admin-token',import.meta.url),'utf8').trim();
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const ADMIN={'x-dev-admin-token':token,'x-dev-admin-email':'dev-admin@localhost'};
const DAY=24*60*60*1000, AGE=30*DAY, SESSION_AGE=365*DAY;
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
// and real submissions only produce the current, permanent consent version).
const t0=Date.now(), P='retention-test-';
const m=await session(), mOwner=ownerOf(m);
const OLD={
 permApproved:P+'perm-approved',   // v3, approved 400 days ago: never expires
 permPrivate:P+'perm-private',     // v3, private, last change 40 days ago: expired
 permFlip:P+'perm-flip',           // v3, approved 400 days ago, rejected now: 30 days from the rejection
 v2Approved:P+'v2-approved',       // v2, approved, created 40 days ago: expired despite approval
 v2Flip:P+'v2-flip',               // v2, created 40 days ago, approved and rejected now: still expired
 legacyApproved:P+'legacy-approved', // consent without a version, approved, created 31 days ago: expired
 feedback:P+'old-feedback',
 sessionSeen:P+'session-seen',     // created 400 days ago, last seen 40 days ago: live, kept
 sessionStale:P+'session-stale',   // created 400 days ago, last seen 366 days ago: deleted
 sessionNull:P+'session-null',     // created 366 days ago, no last_seen (pre-0003 row): deleted
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
INSERT INTO sessions(hash,created,last_seen) VALUES (${q(OLD.sessionSeen)},${t0-400*DAY},${t0-40*DAY}),(${q(OLD.sessionStale)},${t0-400*DAY},${t0-366*DAY}),(${q(OLD.sessionNull)},${t0-366*DAY},NULL);`);
const oldSessions=[OLD.sessionSeen,OLD.sessionStale,OLD.sessionNull];
const sessionsLeft=(hashes)=>sql(`SELECT hash FROM sessions WHERE hash IN ${inList(hashes)}`).map(r=>r.hash).sort();
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
assert.equal(sqlNum(`SELECT (SELECT COUNT(*) FROM stories WHERE id LIKE '${P}%')+(SELECT COUNT(*) FROM feedback WHERE id=${q(OLD.feedback)})+(SELECT COUNT(*) FROM sessions WHERE hash IN ${inList(oldSessions)}) AS n`),oldStories.length+1+oldSessions.length,'POST /api/session must not delete anything');

// --- Fresh rows through the API: real submissions use the current, permanent (v3) terms.
const a=await session(), b=await session();
const attempt=crypto.randomUUID();
assert.equal((await call('POST','/api/writing-attempts',{cookie:a,data:{id:attempt,letterType:'present'}})).status,200);
const S={
 private:await submit(a,{share:false}),
 pending:await submit(a),
 rejected:await submit(a),
 approved:await submit(a), // stays: v3 and approved
 flip:await submit(a), // approved, later rejected
};
const all=Object.values(S);
const events=eventsFor(all);
assert.equal(events.length,all.length,'submit writes one consent event');
for(const e of events){assert.equal(e.action,'submit');assert.equal(e.version,V3,'real submissions use the permanent consent version since V3-c');}
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM stories WHERE id IN ${inList(all)} AND consent LIKE ${q(V3+':%')}`),all.length);
rows=storyRows(all);
for(const id of all)assert.equal(rows[id].statusAt,rows[id].created,'status_at starts at created');
// Fresh old-terms (v2) stories, as submitted just before V3-c went live, approved through the API now.
const V2S={approved:P+'v2-fresh-approved',flip:P+'v2-fresh-flip'};
const v2All=Object.values(V2S);
const tv2=Date.now();
sql(`INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,status_at,approved_at) VALUES
 ${row(V2S.approved,'pending',V2+':adult,privacy,share',tv2,tv2,null)},${row(V2S.flip,'pending',V2+':adult,privacy,share',tv2,tv2,null)};
INSERT INTO consent_events(story,action,consent_version,created) VALUES ${ev(V2S.approved,V2,tv2)},${ev(V2S.flip,V2,tv2)};`);
await moderate(S.rejected,'rejected');
await moderate(S.approved,'approved');
await moderate(S.flip,'approved');
for(const id of v2All)await moderate(id,'approved');
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
assert.equal((await feedback(V2S.approved,b)).status,200);
assert.equal((await feedback('demo-2',b)).status,200);
const beforeReject=Date.now();
await moderate(S.flip,'rejected');
await moderate(V2S.flip,'rejected');
const afterReject=Date.now();
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM feedback WHERE owner=${q(ownerOf(b))} AND created<${beforeReject-1500}`)+sqlNum(`SELECT COUNT(*) AS n FROM writing_attempts WHERE id=${q(attempt2)} AND created<${beforeReject-1500}`),0,'test too slow: these rows must be younger than the next cron cutoff');
rows=storyRows(all);
assert.ok(rows[S.flip].statusAt>=beforeReject&&rows[S.flip].statusAt<=afterReject,'rejection sets status_at');
const pub1=await publicIds();
assert.ok(pub1.includes(S.approved),'a fresh approved v3 story is public');
assert.ok(pub1.includes(V2S.approved),'so is a fresh approved v2 story');

// --- Cron at now+29 days: this run's rows are not old enough yet.
await cron(Date.now()+29*DAY);
assert.deepEqual(Object.keys(storyRows([...all,...v2All])).sort(),[...all,...v2All].sort(),'recent stories survive');
assert.equal(eventsFor([...all,...v2All]).length,all.length+v2All.length);
assert.equal(feedbackOn([S.approved,S.flip,V2S.approved]),3);
assert.ok(has('writing_attempts','id',attempt)&&has('writing_attempts','id',attempt2));
assert.equal((await mineIds(a)).length,all.length,'the session survives too');
// Backdated rows: only the permanent approved story and the recently rejected permanent one remain.
rows=storyRows(oldStories);
assert.deepEqual(Object.keys(rows).sort(),[...visible].sort(),'v2/legacy stories deleted 30 days after created, approved or not; permanent private deleted 30 days after status_at');
assert.deepEqual(eventsFor(oldStories).map(e=>e.story).sort(),[...visible].sort(),'with their consent events');
assert.equal(feedbackOn([OLD.v2Approved]),0);
assert.ok(!has('feedback','id',OLD.feedback),'old feedback deleted');
assert.deepEqual(sessionsLeft(oldSessions),[OLD.sessionSeen],'sessions deleted a year after last_seen (or created without one), not 30 days after created');

// --- Cron just under 30 days after the rejection: every v2 story was created
// more than 30 days before it, approved ones and the recently rejected one
// included; v3 stories go 30 days after their last status change unless
// approved; the newer feedback and attempt are not old enough.
const metricBefore=(await queue()).metrics.find(x=>x.letterType==='present')?.starts||0;
assert.ok(metricBefore>=2,'both attempts counted');
await cron(beforeReject+AGE-1500);
assert.deepEqual(Object.keys(storyRows(v2All)),[],'v2 stories deleted 30 days after created, whatever their status or status_at');
assert.equal(eventsFor(v2All).length,0,'with their consent events');
assert.equal(feedbackOn([V2S.approved]),0,'and their feedback, even feedback younger than 30 days');
assert.ok(!(await publicIds()).includes(V2S.approved));
rows=storyRows(all);
assert.deepEqual(Object.keys(rows).sort(),[S.approved,S.flip].sort(),'v3: private, pending and rejected deleted 30 days after their last status change; approved kept; the recently rejected one not yet');
assert.equal(eventsFor(all).length,2,'consent events go with their stories');
assert.equal(feedbackOn([S.approved,S.flip]),2,'feedback on surviving stories is younger than 30 days');
assert.ok((await publicIds()).includes(S.approved),'the v3 approved story is still public');
assert.ok(has('feedback','story','demo-2'),'feedback younger than 30 days kept');
assert.ok(!has('writing_attempts','id',attempt),'writing attempt deleted 30 days after created');
assert.ok(has('writing_attempts','id',attempt2),'a newer attempt kept');
const remaining=sqlNum("SELECT COUNT(*) AS n FROM writing_attempts WHERE letter_type='present'");
const metricAfter=(await queue()).metrics.find(x=>x.letterType==='present')?.starts||0;
assert.ok(remaining>=1&&remaining<metricBefore,'the cron removed some attempts and kept the newer one');
assert.equal(metricAfter,remaining,'metrics count exactly the remaining attempts');
assert.ok(!storyRows([OLD.permFlip])[OLD.permFlip],'permanent rejected story deleted 30 days after the rejection');
assert.ok(storyRows([OLD.permApproved])[OLD.permApproved],'permanent approved story never auto-deleted');

// --- Cron 30 days after everything: feedback and attempts go; v3 approved stories and sessions stay.
await cron(afterReject+AGE+1000);
assert.ok(!has('feedback','story','demo-2'),'feedback deleted 30 days after created');
assert.equal(feedbackOn([S.approved]),0,'feedback on a kept story too');
assert.ok(!has('writing_attempts','id',attempt2));
assert.deepEqual(Object.keys(storyRows(all)),[S.approved],'v3 rejected story deleted 30 days after the rejection; the approved one kept');
assert.deepEqual(await mineIds(a),[S.approved],'sessions outlive 30 days: the author still sees the kept story');
assert.ok((await publicIds()).includes(OLD.permApproved),'permanent approved story stays public');
assert.equal(eventsFor([OLD.permApproved]).length,1);
assert.equal(sqlNum('SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)'),0,'no orphaned consent events');

// --- Sessions: one year after their last visit. Just before that for the
// backdated session last seen 40 days ago it stays; a day after, every
// session is gone, and the approved v3 stories are still public.
await cron(t0-40*DAY+SESSION_AGE-60000);
assert.deepEqual(sessionsLeft([OLD.sessionSeen,ownerOf(a),ownerOf(b)]),[OLD.sessionSeen,ownerOf(a),ownerOf(b)].sort(),'sessions last seen less than a year ago kept');
await cron(Date.now()+SESSION_AGE+DAY);
assert.deepEqual(sessionsLeft([OLD.sessionSeen,ownerOf(a),ownerOf(b),mOwner]),[],'sessions deleted a year after their last visit');
assert.deepEqual(await mineIds(a),[],'so the cookie no longer reaches its stories');
const pub2=await publicIds();
assert.ok(pub2.includes(S.approved)&&pub2.includes(OLD.permApproved),'v3 approved stories outlive their sessions, a year and more');
assert.equal(eventsFor([S.approved,OLD.permApproved]).length,2);

// --- A story inserted without a submit event (the old Worker during a deploy) gets one from the next cron.
{
  const g=await session();
  const lost=await submit(g);
  sql(`DELETE FROM consent_events WHERE story=${q(lost)}`);
  assert.equal(eventsFor([lost]).length,0);
  await cron(Date.now());
  const ev=eventsFor([lost]);
  assert.equal(ev.length,1,'cron backfills a missing submit event');
  assert.equal(ev[0].action,'submit');
  assert.equal(ev[0].version,V3);
  await cron(Date.now());
  assert.equal(eventsFor([lost]).length,1,'backfill is idempotent');
  assert.equal((await call('DELETE','/api/me',{cookie:g})).status,200);
}

// --- Every other delete path removes consent events with the story.
const c=await session();
const w=await submit(c), e1=await submit(c,{share:false});
assert.equal(eventsFor([w,e1]).length,2);
assert.equal((await call('DELETE','/api/me/stories/'+w,{cookie:c})).status,200);
assert.equal(eventsFor([w]).length,0,'withdraw deletes consent events');
assert.equal((await call('DELETE','/api/me',{cookie:c})).status,200);
assert.equal(eventsFor([e1]).length,0,'erase-all deletes consent events');
await moderate(OLD.permApproved,'delete');
await moderate(S.approved,'delete');
assert.equal(eventsFor([OLD.permApproved,S.approved]).length,0,'admin delete deletes consent events');
assert.equal(sqlNum(`SELECT COUNT(*) AS n FROM stories WHERE title=${q(story.title)}`),0,'test stories removed');
assert.equal(sqlNum('SELECT COUNT(*) AS n FROM consent_events WHERE story NOT IN (SELECT id FROM stories)'),0,'no orphaned consent events');
console.log('PASS: retention — real submissions use the permanent (v3) consent version; old-version stories (approved included) hidden and deleted 30 days after created, a later approval/rejection never extends it; permanent-version approved stories never expire (public, feedback, my stories, admin queue, a year past their session), other permanent-version stories expire 30 days after status_at (rejection restarts it); feedback/attempts deleted after 30 days with exact metrics; sessions deleted a year after last_seen; session creation purges nothing; consent events written on submit and deleted with their story on retention, withdraw, erase and admin delete');
