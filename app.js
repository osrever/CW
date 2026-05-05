const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NUMBERS = '0123456789'.split('');
const TONE_FREQUENCY = 750;
const RAMP_SECONDS = 0.006;

const ui = {
  contentMode: document.querySelector('#contentMode'),
  sessionMode: document.querySelector('#sessionMode'),
  duration: document.querySelector('#duration'),
  targetCount: document.querySelector('#targetCount'),
  timeControl: document.querySelector('#timeControl'),
  countControl: document.querySelector('#countControl'),
  wpm: document.querySelector('#wpm'),
  wpmText: document.querySelector('#wpmText'),
  remaining: document.querySelector('#remaining'),
  answered: document.querySelector('#answered'),
  streak: document.querySelector('#streak'),
  radio: document.querySelector('#radio'),
  answer: document.querySelector('#answer'),
  feedback: document.querySelector('#feedback'),
  enableAudio: document.querySelector('#enableAudio'),
  start: document.querySelector('#start'),
  repeat: document.querySelector('#repeat'),
  reset: document.querySelector('#reset'),
  correct: document.querySelector('#correct'),
  wrong: document.querySelector('#wrong'),
  accuracy: document.querySelector('#accuracy'),
  rate: document.querySelector('#rate'),
  signalState: document.querySelector('#signalState'),
  history: document.querySelector('#history'),
  summary: document.querySelector('#summary'),
  summaryTitle: document.querySelector('#summaryTitle'),
  sumCorrect: document.querySelector('#sumCorrect'),
  sumWrong: document.querySelector('#sumWrong'),
  sumAccuracy: document.querySelector('#sumAccuracy'),
  sumRate: document.querySelector('#sumRate'),
  summaryText: document.querySelector('#summaryText'),
  closeSummary: document.querySelector('#closeSummary')
};

let audioContext;
let timer;
let playbackTimer;
let isPlaying = false;
let audioUnlocked = false;
let game = freshGame();

function freshGame() {
  return { active: false, current: '', correct: 0, wrong: 0, answered: 0, streak: 0, startedAt: 0, endAt: 0, pausedAt: 0, mode: 'time', target: 60, recent: [], history: [] };
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}

function scheduleTone(start, duration, volume = 0.24) {
  const context = ensureAudio();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = TONE_FREQUENCY;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + RAMP_SECONDS);
  gain.gain.setValueAtTime(volume, Math.max(start, start + duration - RAMP_SECONDS));
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function unlockAudio(audible = false) {
  const context = ensureAudio();
  if (context.state === 'suspended') context.resume();
  if (!audioUnlocked || audible) {
    scheduleTone(context.currentTime + 0.04, audible ? 0.18 : 0.04, audible ? 0.18 : 0.001);
    audioUnlocked = true;
  }
}

function enableAudio() {
  unlockAudio(true);
  ui.enableAudio.textContent = 'Sonido activo';
  ui.enableAudio.classList.add('is-on');
  setFeedback('Si has oido el pitido, el sonido esta listo.', 'good');
}

function charactersForMode() {
  if (ui.contentMode.value === 'letters') return LETTERS;
  if (ui.contentMode.value === 'numbers') return NUMBERS;
  return [...LETTERS, ...NUMBERS];
}

function randomCharacter() {
  const characters = charactersForMode();
  const recent = new Set(game.recent.slice(-4));
  const options = characters.filter((character) => !recent.has(character));
  const pool = options.length ? options : characters;
  const character = pool[Math.floor(Math.random() * pool.length)];
  game.recent.push(character);
  game.recent = game.recent.slice(-8);
  return character;
}

function selectedTarget() {
  return ui.sessionMode.value === 'count' ? Number(ui.targetCount.value) : Number(ui.duration.value);
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function elapsedSeconds() {
  return game.startedAt ? Math.max(1, (Date.now() - game.startedAt) / 1000) : 1;
}

function accuracyValue() {
  const total = game.correct + game.wrong;
  return total ? Math.round((game.correct / total) * 100) : 0;
}

function rateValue() {
  return Math.round((game.correct / elapsedSeconds()) * 60);
}

function syncSettingsView() {
  const countMode = ui.sessionMode.value === 'count';
  ui.timeControl.classList.toggle('is-hidden', countMode);
  ui.countControl.classList.toggle('is-hidden', !countMode);
  game.mode = ui.sessionMode.value;
  game.target = selectedTarget();
  ui.remaining.textContent = countMode ? String(game.target) : formatClock(game.target);
}

function syncWpm() {
  ui.wpmText.textContent = `${ui.wpm.value} WPM`;
}

function syncStats() {
  ui.correct.textContent = game.correct;
  ui.wrong.textContent = game.wrong;
  ui.accuracy.textContent = `${accuracyValue()}%`;
  ui.rate.textContent = rateValue();
  ui.streak.textContent = game.streak;
  ui.answered.textContent = game.mode === 'count' ? `${game.answered}/${game.target}` : String(game.answered);
  if (game.active && game.mode === 'time') ui.remaining.textContent = formatClock((game.endAt - Date.now()) / 1000);
  if (game.mode === 'count') ui.remaining.textContent = String(Math.max(0, game.target - game.answered));
}

function setFeedback(text, type = '') {
  ui.feedback.textContent = text;
  ui.feedback.className = type;
}

function lockSettings(locked) {
  [ui.contentMode, ui.sessionMode, ui.duration, ui.targetCount, ui.wpm].forEach((field) => field.disabled = locked);
}

function setActive(active) {
  game.active = active;
  ui.answer.disabled = !active || isPlaying;
  ui.repeat.disabled = !active || isPlaying;
  ui.reset.disabled = !active && game.answered === 0;
  ui.start.textContent = active ? 'Pausar' : game.answered ? 'Continuar' : 'Empezar';
  lockSettings(active);
}

function playSignal() {
  if (!game.current || isPlaying) return;
  unlockAudio(false);
  const context = ensureAudio();
  const code = MORSE[game.current];
  const dit = 1.2 / Number(ui.wpm.value);
  const dah = dit * 3;
  let cursor = context.currentTime + 0.08;
  isPlaying = true;
  ui.answer.disabled = true;
  ui.repeat.disabled = true;
  ui.radio.classList.add('is-playing');
  ui.signalState.textContent = 'Escuchando';
  [...code].forEach((symbol, index) => {
    const duration = symbol === '.' ? dit : dah;
    scheduleTone(cursor, duration);
    cursor += duration;
    if (index < code.length - 1) cursor += dit;
  });
  window.clearTimeout(playbackTimer);
  playbackTimer = window.setTimeout(() => {
    isPlaying = false;
    ui.radio.classList.remove('is-playing');
    ui.signalState.textContent = 'Responde';
    if (game.active) {
      ui.answer.disabled = false;
      ui.repeat.disabled = false;
      ui.answer.focus();
    }
  }, Math.max(320, (cursor - context.currentTime + dit * 2) * 1000));
}

function nextSignal() {
  game.current = randomCharacter();
  ui.answer.value = '';
  ui.answer.classList.remove('good', 'wrong');
  setFeedback('Escucha primero. Cuando termine, escribe el caracter.');
  playSignal();
}

function startGame() {
  if (game.active) {
    pauseGame();
    return;
  }
  unlockAudio(false);
  const now = Date.now();
  if (game.answered === 0) {
    game = { ...freshGame(), mode: ui.sessionMode.value, target: selectedTarget(), startedAt: now };
    game.endAt = now + game.target * 1000;
    ui.history.innerHTML = '';
  } else {
    const pauseDuration = now - game.pausedAt;
    game.startedAt += pauseDuration;
    if (game.mode === 'time') game.endAt += pauseDuration;
  }
  setActive(true);
  syncStats();
  nextSignal();
  timer = window.setInterval(() => {
    syncStats();
    if (game.mode === 'time' && Date.now() >= game.endAt) finishGame('Tiempo completado');
  }, 250);
}

function pauseGame() {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  game.pausedAt = Date.now();
  setActive(false);
  ui.repeat.disabled = true;
  setFeedback('Partida pausada.');
  ui.signalState.textContent = 'Pausa';
}

function resetGame() {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  game = freshGame();
  setActive(false);
  ui.reset.disabled = true;
  ui.answer.value = '';
  ui.answer.classList.remove('good', 'wrong');
  ui.history.innerHTML = '';
  ui.signalState.textContent = 'Preparado';
  setFeedback('Pulsa empezar para escuchar el primer codigo.');
  syncSettingsView();
  syncStats();
}

function saveHistory(answer, expected, success) {
  game.history.unshift({ answer, expected, success });
  game.history = game.history.slice(0, 16);
  ui.history.innerHTML = game.history.map((entry) => {
    const className = entry.success ? 'ok' : 'bad';
    const label = entry.success ? entry.expected : `${entry.answer || 'Sin respuesta'} era ${entry.expected}`;
    return `<li class="${className}">${label}</li>`;
  }).join('');
}

function answerCurrent(value) {
  if (!game.active || !game.current) return;
  const answer = value.toUpperCase();
  const success = answer === game.current;
  game.answered += 1;
  if (success) {
    game.correct += 1;
    game.streak += 1;
    ui.answer.classList.add('good');
    setFeedback('Correcto.', 'good');
  } else {
    game.wrong += 1;
    game.streak = 0;
    ui.answer.classList.add('wrong');
    setFeedback(`Era ${game.current}.`, 'wrong');
  }
  saveHistory(answer, game.current, success);
  syncStats();
  if (game.mode === 'count' && game.answered >= game.target) {
    window.setTimeout(() => finishGame('Cantidad completada'), 520);
    return;
  }
  window.setTimeout(() => { if (game.active) nextSignal(); }, success ? 430 : 820);
}

function finishGame(title) {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  setActive(false);
  ui.answer.disabled = true;
  ui.repeat.disabled = true;
  ui.reset.disabled = false;
  ui.start.textContent = 'Empezar';
  ui.signalState.textContent = 'Partida terminada';
  lockSettings(false);
  ui.summaryTitle.textContent = title;
  ui.sumCorrect.textContent = game.correct;
  ui.sumWrong.textContent = game.wrong;
  ui.sumAccuracy.textContent = `${accuracyValue()}%`;
  ui.sumRate.textContent = rateValue();
  ui.summaryText.textContent = game.mode === 'time'
    ? `Has reconocido ${game.correct} caracteres en ${Math.round(game.target / 60)} minuto(s).`
    : `Has terminado una serie de ${game.target} caracteres a ${ui.wpm.value} WPM.`;
  if (typeof ui.summary.showModal === 'function') ui.summary.showModal();
}

ui.sessionMode.addEventListener('change', syncSettingsView);
ui.duration.addEventListener('change', syncSettingsView);
ui.targetCount.addEventListener('input', syncSettingsView);
ui.wpm.addEventListener('input', syncWpm);
ui.enableAudio.addEventListener('pointerdown', () => unlockAudio(true), { passive: true });
ui.enableAudio.addEventListener('touchstart', () => unlockAudio(true), { passive: true });
ui.start.addEventListener('pointerdown', () => unlockAudio(false), { passive: true });
ui.repeat.addEventListener('pointerdown', () => unlockAudio(false), { passive: true });
ui.start.addEventListener('touchstart', () => unlockAudio(false), { passive: true });
ui.repeat.addEventListener('touchstart', () => unlockAudio(false), { passive: true });
ui.enableAudio.addEventListener('click', enableAudio);
ui.start.addEventListener('click', startGame);
ui.repeat.addEventListener('click', playSignal);
ui.reset.addEventListener('click', resetGame);
ui.closeSummary.addEventListener('click', () => { ui.summary.close(); resetGame(); });
ui.answer.addEventListener('input', () => {
  if (isPlaying) {
    ui.answer.value = '';
    return;
  }
  const clean = ui.answer.value.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase();
  ui.answer.value = clean;
  if (clean) answerCurrent(clean);
});

syncSettingsView();
syncWpm();
syncStats();
