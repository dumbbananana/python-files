/* =============================================================
   FINTRACK — app.js
   Full frontend backend. All data stored in localStorage.
   To connect a real database later: replace the DB object load/save
   methods with fetch() calls to your Django API. Everything else stays.
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   DB — localStorage abstraction layer
   Django migration path: replace load/save with fetch('/api/...')
   ------------------------------------------------------------- */
const DB = {
  _data: {
    transactions: [],
    budgets: [],
    bills: [],
    investments: [],
    goals: [],
    settings: { name: 'John Doe', email: '', currency: '$' }
  },

  load() {
    try {
      const saved = localStorage.getItem('fintrack_v1');
      if (saved) this._data = JSON.parse(saved);
    } catch (e) { console.warn('DB load failed', e); }
    return this;
  },

  save() {
    try { localStorage.setItem('fintrack_v1', JSON.stringify(this._data)); }
    catch (e) { console.warn('DB save failed', e); }
    return this;
  },

  get(store)    { return this._data[store] || []; },
  getSettings() { return this._data.settings || {}; },

  add(store, item) {
    item.id        = Date.now().toString(36) + Math.random().toString(36).slice(2);
    item.createdAt = new Date().toISOString();
    this._data[store].push(item);
    this.save();
    return item;
  },

  update(store, id, changes) {
    const idx = this._data[store].findIndex(x => x.id === id);
    if (idx !== -1) { this._data[store][idx] = { ...this._data[store][idx], ...changes }; this.save(); }
  },

  remove(store, id) {
    this._data[store] = this._data[store].filter(x => x.id !== id);
    this.save();
  },

  saveSettings(obj) {
    this._data.settings = { ...this._data.settings, ...obj };
    this.save();
  },

  nuke() {
    this._data = { transactions:[], budgets:[], bills:[], investments:[], goals:[],
                   settings:{ name:'John Doe', email:'', currency:'$' } };
    this.save();
  }
};

/* -------------------------------------------------------------
   UTILS
   ------------------------------------------------------------- */
const $   = id => document.getElementById(id);
const fmt = n  => { const s = DB.getSettings().currency || '$'; return s + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); };
const today     = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const esc = str => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 2800);
}

function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

/* -------------------------------------------------------------
   ROUTING
   ------------------------------------------------------------- */
let currentPage = 'dashboard';
const PAGE_TITLES = {
  dashboard:'Dashboard', transactions:'Transactions', budgets:'Budgets',
  bills:'Bills & Recurring', investments:'Investments', goals:'Savings Goals',
  reports:'Reports', tax:'Tax Summary', settings:'Settings'
};

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const el = $('page-' + page);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-page="' + page + '"]').forEach(a => a.classList.add('active'));
  $('topbarTitle').textContent = PAGE_TITLES[page] || page;
  currentPage = page;
  const map = { dashboard:renderDashboard, transactions:renderTransactions, budgets:renderBudgets,
                bills:renderBills, investments:renderInvestments, goals:renderGoals, settings:renderSettings };
  if (map[page]) map[page]();
}

/* -------------------------------------------------------------
   DASHBOARD
   ------------------------------------------------------------- */
let barChartInst = null;
let pieChartInst = null;

function renderDashboard() {
  const txs   = DB.get('transactions');
  const month = thisMonth();

  const allIncome  = txs.filter(t => t.type==='income').reduce((s,t) => s + +t.amount, 0);
  const allExpense = txs.filter(t => t.type==='expense').reduce((s,t) => s + +t.amount, 0);
  const mIncome    = txs.filter(t => t.type==='income'  && t.date.startsWith(month)).reduce((s,t) => s + +t.amount, 0);
  const mExpense   = txs.filter(t => t.type==='expense' && t.date.startsWith(month)).reduce((s,t) => s + +t.amount, 0);

  $('cardBalance').textContent = fmt(allIncome - allExpense);
  $('cardIncome').textContent  = fmt(mIncome);
  $('cardExpense').textContent = fmt(mExpense);
  $('cardSaved').textContent   = fmt(Math.max(0, mIncome - mExpense));

  renderBarChart(txs);
  renderPieChart(txs, month);
  renderRecentTx(txs);
  renderBudgetOverview();
}

function renderBarChart(txs) {
  const labels = [], incomeData = [], expenseData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0,7);
    labels.push(d.toLocaleString('default', {month:'short', year:'2-digit'}));
    incomeData.push(txs.filter(t => t.type==='income'  && t.date.startsWith(key)).reduce((s,t) => s + +t.amount, 0));
    expenseData.push(txs.filter(t => t.type==='expense' && t.date.startsWith(key)).reduce((s,t) => s + +t.amount, 0));
  }
  const ctx = $('barChart').getContext('2d');
  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [
      { label:'Income',   data:incomeData,  backgroundColor:'rgba(74,222,128,0.75)', borderRadius:6 },
      { label:'Expenses', data:expenseData, backgroundColor:'rgba(255,94,94,0.75)',  borderRadius:6 }
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#8b909e', font:{family:'DM Mono',size:11} } } },
      scales:{
        x:{ ticks:{color:'#8b909e'}, grid:{color:'#2a2d35'} },
        y:{ ticks:{color:'#8b909e', callback: v => '$'+v}, grid:{color:'#2a2d35'}, beginAtZero:true }
      }
    }
  });
}

function renderPieChart(txs, month) {
  const expenses = txs.filter(t => t.type==='expense' && t.date.startsWith(month));
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category]||0) + +t.amount; });
  const labels = Object.keys(byCat);
  const data   = Object.values(byCat);
  const COLORS = ['#c8f060','#4ade80','#5ea8ff','#a78bfa','#ffb347','#ff5e5e','#38bdf8','#fb7185','#34d399','#fbbf24'];
  const ctx = $('pieChart').getContext('2d');
  if (pieChartInst) pieChartInst.destroy();
  if (!labels.length) {
    pieChartInst = new Chart(ctx, { type:'doughnut',
      data:{ labels:['No data'], datasets:[{ data:[1], backgroundColor:['#2a2d35'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{enabled:false} } }
    }); return;
  }
  pieChartInst = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:COLORS.slice(0,labels.length), borderWidth:2, borderColor:'#16181c' }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ color:'#8b909e', font:{family:'DM Mono',size:11}, boxWidth:12, padding:10 } } }
    }
  });
}

function renderRecentTx(txs) {
  const list   = $('recentTxList');
  const recent = [...txs].sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  if (!recent.length) { list.innerHTML = '<div class="tx-empty">No transactions yet.</div>'; return; }
  list.innerHTML = recent.map(t => `
    <div class="tx-row">
      <div class="tx-dot ${t.type}"></div>
      <div class="tx-desc">${esc(t.description)}</div>
      <div class="tx-cat">${esc(t.category)}</div>
      <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
    </div>`).join('');
}

function renderBudgetOverview() {
  const list    = $('budgetOverviewList');
  const month   = thisMonth();
  const budgets = DB.get('budgets').filter(b => b.month === month);
  const txs     = DB.get('transactions');
  if (!budgets.length) { list.innerHTML = '<div class="tx-empty">No budgets set yet.</div>'; return; }
  list.innerHTML = budgets.map(b => {
    const spent = txs.filter(t => t.type==='expense' && t.category===b.category && t.date.startsWith(month))
                     .reduce((s,t) => s + +t.amount, 0);
    const pct = Math.min(100, b.limit>0 ? (spent/b.limit)*100 : 0).toFixed(0);
    const cls = pct>=100?'danger':pct>=80?'warning':'';
    return `<div class="budget-item">
      <div class="budget-item-header">
        <span class="budget-item-name">${esc(b.category)}</span>
        <span class="budget-item-amounts">${fmt(spent)} / ${fmt(b.limit)}</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

/* -------------------------------------------------------------
   TRANSACTIONS
   ------------------------------------------------------------- */
function renderTransactions() {
  let txs = DB.get('transactions');
  const cats = [...new Set(txs.map(t => t.category))].filter(Boolean);
  const cf = $('filterCategory');
  const prev = cf.value;
  cf.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option${c===prev?' selected':''}>${esc(c)}</option>`).join('');

  const tv = $('filterType').value;
  const cv = cf.value;
  const mv = $('filterMonth').value;
  if (tv) txs = txs.filter(t => t.type === tv);
  if (cv) txs = txs.filter(t => t.category === cv);
  if (mv) txs = txs.filter(t => t.date.startsWith(mv));
  txs = [...txs].sort((a,b) => b.date.localeCompare(a.date));

  const tbody = $('txTableBody');
  if (!txs.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No transactions found.</td></tr>'; return; }
  tbody.innerHTML = txs.map(t => `<tr>
    <td>${t.date}</td>
    <td>${esc(t.description)}${t.notes?'<div style="font-size:10px;color:var(--text-3)">'+esc(t.notes)+'</div>':''}</td>
    <td>${esc(t.category)}</td>
    <td><span class="type-badge ${t.type}">${t.type}</span></td>
    <td class="align-right" style="color:${t.type==='income'?'var(--green)':'var(--red)'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
    <td class="align-right"><div class="table-actions">
      <span class="table-action edit" onclick="editTx('${t.id}')">Edit</span>
      <span class="table-action delete" onclick="deleteTx('${t.id}')">Delete</span>
    </div></td>
  </tr>`).join('');
}

function openTxModal(id=null) {
  $('txModalTitle').textContent = id ? 'Edit Transaction' : 'Add Transaction';
  $('txEditId').value = id||'';
  if (id) {
    const t = DB.get('transactions').find(x => x.id===id);
    setToggle('txTypeToggle', t.type);
    $('txAmount').value=$('txDesc').value=$('txCategory').value=$('txDate').value=$('txNotes').value='';
    $('txAmount').value   = t.amount;
    $('txDesc').value     = t.description;
    $('txCategory').value = t.category;
    $('txDate').value     = t.date;
    $('txNotes').value    = t.notes||'';
  } else {
    setToggle('txTypeToggle','expense');
    $('txAmount').value=$('txDesc').value=$('txNotes').value='';
    $('txCategory').value=''; $('txDate').value=today();
  }
  openModal('txModal');
}

function saveTx() {
  const amount = parseFloat($('txAmount').value);
  const desc   = $('txDesc').value.trim();
  const cat    = $('txCategory').value;
  const date   = $('txDate').value;
  if (!amount||amount<=0){ showToast('Enter a valid amount','error'); return; }
  if (!desc)             { showToast('Enter a description','error'); return; }
  if (!cat)              { showToast('Select a category','error'); return; }
  if (!date)             { showToast('Select a date','error'); return; }
  const data = { type:getToggleValue('txTypeToggle'), amount:amount.toFixed(2), description:desc, category:cat, date, notes:$('txNotes').value.trim() };
  const eid  = $('txEditId').value;
  if (eid) { DB.update('transactions',eid,data); showToast('Transaction updated'); }
  else     { DB.add('transactions',data);        showToast('Transaction added'); }
  closeModal('txModal');
  renderTransactions();
  if (currentPage==='dashboard') renderDashboard();
}

window.editTx   = id => openTxModal(id);
window.deleteTx = id => {
  if (!confirm('Delete this transaction?')) return;
  DB.remove('transactions',id); showToast('Transaction deleted'); renderTransactions();
  if (currentPage==='dashboard') renderDashboard();
};

/* -------------------------------------------------------------
   BUDGETS
   ------------------------------------------------------------- */
function renderBudgets() {
  const month = $('budgetMonth').value || thisMonth();
  $('budgetMonth').value = month;
  const budgets = DB.get('budgets').filter(b => b.month===month);
  const txs     = DB.get('transactions');
  const grid    = $('budgetGrid');
  if (!budgets.length) { grid.innerHTML='<div class="tx-empty">No budgets for this month.</div>'; return; }
  grid.innerHTML = budgets.map(b => {
    const spent = txs.filter(t => t.type==='expense'&&t.category===b.category&&t.date.startsWith(month))
                     .reduce((s,t) => s + +t.amount, 0);
    const pct = b.limit>0 ? Math.min(100,(spent/b.limit)*100) : 0;
    const rem = Math.max(0, b.limit - spent);
    const cls = pct>=100?'danger':pct>=80?'warning':'';
    return `<div class="budget-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div class="budget-card-name">${esc(b.category)}</div>
        <div style="display:flex;gap:10px">
          <span class="table-action edit" onclick="editBudget('${b.id}')">Edit</span>
          <span class="table-action delete" onclick="deleteBudget('${b.id}')">Del</span>
        </div>
      </div>
      <div class="budget-card-amounts"><span class="spent">${fmt(spent)}</span><span class="limit"> / ${fmt(b.limit)}</span></div>
      <div class="progress-bar-wrap"><div class="progress-bar ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="budget-card-footer"><span class="remaining">${fmt(rem)} remaining</span><span class="pct">${pct.toFixed(0)}%</span></div>
    </div>`;
  }).join('');
}

function openBudgetModal(id=null) {
  $('budgetModalTitle').textContent = id?'Edit Budget':'New Budget';
  $('budgetEditId').value = id||'';
  if (id) { const b=DB.get('budgets').find(x=>x.id===id); $('budgetCategory').value=b.category; $('budgetLimit').value=b.limit; $('budgetMonthInput').value=b.month; }
  else    { $('budgetCategory').value=''; $('budgetLimit').value=''; $('budgetMonthInput').value=thisMonth(); }
  openModal('budgetModal');
}

function saveBudget() {
  const cat=  $('budgetCategory').value;
  const limit=parseFloat($('budgetLimit').value);
  const month=$('budgetMonthInput').value;
  if (!cat)             { showToast('Select a category','error'); return; }
  if (!limit||limit<=0) { showToast('Enter a valid limit','error'); return; }
  if (!month)           { showToast('Select a month','error'); return; }
  const data = { category:cat, limit:limit.toFixed(2), month };
  const eid  = $('budgetEditId').value;
  if (eid) { DB.update('budgets',eid,data); showToast('Budget updated'); }
  else {
    if (DB.get('budgets').find(b=>b.category===cat&&b.month===month)) { showToast('Budget already exists for this category/month','error'); return; }
    DB.add('budgets',data); showToast('Budget created');
  }
  closeModal('budgetModal'); renderBudgets();
}

window.editBudget   = id => openBudgetModal(id);
window.deleteBudget = id => { if(!confirm('Delete budget?'))return; DB.remove('budgets',id); showToast('Budget deleted'); renderBudgets(); };

/* -------------------------------------------------------------
   BILLS
   ------------------------------------------------------------- */
let billTabFilter = 'upcoming';

function renderBills() {
  let bills = DB.get('bills');
  const tod = today();
  if (billTabFilter==='paid')     bills = bills.filter(b=>b.isPaid);
  if (billTabFilter==='upcoming') bills = bills.filter(b=>!b.isPaid);
  bills = [...bills].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const list = $('billsList');
  if (!bills.length) { list.innerHTML='<div class="tx-empty">No bills here.</div>'; return; }
  list.innerHTML = bills.map(b => {
    const overdue = !b.isPaid && b.dueDate < tod;
    const status  = b.isPaid?'paid':overdue?'overdue':'upcoming';
    const label   = b.isPaid?'Paid':overdue?'Overdue':'Upcoming';
    return `<div class="bill-row">
      <div class="bill-icon">◷</div>
      <div class="bill-info">
        <div class="bill-name">${esc(b.name)}</div>
        <div class="bill-due">${b.isRecurring?'Monthly · ':''}Due ${b.dueDate} · ${esc(b.category)}</div>
      </div>
      <div class="bill-amount">${fmt(b.amount)}</div>
      <span class="bill-status ${status}">${label}</span>
      ${!b.isPaid?`<button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="markBillPaid('${b.id}')">Mark Paid</button>`:''}
      <div class="table-actions" style="flex-shrink:0">
        <span class="table-action edit" onclick="editBill('${b.id}')">Edit</span>
        <span class="table-action delete" onclick="deleteBill('${b.id}')">Del</span>
      </div>
    </div>`;
  }).join('');
}

function openBillModal(id=null) {
  $('billModalTitle').textContent = id?'Edit Bill':'New Bill';
  $('billEditId').value = id||'';
  if (id) { const b=DB.get('bills').find(x=>x.id===id); $('billName').value=b.name; $('billAmount').value=b.amount; $('billDueDate').value=b.dueDate; $('billCategory').value=b.category; setToggle('billRecurringToggle',b.isRecurring?'true':'false'); }
  else    { $('billName').value=$('billAmount').value=''; $('billDueDate').value=today(); $('billCategory').value='Housing'; setToggle('billRecurringToggle','true'); }
  openModal('billModal');
}

function saveBill() {
  const name  =$('billName').value.trim();
  const amount=parseFloat($('billAmount').value);
  const due   =$('billDueDate').value;
  if (!name)          { showToast('Enter bill name','error'); return; }
  if (!amount||amount<=0){ showToast('Enter valid amount','error'); return; }
  if (!due)           { showToast('Select due date','error'); return; }
  const data = { name, amount:amount.toFixed(2), dueDate:due, category:$('billCategory').value, isRecurring:getToggleValue('billRecurringToggle')==='true', isPaid:false };
  const eid  = $('billEditId').value;
  if (eid) { const ex=DB.get('bills').find(x=>x.id===eid); DB.update('bills',eid,{...data,isPaid:ex.isPaid}); showToast('Bill updated'); }
  else     { DB.add('bills',data); showToast('Bill added'); }
  closeModal('billModal'); renderBills();
}

window.editBill     = id => openBillModal(id);
window.deleteBill   = id => { if(!confirm('Delete bill?'))return; DB.remove('bills',id); showToast('Bill deleted'); renderBills(); };
window.markBillPaid = id => { DB.update('bills',id,{isPaid:true}); showToast('Marked as paid'); renderBills(); };

/* -------------------------------------------------------------
   INVESTMENTS
   ------------------------------------------------------------- */
function renderInvestments() {
  const invs = DB.get('investments');
  const ti = invs.reduce((s,i)=>s + +i.amount, 0);
  const tc = invs.reduce((s,i)=>s + +i.current,0);
  const tr = tc - ti;
  const rp = ti>0 ? (tr/ti)*100 : 0;
  $('invTotalInvested').textContent = fmt(ti);
  $('invCurrentValue').textContent  = fmt(tc);
  $('invTotalReturn').textContent   = (tr>=0?'+':'')+fmt(tr);
  $('invReturnPct').textContent     = (rp>=0?'+':'')+rp.toFixed(2)+'%';
  const tbody = $('investTableBody');
  if (!invs.length) { tbody.innerHTML='<tr class="empty-row"><td colspan="7">No investments recorded yet.</td></tr>'; return; }
  tbody.innerHTML = [...invs].sort((a,b)=>b.date.localeCompare(a.date)).map(i => {
    const ret = +i.current - +i.amount;
    const rpt = +i.amount>0 ? (ret/+i.amount*100).toFixed(1) : '0.0';
    const col = ret>=0?'var(--green)':'var(--red)';
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

function openInvestModal(id=null) {
  $('investModalTitle').textContent = id?'Edit Investment':'Add Investment';
  $('investEditId').value = id||'';
  if (id) { const i=DB.get('investments').find(x=>x.id===id); $('investName').value=i.name; $('investType').value=i.type; $('investAmount').value=i.amount; $('investCurrent').value=i.current; $('investDate').value=i.date; }
  else    { $('investName').value=$('investAmount').value=$('investCurrent').value=''; $('investDate').value=today(); }
  openModal('investModal');
}

function saveInvest() {
  const name   =$('investName').value.trim();
  const amount =parseFloat($('investAmount').value);
  const current=parseFloat($('investCurrent').value);
  const date   =$('investDate').value;
  if (!name)                        { showToast('Enter name','error'); return; }
  if (!amount||amount<=0)           { showToast('Enter amount invested','error'); return; }
  if (isNaN(current)||current<0)    { showToast('Enter current value','error'); return; }
  if (!date)                        { showToast('Select date','error'); return; }
  const data = { name, type:$('investType').value, amount:amount.toFixed(2), current:current.toFixed(2), date };
  const eid  = $('investEditId').value;
  if (eid) { DB.update('investments',eid,data); showToast('Investment updated'); }
  else     { DB.add('investments',data);        showToast('Investment added'); }
  closeModal('investModal'); renderInvestments();
}

window.editInvest   = id => openInvestModal(id);
window.deleteInvest = id => { if(!confirm('Delete investment?'))return; DB.remove('investments',id); showToast('Deleted'); renderInvestments(); };

/* -------------------------------------------------------------
   GOALS
   ------------------------------------------------------------- */
function renderGoals() {
  const goals = DB.get('goals');
  const grid  = $('goalsGrid');
  if (!goals.length) { grid.innerHTML='<div class="tx-empty">No goals set yet.</div>'; return; }
  grid.innerHTML = goals.map(g => {
    const pct = g.target>0 ? Math.min(100,(+g.saved/+g.target)*100) : 0;
    const rem = Math.max(0, +g.target - +g.saved);
    return `<div class="goal-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="goal-name">${esc(g.name)}</div>
        <div style="display:flex;gap:10px">
          <span class="table-action edit" onclick="editGoal('${g.id}')">Edit</span>
          <span class="table-action delete" onclick="deleteGoal('${g.id}')">Del</span>
        </div>
      </div>
      <div class="goal-amounts">
        <div class="goal-saved">${fmt(g.saved)}</div>
        <div class="goal-target">of ${fmt(g.target)}</div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct.toFixed(1)}%;background:var(--accent)"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-top:6px">
        <span>${pct.toFixed(0)}% complete</span>
        <span>${fmt(rem)} to go${g.deadline?' · Due '+g.deadline:''}</span>
      </div>
      <button class="btn btn-ghost" style="margin-top:10px;width:100%;font-size:12px;justify-content:center" onclick="addToGoal('${g.id}')">+ Add Savings</button>
    </div>`;
  }).join('');
}

function openGoalModal(id=null) {
  $('goalModalTitle').textContent = id?'Edit Goal':'New Savings Goal';
  $('goalEditId').value = id||'';
  if (id) { const g=DB.get('goals').find(x=>x.id===id); $('goalName').value=g.name; $('goalTarget').value=g.target; $('goalSaved').value=g.saved; $('goalDeadline').value=g.deadline||''; }
  else    { $('goalName').value=$('goalTarget').value=$('goalSaved').value=$('goalDeadline').value=''; }
  openModal('goalModal');
}

function saveGoal() {
  const name  =$('goalName').value.trim();
  const target=parseFloat($('goalTarget').value);
  const saved =parseFloat($('goalSaved').value)||0;
  if (!name)             { showToast('Enter goal name','error'); return; }
  if (!target||target<=0){ showToast('Enter target amount','error'); return; }
  const data = { name, target:target.toFixed(2), saved:saved.toFixed(2), deadline:$('goalDeadline').value };
  const eid  = $('goalEditId').value;
  if (eid) { DB.update('goals',eid,data); showToast('Goal updated'); }
  else     { DB.add('goals',data);        showToast('Goal added'); }
  closeModal('goalModal'); renderGoals();
}

window.editGoal   = id => openGoalModal(id);
window.deleteGoal = id => { if(!confirm('Delete goal?'))return; DB.remove('goals',id); showToast('Goal deleted'); renderGoals(); };
window.addToGoal  = id => {
  const g  = DB.get('goals').find(x=>x.id===id);
  const v  = prompt(`Amount to add to "${g.name}":`);
  const amt = parseFloat(v);
  if (!amt||amt<=0) return;
  DB.update('goals',id,{ saved:(+g.saved+amt).toFixed(2) });
  showToast(fmt(amt)+' added to '+g.name); renderGoals();
};

/* -------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------- */
function renderSettings() {
  const s = DB.getSettings();
  $('settingName').value     = s.name||'';
  $('settingEmail').value    = s.email||'';
  $('settingCurrency').value = s.currency||'$';
}

function updateUserUI() {
  const s    = DB.getSettings();
  const name = s.name||'User';
  $('sidebarUserName').textContent = name;
  $('userAvatar').textContent = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}

function exportCSV() {
  const txs = DB.get('transactions');
  if (!txs.length) { showToast('No transactions to export','error'); return; }
  const rows = [['Date','Description','Category','Type','Amount','Notes'],
    ...txs.map(t=>[t.date,'"'+t.description+'"',t.category,t.type,t.amount,'"'+(t.notes||'')+'"'])];
  const csv = rows.map(r=>r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download= 'fintrack_export_'+today()+'.csv';
  a.click(); showToast('CSV exported');
}

/* -------------------------------------------------------------
   TOGGLE HELPERS
   ------------------------------------------------------------- */
function setToggle(groupId, value) {
  document.querySelectorAll('#'+groupId+' .toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.value===value));
}
function getToggleValue(groupId) {
  const a = document.querySelector('#'+groupId+' .toggle-btn.active');
  return a ? a.dataset.value : null;
}
function initToggleGroups() {
  document.querySelectorAll('.toggle-group').forEach(group => {
    group.addEventListener('click', e => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      group.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* -------------------------------------------------------------
   EVENTS
   ------------------------------------------------------------- */
function initEvents() {
  // Nav
  document.querySelectorAll('.nav-item[data-page]').forEach(a => a.addEventListener('click', e=>{ e.preventDefault(); goTo(a.dataset.page); }));
  document.querySelectorAll('.panel-link[data-page]').forEach(a => a.addEventListener('click', e=>{ e.preventDefault(); goTo(a.dataset.page); }));

  // Sidebar toggle
  $('sidebarToggle').addEventListener('click', ()=>{ $('sidebar').classList.toggle('collapsed'); });

  // Date display
  $('topbarDate').textContent = new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});

  // Transaction
  $('quickAddBtn').addEventListener('click', ()=>openTxModal());
  $('addTxBtn').addEventListener('click',    ()=>openTxModal());
  $('txModalClose').addEventListener('click',  ()=>closeModal('txModal'));
  $('txModalCancel').addEventListener('click', ()=>closeModal('txModal'));
  $('txModalSave').addEventListener('click',   saveTx);
  $('filterType').addEventListener('change',     renderTransactions);
  $('filterCategory').addEventListener('change', renderTransactions);
  $('filterMonth').addEventListener('change',    renderTransactions);
  $('filterReset').addEventListener('click', ()=>{ $('filterType').value=$('filterCategory').value=$('filterMonth').value=''; renderTransactions(); });

  // Budgets
  $('addBudgetBtn').addEventListener('click',      ()=>openBudgetModal());
  $('budgetModalClose').addEventListener('click',  ()=>closeModal('budgetModal'));
  $('budgetModalCancel').addEventListener('click', ()=>closeModal('budgetModal'));
  $('budgetModalSave').addEventListener('click',   saveBudget);
  $('budgetMonth').addEventListener('change',      renderBudgets);

  // Bills
  $('addBillBtn').addEventListener('click',      ()=>openBillModal());
  $('billModalClose').addEventListener('click',  ()=>closeModal('billModal'));
  $('billModalCancel').addEventListener('click', ()=>closeModal('billModal'));
  $('billModalSave').addEventListener('click',   saveBill);
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); billTabFilter=btn.dataset.tab; renderBills();
  }));

  // Investments
  $('addInvestBtn').addEventListener('click',      ()=>openInvestModal());
  $('investModalClose').addEventListener('click',  ()=>closeModal('investModal'));
  $('investModalCancel').addEventListener('click', ()=>closeModal('investModal'));
  $('investModalSave').addEventListener('click',   saveInvest);

  // Goals
  $('addGoalBtn').addEventListener('click',      ()=>openGoalModal());
  $('goalModalClose').addEventListener('click',  ()=>closeModal('goalModal'));
  $('goalModalCancel').addEventListener('click', ()=>closeModal('goalModal'));
  $('goalModalSave').addEventListener('click',   saveGoal);

  // Settings
  $('saveProfileBtn').addEventListener('click', ()=>{ DB.saveSettings({name:$('settingName').value.trim(),email:$('settingEmail').value.trim()}); updateUserUI(); showToast('Profile saved'); });
  $('savePrefsBtn').addEventListener('click',   ()=>{ DB.saveSettings({currency:$('settingCurrency').value}); showToast('Preferences saved'); });
  $('exportCsvBtn').addEventListener('click',   exportCSV);
  $('deleteAllBtn').addEventListener('click', ()=>{ if(!confirm('Delete ALL data permanently?'))return; DB.nuke(); showToast('All data deleted'); goTo('dashboard'); });
  $('logoutBtn').addEventListener('click', e=>{ e.preventDefault(); showToast('Logged out — connect Django for real auth'); });

  // Close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e=>{ if(e.target===o) o.classList.add('hidden'); }));

  // Escape key closes modals
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>m.classList.add('hidden')); });
}

/* -------------------------------------------------------------
   BOOT
   ------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  DB.load();
  initToggleGroups();
  initEvents();
  updateUserUI();
  goTo('dashboard');
});