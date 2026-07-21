const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY', maximumFractionDigits:0 }).format(Math.round(Number(n) || 0));
const stateKey = 'cashflow-meter-v1';

const defaults = {
  personal: 680000,
  band: 420000,
  cash: 100000,
  fc: 130000,
  deferred: 0,
  incomes: [{ name:'確定入金', date:'2026-07-25', amount:24612 }],
  payments: [
    { name:'カード①', date:'2026-07-27', amount:295313 },
    { name:'カード②', date:'2026-07-27', amount:205409 },
    { name:'固定支払い', date:'2026-07-31', amount:400000 },
    { name:'カード③', date:'2026-08-10', amount:147437 }
  ]
};

function addRow(container, data={name:'', date:'', amount:''}) {
  const node = $('rowTemplate').content.cloneNode(true);
  const row = node.querySelector('.entry-row');
  row.querySelector('.name').value = data.name || '';
  row.querySelector('.date').value = data.date || '';
  row.querySelector('.amount').value = data.amount || '';
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', calculate));
  row.querySelector('.delete').addEventListener('click', () => { row.remove(); calculate(); });
  container.appendChild(row);
}

function readRows(container) {
  return [...container.querySelectorAll('.entry-row')].map(row => ({
    name: row.querySelector('.name').value.trim(),
    date: row.querySelector('.date').value,
    amount: Number(row.querySelector('.amount').value) || 0
  }));
}

function sumRows(container) { return readRows(container).reduce((s, x) => s + x.amount, 0); }

function calculate() {
  const assets = ['personal','band','cash','fc'].reduce((s,id) => s + (Number($(id).value)||0), 0);
  const incomes = sumRows($('incomeRows'));
  const payments = sumRows($('paymentRows'));
  const deferred = Number($('deferred').value) || 0;
  const remaining = assets + incomes - payments;
  const simRemaining = remaining + deferred;

  $('assetTotal').textContent = money(assets);
  $('incomeTotal').textContent = money(incomes);
  $('paymentTotal').textContent = money(payments);
  $('remaining').textContent = money(remaining);
  $('simRemaining').textContent = money(simRemaining);
  $('grandAssets').textContent = money(assets);
  $('grandIncome').textContent = money(incomes);
  $('grandPayments').textContent = money(payments);

  const badge = $('statusBadge');
  badge.className = 'status-badge';
  if (remaining < 0) {
    badge.textContent = '赤字'; badge.classList.add('danger');
    $('advice').textContent = `不足額は${money(Math.abs(remaining))}。支払い延期・分割・入金前倒しが必要。`;
  } else if (remaining < 300000) {
    badge.textContent = '危険'; badge.classList.add('danger');
    $('advice').textContent = '支払いは可能だが、突発支出への耐性が低い。追加分割を検討。';
  } else if (remaining < 600000) {
    badge.textContent = '警戒'; badge.classList.add('warn');
    $('advice').textContent = '当面は回るが、次月固定費まで考えると余裕は薄い。大きな買い物は止める。';
  } else {
    badge.textContent = '安定'; badge.classList.add('safe');
    $('advice').textContent = '直近支払い後も一定の余力あり。分割は原則不要。';
  }
}

function collectState() {
  return {
    personal:Number($('personal').value)||0,
    band:Number($('band').value)||0,
    cash:Number($('cash').value)||0,
    fc:Number($('fc').value)||0,
    deferred:Number($('deferred').value)||0,
    incomes:readRows($('incomeRows')),
    payments:readRows($('paymentRows'))
  };
}

function loadState(data) {
  ['personal','band','cash','fc','deferred'].forEach(id => $(id).value = data[id] ?? 0);
  $('incomeRows').innerHTML = '';
  $('paymentRows').innerHTML = '';
  (data.incomes || []).forEach(x => addRow($('incomeRows'), x));
  (data.payments || []).forEach(x => addRow($('paymentRows'), x));
  calculate();
}

function toast(text) {
  const t = document.createElement('div'); t.className='toast'; t.textContent=text; document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

$('addIncome').addEventListener('click', () => { addRow($('incomeRows')); calculate(); });
$('addPayment').addEventListener('click', () => { addRow($('paymentRows')); calculate(); });
$('saveBtn').addEventListener('click', () => { localStorage.setItem(stateKey, JSON.stringify(collectState())); toast('保存しました'); });
$('resetBtn').addEventListener('click', () => { localStorage.removeItem(stateKey); loadState(defaults); toast('初期化しました'); });
['personal','band','cash','fc','deferred'].forEach(id => $(id).addEventListener('input', calculate));

const saved = localStorage.getItem(stateKey);
loadState(saved ? JSON.parse(saved) : defaults);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
