'use strict';
/* ================================================================
   FINTRACK v3 — fin.js
   Architecture: AUTH + DB layers are swappable for a real backend.
   All confirm() calls replaced with modal. No prompt() anywhere.
   ================================================================ */

/* ── AUTH ─────────────────────────────────────────────────────── */
const AUTH = {
  _users: [], _session: null,
  load() {
    try {
      const u = localStorage.getItem('ft_users');
      const s = localStorage.getItem('ft_session');
      if (u) this._users  = JSON.parse(u);
      if (s) this._session = JSON.parse(s);
    } catch(e) {}
    return this;
  },
  save() {
    try {
      localStorage.setItem('ft_users', JSON.stringify(this._users));
      if (this._session) localStorage.setItem('ft_session', JSON.stringify(this._session));
      else               localStorage.removeItem('ft_session');
    } catch(e) {}
  },
  signup(name, email, password) {
    // TODO: replace with POST /api/auth/signup
    if (!name || !email || !password) return { ok:false, error:'All fields required.' };
    if (this._users.find(u => u.email === email)) return { ok:false, error:'Email already registered.' };
    if (password.length < 6) return { ok:false, error:'Password must be at least 6 characters.' };
    const user = { id: uid(), name, email, password, createdAt: new Date().toISOString() };
    this._users.push(user);
    this._session = { userId:user.id, name:user.name, email:user.email, isGuest:false };
    this.save();
    return { ok:true };
  },
  login(email, password) {
    // TODO: replace with POST /api/auth/login
    const user = this._users.find(u => u.email===email && u.password===password);
    if (!user) return { ok:false, error:'Invalid email or password.' };
    this._session = { userId:user.id, name:user.name, email:user.email, isGuest:false };
    this.save();
    return { ok:true };
  },
  loginGuest() {
    this._session = { userId:'guest', name:'Guest', email:'', isGuest:true };
    this.save();
    return { ok:true };
  },
  logout() { this._session = null; this.save(); },
  getSession() { return this._session; },
  isLoggedIn()  { return !!this._session; }
};

/* ── DB ───────────────────────────────────────────────────────── */
const DB = {
  _d: null,
  _key() { const s=AUTH.getSession(); return 'ft_data_'+(s?s.userId:'guest'); },
  _blank() {
    return {
      transactions:[], budgets:[], bills:[], investments:[],
      goals:[], scheduled:[], settings:{ name:'', email:'', currency:'$' }
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(this._key());
      this._d = raw ? JSON.parse(raw) : this._blank();
      // Ensure all stores exist (forward compat)
      Object.keys(this._blank()).forEach(k => { if (!this._d[k]) this._d[k] = this._blank()[k]; });
    } catch(e) { this._d = this._blank(); }
    return this;
  },
  save() { try { localStorage.setItem(this._key(), JSON.stringify(this._d)); } catch(e) {} },
  get(store)    { return this._d[store] || []; },
  getSettings() { return this._d.settings || {}; },
  add(store, item) {
    item.id = uid(); item.createdAt = new Date().toISOString();
    this._d[store].push(item); this.save(); return item;
  },
  update(store, id, changes) {
    const i = this._d[store].findIndex(x => x.id===id);
    if (i !== -1) { this._d[store][i] = { ...this._d[store][i], ...changes }; this.save(); }
  },
  remove(store, id) { this._d[store] = this._d[store].filter(x => x.id!==id); this.save(); },
  saveSettings(obj) { this._d.settings = { ...this._d.settings, ...obj }; this.save(); },
  nuke() { this._d = this._blank(); this.save(); }
};

/* ── UTILS ────────────────────────────────────────────────────── */
const $   = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n  => { const c = DB.getSettings().currency || '$'; return c + Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); };
const today     = () => new Date().toISOString().slice(0,10);
const thisMonth = () => new Date().toISOString().slice(0,7);

/* ── TOAST ────────────────────────────────────────────────────── */
function showToast(msg, type='success') {
  const t=$('toast'); t.textContent=msg;
  t.className='toast show '+type;
  clearTimeout(t._t);
  t._t = setTimeout(()=>{ t.className='toast hidden'; }, 3000);
}

/* ── MODAL HELPERS ────────────────────────────────────────────── */
function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

/* Custom confirm replaces confirm() — no native dialogs */
let _confirmCb = null;
function showConfirm(title, msg, cb, dangerLabel='Delete') {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent   = msg;
  $('confirmYes').textContent   = dangerLabel;
  _confirmCb = cb;
  openModal('confirmModal');
}

/* Budget exceeded popup */
function showBudgetWarning(lines) {
  $('budgetExceededMsg').textContent = lines.join('\n');
  openModal('budgetExceededModal');
}

/* ── ALERTS ───────────────────────────────────────────────────── */
let _alerts = [];
function rebuildAlerts() {
  _alerts = [];
  const txs   = DB.get('transactions');
  const scheds = DB.get('scheduled');
  const month = thisMonth();

  // 1. Recurring expenses for this month not yet deducted
  const mExpense = effectiveExpenses(month);
  const mIncome  = effectiveIncome(month);

  if (mExpense > 0 && mExpense >= mIncome * 0.9) {
    const over = mExpense > mIncome;
    _alerts.push({
      type: over ? 'danger' : 'warn',
      text: over
        ? `Expenses (${fmt(mExpense)}) exceed income (${fmt(mIncome)}) by ${fmt(mExpense-mIncome)} this month!`
        : `Expenses are at ${Math.round(mExpense/mIncome*100)}% of your income this month.`
    });
  }

  // 2. Overdue bills
  const tod = today();
  DB.get('bills').filter(b=>!b.isPaid && !b.isTemplate && b.dueDate < tod).forEach(b=>{
    _alerts.push({ type:'warn', text:`Bill overdue: ${b.name} (${fmt(b.amount)}) was due ${b.dueDate}` });
  });

  // 3. Budget busts
  DB.get('budgets').filter(b=>b.month===month).forEach(b=>{
    const spent = txs.filter(t=>t.type==='expense'&&t.category===b.category&&t.date.startsWith(month))
                     .reduce((s,t)=>s+(+t.amount),0);
    if (spent > +b.limit)
      _alerts.push({ type:'danger', text:`Budget exceeded: ${b.category} — spent ${fmt(spent)} vs limit ${fmt(b.limit)}` });
  });

  const dot = $('alertDot');
  if (dot) dot.classList.toggle('show', _alerts.length > 0);

  // Update inline banners
  const show = _alerts.some(a=>a.type==='danger'||a.type==='warn');
  const worstMsg = _alerts[0] ? _alerts[0].text : '';
  ['incomeWarning','txWarning'].forEach(id => {
    const el=$(id); if(!el) return;
    el.classList.toggle('show', show);
  });
  ['incomeWarningText','txWarningText'].forEach(id => {
    const el=$(id); if(el) el.textContent = worstMsg;
  });
}

function openAlertModal() {
  rebuildAlerts();
  const list = $('alertList');
  const msg  = $('alertModalMsg');
  if (!_alerts.length) {
    msg.textContent = '✓ No active alerts — everything looks good!';
    msg.style.color = 'var(--green)';
    list.innerHTML  = '';
  } else {
    msg.textContent = `You have ${_alerts.length} alert${_alerts.length>1?'s':''}.`;
    msg.style.color = '';
    list.innerHTML  = _alerts.map(a=>`<li class="${a.type}">${esc(a.text)}</li>`).join('');
  }
  openModal('alertModal');
}

/* ── SCHEDULED ITEMS — auto-apply logic ───────────────────────── */
function applyScheduledItems() {
  /* For each scheduled item, ensure a transaction exists for each month
     from start month up to current month, on the correct day. */
  const scheds = DB.get('scheduled');
  if (!scheds.length) return;
  const txs   = DB.get('transactions');
  const now   = new Date();
  const curYM = thisMonth();

  scheds.forEach(s => {
    const startDate = new Date(s.startMonth + '-01');
    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= now) {
      const ym  = cur.toISOString().slice(0,7);
      const day = String(Math.min(+s.day, daysInMonth(cur.getFullYear(), cur.getMonth()+1))).padStart(2,'0');
      const date= `${ym}-${day}`;
      // Check if transaction already exists for this scheduled item + month
      const exists = txs.find(t => t.scheduledId===s.id && t.date.startsWith(ym));
      if (!exists && date <= today()) {
        DB.add('transactions', {
          type: s.type, amount: s.amount, description: s.name,
          category: s.category, date, notes: 'Auto-applied scheduled item',
          scheduledId: s.id
        });
      }
      cur.setMonth(cur.getMonth()+1);
    }
  });
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

/* Effective income includes scheduled + manual transactions */
function effectiveIncome(month) {
  return DB.get('transactions')
    .filter(t => t.type==='income' && t.date.startsWith(month))
    .reduce((s,t) => s+(+t.amount), 0);
}

/* Effective expenses includes manual txs + paid bills (if autoBook) */
function effectiveExpenses(month) {
  const txExp = DB.get('transactions')
    .filter(t => t.type==='expense' && t.date.startsWith(month))
    .reduce((s,t) => s+(+t.amount), 0);
  // Add paid bills that are autoBook but NOT already a transaction
  const billExp = DB.get('bills')
    .filter(b => b.isPaid && !b.isTemplate && b.autoBook && b.dueDate.startsWith(month) && !b.bookedTxId)
    .reduce((s,b) => s+(+b.amount), 0);
  return txExp + billExp;
}

/* ── ROUTING ──────────────────────────────────────────────────── */
let currentPage = 'dashboard';
const PAGE_TITLES = {
  dashboard:'Dashboard', transactions:'Transactions', budgets:'Budgets',
  bills:'Bills & Recurring', scheduled:'Scheduled', investments:'Investments',
  goals:'Savings Goals', reports:'Reports', tax:'Tax Summary', settings:'Settings'
};
const PAGE_RENDERERS = {
  dashboard: renderDashboard, transactions: renderTransactions,
  budgets: renderBudgets, bills: renderBills, scheduled: renderScheduled,
  investments: renderInvestments, goals: renderGoals, settings: renderSettings
};

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const el = $('page-'+page);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(a => a.classList.add('active'));
  const titleEl = $('topbarTitle');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page]||page;
  currentPage = page;
  if (PAGE_RENDERERS[page]) PAGE_RENDERERS[page]();
  rebuildAlerts();
}

/* ── DASHBOARD ────────────────────────────────────────────────── */
let barChartInst=null, pieChartInst=null, lineChartInst=null, schedChartInst=null;
let currentBarPeriod='6m';

function renderDashboard() {
  applyScheduledItems();
  const txs   = DB.get('transactions');
  const month = thisMonth();
  const mInc  = effectiveIncome(month);
  const mExp  = effectiveExpenses(month);
  const allInc = txs.filter(t=>t.type==='income').reduce((s,t)=>s+(+t.amount),0);
  const allExp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+(+t.amount),0);

  $('cardBalance').textContent = fmt(allInc - allExp);
  $('cardIncome').textContent  = fmt(mInc);
  $('cardExpense').textContent = fmt(mExp);
  $('cardSaved').textContent   = fmt(Math.max(0, mInc - mExp));

  renderBarChart(txs, currentBarPeriod);
  renderPieChart(txs, month);
  renderLineChart(txs);
  renderSankey(txs, month);
  renderRecentTx(txs);
  renderBudgetOverview(txs, month);
}

/* Bar chart */
function renderBarChart(txs, period) {
  const labels=[], incData=[], expData=[];
  let months=6, subLabel='Last 6 months';
  if (period==='1m') { months=1; subLabel='Last month'; }
  else if (period==='1y') { months=12; subLabel='Last 12 months'; }
  else if (period==='all') {
    const dates = txs.map(t=>t.date.slice(0,7)).filter(Boolean).sort();
    if (dates.length) {
      let cur=new Date(dates[0]+'-01'), end=new Date();
      while(cur<=end){
        const ym=cur.toISOString().slice(0,7);
        labels.push(cur.toLocaleString('default',{month:'short',year:'2-digit'}));
        incData.push(txs.filter(t=>t.type==='income'&&t.date.startsWith(ym)).reduce((s,t)=>s+(+t.amount),0));
        expData.push(txs.filter(t=>t.type==='expense'&&t.date.startsWith(ym)).reduce((s,t)=>s+(+t.amount),0));
        cur.setMonth(cur.getMonth()+1);
      }
      subLabel='All time';
    } else subLabel='All time (no data)';
    const el=$('barChartSub'); if(el) el.textContent=subLabel;
    buildBarChart(labels,incData,expData); return;
  }
  for(let i=months-1;i>=0;i--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    const ym=d.toISOString().slice(0,7);
    labels.push(d.toLocaleString('default',{month:'short',year:'2-digit'}));
    incData.push(txs.filter(t=>t.type==='income'&&t.date.startsWith(ym)).reduce((s,t)=>s+(+t.amount),0));
    expData.push(txs.filter(t=>t.type==='expense'&&t.date.startsWith(ym)).reduce((s,t)=>s+(+t.amount),0));
  }
  const el=$('barChartSub'); if(el) el.textContent=subLabel;
  buildBarChart(labels,incData,expData);
}
function buildBarChart(labels,incData,expData){
  const ctx=$('barChart'); if(!ctx) return;
  if(barChartInst){barChartInst.destroy(); barChartInst=null;}
  barChartInst=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[
      {label:'Income',data:incData,backgroundColor:'rgba(74,222,128,.7)',borderRadius:5},
      {label:'Expenses',data:expData,backgroundColor:'rgba(255,94,94,.7)',borderRadius:5}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#8892a4',font:{family:'DM Mono',size:11}}}},
      scales:{
        x:{ticks:{color:'#8892a4'},grid:{color:'#282c38'}},
        y:{ticks:{color:'#8892a4',callback:v=>(DB.getSettings().currency||'$')+v},grid:{color:'#282c38'},beginAtZero:true}
      }
    }
  });
}

/* Pie chart */
function renderPieChart(txs, month){
  const byCat={};
  txs.filter(t=>t.type==='expense'&&t.date.startsWith(month)).forEach(t=>{
    byCat[t.category]=(byCat[t.category]||0)+(+t.amount);
  });
  const labels=Object.keys(byCat), data=Object.values(byCat);
  const COLS=['#c8f060','#4ade80','#60a5fa','#a78bfa','#fb923c','#ff5e5e','#38bdf8','#fb7185','#34d399','#fbbf24'];
  const ctx=$('pieChart'); if(!ctx) return;
  if(pieChartInst){pieChartInst.destroy(); pieChartInst=null;}
  if(!labels.length){
    pieChartInst=new Chart(ctx,{type:'doughnut',
      data:{labels:['No data'],datasets:[{data:[1],backgroundColor:['#282c38'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}}}
    }); return;
  }
  pieChartInst=new Chart(ctx,{type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:COLS.slice(0,labels.length),borderWidth:2,borderColor:'#13151a'}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{color:'#8892a4',font:{family:'DM Mono',size:11},boxWidth:11,padding:9}}}
    }
  });
}

/* Line chart — running balance */
function renderLineChart(txs){
  const sorted=[...txs].sort((a,b)=>a.date.localeCompare(b.date));
  if(!sorted.length){
    const ctx=$('lineChart'); if(!ctx) return;
    if(lineChartInst){lineChartInst.destroy();lineChartInst=null;}
    lineChartInst=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{data:[]}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
    return;
  }
  let running=0;
  const labels=[], data=[];
  sorted.forEach(t=>{
    running += t.type==='income'?(+t.amount):(-(+t.amount));
    labels.push(t.date);
    data.push(+running.toFixed(2));
  });
  const ctx=$('lineChart'); if(!ctx) return;
  if(lineChartInst){lineChartInst.destroy();lineChartInst=null;}
  lineChartInst=new Chart(ctx,{type:'line',
    data:{labels,datasets:[{
      label:'Balance',data,
      borderColor:'#c8f060',backgroundColor:'rgba(200,240,96,.06)',
      tension:.35,pointRadius:1,borderWidth:2,fill:true
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{
        x:{ticks:{color:'#8892a4',maxTicksLimit:8,maxRotation:0},grid:{color:'#282c38'}},
        y:{ticks:{color:'#8892a4',callback:v=>(DB.getSettings().currency||'$')+v},grid:{color:'#282c38'}}
      }
    }
  });
}

/* Sankey diagram — custom Canvas draw */
function renderSankey(txs, month){
  const canvas=$('sankeyCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||600, H=280;
  canvas.width=W; canvas.height=H;
  ctx.clearRect(0,0,W,H);

  const mInc = txs.filter(t=>t.type==='income'&&t.date.startsWith(month)).reduce((s,t)=>s+(+t.amount),0);
  const byCat={};
  txs.filter(t=>t.type==='expense'&&t.date.startsWith(month)).forEach(t=>{
    byCat[t.category]=(byCat[t.category]||0)+(+t.amount);
  });
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(!mInc&&!cats.length){
    ctx.fillStyle='#454d5e'; ctx.font='13px DM Mono';
    ctx.textAlign='center'; ctx.fillText('No data for this month',W/2,H/2); return;
  }
  const COLS=['#4ade80','#60a5fa','#a78bfa','#fb923c','#fbbf24','#ff5e5e','#38bdf8','#fb7185'];
  const nodeW=18, pad=8, leftX=40, rightX=W-leftX-nodeW;
  const totalExp=cats.reduce((s,c)=>s+c[1],0);
  const sourceH=Math.min(H-2*pad, 200);
  const sourceY=(H-sourceH)/2;

  // Source node (Income)
  ctx.fillStyle='#4ade80';
  ctx.beginPath(); ctx.roundRect(leftX,sourceY,nodeW,sourceH,4); ctx.fill();
  ctx.fillStyle='#eef0f4'; ctx.font='11px DM Mono'; ctx.textAlign='right';
  ctx.fillText(fmt(mInc), leftX-6, sourceY+sourceH/2+4);

  // Target nodes (categories)
  let curY=pad;
  cats.forEach(([ cat, amt ], i)=>{
    const ratio = totalExp>0 ? amt/totalExp : 1/cats.length;
    const nodeH = Math.max(14, ratio*(H-2*pad));
    const col   = COLS[i%COLS.length];

    // Flow ribbon
    const srcFrac = totalExp>0 ? amt/Math.max(mInc,totalExp) : ratio;
    const srcY1   = sourceY + sourceH*(1-srcFrac)/2 + sourceH*srcFrac*(i/cats.length);
    const srcY2   = srcY1 + sourceH*srcFrac/cats.length;
    const tgtY1   = curY, tgtY2=curY+nodeH;

    ctx.beginPath();
    ctx.moveTo(leftX+nodeW, srcY1);
    ctx.bezierCurveTo((leftX+nodeW+rightX)/2, srcY1, (leftX+nodeW+rightX)/2, tgtY1, rightX, tgtY1);
    ctx.lineTo(rightX, tgtY2);
    ctx.bezierCurveTo((leftX+nodeW+rightX)/2, tgtY2, (leftX+nodeW+rightX)/2, srcY2, leftX+nodeW, srcY2);
    ctx.closePath();
    ctx.fillStyle = col+'33'; ctx.fill();

    // Target node
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.roundRect(rightX,curY,nodeW,nodeH,4); ctx.fill();

    // Label
    ctx.fillStyle='#eef0f4'; ctx.font='10px DM Mono'; ctx.textAlign='left';
    ctx.fillText(cat+' '+fmt(amt), rightX+nodeW+6, curY+nodeH/2+4);

    curY+=nodeH+4;
  });
}

/* Recent transactions */
function renderRecentTx(txs){
  const list=$('recentTxList');
  const recent=[...txs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(!recent.length){list.innerHTML='<div class="tx-empty">No transactions yet.</div>';return;}
  list.innerHTML=recent.map(t=>`
    <div class="tx-row">
      <div class="tx-dot ${t.type}"></div>
      <div style="flex:1;min-width:0">
        <div class="tx-desc">${esc(t.description)}</div>
        <div class="tx-cat">${esc(t.category)}</div>
      </div>
      <div class="tx-date-small">${t.date.slice(5)}</div>
      <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
    </div>`).join('');
}

/* Budget overview */
function renderBudgetOverview(txs, month){
  const list=$('budgetOverviewList');
  const budgets=DB.get('budgets').filter(b=>b.month===month);
  if(!budgets.length){list.innerHTML='<div class="tx-empty">No budgets set yet.</div>';return;}
  list.innerHTML=budgets.map(b=>{
    const spent=txs.filter(t=>t.type==='expense'&&t.category===b.category&&t.date.startsWith(month))
                   .reduce((s,t)=>s+(+t.amount),0);
    const pct=Math.min(100,+b.limit>0?(spent/+b.limit)*100:0);
    const cls=pct>=100?'danger':pct>=80?'warning':'';
    return `<div class="budget-item">
      <div class="budget-item-header">
        <span class="budget-item-name">${esc(b.category)}</span>
        <span class="budget-item-amounts">${fmt(spent)} / ${fmt(b.limit)}</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
    </div>`;
  }).join('');
}

/* ── TRANSACTIONS ─────────────────────────────────────────────── */
function renderTransactions(){
  let txs=DB.get('transactions');
  // Category filter dropdown
  const cats=[...new Set(txs.map(t=>t.category))].filter(Boolean);
  const cf=$('filterCategory'); const prev=cf.value;
  cf.innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option${c===prev?' selected':''}>${esc(c)}</option>`).join('');
  const tv=$('filterType').value, cv=cf.value, mv=$('filterMonth').value;
  if(tv) txs=txs.filter(t=>t.type===tv);
  if(cv) txs=txs.filter(t=>t.category===cv);
  if(mv) txs=txs.filter(t=>t.date.startsWith(mv));
  txs=[...txs].sort((a,b)=>b.date.localeCompare(a.date)); // latest first

  const tbody=$('txTableBody');
  if(!txs.length){tbody.innerHTML='<tr class="empty-row"><td colspan="6">No transactions found.</td></tr>';return;}
  tbody.innerHTML=txs.map(t=>`<tr>
    <td>${t.date}</td>
    <td>${esc(t.description)}${t.notes?`<div style="font-size:10px;color:var(--text-3)">${esc(t.notes)}</div>`:''}</td>
    <td>${esc(t.category)}</td>
    <td><span class="type-badge ${t.type}">${t.type}</span></td>
    <td class="align-right" style="color:${t.type==='income'?'var(--green)':'var(--red)'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
    <td class="align-right"><div class="table-actions">
      <span class="table-action edit" onclick="editTx('${t.id}')">Edit</span>
      <span class="table-action delete" onclick="deleteTx('${t.id}')">Delete</span>
    </div></td>
  </tr>`).join('');
  rebuildAlerts();
}

function openTxModal(id=null){
  $('txModalTitle').textContent = id?'Edit Transaction':'Add Transaction';
  $('txEditId').value=id||'';
  if(id){
    const t=DB.get('transactions').find(x=>x.id===id);
    if(!t) return;
    setToggle('txTypeToggle',t.type);
    $('txAmount').value=t.amount; $('txDesc').value=t.description;
    $('txCategory').value=t.category; $('txDate').value=t.date; $('txNotes').value=t.notes||'';
  } else {
    setToggle('txTypeToggle','expense');
    $('txAmount').value=$('txDesc').value=$('txNotes').value='';
    $('txCategory').value=''; $('txDate').value=today();
  }
  openModal('txModal');
  setTimeout(()=>$('txAmount').focus(),80);
}

function saveTx(){
  const amount=parseFloat($('txAmount').value);
  const desc=$('txDesc').value.trim();
  const cat=$('txCategory').value;
  const date=$('txDate').value;
  if(!amount||amount<=0){showToast('Enter a valid amount','error');return;}
  if(!desc)             {showToast('Enter a description','error');return;}
  if(!cat)              {showToast('Select a category','error');return;}
  if(!date)             {showToast('Select a date','error');return;}
  const data={type:getToggle('txTypeToggle'),amount:amount.toFixed(2),description:desc,category:cat,date,notes:$('txNotes').value.trim()};
  const eid=$('txEditId').value;
  if(eid) { DB.update('transactions',eid,data); showToast('Transaction updated'); }
  else    { DB.add('transactions',data);        showToast('Transaction added'); }
  closeModal('txModal');

  // Check if any budget was blown
  checkBudgetExceeded(data.category, data.date.slice(0,7));
  if(currentPage==='transactions') renderTransactions();
  if(currentPage==='dashboard')    renderDashboard();
  rebuildAlerts();
}

function checkBudgetExceeded(category, month){
  const budget=DB.get('budgets').find(b=>b.category===category&&b.month===month);
  if(!budget) return;
  const txs=DB.get('transactions');
  const spent=txs.filter(t=>t.type==='expense'&&t.category===category&&t.date.startsWith(month))
                 .reduce((s,t)=>s+(+t.amount),0);
  if(spent>+budget.limit){
    $('budgetExceededMsg').textContent=
      `You've spent ${fmt(spent)} on ${category} this month, exceeding your budget of ${fmt(budget.limit)} by ${fmt(spent-+budget.limit)}.`;
    openModal('budgetExceededModal');
  }
}

window.editTx = id => openTxModal(id);
window.deleteTx = id => showConfirm('Delete Transaction','Delete this transaction permanently?',()=>{
  DB.remove('transactions',id); showToast('Transaction deleted','warn');
  if(currentPage==='transactions') renderTransactions();
  if(currentPage==='dashboard')    renderDashboard();
  rebuildAlerts();
});

/* ── BUDGETS ──────────────────────────────────────────────────── */
function renderBudgets(){
  const month=$('budgetMonth').value||thisMonth();
  $('budgetMonth').value=month;
  const txs=DB.get('transactions');
  const budgets=DB.get('budgets').filter(b=>b.month===month);
  const grid=$('budgetGrid');
  if(!budgets.length){grid.innerHTML='<div class="tx-empty">No budgets for this month. Click + New Budget to add one.</div>';return;}
  grid.innerHTML=budgets.map(b=>{
    const spent=txs.filter(t=>t.type==='expense'&&t.category===b.category&&t.date.startsWith(month))
                   .reduce((s,t)=>s+(+t.amount),0);
    const pct=+b.limit>0?Math.min(100,spent/+b.limit*100):0;
    const rem=Math.max(0,+b.limit-spent);
    const cls=pct>=100?'danger':pct>=80?'warning':'';
    return `<div class="budget-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="budget-card-name">${esc(b.category)}</div>
        <div style="display:flex;gap:10px">
          <span class="table-action edit" onclick="editBudget('${b.id}')">Edit</span>
          <span class="table-action delete" onclick="deleteBudget('${b.id}')">Del</span>
        </div>
      </div>
      <div class="budget-card-amounts"><span class="spent">${fmt(spent)}</span><span class="limit"> / ${fmt(b.limit)}</span></div>
      <div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="budget-card-footer"><span>${fmt(rem)} remaining</span><span>${pct.toFixed(0)}%${pct>=100?' ⚠ EXCEEDED':''}</span></div>
    </div>`;
  }).join('');
}

function openBudgetModal(id=null){
  $('budgetModalTitle').textContent=id?'Edit Budget':'New Budget';
  $('budgetEditId').value=id||'';
  if(id){const b=DB.get('budgets').find(x=>x.id===id);$('budgetCategory').value=b.category;$('budgetLimit').value=b.limit;$('budgetMonthInput').value=b.month;}
  else  {$('budgetCategory').value='';$('budgetLimit').value='';$('budgetMonthInput').value=thisMonth();}
  openModal('budgetModal');
  setTimeout(()=>$('budgetLimit').focus(),80);
}

function saveBudget(){
  const cat=$('budgetCategory').value, limit=parseFloat($('budgetLimit').value), month=$('budgetMonthInput').value;
  if(!cat)           {showToast('Select a category','error');return;}
  if(!limit||limit<=0){showToast('Enter a valid limit','error');return;}
  if(!month)          {showToast('Select a month','error');return;}
  const eid=$('budgetEditId').value;
  if(!eid && DB.get('budgets').find(b=>b.category===cat&&b.month===month)){showToast('Budget already exists for this category/month','error');return;}
  const data={category:cat,limit:limit.toFixed(2),month};
  if(eid){DB.update('budgets',eid,data);showToast('Budget updated');}
  else   {DB.add('budgets',data);showToast('Budget created');}
  closeModal('budgetModal'); renderBudgets();
}

window.editBudget   = id => openBudgetModal(id);
window.deleteBudget = id => showConfirm('Delete Budget','Delete this budget?',()=>{
  DB.remove('budgets',id); showToast('Budget deleted','warn'); renderBudgets();
});

/* ── BILLS ────────────────────────────────────────────────────── */
let billTabFilter='upcoming';

function rollRecurringBills(){
  const bills=DB.get('bills');
  const now=new Date(), ym=thisMonth();
  bills.filter(b=>b.isRecurring&&b.isTemplate).forEach(tpl=>{
    const exists=bills.find(b=>b.templateId===tpl.id&&b.dueDate.startsWith(ym));
    if(!exists){
      const day=tpl.dueDate?tpl.dueDate.slice(8,10):'01';
      const mo=String(now.getMonth()+1).padStart(2,'0');
      DB.add('bills',{
        name:tpl.name, amount:tpl.amount, dueDate:`${now.getFullYear()}-${mo}-${day}`,
        category:tpl.category, isRecurring:true, isTemplate:false,
        templateId:tpl.id, isPaid:false, needsVerify:true, autoBook:tpl.autoBook
      });
    }
  });
}

function renderBills(){
  rollRecurringBills();
  let bills=DB.get('bills');
  const tod=today();
  if(billTabFilter==='upcoming')  bills=bills.filter(b=>!b.isPaid&&!b.isTemplate);
  if(billTabFilter==='recurring') bills=bills.filter(b=>b.isTemplate);
  if(billTabFilter==='paid')      bills=bills.filter(b=>b.isPaid&&!b.isTemplate);
  if(billTabFilter==='all')       bills=bills.filter(b=>!b.isTemplate);
  bills=[...bills].sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));

  const list=$('billsList');
  if(!bills.length){list.innerHTML='<div class="tx-empty">No bills here.</div>';return;}
  list.innerHTML=bills.map(b=>{
    const overdue=!b.isPaid&&!b.isTemplate&&b.dueDate<tod;
    let status, label;
    if(b.isTemplate)   {status='recurring';label='Auto-recurring';}
    else if(b.isPaid)   {status='paid';    label='Paid';}
    else if(overdue)    {status='overdue'; label='Overdue';}
    else                {status='upcoming';label='Upcoming';}
    if(b.autoBook&&!b.isPaid) status='auto';

    const verifyBtn = b.needsVerify&&!b.isPaid&&!b.isTemplate
      ? `<button class="verify-btn" onclick="verifyBill('${b.id}')">✓ Verify</button>` : '';
    const payBtn = !b.isPaid&&!b.isTemplate
      ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="markBillPaid('${b.id}')">Mark Paid</button>` : '';

    return `<div class="bill-row${b.isTemplate?' recurring-pending':b.autoBook?' auto-booked':''}">
      <div class="bill-icon">${b.isTemplate?'↺':'◷'}</div>
      <div class="bill-info">
        <div class="bill-name">${esc(b.name)}${b.needsVerify&&!b.isPaid?'<span style="font-size:10px;color:var(--accent);margin-left:6px">· verify</span>':''}${b.autoBook?'<span style="font-size:10px;color:var(--blue);margin-left:6px">· auto-deducts</span>':''}</div>
        <div class="bill-due">${b.isTemplate?'Rolls monthly':'Due '+b.dueDate} · ${esc(b.category)}</div>
      </div>
      <div class="bill-amount">${fmt(b.amount)}</div>
      <span class="bill-status ${status}">${label}</span>
      ${verifyBtn}${payBtn}
      <div class="table-actions" style="flex-shrink:0">
        <span class="table-action edit" onclick="editBill('${b.id}')">Edit</span>
        <span class="table-action delete" onclick="deleteBill('${b.id}')">Del</span>
      </div>
    </div>`;
  }).join('');
}

function openBillModal(id=null){
  $('billModalTitle').textContent=id?'Edit Bill':'New Bill';
  $('billEditId').value=id||'';
  if(id){
    const b=DB.get('bills').find(x=>x.id===id);
    $('billName').value=b.name; $('billAmount').value=b.amount;
    $('billDueDate').value=b.dueDate; $('billCategory').value=b.category;
    setToggle('billRecurringToggle',b.isRecurring?'true':'false');
    setToggle('billAutoBookToggle',b.autoBook?'true':'false');
  } else {
    $('billName').value=$('billAmount').value='';
    $('billDueDate').value=today(); $('billCategory').value='Housing';
    setToggle('billRecurringToggle','true'); setToggle('billAutoBookToggle','true');
  }
  openModal('billModal');
  setTimeout(()=>$('billName').focus(),80);
}

function saveBill(){
  const name=$('billName').value.trim(), amount=parseFloat($('billAmount').value), due=$('billDueDate').value;
  if(!name)           {showToast('Enter bill name','error');return;}
  if(!amount||amount<=0){showToast('Enter valid amount','error');return;}
  if(!due)             {showToast('Select due date','error');return;}
  const isRecurring=getToggle('billRecurringToggle')==='true';
  const autoBook=getToggle('billAutoBookToggle')==='true';
  const eid=$('billEditId').value;
  const base={name,amount:amount.toFixed(2),dueDate:due,category:$('billCategory').value,autoBook};
  if(eid){
    DB.update('bills',eid,{...base,isRecurring});
    showToast('Bill updated');
  } else {
    if(isRecurring){
      DB.add('bills',{...base,isRecurring:true,isTemplate:true,isPaid:false});
      showToast('Recurring bill added — rolls monthly automatically');
    } else {
      DB.add('bills',{...base,isRecurring:false,isTemplate:false,isPaid:false});
      showToast('Bill added');
    }
  }
  closeModal('billModal'); renderBills();
}

window.editBill   = id => openBillModal(id);
window.deleteBill = id => showConfirm('Delete Bill','Delete this bill?',()=>{
  DB.remove('bills',id); showToast('Bill deleted','warn'); renderBills();
});
window.verifyBill = id => { DB.update('bills',id,{needsVerify:false}); showToast('Bill verified'); renderBills(); };
window.markBillPaid = id => {
  const b=DB.get('bills').find(x=>x.id===id);
  DB.update('bills',id,{isPaid:true,needsVerify:false});
  // Auto-book as expense transaction
  if(b && b.autoBook && !b.bookedTxId){
    const tx=DB.add('transactions',{type:'expense',amount:b.amount,description:b.name+' (bill)',category:b.category,date:b.dueDate,notes:'Auto-booked from bill'});
    DB.update('bills',id,{bookedTxId:tx.id});
    showToast(`Marked paid — ${fmt(b.amount)} recorded as expense`);
    checkBudgetExceeded(b.category, b.dueDate.slice(0,7));
  } else {
    showToast('Marked as paid');
  }
  renderBills();
  rebuildAlerts();
};

/* ── SCHEDULED ────────────────────────────────────────────────── */
let schedChartInstSched=null;

function renderScheduled(){
  applyScheduledItems();
  const scheds=DB.get('scheduled');
  const list=$('schedList');
  if(!scheds.length){
    list.innerHTML='<div class="tx-empty" style="padding:24px">No scheduled items yet. Add your salary, rent, or any monthly amounts.</div>';
  } else {
    list.innerHTML=scheds.map(s=>{
      const nxt=nextOccurrence(s);
      return `<div class="sched-row">
        <div class="sched-icon${s.type==='expense'?' expense':''}">${s.type==='income'?'↓':'↑'}</div>
        <div class="sched-info">
          <div class="sched-name">${esc(s.name)}</div>
          <div class="sched-meta">${esc(s.category)} · Day ${s.day} monthly · From ${s.startMonth}</div>
        </div>
        <div class="sched-amount ${s.type}">${s.type==='income'?'+':'-'}${fmt(s.amount)}</div>
        <div class="sched-next">Next: ${nxt}</div>
        <div class="table-actions" style="flex-shrink:0;gap:10px">
          <span class="table-action edit" onclick="editSched('${s.id}')">Edit</span>
          <span class="table-action delete" onclick="deleteSched('${s.id}')">Del</span>
        </div>
      </div>`;
    }).join('');
  }
  renderSchedChart(scheds);
}

function nextOccurrence(s){
  const now=new Date();
  const d=new Date(now.getFullYear(),now.getMonth(),+s.day);
  if(d<now) d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,10);
}

function renderSchedChart(scheds){
  const labels=[], incData=[], expData=[];
  const now=new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    const ym=d.toISOString().slice(0,7);
    labels.push(d.toLocaleString('default',{month:'short',year:'2-digit'}));
    incData.push(scheds.filter(s=>s.type==='income'&&s.startMonth<=ym).reduce((a,s)=>a+(+s.amount),0));
    expData.push(scheds.filter(s=>s.type==='expense'&&s.startMonth<=ym).reduce((a,s)=>a+(+s.amount),0));
  }
  const ctx=$('schedChart'); if(!ctx) return;
  if(schedChartInst){schedChartInst.destroy();schedChartInst=null;}
  schedChartInst=new Chart(ctx,{type:'line',
    data:{labels,datasets:[
      {label:'Scheduled Income',data:incData,borderColor:'#4ade80',backgroundColor:'rgba(74,222,128,.07)',tension:.3,fill:true},
      {label:'Scheduled Expenses',data:expData,borderColor:'#ff5e5e',backgroundColor:'rgba(255,94,94,.07)',tension:.3,fill:true}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#8892a4',font:{family:'DM Mono',size:11}}}},
      scales:{
        x:{ticks:{color:'#8892a4'},grid:{color:'#282c38'}},
        y:{ticks:{color:'#8892a4',callback:v=>(DB.getSettings().currency||'$')+v},grid:{color:'#282c38'},beginAtZero:true}
      }
    }
  });
}

function openSchedModal(id=null){
  $('schedModalTitle').textContent=id?'Edit Scheduled Item':'New Scheduled Item';
  $('schedEditId').value=id||'';
  if(id){
    const s=DB.get('scheduled').find(x=>x.id===id);
    $('schedName').value=s.name; setToggle('schedTypeToggle',s.type);
    $('schedAmount').value=s.amount; $('schedCategory').value=s.category;
    $('schedDay').value=s.day; $('schedStart').value=s.startMonth;
  } else {
    $('schedName').value=$('schedAmount').value='';
    $('schedDay').value=1; $('schedStart').value=thisMonth();
    setToggle('schedTypeToggle','income'); $('schedCategory').value='Salary';
  }
  openModal('schedModal');
  setTimeout(()=>$('schedName').focus(),80);
}

function saveSched(){
  const name=$('schedName').value.trim(), type=getToggle('schedTypeToggle');
  const amount=parseFloat($('schedAmount').value), cat=$('schedCategory').value;
  const day=parseInt($('schedDay').value), start=$('schedStart').value;
  if(!name)           {showToast('Enter a name','error');return;}
  if(!amount||amount<=0){showToast('Enter a valid amount','error');return;}
  if(!day||day<1||day>28){showToast('Day must be 1–28','error');return;}
  if(!start)           {showToast('Select a start month','error');return;}
  const data={name,type,amount:amount.toFixed(2),category:cat,day,startMonth:start};
  const eid=$('schedEditId').value;
  if(eid){DB.update('scheduled',eid,data);showToast('Scheduled item updated');}
  else   {DB.add('scheduled',data);showToast('Scheduled item added — will auto-apply each month');}
  closeModal('schedModal');
  applyScheduledItems();
  renderScheduled();
}

window.editSched   = id => openSchedModal(id);
window.deleteSched = id => showConfirm('Delete Scheduled Item','This will stop future auto-entries. Past transactions will remain.',()=>{
  DB.remove('scheduled',id); showToast('Removed','warn'); renderScheduled();
});

/* ── INVESTMENTS ──────────────────────────────────────────────── */
function renderInvestments(){
  const invs=DB.get('investments');
  const ti=invs.reduce((s,i)=>s+(+i.amount),0);
  const tc=invs.reduce((s,i)=>s+(+i.current),0);
  const tr=tc-ti, rp=ti>0?(tr/ti)*100:0;
  $('invTotalInvested').textContent=fmt(ti);
  $('invCurrentValue').textContent=fmt(tc);
  $('invTotalReturn').textContent=(tr>=0?'+':'')+fmt(tr);
  $('invReturnPct').textContent=(rp>=0?'+':'')+rp.toFixed(2)+'%';
  const tbody=$('investTableBody');
  if(!invs.length){tbody.innerHTML='<tr class="empty-row"><td colspan="7">No investments recorded yet.</td></tr>';return;}
  tbody.innerHTML=[...invs].sort((a,b)=>b.date.localeCompare(a.date)).map(i=>{
    const ret=(+i.current)-(+i.amount);
    const rpt=+i.amount>0?(ret/+i.amount*100).toFixed(1):'0.0';
    const col=ret>=0?'var(--green)':'var(--red)';
    return `<tr>
      <td>${esc(i.name)}</td><td>${esc(i.type)}</td><td>${i.date}</td>
      <td class="align-right">${fmt(i.amount)}</td>
      <td class="align-right">${fmt(i.current)}</td>
      <td class="align-right" style="color:${col}">${ret>=0?'+':''}${fmt(ret)} (${rpt}%)</td>
      <td class="align-right"><div class="table-actions">
        <span class="table-action edit" onclick="editInvest('${i.id}')">Edit</span>
        <span class="table-action delete" onclick="deleteInvest('${i.id}')">Del</span>
      </div></td>
    </tr>`;
  }).join('');
}

function openInvestModal(id=null){
  $('investModalTitle').textContent=id?'Edit Investment':'Add Investment';
  $('investEditId').value=id||'';
  if(id){const i=DB.get('investments').find(x=>x.id===id);$('investName').value=i.name;$('investType').value=i.type;$('investAmount').value=i.amount;$('investCurrent').value=i.current;$('investDate').value=i.date;}
  else  {$('investName').value=$('investAmount').value=$('investCurrent').value='';$('investDate').value=today();}
  openModal('investModal');
  setTimeout(()=>$('investName').focus(),80);
}

function saveInvest(){
  const name=$('investName').value.trim(), amount=parseFloat($('investAmount').value);
  const current=parseFloat($('investCurrent').value), date=$('investDate').value;
  if(!name)                    {showToast('Enter a name','error');return;}
  if(!amount||amount<=0)       {showToast('Enter amount invested','error');return;}
  if(isNaN(current)||current<0){showToast('Enter current value','error');return;}
  if(!date)                    {showToast('Select a date','error');return;}
  const data={name,type:$('investType').value,amount:amount.toFixed(2),current:current.toFixed(2),date};
  const eid=$('investEditId').value;
  if(eid){DB.update('investments',eid,data);showToast('Investment updated');}
  else   {DB.add('investments',data);showToast('Investment added');}
  closeModal('investModal'); renderInvestments();
}

window.editInvest   = id => openInvestModal(id);
window.deleteInvest = id => showConfirm('Delete Investment','Delete this investment record?',()=>{
  DB.remove('investments',id); showToast('Deleted','warn'); renderInvestments();
});

/* ── GOALS ────────────────────────────────────────────────────── */
function renderGoals(){
  const goals=DB.get('goals');
  const active=goals.filter(g=>+g.saved<+g.target);
  const done  =goals.filter(g=>+g.saved>=+g.target);
  const grid=$('goalsGrid'), cgrid=$('completedGoalsGrid');
  grid.innerHTML  = active.length ? active.map(g=>goalCard(g,false)).join('') : '<div class="tx-empty">No active goals. Add one!</div>';
  cgrid.innerHTML = done.length   ? done.map(g=>goalCard(g,true)).join('')    : '<div class="tx-empty">Complete a goal to see it here! 🎯</div>';
}

function goalCard(g, done){
  const pct=+g.target>0?Math.min(100,+g.saved/+g.target*100):0;
  const rem=Math.max(0,+g.target-+g.saved);
  if(done) return `<div class="goal-card completed-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="goal-name">${esc(g.name)}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="goal-completed-badge">✓ Complete</span>
        <span class="table-action delete" onclick="deleteGoal('${g.id}')">Del</span>
      </div>
    </div>
    <div class="goal-amounts"><div class="goal-saved">${fmt(g.saved)}</div><div class="goal-target">of ${fmt(g.target)}</div></div>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:100%"></div></div>
    <div style="font-size:11px;color:var(--text-3);margin-top:4px">🎉 Goal achieved!${g.deadline?' · Target was '+g.deadline:''}</div>
  </div>`;
  return `<div class="goal-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div class="goal-name">${esc(g.name)}</div>
      <div style="display:flex;gap:8px">
        <span class="table-action edit" onclick="editGoal('${g.id}')">Edit</span>
        <span class="table-action delete" onclick="deleteGoal('${g.id}')">Del</span>
      </div>
    </div>
    <div class="goal-amounts"><div class="goal-saved">${fmt(g.saved)}</div><div class="goal-target">of ${fmt(g.target)}</div></div>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct.toFixed(1)}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-top:4px">
      <span>${pct.toFixed(0)}% complete</span><span>${fmt(rem)} to go${g.deadline?' · Due '+g.deadline:''}</span>
    </div>
    <button class="btn btn-ghost" style="margin-top:8px;width:100%;font-size:12px;justify-content:center" onclick="openAddSavings('${g.id}')">+ Add Savings</button>
  </div>`;
}

function openGoalModal(id=null){
  $('goalModalTitle').textContent=id?'Edit Goal':'New Savings Goal';
  $('goalEditId').value=id||'';
  if(id){const g=DB.get('goals').find(x=>x.id===id);$('goalName').value=g.name;$('goalTarget').value=g.target;$('goalSaved').value=g.saved;$('goalDeadline').value=g.deadline||'';}
  else  {$('goalName').value=$('goalTarget').value=$('goalSaved').value=$('goalDeadline').value='';}
  openModal('goalModal');
  setTimeout(()=>$('goalName').focus(),80);
}

function saveGoal(){
  const name=$('goalName').value.trim(), target=parseFloat($('goalTarget').value);
  const saved=parseFloat($('goalSaved').value)||0;
  if(!name)          {showToast('Enter goal name','error');return;}
  if(!target||target<=0){showToast('Enter target amount','error');return;}
  const eid=$('goalEditId').value;
  const wasComplete=eid?+DB.get('goals').find(x=>x.id===eid)?.saved>=+DB.get('goals').find(x=>x.id===eid)?.target:false;
  const data={name,target:target.toFixed(2),saved:saved.toFixed(2),deadline:$('goalDeadline').value};
  if(eid){DB.update('goals',eid,data);showToast('Goal updated');}
  else   {DB.add('goals',data);showToast('Goal created');}
  closeModal('goalModal');
  if(saved>=target && !wasComplete) launchConfetti();
  renderGoals();
}

window.editGoal   = id => openGoalModal(id);
window.deleteGoal = id => showConfirm('Delete Goal','Delete this savings goal?',()=>{
  DB.remove('goals',id); showToast('Goal deleted','warn'); renderGoals();
});
window.openAddSavings = id => {
  const g=DB.get('goals').find(x=>x.id===id);
  $('addSavingsTitle').textContent=`Add to "${g.name}"`;
  $('addSavingsGoalId').value=id; $('addSavingsAmount').value='';
  openModal('addSavingsModal');
  setTimeout(()=>$('addSavingsAmount').focus(),80);
};
function saveAddSavings(){
  const id=$('addSavingsGoalId').value, amt=parseFloat($('addSavingsAmount').value);
  if(!amt||amt<=0){showToast('Enter a valid amount','error');return;}
  const g=DB.get('goals').find(x=>x.id===id);
  const newSaved=(+g.saved+amt);
  const wasComplete=+g.saved>=+g.target;
  DB.update('goals',id,{saved:newSaved.toFixed(2)});
  closeModal('addSavingsModal');
  showToast(fmt(amt)+' added to '+g.name);
  if(newSaved>=+g.target && !wasComplete) launchConfetti();
  renderGoals();
}

/* ── CONFETTI ─────────────────────────────────────────────────── */
function launchConfetti(){
  showToast('🎉 Goal completed! Congratulations!');
  const cv=$('confettiCanvas');
  const W=cv.width=window.innerWidth, H=cv.height=window.innerHeight;
  const ctx=cv.getContext('2d');
  const COLS=['#c8f060','#4ade80','#60a5fa','#a78bfa','#fb923c','#ff5e5e','#fbbf24','#38bdf8'];
  const ps=[];
  for(let i=0;i<130;i++){
    const left=i<65;
    ps.push({x:left?0:W,y:H*.35+Math.random()*H*.3,vx:left?(4+Math.random()*7):(-(4+Math.random()*7)),
      vy:-(6+Math.random()*9),color:COLS[Math.floor(Math.random()*COLS.length)],
      size:5+Math.random()*8,rot:Math.random()*360,rs:(Math.random()-.5)*10,g:.28,op:1});
  }
  let f=0;
  (function draw(){
    ctx.clearRect(0,0,W,H);
    ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.rot+=p.rs;if(f>80)p.op-=.018;
      ctx.save();ctx.globalAlpha=Math.max(0,p.op);ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.5);ctx.restore();});
    f++;
    if(f<160) requestAnimationFrame(draw); else ctx.clearRect(0,0,W,H);
  })();
}

/* ── SETTINGS ─────────────────────────────────────────────────── */
function renderSettings(){
  const s=DB.getSettings();
  $('settingName').value=s.name||''; $('settingEmail').value=s.email||''; $('settingCurrency').value=s.currency||'$';
}
function updateUserUI(){
  const session=AUTH.getSession();
  const name=session?session.name:'User';
  const el=$('sidebarUserName'); if(el) el.textContent=name;
  const av=$('userAvatar'); if(av) av.textContent=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const rl=$('userRoleLabel'); if(rl) rl.textContent=session?.isGuest?'Guest Account':'Personal Account';
}

function exportCSV(){
  const txs=DB.get('transactions');
  if(!txs.length){showToast('No transactions to export','error');return;}
  const rows=[['Date','Description','Category','Type','Amount','Notes'],
    ...txs.map(t=>[t.date,'"'+t.description+'"',t.category,t.type,t.amount,'"'+(t.notes||'')+'"'])];
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='fintrack_'+today()+'.csv'; a.click();
  showToast('CSV exported');
}

/* ── TOGGLE HELPERS ───────────────────────────────────────────── */
function setToggle(gid, val){
  document.querySelectorAll('#'+gid+' .toggle-btn').forEach(b=>b.classList.toggle('active',b.dataset.value===val));
}
function getToggle(gid){
  const a=document.querySelector('#'+gid+' .toggle-btn.active');
  return a?a.dataset.value:null;
}
function initToggleGroups(){
  document.querySelectorAll('.toggle-group').forEach(grp=>{
    grp.addEventListener('click',e=>{
      const b=e.target.closest('.toggle-btn'); if(!b) return;
      grp.querySelectorAll('.toggle-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    });
  });
}

/* ── AUTH UI ──────────────────────────────────────────────────── */
function initAuthUI(){
  document.querySelectorAll('.auth-tab[data-authtab]').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const p=tab.dataset.authtab;
      document.querySelectorAll('.auth-panel').forEach(x=>x.classList.remove('active'));
      $('authPanel'+p[0].toUpperCase()+p.slice(1)).classList.add('active');
    });
  });

  function doLogin(){
    const email=$('loginEmail').value.trim(), pass=$('loginPassword').value;
    const err=$('loginError'); err.classList.remove('show');
    if(!email||!pass){err.textContent='Please fill in all fields.';err.classList.add('show');return;}
    const r=AUTH.login(email,pass);
    if(!r.ok){err.textContent=r.error;err.classList.add('show');return;}
    bootApp();
  }
  function doSignup(){
    const name=$('signupName').value.trim(),email=$('signupEmail').value.trim(),pass=$('signupPassword').value;
    const err=$('signupError'); err.classList.remove('show');
    if(!name||!email||!pass){err.textContent='Please fill in all fields.';err.classList.add('show');return;}
    const r=AUTH.signup(name,email,pass);
    if(!r.ok){err.textContent=r.error;err.classList.add('show');return;}
    bootApp();
  }

  $('loginBtn').addEventListener('click', doLogin);
  $('signupBtn').addEventListener('click', doSignup);
  // Enter key on all auth inputs
  ['loginEmail','loginPassword'].forEach(id=>{ $(id).addEventListener('keydown',e=>{if(e.key==='Enter') doLogin();}); });
  ['signupName','signupEmail','signupPassword'].forEach(id=>{ $(id).addEventListener('keydown',e=>{if(e.key==='Enter') doSignup();}); });
  [$('guestBtn'),$('guestBtn2')].forEach(b=>b.addEventListener('click',()=>{AUTH.loginGuest();bootApp();}));
}

/* ── GLOBAL ENTER KEY for modals ──────────────────────────────── */
function initModalEnterKeys(){
  // Transaction modal — Enter on any input triggers save
  ['txAmount','txDesc','txDate'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveTx();}});
  });
  ['budgetLimit'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveBudget();}});
  });
  ['billName','billAmount'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveBill();}});
  });
  ['schedName','schedAmount','schedDay'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveSched();}});
  });
  ['investName','investAmount','investCurrent'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveInvest();}});
  });
  ['goalName','goalTarget','goalSaved'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveGoal();}});
  });
  ['addSavingsAmount'].forEach(id=>{
    const el=$(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveAddSavings();}});
  });
}

/* ── EVENTS ───────────────────────────────────────────────────── */
function initEvents(){
  // Nav
  document.querySelectorAll('.nav-item[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();goTo(a.dataset.page);}));
  document.querySelectorAll('.panel-link[data-page]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();goTo(a.dataset.page);}));

  // Sidebar toggle
  $('sidebarToggle').addEventListener('click',()=>$('sidebar').classList.toggle('collapsed'));

  // Date
  $('topbarDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});

  // Alerts
  $('alertBtn').addEventListener('click', openAlertModal);
  $('alertModalClose').addEventListener('click',()=>closeModal('alertModal'));
  $('alertModalDismiss').addEventListener('click',()=>{_alerts=[];closeModal('alertModal');rebuildAlerts();});

  // Confirm modal
  $('confirmClose').addEventListener('click',()=>closeModal('confirmModal'));
  $('confirmNo').addEventListener('click',()=>closeModal('confirmModal'));
  $('confirmYes').addEventListener('click',()=>{closeModal('confirmModal');if(_confirmCb){_confirmCb();_confirmCb=null;}});

  // Budget exceeded
  $('budgetExceededClose').addEventListener('click',()=>closeModal('budgetExceededModal'));
  $('budgetExceededOk').addEventListener('click',()=>closeModal('budgetExceededModal'));

  // Transactions
  $('quickAddBtn').addEventListener('click',()=>openTxModal());
  $('addTxBtn').addEventListener('click',()=>openTxModal());
  $('txModalClose').addEventListener('click',()=>closeModal('txModal'));
  $('txModalCancel').addEventListener('click',()=>closeModal('txModal'));
  $('txModalSave').addEventListener('click',saveTx);
  $('filterType').addEventListener('change',renderTransactions);
  $('filterCategory').addEventListener('change',renderTransactions);
  $('filterMonth').addEventListener('change',renderTransactions);
  $('filterReset').addEventListener('click',()=>{$('filterType').value=$('filterCategory').value=$('filterMonth').value='';renderTransactions();});

  // Budgets
  $('addBudgetBtn').addEventListener('click',()=>openBudgetModal());
  $('budgetModalClose').addEventListener('click',()=>closeModal('budgetModal'));
  $('budgetModalCancel').addEventListener('click',()=>closeModal('budgetModal'));
  $('budgetModalSave').addEventListener('click',saveBudget);
  $('budgetMonth').addEventListener('change',renderBudgets);

  // Bills
  $('addBillBtn').addEventListener('click',()=>openBillModal());
  $('billModalClose').addEventListener('click',()=>closeModal('billModal'));
  $('billModalCancel').addEventListener('click',()=>closeModal('billModal'));
  $('billModalSave').addEventListener('click',saveBill);
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); billTabFilter=btn.dataset.tab; renderBills();
  }));

  // Scheduled
  $('addSchedBtn').addEventListener('click',()=>openSchedModal());
  $('schedModalClose').addEventListener('click',()=>closeModal('schedModal'));
  $('schedModalCancel').addEventListener('click',()=>closeModal('schedModal'));
  $('schedModalSave').addEventListener('click',saveSched);

  // Investments
  $('addInvestBtn').addEventListener('click',()=>openInvestModal());
  $('investModalClose').addEventListener('click',()=>closeModal('investModal'));
  $('investModalCancel').addEventListener('click',()=>closeModal('investModal'));
  $('investModalSave').addEventListener('click',saveInvest);

  // Goals
  $('addGoalBtn').addEventListener('click',()=>openGoalModal());
  $('goalModalClose').addEventListener('click',()=>closeModal('goalModal'));
  $('goalModalCancel').addEventListener('click',()=>closeModal('goalModal'));
  $('goalModalSave').addEventListener('click',saveGoal);
  $('addSavingsClose').addEventListener('click',()=>closeModal('addSavingsModal'));
  $('addSavingsCancel').addEventListener('click',()=>closeModal('addSavingsModal'));
  $('addSavingsSave').addEventListener('click',saveAddSavings);

  // Settings
  $('saveProfileBtn').addEventListener('click',()=>{
    const name=$('settingName').value.trim();
    DB.saveSettings({name,email:$('settingEmail').value.trim()});
    const s=AUTH.getSession(); if(s){s.name=name;AUTH.save();}
    updateUserUI(); showToast('Profile saved');
  });
  $('savePrefsBtn').addEventListener('click',()=>{DB.saveSettings({currency:$('settingCurrency').value});showToast('Preferences saved');});
  $('exportCsvBtn').addEventListener('click',exportCSV);
  $('deleteAllBtn').addEventListener('click',()=>showConfirm('Delete All Data','This will permanently delete ALL your data. Cannot be undone.',()=>{
    DB.nuke(); showToast('All data deleted','warn'); goTo('dashboard');
  },'Delete Everything'));

  // Logout
  $('logoutBtn').addEventListener('click',e=>{
    e.preventDefault();
    AUTH.logout();
    $('authScreen').classList.remove('hidden');
    $('loginEmail').value=$('loginPassword').value='';
    $('loginError').classList.remove('show');
    showToast('Logged out');
  });

  // Chart period
  document.querySelectorAll('.chart-period-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.chart-period-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); currentBarPeriod=btn.dataset.period;
    renderBarChart(DB.get('transactions'),currentBarPeriod);
  }));

  // Close modal on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{
    if(e.target===o) o.classList.add('hidden');
  }));

  // Escape key
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>m.classList.add('hidden'));
  });
}

/* ── BOOT ─────────────────────────────────────────────────────── */
function bootApp(){
  $('authScreen').classList.add('hidden');
  DB.load();
  const session=AUTH.getSession();
  if(session&&!session.isGuest){
    const s=DB.getSettings();
    if(!s.name||s.name==='') DB.saveSettings({name:session.name,email:session.email});
  }
  updateUserUI();
  applyScheduledItems();
  goTo('dashboard');
}

document.addEventListener('DOMContentLoaded',()=>{
  AUTH.load();
  initAuthUI();
  initToggleGroups();
  initEvents();
  initModalEnterKeys();
  if(AUTH.isLoggedIn()) bootApp();
  else $('authScreen').classList.remove('hidden');
});