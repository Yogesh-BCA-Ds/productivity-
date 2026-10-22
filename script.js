
(() => {
const $ = id => document.getElementById(id);
const KEY = "devspace.tasks.v4";
const NOTEKEY = "devspace.notes.v4";
const categories = ["Academics","DSA","Data Science","Project"];
let tasks = load(KEY,[]);
let showDone = false, remaining = 1500, running = false, endAt = 0, timer = null;

function load(k,fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
  catch { return fallback; }
}
function save() {
  try { localStorage.setItem(KEY,JSON.stringify(tasks)); }
  catch { toast("Storage full. Export a backup."); }
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateText(v) {
  if(!v) return "";
  const [y,m,d] = v.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString([],{month:"short",day:"numeric"});
}
function timeText(v) {
  if(!v) return "";
  const [h,m] = v.split(":").map(Number);
  return new Date(2000,0,1,h,m).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
}
function toast(msg) {
  const el=$("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}
function clock() {
  const d=new Date(), h=d.getHours();
  $("clock").textContent=d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  $("clockDate").textContent=d.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"});
  $("dayLabel").textContent=d.toLocaleDateString([],{weekday:"long"}).toUpperCase()+" · YOUR DAY";
}
function todayTasks(){return tasks.filter(t=>t.date===today());}
function elapsed(t) {
  if(!t.startedAt)return 0;
  return Math.max(0,Math.floor(((t.completedAt?new Date(t.completedAt):new Date())-new Date(t.startedAt))/1000));
}
function duration(seconds) {
  const mins=Math.floor(Math.max(0,seconds)/60);
  const hours=Math.floor(mins/60);
  return hours?`${hours}h ${mins%60}m`:`${mins}m`;
}
function node(tag,cls,text) {
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
}
function summary() {
  const list=todayTasks(), done=list.filter(t=>t.completed);
  const percent=list.length?Math.round(done.length/list.length*100):0;
  $("doneCount").textContent=`${done.length} / ${list.length}`;
  $("timeTotal").textContent=duration(done.reduce((n,t)=>n+elapsed(t),0));
  $("percent").textContent=percent+"%";
  $("bar").style.width=percent+"%";
}
function render() {
  const list=$("tasks"); list.replaceChildren();
  const filter=$("filter").value;
  const items=todayTasks()
    .filter(t=>filter==="All"||t.category===filter)
    .filter(t=>showDone||!t.completed)
    .sort((a,b)=>Number(a.completed)-Number(b.completed)||(a.plannedStart||"99:99").localeCompare(b.plannedStart||"99:99"));
  if(!items.length) list.append(node("p","muted","No tasks here yet. Add one above."));
  items.forEach(t=>{
    const row=node("div","task"+(t.completed?" done":""));
    const check=node("input","check"); check.type="checkbox"; check.checked=t.completed;
    check.onchange=()=>complete(t.id,check.checked);
    const copy=node("div");
    copy.append(node("div","tasktitle",t.title));
    const meta=node("div","meta",t.category+
      ((t.plannedStart||t.plannedEnd)?` · Planned ${t.plannedStart?timeText(t.plannedStart):"—"}–${t.plannedEnd?timeText(t.plannedEnd):"—"}`:"")+
      (t.completedAt?` · Done ${new Date(t.completedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`:""));
    const actions=node("div","taskactions");
    const start=node("button","mini",t.startedAt?"Restart time":"Start time");
    start.onclick=()=>startTask(t.id);
    const edit=node("button","mini","Edit");
    edit.onclick=()=>editTask(t.id);
    const del=node("button","mini delete","Delete");
    del.onclick=()=>deleteTask(t.id);
    actions.append(start,edit,del); copy.append(meta,actions);
    const times=node("div","tasktimes",t.startedAt?"Start "+new Date(t.startedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"Not started");
    times.append(node("small","",t.completedAt?"End "+new Date(t.completedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):""));
    row.append(check,copy,times); list.append(row);
  });
  $("showDone").textContent=showDone?"Hide completed":"Show completed";
  summary(); fillTimerTasks(); recent();
}
function fillTimerTasks() {
  const s=$("timerTask"), old=s.value;
  s.replaceChildren(node("option","","No task selected")); s.options[0].value="";
  todayTasks().filter(t=>!t.completed).forEach(t=>{
    const o=node("option","",t.category+": "+t.title);o.value=t.id;s.append(o);
  });
  if([...s.options].some(o=>o.value===old))s.value=old;
}
function addTask(e) {
  e.preventDefault();
  const title=$("title").value.trim(), start=$("plannedStart").value, end=$("plannedEnd").value;
  if(!title)return;
  if(start&&end&&end<start)return toast("End time must follow start time.");
  tasks.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title,
    category:$("category").value,date:$("date").value||today(),
    plannedStart:start,plannedEnd:end,completed:false,createdAt:Date.now(),
    startedAt:null,completedAt:null});
  save();$("title").value="";$("plannedStart").value="";$("plannedEnd").value="";
  $("date").value=today();render();toast("Task added.");
}
function complete(id,checked) {
  const t=tasks.find(x=>x.id===id);if(!t)return;
  t.completed=checked;
  if(checked){t.completedAt=new Date().toISOString();if(!t.startedAt)t.startedAt=t.completedAt;}
  else t.completedAt=null;
  save();render();toast(checked?"Completed and saved.":"Task reopened.");
}
function startTask(id) {
  const t=tasks.find(x=>x.id===id);if(!t)return;
  if(t.startedAt&&!confirm("Restart the recorded start time?"))return;
  t.startedAt=new Date().toISOString();t.completedAt=null;t.completed=false;
  save();render();toast("Start time recorded.");
}
function editTask(id) {
  const t=tasks.find(x=>x.id===id);if(!t)return;
  const name=prompt("Task name:",t.title);
  if(name===null||!name.trim())return;
  const cat=prompt("Category: Academics, DSA, Data Science, Project",t.category);
  t.title=name.trim();
  if(cat!==null){const match=categories.find(c=>c.toLowerCase()===cat.trim().toLowerCase());if(match)t.category=match;}
  save();render();toast("Task updated.");
}
function deleteTask(id) {
  const t=tasks.find(x=>x.id===id);
  if(t&&confirm(`Delete "${t.title}"?`)){tasks=tasks.filter(x=>x.id!==id);save();render();toast("Task deleted.");}
}
function recent() {
  const box=$("recent");box.replaceChildren();
  const done=[...tasks].filter(t=>t.completed).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).slice(0,4);
  if(!done.length){box.textContent="Nothing completed yet.";return;}
  done.forEach(t=>box.append(node("p","",`✓ ${t.title} · ${t.category} · ${dateText(t.date)}`)));
}
function history(filter="") {
  const box=$("historyList");box.replaceChildren();
  let list=[...tasks].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  if(filter)list=list.filter(t=>t.date===filter);
  if(!list.length){box.textContent="No tasks saved for this date.";return;}
  let day="";
  list.forEach(t=>{
    if(t.date!==day){box.append(node("div","historyday",dateText(t.date).toUpperCase()));day=t.date;}
    const row=node("div","historyitem");
    const copy=node("div");
    copy.append(node("b","",(t.completed?"✓ ":"")+t.title),
      node("small","",`${t.category} · ${t.plannedStart?timeText(t.plannedStart):"No planned start"}${t.plannedEnd?"–"+timeText(t.plannedEnd):""}`+
      (t.completedAt?" · Completed "+new Date(t.completedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"")));
    row.append(copy,node("span","",t.completed?"Done":"Pending"));box.append(row);
  });
}
function openHistory(){$("historyDate").value="";history();$("history").showModal();}
function exportData() {
  const data={format:"DevSpace backup",version:4,exportedAt:new Date().toISOString(),tasks,notes:$("notes").value};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a=node("a");a.href=url;a.download=`devspace-backup-${today()}.json`;a.click();URL.revokeObjectURL(url);toast("Backup exported.");
}
async function importData(file) {
  if(!file)return;
  try {
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.tasks))throw Error();
    const map=new Map(tasks.map(t=>[t.id,t]));
    data.tasks.filter(t=>t&&typeof t.title==="string"&&categories.includes(t.category)&&t.date)
      .forEach(t=>map.set(t.id||String(Date.now()+Math.random()),t));
    tasks=[...map.values()];save();
    if(typeof data.notes==="string"&&!$("notes").value.trim()){$("notes").value=data.notes;localStorage.setItem(NOTEKEY,JSON.stringify(data.notes));}
    render();history($("historyDate").value);toast("Backup imported.");
  } catch {toast("Invalid DevSpace backup.");}
  $("import").value="";
}
function showTimer() {
  const s=Math.max(0,remaining),m=Math.floor(s/60),r=s%60;
  $("timerDisplay").textContent=String(m).padStart(2,"0")+":"+String(r).padStart(2,"0");
}
function tick() {
  remaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));showTimer();
  if(remaining===0){running=false;clearInterval(timer);timer=null;$("timerStart").disabled=false;$("timerStart").textContent="Start again";$("timerPause").disabled=true;toast("Timer finished. Check your task.");}
}
function startTimer() {
  if(running)return;
  if(remaining<=0)remaining=Math.max(1,Math.min(240,+$("minutes").value||25))*60;
  running=true;endAt=Date.now()+remaining*1000;
  $("timerStart").disabled=true;$("timerPause").disabled=false;tick();timer=setInterval(tick,250);
}
function pauseTimer() {
  if(!running)return;tick();running=false;clearInterval(timer);timer=null;
  $("timerStart").disabled=false;$("timerStart").textContent="Resume";$("timerPause").disabled=true;
}
function resetTimer() {
  running=false;clearInterval(timer);timer=null;
  remaining=Math.max(1,Math.min(240,+$("minutes").value||25))*60;
  $("timerStart").disabled=false;$("timerStart").textContent="Start";
  $("timerPause").disabled=true;showTimer();
}

$("taskForm").addEventListener("submit",addTask);
$("date").value=today();
$("filter").onchange=render;
$("showDone").onclick=()=>{showDone=!showDone;render();};
$("historyBtn").onclick=openHistory;
$("closeHistory").onclick=()=>$("history").close();
$("historyDate").onchange=()=>history($("historyDate").value);
$("allDates").onclick=()=>{$("historyDate").value="";history();};
["export","export2","export3"].forEach(id=>$(id).onclick=exportData);
$("import").onchange=e=>importData(e.target.files[0]);
$("clear").onclick=()=>{if(confirm("Delete all tasks? Export a backup first if needed.")){tasks=[];save();render();history();toast("History cleared.");}};
$("notes").value=load(NOTEKEY,"");
$("notes").oninput=()=>{localStorage.setItem(NOTEKEY,JSON.stringify($("notes").value));$("noteStatus").textContent="Auto-saved";};
$("minutes").onchange=()=>{if(!running)resetTimer();};
$("timerStart").onclick=startTimer;$("timerPause").onclick=pauseTimer;$("timerReset").onclick=resetTimer;
clock();setInterval(clock,1000);render();resetTimer();
})();
