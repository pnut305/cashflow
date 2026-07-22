const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY', maximumFractionDigits:0 }).format(Math.round(Number(n)||0));
const DATA_VERSION = 7;
const stateKey = 'cashflow-meter-v7';
const oldStateKeys = ['cashflow-meter-v6','cashflow-meter-v5','cashflow-meter-v4','cashflow-meter-v3','cashflow-meter-v2'];
const SAFE_BUFFER = 400000;

const assetIds = ['mizuhoPersonal','mizuhoGroup','jibunBank','cashSafe'];
const incomeIds = ['incomeCf','incomeMf','incomeBitfan','incomeConfirmed'];
const expectedIncomeIds = ['incomeExpected'];
const paymentIds = ['payHb','payEpos','payAu','paySalary','payCar','payInvoice'];
const cardPaymentIds = ['payHb','payEpos','payAu'];
const dateIds = ['dateIncomeCf','dateIncomeMf','dateIncomeBitfan','dateIncomeConfirmed','dateIncomeExpected','datePayHb','datePayEpos','datePayAu','datePaySalary','datePayCar','datePayInvoice'];
const allInputIds = ['referenceDate',...assetIds,...incomeIds,...expectedIncomeIds,...paymentIds,...dateIds,'deferred'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const realToday = startOfDay(new Date());
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseDate = value => value ? new Date(`${value}T00:00:00`) : null;
const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
const dateAtDay = (y,m,day) => new Date(y,m,Math.min(day,daysInMonth(y,m)));

function nextOccurrence(base, day){
  let y=base.getFullYear(), m=base.getMonth();
  let d=dateAtDay(y,m,day);
  if(d <= base) d=dateAtDay(y,m+1,day);
  return iso(d);
}
function nextMonthEnd(base){
  let d=new Date(base.getFullYear(),base.getMonth()+1,0);
  if(d <= base) d=new Date(base.getFullYear(),base.getMonth()+2,0);
  return iso(d);
}

function dateDefaults(referenceValue){
  const base=parseDate(referenceValue) || realToday;
  return {
    dateIncomeCf:nextOccurrence(base,15),
    dateIncomeMf:nextOccurrence(base,25),
    dateIncomeBitfan:nextOccurrence(base,30),
    dateIncomeConfirmed:iso(base),
    dateIncomeExpected:iso(base),
    datePayHb:nextOccurrence(base,26),
    datePayEpos:nextOccurrence(base,27),
    datePayAu:nextOccurrence(base,10),
    datePaySalary:nextOccurrence(base,25),
    datePayCar:nextOccurrence(base,25),
    datePayInvoice:nextMonthEnd(base)
  };
}

const initialReference=iso(realToday);
const defaults = {
  referenceDate:initialReference,
  mizuhoPersonal:0,mizuhoGroup:0,jibunBank:0,cashSafe:0,
  incomeCf:0,incomeMf:0,incomeBitfan:0,incomeConfirmed:0,incomeExpected:0,
  payHb:0,payEpos:0,payAu:0,paySalary:340000,payCar:34000,payInvoice:0,deferred:0,
  ...dateDefaults(initialReference)
};

const sumIds = ids => ids.reduce((s,id)=>s+(Number($(id).value)||0),0);
const formatDate = value => {
  const d=parseDate(value); if(!d) return '日付未設定';
  return `${d.getMonth()+1}/${d.getDate()}`;
};

const eventDefs = [
  ['incomeCf','dateIncomeCf','CF入金',1,true], ['incomeMf','dateIncomeMf','mf入金',1,true],
  ['incomeBitfan','dateIncomeBitfan','Bitfan入金',1,true], ['incomeConfirmed','dateIncomeConfirmed','確定入金',1,true],
  ['payHb','datePayHb','HBカード',-1,true,'statusPayHb'], ['payEpos','datePayEpos','epos',-1,true,'statusPayEpos'],
  ['payAu','datePayAu','au',-1,true,'statusPayAu'], ['paySalary','datePaySalary','給与',-1,true,'statusPaySalary'],
  ['payCar','datePayCar','車',-1,true,'statusPayCar'], ['payInvoice','datePayInvoice','請求書',-1,true,'statusPayInvoice'],
  ['incomeExpected','dateIncomeExpected','入金見込み',1,false]
];

function buildEvents(includeExpected=false){
  const reference=$('referenceDate').value;
  return eventDefs
    .filter(([, , , , confirmed]) => includeExpected || confirmed)
    .map(([amountId,dateId,name,sign,confirmed,statusId]) => ({ amountId, amount:Math.max(0,Number($(amountId).value)||0), date:$(dateId).value, name, sign, confirmed, statusId }))
    .filter(e=>e.amount>0 && e.date && (!reference || e.date>=reference))
    .sort((a,b)=>a.date.localeCompare(b.date) || a.sign-b.sign);
}

function project(events, assets){
  let balance=assets, minimum=assets, minimumDate=$('referenceDate').value || iso(realToday), rows=[];
  for(const e of events){
    balance += e.sign*e.amount;
    if(balance<minimum){ minimum=balance; minimumDate=e.date; }
    rows.push({...e,balance});
  }
  return {balance,minimum,minimumDate,rows};
}

function renderTimeline(rows, minimumDate){
  const box=$('timeline'); box.innerHTML='';
  if(!rows.length){ box.innerHTML='<div class="timeline-empty">基準日以降の日付付き予定がありません。</div>'; return; }
  rows.forEach(r=>{
    const div=document.createElement('div');
    div.className='timeline-item'+(r.date===minimumDate?' low':'');
    const change=`${r.sign>0?'+':'−'}${money(r.amount)}`;
    div.innerHTML=`<span class="timeline-date">${formatDate(r.date)}</span><span class="timeline-name">${r.name}</span><span class="timeline-balance"><strong>${money(r.balance)}</strong><span class="timeline-change ${r.sign>0?'plus':'minus'}">${change}</span></span>`;
    box.appendChild(div);
  });
}

function statusForBalance(balance){
  if(balance<0) return {text:'不可',cls:'impossible'};
  if(balance<SAFE_BUFFER) return {text:'危険',cls:'risk'};
  return {text:'安全',cls:'safe'};
}

function renderPaymentStatuses(rows){
  eventDefs.filter(e=>e[3]===-1).forEach(([amountId,,,,,,statusId])=>{
    const badge=$(statusId);
    const amount=Number($(amountId).value)||0;
    const row=rows.find(r=>r.amountId===amountId);
    badge.className='payment-status';
    if(amount<=0){ badge.textContent='未入力'; badge.classList.add('empty'); badge.removeAttribute('title'); return; }
    if(!row){ badge.textContent='対象外'; badge.classList.add('empty'); badge.removeAttribute('title'); return; }
    const status=statusForBalance(row.balance);
    badge.textContent=status.text;
    badge.classList.add(status.cls);
    badge.title=`支払い後残高 ${money(row.balance)}`;
  });
}

function renderInstallmentAdvice(projection){
  const title=$('installmentTitle');
  const detail=$('installmentDetail');
  const box=$('installmentAdvice');
  box.className='card installment-advice';

  if(projection.minimum >= SAFE_BUFFER){
    title.textContent='分割不要';
    detail.textContent=`最低残高${money(projection.minimum)}で、安全基準の40万円を維持できます。`;
    box.classList.add('advice-safe');
    return;
  }

  const target=SAFE_BUFFER-projection.minimum;
  const candidates=projection.rows
    .filter(r=>cardPaymentIds.includes(r.amountId) && r.sign===-1 && r.date<=projection.minimumDate)
    .sort((a,b)=>b.date.localeCompare(a.date));

  if(!candidates.length){
    title.textContent='カード分割では解決不可';
    detail.textContent=`安全圏まで${money(target)}不足していますが、最低点までに分割対象のカード支払いがありません。入金確保か他支払いの調整が必要です。`;
    box.classList.add('advice-impossible');
    return;
  }

  let remaining=target;
  const plans=[];
  for(const row of candidates){
    const amount=Math.min(row.amount,remaining);
    if(amount>0) plans.push({name:row.name,amount});
    remaining-=amount;
    if(remaining<=0) break;
  }

  if(remaining<=0){
    title.textContent=`分割候補：${plans.map(p=>p.name).join(' → ')}`;
    detail.textContent=`合計${money(target)}を未来へ回すと、安全基準40万円まで回復します。目安：${plans.map(p=>`${p.name} ${money(p.amount)}`).join('、')}。`;
    box.classList.add(projection.minimum<0?'advice-impossible':'advice-risk');
  }else{
    const available=target-remaining;
    title.textContent='カード分割だけでは不足';
    detail.textContent=`最低点までのカード支払い${money(available)}をすべて未来へ回しても、さらに${money(remaining)}必要です。入金確保か給与・請求書などの支払日調整も必要です。`;
    box.classList.add('advice-impossible');
  }
}

function calculate(){
  const assets=sumIds(assetIds), incomes=sumIds(incomeIds), expected=sumIds(expectedIncomeIds), payments=sumIds(paymentIds);
  const confirmedProjection=project(buildEvents(false),assets);
  const optimisticProjection=project(buildEvents(true),assets);
  const deferred=Number($('deferred').value)||0;
  const simMinimum=confirmedProjection.minimum+deferred;

  $('assetTotal').textContent=money(assets); $('incomeTotal').textContent=money(incomes+expected); $('paymentTotal').textContent=money(payments);
  $('remaining').textContent=money(confirmedProjection.minimum); $('minimumDate').textContent=`最低点：${formatDate(confirmedProjection.minimumDate)}`;
  $('simRemaining').textContent=money(simMinimum); $('grandAssets').textContent=money(assets); $('grandIncome').textContent=money(incomes); $('grandPayments').textContent=money(payments);
  $('finalBalance').textContent=`最終 ${money(confirmedProjection.balance)}`; $('optimisticBalance').textContent=money(optimisticProjection.balance);
  renderTimeline(confirmedProjection.rows,confirmedProjection.minimumDate);
  renderPaymentStatuses(confirmedProjection.rows);
  renderInstallmentAdvice(confirmedProjection);

  const badge=$('statusBadge'); badge.className='status-badge';
  const min=confirmedProjection.minimum;
  const overall=statusForBalance(min);
  if(overall.cls==='impossible'){
    badge.textContent='不可'; badge.classList.add('danger');
    $('advice').textContent=`${formatDate(confirmedProjection.minimumDate)}時点で${money(Math.abs(min))}不足。後日の入金を待つ前に、分割・支払日変更・入金確保が必要。`;
  } else if(overall.cls==='risk'){
    badge.textContent='危険'; badge.classList.add('warn');
    $('advice').textContent=`最低残高は${money(min)}。資金ショートはしないが、次月固定費相当の40万円を残せない。`;
  } else {
    badge.textContent='安全'; badge.classList.add('safe');
    $('advice').textContent=`最低残高${money(min)}を確保。日付順でも次月固定費相当の余力が残る。`;
  }
}

function applyReferenceDate(){
  const dates=dateDefaults($('referenceDate').value);
  Object.entries(dates).forEach(([id,value])=>{ $(id).value=value; });
  calculate();
}
function collectState(){ return Object.fromEntries(allInputIds.map(id=>[id,$(id).type==='date'?$(id).value:(Number($(id).value)||0)])); }

function migrateState(raw){
  let source=raw;
  if(raw && typeof raw==='object' && raw.data && typeof raw.data==='object') source=raw.data;
  if(!source || typeof source!=='object') source={};

  const reference=source.referenceDate || initialReference;
  const migrated={...defaults,...source,referenceDate:reference};
  const generatedDates=dateDefaults(reference);
  for(const id of dateIds){
    if(!migrated[id] || !/^\d{4}-\d{2}-\d{2}$/.test(String(migrated[id]))) migrated[id]=generatedDates[id];
  }
  for(const id of [...assetIds,...incomeIds,...expectedIncomeIds,...paymentIds,'deferred']){
    const value=Number(migrated[id]);
    migrated[id]=Number.isFinite(value) && value>=0 ? value : defaults[id] || 0;
  }
  return migrated;
}

function saveState(showToast=true){
  localStorage.setItem(stateKey,JSON.stringify({version:DATA_VERSION,data:collectState()}));
  if(showToast) toast('保存しました');
}
function loadState(data){ allInputIds.forEach(id=>{ $(id).value=data[id] ?? defaults[id] ?? ''; }); calculate(); }
function toast(text){ const t=document.createElement('div'); t.className='toast'; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),1800); }

function loadAndMigrate(){
  let raw=null;
  const current=localStorage.getItem(stateKey);
  if(current){
    try{ raw=JSON.parse(current); }catch(_){ raw=null; }
  }
  if(!raw){
    for(const key of oldStateKeys){
      const old=localStorage.getItem(key);
      if(old){
        try{ raw=JSON.parse(old); break; }catch(_){ /* continue */ }
      }
    }
  }
  const migrated=migrateState(raw);
  loadState(migrated);
  localStorage.setItem(stateKey,JSON.stringify({version:DATA_VERSION,data:migrated}));
  if(raw && (!raw.version || raw.version<DATA_VERSION)) toast('保存データをv7へ移行しました');
}

allInputIds.filter(id=>id!=='referenceDate').forEach(id=>$(id).addEventListener('input',calculate));
$('referenceDate').addEventListener('input', applyReferenceDate);
$('referenceDate').addEventListener('change', applyReferenceDate);
$('saveBtn').addEventListener('click',()=>saveState(true));
$('resetBtn').addEventListener('click',()=>{
  localStorage.removeItem(stateKey);
  loadState(defaults);
  saveState(false);
  toast('初期化しました');
});
loadAndMigrate();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=7');
