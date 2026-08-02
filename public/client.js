// Minimal ANSI -> HTML color converter registry map setup
const ANSI = {
  '31': '#ff4d4d', '32': '#4dff88', '33': '#ffd24d', '36': '#4dd2ff',
  '37': '#cccccc', '90': '#666677', '91': '#ff6b6b', '93': '#ffe14d',
  '95': '#ff6bd6', '0': null,
};

function render(text) {
  let html = '';
  const re = /\x1b\[([\d;]+)m/g;
  let last = 0, m;
  
  // Track our current active styles across splits
  let fgColor = null;
  let bgColor = null;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Maps the xterm 256 color palette numbers to glowing cyberpunk neon hex values
  const palette = {
    '45': '#00f0ff',   // Neon Cyan
    '196': '#ff0055',  // Neon Laser Red
    '82': '#39ff14',   // Neon Green
    '201': '#ff00ff',  // Hot Neon Pink/Magenta!
    '242': '#444455',  // Tech Gray
    '234': '#1a1a26',  // Deep Wall Backing
    '235': '#111524',  // Wet Asphalt Backing
    '53': '#2a0033',   // Neon Alley Purple Backing!
    '22': '#0a290a',   // Toxic Sludge Backing
    '52': '#3a0010'    // Laser Field Backing
  };

  // Standard legacy ANSI colors used in your chat system
  const legacyColors = {
    '31': '#ff4d4d', '32': '#4dff88', '33': '#ffd24d', '36': '#4dd2ff',
    '37': '#cccccc', '90': '#666677', '91': '#ff6b6b', '93': '#ffe14d',
    '95': '#ff6bd6'
  };

  while ((m = re.exec(text))) {
    html += esc(text.slice(last, m.index));
    last = re.lastIndex;

    const tokens = m[1].split(';');
    
    if (tokens[0] === '0') {
      // CLEAR ALL STYLES IMMEDIATELY
      fgColor = null;
      bgColor = null;
      html += '</span>'.repeat((html.match(/<span/g) || []).length - (html.match(/<\/span/g) || []).length);
      continue;
    }

    // Parse extended 256-color palettes (38;5;X or 48;5;X)
    if (tokens[0] === '38' && tokens[1] === '5') {
      fgColor = palette[tokens[2]] || '#ffffff';
    } else if (tokens[0] === '48' && tokens[1] === '5') {
      bgColor = palette[tokens[2]] || '#000000';
    } else {
      // Fallback to your classic text messaging colors
      for (const t of tokens) {
        if (legacyColors[t]) fgColor = legacyColors[t];
      }
    }

    // Build the clean style wrapper tag
    let style = '';
    if (fgColor) style += `color:${fgColor};`;
    if (bgColor) style += `background-color:${bgColor};`;
    
    if (style) {
      html += `<span style="${style}">`;
    }
  }

  html += esc(text.slice(last));

  // Ensure any loose open tags are safely closed at the very end of the string block
  const openSpansCount = (html.match(/<span/g) || []).length - (html.match(/<\/span/g) || []).length;
  if (openSpansCount > 0) {
    html += '</span>'.repeat(openSpansCount);
  }

  return html;
}

/* broken render function
function render(text) {
  let html = '';
  // Match standard, extended 256-color foregrounds (38;5), and backgrounds (48;5)
  const re = /\x1b\[(\d+(?:;\d+)*)m/g;
  let last = 0, m;
  let fgColor = null, bgColor = null;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Maps the xterm 256 color palette numbers to glowing cyberpunk neon hex values
  const palette = {
    45: '#00f0ff',   // Neon Cyan
    196: '#ff0055',  // Neon Laser Red
    82: '#39ff14',   // Neon Green
    242: '#444455',  // Tech Gray
    234: '#1a1a26',  // Deep Wall Backing
    235: '#111524',  // Wet Asphalt Backing
    22: '#0a290a',   // Toxic Sludge Backing
    52: '#3a0010'    // Laser Field Backing
  };

  while ((m = re.exec(text))) {
    html += esc(text.slice(last, m.index));
    last = re.lastIndex;

    const codes = m[1].split(';');
    if (codes[0] === '0') {
      // Reset formatting
      fgColor = null; bgColor = null;
    } else if (codes[0] === '38' && codes[1] === '5') {
      fgColor = palette[codes[2]] || '#ffffff';
    } else if (codes[0] === '48' && codes[1] === '5') {
      bgColor = palette[codes[2]] || '#000000';
    }

    if (html.endsWith('</span>')) html = html.slice(0, -7);
    
    let style = '';
    if (fgColor) style += `color:${fgColor};`;
    if (bgColor) style += `background-color:${bgColor};`;
    
    if (style) html += `<span style="${style}">`;
  }

  html += esc(text.slice(last));
  // Close any lingering spans
  const openSpansCount = (html.match(/<span/g) || []).length - (html.match(/<\/span/g) || []).length;
  for(let i=0; i < openSpansCount; i++) html += '</span>';

  return html;
}
  */

/* old render function
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
  */

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