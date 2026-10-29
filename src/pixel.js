import { createPixelChase } from './pixel-chase.js';

const canvas = document.querySelector('#view');
const ctx = canvas.getContext('2d');

document.title = 'Pixel Cat Chase';
document.body.classList.add('pixel-mode');
canvas.classList.add('pixelated');

const MOUSE_COUNT = 20;
const chase = createPixelChase(canvas, { initialCount: MOUSE_COUNT });

function resize() {
  chase.resize();
}

window.addEventListener('resize', resize);
resize();

// Keep ctx reference so bundler retains side effects if needed
void ctx;
