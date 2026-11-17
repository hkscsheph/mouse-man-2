import { canvasesFromSnapshot } from './persist.js';
import { createStagePhoto, DEFAULT_STAGE_UNIFORM_ENABLED } from './stage-photo.js';
import { DEFAULT_PART_TUNING } from './mouse.js';
import {
  fetchTransferRecord,
  listTransferRecords,
  loadTransferPerspective,
  saveTransferPerspective,
  transferPhotoUrl,
} from './transfer-folder.js';

document.title = 'Transfer — Mouse Exhibition';
document.body.classList.add('transfer-mode');

for (const id of ['gate', 'tune-toggle', 'tune', 'share', 'cam', 'view']) {
  const element = document.querySelector(`#${id}`);
  if (element) element.hidden = true;
}

const photoCanvas = document.createElement('canvas');
photoCanvas.id = 'stage-photo';
photoCanvas.setAttribute('aria-label', 'Class photo from the shared registration folder');
document.body.prepend(photoCanvas);

const status = document.createElement('p');
status.id = 'transfer-status';
status.hidden = true;
status.setAttribute('role', 'status');
status.textContent = 'Waiting for the shared folder…';
document.body.appendChild(status);

const photo = createStagePhoto(photoCanvas, { idle: true });
const card = document.createElement('div');
card.id = 'transfer-card';
card.hidden = true;
card.innerHTML = `
  <button type="button" aria-label="Close student card">Close</button>
  <img alt="Student card photo" />
`;
document.body.appendChild(card);
const cardImage = card.querySelector('img');
const cardClose = card.querySelector('button');

function showCard(id) {
  cardImage.src = transferPhotoUrl(id);
  card.hidden = false;
}

function hideCard() {
  card.hidden = true;
  cardImage.removeAttribute('src');
}
const seen = new Set();
let syncing = false;
let uniformsEnabled = DEFAULT_STAGE_UNIFORM_ENABLED;
let spacePressed = false;
let statusHiddenByUser = false;

function layout() {
  photoCanvas.style.width = '100%';
  photoCanvas.style.height = '100%';
  photo.frame();
}

function showStatus(text) {
  status.textContent = text;
  status.hidden = statusHiddenByUser;
}

function showPerspective() {
  const view = photo.perspectiveState();
  showStatus(
    `fov ${view.fov} · height ${view.cameraHeight} · x ${view.cameraX} · depth ${view.cameraDepthOffset} · rise ${view.rowRise}`,
  );
}

async function syncFolder() {
  if (syncing) return;
  syncing = true;
  try {
    const entries = await listTransferRecords();
    for (let index = 0; index < entries.length && index < 30; index += 1) {
      const entry = entries[index];
      if (seen.has(entry.id)) continue;
      try {
        const record = await fetchTransferRecord(entry.id);
        const canvases = await canvasesFromSnapshot(record.snapshot);
        const figure = photo.addFigure(
          record.id,
          canvases,
          record.snapshot.traits,
          {
            featureScale: record.snapshot.featureScale,
            nostrilScale: record.snapshot.nostrilScale,
            eyePosition: record.snapshot.eyePosition,
          },
          { ...DEFAULT_PART_TUNING, ...record.snapshot.partTuning },
          { slot: index },
        );
        if (!figure) continue;
        seen.add(record.id);
      } catch (error) {
        console.error('transfer record skipped', entry.id, error);
      }
    }
    const count = photo.listIds().length;
    showStatus(count ? `${count} from the shared folder` : 'Waiting for registration captures…');
  } catch (error) {
    console.error(error);
    showStatus('Could not read the shared folder.');
  } finally {
    syncing = false;
  }
}

photoCanvas.addEventListener('click', (event) => {
  const id = photo.pick(event.clientX, event.clientY);
  if (!id) {
    hideCard();
    return;
  }
  showCard(id);
});
card.addEventListener('click', (event) => {
  if (event.target === card || event.target === cardClose) hideCard();
});

window.addEventListener('resize', layout);
layout();
void loadTransferPerspective()
  .then((config) => photo.applyPerspective(config))
  .catch((error) => {
    console.error(error);
    showStatus('Could not load the perspective config.');
  });
void syncFolder();
setInterval(() => void syncFolder(), 1500);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideCard();
    return;
  }
  if (event.code === 'Space' || event.key === ' ') {
    spacePressed = true;
    event.preventDefault();
    return;
  }
  const moveStep = 0.01;
  const movement = {
    ArrowLeft: [-moveStep, 0],
    ArrowRight: [moveStep, 0],
    ArrowUp: spacePressed ? [0, 0, moveStep] : [0, -moveStep, 0],
    ArrowDown: spacePressed ? [0, 0, -moveStep] : [0, moveStep, 0],
  }[event.key];
  if (movement) {
    event.preventDefault();
    photo.moveCamera(...movement);
    showPerspective();
    return;
  }
  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    photo.adjustFov(event.shiftKey ? -1 : -0.5);
    showPerspective();
    return;
  }
  if (event.key === '=' || event.key === '+') {
    event.preventDefault();
    photo.adjustFov(event.shiftKey ? 1 : 0.5);
    showPerspective();
    return;
  }
  if (event.key === '[' || event.key === ']') {
    event.preventDefault();
    const view = photo.perspectiveState();
    photo.applyPerspective({ rowRise: view.rowRise + (event.key === ']' ? 0.02 : -0.02) });
    showPerspective();
    return;
  }
  if (event.repeat) return;
  if (event.key === 's' || event.key === 'S') {
    event.preventDefault();
    void saveTransferPerspective(photo.perspectiveState()).then((saved) => {
      showStatus(saved ? 'Perspective saved to src/transfer-perspective.json' : 'Could not save the perspective.');
    });
    return;
  }
  if (event.key === 't' || event.key === 'T') {
    statusHiddenByUser = !statusHiddenByUser;
    status.hidden = statusHiddenByUser;
    return;
  }
  if (event.key === 'u' || event.key === 'U') {
    uniformsEnabled = photo.setUniformEnabled(!uniformsEnabled);
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.key === ' ') spacePressed = false;
});

window.addEventListener('blur', () => {
  spacePressed = false;
});
