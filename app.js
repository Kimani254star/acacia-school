AcaciaLogin.init({app:'school',name:'Acacia School',color:'#0b2447',price:800,landing:'landing.html'});
/* Dark mode: follows the device setting until the toggle is used; choice is remembered. */
(function(){var K='acacia_theme',r=document.documentElement,b=document.createElement('button');
function cur(){var s;try{s=localStorage.getItem(K)}catch(e){}return s||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function set(t){r.setAttribute('data-theme',t);b.textContent=t=='dark'?'\u2600\uFE0F':'\uD83C\uDF19';b.title=t=='dark'?'Switch to light mode':'Switch to dark mode';b.setAttribute('aria-label',b.title)}
b.id='themeBtn';b.type='button';b.onclick=function(){var t=cur()=='dark'?'light':'dark';try{localStorage.setItem(K,t)}catch(e){}set(t)};
set(cur());document.body.appendChild(b)})();
const ST='Status|s:';
const MODS=[
['Dashboard',{Notices:'Title|Date|date|Details',Events:'Title|Date|date|Venue'}],
['Front Office',{Enquiries:'Name|Phone|Class|Date|date',Admissions:'Applicant|Class|Date|date|'+ST+'Open,Converted,Closed',Visitors:'Name|Purpose|Date|date|Time|time',Calls:'Caller|Reason|Date|date|Phone'}],
['Student Information',{Students:'Admission no.|Name|Class|Gender|s:Female,Male|Date of birth|date',Guardians:'Name|Student|Relationship|Phone|Email',Profiles:'Student|Medical notes|Address|Emergency contact'}],
['Academics',{Classes:'Class|Class teacher|Capacity|number',Sections:'Class|Section|Room',Subjects:'Subject|Class|Teacher',Timetables:'Class|Day|s:Mon,Tue,Wed,Thu,Fri|Time|time|Subject'}],
['Examinations',{Exams:'Exam|Class|Start|date|End|date',Marks:'Student|Exam|Subject|Marks|number|Out of|number',Grading:'Grade|From %|number|To %|number|Remark',ReportCards:'Student|Term|Mean grade|Remarks'}],
['Online Classes',{VirtualClasses:'Title|Class|Date|date|Link',Lessons:'Lesson|Subject|Class|Material link',Recordings:'Title|Class|Date|date|Link'}],
['Human Resources',{Employees:'Name|Role|s:Teacher,Staff|Department|Phone',Teachers:'Name|Subjects|Class|Phone',Departments:'Department|Head',Leave:'Employee|From|date|To|date|Reason'}],
['Attendance',{StudentAttendance:'Student|Class|Date|date|'+ST+'Present,Absent,Late',StaffAttendance:'Staff|Role|s:Teacher,Staff|Date|date|'+ST+'Present,Absent,Late'}],
['Fees & Finance',{FeeStructures:'Class|Fee item|Amount|number|Term',Invoices:'Student|Description|Amount|number|Due date|date|'+ST+'Unpaid,Paid',Payments:'Student|Amount|number|Date|date|Method|s:Cash,M-Pesa,Bank,Cheque',Expenses:'Item|Amount|number|Date|date|Category'}],
['Inventory',{Stock:'Item|SKU|Warehouse|Quantity|number|Buying price|number|Selling price|number',Movement:'Item|Type|s:In,Out,Transfer,Adjustment|Quantity|number|Date|date|Reference',PriceList:'Item|SKU|Buying price|number|Selling price|number',Amendments:'Item|Field changed|Old value|New value|Date|date',BundleItems:'Bundle|Components|Selling price|number',BulkAdjustments:'Item|Adjustment|s:Increase,Decrease|Quantity|number|Reason|Date|date',Packages:'Order|Item|Quantity|number|Status|s:Packed,Ready,Dispatched',Shipments:'Package|Carrier|Date|date|Status|s:Pending,In transit,Delivered'}],
['Library',{Books:'Title|Author|Copies|number',Borrowing:'Book|Borrower|Date|date|Due|date',Returns:'Book|Borrower|Date|date',Fines:'Borrower|Amount|number|'+ST+'Unpaid,Paid'}],
['Transport',{Vehicles:'Registration|Capacity|number|Driver',Routes:'Route|Stops|Vehicle',Drivers:'Name|Phone|Licence expiry|date',Allocations:'Student|Route|Pickup point'}],
['Hostel',{Hostels:'Hostel|Gender|s:Girls,Boys|Warden',Rooms:'Hostel|Room|Beds|number',Allocations:'Student|Hostel|Room'}],
['Alumni',{FormerStudents:'Name|Graduation year|number|Phone',Records:'Name|Current work|Contact'}],
['Reports',null],
['Behaviour Records',{Discipline:'Student|Offence|Date|date|Action taken',Incidents:'Student|Incident|Date|date|Reported by',Conduct:'Student|Rating|s:Excellent,Good,Fair,Poor|Notes'}],
['System Settings',{Users:'Name|Email|Role|s:Super Administrator,School Administrator,Head Teacher / Principal,Bursar / Accountant,Teacher,Class Teacher,Librarian,Receptionist,Transport Manager,Parent,Student',SchoolSettings:'Setting|Value',Appearance:'*'}]];
const PORTALS={'Administration Portal':null,'Teacher Portal':['Dashboard','Academics','Examinations','Online Classes','Attendance','Behaviour Records'],'Student Portal':['Dashboard','Academics','Examinations','Online Classes','Library'],'Parent Portal':['Dashboard','Student Information','Attendance','Examinations','Fees & Finance'],'Finance Portal':['Dashboard','Fees & Finance','Inventory','Reports']};
const parse=s=>{const p=s.split('|'),f=[];for(let i=0;i<p.length;i++){const l=p[i],t=p[i+1]||'text';if(/^(date|time|number)$/.test(t)||t.startsWith('s:')){f.push({l,t,o:t.startsWith('s:')?t.slice(2).split(','):0});i++}else f.push({l,t:'text'})}return f};
const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const lab=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2');
let S;try{S=JSON.parse(localStorage.getItem('acacia_school_'+AcaciaLogin.companyId()))}catch(e){}
if(!S)S={cur:'s1',schools:[{id:'s1',name:'My School'}],data:{s1:{}}};
let mod='Dashboard',sub=null,portal='Administration Portal',q='';
const save=()=>{try{localStorage.setItem('acacia_school_'+AcaciaLogin.companyId(),JSON.stringify(S))}catch(e){}};
const D=(m,s)=>{const d=S.data[S.cur],k=m+'/'+s;return d[k]||(d[k]=[])};
const today=new Date().toISOString().slice(0,10),ym=today.slice(0,7);
const K=n=>'KES '+n.toLocaleString();
const sum=a=>a.reduce((x,r)=>x+r[1],0);
function stats(){
const inv=D('Fees & Finance','Invoices'),pay=D('Fees & Finance','Payments'),ex=D('Fees & Finance','Expenses'),sa=D('Attendance','StudentAttendance'),fa=D('Attendance','StaffAttendance');
const mc=pay.filter(r=>r[2].startsWith(ym)).reduce((a,r)=>a+r[1],0),me=ex.filter(r=>r[2].startsWith(ym)).reduce((a,r)=>a+r[1],0);
const cnt=(role)=>fa.filter(r=>r[2]==today&&r[3]=='Present'&&(!role||r[1]==role)).length;
return[['Fees awaiting payment',K(inv.filter(r=>r[4]=='Unpaid').reduce((a,r)=>a+r[2],0))],['Monthly fee collection',K(mc)],['Expenses this month',K(me)],['Profits this month',K(mc-me)],['Teachers present today',cnt('Teacher')],['Students present today',sa.filter(r=>r[2]==today&&r[3]=='Present').length],['Staff present today',cnt('Staff')],['Converted admissions leads',D('Front Office','Admissions').filter(r=>r[3]=='Converted').length]]}
function chart(){const pay=D('Fees & Finance','Payments'),ex=D('Fees & Finance','Expenses'),ms=[];
for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);ms.push(d.toISOString().slice(0,7))}
const c=ms.map(m=>pay.filter(r=>r[2].startsWith(m)).reduce((a,r)=>a+r[1],0)),e=ms.map(m=>ex.filter(r=>r[2].startsWith(m)).reduce((a,r)=>a+r[1],0)),mx=Math.max(1,...c,...e);
let s='<svg viewBox="0 0 420 190" width="100%" role="img" aria-label="Fee collection and expenses, last 6 months">';
ms.forEach((m,i)=>{const x=20+i*66,h1=140*c[i]/mx,h2=140*e[i]/mx;s+='<rect x="'+x+'" y="'+(150-h1)+'" width="24" height="'+h1+'" fill="#0b2447"/><rect x="'+(x+26)+'" y="'+(150-h2)+'" width="24" height="'+h2+'" fill="#c9962b"/><text x="'+(x+25)+'" y="168" font-size="11" text-anchor="middle" fill="#000">'+m.slice(5)+'/'+m.slice(2,4)+'</text>'});
return s+'</svg><div style="font-size:13px"><span style="color:#0b2447">■</span> Fee collection &nbsp; <span style="color:#c9962b">■</span> Expenses</div>'}
function nav(){const allow=PORTALS[portal];
document.getElementById('nav').innerHTML='<div class="brand"><img src="logo.png" alt="Acacia logo" class="logo">Acacia School</div><select onchange="pick(this.value)">'+S.schools.map(s=>'<option value="'+s.id+'"'+(s.id==S.cur?' selected':'')+'>'+E(s.name)+'</option>').join('')+'<option value="+">+ Add school</option></select><select onchange="portal=this.value;mod=\'Dashboard\';sub=null;render()">'+Object.keys(PORTALS).map(p=>'<option'+(p==portal?' selected':'')+'>'+p+'</option>').join('')+'</select>'+MODS.filter(m=>!allow||allow.includes(m[0])).map(m=>'<button class="m '+(m[0]==mod?'on active':'')+'" onclick="go(\''+m[0]+'\')">'+m[0]+'</button>').join('')}
function pick(v){if(v=='+'){const n=prompt('School name');if(n){const id='s'+Date.now();S.schools.push({id,name:n});S.data[id]={};S.cur=id}}else S.cur=v;save();render()}
function go(m){mod=m;sub=null;q='';nav_close();render()}
function nav_close(){document.getElementById('nav').classList.remove('open')}
const nav_=document.getElementById('nav');
function render(){nav();const el=document.getElementById('main'),M=MODS.find(m=>m[0]==mod),sch=S.schools.find(s=>s.id==S.cur).name;
let h='<div class="bar"><h1>'+mod+'</h1><span>'+E(sch)+' · '+portal+'</span></div>';
if(mod=='Dashboard'){
const ev=D('Dashboard','Events').filter(r=>r[1]>=today).sort((a,b)=>a[1]<b[1]?-1:1),nt=D('Dashboard','Notices').slice().sort((a,b)=>a[1]<b[1]?1:-1),lv=D('Human Resources','Leave').filter(r=>r[1]<=today&&r[2]>=today);
h+='<div class="grid">'+stats().map(s=>'<div class="st"><b>'+s[1]+'</b><span>'+s[0]+'</span></div>').join('')+'</div><div class="two"><div class="box"><h3>Fee collection and expenses</h3>'+chart()+'</div><div class="box"><h3>Notice board</h3>'+(nt.length?'<ul>'+nt.slice(0,6).map(r=>'<li><b>'+E(r[0])+'</b> ('+r[1]+') '+E(r[2])+'</li>').join('')+'</ul>':'<div class="empty">No notices yet. Add one under Dashboard → Notices.</div>')+'</div><div class="box"><h3>Upcoming events</h3>'+(ev.length?'<ul>'+ev.slice(0,6).map(r=>'<li><b>'+E(r[0])+'</b> – '+r[1]+', '+E(r[2])+'</li>').join('')+'</ul>':'<div class="empty">No upcoming events.</div>')+'</div><div class="box"><h3>Faculty on leave</h3>'+(lv.length?'<ul>'+lv.map(r=>'<li>'+E(r[0])+' until '+r[2]+' ('+E(r[3])+')</li>').join('')+'</ul>':'<div class="empty">Nobody is on leave today.</div>')+'</div></div>'}
if(M[1]===null){h+='<div class="grid">'+stats().map(s=>'<div class="st"><b>'+s[1]+'</b><span>'+s[0]+'</span></div>').join('')+'</div><div class="box"><h3>Fee collection and expenses</h3>'+chart()+'</div>'}
else{const subs=Object.keys(M[1]);if(!sub||!subs.includes(sub))sub=mod=='Dashboard'?subs[0]:subs[0];
h+=(mod=='Dashboard'?'<h3>Manage dashboard content</h3>':'')+'<div class="tabs">'+subs.map(s=>'<button class="'+(s==sub?'on':'')+'" onclick="sub=\''+s+'\';q=\'\';render()">'+lab(s)+'</button>').join('')+'</div>';
const f=parse(M[1][sub]);
h+='<div class="box"><form onsubmit="add(event)">'+f.map((x,i)=>'<div><label>'+x.l+'</label>'+(x.o?'<select name="f'+i+'">'+x.o.map(o=>'<option>'+o+'</option>').join('')+'</select>':'<input name="f'+i+'" type="'+x.t+'" required>')+'</div>').join('')+'<button class="btn">Add '+lab(sub).toLowerCase()+'</button></form></div><div class="box"><div style="max-width:280px;margin-bottom:10px"><input placeholder="Search" value="'+E(q)+'" oninput="q=this.value;list()"></div><div class="wrap" id="list"></div></div>'}
if(M[1]&&M[1][sub]=='*')h=h.replace(/<div class="box"><form[\s\S]*$/,'<div data-acacia-appearance></div>');
el.innerHTML=h;if(document.getElementById('list'))list()}
function list(){const M=MODS.find(m=>m[0]==mod),f=parse(M[1][sub]),L=document.getElementById('list');
const rows=D(mod,sub).map((r,i)=>[r,i]).filter(([r])=>r.join(' ').toLowerCase().includes(q.toLowerCase()));
L.innerHTML=rows.length?'<table><tr>'+f.map(x=>'<th>'+x.l+'</th>').join('')+'<th></th></tr>'+rows.map(([r,i])=>'<tr>'+r.map(c=>'<td>'+E(c)+'</td>').join('')+'<td><button class="del" onclick="rm('+i+')">Delete</button></td></tr>').join('')+'</table>':'<div class="empty">No records yet. Use the form above to add the first one.</div>'}
function add(e){e.preventDefault();const M=MODS.find(m=>m[0]==mod),f=parse(M[1][sub]),fd=new FormData(e.target);
D(mod,sub).unshift(f.map((x,i)=>x.t=='number'?Number(fd.get('f'+i)):fd.get('f'+i)));save();render()}
function rm(i){if(confirm('Delete this record?')){D(mod,sub).splice(i,1);save();render()}}
render();
