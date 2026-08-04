// Minimal ANSI -> HTML color converter registry map setup
const ANSI = {
  '30': '#05050a', // <--- ADD THIS LINE FOR TECH BLACK TEXT!
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
      // ---- FIXED: ABSOLUTE CLEAR ALL SPANS IMMEDIATELY ----
      fgColor = null;
      bgColor = null;
      
      // Calculate exactly how many unclosed open span tags are lingering in our string block
      const unclosedCount = (html.match(/<span/g) || []).length - (html.match(/<\/span/g) || []).length;
      if (unclosedCount > 0) {
        html += '</span>'.repeat(unclosedCount);
      }
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
  
  // FIXED FILTER: Maps always start with a coordinate block like (X,Y) at the start of a newline block
  if (msg.text.includes('\n\x1b[90m(') && msg.text.includes('HP:')) {
    const mapElement = document.getElementById('map-viewport');
    if (mapElement) {
      mapElement.innerHTML = ''; 
      mapElement.innerHTML = render(msg.text);
      return; 
    }
  }

  // Combat rolls, narratives, and chats print cleanly into scrolling right text window box pane
  print(msg.text);
};


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