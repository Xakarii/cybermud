const screen = document.getElementById('screen');
const input = document.getElementById('input');
const ws = new WebSocket(`ws://${location.host}`);
// minimal ANSI -> HTML color map
const ANSI = {
  '31': '#ff4d4d', '32': '#4dff88', '33': '#ffd24d', '36': '#4dd2ff',
  '37': '#cccccc', '90': '#666677', '91': '#ff6b6b', '93': '#ffe14d',
  '95': '#ff6bd6', '0': null,
};
function render(text) {
  let html = '', open = false;
  const re = /\x1b\[(\d+)m/g;
  let last = 0, m;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  while ((m = re.exec(text))) {
    html += esc(text.slice(last, m.index));
    last = re.lastIndex;
    if (open) { html += '</span>'; open = false; }
    const col = ANSI[m[1]];
    if (col) { html += `<span style="color:${col}">`; open = true; }
  }
  html += esc(text.slice(last));
  if (open) html += '</span>';
  return html;
}
function print(text) {
  const div = document.createElement('div');
  div.innerHTML = render(text);
  screen.appendChild(div);
  screen.scrollTop = screen.scrollHeight;
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  print(msg.text);
};
ws.onopen = () => print('\x1b[36mConnecting to the net...\x1b[0m');
ws.onclose = () => print('\x1b[31m// LINK SEVERED //\x1b[0m');
const history = []; let hi = -1;
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = input.value;
    ws.send(JSON.stringify({ type: 'cmd', text: val }));
    if (val.trim()) { history.push(val); hi = history.length; }
    input.value = '';
  } else if (e.key === 'ArrowUp' && hi > 0) { input.value = history[--hi]; }
  else if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, history.length); input.value = history[hi] || ''; }
});