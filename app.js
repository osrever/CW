const MORSE = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  0: "-----",
  1: ".----",
  2: "..---",
  3: "...--",
  4: "....-",
  5: ".....",
  6: "-....",
  7: "--...",
  8: "---..",
  9: "----.",
};

const LETTERS = Object.keys(MORSE).filter((key) => /[A-Z]/.test(key));
const NUMBERS = Object.keys(MORSE).filter((key) => /\d/.test(key));
const TONE_FREQUENCY = 750;
const RAMP_SECONDS = 0.006;

const ui = {
  contentMode: document.querySelector("#contentMode"),
  duration: document.querySelector("#duration"),
  wpm: document.querySelector("#wpm"),
  wpmText: document.querySelector("#wpmText"),
  remaining: document.querySelector("#remaining"),
  answered: document.querySelector("#answered"),
  streak: document.querySelector("#streak"),
  radio: document.querySelector("#radio"),
  answer: document.querySelector("#answer"),
  feedback: document.querySelector("#feedback"),
  start: document.querySelector("#start"),
  repeat: document.querySelector("#repeat"),
  correct: document.querySelector("#correct"),
  wrong: document.querySelector("#wrong"),
  accuracy: document.querySelector("#accuracy"),
  rate: document.querySelector("#rate"),
  signalState: document.querySelector("#signalState"),
  history: document.querySelector("#history"),
  summary: document.querySelector("#summary"),
  summaryTitle: document.querySelector("#summaryTitle"),
  sumCorrect: document.querySelector("#sumCorrect"),
  sumWrong: document.querySelector("#sumWrong"),
  sumAccuracy: document.querySelector("#sumAccuracy"),
  sumRate: document.querySelector("#sumRate"),
  summaryText: document.querySelector("#summaryText"),
  closeSummary: document.querySelector("#closeSummary"),
};

let audioElement;
let objectUrl;
let timer;
let playbackTimer;
let isPlaying = false;
let game = freshGame();

function freshGame() {
  return {
    active: false,
    current: "",
    correct: 0,
    wrong: 0,
    answered: 0,
    streak: 0,
    startedAt: 0,
    endAt: 0,
    pausedAt: 0,
    mode: "time",
    target: 60,
    recent: [],
    history: [],
  };
}

function charactersForMode() {
  if (ui.contentMode.value === "letters") return LETTERS;
  if (ui.contentMode.value === "numbers") return NUMBERS;
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
  return Number(ui.duration.value);
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function elapsedSeconds() {
  if (!game.startedAt) return 1;
  return Math.max(1, (Date.now() - game.startedAt) / 1000);
}

function accuracyValue() {
  const total = game.correct + game.wrong;
  return total ? Math.round((game.correct / total) * 100) : 0;
}

function rateValue() {
  return Math.round((game.correct / elapsedSeconds()) * 60);
}

function syncSettingsView() {
  game.mode = "time";
  game.target = selectedTarget();
  ui.remaining.textContent = formatClock(game.target);
}

function syncWpm() {
  ui.wpmText.textContent = `${ui.wpm.value} wpm`;
}

function syncStats() {
  ui.correct.textContent = game.correct;
  ui.wrong.textContent = game.wrong;
  ui.accuracy.textContent = `${accuracyValue()}%`;
  ui.rate.textContent = rateValue();
  ui.streak.textContent = game.streak;
  ui.answered.textContent = String(game.answered);

  if (game.active && game.mode === "time") {
    ui.remaining.textContent = formatClock((game.endAt - Date.now()) / 1000);
  }
}

function feedback(text, type = "") {
  ui.feedback.textContent = text;
  ui.feedback.className = type;
}

function focusAnswer() {
  const x = window.scrollX;
  const y = window.scrollY;

  try {
    ui.answer.focus({ preventScroll: true });
  } catch {
    ui.answer.focus();
  }

  window.requestAnimationFrame(() => {
    if (Math.abs(window.scrollY - y) > 2 || Math.abs(window.scrollX - x) > 2) {
      window.scrollTo(x, y);
    }
  });
}

function lockSettings(locked) {
  [ui.contentMode, ui.duration, ui.wpm].forEach((field) => {
    field.disabled = locked;
  });
}

function setActive(active) {
  game.active = active;
  ui.answer.disabled = !active;
  ui.answer.readOnly = false;
  ui.repeat.disabled = !active || isPlaying;
  ui.start.textContent = active ? "Pausar" : game.answered ? "Continuar" : "Empezar";
  lockSettings(active);
}

function ensureAudioElement() {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "");
    audioElement.setAttribute("webkit-playsinline", "");
  }

  return audioElement;
}

function makeWavBlob(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  samples.forEach((sample) => {
    view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
    offset += 2;
  });

  return new Blob([buffer], { type: "audio/wav" });
}

function buildToneWav(durations, gaps, volume = 0.72) {
  const sampleRate = 44100;
  const samples = [];
  const addSilence = (seconds) => {
    const count = Math.round(seconds * sampleRate);
    for (let index = 0; index < count; index += 1) samples.push(0);
  };
  const addTone = (seconds) => {
    const count = Math.round(seconds * sampleRate);
    const ramp = Math.max(1, Math.round(RAMP_SECONDS * sampleRate));
    for (let index = 0; index < count; index += 1) {
      const attack = Math.min(1, index / ramp);
      const release = Math.min(1, (count - index) / ramp);
      const envelope = Math.min(attack, release);
      samples.push(
        Math.sin((2 * Math.PI * TONE_FREQUENCY * index) / sampleRate) * volume * envelope
      );
    }
  };

  addSilence(0.035);
  durations.forEach((duration, index) => {
    addTone(duration);
    addSilence(gaps[index] || 0);
  });
  addSilence(0.055);

  return makeWavBlob(samples, sampleRate);
}

function playBlob(blob) {
  const audio = ensureAudioElement();
  audio.pause();
  audio.currentTime = 0;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  return audio.play();
}

function playSignal() {
  if (!game.current || isPlaying) return;

  const code = MORSE[game.current];
  const dit = 1.2 / Number(ui.wpm.value);
  const dah = dit * 3;
  const durations = [...code].map((symbol) => (symbol === "." ? dit : dah));
  const gaps = durations.map((_, index) => (index < durations.length - 1 ? dit : 0));
  const totalDuration =
    durations.reduce((sum, duration) => sum + duration, 0) +
    gaps.reduce((sum, gap) => sum + gap, 0) +
    0.09;

  isPlaying = true;
  ui.answer.disabled = false;
  ui.answer.readOnly = false;
  ui.repeat.disabled = true;
  ui.radio?.classList.add("is-playing");
  ui.signalState.textContent = "Escuchando";

  const handleAudioError = () => {
    isPlaying = false;
    ui.radio?.classList.remove("is-playing");
    ui.answer.disabled = false;
    ui.answer.readOnly = false;
    ui.repeat.disabled = false;
    ui.signalState.textContent = "Sin audio";
    feedback("El audio no ha arrancado. Pulsa Volver a oír.", "wrong");
  };

  try {
    const playPromise = playBlob(buildToneWav(durations, gaps));
    if (playPromise) {
      playPromise.catch(handleAudioError);
    }
  } catch {
    handleAudioError();
  }

  window.clearTimeout(playbackTimer);
  playbackTimer = window.setTimeout(() => {
    isPlaying = false;
    ui.radio?.classList.remove("is-playing");
    ui.signalState.textContent = "Responde";
    if (game.active) {
      ui.answer.disabled = false;
      ui.answer.readOnly = false;
      ui.repeat.disabled = false;
      focusAnswer();
    }
  }, Math.max(320, (totalDuration + dit * 2) * 1000));
}

function nextSignal() {
  game.current = randomCharacter();
  ui.answer.value = "";
  ui.answer.classList.remove("good", "wrong");
  feedback("Escucha primero. Cuando termine, escribe el carácter.", "");
  playSignal();
}

function startGame() {
  if (game.active) {
    pauseGame();
    return;
  }

  const now = Date.now();

  if (game.answered === 0) {
    game = {
      ...freshGame(),
      mode: "time",
      target: selectedTarget(),
      startedAt: now,
    };
    game.endAt = now + game.target * 1000;
    ui.history.innerHTML = "";
  } else {
    const pauseDuration = now - game.pausedAt;
    game.startedAt += pauseDuration;
    game.endAt += pauseDuration;
  }

  setActive(true);
  syncStats();
  nextSignal();

  timer = window.setInterval(() => {
    syncStats();
    if (Date.now() >= game.endAt) {
      finishGame("Tiempo completado");
    }
  }, 250);
}

function pauseGame() {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  game.pausedAt = Date.now();
  ui.answer.readOnly = false;
  setActive(false);
  ui.repeat.disabled = true;
  feedback("Partida pausada.", "");
  ui.signalState.textContent = "Pausa";
}

function resetGame() {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  game = freshGame();
  ui.answer.readOnly = false;
  setActive(false);
  ui.answer.value = "";
  ui.answer.classList.remove("good", "wrong");
  ui.history.innerHTML = "";
  ui.signalState.textContent = "Preparado";
  feedback("Pulsa empezar para escuchar el primer código.", "");
  syncSettingsView();
  syncStats();
}

function saveHistory(answer, expected, success) {
  game.history.unshift({ answer, expected, success });
  game.history = game.history.slice(0, 16);
  ui.history.innerHTML = game.history
    .map((entry) => {
      const className = entry.success ? "ok" : "bad";
      const label = entry.success
        ? `${entry.expected}`
        : `${entry.answer || "Sin respuesta"} era ${entry.expected}`;
      return `<li class="${className}">${label}</li>`;
    })
    .join("");
}

function answerCurrent(value) {
  if (!game.active || !game.current) return;

  const answer = value.toUpperCase();
  const success = answer === game.current;
  game.answered += 1;

  if (success) {
    game.correct += 1;
    game.streak += 1;
    ui.answer.classList.add("good");
    feedback("Correcto.", "good");
  } else {
    game.wrong += 1;
    game.streak = 0;
    ui.answer.classList.add("wrong");
    feedback(`Era ${game.current}.`, "wrong");
  }

  saveHistory(answer, game.current, success);
  syncStats();

  window.setTimeout(() => {
    if (game.active) nextSignal();
  }, success ? 430 : 820);
}

function finishGame(title) {
  window.clearInterval(timer);
  window.clearTimeout(playbackTimer);
  isPlaying = false;
  setActive(false);
  ui.answer.disabled = true;
  ui.answer.readOnly = false;
  ui.repeat.disabled = true;
  ui.start.textContent = "Empezar";
  ui.signalState.textContent = "Partida terminada";
  lockSettings(false);

  ui.summaryTitle.textContent = title;
  ui.sumCorrect.textContent = game.correct;
  ui.sumWrong.textContent = game.wrong;
  ui.sumAccuracy.textContent = `${accuracyValue()}%`;
  ui.sumRate.textContent = rateValue();
  ui.summaryText.textContent = `Has reconocido ${game.correct} caracteres en ${Math.round(
    game.target / 60
  )} minuto(s) a ${ui.wpm.value} wpm.`;

  if (typeof ui.summary.showModal === "function") {
    ui.summary.showModal();
  }
}

ui.duration.addEventListener("change", syncSettingsView);
ui.wpm.addEventListener("input", syncWpm);
ui.start.addEventListener("click", startGame);
ui.repeat.addEventListener("click", playSignal);
ui.closeSummary.addEventListener("click", () => {
  ui.summary.close();
  resetGame();
});

ui.answer.addEventListener("input", () => {
  if (isPlaying) {
    ui.answer.value = "";
    return;
  }

  const clean = ui.answer.value.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase();
  ui.answer.value = clean;
  if (clean) answerCurrent(clean);
});

syncSettingsView();
syncWpm();
syncStats();
