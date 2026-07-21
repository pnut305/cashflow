const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat('ja-JP', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0
}).format(Math.round(Number(n) || 0));

const stateKey = 'cashflow-meter-v2';

const assetIds = ['mizuhoPersonal', 'mizuhoGroup', 'jibunBank', 'cashSafe'];
const incomeIds = ['incomeCf', 'incomeMf', 'incomeBitfan', 'incomeConfirmed', 'incomeExpected'];
const paymentIds = ['payHb', 'payEpos', 'payAu', 'paySalary', 'payCar', 'payInvoice'];
const allInputIds = [...assetIds, ...incomeIds, ...paymentIds, 'deferred'];

const defaults = {
  mizuhoPersonal: 0,
  mizuhoGroup: 0,
  jibunBank: 0,
  cashSafe: 0,
  incomeCf: 0,
  incomeMf: 0,
  incomeBitfan: 0,
  incomeConfirmed: 0,
  incomeExpected: 0,
  payHb: 0,
  payEpos: 0,
  payAu: 0,
  paySalary: 340000,
  payCar: 34000,
  payInvoice: 0,
  deferred: 0
};

const sumIds = (ids) => ids.reduce((sum, id) => sum + (Number($(id).value) || 0), 0);

function calculate() {
  const assets = sumIds(assetIds);
  const incomes = sumIds(incomeIds);
  const payments = sumIds(paymentIds);
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
    badge.textContent = '赤字';
    badge.classList.add('danger');
    $('advice').textContent = `不足額は${money(Math.abs(remaining))}。支払い延期・分割・入金前倒しが必要。`;
  } else if (remaining < 300000) {
    badge.textContent = '危険';
    badge.classList.add('danger');
    $('advice').textContent = '支払いは可能だが、突発支出への耐性が低い。追加分割を検討。';
  } else if (remaining < 600000) {
    badge.textContent = '警戒';
    badge.classList.add('warn');
    $('advice').textContent = '当面は回るが、次月固定費まで考えると余裕は薄い。大きな買い物は止める。';
  } else {
    badge.textContent = '安定';
    badge.classList.add('safe');
    $('advice').textContent = '直近支払い後も一定の余力あり。分割は原則不要。';
  }
}

function collectState() {
  return Object.fromEntries(allInputIds.map(id => [id, Number($(id).value) || 0]));
}

function loadState(data) {
  allInputIds.forEach(id => {
    $(id).value = data[id] ?? defaults[id] ?? 0;
  });
  calculate();
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

allInputIds.forEach(id => $(id).addEventListener('input', calculate));

$('saveBtn').addEventListener('click', () => {
  localStorage.setItem(stateKey, JSON.stringify(collectState()));
  toast('保存しました');
});

$('resetBtn').addEventListener('click', () => {
  localStorage.removeItem(stateKey);
  loadState(defaults);
  toast('初期化しました');
});

const saved = localStorage.getItem(stateKey);
loadState(saved ? JSON.parse(saved) : defaults);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
