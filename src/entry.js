const mode = new URLSearchParams(location.search).get('mode');

if (mode === 'pixel') import('./pixel.js');
else if (mode === 'stage') import('./stage.js');
else if (mode === 'reg') import('./main.js');
else import('./main.js');
