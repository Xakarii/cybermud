// Minimal ANSI -> HTML color converter registry map setup
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
  const screenBox = document.getElementById('screen');
  if (!screenBox) return; // Safeguard if layout element isn't rendered yet
  
  const div = document.createElement('div');
  div.innerHTML = render(text);
  screenBox.appendChild(div);
  screenBox.scrollTop = screenBox.scrollHeight;
}

// ---- WebSocket Connection Hook ----
const ws = new WebSocket(`ws://${location.host}`);


ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  
  // Intercept the map data blocks and push them to the left side window box panel dock
  if (msg.text.includes('(') && msg.text.includes(')') && msg.text.includes('HP:')) {
    const mapElement = document.getElementById('map-viewport');
    if (mapElement) {
      // Clear out the previous frame completely to prevent vertical stacking copies!
      mapElement.innerHTML = ''; 
      mapElement.innerHTML = render(msg.text);
      return; 
    }
  }

  // standard chat, system prompts, or combat rolls stream here
  print(msg.text);
};
/*
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  
  // Intercept the map data blocks and push them to the left side window box panel dock
  if (msg.text.includes('(') && msg.text.includes(')') && msg.text.includes('HP:')) {
    const mapElement = document.getElementById('map-viewport');
    if (mapElement) {
      mapElement.innerHTML = render(msg.text);
      return; // Exit out so it doesn't print to the chat timeline window
    }
  }

  // standard chat, system prompts, or combat rolls stream here
  print(msg.text);
};
*/


ws.onopen = () => print('\x1b[36mConnecting to the net...\x1b[0m');
ws.onclose = () => print('\x1b[31m// LINK SEVERED //\x1b[0m');

// ---- User Input Handler Shell Event Hook ----
const inputField = document.getElementById('input');
const history = []; 
let hi = -1;

inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = inputField.value;
    
    // Send raw package data to server terminal shell pipe
    ws.send(JSON.stringify({ type: 'cmd', text: val }));
    
    // Command baseline history arrays tracking metrics setup
    if (val.trim()) { 
      history.push(val); 
      hi = history.length; 
    }
    
    // Wipe the input line clean immediately on execution return return!
    inputField.value = '';
  } 
  else if (e.key === 'ArrowUp' && hi > 0) { 
    inputField.value = history[--hi]; 
  }
  else if (e.key === 'ArrowDown') { 
    hi = Math.min(hi + 1, history.length); 
    inputField.value = history[hi] || ''; 
  }
});

/* Old client.js
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


/*  Old ws.onmessage
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


ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  
  // If the server string text contains an @ symbol or coordinate pins, it is a map render viewport packet!
  if (msg.text.includes('(') && msg.text.includes(')') && msg.text.includes('HP:')) {
    const mapElement = document.getElementById('map-viewport');
    if (mapElement) {
      mapElement.innerHTML = render(msg.text);
      return; // Stop here so it doesn't leak into your scrolling chat text window pane!
    }
  }

  // Otherwise, treat it as a standard narrative chat or combat damage text print entry block
  print(msg.text);
};

*/