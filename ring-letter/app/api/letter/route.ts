import { env } from 'cloudflare:workers';
const ADMIN='tom82523@gmail.com';
const AGE=30*24*60*60*1000;
function db(){if(!env.DB)throw new Error('儲存服務尚未就緒');return env.DB;}
function reply(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function session(req:Request){const t=req.headers.get('cookie')?.match(/(?:^|;\s*)rl_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!t)return null;const h=await hash(t);return await db().prepare('SELECT hash FROM sessions WHERE hash=? AND created>?').bind(h,Date.now()-AGE).first()?h:null;}
function admin(req:Request){return req.headers.get('oai-authenticated-user-email')?.toLowerCase()===ADMIN;}
async function cleanup(){const cutoff=Date.now()-AGE;await db().batch(['stories','feedback','sessions','writing_attempts'].map(t=>db().prepare(`DELETE FROM ${t} WHERE created<?`).bind(cutoff)));}
export async function GET(req:Request){try{
 const url=new URL(req.url);const a=url.searchParams.get('action');const who=await session(req);const isAdmin=admin(req);const cutoff=Date.now()-AGE;
 if(a==='admin'){if(!isAdmin)return reply({error:'請使用網站擁有者的 ChatGPT 帳號登入。'},403);const s=await db().prepare('SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE created>? ORDER BY created DESC LIMIT 200').bind(cutoff).all();const f=await db().prepare('SELECT id,story,kind,note,created FROM feedback WHERE created>? ORDER BY created DESC LIMIT 300').bind(cutoff).all();const metrics=await db().prepare('SELECT letter_type AS letterType, COUNT(*) AS starts, SUM(CASE WHEN completed IS NOT NULL THEN 1 ELSE 0 END) AS completions, SUM(shared) AS shares FROM writing_attempts WHERE created>? GROUP BY letter_type').bind(cutoff).all();return reply({stories:s.results,feedback:f.results,metrics:metrics.results});}
 if(a==='mine'){if(!who)return reply({stories:[]});return reply({stories:(await db().prepare('SELECT id,title,body,era,source,status,created,letter_type AS letterType,mood,reflection FROM stories WHERE owner=? AND created>? ORDER BY created DESC').bind(who,cutoff).all()).results});}
 return reply({admin:isAdmin,stories:(await db().prepare("SELECT id,title,body,era,source,created,letter_type AS letterType,mood,reflection FROM stories WHERE status='approved' AND created>? ORDER BY created DESC LIMIT 100").bind(cutoff).all()).results});
 }catch{return reply({error:'暫時無法讀取資料，請稍後再試。'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'來源驗證失敗'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return reply({error:'格式不支援'},415);
 const raw=await req.text();if(raw.length>12000)return reply({error:'內容太長'},413);
 let b:any;try{b=JSON.parse(raw);}catch{return reply({error:'格式不正確'},400);}
 if(!b||typeof b!=='object')return reply({error:'格式不正確'},400);
 if(b.action==='session'){const old=await session(req);if(old)return reply({ok:true});await cleanup();const bytes=crypto.getRandomValues(new Uint8Array(32));const t=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');await db().prepare('INSERT INTO sessions(hash,created) VALUES(?,?)').bind(await hash(t),Date.now()).run();return reply({ok:true},200,{'Set-Cookie':`rl_session=${t}; HttpOnly; ${new URL(req.url).protocol==='https:'?'Secure; ':''}SameSite=Lax; Path=/; Max-Age=2592000`});}
 if(b.action==='moderate'){if(!admin(req))return reply({error:'僅限管理者'},403);if(typeof b.id!=='string'||!['approved','rejected','delete'].includes(b.status))return reply({error:'無效操作'},400);if(b.status==='delete'){await db().batch([db().prepare('DELETE FROM stories WHERE id=?').bind(b.id),db().prepare('DELETE FROM feedback WHERE story=?').bind(b.id)]);}else{const r=await db().prepare("UPDATE stories SET status=? WHERE id=? AND status IN ('pending','approved','rejected')").bind(b.status,b.id).run();if(!r.meta.changes)return reply({error:'文章不存在，或作者未同意分享'},400);}return reply({ok:true});}
 const who=await session(req);if(!who)return reply({error:'體驗工作階段已過期，請重新整理頁面。'},401);
 if(b.action==='start'){
 if(!['past','present'].includes(b.letterType)||typeof b.id!=='string'||!/^[a-f0-9-]{36}$/.test(b.id))return reply({error:'無效的試寫選擇'},400);
 const count=await db().prepare('SELECT COUNT(*) AS n FROM writing_attempts WHERE owner=? AND created>?').bind(who,Date.now()-86400000).first<{n:number}>();if((count?.n??0)>=30)return reply({error:'今天已開始多次試寫，請明天再試。'},429);
 await db().prepare('INSERT OR IGNORE INTO writing_attempts(id,owner,letter_type,created) VALUES(?,?,?,?)').bind(b.id,who,b.letterType,Date.now()).run();return reply({ok:true});
 }
 if(b.action==='submit'){
 if(b.letterType!==undefined&&!['past','present'].includes(b.letterType))return reply({error:'無效寫法'},400);const modern=['past','present'].includes(b.letterType);const type=modern?b.letterType:'legacy';
 for(const key of ['title','body','era','source'])if(typeof b[key]!=='string')return reply({error:'請填寫完整'},400);
 const mood=typeof b.mood==='string'?b.mood.trim():'';const reflection=typeof b.reflection==='string'?b.reflection.trim():'';
 const body=b.body.trim();const now=Date.now();const era=type==='present'?new Date(now).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}):b.era.trim();
 const title=b.title.trim()||(type==='present'?'今天的心情':'一段仍記得的經歷');
 const source=type==='present'?'present':b.source;
 if(title.length>60||body.length<(modern?1:30)||body.length>1500||!era||era.length>40||mood.length>60||reflection.length>800||!['original','recollection','present'].includes(source)||(type!=='present'&&source==='present')||(type==='present'&&!mood)||b.adult!==true||b.privacy!==true||typeof b.share!=='boolean')return reply({error:'請確認內容、時間、心情與同意選項。'},400);
 let attempt:string|null=null;if(modern){if(typeof b.attempt!=='string')return reply({error:'請先選擇一種寫法。'},400);const row=await db().prepare('SELECT id,completed FROM writing_attempts WHERE id=? AND owner=? AND letter_type=? AND created>?').bind(b.attempt,who,type,now-AGE).first<{id:string;completed:number|null}>();if(!row)return reply({error:'試寫階段已過期，請重新選擇寫法。'},400);if(row.completed!==null)return reply({error:'這封信已送出，請到我的片段查看。'},409);attempt=row.id;}
 const count=await db().prepare('SELECT COUNT(*) AS n FROM stories WHERE owner=? AND created>?').bind(who,now-86400000).first<{n:number}>();if((count?.n??0)>=5)return reply({error:'今天已留下五篇，讓文字休息一下，明天再來。'},429);
 const id=crypto.randomUUID();const insert=db().prepare('INSERT INTO stories(id,owner,title,body,era,source,status,consent,created,letter_type,mood,reflection,attempt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,who,title,body,era,source,b.share?'pending':'private','v2-2026-11-05:adult,privacy,'+(b.share?'share':'private'),now,type,mood,reflection,attempt);
 await db().batch(attempt?[insert,db().prepare('UPDATE writing_attempts SET completed=?, shared=? WHERE id=? AND owner=?').bind(now,b.share?1:0,attempt,who)]:[insert]);return reply({ok:true,id,status:b.share?'pending':'private'});
 }
 if(b.action==='withdraw'){if(typeof b.id!=='string')return reply({error:'無效代碼'},400);const own=await db().prepare('SELECT id FROM stories WHERE id=? AND owner=?').bind(b.id,who).first();if(!own)return reply({error:'找不到屬於這個瀏覽器的片段。'},404);await db().batch([db().prepare('DELETE FROM stories WHERE id=? AND owner=?').bind(b.id,who),db().prepare('DELETE FROM feedback WHERE story=?').bind(b.id)]);return reply({ok:true});}
 if(b.action==='erase'){await db().batch([db().prepare('DELETE FROM feedback WHERE story IN (SELECT id FROM stories WHERE owner=?) OR owner=?').bind(who,who),db().prepare('DELETE FROM stories WHERE owner=?').bind(who),db().prepare('DELETE FROM writing_attempts WHERE owner=?').bind(who),db().prepare('DELETE FROM sessions WHERE hash=?').bind(who)]);return reply({ok:true},200,{'Set-Cookie':'rl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
 if(b.action==='feedback'){if(typeof b.story!=='string'||!['more','resonate','neutral','report','comment'].includes(b.kind)||typeof b.note!=='string'||b.note.length>500)return reply({error:'回饋格式不正確'},400);if(!['demo-1','demo-2','demo-3'].includes(b.story)&&!await db().prepare("SELECT id FROM stories WHERE id=? AND status='approved' AND created>?").bind(b.story,Date.now()-AGE).first())return reply({error:'這篇故事已不再提供。'},404);const count=await db().prepare('SELECT COUNT(*) AS n FROM feedback WHERE owner=? AND created>?').bind(who,Date.now()-86400000).first<{n:number}>();if((count?.n??0)>=30)return reply({error:'今日回饋已足夠，謝謝你。'},429);await db().prepare('INSERT INTO feedback(id,owner,story,kind,note,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),who,b.story,b.kind,b.note.trim(),Date.now()).run();return reply({ok:true});}
 return reply({error:'不支援的操作'},400);
 }catch{return reply({error:'這次沒有成功儲存，請保留文字並稍後重試。'},503);}}
