(function (root) {
  'use strict';

  const VERSION = 8;
  const STORAGE_KEY = 'cashflow-meter-v8';
  const LEGACY_KEYS = ['cashflow-meter-v7','cashflow-meter-v6','cashflow-meter-v5','cashflow-meter-v4','cashflow-meter-v3','cashflow-meter-v2'];
  const SAFE_BUFFER = 400000;

  const assetIds = ['mizuhoPersonal','mizuhoGroup','jibunBank','cashSafe'];
  const incomeIds = ['incomeCf','incomeMf','incomeBitfan','incomeConfirmed'];
  const expectedIds = ['incomeExpected'];
  const paymentIds = ['payHb','payEpos','payAu','paySalary','payCar','payInvoice'];
  const dateIds = ['dateIncomeCf','dateIncomeMf','dateIncomeBitfan','dateIncomeConfirmed','dateIncomeExpected','datePayHb','datePayEpos','datePayAu','datePaySalary','datePayCar','datePayInvoice'];
  const numericIds = [...assetIds,...incomeIds,...expectedIds,...paymentIds,'deferred'];
  const allIds = ['referenceDate',...numericIds,...dateIds];

  const defs = [
    {id:'payHb',dateId:'datePayHb',name:'HBカード',kind:'payment',statusId:'statusPayHb',card:true},
    {id:'payEpos',dateId:'datePayEpos',name:'epos',kind:'payment',statusId:'statusPayEpos',card:true},
    {id:'payAu',dateId:'datePayAu',name:'au',kind:'payment',statusId:'statusPayAu',card:true},
    {id:'paySalary',dateId:'datePaySalary',name:'給与',kind:'payment',statusId:'statusPaySalary',card:false},
    {id:'payCar',dateId:'datePayCar',name:'車',kind:'payment',statusId:'statusPayCar',card:false},
    {id:'payInvoice',dateId:'datePayInvoice',name:'請求書',kind:'payment',statusId:'statusPayInvoice',card:false},
    {id:'incomeCf',dateId:'dateIncomeCf',name:'CF入金',kind:'income',confirmed:true},
    {id:'incomeMf',dateId:'dateIncomeMf',name:'mf入金',kind:'income',confirmed:true},
    {id:'incomeBitfan',dateId:'dateIncomeBitfan',name:'Bitfan入金',kind:'income',confirmed:true},
    {id:'incomeConfirmed',dateId:'dateIncomeConfirmed',name:'確定入金',kind:'income',confirmed:true},
    {id:'incomeExpected',dateId:'dateIncomeExpected',name:'入金見込み',kind:'income',confirmed:false}
  ];

  function localISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function parseISO(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [y,m,d] = value.split('-').map(Number);
    const x = new Date(y,m-1,d);
    return x.getFullYear()===y && x.getMonth()===m-1 && x.getDate()===d ? x : null;
  }
  function daysInMonth(y,mZero) { return new Date(y,mZero+1,0).getDate(); }
  function occurrence(baseValue, day, includeToday) {
    const base = parseISO(baseValue) || new Date();
    let y=base.getFullYear(), m=base.getMonth();
    let d=new Date(y,m,Math.min(day,daysInMonth(y,m)));
    const b=new Date(y,m,base.getDate());
    if (d < b || (!includeToday && d.getTime()===b.getTime())) {
      m += 1;
      d = new Date(y,m,Math.min(day,daysInMonth(y,m)));
    }
    return localISO(d);
  }
  function monthEnd(baseValue) {
    const base=parseISO(baseValue)||new Date();
    let d=new Date(base.getFullYear(),base.getMonth()+1,0);
    if (d <= base) d=new Date(base.getFullYear(),base.getMonth()+2,0);
    return localISO(d);
  }
  function dateDefaults(ref) {
    return {
      dateIncomeCf:occurrence(ref,15,false), dateIncomeMf:occurrence(ref,25,false), dateIncomeBitfan:occurrence(ref,30,false),
      dateIncomeConfirmed:ref, dateIncomeExpected:ref,
      datePayHb:occurrence(ref,26,false), datePayEpos:occurrence(ref,27,false), datePayAu:occurrence(ref,10,false),
      datePaySalary:occurrence(ref,25,false), datePayCar:occurrence(ref,25,false), datePayInvoice:monthEnd(ref)
    };
  }
  const todayISO = localISO(new Date());
  const defaults = Object.assign({
    referenceDate:todayISO,
    mizuhoPersonal:0,mizuhoGroup:0,jibunBank:0,cashSafe:0,
    incomeCf:0,incomeMf:0,incomeBitfan:0,incomeConfirmed:0,incomeExpected:0,
    payHb:0,payEpos:0,payAu:0,paySalary:340000,payCar:34000,payInvoice:0,deferred:0
  }, dateDefaults(todayISO));

  function normalizeState(raw) {
    let source = raw && raw.data && typeof raw.data==='object' ? raw.data : raw;
    if (!source || typeof source!=='object') source={};
    const ref=parseISO(source.referenceDate) ? source.referenceDate : todayISO;
    const result=Object.assign({},defaults,source,{referenceDate:ref});
    const generated=dateDefaults(ref);
    numericIds.forEach(id => {
      const n=Number(result[id]);
      result[id]=Number.isFinite(n)&&n>=0?n:defaults[id];
    });
    dateIds.forEach(id => { if(!parseISO(result[id])) result[id]=generated[id]; });
    return result;
  }

  function makeEvents(state, includeExpected) {
    const ref=state.referenceDate;
    return defs.map((d,index) => {
      const amount=Math.max(0,Number(state[d.id])||0);
      const date=parseISO(state[d.dateId]) ? state[d.dateId] : '';
      const sign=d.kind==='payment'?-1:1;
      const confirmed=d.kind==='payment' || d.confirmed!==false;
      return Object.assign({},d,{amount,date,sign,confirmed,index});
    }).filter(e => e.amount>0 && e.date && e.date>=ref && (includeExpected || e.confirmed))
      .sort((a,b)=>a.date.localeCompare(b.date) || a.sign-b.sign || a.index-b.index);
  }

  function project(state, includeExpected) {
    const assets=assetIds.reduce((s,id)=>s+(Number(state[id])||0),0);
    let balance=assets, minimum=assets, minimumDate=state.referenceDate;
    const rows=[{date:state.referenceDate,name:'現在資産',kind:'start',sign:0,amount:assets,balance}];
    for (const e of makeEvents(state,includeExpected)) {
      balance += e.sign*e.amount;
      if (balance<minimum) { minimum=balance; minimumDate=e.date; }
      rows.push(Object.assign({},e,{balance}));
    }
    return {assets,balance,minimum,minimumDate,rows};
  }

  function statusFor(balance) {
    if (balance<0) return {text:'不可',className:'impossible'};
    if (balance<SAFE_BUFFER) return {text:'危険',className:'risk'};
    return {text:'安全',className:'safe'};
  }

  function installmentAdvice(projection) {
    if (projection.minimum>=SAFE_BUFFER) return {level:'safe',title:'分割不要',detail:`最低残高は${money(projection.minimum)}。安全基準40万円を維持できます。`};
    const need=SAFE_BUFFER-projection.minimum;
    const cards=projection.rows.filter(r=>r.card && r.kind==='payment' && r.date<=projection.minimumDate).sort((a,b)=>b.date.localeCompare(a.date));
    if (!cards.length) return {level:'impossible',title:'カード分割では解決不可',detail:`安全圏まで${money(need)}不足していますが、最低点までにカード支払いがありません。`};
    let remaining=need; const plans=[];
    for (const card of cards) {
      const amount=Math.min(card.amount,remaining);
      if(amount>0) plans.push({name:card.name,amount});
      remaining-=amount;
      if(remaining<=0) break;
    }
    if(remaining>0) return {level:'impossible',title:'カード分割だけでは不足',detail:`対象カードを全額未来へ回しても、さらに${money(remaining)}必要です。`};
    return {level:projection.minimum<0?'impossible':'risk',title:`分割候補：${plans.map(x=>x.name).join(' → ')}`,detail:`合計${money(need)}を未来へ回す目安。${plans.map(x=>`${x.name} ${money(x.amount)}`).join('、')}。`};
  }

  function money(n) { return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(Number(n)||0)); }
  function formatDate(v) { const d=parseISO(v); return d?`${d.getMonth()+1}/${d.getDate()}`:'日付未設定'; }

  const core={VERSION,SAFE_BUFFER,defaults,dateDefaults,normalizeState,makeEvents,project,statusFor,installmentAdvice,money,formatDate};
  if (typeof module!=='undefined' && module.exports) module.exports=core;
  if (!root.document) return;

  const $=id=>root.document.getElementById(id);
  function readState() {
    const out={};
    allIds.forEach(id=>{
      const el=$(id);
      out[id]=el && el.type==='date' ? el.value : Math.max(0,Number(el&&el.value)||0);
    });
    return normalizeState(out);
  }
  function writeState(state) {
    allIds.forEach(id=>{ const el=$(id); if(el) el.value=state[id] ?? defaults[id] ?? ''; });
  }
  function setText(id,text) { const el=$(id); if(el) el.textContent=text; }
  function toast(text) { const t=document.createElement('div'); t.className='toast'; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),1800); }

  function renderTimeline(rows,minimumDate) {
    const box=$('timeline'); if(!box) return;
    box.innerHTML='';
    rows.forEach((r,i)=>{
      const div=document.createElement('div');
      const st=i===0?null:statusFor(r.balance);
      div.className='timeline-item'+(r.date===minimumDate&&i>0?' low':'')+(i===0?' start':'');
      const change=i===0?'開始':`${r.sign>0?'+':'−'}${money(r.amount)}`;
      div.innerHTML=`<span class="timeline-date">${formatDate(r.date)}</span><span class="timeline-name">${r.name}</span><span class="timeline-balance"><strong>${money(r.balance)}</strong><span class="timeline-change ${r.sign>0?'plus':r.sign<0?'minus':''}">${change}</span></span>${st?`<span class="timeline-status ${st.className}">${st.text}</span>`:''}`;
      box.appendChild(div);
    });
  }

  function renderStatuses(state,rows) {
    defs.filter(d=>d.kind==='payment').forEach(d=>{
      const badge=$(d.statusId); if(!badge) return;
      badge.className='payment-status';
      const amount=Number(state[d.id])||0;
      if(amount<=0){badge.textContent='未入力';badge.classList.add('empty');return;}
      const row=rows.find(r=>r.id===d.id);
      if(!row){badge.textContent='対象外';badge.classList.add('empty');return;}
      const s=statusFor(row.balance); badge.textContent=s.text; badge.classList.add(s.className); badge.title=`支払い後残高 ${money(row.balance)}`;
    });
  }

  function render() {
    try {
      const state=readState();
      const confirmed=project(state,false), optimistic=project(state,true);
      const incomeTotal=[...incomeIds,...expectedIds].reduce((s,id)=>s+state[id],0);
      const confirmedIncome=incomeIds.reduce((s,id)=>s+state[id],0);
      const paymentTotal=paymentIds.reduce((s,id)=>s+state[id],0);
      setText('assetTotal',money(confirmed.assets)); setText('incomeTotal',money(incomeTotal)); setText('paymentTotal',money(paymentTotal));
      setText('grandAssets',money(confirmed.assets)); setText('grandIncome',money(confirmedIncome)); setText('grandPayments',money(paymentTotal));
      setText('finalBalance',`最終 ${money(confirmed.balance)}`); setText('optimisticBalance',money(optimistic.balance));
      setText('remaining',money(confirmed.minimum)); setText('minimumDate',`最低点：${formatDate(confirmed.minimumDate)}`);
      setText('simRemaining',money(confirmed.minimum+state.deferred));
      renderTimeline(confirmed.rows,confirmed.minimumDate); renderStatuses(state,confirmed.rows);
      const advice=installmentAdvice(confirmed), box=$('installmentAdvice');
      if(box) box.className=`card installment-advice advice-${advice.level}`;
      setText('installmentTitle',advice.title); setText('installmentDetail',advice.detail);
      const overall=statusFor(confirmed.minimum), badge=$('statusBadge');
      if(badge){badge.className='status-badge '+(overall.className==='safe'?'safe':overall.className==='risk'?'warn':'danger');badge.textContent=overall.text;}
      if(overall.className==='safe') setText('advice',`最低残高${money(confirmed.minimum)}。日付順でも40万円以上を維持。`);
      else if(overall.className==='risk') setText('advice',`資金ショートはしませんが、最低残高は${money(confirmed.minimum)}。40万円の安全余力を下回ります。`);
      else setText('advice',`${formatDate(confirmed.minimumDate)}時点で${money(Math.abs(confirmed.minimum))}不足。支払い調整か入金確保が必要。`);
    } catch (err) {
      console.error('render failed',err);
      setText('installmentTitle','計算エラー'); setText('installmentDetail','ページを更新してください。改善しない場合は初期化せず、画面の状況を共有してください。');
      const badge=$('statusBadge'); if(badge){badge.textContent='エラー';badge.className='status-badge danger';}
    }
  }

  function save(show=true) { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,data:readState()})); if(show)toast('保存しました'); }
  function loadRaw() {
    const keys=[STORAGE_KEY,...LEGACY_KEYS];
    for(const key of keys){ const v=localStorage.getItem(key); if(!v)continue; try{return {key,raw:JSON.parse(v)}}catch(_){continue;} }
    return {key:null,raw:null};
  }
  function bootstrap() {
    const found=loadRaw();
    const state=normalizeState(found.raw);
    writeState(state); render(); save(false);
    if(found.key && found.key!==STORAGE_KEY) toast('保存データをv8へ移行しました');
  }
  function updateRecurringDates() {
    const ref=$('referenceDate').value;
    const dates=dateDefaults(ref);
    Object.entries(dates).forEach(([id,val])=>{if($(id))$(id).value=val;});
    render();
  }

  allIds.forEach(id=>{ const el=$(id); if(el && id!=='referenceDate') el.addEventListener('input',render); });
  $('referenceDate').addEventListener('change',updateRecurringDates);
  $('referenceDate').addEventListener('input',updateRecurringDates);
  $('saveBtn').addEventListener('click',()=>save(true));
  $('resetBtn').addEventListener('click',()=>{ if(!confirm('入力内容を初期化しますか？'))return; localStorage.removeItem(STORAGE_KEY); writeState(defaults); render(); save(false); toast('初期化しました'); });
  bootstrap();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=8.0.0').catch(console.warn);
})(typeof window!=='undefined'?window:globalThis);
