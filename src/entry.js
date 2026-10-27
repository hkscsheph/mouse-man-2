const mode = new URLSearchParams(location.search).get('mode');

if (mode === 'pixel') import('./pixel.js');
else import('./main.js');
