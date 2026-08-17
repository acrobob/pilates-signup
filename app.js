const cfg = window.APP_CONFIG || {};
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.startsWith('YOUR_');
const supabaseClient = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const confirmedList = document.getElementById('confirmedList');
const waitingList = document.getElementById('waitingList');
const capacityBadge = document.getElementById('capacityBadge');
const connectionCard = document.getElementById('connectionCard');
const joinButton = document.getElementById('joinButton');
const refreshButton = document.getElementById('refreshButton');
const shareButton = document.getElementById('shareButton');
const joinDialog = document.getElementById('joinDialog');
const joinForm = document.getElementById('joinForm');
const closeDialogButton = document.getElementById('closeDialogButton');
const nameInput = document.getElementById('nameInput');
const submitJoinButton = document.getElementById('submitJoinButton');
const toastEl = document.getElementById('toast');

let registrations = [];
let refreshTimer = null;

function myEntries() {
  try { return JSON.parse(localStorage.getItem('pilates_my_entries') || '{}'); }
  catch { return {}; }
}
function saveMyEntry(name, token) {
  const all = myEntries();
  all[name.toLowerCase()] = token;
  localStorage.setItem('pilates_my_entries', JSON.stringify(all));
}
function removeMyEntry(name) {
  const all = myEntries();
  delete all[name.toLowerCase()];
  localStorage.setItem('pilates_my_entries', JSON.stringify(all));
}
function makeToken() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function row(index, item) {
  const div = document.createElement('div');
  div.className = 'row';
  const mine = item && myEntries()[item.name.toLowerCase()];
  div.innerHTML = `<div class="number">${index}.</div><div class="name ${item ? '' : 'empty'}">${item ? escapeHtml(item.name) : 'Available'}</div>`;
  if (mine) {
    const tag = document.createElement('span');
    tag.className = 'mine';
    tag.textContent = '我的';
    div.appendChild(tag);
    const cancel = document.createElement('button');
    cancel.className = 'danger';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => cancelRegistration(item.name));
    div.appendChild(cancel);
  }
  return div;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function render() {
  confirmedList.replaceChildren();
  waitingList.replaceChildren();
  const confirmed = registrations.slice(0, 12);
  const waiting = registrations.slice(12, 18);
  for (let i = 0; i < 12; i++) confirmedList.appendChild(row(i + 1, confirmed[i]));
  for (let i = 0; i < 6; i++) waitingList.appendChild(row(i + 13, waiting[i]));
  capacityBadge.textContent = `${Math.min(registrations.length, 12)} / 12`;
  joinButton.disabled = registrations.length >= 18;
  joinButton.textContent = registrations.length >= 18 ? '名單已滿' : '＋ 我要報名';
}
async function loadRegistrations(showError = true) {
  if (!configured) {
    connectionCard.hidden = false;
    registrations = [];
    render();
    return;
  }
  const { data, error } = await supabaseClient.rpc('get_registrations');
  if (error) {
    if (showError) toast(`讀取失敗：${error.message}`);
    return;
  }
  registrations = (data || []).sort((a, b) => a.position - b.position);
  render();
}
async function join(name) {
  const token = makeToken();
  const { data, error } = await supabaseClient.rpc('join_event', { p_name: name, p_client_token: token });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  saveMyEntry(name, token);
  await loadRegistrations(false);
  const status = result?.status === 'waiting' ? '候補' : '正式名額';
  toast(`報名成功：${status} #${result?.position ?? ''}`);
}
async function cancelRegistration(name) {
  const token = myEntries()[name.toLowerCase()];
  if (!token) return;
  if (!confirm(`確定取消 ${name} 的報名嗎？`)) return;
  const { data, error } = await supabaseClient.rpc('cancel_registration', { p_name: name, p_client_token: token });
  if (error) { toast(`取消失敗：${error.message}`); return; }
  if (!data) { toast('取消失敗：驗證資訊不符'); return; }
  removeMyEntry(name);
  await loadRegistrations(false);
  toast(`已取消：${name}`);
}
function buildShareText() {
  const lines = ['Pilates 接龍報名'];
  for (let i = 0; i < 12; i++) lines.push(`${i + 1}. ${registrations[i]?.name || ''}`);
  lines.push('', 'Waiting list:');
  for (let i = 12; i < 18; i++) lines.push(`${i + 1}. ${registrations[i]?.name || ''}`);
  return lines.join('\n');
}
async function shareList() {
  const text = buildShareText();
  try {
    if (navigator.share) await navigator.share({ title: 'Pilates 接龍報名', text, url: location.href });
    else {
      await navigator.clipboard.writeText(`${text}\n${location.href}`);
      toast('名單與連結已複製');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('分享失敗');
  }
}
function subscribeRealtime() {
  if (!configured) return;
  supabaseClient.channel('pilates-public')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadRegistrations(false), 250);
    })
    .subscribe();
}

joinButton.addEventListener('click', () => {
  if (!configured) { toast('請先完成 Supabase 設定'); return; }
  nameInput.value = '';
  joinDialog.showModal();
  setTimeout(() => nameInput.focus(), 50);
});
closeDialogButton.addEventListener('click', () => joinDialog.close());
refreshButton.addEventListener('click', () => loadRegistrations());
shareButton.addEventListener('click', shareList);
joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  submitJoinButton.disabled = true;
  submitJoinButton.textContent = '加入中…';
  try {
    await join(name);
    joinDialog.close();
  } catch (error) {
    const msg = error?.message || '未知錯誤';
    if (msg.includes('duplicate') || msg.includes('already')) toast('這個名字已經報名');
    else if (msg.includes('full')) toast('正式名額與候補都已滿');
    else toast(`報名失敗：${msg}`);
  } finally {
    submitJoinButton.disabled = false;
    submitJoinButton.textContent = '加入';
  }
});

loadRegistrations();
subscribeRealtime();
