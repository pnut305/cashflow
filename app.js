const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY', maximumFractionDigits:0 }).format(Math.round(Number(n)||0));
const stateKey = 'cashflow-meter-v3';
const oldStateKey = 'cashflow-meter-v2';

const assetIds = ['mizuhoPersonal','mizuhoGroup','jibunBank','cashSafe'];
const incomeIds = ['incomeCf','incomeMf','incomeBitfan','incomeConfirmed'];
const expectedIncomeIds = ['incomeExpected'];
const paymentIds = ['payHb','payEpos','payAu','paySalary','payCar','payInvoice'];
const dateIds = ['dateIncomeCf','dateIncomeMf','dateIncomeBitfan','dateIncomeConfirmed','dateIncomeExpected','datePayHb','datePayEpos','datePayAu','datePaySalary','datePayCar','datePayInvoice'];
const allInputIds = [...assetIds,...incomeIds,...expectedIncomeIds,...paymentIds,...dateIds,'deferred'];

const today = new Date();
today.setHours(0,0,0,0);
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const nextDayOfMonth = (day, forceNextMonth=false) => {
  let y=today.getFullYear(), m=today.getMonth();
  let d=new Date(y,m,day);
  if (forceNextMonth || d < today) d=new Date(y,m+1,day);
  return iso(d);
};
const monthEnd = () => iso(new Date(today.getFullYear(), today.getMonth()+1, 0));

const defaults = {
  mizuhoPersonal:0,mizuhoGroup:0,jibunBank:0,cashSafe:0,
  incomeCf:0,incomeMf:0,incomeBitfan:0,incomeConfirmed:0,incomeExpected:0,
  payHb:0,payEpos:0,payAu:0,paySalary:340000,payCar:34000,payInvoice:0,deferred:0,
  dateIncomeCf:nextDayOfMonth(15), dateIncomeMf:nextDayOfMonth(25), dateIncomeBitfan:nextDayOfMonth(30),
  dateIncomeConfirmed:iso(today), dateIncomeExpected:iso(today),
  datePayHb:nextDayOfMonth(26), datePayEpos:nextDayOfMonth(27), datePayAu:nextDayOfMonth(10,true),
  datePaySalary:monthEnd(), datePayCar:monthEnd(), datePayInvoice:monthEnd()
};

const sumIds = ids => ids.reduce((s,id)=>s+(Number($(id).value)||0),0);
const parseDate = value => value ? new Date(`${value}T00:00:00`) : null;
const formatDate = value => {
  const d=parseDate(value); if(!d) return '日付未設定';
  return `${d.getMonth()+1}/${d.getDate()}`;
};

const eventDefs = [
  ['incomeCf','dateIncomeCf','CF入金',1,true], ['incomeMf','dateIncomeMf','mf入金',1,true],
  ['incomeBitfan','dateIncomeBitfan','Bitfan入金',1,true], ['incomeConfirmed','dateIncomeConfirmed','確定入金',1,true],
  ['payHb','datePayHb','HBカード',-1,true], ['payEpos','datePayEpos','epos',-1,true], ['payAu','datePayAu','au',-1,true],
  ['paySalary','datePaySalary','給与',-1,true], ['payCar','datePayCar','車',-1,true], ['payInvoice','datePayInvoice','請求書',-1,true],
  ['incomeExpected','dateIncomeExpected','入金見込み',1,false]
];

function buildEvents(includeExpected=false){
  return eventDefs
    .filter(([, , , , confirmed]) => includeExpected || confirmed)
    .map(([amountId,dateId,name,sign,confirmed]) => ({ amount:Math.max(0,Number($(amountId).value)||0), date:$(dateId).value, name, sign, confirmed }))
    .filter(e=>e.amount>0 && e.date)
    .sort((a,b)=>a.date.localeCompare(b.date) || a.sign-b.sign);
}

function project(events, assets){
  let balance=assets, minimum=assets, minimumDate=iso(today), rows=[];
  for(const e of events){
    balance += e.sign*e.amount;
    if(balance<minimum){ minimum=balance; minimumDate=e.date; }
    rows.push({...e,balance});
  }
  return {balance,minimum,minimumDate,rows};
}

function renderTimeline(rows, minimumDate){
  const box=$('timeline'); box.innerHTML='';
  if(!rows.length){ box.innerHTML='<div class="timeline-empty">日付付きの予定がありません。</div>'; return; }
  rows.forEach(r=>{
    const div=document.createElement('div');
    div.className='timeline-item'+(r.date===minimumDate?' low':'');
    const change=`${r.sign>0?'+':'−'}${money(r.amount)}`;
    div.innerHTML=`<span class="timeline-date">${formatDate(r.date)}</span><span class="timeline-name">${r.name}</span><span class="timeline-balance"><strong>${money(r.balance)}</strong><span class="timeline-change ${r.sign>0?'plus':'minus'}">${change}</span></span>`;
    box.appendChild(div);
  });
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

  const badge=$('statusBadge'); badge.className='status-badge';
  const min=confirmedProjection.minimum;
  if(min<0){ badge.textContent='資金ショート'; badge.classList.add('danger'); $('advice').textContent=`${formatDate(confirmedProjection.minimumDate)}時点で${money(Math.abs(min))}不足。後日の入金があっても、その前に支払い対策が必要。`; }
  else if(min<300000){ badge.textContent='危険'; badge.classList.add('danger'); $('advice').textContent=`最低残高は${money(min)}。日付順では突発支出への耐性が低い。分割または支払い前の入金確保を検討。`; }
  else if(min<600000){ badge.textContent='警戒'; badge.classList.add('warn'); $('advice').textContent=`最低残高は${money(min)}。資金は回るが、次月固定費を考えると余裕は薄い。`; }
  else { badge.textContent='安定'; badge.classList.add('safe'); $('advice').textContent='日付順に見ても一定の余力あり。追加分割は原則不要。'; }
}

function collectState(){ return Object.fromEntries(allInputIds.map(id=>[id,$(id).type==='date'?$(id).value:(Number($(id).value)||0)])); }
function loadState(data){ allInputIds.forEach(id=>{ $(id).value=data[id] ?? defaults[id] ?? ''; }); calculate(); }
function toast(text){ const t=document.createElement('div'); t.className='toast'; t.textContent=text; document.body.appendChild(t); setTimeout(()=>t.remove(),1500); }
allInputIds.forEach(id=>$(id).addEventListener('input',calculate));
$('saveBtn').addEventListener('click',()=>{ localStorage.setItem(stateKey,JSON.stringify(collectState())); toast('保存しました'); });
$('resetBtn').addEventListener('click',()=>{ localStorage.removeItem(stateKey); loadState(defaults); toast('初期化しました'); });
let saved=localStorage.getItem(stateKey);
if(!saved){ const old=localStorage.getItem(oldStateKey); if(old){ saved=JSON.stringify({...defaults,...JSON.parse(old)}); } }
loadState(saved?JSON.parse(saved):defaults);
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
