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
const QSO_GROUPS = [
  "CQ",
  "DE",
  "K",
  "KN",
  "BK",
  "BT",
  "AA",
  "AR",
  "AS",
  "HH",
  "KA",
  "CL",
  "GM",
  "GA",
  "GE",
  "GN",
  "OM",
  "YL",
  "XYL",
  "TNX",
  "TKS",
  "TU",
  "PSE",
  "AGN",
  "SRI",
  "FER",
  "ES",
  "HR",
  "HPE",
  "RST",
  "599",
  "5NN",
  "UR",
  "OP",
  "NAME",
  "QRA",
  "QTH",
  "QRL",
  "QRM",
  "QRN",
  "QRO",
  "QRP",
  "QRS",
  "QRT",
  "QRV",
  "QRX",
  "QRZ",
  "QSB",
  "QSO",
  "QSY",
  "WX",
  "RIG",
  "ANT",
  "PWR",
  "FB",
  "HW",
  "CPY",
  "CFM",
  "R",
  "RR",
  "RRR",
  "NIL",
  "QSL",
  "GL",
  "CU",
  "CUL",
  "73",
  "88",
  "SK",
];
const PROSIGNS = {
  AA: ".-.-",
  AR: ".-.-.",
  AS: ".-...",
  BT: "-...-",
  HH: "........",
  KA: "-.-.-",
  KN: "-.--.",
  SK: "...-.-",
};
const MAX_ANSWER_LENGTH = Math.max(...QSO_GROUPS.map((group) => group.length));
const TONE_FREQUENCY = 750;
const RAMP_SECONDS = 0.006;
const MEMORY_KEY = "dadidaTrainerMemory";

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
  sumAnswered: document.querySelector("#sumAnswered"),
  sumRate: document.querySelector("#sumRate"),
  summaryText: document.querySelector("#summaryText"),
  reviewList: document.querySelector("#reviewList"),
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
    mistakes: [],
  };
}

function loadMemory() {
  try {
    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY));
    if (memory && typeof memory === "object") {
      return {
        characters: memory.characters || {},
        pairs: memory.pairs || {},
      };
    }
  } catch {
    // Ignore corrupt local data and start fresh.
  }

  return { characters: {}, pairs: {} };
}

function saveMemory(memory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Storage can fail in private modes; the trainer still works without memory.
  }
}

function charactersForMode() {
  if (ui.contentMode.value === "letters") return LETTERS;
  if (ui.contentMode.value === "numbers") return NUMBERS;
  if (ui.contentMode.value === "qso") return QSO_GROUPS;
  return [...LETTERS, ...NUMBERS];
}

function randomCharacter() {
  const characters = charactersForMode();
  const recent = new Set(game.recent.slice(-4));
  const options = characters.filter((character) => !recent.has(character));
  const pool = options.length ? options : characters;
  const memory = loadMemory();
  const weakCharacters = pool.filter((character) => memory.characters[character] > 0);
  let character;

  if (weakCharacters.length && Math.random() < 0.42) {
    const weighted = weakCharacters.flatMap((weakCharacter) =>
      Array(Math.min(6, memory.characters[weakCharacter])).fill(weakCharacter)
    );
    character = weighted[Math.floor(Math.random() * weighted.length)];
  } else {
    character = pool[Math.floor(Math.random() * pool.length)];
  }

  game.recent.push(character);
  game.recent = game.recent.slice(-8);
  return character;
}

function rememberMistake(answer, expected) {
  const memory = loadMemory();
  const pairKey = `${answer || "?"}>${expected}`;

  memory.characters[expected] = Math.min(12, (memory.characters[expected] || 0) + 2);
  memory.pairs[pairKey] = Math.min(12, (memory.pairs[pairKey] || 0) + 1);
  saveMemory(memory);
}

function rewardCorrect(character) {
  const memory = loadMemory();
  if (!memory.characters[character]) return;

  memory.characters[character] -= 1;
  if (memory.characters[character] <= 0) delete memory.characters[character];
  saveMemory(memory);
}

function groupedMistakes() {
  const groups = new Map();

  game.mistakes.forEach(({ answer, expected }) => {
    const key = `${answer || "?"}>${expected}`;
    const item = groups.get(key) || { answer: answer || "?", expected, count: 0 };
    item.count += 1;
    groups.set(key, item);
  });

  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function selectedTarget() {
  return Number(ui.duration.value);
}

function expectedAnswerLength() {
  return ui.contentMode.value === "qso" ? MAX_ANSWER_LENGTH : 1;
}

function syncAnswerMode() {
  ui.answer.maxLength = expectedAnswerLength();
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
  syncAnswerMode();
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

function signalTimings(signal) {
  const dit = 1.2 / Number(ui.wpm.value);
  const dah = dit * 3;
  const durations = [];
  const gaps = [];
  const units = PROSIGNS[signal] ? [PROSIGNS[signal]] : [...signal].map((character) => MORSE[character]);

  units.forEach((code, characterIndex) => {
    if (!code) return;

    [...code].forEach((symbol, symbolIndex, symbols) => {
      durations.push(symbol === "." ? dit : dah);

      const hasNextSymbol = symbolIndex < symbols.length - 1;
      const hasNextCharacter = characterIndex < units.length - 1;
      if (hasNextSymbol) {
        gaps.push(dit);
      } else if (hasNextCharacter) {
        gaps.push(dit * 3);
      } else {
        gaps.push(0);
      }
    });
  });

  return { dit, durations, gaps };
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

  const { dit, durations, gaps } = signalTimings(game.current);
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
  feedback(
    ui.contentMode.value === "qso"
      ? "Escucha primero. Cuando termine, escribe el grupo."
      : "Escucha primero. Cuando termine, escribe el carácter.",
    ""
  );
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
    rewardCorrect(game.current);
  } else {
    game.wrong += 1;
    game.streak = 0;
    game.mistakes.push({ answer, expected: game.current });
    rememberMistake(answer, game.current);
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
  ui.sumAnswered.textContent = game.answered;
  ui.sumRate.textContent = rateValue();
  ui.summaryText.textContent = `Has dado ${game.answered} respuestas en ${Math.round(
    game.target / 60
  )} minuto(s): ${game.correct} aciertos y ${game.wrong} fallos a ${ui.wpm.value} wpm.`;
  renderReview();

  if (typeof ui.summary.showModal === "function") {
    ui.summary.showModal();
  }
}

function renderReview() {
  const mistakes = groupedMistakes();

  if (!mistakes.length) {
    ui.reviewList.innerHTML = `<p class="review-empty">Sin fallos en esta partida.</p>`;
    return;
  }

  ui.reviewList.innerHTML = mistakes
    .map(
      ({ answer, expected, count }) => `
        <span class="review-item">
          <strong class="review-wrong">${answer}</strong>
          <span>→</span>
          <strong class="review-right">${expected}</strong>
          ${count > 1 ? `<small>${count}x</small>` : ""}
        </span>
      `
    )
    .join("");
}

ui.contentMode.addEventListener("change", syncAnswerMode);
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

  const clean = ui.answer.value
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, game.current.length || expectedAnswerLength())
    .toUpperCase();
  ui.answer.value = clean;
  if (game.current && clean.length === game.current.length) answerCurrent(clean);
});

syncSettingsView();
syncWpm();
syncStats();
