const games = {
    mini: {
        title: "🎲 Generator Mini Lotto",
        count: 5,
        max: 42,
        systemMin: 5,
        systemMax: 12,
        ranges: [9,19,29,39,42]
    },

    lotto: {
        title: "🎲 Generator Lotto",
        count: 6,
        max: 49,
        systemMin: 6,
        systemMax: 12,
        ranges: [9,19,29,39,49]
    },

    euro: {
    title: "🎲 Generator EuroJackpot",
    count: 5,
    max: 50,

    euroCount: 2,
    euroMax: 12,

    ranges: [9,19,29,39,50]
},

    multi: {
        title: "🎲 Generator Multi Multi",
        count: 10,
        max: 80,
        ranges: [9,19,29,39,49,59,69,80]
    },

    extra: {
    title: "🎲 Generator Extra Pensja",
    count: 5,
    max: 35,

    extraCount: 1,
    extraMax: 4,

    ranges: [9,19,29,35]
}
};

// =========================================================
// LOTTOFORGE RNG — WEB CRYPTO API
// =========================================================
const LOTTOFORGE_UINT32_RANGE = 0x100000000;

function getLottoForgeCrypto() {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
        throw new Error("Ta przeglądarka nie udostępnia Web Crypto API (crypto.getRandomValues()).");
    }
    return cryptoApi;
}

function cryptoRandomUint32() {
    const buffer = new Uint32Array(1);
    getLottoForgeCrypto().getRandomValues(buffer);
    return buffer[0];
}

function cryptoRandomFloat() {
    return cryptoRandomUint32() / LOTTOFORGE_UINT32_RANGE;
}

function cryptoRandomInt(min, max) {
    min = Math.ceil(Number(min));
    max = Math.floor(Number(max));

    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
        throw new RangeError(`Niepoprawny zakres RNG: ${min}–${max}`);
    }

    const range = max - min + 1;
    if (range <= 0 || range > LOTTOFORGE_UINT32_RANGE) {
        throw new RangeError("Zakres RNG jest zbyt duży dla 32-bitowego generatora.");
    }

    // Rejection sampling — dzięki temu nie wprowadzamy modulo bias.
    const limit = Math.floor(LOTTOFORGE_UINT32_RANGE / range) * range;
    let value;
    do {
        value = cryptoRandomUint32();
    } while (value >= limit);

    return min + (value % range);
}

function cryptoSampleUnique(count, max) {
    const safeCount = Math.max(0, Math.min(Math.floor(Number(count) || 0), Math.floor(Number(max) || 0)));
    const values = Array.from({ length: max }, (_, index) => index + 1);

    // Partial Fisher–Yates: losujemy tylko tyle pozycji, ile faktycznie potrzebujemy.
    for (let i = 0; i < safeCount; i++) {
        const j = cryptoRandomInt(i, values.length - 1);
        [values[i], values[j]] = [values[j], values[i]];
    }

    return values.slice(0, safeCount).sort((a, b) => a - b);
}

function cryptoRandomToken() {
    return `${cryptoRandomUint32().toString(36)}${cryptoRandomUint32().toString(36)}`;
}

function getMinPossibleSum(count) {
    let sum = 0;

    for (let i = 1; i <= count; i++) {
        sum += i;
    }

    return sum;
}

function getMaxPossibleSum(count, max) {
    let sum = 0;

    for (let i = 0; i < count; i++) {
        sum += max - i;
    }

    return sum;
}

let currentGame = games.mini;

const losowaniaGier = {
    mini: [],
    lotto: [],
    euro: [],
    multi: [],
    extra: []
};

let analysisWindow = 20;
let hotColdCount = 5;
let autoForgeMode = "auto";
let autoForgeSecondaryOverride = null;
let autoForgeManualStructureOverride = null;
let lastGeneratedTicketMeta = null;

// Aktywny wyłącznie podczas generowania pakietu wielu kuponów.
// Pozwala samemu RNG unikać liczb już mocno użytych w bieżącym pakiecie.
let activeBatchDiversityUsage = null;
let activeBatchDiversityIgnored = new Set();
let activeBatchDiversityMaxUsage = null;

// AUTO FORGE — profile okien analizy zależne od gry.
// Pierwsze okno ma zwykle największą wagę, dzięki czemu długi profil
// zachowuje kontakt z bieżącą sytuacją, ale dostaje stabilniejsze tło.
const AUTO_FORGE_WINDOW_PRESETS = {
    mini: [
        { id: "auto", name: "⚡ Krótki", windows: [5, 10, 15], weights: [0.45, 0.35, 0.20], hint: "Najbardziej reaktywny profil — świeże sektory i szybkie zmiany." },
        { id: "hybrid", name: "🔀 Hybryda", windows: [5, 20, 50], weights: [0.50, 0.30, 0.20], hint: "Łączy ostatnie losowania z szerszym tłem bez utraty świeżości." },
        { id: "medium", name: "🎯 Średni", windows: [10, 30, 60], weights: [0.45, 0.35, 0.20], hint: "Sprawdza, czy bieżący układ utrzymuje się dłużej niż kilka losowań." },
        { id: "long", name: "🧱 Długi", windows: [20, 50, 100], weights: [0.40, 0.35, 0.25], hint: "Mniej podatny na pojedynczy wyskok — mocniej premiuje trwałe strefy i sektory." },
        { id: "macro", name: "🌊 Makro", windows: [50, 100, 200], weights: [0.40, 0.35, 0.25], hint: "Szerokie tło historyczne do porównania z aktualnym kierunkiem." }
    ],
    lotto: [
        { id: "auto", name: "⚡ Krótki", windows: [5, 10, 15], weights: [0.45, 0.35, 0.20], hint: "Najbardziej reaktywny profil dla świeżego układu." },
        { id: "hybrid", name: "🔀 Hybryda", windows: [5, 15, 30], weights: [0.50, 0.30, 0.20], hint: "Świeży impuls plus sprawdzenie, czy utrzymuje się w szerszym tle." },
        { id: "medium", name: "🎯 Średni", windows: [10, 25, 50], weights: [0.45, 0.35, 0.20], hint: "Balans pomiędzy ostatnimi losowaniami i średnim okresem." },
        { id: "long", name: "🧱 Długi", windows: [20, 50, 100], weights: [0.40, 0.35, 0.25], hint: "Stabilniejsze sektory, struktury i częstotliwości." },
        { id: "macro", name: "🌊 Makro", windows: [50, 100, 200], weights: [0.40, 0.35, 0.25], hint: "Najszersze tło do kontroli, czy obecny profil nie jest tylko krótkim skokiem." }
    ],
    euro: [
        { id: "auto", name: "⚡ Krótki", windows: [5, 10, 15], weights: [0.45, 0.35, 0.20], hint: "Najbardziej reaktywny profil dla świeżych zmian." },
        { id: "hybrid", name: "🔀 Hybryda", windows: [5, 15, 30], weights: [0.50, 0.30, 0.20], hint: "Łączy ostatni impuls z krótszym i średnim tłem." },
        { id: "medium", name: "🎯 Średni", windows: [10, 20, 40], weights: [0.45, 0.35, 0.20], hint: "Sprawdza, czy bieżące sektory utrzymują się w kilku oknach." },
        { id: "long", name: "🧱 Długi", windows: [20, 40, 80], weights: [0.40, 0.35, 0.25], hint: "Dłuższy filtr z mniejszą wrażliwością na pojedyncze losowanie." },
        { id: "macro", name: "🌊 Makro", windows: [40, 80, 150], weights: [0.40, 0.35, 0.25], hint: "Szerokie tło historyczne dla trendu, sektorów i migracji." }
    ],
    multi: [
        { id: "auto", name: "⚡ Krótki", windows: [5, 10, 15], weights: [0.45, 0.35, 0.20], patternWindows: [5, 10, 15], patternWeights: [0.45, 0.35, 0.20], hint: "Szybki puls planszy — mocno reaguje na świeże skupiska." },
        { id: "pulse", name: "🔥 Puls", windows: [10, 20, 30], weights: [0.45, 0.35, 0.20], patternWindows: [10, 20, 30], patternWeights: [0.45, 0.35, 0.20], hint: "Krótko-średni profil pod aktualne ogniska i serie skupisk." },
        { id: "hybrid", name: "🔀 Hybryda", windows: [5, 20, 50], weights: [0.50, 0.30, 0.20], patternWindows: [5, 20, 30], patternWeights: [0.50, 0.30, 0.20], hint: "Łączy świeży impuls 5 losowań z tłem 20 i 50." },
        { id: "medium", name: "🎯 Średni", windows: [20, 50, 100], weights: [0.45, 0.35, 0.20], patternWindows: [10, 20, 40], patternWeights: [0.45, 0.35, 0.20], hint: "Dobrze pokazuje, czy LOW/MID/HIGH i sektory trzymają kierunek." },
        { id: "long", name: "🧱 Długi", windows: [50, 100, 200], weights: [0.40, 0.35, 0.25], patternWindows: [20, 30, 50], patternWeights: [0.40, 0.35, 0.25], hint: "Szuka trwałych ognisk i sektorów, nie tylko ostatniego wyskoku." },
        { id: "macro", name: "🌊 Makro", windows: [100, 200, 300], weights: [0.40, 0.35, 0.25], patternWindows: [20, 40, 60], patternWeights: [0.40, 0.35, 0.25], hint: "Najszerszy obraz planszy. Relacje par/trójek/czwórek liczone są na krótszych oknach, żeby nie zamrozić przeglądarki." }
    ],
    extra: [
        { id: "auto", name: "⚡ Krótki", windows: [5, 10, 15], weights: [0.45, 0.35, 0.20], hint: "Najbardziej reaktywny profil dla świeżego układu." },
        { id: "hybrid", name: "🔀 Hybryda", windows: [5, 20, 50], weights: [0.50, 0.30, 0.20], hint: "Świeży impuls plus szersze tło." },
        { id: "medium", name: "🎯 Średni", windows: [10, 30, 60], weights: [0.45, 0.35, 0.20], hint: "Balans między szybkością reakcji i stabilnością." },
        { id: "long", name: "🧱 Długi", windows: [20, 50, 100], weights: [0.40, 0.35, 0.25], hint: "Mocniej premiuje utrzymujące się sektory i struktury." },
        { id: "macro", name: "🌊 Makro", windows: [50, 100, 200], weights: [0.40, 0.35, 0.25], hint: "Szeroki filtr historyczny do kontroli aktualnego trendu." }
    ]
};

const AUTO_FORGE_SINGLE_WINDOWS = {
    mini: [5, 10, 20, 30, 50, 100, 200],
    lotto: [5, 10, 20, 30, 50, 100, 200],
    euro: [5, 10, 20, 40, 80, 150],
    multi: [5, 10, 20, 30, 50, 100, 200, 300],
    extra: [5, 10, 20, 30, 50, 100, 200]
};

function getAutoForgePresets() {
    const gameKey = getCurrentGameKey();
    return AUTO_FORGE_WINDOW_PRESETS[gameKey] || AUTO_FORGE_WINDOW_PRESETS.mini;
}

function getAutoForgePreset(mode = autoForgeMode) {
    return getAutoForgePresets().find(preset => preset.id === mode) || null;
}

function renderAutoForgeModeOptions() {
    const gameKey = getCurrentGameKey();
    const presets = getAutoForgePresets();
    const singles = AUTO_FORGE_SINGLE_WINDOWS[gameKey] || [5, 10, 20, 50, 100];

    const presetOptions = presets.map(preset =>
        `<option value="${preset.id}">${preset.name} — ${preset.windows.join(" / ")}</option>`
    ).join("");

    const singleOptions = singles.map(size =>
        `<option value="single-${size}">Tylko ${size} ostatnich</option>`
    ).join("");

    return `
        <optgroup label="Profile ważone">${presetOptions}</optgroup>
        <optgroup label="Jedno okno">${singleOptions}</optgroup>
    `;
}

function getAutoForgeModeHint(mode = autoForgeMode) {
    if (String(mode).startsWith("single-")) {
        const size = Number(String(mode).replace("single-", ""));
        return `Jedno okno: ${size} ostatnich losowań • bez mieszania z innymi okresami.`;
    }

    const preset = getAutoForgePreset(mode) || getAutoForgePreset("auto");
    if (!preset) return "";

    const weightsText = preset.weights
        .map(weight => `${Math.round(weight * 100)}%`)
        .join(" / ");

    return `${preset.hint} Wagi: ${weightsText}.`;
}
function getCurrentGameKey() {

    return Object.keys(games).find(
        key => games[key] === currentGame
    );
}

function getCurrentGameDraws() {

    const gameKey = getCurrentGameKey();

    return losowaniaGier[gameKey];
}
function getAnalysisDraws() {

    const losowania = getCurrentGameDraws();

    if (losowania.length === 0) {
        return [];
    }

    return losowania.slice(-analysisWindow);
}

function parseDrawDateToTimestamp(dateString) {
    const match = String(dateString || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (!match) return 0;

    const [, day, month, year] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function sortDrawsChronologically(draws) {
    return [...draws].sort((a, b) => {
        const dateDiff =
            parseDrawDateToTimestamp(a.data) - parseDrawDateToTimestamp(b.data);

        if (dateDiff !== 0) return dateDiff;

        return Number(a.numer || 0) - Number(b.numer || 0);
    });
}

function getLatestImportedDraw() {
    const draws = getCurrentGameDraws();
    return draws.length ? draws[draws.length - 1] : null;
}

function formatLatestDrawNumbers(draw) {
    if (!draw) return "";

    const main = (draw.liczby || [])
        .map(number => String(number).padStart(2, "0"))
        .join(", ");

    const extraParts = [];

    if (Array.isArray(draw.euroNumbers) && draw.euroNumbers.length) {
        extraParts.push(
            `Euro: ${draw.euroNumbers.map(number => String(number).padStart(2, "0")).join(", ")}`
        );
    }

    if (Number.isInteger(draw.extraNumber)) {
        extraParts.push(`Extra: ${draw.extraNumber}`);
    }

    return extraParts.length
        ? `${main} | ${extraParts.join(" | ")}`
        : main;
}

function renderLatestDrawStatus() {
    const container = document.getElementById("latestDrawStatus");
    if (!container) return;

    const latest = getLatestImportedDraw();

    if (!latest) {
        container.innerHTML = `
            <div class="latest-draw-card empty">
                <div class="latest-draw-head">📥 Kontrola importu</div>
                <div class="latest-draw-empty">Brak wczytanych danych dla tej gry.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="latest-draw-card">
            <div class="latest-draw-head">
                <span>✅ OSTATNIE WCZYTANE LOSOWANIE</span>
                <strong>${latest.data}</strong>
            </div>
            <div class="latest-draw-meta">Losowanie #${latest.numer}</div>
            <div class="latest-draw-numbers">${formatLatestDrawNumbers(latest)}</div>
        </div>
    `;
}

function getStructureForNumbers(numbers) {
    

    const structure =
        new Array(currentGame.ranges.length).fill(0);

    numbers.forEach(number => {

        for (let i = 0; i < currentGame.ranges.length; i++) {

            if (number <= currentGame.ranges[i]) {
                structure[i]++;
                break;
            }
        }
    });

    return structure.join("-");

}
function getEvenOddForNumbers(numbers) {

    const even =
        numbers.filter(number => number % 2 === 0).length;

    const odd =
        numbers.length - even;

    return `${even}/${odd}`;
}
miniBtn.addEventListener("click", () => {

    currentGame = games.mini;
   
    showGame();

});
const lottoBtn = document.getElementById("lottoBtn");
const multiBtn = document.getElementById("multiBtn");
const euroBtn = document.getElementById("euroBtn");
const extraBtn = document.getElementById("extraBtn");
const importBtn = document.getElementById("importBtn");
const statsBtn = document.getElementById("statsBtn");
const labBtn = document.getElementById("labBtn");
const rngArenaBtn = document.getElementById("rngArenaBtn");
const csvFile = document.getElementById("csvFile");
euroBtn.addEventListener("click", () => {

    currentGame = games.euro;
    showGame();

});
multiBtn.addEventListener("click", () => {

    currentGame = games.multi;

    showGame();

});   // <- TEGO BRAKUJE

lottoBtn.addEventListener("click", () => {

    currentGame = games.lotto;

    showGame();

});

extraBtn.addEventListener("click", () => {

    currentGame = games.extra;

    showGame();

});
importBtn.addEventListener("click", () => {
    csvFile.value = "";
    csvFile.click();
});
statsBtn.addEventListener("click", () => {

    pokazStatystyki();

});

labBtn.addEventListener("click", () => {
    showLaboratory(getCurrentGameKey());
});

rngArenaBtn?.addEventListener("click", () => {
    showRngArena(getCurrentGameKey());
});
function detectCsvDelimiter(line) {
    const candidates = [";", "\t", ","];
    return candidates
        .map(delimiter => ({ delimiter, count: line.split(delimiter).length }))
        .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseImportedDraw(cols) {
    const numer = Number(cols[0]);
    const dzien = Number(cols[1]);
    const miesiac = Number(cols[2]);
    const rok = Number(cols[3]);

    if (![numer, dzien, miesiac, rok].every(Number.isFinite)) {
        return null;
    }

    const numericTail = cols
        .slice(4)
        .map(value => Number(String(value).replace(',', '.')))
        .filter(Number.isFinite);

    const gameKey = getCurrentGameKey();
    const mainCount = currentGame === games.multi ? 20 : currentGame.count;
    const mainNumbers = numericTail.slice(0, mainCount);

    if (
        mainNumbers.length !== mainCount ||
        mainNumbers.some(n => !Number.isInteger(n) || n < 1 || n > currentGame.max) ||
        new Set(mainNumbers).size !== mainNumbers.length
    ) {
        return null;
    }

    const draw = {
        numer,
        data:
            `${String(dzien).padStart(2, "0")}.` +
            `${String(miesiac).padStart(2, "0")}.` +
            `${rok}`,
        liczby: mainNumbers
    };

    const rest = numericTail.slice(mainCount);

    if (gameKey === "euro") {
        const euroNumbers = rest
            .filter(n => Number.isInteger(n) && n >= 1 && n <= currentGame.euroMax)
            .slice(0, currentGame.euroCount);

        if (euroNumbers.length === currentGame.euroCount) {
            draw.euroNumbers = euroNumbers;
        }
    }

    if (gameKey === "extra") {
        const extraNumber = rest.find(
            n => Number.isInteger(n) && n >= 1 && n <= currentGame.extraMax
        );

        if (extraNumber !== undefined) {
            draw.extraNumber = extraNumber;
        }
    }

    return draw;
}

csvFile.addEventListener("change", (e) => {
    const file = e.target.files[0];

    if (!file) {
        alert("❌ Nie wybrano pliku.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(event) {
        try {
            const text = event.target.result;
            const lines = text
                .split(/\r?\n/)
                .filter(line => line.trim() !== "");

            if (!lines.length) {
                throw new Error("Plik jest pusty.");
            }

            const delimiter = detectCsvDelimiter(lines[0]);
            const parsedDraws = [];
            let ignoredRows = 0;

            lines.forEach(line => {
                const cols = line.split(delimiter).map(col => col.trim());
                const draw = parseImportedDraw(cols);

                if (draw) parsedDraws.push(draw);
                else ignoredRows++;
            });

            if (!parsedDraws.length) {
                throw new Error(
                    `Nie znaleziono poprawnych losowań dla ${currentGame.title}. ` +
                    `Sprawdź format CSV i kolejność kolumn.`
                );
            }

            const gameDraws = getCurrentGameDraws();
            const sortedDraws = sortDrawsChronologically(parsedDraws);

            gameDraws.length = 0;
            gameDraws.push(...sortedDraws);

            console.log("Zaimportowane losowania:", gameDraws);

            const latestDraw = getLatestImportedDraw();
            renderLatestDrawStatus();
            const labResolvedCount = resolveLaboratoryEntries();

            alert(
                `✅ Zaimportowano ${gameDraws.length} losowań dla ${currentGame.title}!` +
                (ignoredRows > 0 ? `\nPominięto wierszy: ${ignoredRows}` : "") +
                (latestDraw
                    ? `\n\n📅 Ostatnie losowanie: ${latestDraw.data}` +
                      `\n🔢 ${formatLatestDrawNumbers(latestDraw)}`
                    : "") +
                (labResolvedCount > 0
                    ? `\n\n🧪 Laboratorium automatycznie rozliczyło: ${labResolvedCount} ${labResolvedCount === 1 ? "zestaw" : "zestawów"}.`
                    : "")
            );
        } catch (error) {
            console.error("Błąd importu:", error);
            alert(`❌ Błąd podczas importowania pliku:\n\n${error.message}`);
        }
    };

    reader.onerror = function() {
        alert("❌ Nie udało się odczytać pliku CSV.");
    };

    reader.readAsText(file);
});

const contentArea = document.getElementById("contentArea");


function showGame(){
stopRngArena();
contentArea.classList.remove("stats-view", "lab-view", "rng-arena-view");
const labels = currentGame.ranges.map((value, index) => {

    const start = index === 0
        ? 1
        : currentGame.ranges[index - 1] + 1;

    return `${start}-${value}`;

});
    contentArea.innerHTML = `

<div class="main-panel">

    <h1>${currentGame.title}</h1>

    <p>Wygeneruj swój kupon.</p>

    <div id="latestDrawStatus" class="latest-draw-status"></div>

${currentGame === games.multi ? `

<div class="multi-options">

<label>Ile liczb wygenerować?</label>

<select id="multiCount">

<option value="1">1</option>
<option value="2">2</option>
<option value="3">3</option>
<option value="4">4</option>
<option value="5">5</option>
<option value="6">6</option>
<option value="7">7</option>
<option value="8" selected>8</option>
<option value="9">9</option>
<option value="10">10</option>

</select>

</div>

` : ""}

${isSystemGame() ? `
<div class="system-options">
    <div>
        <label for="systemCount">🎟️ Tryb systemowy — ile liczb typować?</label>
        <select id="systemCount">
            ${Array.from(
                { length: (currentGame.systemMax - currentGame.systemMin + 1) },
                (_, index) => currentGame.systemMin + index
            ).map(value => `
                <option value="${value}" ${value === currentGame.count ? "selected" : ""}>
                    ${value}${value === currentGame.count ? " — zwykły zakład" : " — system"}
                </option>
            `).join("")}
        </select>
    </div>
    <div id="systemInfo" class="system-info"></div>
</div>
` : ""}

<div class="ticket-batch-options">
    <div class="ticket-batch-count-box">
        <label for="ticketBatchCount">🎫 Ile kuponów wygenerować?</label>
        <select id="ticketBatchCount">
            ${Array.from({ length: 20 }, (_, index) => index + 1).map(value => `
                <option value="${value}" ${value === 1 ? "selected" : ""}>${value}</option>
            `).join("")}
        </select>
    </div>

    ${currentGame === games.multi ? `
    <div class="multi-coverage-box">
        <label class="multi-coverage-toggle">
            <input type="checkbox" id="multiCoverageMode">
            🧩 TEST 8 × 10 — pokryj całą planszę 1–80
        </label>
        <select id="multiCoverageStyle">
            <option value="sector">Blokowo 8×10 — 1–10, 11–20, …, 71–80</option>
            <option value="mixed">Mieszane — losowy podział 1–80 bez powtórzeń</option>
        </select>
        <small>
            Każda liczba 1–80 pojawi się dokładnie raz w całym pakiecie. Jeśli wszystkie 8 zakładów zagrasz z opcją Plus, liczba PLUS na pewno będzie na jednym z nich. To gwarantuje wygraną z tytułu trafienia Plusa, ale nie gwarantuje zysku netto po odjęciu kosztu wszystkich zakładów.
        </small>
    </div>
    ` : ""}

    <div id="ticketBatchInfo" class="ticket-batch-info"></div>
</div>

<div class="auto-forge-controls">
    <div class="auto-forge-stage-badge">ETAP 4 • ANALIZA + SILNIK WYBORU</div>
    <label for="autoForgeMode">Horyzont analizy AUTO FORGE</label>
    <select id="autoForgeMode">
        ${renderAutoForgeModeOptions()}
    </select>
    <div id="autoForgeModeHint" class="auto-forge-mode-hint">
        ${getAutoForgeModeHint()}
    </div>
</div>

<div class="generator-actions">
<button id="generateBtn" class="primary-btn">
    Generuj liczby
</button>

<button id="pureRandomBtn" class="primary-btn pure-random-btn">
    🎲 PEŁNY RANDOM
</button>

<button id="autoForgeBtn" class="primary-btn auto-forge-btn">
    🧠 AUTO FORGE — ANALIZUJ
</button>
</div>
<div class="rng-engine-note">🔐 Losowanie w LottoForge korzysta z Web Crypto API. AUTO FORGE nadal najpierw analizuje i ustala profil — crypto wykonuje tylko końcowy wybór liczb.</div>

<div id="autoForgeReport" class="auto-forge-report"></div>

    <div id="numbers" class="ball-container"></div>

${currentGame === games.euro ? `
<div id="euroNumbers" class="ball-container"></div>
` : ""}
${currentGame === games.extra ? `
<div id="extraNumber" class="ball-container"></div>
` : ""}

<div id="singleTicketCopyMount"></div>
<div id="stats"></div>

<div class="side-panel">

<details id="manualFiltersPanel" class="manual-filters-panel" open>
<summary>
    <span>🎯 Filtry ręczne</span>
    <small>struktura • suma • parzystość • wykluczenia • obowiązkowe</small>
</summary>
<div class="manual-filters-content">

<h3>Struktura</h3>
<div class="structure-scheme-hint">
    ${currentGame.ranges.map((value, index) => {
        const start = index === 0 ? 1 : currentGame.ranges[index - 1] + 1;
        return `${start}-${value}`;
    }).join(" • ")}
</div>

${currentGame.ranges.map((value,index)=>{

    return `

<label>${labels[index]}</label>

<input
    type="number"
    id="r${index+1}"
    min="0"
    max="${getMaxTicketCount()}"
    value="0">

`;

}).join("")}

<br><br>

<label>
    <input type="checkbox" id="structureFilter">
    Aktywuj filtr struktury
</label>

<label>
    <input type="checkbox" id="sumFilter">
    Aktywuj filtr sumy
</label>

<br><br>

<label>Suma od</label>

<input
    type="number"
    id="sumMin"
    value="${getMinPossibleSum(getGeneratorTargetCount())}"
    min="0">

<br><br>

<label>Suma do</label>

<input
    type="number"
    id="sumMax"
    value="${getMaxPossibleSum(getGeneratorTargetCount(), currentGame.max)}"
    min="0">
<hr>

<h3>Parzyste / Nieparzyste</h3>

<label>
    <input type="checkbox" id="evenOddFilter">
    Aktywuj filtr
</label>

<br><br>

<label>Parzyste:</label>
<input
    type="number"
    id="evenCount"
    min="0"
    max="${getMaxTicketCount()}"
    value="0">

<br><br>

<label>Nieparzyste:</label>
<input
    type="number"
    id="oddCount"
    min="0"
    max="${getMaxTicketCount()}"
    value="0">

<h3>🚫 Wykluczone liczby</h3>

<label>
    <input type="checkbox" id="excludeFilter">
    Aktywuj filtr
</label>

<br><br>

<label>Numery do wykluczenia</label>
<input
    type="text"
    id="excludedNumbers"
    placeholder="np. 3,7,18,41">

<hr>

<h3>📌 Liczby obowiązkowe</h3>

<label>
    <input type="checkbox" id="requiredFilter">
    Aktywuj filtr
</label>

<br><br>

<label>Pula liczb obowiązkowych</label>
<input
    type="text"
    id="requiredNumbers"
    placeholder="np. 7,12,18,23,31,42">

<br><br>

<label>Ile liczb wylosować z tej puli?</label>
<input
    type="number"
    id="requiredCount"
    min="0"
    max="${getMaxTicketCount()}"
    value="0">
    ${currentGame === games.euro ? `
<br><br>

<h3>⭐ Wykluczenia Euro</h3>

<label>
    <input type="checkbox" id="euroExcludeFilter">
    Aktywuj filtr wykluczeń Euro
</label>

<br><br>

<label>Numery Euro do wykluczenia</label>

<input
    type="text"
    id="euroExcludedNumbers"
    placeholder="np. 2,7,11">
` : ""}

</div>
</details>

`;

    const generateBtn = document.getElementById("generateBtn");
    const pureRandomBtn = document.getElementById("pureRandomBtn");
    const autoForgeBtn = document.getElementById("autoForgeBtn");

    const autoForgeModeSelect = document.getElementById("autoForgeMode");
    const autoForgeModeHint = document.getElementById("autoForgeModeHint");

    const availableAutoModes = Array.from(autoForgeModeSelect.options).map(option => option.value);
    if (!availableAutoModes.includes(autoForgeMode)) {
        autoForgeMode = "auto";
    }

    autoForgeModeSelect.value = autoForgeMode;
    if (autoForgeModeHint) {
        autoForgeModeHint.textContent = getAutoForgeModeHint(autoForgeMode);
    }

    autoForgeModeSelect.addEventListener("change", () => {
        autoForgeMode = autoForgeModeSelect.value;
        if (autoForgeModeHint) {
            autoForgeModeHint.textContent = getAutoForgeModeHint(autoForgeMode);
        }
    });

    generateBtn.addEventListener("click", () => generateTicketBatch());
    pureRandomBtn?.addEventListener("click", generatePureRandomBatch);
    autoForgeBtn.addEventListener("click", runAutoForge);
    if (currentGame === games.multi) {
        const multiCount = document.getElementById("multiCount");
        multiCount.addEventListener("change", () => {
            syncTicketCountControls();
            updateTicketBatchInfo();
        });
    }

    if (isSystemGame()) {
        const systemCount = document.getElementById("systemCount");
        systemCount.addEventListener("change", () => {
            syncTicketCountControls();
            updateTicketBatchInfo();
        });
    }

    const ticketBatchCount = document.getElementById("ticketBatchCount");
    if (ticketBatchCount) {
        ticketBatchCount.addEventListener("change", updateTicketBatchInfo);
    }

    const multiCoverageMode = document.getElementById("multiCoverageMode");
    const multiCoverageStyle = document.getElementById("multiCoverageStyle");
    if (multiCoverageMode) {
        multiCoverageMode.addEventListener("change", syncMultiCoverageControls);
    }
    if (multiCoverageStyle) {
        multiCoverageStyle.addEventListener("change", updateTicketBatchInfo);
    }

    syncTicketCountControls();
    syncMultiCoverageControls();
    updateTicketBatchInfo();
    renderLatestDrawStatus();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function average(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values) {
    if (values.length < 2) return 0;
    const avg = average(values);
    const variance = average(values.map(value => (value - avg) ** 2));
    return Math.sqrt(variance);
}

function isSystemGame() {
    return currentGame === games.mini || currentGame === games.lotto;
}

function getMaxTicketCount() {
    if (isSystemGame()) return currentGame.systemMax || currentGame.count;
    if (currentGame === games.multi) return 10;
    return currentGame.count;
}

function getGeneratorTargetCount() {
    if (currentGame === games.multi) {
        return Number(document.getElementById("multiCount")?.value || currentGame.count);
    }

    if (isSystemGame()) {
        return Number(document.getElementById("systemCount")?.value || currentGame.count);
    }

    return currentGame.count;
}

function getAutoForgeTargetCount() {
    return getGeneratorTargetCount();
}

function combinationCount(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k) || n < k || k < 0) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) {
        result = result * (n - k + i) / i;
    }
    return Math.round(result);
}

function updateSystemInfo() {
    const info = document.getElementById("systemInfo");
    if (!info || !isSystemGame()) return;

    const targetCount = getGeneratorTargetCount();
    const baseCount = currentGame.count;
    const combinations = combinationCount(targetCount, baseCount);

    info.innerHTML = targetCount === baseCount
        ? `<strong>Tryb zwykły:</strong> ${baseCount} liczb • 1 kombinacja`
        : `<strong>System ${targetCount} liczb:</strong> ${combinations} kombinacji ${baseCount}/${baseCount}`;
}

function syncTicketCountControls() {
    const targetCount = getGeneratorTargetCount();
    const sumMinInput = document.getElementById("sumMin");
    const sumMaxInput = document.getElementById("sumMax");

    if (sumMinInput) sumMinInput.value = getMinPossibleSum(targetCount);
    if (sumMaxInput) sumMaxInput.value = getMaxPossibleSum(targetCount, currentGame.max);

    for (let i = 0; i < currentGame.ranges.length; i++) {
        const input = document.getElementById(`r${i + 1}`);
        if (input) input.max = String(Math.min(targetCount, getSectorBounds(i).capacity));
    }

    const evenInput = document.getElementById("evenCount");
    const oddInput = document.getElementById("oddCount");
    const requiredInput = document.getElementById("requiredCount");
    if (evenInput) evenInput.max = String(targetCount);
    if (oddInput) oddInput.max = String(targetCount);
    if (requiredInput) requiredInput.max = String(targetCount);

    updateSystemInfo();
}

function getTicketBatchCount() {
    const value = Number(document.getElementById("ticketBatchCount")?.value || 1);
    return clamp(Number.isFinite(value) ? Math.round(value) : 1, 1, 20);
}

function isMultiCoverageMode() {
    return currentGame === games.multi && Boolean(document.getElementById("multiCoverageMode")?.checked);
}

function getMultiCoverageStyle() {
    return document.getElementById("multiCoverageStyle")?.value || "sector";
}

function syncMultiCoverageControls() {
    if (currentGame !== games.multi) return;

    const enabled = isMultiCoverageMode();
    const batchSelect = document.getElementById("ticketBatchCount");
    const multiCount = document.getElementById("multiCount");
    const styleSelect = document.getElementById("multiCoverageStyle");

    if (enabled) {
        if (batchSelect) batchSelect.value = "8";
        if (multiCount) multiCount.value = "10";
    }

    if (batchSelect) batchSelect.disabled = enabled;
    if (multiCount) multiCount.disabled = enabled;
    if (styleSelect) styleSelect.disabled = !enabled;

    syncTicketCountControls();
    updateTicketBatchInfo();
}

function updateTicketBatchInfo() {
    const info = document.getElementById("ticketBatchInfo");
    if (!info) return;

    if (isMultiCoverageMode()) {
        const style = getMultiCoverageStyle() === "sector"
            ? "blokowo: 1–10, 11–20, …, 71–80"
            : "mieszane: losowy podział 1–80 bez powtórzeń";
        info.innerHTML = `
            <strong>Pokrycie pełne:</strong> 8 kuponów × 10 liczb • ${style}.
            <span>80/80 liczb pokrytych, 0 powtórzeń między kuponami.</span>
        `;
        return;
    }

    const count = getTicketBatchCount();
    const target = getGeneratorTargetCount();
    const systemText = isSystemGame() && target > currentGame.count
        ? ` • każdy jako system ${target} (${combinationCount(target, currentGame.count)} kombinacji)`
        : "";

    info.innerHTML = `
        <strong>${count} ${count === 1 ? "kupon" : "kuponów"}</strong> po ${target} liczb${systemText}.
        <span>${count > 1
            ? "Tryb pakietu twardo blokuje nadmierne powtórzenia zwykłych liczb, gdy tylko filtry zostawiają alternatywę."
            : "Generator tworzy zestaw przy aktualnie aktywnych filtrach."}</span>
    `;
}

function buildTicketMeta(numbers, euroNumbers = [], extraNumber = []) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const ranges = new Array(currentGame.ranges.length).fill(0);
    sorted.forEach(n => ranges[getSectorIndex(n)]++);
    const even = sorted.filter(n => n % 2 === 0).length;

    return {
        numbers: sorted,
        euroNumbers: [...euroNumbers],
        extraNumber: [...extraNumber],
        sum: sorted.reduce((a, b) => a + b, 0),
        even,
        odd: sorted.length - even,
        structure: ranges,
        targetCount: sorted.length
    };
}

function getTicketUniquenessKey(ticket) {
    return [
        ticket.numbers.join("-"),
        (ticket.euroNumbers || []).join("-"),
        (ticket.extraNumber || []).join("-")
    ].join("|");
}


// =========================================================
// PAKIETY KUPONÓW — KONTROLA RÓŻNORODNOŚCI
// =========================================================
// Przy generowaniu kilku kuponów nie wystarczy odrzucić identycznych zestawów.
// Pilnujemy też, żeby kolejne kupony nie były kosmetycznymi wariacjami pierwszego.
// Wszystkie aktywne filtry nadal obowiązują; różnorodność jest dodatkowym etapem
// wyboru pomiędzy kandydatami, którzy już przeszli przez generator.
function getBatchForcedMainNumbers() {
    if (typeof getRequiredSettings !== "function") return new Set();

    const settings = getRequiredSettings();
    if (!settings?.enabled || settings.count <= 0) return new Set();

    const excludeFilter = document.getElementById("excludeFilter")?.checked ?? false;
    const excluded = new Set(
        excludeFilter
            ? String(document.getElementById("excludedNumbers")?.value || "")
                .split(",")
                .map(value => Number(value.trim()))
                .filter(Number.isInteger)
            : []
    );

    const availablePool = settings.pool.filter(number => !excluded.has(number));

    // Jeśli użytkownik każe pobrać całą dostępną pulę, te liczby z definicji
    // muszą znaleźć się na każdym kuponie. Nie karzemy generatora za ich powtórzenia.
    return settings.count === availablePool.length
        ? new Set(availablePool)
        : new Set();
}

function getBatchDiversityLimits(requested, targetCount, ignoredCount = 0) {
    const effectiveTarget = Math.max(1, targetCount - ignoredCount);
    const effectiveUniverse = Math.max(1, currentGame.max - ignoredCount);

    // Dla kuponów 5–6 liczb oznacza to zwykle maksymalnie 2 wspólne liczby
    // pomiędzy dowolnymi dwoma kuponami. Dla większych systemów limit rośnie.
    const maxPairOverlap = effectiveTarget <= 2
        ? 0
        : effectiveTarget <= 6
            ? 1
            : Math.max(1, Math.floor(effectiveTarget * 0.30));

    // Globalny limit użycia jednej liczby zależy od wielkości pakietu i planszy.
    // 5 × system 6 w Mini Lotto => jedna liczba powinna zwykle wystąpić max 2 razy.
    const averageUsage = (requested * effectiveTarget) / effectiveUniverse;
    const maxNumberUsage = Math.min(
        requested,
        Math.max(1, Math.ceil(averageUsage + 0.75))
    );

    return { maxPairOverlap, maxNumberUsage };
}

function getBatchMainUsage(tickets, ignoredNumbers = new Set()) {
    const usage = new Map();

    tickets.forEach(ticket => {
        (ticket.numbers || []).forEach(number => {
            if (ignoredNumbers.has(number)) return;
            usage.set(number, (usage.get(number) || 0) + 1);
        });
    });

    return usage;
}

function getActiveBatchDiversityMultiplier(number) {
    if (!activeBatchDiversityUsage || activeBatchDiversityIgnored.has(number)) {
        return 1;
    }

    const usage = activeBatchDiversityUsage.get(number) || 0;

    // W pakiecie zwykła liczba po dojściu do limitu dostaje wagę 0.
    // To jest kluczowa różnica względem starego miękkiego karania: jeśli w danym
    // sektorze są inne poprawne liczby, generator NIE może dalej wciskać np. 36
    // do każdego kolejnego kuponu tylko dlatego, że ma wysoki score AUTO FORGE.
    if (Number.isFinite(activeBatchDiversityMaxUsage) && usage >= activeBatchDiversityMaxUsage) {
        return 0;
    }

    // Pierwsza powtórka jest nadal dozwolona, ale bardzo mocno zniechęcana.
    // Dzięki temu pięć kuponów wygląda jak pięć osobnych losowań, a nie wariacje
    // jednego kuponu bazowego.
    return usage === 0 ? 1 : Math.pow(0.035, usage);
}

function getBatchAwareRandomIndex(pool) {
    if (!pool.length) return -1;
    if (!activeBatchDiversityUsage) return cryptoRandomInt(0, pool.length - 1);

    const weights = pool.map(number => getActiveBatchDiversityMultiplier(number));
    const total = weights.reduce((sum, value) => sum + value, 0);

    if (total > 0) {
        let roll = cryptoRandomFloat() * total;
        for (let i = 0; i < weights.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return i;
        }
        return pool.length - 1;
    }

    // Jeżeli cały lokalny pool (np. bardzo ciasny sektor + filtry) osiągnął limit,
    // nie wybieramy przypadkowo ulubionej liczby. Bierzemy spośród najmniej użytych.
    // Kandydat i tak przejdzie później końcową kontrolę pakietu.
    let minUsage = Infinity;
    const leastUsedIndexes = [];
    pool.forEach((number, index) => {
        const usage = activeBatchDiversityIgnored.has(number)
            ? 0
            : (activeBatchDiversityUsage.get(number) || 0);
        if (usage < minUsage) {
            minUsage = usage;
            leastUsedIndexes.length = 0;
            leastUsedIndexes.push(index);
        } else if (usage === minUsage) {
            leastUsedIndexes.push(index);
        }
    });

    return leastUsedIndexes[cryptoRandomInt(0, leastUsedIndexes.length - 1)] ?? 0;
}

function getTicketMainOverlap(ticketA, ticketB, ignoredNumbers = new Set()) {
    const second = new Set(
        (ticketB?.numbers || []).filter(number => !ignoredNumbers.has(number))
    );

    return (ticketA?.numbers || []).filter(
        number => !ignoredNumbers.has(number) && second.has(number)
    ).length;
}

function getSecondaryDiversityPenalty(ticket, tickets) {
    let penalty = 0;

    if (currentGame === games.euro) {
        const usage = new Map();
        tickets.forEach(item => (item.euroNumbers || []).forEach(number => {
            usage.set(number, (usage.get(number) || 0) + 1);
        }));
        (ticket.euroNumbers || []).forEach(number => {
            const count = usage.get(number) || 0;
            penalty += count * count * 6;
        });
    }

    if (currentGame === games.extra) {
        const usage = new Map();
        tickets.forEach(item => (item.extraNumber || []).forEach(number => {
            usage.set(number, (usage.get(number) || 0) + 1);
        }));
        (ticket.extraNumber || []).forEach(number => {
            const count = usage.get(number) || 0;
            penalty += count * count * 4;
        });
    }

    return penalty;
}

function evaluateBatchCandidateDiversity(ticket, tickets, requested, ignoredNumbers = new Set()) {
    if (!tickets.length) {
        return {
            hardValid: true,
            score: 0,
            maxOverlap: 0,
            pairOverlapExcess: 0,
            usageExcess: 0
        };
    }

    const targetCount = ticket.targetCount || ticket.numbers?.length || getGeneratorTargetCount();
    const limits = getBatchDiversityLimits(requested, targetCount, ignoredNumbers.size);
    const usage = getBatchMainUsage(tickets, ignoredNumbers);
    const overlaps = tickets.map(item => getTicketMainOverlap(ticket, item, ignoredNumbers));
    const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0;
    const totalOverlap = overlaps.reduce((sum, value) => sum + value, 0);

    const pairOverlapExcess = overlaps.reduce(
        (sum, value) => sum + Math.max(0, value - limits.maxPairOverlap),
        0
    );

    let usageExcess = 0;
    let concentrationPenalty = 0;

    (ticket.numbers || []).forEach(number => {
        if (ignoredNumbers.has(number)) return;
        const nextUsage = (usage.get(number) || 0) + 1;
        usageExcess += Math.max(0, nextUsage - limits.maxNumberUsage);
        concentrationPenalty += Math.max(0, nextUsage - 1) ** 2;
    });

    // Twarde przekroczenia dostają ogromną karę. Wśród poprawnych kandydatów
    // wybieramy ten, który ma najmniej wspólnych i najmniej "zajechanych" liczb.
    const score =
        pairOverlapExcess * 10000 +
        usageExcess * 8000 +
        maxOverlap * 180 +
        totalOverlap * 45 +
        concentrationPenalty * 20 +
        getSecondaryDiversityPenalty(ticket, tickets);

    return {
        hardValid: pairOverlapExcess === 0 && usageExcess === 0,
        score,
        maxOverlap,
        pairOverlapExcess,
        usageExcess,
        limits
    };
}

function getBatchDiversitySummary(tickets, ignoredNumbers = new Set()) {
    if (!Array.isArray(tickets) || tickets.length < 2) {
        return { maxOverlap: 0, averageOverlap: 0, mostUsed: [], maxUsage: 1 };
    }

    const overlaps = [];
    for (let i = 0; i < tickets.length; i++) {
        for (let j = i + 1; j < tickets.length; j++) {
            overlaps.push(getTicketMainOverlap(tickets[i], tickets[j], ignoredNumbers));
        }
    }

    const usage = [...getBatchMainUsage(tickets, ignoredNumbers).entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const maxUsage = usage[0]?.[1] || 1;
    const mostUsed = usage.filter(([, count]) => count === maxUsage).map(([number]) => number);

    const targetCount = tickets[0]?.targetCount || tickets[0]?.numbers?.length || getGeneratorTargetCount();
    const limits = getBatchDiversityLimits(tickets.length, targetCount, ignoredNumbers.size);

    return {
        maxOverlap: overlaps.length ? Math.max(...overlaps) : 0,
        averageOverlap: overlaps.length
            ? overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length
            : 0,
        mostUsed,
        maxUsage,
        limits
    };
}

function renderTicketBatch(tickets, options = {}) {
    const numbersDiv = document.getElementById("numbers");
    const stats = document.getElementById("stats");
    const euroDiv = document.getElementById("euroNumbers");
    const extraDiv = document.getElementById("extraNumber");
    const singleCopyMount = document.getElementById("singleTicketCopyMount");

    if (singleCopyMount) singleCopyMount.innerHTML = "";
    if (euroDiv) euroDiv.innerHTML = "";
    if (extraDiv) extraDiv.innerHTML = "";
    if (!numbersDiv || !stats) return;

    const title = options.title || "Wygenerowane kupony";
    const subtitle = options.subtitle || "";
    const gameKey = getCurrentGameKey();

    numbersDiv.innerHTML = `
        <div class="ticket-batch-grid">
            ${tickets.map((ticket, index) => `
                <article class="ticket-batch-card">
                    <div class="ticket-batch-card-head">
                        <strong>Kupon #${index + 1}</strong>
                        <span>${ticket.structure.join("-")}</span>
                    </div>
                    <div class="ticket-batch-balls">
                        ${ticket.numbers.map(number => `
                            <div class="ball">${String(number).padStart(2, "0")}</div>
                        `).join("")}
                    </div>
                    ${ticket.euroNumbers?.length ? `
                        <div class="ticket-secondary-row">
                            <span>Euro:</span>
                            ${ticket.euroNumbers.map(number => `<strong>⭐ ${String(number).padStart(2, "0")}</strong>`).join("")}
                        </div>
                    ` : ""}
                    ${ticket.extraNumber?.length ? `
                        <div class="ticket-secondary-row">
                            <span>Extra:</span>
                            ${ticket.extraNumber.map(number => `<strong>⭐ ${number}</strong>`).join("")}
                        </div>
                    ` : ""}
                    <div class="ticket-batch-meta">
                        <span>Σ ${ticket.sum}</span>
                        <span>P/N ${ticket.even}/${ticket.odd}</span>
                        ${isSystemGame() ? `<span>${ticket.targetCount === currentGame.count ? "zwykły" : `system ${ticket.targetCount}`}</span>` : ""}
                    </div>
                </article>
            `).join("")}
        </div>

        <section class="ticket-quick-copy-panel">
            <div class="ticket-quick-copy-head">
                <div>
                    <span>⚡ SZYBKI TRANSFER DO LABORATORIUM</span>
                    <strong>Kupony jeden pod drugim — gotowe do kopiowania</strong>
                </div>
                <small>${tickets.length} ${tickets.length === 1 ? "zestaw" : "zestawów"}</small>
            </div>
            <textarea id="ticketQuickCopyText" readonly rows="${Math.min(10, Math.max(3, tickets.length + 1))}"></textarea>
            <div class="ticket-quick-copy-actions">
                <button type="button" id="ticketQuickCopyBtn" class="lab-secondary-btn">📋 Kopiuj wszystkie</button>
                <button type="button" id="ticketQuickLabBtn" class="primary-btn">🧪 Otwórz w Laboratorium</button>
            </div>
            <small class="ticket-quick-copy-hint">Format jest zgodny z Laboratorium. Możesz skopiować całość albo wysłać pakiet bezpośrednio jednym kliknięciem.</small>
        </section>
    `;

    const quickCopyArea = document.getElementById("ticketQuickCopyText");
    if (quickCopyArea) quickCopyArea.value = formatTicketsForLaboratory(tickets, gameKey);
    bindTicketQuickCopyEvents(tickets, gameKey);

    stats.innerHTML = `
        <div class="stats-card ticket-batch-summary">
            <h2>🎫 ${title}</h2>
            <div class="stat"><span>Liczba kuponów</span><strong>${tickets.length}</strong></div>
            <div class="stat"><span>Liczb na kupon</span><strong>${tickets[0]?.targetCount || getGeneratorTargetCount()}</strong></div>
            ${options.coverage ? `
                <div class="stat"><span>Pokrycie planszy</span><strong>80 / 80</strong></div>
                <div class="stat"><span>Powtórzenia między kuponami</span><strong>0</strong></div>
                <div class="stat"><span>Liczba PLUS</span><strong>na pewno na 1 z 8 kuponów</strong></div>
                <p class="ticket-batch-warning">Przy 8 zakładach z opcją Plus pełne pokrycie 1–80 gwarantuje, że jeden kupon zawiera wylosowanego Plusa. To oznacza gwarantowaną wygraną z Plusa, ale nie gwarantuje, że łączna wypłata przewyższy koszt całego pakietu.</p>
            ` : ""}
            ${options.diversity && tickets.length > 1 ? `
                <div class="stat"><span>Max wspólnych liczb / para kuponów</span><strong>${options.diversity.maxOverlap}</strong></div>
                <div class="stat"><span>Średnio wspólnych liczb / para</span><strong>${options.diversity.averageOverlap.toFixed(2)}</strong></div>
                <div class="stat"><span>Najwyższa częstotliwość jednej liczby</span><strong>${options.diversity.maxUsage}×</strong></div>
                <div class="stat"><span>Limit zwykłej liczby w pakiecie</span><strong>${options.diversity.limits?.maxNumberUsage ?? "—"}×</strong></div>
                <div class="stat"><span>Cel max wspólnych / para</span><strong>${options.diversity.limits?.maxPairOverlap ?? "—"}</strong></div>
                ${options.diversity.maxUsage > (options.diversity.limits?.maxNumberUsage ?? Infinity) ? `<p class="ticket-batch-warning">⚠️ Aktywne filtry wymusiły przekroczenie docelowego limitu powtórzeń. Pakiet jest najlepszym znalezionym kompromisem.</p>` : ""}
                ${options.forcedMainNumbers?.length ? `<div class="stat"><span>Wymuszone na każdym kuponie</span><strong>${options.forcedMainNumbers.join(", ")}</strong></div>` : ""}
            ` : ""}
            ${subtitle ? `<p class="ticket-batch-summary-note">${subtitle}</p>` : ""}
        </div>
    `;
}

function shuffleArray(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = cryptoRandomInt(0, i);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function generateMultiCoverageTickets(analysis = null) {
    if (currentGame !== games.multi) return [];

    const style = getMultiCoverageStyle();
    let rawTickets = [];

    if (style === "sector") {
        // UWAGA: to są BLOKI POKRYCIA 8×10, a nie sektory struktury.
        // Struktura analityczna działa teraz wg:
        // 1-9 | 10-19 | 20-29 | 30-39 | 40-49 | 50-59 | 60-69 | 70-80.
        // Tryb pokrycia musi jednak zachować dokładnie 8 kuponów po 10 liczb,
        // dlatego używa stałych bloków 1-10, 11-20, ..., 71-80.
        rawTickets = Array.from({ length: 8 }, (_, index) => {
            const start = index * 10 + 1;
            const end = start + 9;
            return Array.from({ length: 10 }, (_, offset) => start + offset);
        });

        // Jeśli AUTO FORGE jest po analizie, możemy jedynie ustawić kolejność
        // bloków od najbardziej aktywnego. Pokrycie 1-80 pozostaje bez zmian.
        if (Array.isArray(analysis?.sectorScores) && analysis.sectorScores.length) {
            rawTickets = rawTickets
                .map(numbers => ({
                    numbers,
                    score: numbers.reduce(
                        (sum, number) => sum + (analysis.sectorScores[getSectorIndex(number)] || 0),
                        0
                    ) / numbers.length
                }))
                .sort((a, b) => b.score - a.score)
                .map(item => item.numbers);
        }
    } else {
        const allNumbers = shuffleArray(Array.from({ length: 80 }, (_, index) => index + 1));
        rawTickets = Array.from({ length: 8 }, (_, index) =>
            allNumbers.slice(index * 10, index * 10 + 10)
        );
    }

    return rawTickets.map(numbers => buildTicketMeta(numbers));
}

function generateMultiCoverageBatch(analysis = null, profile = null) {
    const tickets = generateMultiCoverageTickets(analysis);
    if (!tickets.length) return [];

    renderTicketBatch(tickets, {
        coverage: true,
        title: "TEST 8 × 10 — pełne pokrycie 1–80",
        subtitle: profile
            ? `${profile.icon || "🎯"} ${profile.label || "AUTO FORGE"} • tryb pokrycia zastępuje strukturę pojedynczego kuponu, bo cały pakiet musi wykorzystać każdą liczbę dokładnie raz. Bloki 8×10 są niezależne od nowych sektorów struktury.`
            : "Tryb pokrycia jest testem całej planszy; ręczne wykluczenia i struktura pojedynczego kuponu nie są tu stosowane."
    });

    const result = document.getElementById("autoForgeGenerationResult");
    if (result && analysis) {
        result.innerHTML = `
            <div class="auto-forge-generation-result">
                <strong>🧩 Wygenerowano 8 kuponów pokrywających 1–80.</strong>
                <p>W wariancie blokowym kupony nadal mają po 10 liczb i razem pokrywają 1–80 dokładnie raz. Bloki mogą być ustawione od najbardziej aktywnego według bieżącej analizy.</p>
            </div>
        `;
    }

    return tickets;
}


function generatePureRandomTicket() {
    const targetCount = getGeneratorTargetCount();
    const numbers = cryptoSampleUnique(targetCount, currentGame.max);
    let euroNumbers = [];
    let extraNumber = [];

    if (currentGame === games.euro) {
        euroNumbers = cryptoSampleUnique(currentGame.euroCount, currentGame.euroMax);
    }

    if (currentGame === games.extra) {
        extraNumber = cryptoSampleUnique(currentGame.extraCount, currentGame.extraMax);
    }

    return buildTicketMeta(numbers, euroNumbers, extraNumber);
}

function generatePureRandomBatch() {
    try {
        stopRngArena();
        const requested = getTicketBatchCount();
        const tickets = [];
        const seen = new Set();
        const maxAttempts = Math.max(100, requested * 60);
        let attempts = 0;

        while (tickets.length < requested && attempts < maxAttempts) {
            attempts++;
            const ticket = generatePureRandomTicket();
            const key = getTicketUniquenessKey(ticket);
            if (seen.has(key)) continue;
            seen.add(key);
            tickets.push(ticket);
        }

        if (!tickets.length) {
            throw new Error("Nie udało się utworzyć losowego kuponu.");
        }

        lastGeneratedTicketMeta = tickets[tickets.length - 1];
        const report = document.getElementById("autoForgeReport");
        if (report) report.innerHTML = "";
        const numbersDiv = document.getElementById("numbers");
        const euroDiv = document.getElementById("euroNumbers");
        const extraDiv = document.getElementById("extraNumber");
        if (numbersDiv) numbersDiv.innerHTML = "";
        if (euroDiv) euroDiv.innerHTML = "";
        if (extraDiv) extraDiv.innerHTML = "";

        renderTicketBatch(tickets, {
            title: "🎲 Pełny Random / Chybił-Trafił",
            subtitle: "Web Crypto API • bez AUTO FORGE, HOT/MID/COLD, struktur, sumy, parzystości, wykluczeń i liczb obowiązkowych. Obowiązują wyłącznie zasady wybranej gry i liczba typowanych kul."
        });

        return tickets;
    } catch (error) {
        console.error("Pełny Random:", error);
        alert(`❌ Nie udało się uruchomić pełnego randomu.\n\n${error.message}`);
        return [];
    }
}

function generateTicketBatch(autoForgePlanFactory = null, options = {}) {
    if (isMultiCoverageMode()) {
        return generateMultiCoverageBatch(options.analysis || null, options.profile || null);
    }

    const requested = getTicketBatchCount();
    if (requested <= 1 && !autoForgePlanFactory) {
        const numbers = generateMiniLotto();
        return Array.isArray(numbers) && lastGeneratedTicketMeta ? [lastGeneratedTicketMeta] : [];
    }

    const tickets = [];
    const seen = new Set();
    const forcedMainNumbers = getBatchForcedMainNumbers();
    const batchLimits = getBatchDiversityLimits(
        requested,
        getGeneratorTargetCount(),
        forcedMainNumbers.size
    );

    // Każdy kupon nadal przechodzi dokładnie przez te same filtry.
    // Różnica: nie akceptujemy pierwszego lepszego wyniku. Dla każdego miejsca
    // w pakiecie generujemy pulę kandydatów i wybieramy najmniej podobnego
    // do kuponów już przyjętych.
    for (let slot = 0; slot < requested; slot++) {
        const candidateBudget = slot === 0
            ? 1
            : (requested <= 8 ? 72 : 42);

        let bestCandidate = null;
        let bestAssessment = null;
        const localKeys = new Set();

        for (let candidateIndex = 0; candidateIndex < candidateBudget; candidateIndex++) {
            activeBatchDiversityUsage = getBatchMainUsage(tickets, forcedMainNumbers);
            activeBatchDiversityIgnored = forcedMainNumbers;
            activeBatchDiversityMaxUsage = batchLimits.maxNumberUsage;

            const plan = typeof autoForgePlanFactory === "function"
                ? autoForgePlanFactory()
                : null;
            const numbers = generateMiniLotto(0, plan);

            activeBatchDiversityUsage = null;
            activeBatchDiversityIgnored = new Set();
            activeBatchDiversityMaxUsage = null;

            if (!Array.isArray(numbers) || !lastGeneratedTicketMeta) {
                continue;
            }

            const ticket = {
                ...lastGeneratedTicketMeta,
                autoForgePlan: plan
            };
            const key = getTicketUniquenessKey(ticket);

            if (seen.has(key) || localKeys.has(key)) continue;
            localKeys.add(key);

            const assessment = evaluateBatchCandidateDiversity(
                ticket,
                tickets,
                requested,
                forcedMainNumbers
            );

            if (
                !bestCandidate ||
                assessment.score < bestAssessment.score ||
                (assessment.score === bestAssessment.score && assessment.maxOverlap < bestAssessment.maxOverlap)
            ) {
                bestCandidate = ticket;
                bestAssessment = assessment;
            }

            // Kandydat bez wspólnych liczb (poza naprawdę wymuszonymi)
            // nie wymaga dalszego szukania.
            if (assessment.hardValid && assessment.maxOverlap === 0) {
                break;
            }
        }

        if (!bestCandidate) break;

        const key = getTicketUniquenessKey(bestCandidate);
        seen.add(key);
        tickets.push(bestCandidate);
    }

    activeBatchDiversityUsage = null;
    activeBatchDiversityIgnored = new Set();
    activeBatchDiversityMaxUsage = null;

    if (!tickets.length) return [];

    const diversity = getBatchDiversitySummary(tickets, forcedMainNumbers);
    const diversityText = tickets.length > 1
        ? `Różnorodność pakietu: maks. ${diversity.maxOverlap} wspólnych liczb pomiędzy dwoma kuponami; najczęściej użyta liczba wystąpiła ${diversity.maxUsage}×.`
        : "";

    renderTicketBatch(tickets, {
        title: options.title || "Pakiet wygenerowanych kuponów",
        diversity,
        forcedMainNumbers: [...forcedMainNumbers],
        subtitle: tickets.length < requested
            ? `Udało się utworzyć ${tickets.length} sensownie zróżnicowanych zestawów z ${requested}. Aktywne filtry mogą mocno ograniczać przestrzeń możliwych kuponów. ${diversityText}`
            : `${options.subtitle || "Każdy zestaw przeszedł przez te same aktywne filtry."} ${diversityText}`
    });

    if (tickets.length < requested) {
        alert(
            `⚠️ Wygenerowano ${tickets.length} zróżnicowanych kuponów z ${requested}.\n\n` +
            `Filtry są prawdopodobnie tak ciasne, że nie da się utworzyć pełnego pakietu bez nadmiernego powtarzania tych samych układów.`
        );
    }

    return tickets;
}

function getSectorIndex(number) {
    for (let i = 0; i < currentGame.ranges.length; i++) {
        if (number <= currentGame.ranges[i]) return i;
    }
    return currentGame.ranges.length - 1;
}

function apportionCounts(shares, totalCount) {
    const raw = shares.map(share => share * totalCount);
    const result = raw.map(value => Math.floor(value));
    let remaining = totalCount - result.reduce((a, b) => a + b, 0);

    const order = raw
        .map((value, index) => ({
            index,
            remainder: value - Math.floor(value)
        }))
        .sort((a, b) => b.remainder - a.remainder);

    let cursor = 0;
    while (remaining > 0 && order.length) {
        const index = order[cursor % order.length].index;

        const start = index === 0 ? 1 : currentGame.ranges[index - 1] + 1;
        const end = currentGame.ranges[index];
        const capacity = end - start + 1;

        if (result[index] < capacity) {
            result[index]++;
            remaining--;
        }
        cursor++;

        if (cursor > 1000) break;
    }

    return result;
}

function getHistoricalDrawCount() {
    return currentGame === games.multi ? 20 : currentGame.count;
}

function getSectorBounds(index) {
    const start = index === 0 ? 1 : currentGame.ranges[index - 1] + 1;
    const end = currentGame.ranges[index];
    return { start, end, capacity: end - start + 1 };
}

function getSectorLabel(index) {
    const { start, end } = getSectorBounds(index);
    return `${start}-${end}`;
}

function getAutoForgeBands() {
    if (currentGame === games.multi) {
        return [
            { key: "LOW", label: "LOW", start: 1, end: 29 },
            { key: "MID", label: "MID", start: 30, end: 49 },
            { key: "HIGH", label: "HIGH", start: 50, end: 80 }
        ];
    }

    const lowEnd = Math.floor(currentGame.max / 3);
    const midEnd = Math.floor((currentGame.max * 2) / 3);

    return [
        { key: "LOW", label: "LOW", start: 1, end: lowEnd },
        { key: "MID", label: "MID", start: lowEnd + 1, end: midEnd },
        { key: "HIGH", label: "HIGH", start: midEnd + 1, end: currentGame.max }
    ];
}

function getBandIndex(number) {
    const bands = getAutoForgeBands();
    const index = bands.findIndex(band => number >= band.start && number <= band.end);
    return index >= 0 ? index : bands.length - 1;
}

function getClusterThresholds() {
    if (currentGame === games.multi) {
        return { cluster: 3, strong: 4 };
    }

    return { cluster: 2, strong: 3 };
}

function apportionScoreCounts(scores, totalCount, capacities = []) {
    const safeScores = scores.map(score => Math.max(0, Number(score) || 0));
    const scoreSum = safeScores.reduce((a, b) => a + b, 0);
    const result = new Array(scores.length).fill(0);

    if (totalCount <= 0 || !scores.length) return result;

    const normalized = scoreSum > 0
        ? safeScores.map(score => score / scoreSum)
        : safeScores.map(() => 1 / safeScores.length);

    const raw = normalized.map(share => share * totalCount);

    raw.forEach((value, index) => {
        const capacity = capacities[index] ?? Infinity;
        result[index] = Math.min(Math.floor(value), capacity);
    });

    let remaining = totalCount - result.reduce((a, b) => a + b, 0);
    const order = raw
        .map((value, index) => ({
            index,
            remainder: value - Math.floor(value),
            score: safeScores[index]
        }))
        .sort((a, b) => b.remainder - a.remainder || b.score - a.score);

    let guard = 0;
    while (remaining > 0 && guard < 2000) {
        let placed = false;

        for (const item of order) {
            const capacity = capacities[item.index] ?? Infinity;
            if (result[item.index] < capacity) {
                result[item.index]++;
                remaining--;
                placed = true;
                if (remaining <= 0) break;
            }
        }

        if (!placed) break;
        guard++;
    }

    return result;
}

function getStructureBandAllocation(structure) {
    const bands = getAutoForgeBands();
    const counts = new Array(bands.length).fill(0);

    structure.forEach((quota, sectorIndex) => {
        if (!quota) return;
        const bounds = getSectorBounds(sectorIndex);
        const midpoint = (bounds.start + bounds.end) / 2;
        const bandIndex = getBandIndex(midpoint);
        counts[bandIndex] += quota;
    });

    return bands.map((band, index) => ({
        key: band.key,
        label: band.label,
        count: counts[index]
    }));
}

function concentrateStructure(baseStructure, sectorScores, targetCount, level = "hot") {
    const result = [...baseStructure];
    const capacities = currentGame.ranges.map((_, index) => getSectorBounds(index).capacity);
    const ranking = sectorScores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!ranking.length) return result;

    const receiverCount = currentGame === games.multi
        ? (level === "aggressive" ? 2 : 3)
        : (level === "aggressive" ? 2 : 2);
    const receivers = ranking.slice(0, Math.min(receiverCount, ranking.length));
    const receiverSet = new Set(receivers.map(item => item.index));

    const moveCount = level === "aggressive"
        ? Math.max(2, Math.round(targetCount * 0.30))
        : Math.max(1, Math.round(targetCount * 0.17));

    const maxPerReceiver = currentGame === games.multi
        ? (level === "aggressive" ? Math.min(5, targetCount) : Math.min(4, targetCount))
        : (level === "aggressive" ? Math.min(4, targetCount) : Math.min(3, targetCount));

    let receiverCursor = 0;
    for (let move = 0; move < moveCount; move++) {
        const donors = ranking
            .slice()
            .reverse()
            .filter(item => result[item.index] > 0 && !receiverSet.has(item.index));

        // Jeśli cały kupon już siedzi w najmocniejszych sektorach, można jeszcze
        // przesunąć jedną kulę z najsłabszego z nich do lidera, ale nie opróżniamy
        // drugiego ogniska do zera.
        if (!donors.length) {
            donors.push(...ranking
                .slice()
                .reverse()
                .filter(item => result[item.index] > 1 && item.index !== receivers[0]?.index));
        }

        let receiver = null;
        for (let attempt = 0; attempt < receivers.length; attempt++) {
            const candidate = receivers[(receiverCursor + attempt) % receivers.length];
            if (
                result[candidate.index] < capacities[candidate.index] &&
                result[candidate.index] < maxPerReceiver
            ) {
                receiver = candidate;
                receiverCursor = (receiverCursor + attempt + 1) % Math.max(1, receivers.length);
                break;
            }
        }

        const donor = donors.find(item => item.index !== receiver?.index);
        if (!receiver || !donor) break;

        result[donor.index]--;
        result[receiver.index]++;
    }

    return result;
}

function parseStructureKey(structureKey) {
    const parts = String(structureKey || "")
        .split("-")
        .map(value => Number(value));

    if (
        parts.length !== currentGame.ranges.length ||
        parts.some(value => !Number.isInteger(value) || value < 0)
    ) {
        return null;
    }

    return parts;
}

function scaleObservedStructureToTarget(structure, targetCount, sectorScores = []) {
    const source = Array.isArray(structure)
        ? structure.map(value => Math.max(0, Number(value) || 0))
        : [];

    if (!source.length) return [];

    const sourceTotal = source.reduce((a, b) => a + b, 0);
    if (sourceTotal === targetCount) return [...source];

    const capacities = currentGame.ranges.map((_, index) => getSectorBounds(index).capacity);
    const maxSectorScore = Math.max(0.0001, ...sectorScores.map(value => Number(value) || 0));
    const weightedSource = source.map((count, index) => {
        if (count <= 0) return 0;
        const sectorBoost = sectorScores.length
            ? 1 + ((Number(sectorScores[index]) || 0) / maxSectorScore) * 0.08
            : 1;
        return count * sectorBoost;
    });

    const result = apportionScoreCounts(weightedSource, targetCount, capacities);
    let total = result.reduce((a, b) => a + b, 0);

    if (total < targetCount) {
        const fallback = sectorScores
            .map((score, index) => ({ score: Number(score) || 0, index }))
            .sort((a, b) => b.score - a.score || a.index - b.index);

        for (const item of fallback) {
            while (total < targetCount && result[item.index] < capacities[item.index]) {
                result[item.index]++;
                total++;
            }
            if (total >= targetCount) break;
        }
    }

    return result;
}

function getStructureTrendMetrics(sample, structureKey) {
    const flags = (Array.isArray(sample) ? sample : []).map(draw =>
        getStructureForNumbers(draw.liczby || []) === structureKey ? 1 : 0
    );

    if (!flags.length) {
        return {
            olderRate: 0,
            newerRate: 0,
            delta: 0,
            direction: 0,
            directionText: "→ STABILNIE",
            directionShort: "→",
            drawsAgo: null,
            currentStreak: 0,
            maxStreak: 0,
            recencyScore: 0,
            trendScore: 0.5
        };
    }

    const split = Math.max(1, Math.floor(flags.length / 2));
    const older = flags.slice(0, split);
    const newer = flags.slice(split);
    const olderRate = average(older);
    const newerRate = newer.length ? average(newer) : olderRate;
    const delta = newerRate - olderRate;
    const threshold = Math.max(0.08, 0.45 / Math.max(2, flags.length));
    const direction = delta > threshold ? 1 : delta < -threshold ? -1 : 0;

    let lastIndex = -1;
    for (let i = flags.length - 1; i >= 0; i--) {
        if (flags[i]) {
            lastIndex = i;
            break;
        }
    }

    const drawsAgo = lastIndex >= 0 ? flags.length - 1 - lastIndex : null;
    let currentStreak = 0;
    for (let i = flags.length - 1; i >= 0 && flags[i]; i--) currentStreak++;

    let maxStreak = 0;
    let run = 0;
    flags.forEach(flag => {
        if (flag) {
            run++;
            maxStreak = Math.max(maxStreak, run);
        } else {
            run = 0;
        }
    });

    const recencyScore = drawsAgo === null
        ? 0
        : clamp(1 - drawsAgo / Math.max(1, flags.length - 1), 0, 1);
    const trendScore = clamp(0.5 + delta * 1.4, 0, 1);

    return {
        olderRate,
        newerRate,
        delta,
        direction,
        directionText: direction > 0 ? "↑ W GÓRĘ" : direction < 0 ? "↓ W DÓŁ" : "→ STABILNIE",
        directionShort: direction > 0 ? "↑" : direction < 0 ? "↓" : "→",
        drawsAgo,
        currentStreak,
        maxStreak,
        recencyScore,
        trendScore
    };
}

function buildObservedStructureRanking(draws, requestedWindows, weights, sectorScores = [], targetCount = getHistoricalDrawCount()) {
    const sourceDraws = (Array.isArray(draws) ? draws : [])
        .filter(draw => Array.isArray(draw.liczby) && draw.liczby.length);

    if (!sourceDraws.length) return [];

    const safeWindows = (Array.isArray(requestedWindows) ? requestedWindows : [sourceDraws.length])
        .map(size => Math.max(1, Math.min(Number(size) || sourceDraws.length, sourceDraws.length)));
    const safeWeights = safeWindows.map((_, index) => Number(weights?.[index]) || 0);
    const weightTotal = safeWeights.reduce((a, b) => a + b, 0) || 1;
    const maxWindow = Math.max(...safeWindows);
    const anchorSample = sourceDraws.slice(-maxWindow);
    const structureKeys = [...new Set(anchorSample.map(draw => getStructureForNumbers(draw.liczby || [])))];
    const maxSectorScore = sectorScores.length
        ? Math.max(0.0001, ...sectorScores.map(value => Number(value) || 0))
        : 1;

    return structureKeys.map(structureKey => {
        const rawStructure = parseStructureKey(structureKey) || [];
        const windowDetails = safeWindows.map((windowSize, index) => {
            const sample = sourceDraws.slice(-windowSize);
            const count = sample.filter(draw => getStructureForNumbers(draw.liczby || []) === structureKey).length;
            return {
                windowSize,
                count,
                rate: sample.length ? count / sample.length : 0,
                weight: safeWeights[index]
            };
        });

        const weightedRate = windowDetails.reduce(
            (sum, item) => sum + item.rate * item.weight,
            0
        ) / weightTotal;

        const count = anchorSample.filter(
            draw => getStructureForNumbers(draw.liczby || []) === structureKey
        ).length;
        const rate = anchorSample.length ? count / anchorSample.length : 0;
        const trend = getStructureTrendMetrics(anchorSample, structureKey);
        const targetStructure = scaleObservedStructureToTarget(rawStructure, targetCount, sectorScores);
        const sectorFit = targetStructure.length
            ? targetStructure.reduce((sum, quota, index) => {
                const normalized = sectorScores.length
                    ? (Number(sectorScores[index]) || 0) / maxSectorScore
                    : 0.5;
                return sum + quota * normalized;
            }, 0) / Math.max(1, targetCount)
            : 0;

        const score =
            weightedRate * 60 +
            trend.recencyScore * 15 +
            trend.trendScore * 10 +
            clamp(trend.maxStreak / 3, 0, 1) * 5 +
            sectorFit * 10;

        return {
            key: structureKey,
            structure: rawStructure,
            targetStructure,
            count,
            windowSize: anchorSample.length,
            rate,
            weightedRate,
            score,
            sectorFit,
            trend,
            windowDetails
        };
    }).sort((a, b) =>
        b.weightedRate - a.weightedRate ||
        b.count - a.count ||
        b.score - a.score ||
        b.trend.recencyScore - a.trend.recencyScore ||
        a.key.localeCompare(b.key)
    );
}

function buildAutoForgeStructureProfiles(baseStructure, sectorScores, targetCount, activityRanking = []) {
    const labels = [
        {
            key: "profile",
            label: "PROFILOWY",
            icon: "🧭",
            fallbackDescription: "Najlepiej potwierdzona struktura w danych z wybranego horyzontu."
        },
        {
            key: "hot",
            label: "GORĄCY",
            icon: "🔥",
            fallbackDescription: "Druga aktualnie gorąca struktura — realna alternatywa z danych."
        },
        {
            key: "aggressive",
            label: "ALTERNATYWNY",
            icon: "⚡",
            fallbackDescription: "Trzecia wysoko sklasyfikowana struktura, używana jako zapasowy wariant."
        }
    ];

    const observed = [];
    const seenTargetStructures = new Set();

    activityRanking.forEach(item => {
        const targetStructure = Array.isArray(item.targetStructure)
            ? [...item.targetStructure]
            : [];
        if (!targetStructure.length) return;
        const key = targetStructure.join("-");
        if (seenTargetStructures.has(key)) return;
        seenTargetStructures.add(key);
        observed.push({ ...item, targetStructure });
    });

    const fallbackStructures = [
        [...baseStructure],
        concentrateStructure(baseStructure, sectorScores, targetCount, "hot"),
        concentrateStructure(baseStructure, sectorScores, targetCount, "aggressive")
    ];

    const profiles = labels.map((meta, index) => {
        const activity = observed[index] || null;
        const structure = activity?.targetStructure || fallbackStructures[index];
        const rawStructureText = activity?.key || structure.join("-");
        const scaledText = structure.join("-");
        const scaleNote = rawStructureText !== scaledText
            ? ` • przeskalowano do ${targetCount} typów: ${scaledText}`
            : "";
        const description = activity
            ? `${meta.fallbackDescription} Wystąpienia ${activity.count}/${activity.windowSize} (${Math.round(activity.rate * 100)}%) • trend ${activity.trend.directionText}${activity.trend.currentStreak >= 2 ? ` • seria ${activity.trend.currentStreak}` : ""}${scaleNote}.`
            : `${meta.fallbackDescription} Brak trzeciej unikalnej struktury w danych — użyto awaryjnego szkicu sektorowego.`;

        return {
            ...meta,
            description,
            structure: [...structure],
            sourceStructure: rawStructureText,
            activity
        };
    });

    return profiles.map(profile => ({
        ...profile,
        bandAllocation: getStructureBandAllocation(profile.structure)
    }));
}

function analyzeAutoForgeWindow(draws, windowSize) {
    const sample = draws.slice(-Math.min(windowSize, draws.length));
    const sectorCount = currentGame.ranges.length;
    const bands = getAutoForgeBands();
    const thresholds = getClusterThresholds();

    const numberHits = new Array(currentGame.max + 1).fill(0);
    const sectorHits = new Array(sectorCount).fill(0);
    const sectorEvenHits = new Array(sectorCount).fill(0);
    const sectorClusterDraws = new Array(sectorCount).fill(0);
    const sectorStrongClusterDraws = new Array(sectorCount).fill(0);
    const sectorMax = new Array(sectorCount).fill(0);

    const bandHits = new Array(bands.length).fill(0);
    const bandEvenHits = new Array(bands.length).fill(0);

    let totalNumbers = 0;
    let evenNumbers = 0;
    const drawMeans = [];

    sample.forEach(draw => {
        const validNumbers = (draw.liczby || []).filter(
            n => Number.isInteger(n) && n >= 1 && n <= currentGame.max
        );

        if (!validNumbers.length) return;

        const drawSectorCounts = new Array(sectorCount).fill(0);

        validNumbers.forEach(number => {
            const sectorIndex = getSectorIndex(number);
            const bandIndex = getBandIndex(number);

            numberHits[number]++;
            sectorHits[sectorIndex]++;
            drawSectorCounts[sectorIndex]++;
            bandHits[bandIndex]++;
            totalNumbers++;

            if (number % 2 === 0) {
                evenNumbers++;
                sectorEvenHits[sectorIndex]++;
                bandEvenHits[bandIndex]++;
            }
        });

        drawSectorCounts.forEach((count, index) => {
            sectorMax[index] = Math.max(sectorMax[index], count);
            if (count >= thresholds.cluster) sectorClusterDraws[index]++;
            if (count >= thresholds.strong) sectorStrongClusterDraws[index]++;
        });

        drawMeans.push(
            validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length
        );
    });

    const frequencies = numberHits.map((hits, number) => {
        if (number === 0 || sample.length === 0) return 0;
        return hits / sample.length;
    });

    const sectorShares = sectorHits.map(
        hits => totalNumbers ? hits / totalNumbers : 0
    );

    const sectorAverageCounts = sectorHits.map(
        hits => sample.length ? hits / sample.length : 0
    );

    const sectorClusterRates = sectorClusterDraws.map(
        hits => sample.length ? hits / sample.length : 0
    );

    const sectorStrongClusterRates = sectorStrongClusterDraws.map(
        hits => sample.length ? hits / sample.length : 0
    );

    const sectorEvenShares = sectorHits.map((hits, index) =>
        hits ? sectorEvenHits[index] / hits : 0.5
    );

    const bandShares = bandHits.map(
        hits => totalNumbers ? hits / totalNumbers : 0
    );

    const bandAverageCounts = bandHits.map(
        hits => sample.length ? hits / sample.length : 0
    );

    const bandEvenShares = bandHits.map((hits, index) =>
        hits ? bandEvenHits[index] / hits : 0.5
    );

    return {
        windowSize: sample.length,
        frequencies,
        sectorShares,
        sectorAverageCounts,
        sectorClusterRates,
        sectorStrongClusterRates,
        sectorMax,
        sectorEvenShares,
        bandShares,
        bandAverageCounts,
        bandEvenShares,
        evenShare: totalNumbers ? evenNumbers / totalNumbers : 0.5,
        meanNumber: drawMeans.length ? average(drawMeans) : (currentGame.max + 1) / 2,
        meanSpread: standardDeviation(drawMeans)
    };
}

function getAutoForgeWindowConfig() {
    if (String(autoForgeMode).startsWith("single-")) {
        const size = Number(String(autoForgeMode).replace("single-", ""));
        const safeSize = Number.isInteger(size) && size > 0 ? size : 15;
        const patternSize = currentGame === games.multi ? Math.min(safeSize, 60) : safeSize;

        return {
            requestedWindows: [safeSize],
            weights: [1],
            patternWindows: [patternSize],
            patternWeights: [1],
            label: `Tylko ${safeSize}`,
            windowsLabel: `${safeSize}`
        };
    }

    const preset = getAutoForgePreset(autoForgeMode) || getAutoForgePreset("auto");
    const requestedWindows = [...preset.windows];
    const weights = [...preset.weights];
    const patternWindows = [...(preset.patternWindows || preset.windows)];
    const patternWeights = [...(preset.patternWeights || preset.weights)];

    return {
        requestedWindows,
        weights,
        patternWindows,
        patternWeights,
        label: `${preset.name} • ${requestedWindows.join(" / ")}`,
        windowsLabel: requestedWindows.join(" / ")
    };
}


function getValidDrawNumbers(draw) {
    return [...new Set((draw?.liczby || []).filter(
        n => Number.isInteger(n) && n >= 1 && n <= currentGame.max
    ))].sort((a, b) => a - b);
}

function getCombinationKey(numbers) {
    return [...numbers].sort((a, b) => a - b).join("|");
}

function forEachCombination(numbers, size, callback) {
    if (!Array.isArray(numbers) || size <= 0 || numbers.length < size) return;

    const picked = [];
    function walk(start) {
        if (picked.length === size) {
            callback(picked);
            return;
        }

        const missing = size - picked.length;
        for (let i = start; i <= numbers.length - missing; i++) {
            picked.push(numbers[i]);
            walk(i + 1);
            picked.pop();
        }
    }

    walk(0);
}

function addMapScore(map, key, value) {
    map.set(key, (map.get(key) || 0) + value);
}

function getMaxMapValue(map) {
    let maxValue = 0;
    map.forEach(value => {
        if (value > maxValue) maxValue = value;
    });
    return maxValue;
}

function normalizeVector01(values) {
    const maxValue = Math.max(...values.slice(1), 0);
    if (maxValue <= 0) return values.map(() => 0);
    return values.map((value, index) => index === 0 ? 0 : value / maxValue);
}

function buildAutoForgePatternModel(draws, requestedWindows, weights) {
    const max = currentGame.max;
    const returnScores = new Array(max + 1).fill(0);
    const pairScores = new Map();
    const tripleScores = new Map();
    const quadScores = new Map();

    let weightedAverageReturns = 0;
    let totalWeight = 0;

    requestedWindows.forEach((windowSize, index) => {
        const sample = draws
            .slice(-Math.min(windowSize, draws.length))
            .map(draw => getValidDrawNumbers(draw))
            .filter(numbers => numbers.length > 0);

        if (!sample.length) return;

        const weight = weights[index] ?? 0;
        totalWeight += weight;

        const opportunities = new Array(max + 1).fill(0);
        const returned = new Array(max + 1).fill(0);
        let overlapTotal = 0;
        let transitionCount = 0;

        for (let i = 0; i < sample.length - 1; i++) {
            const previous = sample[i];
            const nextSet = new Set(sample[i + 1]);
            let overlap = 0;

            previous.forEach(number => {
                opportunities[number]++;
                if (nextSet.has(number)) {
                    returned[number]++;
                    overlap++;
                }
            });

            overlapTotal += overlap;
            transitionCount++;
        }

        for (let n = 1; n <= max; n++) {
            const rate = opportunities[n] ? returned[n] / opportunities[n] : 0;
            returnScores[n] += rate * weight;
        }

        const averageReturns = transitionCount ? overlapTotal / transitionCount : 0;
        weightedAverageReturns += averageReturns * weight;

        const localPairs = new Map();
        const localTriples = new Map();
        const localQuads = new Map();

        sample.forEach(numbers => {
            forEachCombination(numbers, 2, combo => {
                const key = getCombinationKey(combo);
                localPairs.set(key, (localPairs.get(key) || 0) + 1);
            });

            forEachCombination(numbers, 3, combo => {
                const key = getCombinationKey(combo);
                localTriples.set(key, (localTriples.get(key) || 0) + 1);
            });

            // Czwórki są sygnałem pomocniczym. Przy Multi (20 kul) nadal liczymy
            // na oknach przekazanych przez profil AUTO FORGE.
            forEachCombination(numbers, 4, combo => {
                const key = getCombinationKey(combo);
                localQuads.set(key, (localQuads.get(key) || 0) + 1);
            });
        });

        const denominator = Math.max(1, sample.length);
        localPairs.forEach((count, key) => addMapScore(pairScores, key, (count / denominator) * weight));
        localTriples.forEach((count, key) => addMapScore(tripleScores, key, (count / denominator) * weight));
        localQuads.forEach((count, key) => addMapScore(quadScores, key, (count / denominator) * weight));
    });

    if (totalWeight > 0) {
        for (let n = 1; n <= max; n++) returnScores[n] /= totalWeight;
        weightedAverageReturns /= totalWeight;
        [pairScores, tripleScores, quadScores].forEach(map => {
            map.forEach((value, key) => map.set(key, value / totalWeight));
        });
    }

    const pairCentralityRaw = new Array(max + 1).fill(0);
    const tripleCentralityRaw = new Array(max + 1).fill(0);
    const quadCentralityRaw = new Array(max + 1).fill(0);

    pairScores.forEach((score, key) => {
        key.split("|").map(Number).forEach(n => pairCentralityRaw[n] += score);
    });
    tripleScores.forEach((score, key) => {
        key.split("|").map(Number).forEach(n => tripleCentralityRaw[n] += score);
    });
    quadScores.forEach((score, key) => {
        key.split("|").map(Number).forEach(n => quadCentralityRaw[n] += score);
    });

    return {
        latestNumbers: draws.length ? getValidDrawNumbers(draws[draws.length - 1]) : [],
        returnScores,
        averageReturnCount: weightedAverageReturns,
        pairScores,
        tripleScores,
        quadScores,
        pairCentrality: normalizeVector01(pairCentralityRaw),
        tripleCentrality: normalizeVector01(tripleCentralityRaw),
        quadCentrality: normalizeVector01(quadCentralityRaw),
        maxPairScore: getMaxMapValue(pairScores),
        maxTripleScore: getMaxMapValue(tripleScores),
        maxQuadScore: getMaxMapValue(quadScores)
    };
}

function getTopPatternEntries(scoreMap, allowedNumbers = null, limit = 5, structure = null) {
    const allowedSet = allowedNumbers instanceof Set ? allowedNumbers : null;

    return [...scoreMap.entries()]
        .map(([key, score]) => ({
            numbers: key.split("|").map(Number),
            score
        }))
        .filter(item => {
            if (allowedSet && !item.numbers.every(number => allowedSet.has(number))) {
                return false;
            }

            if (Array.isArray(structure)) {
                const used = new Array(structure.length).fill(0);
                for (const number of item.numbers) {
                    const sector = getSectorIndex(number);
                    used[sector]++;
                    if (used[sector] > (structure[sector] || 0)) return false;
                }
            }

            return true;
        })
        .sort((a, b) => b.score - a.score || a.numbers.join("-").localeCompare(b.numbers.join("-")))
        .slice(0, limit);
}

function getPatternScore(scoreMap, numbers) {
    if (!scoreMap || !numbers?.length) return 0;
    return scoreMap.get(getCombinationKey(numbers)) || 0;
}

function getAutoForgeTemperatureBudget(targetCount = getAutoForgeTargetCount()) {
    const count = Math.max(0, Number(targetCount) || 0);

    // Docelowy miks dla AUTO FORGE. Dla najczęściej używanych wielkości
    // stosujemy gotowe proporcje, żeby HOT nie zjadał całego kuponu.
    // Układ jest zbliżony do 45% HOT / 35% MID / 20% COLD+.
    const presets = {
        0: [0, 0, 0],
        1: [1, 0, 0],
        2: [1, 1, 0],
        3: [1, 1, 1],
        4: [2, 1, 1],
        5: [2, 2, 1],
        6: [3, 2, 1],
        7: [3, 3, 1],
        8: [3, 3, 2],
        9: [4, 3, 2],
        10: [5, 3, 2],
        11: [5, 4, 2],
        12: [5, 4, 3]
    };

    if (presets[count]) {
        const [hot, mid, promising] = presets[count];
        return { hot, mid, promising, total: count };
    }

    const raw = {
        hot: count * 0.45,
        mid: count * 0.35,
        promising: count * 0.20
    };
    const result = {
        hot: Math.floor(raw.hot),
        mid: Math.floor(raw.mid),
        promising: Math.floor(raw.promising)
    };
    let remaining = count - result.hot - result.mid - result.promising;
    const order = [
        { key: "promising", fraction: raw.promising - Math.floor(raw.promising), priority: 3 },
        { key: "mid", fraction: raw.mid - Math.floor(raw.mid), priority: 2 },
        { key: "hot", fraction: raw.hot - Math.floor(raw.hot), priority: 1 }
    ].sort((a, b) => b.fraction - a.fraction || b.priority - a.priority);

    let cursor = 0;
    while (remaining > 0) {
        result[order[cursor % order.length].key]++;
        remaining--;
        cursor++;
    }

    return { ...result, total: count };
}

function getAutoForgeTemperatureBudgetText(budget) {
    if (!budget) return "—";
    return `HOT ${budget.hot} • MID ${budget.mid} • COLD+ ${budget.promising}`;
}

function buildAutoForgePromisingColdCandidates({
    coldComebackAnalysis,
    sectorScores,
    focusKeys,
    patternModel,
    direction,
    migrationStrength,
    bands,
    deadExclusionCandidates = []
}) {
    const ranking = coldComebackAnalysis?.currentRanking || [];
    if (!ranking.length) return [];

    const maxSectorScore = Math.max(...(sectorScores || []), 0.0001);
    const deadSet = new Set(deadExclusionCandidates || []);
    const eventsByNumber = new Map();

    (coldComebackAnalysis?.events || []).forEach(event => {
        if (!eventsByNumber.has(event.number)) eventsByNumber.set(event.number, []);
        eventsByNumber.get(event.number).push(event.priorDrought || 0);
    });

    return ranking
        .map(item => {
            const number = item.number;
            const sector = getSectorIndex(number);
            const sectorNorm = clamp((sectorScores?.[sector] || 0) / maxSectorScore, 0, 1);
            const band = bands[getBandIndex(number)];
            const focusFit = focusKeys.includes(band.key) ? 1 : sectorNorm * 0.45;
            const position = ((number - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
            const migrationAlignment = direction === 0
                ? 0.5
                : clamp((1 + direction * position) / 2, 0, 1);

            const baseline = Math.max(0.01, coldComebackAnalysis.config?.hitProbability || 0.10);
            const coldComebackRelative = clamp(item.coldRate / baseline, 0, 1);
            const deadComebackRelative = clamp(item.deadRate / baseline, 0, 1);
            const comebackSignal = item.status === "DEAD"
                ? Math.max(coldComebackRelative * 0.75, deadComebackRelative)
                : coldComebackRelative;

            const relationSignal = clamp(
                (patternModel?.pairCentrality?.[number] || 0) * 0.55 +
                (patternModel?.tripleCentrality?.[number] || 0) * 0.30 +
                (patternModel?.quadCentrality?.[number] || 0) * 0.15,
                0,
                1
            );

            const comebackGaps = eventsByNumber.get(number) || [];
            const averageGap = comebackGaps.length ? average(comebackGaps) : 0;
            const rhythmTolerance = Math.max(2, averageGap * 0.60);
            const rhythmFit = comebackGaps.length
                ? clamp(1 - Math.abs(item.drought - averageGap) / rhythmTolerance, 0, 1)
                : 0;

            const directionFit = clamp(
                focusFit * 0.65 + migrationAlignment * (0.35 + migrationStrength * 0.15),
                0,
                1
            );

            const score = Math.round(clamp(
                sectorNorm * 35 +
                comebackSignal * 25 +
                relationSignal * 20 +
                directionFit * 10 +
                rhythmFit * 10,
                0,
                100
            ));

            return {
                number,
                score,
                status: item.status,
                sector: getSectorLabel(sector),
                sectorNorm,
                coldRate: item.coldRate,
                deadRate: item.deadRate,
                drought: item.drought,
                comebackCount: item.coldComebacks,
                comebackOpportunities: item.coldOpportunities,
                relationSignal,
                rhythmFit,
                averageComebackGap: averageGap,
                protectedFromAutoCut: item.status === "DEAD" && !deadSet.has(number)
            };
        })
        .filter(item => !deadSet.has(item.number))
        .sort((a, b) => b.score - a.score || b.sectorNorm - a.sectorNorm || a.number - b.number);
}

function buildAutoForgeAnalysis() {
    const draws = getCurrentGameDraws();
    const targetCount = getAutoForgeTargetCount();

    if (!draws.length) {
        return {
            ok: false,
            message: "Brak danych losowań. Najpierw zaimportuj CSV dla wybranej gry."
        };
    }

    const windowConfig = getAutoForgeWindowConfig();
    const requestedWindows = windowConfig.requestedWindows;
    const weights = windowConfig.weights;
    const windowAnalyses = requestedWindows.map(size => analyzeAutoForgeWindow(draws, size));
    const sectorCount = currentGame.ranges.length;
    const bands = getAutoForgeBands();
    const thresholds = getClusterThresholds();

    const frequencyScore = new Array(currentGame.max + 1).fill(0);
    const sectorShares = new Array(sectorCount).fill(0);
    const sectorAverageCounts = new Array(sectorCount).fill(0);
    const sectorClusterRates = new Array(sectorCount).fill(0);
    const sectorStrongClusterRates = new Array(sectorCount).fill(0);
    const sectorEvenShares = new Array(sectorCount).fill(0);
    const sectorMax = new Array(sectorCount).fill(0);

    const bandShares = new Array(bands.length).fill(0);
    const bandAverageCounts = new Array(bands.length).fill(0);
    const bandEvenShares = new Array(bands.length).fill(0);

    let meanNumber = 0;
    let totalWeight = 0;

    windowAnalyses.forEach((analysis, idx) => {
        if (!analysis.windowSize) return;

        const weight = weights[idx];
        totalWeight += weight;

        for (let n = 1; n <= currentGame.max; n++) {
            frequencyScore[n] += analysis.frequencies[n] * weight;
        }

        for (let i = 0; i < sectorCount; i++) {
            sectorShares[i] += analysis.sectorShares[i] * weight;
            sectorAverageCounts[i] += analysis.sectorAverageCounts[i] * weight;
            sectorClusterRates[i] += analysis.sectorClusterRates[i] * weight;
            sectorStrongClusterRates[i] += analysis.sectorStrongClusterRates[i] * weight;
            sectorEvenShares[i] += analysis.sectorEvenShares[i] * weight;
            sectorMax[i] = Math.max(sectorMax[i], analysis.sectorMax[i]);
        }

        for (let i = 0; i < bands.length; i++) {
            bandShares[i] += analysis.bandShares[i] * weight;
            bandAverageCounts[i] += analysis.bandAverageCounts[i] * weight;
            bandEvenShares[i] += analysis.bandEvenShares[i] * weight;
        }

        meanNumber += analysis.meanNumber * weight;
    });

    if (!totalWeight) {
        return {
            ok: false,
            message: "Zaimportowane dane nie zawierają poprawnych liczb."
        };
    }

    for (let n = 1; n <= currentGame.max; n++) {
        frequencyScore[n] /= totalWeight;
    }

    for (let i = 0; i < sectorCount; i++) {
        sectorShares[i] /= totalWeight;
        sectorAverageCounts[i] /= totalWeight;
        sectorClusterRates[i] /= totalWeight;
        sectorStrongClusterRates[i] /= totalWeight;
        sectorEvenShares[i] /= totalWeight;
    }

    for (let i = 0; i < bands.length; i++) {
        bandShares[i] /= totalWeight;
        bandAverageCounts[i] /= totalWeight;
        bandEvenShares[i] /= totalWeight;
    }

    meanNumber /= totalWeight;

    // Migracja: porównanie środka planszy w starszej i nowszej części maks. 15 losowań.
    const migrationSample = draws.slice(-Math.min(15, draws.length));
    const centers = migrationSample.map(draw => {
        const nums = (draw.liczby || []).filter(
            n => Number.isInteger(n) && n >= 1 && n <= currentGame.max
        );
        return nums.length ? average(nums) : 0;
    }).filter(Boolean);

    const half = Math.floor(centers.length / 2);
    const olderCenter = half ? average(centers.slice(0, half)) : average(centers);
    const newerCenter = half ? average(centers.slice(half)) : average(centers);
    const migrationDelta = newerCenter - olderCenter;
    const migrationThreshold = Math.max(0.6, currentGame.max * 0.01);
    const direction = migrationDelta > migrationThreshold ? 1 : migrationDelta < -migrationThreshold ? -1 : 0;
    const migrationStrength = clamp(
        Math.abs(migrationDelta) / Math.max(1, currentGame.max * 0.06),
        0,
        1
    );

    const migrationText = direction > 0
        ? `↑ W GÓRĘ (+${migrationDelta.toFixed(1)})`
        : direction < 0
            ? `↓ W DÓŁ (${migrationDelta.toFixed(1)})`
            : `→ STABILNIE (${migrationDelta >= 0 ? "+" : ""}${migrationDelta.toFixed(1)})`;

    // Strefy LOW / MID / HIGH — mierzymy nie tylko udział, ale też intensywność
    // względem szerokości danej strefy.
    const bandStats = bands.map((band, index) => {
        const capacity = band.end - band.start + 1;
        const capacityShare = capacity / currentGame.max;
        const share = bandShares[index];
        const intensity = capacityShare > 0 ? share / capacityShare : 0;

        return {
            ...band,
            share,
            averageCount: bandAverageCounts[index],
            evenShare: bandEvenShares[index],
            capacityShare,
            intensity
        };
    });

    const bandRanking = [...bandStats].sort(
        (a, b) => b.intensity - a.intensity || b.share - a.share
    );
    const dominantBand = bandRanking[0];
    const secondBand = bandRanking[1] || dominantBand;

    let focusKeys;
    if (direction > 0) {
        focusKeys = ["MID", "HIGH"];
    } else if (direction < 0) {
        focusKeys = ["LOW", "MID"];
    } else if (dominantBand.key === "HIGH") {
        focusKeys = ["MID", "HIGH"];
    } else if (dominantBand.key === "LOW") {
        focusKeys = ["LOW", "MID"];
    } else {
        const low = bandStats.find(x => x.key === "LOW");
        const high = bandStats.find(x => x.key === "HIGH");
        focusKeys = (high?.intensity || 0) >= (low?.intensity || 0)
            ? ["MID", "HIGH"]
            : ["LOW", "MID"];
    }

    const focusBands = bandStats.filter(band => focusKeys.includes(band.key));
    const focusRawShare = focusBands.reduce((sum, band) => sum + band.share, 0);
    const focusCapacityShare = focusBands.reduce((sum, band) => sum + band.capacityShare, 0);
    const focusIntensity = focusCapacityShare ? focusRawShare / focusCapacityShare : 1;

    const dominanceSignal = clamp(
        (dominantBand.intensity - secondBand.intensity) / 0.75,
        0,
        1
    );

    const topClusterRates = [...sectorClusterRates].sort((a, b) => b - a).slice(0, 2);
    const clusterSignal = topClusterRates.length ? average(topClusterRates) : 0;
    const focusSignal = clamp((focusIntensity - 1) / 0.45, 0, 1);

    const signalStrength = clamp(
        dominanceSignal * 0.30 +
        migrationStrength * 0.25 +
        clusterSignal * 0.25 +
        focusSignal * 0.20,
        0,
        1
    );

    let focusPercent = Math.round((focusRawShare * 100) + signalStrength * 15);
    focusPercent = clamp(focusPercent, 55, 85);

    const focusTargetCount = clamp(
        Math.round(targetCount * focusPercent / 100),
        Math.min(targetCount, 1),
        targetCount
    );
    const outsideTargetCount = targetCount - focusTargetCount;

    // Punktacja sektorów: obsada + regularność skupisk + silne skupiska + migracja.
    const sectorScores = sectorAverageCounts.map((avgCount, index) => {
        const bounds = getSectorBounds(index);
        const midpoint = (bounds.start + bounds.end) / 2;
        const position = ((midpoint - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
        const migrationFactor = Math.max(
            0.55,
            1 + direction * position * migrationStrength * 0.38
        );
        const clusterFactor =
            1 + sectorClusterRates[index] * 0.75 + sectorStrongClusterRates[index] * 0.90;

        return Math.max(0.001, avgCount) * clusterFactor * migrationFactor;
    });

    const focusSectorIndices = sectorScores
        .map((score, index) => ({ score, index, band: getBandIndex((getSectorBounds(index).start + getSectorBounds(index).end) / 2) }))
        .filter(item => focusKeys.includes(bands[item.band].key))
        .sort((a, b) => b.score - a.score);

    const outsideSectorIndices = sectorScores
        .map((score, index) => ({ score, index, band: getBandIndex((getSectorBounds(index).start + getSectorBounds(index).end) / 2) }))
        .filter(item => !focusKeys.includes(bands[item.band].key))
        .sort((a, b) => b.score - a.score);

    const focusLimit = currentGame === games.multi
        ? (signalStrength >= 0.68 ? 3 : signalStrength >= 0.42 ? 4 : 5)
        : (signalStrength >= 0.55 ? 2 : 3);

    const outsideLimit = currentGame === games.multi ? 2 : 1;
    const selectedFocus = focusSectorIndices.slice(0, Math.min(focusLimit, focusSectorIndices.length));
    const selectedOutside = outsideSectorIndices.slice(0, Math.min(outsideLimit, outsideSectorIndices.length));

    const structure = new Array(sectorCount).fill(0);
    const capacities = currentGame.ranges.map((_, index) => getSectorBounds(index).capacity);
    const power = currentGame === games.multi
        ? 1.65 + signalStrength * 0.85
        : 1.40 + signalStrength * 0.55;

    if (focusTargetCount > 0 && selectedFocus.length) {
        const scores = selectedFocus.map(item => sectorScores[item.index] ** power);
        const caps = selectedFocus.map(item => capacities[item.index]);
        const allocated = apportionScoreCounts(scores, focusTargetCount, caps);
        selectedFocus.forEach((item, idx) => {
            structure[item.index] += allocated[idx];
        });
    }

    if (outsideTargetCount > 0 && selectedOutside.length) {
        const scores = selectedOutside.map(item => sectorScores[item.index] ** power);
        const caps = selectedOutside.map(item => capacities[item.index]);
        const allocated = apportionScoreCounts(scores, outsideTargetCount, caps);
        selectedOutside.forEach((item, idx) => {
            structure[item.index] += allocated[idx];
        });
    }

    // Awaryjnie domykamy strukturę, gdyby wybrana grupa nie miała wystarczającej pojemności.
    let structureTotal = structure.reduce((a, b) => a + b, 0);
    if (structureTotal < targetCount) {
        const fallback = sectorScores
            .map((score, index) => ({ score, index }))
            .sort((a, b) => b.score - a.score);

        for (const item of fallback) {
            while (structureTotal < targetCount && structure[item.index] < capacities[item.index]) {
                structure[item.index]++;
                structureTotal++;
            }
            if (structureTotal >= targetCount) break;
        }
    }

    const activeSectors = sectorScores
        .map((score, index) => ({
            index,
            label: getSectorLabel(index),
            score,
            averageCount: sectorAverageCounts[index],
            clusterRate: sectorClusterRates[index],
            strongClusterRate: sectorStrongClusterRates[index],
            maxCluster: sectorMax[index],
            evenShare: sectorEvenShares[index],
            suggested: structure[index]
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, currentGame === games.multi ? 5 : 3);

    const focusSectorSet = new Set(
        currentGame.ranges
            .map((_, index) => index)
            .filter(index => {
                const bounds = getSectorBounds(index);
                const midpoint = (bounds.start + bounds.end) / 2;
                return focusKeys.includes(bands[getBandIndex(midpoint)].key);
            })
    );

    let focusEvenWeighted = 0;
    let focusWeight = 0;
    focusSectorSet.forEach(index => {
        const weight = sectorAverageCounts[index];
        focusEvenWeighted += sectorEvenShares[index] * weight;
        focusWeight += weight;
    });
    const focusEvenShare = focusWeight ? focusEvenWeighted / focusWeight : 0.5;
    const suggestedEven = clamp(Math.round(focusEvenShare * targetCount), 0, targetCount);
    const suggestedOdd = targetCount - suggestedEven;

    // ETAP 4: relacje między liczbami. Trend stref/sektorów może korzystać z bardzo
    // długich okien, natomiast w Multi relacje par / trójek / czwórek dostają
    // osobne, krótsze okna. Dzięki temu profile 100/200/300 nie zamrażają UI.
    const patternWindows = windowConfig.patternWindows || requestedWindows;
    const patternWeights = windowConfig.patternWeights || weights;
    const patternModel = buildAutoForgePatternModel(
        draws,
        patternWindows,
        patternWeights
    );

    // HOT / COLD pozostają czystą klasyfikacją trendu częstotliwościowego.
    // To ważne: etykieta HOT nie może oznaczać "wszystkiego, co wysoko punktowane".
    const trendRankedNumbers = [];
    for (let n = 1; n <= currentGame.max; n++) {
        const position = ((n - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
        const migrationBonus = direction * position * migrationStrength * 0.06;
        trendRankedNumbers.push({
            number: n,
            score: frequencyScore[n] + migrationBonus
        });
    }
    trendRankedNumbers.sort((a, b) => b.score - a.score || a.number - b.number);

    const hotPoolSize = currentGame === games.multi ? 10 : 5;
    const coldPoolSize = currentGame === games.multi ? 10 : 5;
    const hotPool = trendRankedNumbers
        .slice(0, Math.min(hotPoolSize, trendRankedNumbers.length))
        .map(x => x.number);
    const hotSet = new Set(hotPool);
    const coldPool = [...trendRankedNumbers]
        .reverse()
        .map(x => x.number)
        .filter(n => !hotSet.has(n))
        .slice(0, Math.min(coldPoolSize, trendRankedNumbers.length));
    const coldSet = new Set(coldPool);

    // Twarde wykluczenie AUTO FORGE nie opiera się już na zwykłym TOP COLD.
    // Kandydat musi być aktualnie DEAD i historycznie rzadko wracać po stanie DEAD.
    const coldComebackAnalysis = buildStatsColdComebackAnalysis(
        draws,
        Math.max(...requestedWindows, 20)
    );
    const deadExclusionCandidates = (coldComebackAnalysis.currentRanking || [])
        .filter(item => {
            const enoughDeadHistory = item.deadOpportunities >= 3;
            const lowDeadComebackRate = item.deadRate <= coldComebackAnalysis.config.hitProbability * 0.50;

            return (
                item.status === "DEAD" &&
                item.exclusionScore >= 78 &&
                enoughDeadHistory &&
                lowDeadComebackRate
            );
        })
        .map(item => item.number);

    // COLD+ = zimna liczba, która mimo słabszej częstotliwości ma argumenty do powrotu:
    // aktywny sektor, historyczne comebacki, relacje, zgodność z kierunkiem i rytm przerwy.
    // Nie każdy COLD dostaje ten status i żaden twardy AUTO CUT nie może być COLD+.
    const promisingColdCandidates = buildAutoForgePromisingColdCandidates({
        coldComebackAnalysis,
        sectorScores,
        focusKeys,
        patternModel,
        direction,
        migrationStrength,
        bands,
        deadExclusionCandidates
    });
    const promisingColdThreshold = 55;
    const promisingColdPool = promisingColdCandidates
        .filter(item => item.score >= promisingColdThreshold)
        .map(item => item.number);
    const promisingColdMap = new Map(
        promisingColdCandidates.map(item => [item.number, item])
    );
    const promisingColdSet = new Set(promisingColdPool);

    // MID to środek rankingu: nie HOT, nie TOP COLD i nie COLD+.
    // Dzięki osobnemu koszykowi MID nie konkuruje bezpośrednio z premią HOT.
    const midPool = [];
    for (let n = 1; n <= currentGame.max; n++) {
        if (!hotSet.has(n) && !coldSet.has(n) && !promisingColdSet.has(n)) {
            midPool.push(n);
        }
    }

    const temperatureBudget = getAutoForgeTemperatureBudget(targetCount);

    // AUTO SCORE konkretnej liczby. Geografia planszy ma najwyższy priorytet,
    // potem status temperatury, powroty i relacje. Sam status HOT nie może już
    // wygrywać całego kuponu — liczbę miejsc kontroluje osobny budżet HOT/MID/COLD+.
    const maxSectorScore = Math.max(...sectorScores, 0.0001);
    const maxFrequency = Math.max(...frequencyScore.slice(1), 0.0001);
    const latestSet = new Set(patternModel.latestNumbers);
    const numberScores = new Array(currentGame.max + 1).fill(0);
    const numberComponents = new Array(currentGame.max + 1).fill(null);
    const rankedNumbers = [];

    for (let n = 1; n <= currentGame.max; n++) {
        const sector = getSectorIndex(n);
        const band = bands[getBandIndex(n)];
        const position = ((n - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
        const sectorNorm = sectorScores[sector] / maxSectorScore;
        const frequencyNorm = frequencyScore[n] / maxFrequency;
        const isHot = hotSet.has(n);
        const isCold = coldSet.has(n);
        const isPromisingCold = promisingColdSet.has(n);
        const promisingCold = promisingColdMap.get(n) || null;
        const isLatest = latestSet.has(n);

        const sectorComponent = sectorNorm * 35;
        // HOT dostaje premię, ale dużo mniejszą niż wcześniej — o liczbie miejsc HOT
        // decyduje teraz budżet temperatury. COLD+ dostaje własny bonus za jakość
        // comebacku, a zwykły COLD nadal tylko miękką karę zależną od sektora.
        const coldPenalty = -18 * (1 - 0.85 * sectorNorm);
        const promisingBonus = isPromisingCold
            ? (promisingCold?.score || 0) / 100 * 12
            : 0;
        const hotColdComponent = isHot
            ? 11
            : isPromisingCold
                ? (-4 * (1 - sectorNorm) + promisingBonus)
                : isCold
                    ? coldPenalty
                    : frequencyNorm * 10;
        const returnComponent = isLatest ? patternModel.returnScores[n] * 15 : 0;
        const pairComponent = patternModel.pairCentrality[n] * 12;
        const tripleComponent = patternModel.tripleCentrality[n] * 7;
        const quadComponent = patternModel.quadCentrality[n] * 3;
        const migrationAlignment = direction === 0
            ? 0.5
            : clamp((1 + direction * position) / 2, 0, 1);
        const migrationComponent = migrationAlignment * migrationStrength * 5;
        const parityFit = n % 2 === 0
            ? sectorEvenShares[sector]
            : 1 - sectorEvenShares[sector];
        const parityComponent = parityFit * 3;
        const focusComponent = focusKeys.includes(band.key) ? 5 : 0;

        const total = Math.max(
            0.01,
            sectorComponent + hotColdComponent + returnComponent + pairComponent +
            tripleComponent + quadComponent + migrationComponent + parityComponent + focusComponent
        );

        numberScores[n] = total;
        numberComponents[n] = {
            total,
            sector: sectorComponent,
            hotCold: hotColdComponent,
            return: returnComponent,
            pair: pairComponent,
            triple: tripleComponent,
            quad: quadComponent,
            migration: migrationComponent,
            parity: parityComponent,
            focus: focusComponent,
            status: isHot ? "HOT" : isPromisingCold ? "COLD+" : isCold ? "COLD" : "MID",
            promisingColdScore: promisingCold?.score || 0,
            returnRate: isLatest ? patternModel.returnScores[n] : 0,
            isLatest
        };
        rankedNumbers.push({ number: n, score: total });
    }
    rankedNumbers.sort((a, b) => b.score - a.score || a.number - b.number);

    const sectorModelStructure = [...structure];
    const structureActivityRanking = buildObservedStructureRanking(
        draws,
        requestedWindows,
        weights,
        sectorScores,
        targetCount
    );

    // Główna zasada po audycie 07.09.2026:
    // AUTO FORGE nie wymyśla struktury ponad dane. Najpierw wybiera lidera
    // rzeczywiście obserwowanych struktur, a sektorowy model służy jako tie-breaker
    // i awaryjne tło. Dla systemów / Multi struktura jest proporcjonalnie skalowana.
    if (structureActivityRanking.length) {
        const leaderStructure = structureActivityRanking[0].targetStructure;
        structure.splice(0, structure.length, ...leaderStructure);
    }

    activeSectors.forEach(sector => {
        sector.suggested = structure[sector.index] || 0;
    });

    // Po wyborze realnego lidera aktualizujemy również banner koncentracji,
    // żeby raport nie pokazywał starego sektorowego szkicu obok nowej struktury.
    const selectedBandAllocation = getStructureBandAllocation(structure);
    const selectedFocusTargetCount = selectedBandAllocation
        .filter(item => focusKeys.includes(item.key))
        .reduce((sum, item) => sum + item.count, 0);
    const selectedFocusPercent = targetCount
        ? Math.round((selectedFocusTargetCount / targetCount) * 100)
        : 0;
    const selectedOutsideTargetCount = targetCount - selectedFocusTargetCount;

    const structureProfiles = buildAutoForgeStructureProfiles(
        structure,
        sectorScores,
        targetCount,
        structureActivityRanking
    );

    const activeNumberSet = new Set();
    // Relacje pokazujemy dla unii sektorów używanych przez wszystkie trzy profile,
    // żeby raport nie faworyzował tylko wariantu profilowego.
    const activeStructureUnion = new Array(structure.length).fill(0);
    structureProfiles.forEach(profile => {
        profile.structure.forEach((quota, index) => {
            activeStructureUnion[index] = Math.max(activeStructureUnion[index], quota);
        });
    });
    activeStructureUnion.forEach((quota, sectorIndex) => {
        if (quota <= 0) return;
        const bounds = getSectorBounds(sectorIndex);
        for (let n = bounds.start; n <= bounds.end; n++) activeNumberSet.add(n);
    });

    const topPairs = getTopPatternEntries(patternModel.pairScores, activeNumberSet, 5, activeStructureUnion);
    const topTriples = getTopPatternEntries(patternModel.tripleScores, activeNumberSet, 4, activeStructureUnion);
    const topQuads = getTopPatternEntries(patternModel.quadScores, activeNumberSet, 3, activeStructureUnion);

    const repeatCandidates = patternModel.latestNumbers
        .filter(number => activeNumberSet.has(number))
        .map(number => ({
            number,
            rate: patternModel.returnScores[number],
            score: numberScores[number]
        }))
        .sort((a, b) => b.rate - a.rate || b.score - a.score)
        .slice(0, currentGame === games.multi ? 7 : 4);

    const suggestedReturnCount = clamp(
        Math.round(
            patternModel.averageReturnCount *
            (targetCount / Math.max(1, getHistoricalDrawCount()))
        ),
        0,
        Math.min(targetCount, repeatCandidates.length)
    );

    // Spójność wybranego profilu okien — to nie jest prawdopodobieństwo trafienia.
    let sectorDispersion = 0;
    for (let sector = 0; sector < sectorCount; sector++) {
        const values = windowAnalyses
            .filter(x => x.windowSize)
            .map(x => x.sectorShares[sector]);
        sectorDispersion += standardDeviation(values);
    }
    sectorDispersion /= Math.max(1, sectorCount);

    let bandDispersion = 0;
    for (let band = 0; band < bands.length; band++) {
        const values = windowAnalyses
            .filter(x => x.windowSize)
            .map(x => x.bandShares[band]);
        bandDispersion += standardDeviation(values);
    }
    bandDispersion /= Math.max(1, bands.length);

    const confidence = Math.round(clamp(
        94 - sectorDispersion * 190 - bandDispersion * 150,
        35,
        95
    ));

    const recentStructures = draws
        .slice(-Math.min(5, draws.length))
        .reverse()
        .map(draw => ({
            date: draw.data,
            structure: getStructureForNumbers(draw.liczby || [])
        }));

    return {
        ok: true,
        targetCount,
        modeLabel: windowConfig.label,
        windowsUsed: windowAnalyses.map(x => x.windowSize).join(" / "),
        patternWindowsLabel: (windowConfig.patternWindows || requestedWindows).join(" / "),
        migrationText,
        migrationDelta,
        migrationStrength,
        direction,
        confidence,
        thresholds,
        bandStats,
        dominantBand,
        focusKeys,
        focusZone: focusKeys.join("/"),
        focusRawShare,
        focusIntensity,
        focusPercent: selectedFocusPercent,
        focusTargetCount: selectedFocusTargetCount,
        outsideTargetCount: selectedOutsideTargetCount,
        signalStrength,
        structure,
        sectorModelStructure,
        structureActivityRanking,
        structureProfiles,
        activeSectors,
        suggestedEven,
        suggestedOdd,
        focusEvenShare,
        hotPool,
        midPool,
        coldPool,
        promisingColdPool,
        promisingColdCandidates,
        promisingColdThreshold,
        temperatureBudget,
        coldComebackAnalysis,
        deadExclusionCandidates,
        rankedNumbers,
        numberScores,
        numberComponents,
        patternModel,
        repeatCandidates,
        suggestedReturnCount,
        topPairs,
        topTriples,
        topQuads,
        sectorScores,
        recentStructures,
        historicalDrawCount: getHistoricalDrawCount(),
        meanNumber
    };
}


function buildAutoForgeGenerationPlan(analysis, profile = null) {
    const selectedStructure = Array.isArray(profile?.structure)
        ? [...profile.structure]
        : [...analysis.structure];

    const temperatureBudget = {
        ...(analysis.temperatureBudget || getAutoForgeTemperatureBudget(analysis.targetCount))
    };

    return {
        analysis,
        targetCount: analysis.targetCount,
        profileKey: profile?.key || "profile",
        profileLabel: profile?.label || "PROFILOWY",
        profileIcon: profile?.icon || "🧭",
        structure: selectedStructure,

        // Trzy osobne koszyki. HOT nie rezerwuje już ponad połowy kuponu.
        hotPool: [...(analysis.hotPool || [])],
        midPool: [...(analysis.midPool || [])],
        promisingColdPool: [...(analysis.promisingColdPool || [])],
        promisingColdCandidates: [...(analysis.promisingColdCandidates || [])],
        promisingColdThreshold: analysis.promisingColdThreshold ?? 55,
        temperatureBudget,

        coldPool: [...(analysis.coldPool || [])],
        deadExclusionPool: [...(analysis.deadExclusionCandidates || [])],
        numberScores: analysis.numberScores || [],
        numberComponents: analysis.numberComponents || [],
        patternModel: analysis.patternModel || null,
        sectorScores: analysis.sectorScores || [],
        suggestedEven: analysis.suggestedEven,
        suggestedOdd: analysis.suggestedOdd,
        suggestedReturnCount: analysis.suggestedReturnCount || 0,

        lastTemperatureTargets: { ...temperatureBudget },
        lastTemperatureMix: { hot: 0, mid: 0, promising: 0, cold: 0 },
        lastSelectedTemperatureNumbers: [],
        lastDeadPoolUsed: [],
        selectionTrace: []
    };
}

function getAutoForgeTemperatureBucket(number, plan) {
    if (!plan) return "MID";

    if ((plan.hotPool || []).includes(number)) return "HOT";
    if ((plan.promisingColdPool || []).includes(number)) return "PROMISING";
    if ((plan.coldPool || []).includes(number)) return "COLD";
    return "MID";
}

function countAutoForgeTemperatureMix(numbers, plan) {
    const mix = { hot: 0, mid: 0, promising: 0, cold: 0 };
    (numbers || []).forEach(number => {
        const bucket = getAutoForgeTemperatureBucket(number, plan);
        if (bucket === "HOT") mix.hot++;
        else if (bucket === "PROMISING") mix.promising++;
        else if (bucket === "COLD") mix.cold++;
        else mix.mid++;
    });
    return mix;
}

function getAutoForgeTemperaturePool(plan, bucket) {
    if (!plan) return [];
    if (bucket === "HOT") return plan.hotPool || [];
    if (bucket === "MID") return plan.midPool || [];
    if (bucket === "PROMISING") return plan.promisingColdPool || [];
    return [];
}

function getAutoForgeTemperatureNeed(targets, mix, bucket) {
    const key = bucket === "HOT" ? "hot" : bucket === "MID" ? "mid" : "promising";
    return Math.max(0, (targets?.[key] || 0) - (mix?.[key] || 0));
}

function trimAutoForgeTemperatureTargetsForManualNumbers(targets, mix, targetCount, manualCount) {
    const adjusted = { ...targets };
    const autoSlots = Math.max(0, targetCount - manualCount);
    const needs = {
        hot: Math.max(0, adjusted.hot - mix.hot),
        mid: Math.max(0, adjusted.mid - mix.mid),
        promising: Math.max(0, adjusted.promising - mix.promising)
    };

    let totalNeeds = needs.hot + needs.mid + needs.promising;
    let overflow = Math.max(0, totalNeeds - autoSlots);

    // Gdy użytkownik ręcznie wymusił liczby spoza planu, to najpierw oddajemy
    // miejsca z HOT, potem z MID. Slot COLD+ zostawiamy najdłużej, bo jest najmniejszy.
    for (const key of ["hot", "mid", "promising"]) {
        while (overflow > 0 && adjusted[key] > mix[key]) {
            adjusted[key]--;
            overflow--;
        }
    }

    return adjusted;
}

function drawAutoForgeTemperatureNumbers(
    plan,
    existingRequired = [],
    blockedRequired = [],
    excludedNumbers = []
) {
    if (!plan) return [];

    const selected = [];
    const blockedSet = new Set(blockedRequired);
    const excludedSet = new Set(excludedNumbers);
    const selectedSet = new Set(existingRequired);
    const sectorUsed = new Array(currentGame.ranges.length).fill(0);
    existingRequired.forEach(number => sectorUsed[getSectorIndex(number)]++);

    let mix = countAutoForgeTemperatureMix(existingRequired, plan);
    let targets = trimAutoForgeTemperatureTargetsForManualNumbers(
        plan.temperatureBudget || getAutoForgeTemperatureBudget(plan.targetCount),
        mix,
        plan.targetCount,
        existingRequired.length
    );

    const autoSlots = Math.max(0, plan.targetCount - existingRequired.length);

    const availableForBucket = bucket => getAutoForgeTemperaturePool(plan, bucket)
        .filter(number =>
            !selectedSet.has(number) &&
            !blockedSet.has(number) &&
            !excludedSet.has(number)
        );

    function pickOne(bucket) {
        const pool = availableForBucket(bucket).filter(number => {
            if (selected.includes(number)) return false;
            const sector = getSectorIndex(number);
            return sectorUsed[sector] < (plan.structure[sector] || 0);
        });

        if (!pool.length) return null;

        const selectedContext = [...existingRequired, ...selected];
        let candidatePool = filterAutoForgePoolByParity(pool, plan, selectedContext);
        if (!candidatePool.length) candidatePool = pool;

        const index = getAutoForgeWeightedRandomIndex(
            candidatePool,
            plan,
            selectedContext
        );
        if (index < 0) return null;

        const number = candidatePool[index];
        selected.push(number);
        selectedSet.add(number);
        sectorUsed[getSectorIndex(number)]++;
        traceAutoForgeSelection(plan, number, bucket === "PROMISING" ? "COLD+" : bucket, selectedContext);
        mix = countAutoForgeTemperatureMix([...existingRequired, ...selected], plan);
        return number;
    }

    function fillBucket(bucket) {
        let guard = 0;
        while (
            selected.length < autoSlots &&
            getAutoForgeTemperatureNeed(targets, mix, bucket) > 0 &&
            guard < 100
        ) {
            if (pickOne(bucket) === null) break;
            guard++;
        }
    }

    // Najpierw najrzadszy koszyk COLD+, potem MID, a HOT na końcu.
    // Dzięki temu HOT nie zajmuje sektorów, zanim MID/COLD+ dostaną swoją szansę.
    fillBucket("PROMISING");
    const promisingShortage = getAutoForgeTemperatureNeed(targets, mix, "PROMISING");
    if (promisingShortage > 0) {
        targets.promising -= promisingShortage;
        targets.mid += promisingShortage; // brak sensownego COLD+ => slot przechodzi na MID
    }

    fillBucket("MID");
    const midShortage = getAutoForgeTemperatureNeed(targets, mix, "MID");
    if (midShortage > 0) {
        targets.mid -= midShortage;
        targets.hot += midShortage;
    }

    fillBucket("HOT");
    const hotShortage = getAutoForgeTemperatureNeed(targets, mix, "HOT");
    if (hotShortage > 0) {
        targets.hot -= hotShortage;
        targets.mid += hotShortage;
        fillBucket("MID");
    }

    // Jeżeli struktura lub ręczne filtry nadal blokują część miksu, próbujemy
    // jeszcze raz COLD+ i HOT. Resztę później uzupełni ranking ogólny.
    fillBucket("PROMISING");
    fillBucket("HOT");

    plan.lastTemperatureTargets = { ...targets };
    plan.lastSelectedTemperatureNumbers = [...selected];
    return selected;
}

function getSafeAutoForgeDeadPool(plan, manualExcludedNumbers = [], manualRequiredPool = []) {
    if (!plan) return [];

    const manualExcludedSet = new Set(manualExcludedNumbers);
    const manualRequiredSet = new Set(manualRequiredPool);
    const safeDead = [];
    const sectorScores = plan.sectorScores || [];
    const maxSectorScore = Math.max(...sectorScores, 0.0001);
    const topSectorSet = new Set(
        sectorScores
            .map((score, index) => ({ score, index }))
            .sort((a, b) => b.score - a.score)
            .slice(0, currentGame === games.multi ? 3 : 2)
            .map(item => item.index)
    );

    // Ważne: zwykły COLD zostaje tylko miękką karą w scoringu.
    // Do twardego AUTO CUT trafiają wyłącznie liczby DEAD z niskim comebackiem.
    for (const number of (plan.deadExclusionPool || [])) {
        if (manualRequiredSet.has(number) || manualExcludedSet.has(number)) continue;

        const sector = getSectorIndex(number);
        const quota = plan.structure[sector] || 0;
        const sectorNorm = (sectorScores[sector] || 0) / maxSectorScore;
        const isProtectedHotSector =
            topSectorSet.has(sector) ||
            sectorNorm >= 0.68 ||
            quota >= 2;

        // Hierarchia pozostaje bez zmian: bardzo aktywny sektor ma pierwszeństwo
        // nawet nad etykietą DEAD. Wtedy liczba dostaje karę, ale nie jest blokowana.
        if (isProtectedHotSector) continue;

        const bounds = getSectorBounds(sector);
        const unavailableManual = [...manualExcludedSet]
            .filter(n => getSectorIndex(n) === sector).length;
        const unavailableAuto = safeDead
            .filter(n => getSectorIndex(n) === sector).length;

        const availableAfterExclusion =
            bounds.capacity - unavailableManual - unavailableAuto - 1;

        if (availableAfterExclusion >= quota) {
            safeDead.push(number);
        }
    }

    return safeDead;
}

function getBestPatternMatch(number, selectedNumbers, size, scoreMap, maxScore) {
    if (!scoreMap || !selectedNumbers?.length || selectedNumbers.length < size - 1) {
        return { raw: 0, normalized: 0, numbers: [] };
    }

    let bestRaw = 0;
    let bestNumbers = [];

    forEachCombination(selectedNumbers, size - 1, combo => {
        const numbers = [...combo, number].sort((a, b) => a - b);
        const raw = getPatternScore(scoreMap, numbers);
        if (raw > bestRaw) {
            bestRaw = raw;
            bestNumbers = numbers;
        }
    });

    return {
        raw: bestRaw,
        normalized: maxScore > 0 ? clamp(bestRaw / maxScore, 0, 1) : 0,
        numbers: bestNumbers
    };
}

function filterAutoForgePoolByParity(pool, plan, selectedNumbers = []) {
    if (!plan || !Array.isArray(pool) || !pool.length) return pool;

    const selectedEven = selectedNumbers.filter(number => number % 2 === 0).length;
    const selectedOdd = selectedNumbers.length - selectedEven;
    const remainingEven = Math.max(0, (plan.suggestedEven ?? plan.targetCount) - selectedEven);
    const remainingOdd = Math.max(0, (plan.suggestedOdd ?? 0) - selectedOdd);

    if (remainingEven <= 0) {
        const oddOnly = pool.filter(number => number % 2 !== 0);
        return oddOnly.length ? oddOnly : pool;
    }

    if (remainingOdd <= 0) {
        const evenOnly = pool.filter(number => number % 2 === 0);
        return evenOnly.length ? evenOnly : pool;
    }

    return pool;
}

function getAutoForgeCandidateScore(number, plan, selectedNumbers = []) {
    const base = Math.max(0.01, Number(plan?.numberScores?.[number]) || 0.01);
    const pattern = plan?.patternModel;
    const bucket = getAutoForgeTemperatureBucket(number, plan);
    const mix = countAutoForgeTemperatureMix(selectedNumbers, plan);
    const targets = plan?.lastTemperatureTargets || plan?.temperatureBudget || { hot: 0, mid: 0, promising: 0 };
    const temperatureNeed = getAutoForgeTemperatureNeed(targets, mix, bucket);
    const temperatureBoost =
        bucket === "PROMISING" ? (temperatureNeed > 0 ? 12 : -2) :
        bucket === "MID" ? (temperatureNeed > 0 ? 9 : -3) :
        bucket === "HOT" ? (temperatureNeed > 0 ? 4 : -12) :
        -10;

    if (!pattern) {
        return {
            score: Math.max(0.01, base + temperatureBoost),
            base,
            pair: { raw: 0, normalized: 0, numbers: [] },
            triple: { raw: 0, normalized: 0, numbers: [] },
            quad: { raw: 0, normalized: 0, numbers: [] },
            returnRate: 0,
            returnBoost: 0,
            parityBoost: 0,
            temperatureBoost,
            temperatureBucket: bucket
        };
    }

    const pair = getBestPatternMatch(
        number,
        selectedNumbers,
        2,
        pattern.pairScores,
        pattern.maxPairScore
    );
    const triple = getBestPatternMatch(
        number,
        selectedNumbers,
        3,
        pattern.tripleScores,
        pattern.maxTripleScore
    );
    const quad = getBestPatternMatch(
        number,
        selectedNumbers,
        4,
        pattern.quadScores,
        pattern.maxQuadScore
    );

    const latestSet = new Set(pattern.latestNumbers || []);
    const isReturnCandidate = latestSet.has(number);
    const returnRate = isReturnCandidate ? (pattern.returnScores[number] || 0) : 0;
    const selectedReturnCount = selectedNumbers.filter(n => latestSet.has(n)).length;
    const targetReturns = Math.max(0, plan.suggestedReturnCount || 0);
    const returnUrgency = targetReturns > 0
        ? clamp((targetReturns - selectedReturnCount) / targetReturns, 0, 1)
        : 0;
    const returnBoost = isReturnCandidate
        ? returnRate * 12 + returnUrgency * 5
        : 0;

    const selectedEven = selectedNumbers.filter(n => n % 2 === 0).length;
    const selectedOdd = selectedNumbers.length - selectedEven;
    const remainingSlots = Math.max(1, plan.targetCount - selectedNumbers.length);
    const remainingEven = Math.max(0, (plan.suggestedEven ?? plan.targetCount) - selectedEven);
    const remainingOdd = Math.max(0, (plan.suggestedOdd ?? 0) - selectedOdd);
    const desiredParityShare = number % 2 === 0
        ? remainingEven / remainingSlots
        : remainingOdd / remainingSlots;
    const parityBoost = clamp(desiredParityShare, 0, 1) * 6;

    const score = Math.max(
        0.01,
        base +
        pair.normalized * 18 +
        triple.normalized * 10 +
        quad.normalized * 5 +
        returnBoost +
        parityBoost +
        temperatureBoost
    );

    return {
        score,
        base,
        pair,
        triple,
        quad,
        returnRate,
        returnBoost,
        parityBoost,
        temperatureBoost,
        temperatureBucket: bucket
    };
}

function getAutoForgeWeightedRandomIndex(pool, plan, selectedNumbers = []) {
    if (!pool.length) return -1;

    const scored = pool.map(number =>
        getAutoForgeCandidateScore(number, plan, selectedNumbers)
    );
    const maxScore = Math.max(...scored.map(item => item.score), 0.0001);

    // Nadal zostawiamy RNG, ale mocniej przechylamy je w stronę najlepiej
    // ocenionych liczb. Dzięki bazowej wadze słabszy kandydat nie ma zera.
    const weights = scored.map((item, index) => {
        const normalized = clamp(item.score / maxScore, 0, 1);
        const baseWeight = 0.10 + Math.pow(normalized, 2.15) * 3.40;
        return baseWeight * getActiveBatchDiversityMultiplier(pool[index]);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return getBatchAwareRandomIndex(pool);

    let roll = cryptoRandomFloat() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }

    return pool.length - 1;
}

function traceAutoForgeSelection(plan, number, source, selectedBefore = []) {
    if (!plan) return;
    const details = getAutoForgeCandidateScore(number, plan, selectedBefore);
    plan.selectionTrace.push({
        number,
        source,
        selectedBefore: [...selectedBefore],
        ...details
    });
}

function formatPatternEntries(entries = []) {
    if (!entries.length) return "—";
    return entries
        .map(item => `${item.numbers.join("-")} (${Math.round(item.score * 100)}%)`)
        .join(" • ");
}

function buildAutoForgeTicketExplanations(numbers, plan) {
    const pattern = plan?.patternModel;
    if (!plan || !pattern) return [];

    const rows = numbers.map(number => {
        const others = numbers.filter(n => n !== number);
        const component = plan.numberComponents?.[number] || {
            total: plan.numberScores?.[number] || 0,
            status: "MID",
            returnRate: 0,
            isLatest: false
        };

        const pair = getBestPatternMatch(
            number, others, 2, pattern.pairScores, pattern.maxPairScore
        );
        const triple = getBestPatternMatch(
            number, others, 3, pattern.tripleScores, pattern.maxTripleScore
        );
        const quad = getBestPatternMatch(
            number, others, 4, pattern.quadScores, pattern.maxQuadScore
        );

        const rawScore = Math.max(
            0.01,
            (component.total || 0) +
            pair.normalized * 18 +
            triple.normalized * 10 +
            quad.normalized * 5
        );

        const relations = [];
        if (pair.raw > 0) relations.push(`para ${pair.numbers.join("-")}`);
        if (triple.raw > 0) relations.push(`trójka ${triple.numbers.join("-")}`);
        if (quad.raw > 0) relations.push(`czwórka ${quad.numbers.join("-")}`);

        const reasons = [`sektor ${getSectorLabel(getSectorIndex(number))}`];
        if (component.status === "HOT") reasons.unshift("HOT");
        if (component.status === "COLD+") {
            reasons.unshift(`COLD+ ${component.promisingColdScore || 0}/100`);
        }
        if (component.isLatest && component.returnRate > 0) {
            reasons.push(`powrót ${Math.round(component.returnRate * 100)}%`);
        }
        if (pair.normalized >= 0.25 && pair.numbers.length) {
            reasons.push(`mocna para z ${pair.numbers.filter(n => n !== number).join("/")}`);
        }
        if (triple.normalized >= 0.20 && triple.numbers.length) {
            reasons.push("wsparcie trójki");
        }

        return {
            number,
            sector: getSectorLabel(getSectorIndex(number)),
            status: component.status || "MID",
            statusKey: component.status === "COLD+" ? "cold-plus" : String(component.status || "MID").toLowerCase(),
            promisingColdScore: component.promisingColdScore || 0,
            returnRate: component.isLatest ? component.returnRate || 0 : null,
            relations: relations.slice(0, 2),
            reasons,
            rawScore
        };
    });

    const maxRaw = Math.max(...rows.map(row => row.rawScore), 0.0001);
    rows.forEach(row => {
        row.score100 = Math.round(clamp(row.rawScore / maxRaw, 0, 1) * 100);
    });

    return rows.sort((a, b) => b.score100 - a.score100 || a.number - b.number);
}

function getWeightedRandomIndex(pool, numberScores = []) {
    if (!pool.length) return -1;
    if (!numberScores || !numberScores.length) {
        return getBatchAwareRandomIndex(pool);
    }

    const rawScores = pool.map(number =>
        Math.max(0, Number(numberScores[number]) || 0)
    );
    const maxScore = Math.max(...rawScores, 0.0001);
    const weights = rawScores.map((score, index) =>
        (0.30 + (score / maxScore) * 1.70) * getActiveBatchDiversityMultiplier(pool[index])
    );
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return getBatchAwareRandomIndex(pool);

    let roll = cryptoRandomFloat() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }

    return pool.length - 1;
}

function applyAutoForgeProfileToControls(analysis, structureOverride = null) {
    const selectedStructure = Array.isArray(structureOverride)
        ? structureOverride
        : analysis.structure;

    const structureFilter = document.getElementById("structureFilter");
    if (structureFilter) structureFilter.checked = true;

    selectedStructure.forEach((value, index) => {
        const input = document.getElementById(`r${index + 1}`);
        if (input) input.value = value;
    });

    const evenOddFilter = document.getElementById("evenOddFilter");
    if (evenOddFilter) evenOddFilter.checked = true;

    const evenInput = document.getElementById("evenCount");
    const oddInput = document.getElementById("oddCount");
    if (evenInput) evenInput.value = analysis.suggestedEven;
    if (oddInput) oddInput.value = analysis.suggestedOdd;

    // Zgodnie z filozofią AUTO FORGE nie pozwalamy sumie sterować kuponem.
    // Manualny generator nadal może korzystać z tego filtra po ponownym włączeniu.
    const sumFilter = document.getElementById("sumFilter");
    if (sumFilter) sumFilter.checked = false;
}

function formatNumbersForEverySecond(numbers) {
    return (Array.isArray(numbers) ? numbers : [])
        .map(number => String(Number(number)))
        .join(", ");
}

function renderAutoForgeEverySecondCopyPanel(tickets = []) {
    const container = document.getElementById("autoForgeGenerationResult");
    if (!container || !Array.isArray(tickets) || !tickets.length) return;

    const gameKey = getCurrentGameKey();
    const validTickets = tickets.filter(ticket => Array.isArray(ticket?.numbers) && ticket.numbers.length);
    if (!validTickets.length) return;

    const rows = validTickets.map((ticket, index) => {
        const mainText = formatNumbersForEverySecond(ticket.numbers);
        const secondaryNumbers = gameKey === "euro"
            ? (ticket.euroNumbers || [])
            : gameKey === "extra"
                ? (ticket.extraNumber || [])
                : [];
        const secondaryText = formatNumbersForEverySecond(secondaryNumbers);
        const secondaryLabel = gameKey === "euro" ? "Euro" : gameKey === "extra" ? "Extra" : "";

        return `
            <div class="af-everysecond-copy-row">
                <div class="af-everysecond-copy-ticket">
                    <span>Kupon #${index + 1}</span>
                    <code>${mainText}</code>
                </div>
                <button type="button" class="lab-secondary-btn af-everysecond-copy-btn"
                    data-af-es-copy="main" data-ticket-index="${index}">📋 Kopiuj liczby</button>
                ${secondaryText ? `
                    <div class="af-everysecond-copy-ticket af-everysecond-secondary">
                        <span>${secondaryLabel}</span>
                        <code>${secondaryText}</code>
                    </div>
                    <button type="button" class="lab-secondary-btn af-everysecond-copy-btn"
                        data-af-es-copy="secondary" data-ticket-index="${index}">📋 Kopiuj ${secondaryLabel}</button>
                ` : ""}
            </div>
        `;
    }).join("");

    const panel = document.createElement("section");
    panel.className = "af-everysecond-copy-panel";
    panel.innerHTML = `
        <div class="af-everysecond-copy-head">
            <div>
                <span>⚡ EVERY SECOND</span>
                <strong>Kopiuj kupon jednym kliknięciem</strong>
            </div>
            <small>Format: liczba, liczba, liczba…</small>
        </div>
        <p>Skopiowany zestaw możesz wkleić prosto do pola „Moje typy” w RNG Arenie.</p>
        <div class="af-everysecond-copy-list">${rows}</div>
    `;

    container.appendChild(panel);

    panel.querySelectorAll("[data-af-es-copy]").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.ticketIndex);
            const ticket = validTickets[index];
            if (!ticket) return;

            const part = button.dataset.afEsCopy;
            const values = part === "secondary"
                ? (gameKey === "euro" ? ticket.euroNumbers : ticket.extraNumber)
                : ticket.numbers;

            copyLaboratoryText(formatNumbersForEverySecond(values), button);
        });
    });
}

function renderAutoForgeGenerationResult(analysis, plan, numbers) {
    const container = document.getElementById("autoForgeGenerationResult");
    if (!container || !Array.isArray(numbers)) return;

    const hotOnTicket = numbers.filter(number => getAutoForgeTemperatureBucket(number, plan) === "HOT");
    const midOnTicket = numbers.filter(number => getAutoForgeTemperatureBucket(number, plan) === "MID");
    const promisingOnTicket = numbers.filter(number => getAutoForgeTemperatureBucket(number, plan) === "PROMISING");
    const regularColdOnTicket = numbers.filter(number => getAutoForgeTemperatureBucket(number, plan) === "COLD");
    const baseTemperatureBudget = plan.temperatureBudget || getAutoForgeTemperatureBudget(numbers.length);
    const temperatureTargets = plan.lastTemperatureTargets || baseTemperatureBudget;
    const structure = getStructureForNumbers(numbers);
    const even = numbers.filter(number => number % 2 === 0).length;
    const odd = numbers.length - even;
    const latestSet = new Set(plan.patternModel?.latestNumbers || []);
    const returnsOnTicket = numbers.filter(number => latestSet.has(number));
    const explanations = buildAutoForgeTicketExplanations(numbers, plan);

    const explanationRows = explanations.map(row => `
        <tr>
            <td><strong>${String(row.number).padStart(2, "0")}</strong></td>
            <td>${row.sector}</td>
            <td><span class="af-status af-status-${row.statusKey}">${row.status}</span></td>
            <td>${row.returnRate === null ? "—" : `${Math.round(row.returnRate * 100)}%`}</td>
            <td>${row.relations.length ? row.relations.join(" • ") : "—"}</td>
            <td><strong>${row.score100}</strong></td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="auto-forge-generation-result">
            <div class="auto-forge-generation-head">
                <div>
                    <span>${plan.profileIcon || "🎯"} ${plan.profileLabel || "PROFIL"} — PROFIL ZASTOSOWANY</span>
                    <strong>Kupon osadzony w strefie ${analysis.focusZone}</strong>
                </div>
                <strong>Struktura ${plan.structure.join("-")}</strong>
            </div>

            <div class="auto-forge-generation-grid">
                <div><span>Struktura kuponu</span><strong>${structure}</strong></div>
                <div><span>Parzystość</span><strong>${even}/${odd}</strong></div>
                <div><span>Plan temperatury</span><strong>${getAutoForgeTemperatureBudgetText(baseTemperatureBudget)}</strong></div>
                <div><span>Cel po dostępności</span><strong>${getAutoForgeTemperatureBudgetText(temperatureTargets)}</strong></div>
                <div><span>🔥 HOT</span><strong>${hotOnTicket.length}: ${hotOnTicket.join(", ") || "—"}</strong></div>
                <div><span>⚪ MID</span><strong>${midOnTicket.length}: ${midOnTicket.join(", ") || "—"}</strong></div>
                <div><span>❄️ COLD+ comeback</span><strong>${promisingOnTicket.length}: ${promisingOnTicket.join(", ") || "—"}</strong></div>
                <div><span>Zwykły COLD — tylko awaryjnie</span><strong>${regularColdOnTicket.length}: ${regularColdOnTicket.join(", ") || "—"}</strong></div>
                <div><span>Powroty z ostatniego</span><strong>${returnsOnTicket.length}: ${returnsOnTicket.join(", ") || "—"}</strong></div>
                <div><span>☠️ DEAD odrzucone automatycznie</span><strong>${plan.lastDeadPoolUsed.join(", ") || "—"}</strong></div>
                <div><span>Cel powrotów</span><strong>${plan.suggestedReturnCount} • sygnał miękki</strong></div>
            </div>

            <div class="auto-forge-choice-engine">
                <div class="auto-forge-choice-head">
                    <div>
                        <span>🧬 SILNIK WYBORU LICZB</span>
                        <strong>Dlaczego te liczby dostały priorytet?</strong>
                    </div>
                    <small>AUTO SCORE jest względną oceną wewnątrz tego kuponu.</small>
                </div>
                <div class="auto-forge-table-wrap">
                    <table class="auto-forge-choice-table">
                        <thead>
                            <tr>
                                <th>Liczba</th>
                                <th>Sektor</th>
                                <th>Status</th>
                                <th>Powrót</th>
                                <th>Relacje</th>
                                <th>AUTO SCORE</th>
                            </tr>
                        </thead>
                        <tbody>${explanationRows}</tbody>
                    </table>
                </div>
            </div>

            <p>
                Najpierw obowiązuje struktura wynikająca z migracji i skupisk. Dopiero wewnątrz tych sektorów
                AUTO FORGE pilnuje miksu HOT / MID / COLD+. Jeżeli nie ma wystarczająco mocnego COLD+, jego slot przechodzi przede wszystkim na MID.
                Zwykły COLD jest tylko awaryjnym kandydatem, a DEAD bez comebacków może dostać AUTO CUT. Losowość pozostaje ostatnim krokiem.
            </p>
        </div>
    `;
}

function generateAutoForgeFromAnalysis(analysis, profileKey = "profile") {
    const profile = profileKey && typeof profileKey === "object"
        ? profileKey
        : (analysis.structureProfiles || []).find(item => item.key === profileKey)
            || (analysis.structureProfiles || [])[0]
            || { key: "profile", label: "PROFILOWY", icon: "🧭", structure: analysis.structure };

    applyAutoForgeProfileToControls(analysis, profile.structure);

    if (isMultiCoverageMode()) {
        generateMultiCoverageBatch(analysis, profile);
        return;
    }

    const requested = getTicketBatchCount();
    if (requested <= 1) {
        const plan = buildAutoForgeGenerationPlan(analysis, profile);
        const numbers = generateMiniLotto(0, plan);
        if (!Array.isArray(numbers) || !numbers.length) return;
        renderAutoForgeGenerationResult(analysis, plan, numbers);
        renderAutoForgeEverySecondCopyPanel(
            lastGeneratedTicketMeta ? [lastGeneratedTicketMeta] : [{ numbers }]
        );
        return;
    }

    const tickets = generateTicketBatch(
        () => buildAutoForgeGenerationPlan(analysis, profile),
        {
            analysis,
            profile,
            title: `AUTO FORGE — ${profile.icon || "🎯"} ${profile.label}`,
            subtitle: `${requested} kuponów z tym samym profilem sektorów i miksem ${getAutoForgeTemperatureBudgetText(analysis.temperatureBudget)}.`
        }
    );

    const result = document.getElementById("autoForgeGenerationResult");
    if (result && tickets.length) {
        result.innerHTML = `
            <div class="auto-forge-generation-result">
                <strong>${profile.icon || "🎯"} ${profile.label}: wygenerowano ${tickets.length} różnych kuponów.</strong>
                <p>Każdy kupon trzyma strukturę ${profile.structure.join("-")} oraz kontrolowany miks ${getAutoForgeTemperatureBudgetText(analysis.temperatureBudget)}. Gdy brakuje sensownego COLD+, jego slot przechodzi na MID.</p>
            </div>
        `;
        renderAutoForgeEverySecondCopyPanel(tickets);
    }
}


function parseAutoForgeCustomStructure(rawValue, targetCount = getAutoForgeTargetCount()) {
    const raw = String(rawValue ?? "").trim();

    if (!raw) {
        return {
            ok: false,
            message: "Wpisz strukturę, np. 0.0.0.0.0.0.4.4."
        };
    }

    // Akceptujemy wygodne separatory: kropka, myślnik, przecinek, średnik,
    // slash, pionowa kreska lub spacja. Każdy element musi być liczbą >= 0.
    if (!/^\d+(?:\s*[-.,;|/]\s*\d+|\s+\d+)*$/.test(raw)) {
        return {
            ok: false,
            message: "Użyj wyłącznie liczb całkowitych ≥ 0 oddzielonych kropką, myślnikiem, przecinkiem albo spacją."
        };
    }

    const structure = raw
        .split(/[\s.,;|/-]+/)
        .filter(Boolean)
        .map(value => Number(value));

    if (
        structure.length !== currentGame.ranges.length ||
        structure.some(value => !Number.isInteger(value) || value < 0)
    ) {
        return {
            ok: false,
            message: `Ta gra wymaga dokładnie ${currentGame.ranges.length} pól struktury.`
        };
    }

    const total = structure.reduce((sum, value) => sum + value, 0);
    if (total !== targetCount) {
        return {
            ok: false,
            message: `Suma struktury musi wynosić dokładnie ${targetCount}. Teraz wynosi ${total}.`
        };
    }

    for (let index = 0; index < currentGame.ranges.length; index++) {
        const start = index === 0 ? 1 : currentGame.ranges[index - 1] + 1;
        const end = currentGame.ranges[index];
        const capacity = end - start + 1;

        if (structure[index] > capacity) {
            return {
                ok: false,
                message: `Sektor ${start}-${end} ma pojemność ${capacity}, a wpisano ${structure[index]}.`
            };
        }
    }

    return {
        ok: true,
        structure,
        normalized: structure.join("-"),
        message: `Gotowe: ${structure.join("-")} • suma ${targetCount}.`
    };
}

function collapseManualFiltersForAutoForge() {
    const panel = document.getElementById("manualFiltersPanel");
    if (panel) panel.open = false;
}

function renderAutoForgeReport(analysis) {
    const report = document.getElementById("autoForgeReport");
    if (!report) return;

    const confidenceClass =
        analysis.confidence >= 75 ? "high" :
        analysis.confidence >= 55 ? "medium" : "low";

    const signalClass =
        analysis.signalStrength >= 0.68 ? "high" :
        analysis.signalStrength >= 0.42 ? "medium" : "low";

    const signalLabel =
        analysis.signalStrength >= 0.68 ? "MOCNY" :
        analysis.signalStrength >= 0.42 ? "ŚREDNI" : "SŁABY";

    const bandCards = analysis.bandStats.map(band => {
        const percentage = Math.round(band.share * 100);
        const intensity = band.intensity.toFixed(2);
        const active = analysis.focusKeys.includes(band.key) ? " active" : "";

        return `
            <div class="auto-forge-band${active}">
                <div class="auto-forge-band-head">
                    <strong>${band.label}</strong>
                    <span>${band.start}-${band.end}</span>
                </div>
                <div class="auto-forge-band-value">${percentage}%</div>
                <div class="auto-forge-band-bar"><i style="width:${clamp(percentage, 0, 100)}%"></i></div>
                <small>śr. ${band.averageCount.toFixed(1)} kul / los. • aktywność ×${intensity}</small>
            </div>
        `;
    }).join("");

    const sectorRows = analysis.activeSectors.map((sector, rank) => `
        <tr class="${sector.suggested >= 2 ? "sector-strong" : ""}">
            <td><strong>#${rank + 1}</strong></td>
            <td><strong>${sector.label}</strong></td>
            <td>${sector.averageCount.toFixed(2)}</td>
            <td>${Math.round(sector.clusterRate * 100)}%</td>
            <td>${Math.round(sector.strongClusterRate * 100)}%</td>
            <td>${sector.maxCluster}</td>
            <td>${Math.round(sector.evenShare * 100)} / ${100 - Math.round(sector.evenShare * 100)}</td>
            <td><strong>${sector.suggested}</strong></td>
        </tr>
    `).join("");

    const recentRows = analysis.recentStructures.map(item => `
        <div class="auto-forge-recent-row">
            <span>${item.date}</span>
            <strong>${item.structure}</strong>
        </div>
    `).join("");

    const repeatCandidatesText = analysis.repeatCandidates.length
        ? analysis.repeatCandidates
            .map(item => `${item.number} (${Math.round(item.rate * 100)}%)`)
            .join(" • ")
        : "—";

    const topPairsText = formatPatternEntries(analysis.topPairs);
    const topTriplesText = formatPatternEntries(analysis.topTriples);
    const topQuadsText = formatPatternEntries(analysis.topQuads);
    const promisingColdText = (analysis.promisingColdCandidates || [])
        .filter(item => item.score >= (analysis.promisingColdThreshold ?? 55))
        .slice(0, currentGame === games.multi ? 8 : 5)
        .map(item => `${item.number} (${item.score}/100 • ${item.sector})`)
        .join(" • ") || "brak kandydata ≥ 55/100 — slot przejdzie na MID";


    const structureLeader = (analysis.structureActivityRanking || [])[0] || null;
    const structureRankingRows = (analysis.structureActivityRanking || []).slice(0, 5).map((item, index) => {
        const lastSeen = item.trend.drawsAgo === 0
            ? "ostatnie losowanie"
            : item.trend.drawsAgo === null
                ? "—"
                : `${item.trend.drawsAgo} los. temu`;
        return `
            <tr class="${index === 0 ? "structure-leader-row" : ""}">
                <td><strong>#${index + 1}</strong></td>
                <td><strong>${item.key}</strong></td>
                <td>${item.count}/${item.windowSize}</td>
                <td>${Math.round(item.rate * 100)}%</td>
                <td><strong class="structure-trend-${item.trend.direction > 0 ? "up" : item.trend.direction < 0 ? "down" : "flat"}">${item.trend.directionText}</strong></td>
                <td>${lastSeen}</td>
                <td>${item.trend.maxStreak || "—"}</td>
            </tr>
        `;
    }).join("");

    const manualStructureSectorLabels = currentGame.ranges.map((value, index) => {
        const start = index === 0 ? 1 : currentGame.ranges[index - 1] + 1;
        return `${start}-${value}`;
    }).join(" • ");
    const manualStructureExample = currentGame === games.multi && analysis.targetCount === 8
        ? "0.0.0.0.0.0.4.4"
        : analysis.structure.join(".");

    report.innerHTML = `
        <div class="auto-forge-card auto-forge-diagnostic">
            <div class="auto-forge-title">
                <div>
                    <strong>🧠 AUTO FORGE — DIAGNOZA PLANSZY</strong>
                    <small>ETAP 4 • analiza → struktura → silnik wyboru liczb</small>
                </div>
                <span class="confidence ${confidenceClass}">
                    Spójność ${analysis.confidence}/100
                </span>
            </div>

            <div class="auto-forge-decision-banner">
                <div>
                    <span>KIERUNEK</span>
                    <strong>${analysis.migrationText}</strong>
                </div>
                <div>
                    <span>STREFA DOCELOWA</span>
                    <strong>${analysis.focusZone}</strong>
                </div>
                <div>
                    <span>KONCENTRACJA ${analysis.targetCount} LICZB</span>
                    <strong>${analysis.focusTargetCount}/${analysis.targetCount} w ${analysis.focusZone} (${analysis.focusPercent}%)</strong>
                </div>
                <div>
                    <span>SIŁA SYGNAŁU</span>
                    <strong class="signal-${signalClass}">${signalLabel} • ${Math.round(analysis.signalStrength * 100)}/100</strong>
                </div>
            </div>

            <div class="auto-forge-grid">
                <div><span>Horyzont AUTO</span><strong>${analysis.modeLabel}</strong><small>realnie użyto: ${analysis.windowsUsed}</small></div>
                <div><span>Dominująca strefa</span><strong>${analysis.dominantBand.key} • aktywność ×${analysis.dominantBand.intensity.toFixed(2)}</strong></div>
                <div><span>Sugerowana struktura</span><strong>${analysis.structure.join("-")}</strong><small>${structureLeader ? `lider danych ${structureLeader.count}/${structureLeader.windowSize} • ${structureLeader.trend.directionText}` : "awaryjny model sektorowy"}</small></div>
                <div><span>Parzystość aktywnej strefy</span><strong>${analysis.suggestedEven}/${analysis.suggestedOdd} • ${Math.round(analysis.focusEvenShare * 100)}% parzystych</strong></div>
                <div><span>Skupisko</span><strong>próg ${analysis.thresholds.cluster}+ • mocne ${analysis.thresholds.strong}+</strong></div>
                <div><span>🎚️ Plan temperatury</span><strong>${getAutoForgeTemperatureBudgetText(analysis.temperatureBudget)}</strong><small>około 45% / 35% / 20%</small></div>
                <div><span>HOT — TOP trendu</span><strong>${analysis.hotPool.join(", ")}</strong></div>
                <div><span>MID — osobny koszyk</span><strong>${analysis.midPool.length} kandydatów • bez premii HOT</strong></div>
                <div><span>❄️ COLD+ — obiecujące comebacki ≥ ${analysis.promisingColdThreshold}/100</span><strong>${promisingColdText}</strong></div>
                <div><span>COLD — dół trendu</span><strong>${analysis.coldPool.join(", ")} • tylko miękka kara</strong></div>
                <div><span>☠️ AUTO CUT — DEAD bez comebacków</span><strong>${analysis.deadExclusionCandidates.join(", ") || "—"} • przed ochroną gorących sektorów</strong></div>
            </div>

            <div class="auto-forge-section">
                <h4>📍 LOW / MID / HIGH — gdzie teraz siedzą kule?</h4>
                <div class="auto-forge-band-grid">${bandCards}</div>
            </div>

            <div class="auto-forge-section">
                <h4>🔥 Najaktywniejsze sektory i skupiska</h4>
                <div class="auto-forge-table-wrap">
                    <table class="auto-forge-sector-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Sektor</th>
                                <th>Śr. kul</th>
                                <th>${analysis.thresholds.cluster}+ kul</th>
                                <th>${analysis.thresholds.strong}+ kul</th>
                                <th>Max</th>
                                <th>P/N %</th>
                                <th>Do struktury</th>
                            </tr>
                        </thead>
                        <tbody>${sectorRows}</tbody>
                    </table>
                </div>
            </div>

            <details class="auto-forge-section auto-forge-pattern-section auto-forge-collapsible-section">
                <summary class="auto-forge-collapsible-summary">
                    <span>🔁 Powroty + pary + trójki + czwórki</span>
                    <small>parametr pomocniczy • kliknij, aby rozwinąć</small>
                </summary>
                <div class="auto-forge-collapsible-body">
                    <div class="auto-forge-pattern-grid">
                        <div>
                            <span>Śr. powrotów w pełnym losowaniu</span>
                            <strong>${analysis.patternModel.averageReturnCount.toFixed(2)}</strong>
                        </div>
                        <div>
                            <span>Miękki cel dla ${analysis.targetCount} typów</span>
                            <strong>${analysis.suggestedReturnCount}</strong>
                        </div>
                        <div class="wide">
                            <span>Kandydaci do powrotu z ostatniego losowania</span>
                            <strong>${repeatCandidatesText}</strong>
                        </div>
                        <div class="wide">
                            <span>Najmocniejsze pary w aktywnej strukturze</span>
                            <strong>${topPairsText}</strong>
                        </div>
                        <div class="wide">
                            <span>Najmocniejsze trójki</span>
                            <strong>${topTriplesText}</strong>
                        </div>
                        <div class="wide">
                            <span>Czwórki — sygnał pomocniczy</span>
                            <strong>${topQuadsText}</strong>
                        </div>
                    </div>
                    <small class="auto-forge-pattern-note">
                        Procent przy relacji oznacza ważoną częstość współwystąpienia.
                        Okna relacji: ${analysis.patternWindowsLabel}. Powroty i relacje są wagami wyboru, nie sztywnymi wymogami kuponu.
                    </small>
                </div>
            </details>

            <div class="auto-forge-section auto-forge-structure-ranking-section">
                <h4>🏆 Aktywne struktury — ranking AUTO</h4>
                <div class="auto-forge-table-wrap">
                    <table class="auto-forge-sector-table auto-forge-structure-ranking-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Struktura</th>
                                <th>Wyst.</th>
                                <th>Udział</th>
                                <th>Trend</th>
                                <th>Ostatnio</th>
                                <th>Max seria</th>
                            </tr>
                        </thead>
                        <tbody>${structureRankingRows || `<tr><td colspan="7">Brak danych o strukturach.</td></tr>`}</tbody>
                    </table>
                </div>
                <small class="auto-forge-pattern-note">
                    Częstotliwość ma pierwszy priorytet. Świeżość, seria, trend i zgodność z aktywnymi sektorami rozstrzygają remis lub bardzo podobne układy.
                </small>
            </div>

            <div class="auto-forge-section auto-forge-manual-structure-section">
                <h4>✍️ Własna struktura — twardy wzorzec</h4>
                <div class="auto-forge-manual-structure-control">
                    <input
                        type="text"
                        id="autoForgeManualStructureInput"
                        value="${analysis.structure.join("-")}"
                        placeholder="np. ${manualStructureExample}"
                        inputmode="text"
                        autocomplete="off">
                    <button type="button" id="autoForgeManualStructureBtn" class="primary-btn">
                        Generuj z moją strukturą
                    </button>
                </div>
                <div class="auto-forge-manual-structure-meta">
                    <span>Sektory: <strong>${manualStructureSectorLabels}</strong></span>
                    <span>Wymagana suma: <strong>${analysis.targetCount}</strong></span>
                </div>
                <div id="autoForgeManualStructureStatus" class="auto-forge-manual-structure-status">
                    Możesz wpisać własny układ, np. ${manualStructureExample}. Kropki, myślniki, przecinki i spacje są akceptowane.
                </div>
                <small class="auto-forge-pattern-note">
                    Twoja struktura staje się twardym ograniczeniem sektorów. AUTO FORGE dalej sam dobiera konkretne liczby przez aktywność sektorów,
                    HOT / MID / COLD+, powroty, relacje, parzystość i ważone RNG. Liczby obowiązkowe oraz wykluczenia nadal są respektowane.
                </small>
            </div>

            <div class="auto-forge-section">
                <h4>🧩 Ostatnie struktury — kontrola wzorca</h4>
                <div class="auto-forge-recent-list">${recentRows}</div>
            </div>

            <div class="auto-forge-section auto-forge-profile-section">
                <h4>🎯 Główna struktura + 2 gorące alternatywy</h4>
                <div class="auto-forge-profile-grid">
                    ${(analysis.structureProfiles || []).map(profile => {
                        const bandText = profile.bandAllocation
                            .map(item => `${item.key} ${item.count}`)
                            .join(" • ");
                        return `
                            <div class="auto-forge-profile-card profile-${profile.key}">
                                <div class="auto-forge-profile-head">
                                    <strong>${profile.icon} ${profile.label}</strong>
                                    <span>${profile.structure.join("-")}</span>
                                </div>
                                <div class="auto-forge-profile-bands">${bandText}</div>
                                <p>${profile.description}</p>
                                <button type="button" class="primary-btn auto-forge-profile-generate" data-profile="${profile.key}">
                                    Generuj ${profile.label.toLowerCase()}
                                </button>
                            </div>
                        `;
                    }).join("")}
                </div>
                <small class="auto-forge-pattern-note">
                    Profilowy bierze lidera realnych wystąpień. Dwa pozostałe warianty pochodzą z kolejnych wysoko sklasyfikowanych struktur. Sektory i migracja są teraz tie-breakerem, a nie fabryką nowej struktury.
                </small>
            </div>

            <div class="auto-forge-next-step">
                <div>
                    <span>ETAP 4 — SILNIK WYBORU LICZB AKTYWNY</span>
                    <strong>Masz teraz lidera danych oraz 2 gorące struktury zamienne.</strong>
                    <small>Strefa → sektor/skupisko → budżet HOT/MID/COLD+ → powroty/relacje → parzystość → ważone RNG.</small>
                </div>
                <button id="autoForgeGenerateFromProfileBtn" class="primary-btn auto-forge-generate-profile-btn">
                    🧭 GENERUJ PROFILOWY
                </button>
            </div>

            <div id="autoForgeGenerationResult"></div>

            <p class="auto-forge-note">
                Najpierw AUTO FORGE czyta planszę. Dopiero przyciskiem powyżej uruchamiasz generator z tą decyzją.
                Manualne liczby obowiązkowe i ręczne wykluczenia nadal są respektowane.
            </p>
        </div>
    `;

    document.querySelectorAll(".auto-forge-profile-generate").forEach(button => {
        button.addEventListener("click", () => {
            generateAutoForgeFromAnalysis(analysis, button.dataset.profile || "profile");
        });
    });

    const generateFromProfileBtn = document.getElementById("autoForgeGenerateFromProfileBtn");
    if (generateFromProfileBtn) {
        generateFromProfileBtn.addEventListener("click", () => {
            generateAutoForgeFromAnalysis(analysis, "profile");
        });
    }

    const manualStructureInput = document.getElementById("autoForgeManualStructureInput");
    const manualStructureBtn = document.getElementById("autoForgeManualStructureBtn");
    const manualStructureStatus = document.getElementById("autoForgeManualStructureStatus");

    const refreshManualStructureStatus = () => {
        if (!manualStructureInput || !manualStructureStatus) return null;

        const parsed = parseAutoForgeCustomStructure(
            manualStructureInput.value,
            analysis.targetCount
        );

        manualStructureStatus.textContent = parsed.message;
        manualStructureStatus.classList.toggle("ok", parsed.ok);
        manualStructureStatus.classList.toggle("error", !parsed.ok);

        return parsed;
    };

    const generateFromManualStructure = () => {
        const parsed = refreshManualStructureStatus();
        if (!parsed?.ok) {
            alert(`❌ Własna struktura AUTO FORGE\n\n${parsed?.message || "Sprawdź wpisany wzorzec."}`);
            return;
        }

        autoForgeManualStructureOverride = parsed.normalized;

        generateAutoForgeFromAnalysis(analysis, {
            key: "manual-custom",
            label: `WŁASNY ${parsed.normalized}`,
            icon: "✍️",
            structure: [...parsed.structure],
            sourceStructure: parsed.normalized,
            activity: null
        });
    };

    if (manualStructureInput && manualStructureBtn) {
        manualStructureInput.addEventListener("input", refreshManualStructureStatus);
        manualStructureInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                generateFromManualStructure();
            }
        });
        manualStructureBtn.addEventListener("click", generateFromManualStructure);
        refreshManualStructureStatus();
    }
}

function runAutoForge() {
    const analysis = buildAutoForgeAnalysis();

    if (!analysis.ok) {
        alert(`❌ AUTO FORGE\n\n${analysis.message}`);
        return;
    }

    // AUTO FORGE zawsze najpierw tworzy diagnozę. Generator uruchamia się dopiero
    // osobnym przyciskiem "GENERUJ Z TEGO PROFILU", więc decyzja pozostaje czytelna.
    autoForgeSecondaryOverride = null;
    renderAutoForgeReport(analysis);
    collapseManualFiltersForAutoForge();
}

function validateStructureSettings() {

    const structureFilter =
        document.getElementById("structureFilter").checked;

    if (!structureFilter) {
        return true;
    }
    

    const wanted = [];

    for (let i = 0; i < currentGame.ranges.length; i++) {
        wanted.push(
            Number(document.getElementById(`r${i + 1}`).value)
        );
    }

    // Sprawdzamy, ile liczb łącznie wymaga struktura
    const wantedTotal = wanted.reduce((a, b) => a + b, 0);
    const targetCount = getGeneratorTargetCount();

    if (wantedTotal !== targetCount) {
        alert(
            `❌ Błędna struktura!\n\n` +
            `Wybrana liczba kul: ${targetCount}\n` +
            `Struktura wymaga: ${wantedTotal}\n\n` +
            `Suma pól struktury musi wynosić dokładnie ${targetCount}.`
        );

        return false;
    }

    // Sprawdzamy pojemność każdego zakresu
    for (let i = 0; i < currentGame.ranges.length; i++) {

        const start =
            i === 0
                ? 1
                : currentGame.ranges[i - 1] + 1;

        const end = currentGame.ranges[i];

        const capacity = end - start + 1;

        if (wanted[i] > capacity) {
            alert(
                `❌ Niemożliwa struktura!\n\n` +
                `Zakres ${start}-${end} zawiera tylko ${capacity} liczb,\n` +
                `a zażądałeś ${wanted[i]}.`
            );

            return false;
        }
    }

    return true;
}function generateNumbersByStructure(
    excludedNumbers = [],
    excludeFilter = false,
    requiredNumbers = [],
    blockedRequiredNumbers = [],
    numberScores = null,
    autoForgePlan = null
) {
    const result = [...requiredNumbers];

    const sectorOrder = currentGame.ranges.map((_, index) => index);
    if (autoForgePlan?.sectorScores?.length) {
        sectorOrder.sort((a, b) =>
            (autoForgePlan.sectorScores[b] || 0) - (autoForgePlan.sectorScores[a] || 0)
        );
    }

    for (const i of sectorOrder) {
        const start = i === 0 ? 1 : currentGame.ranges[i - 1] + 1;
        const end = currentGame.ranges[i];
        const wanted = Number(document.getElementById(`r${i + 1}`).value);

        const requiredInRange = result.filter(
            n => n >= start && n <= end
        ).length;
        const needed = wanted - requiredInRange;

        if (needed < 0) {
            return null;
        }

        const pool = [];
        for (let n = start; n <= end; n++) {
            if (
                !result.includes(n) &&
                !blockedRequiredNumbers.includes(n) &&
                (!excludeFilter || !excludedNumbers.includes(n))
            ) {
                pool.push(n);
            }
        }

        if (needed > pool.length) {
            return null;
        }

        for (let j = 0; j < needed; j++) {
            let candidatePool = pool;

            if (autoForgePlan) {
                const parityPool = filterAutoForgePoolByParity(
                    pool,
                    autoForgePlan,
                    result
                );
                if (parityPool.length) candidatePool = parityPool;
            }

            const randomIndex = autoForgePlan
                ? getAutoForgeWeightedRandomIndex(
                    candidatePool,
                    autoForgePlan,
                    result
                )
                : getWeightedRandomIndex(candidatePool, numberScores || []);

            const selected = candidatePool[randomIndex];
            const originalIndex = pool.indexOf(selected);
            if (originalIndex < 0) return null;

            if (autoForgePlan) {
                traceAutoForgeSelection(
                    autoForgePlan,
                    selected,
                    "RANKING",
                    result
                );
            }

            result.push(selected);
            pool.splice(originalIndex, 1);
        }
    }

    return result;
}function validateEvenOddSettings() {

    const evenOddFilter =
        document.getElementById("evenOddFilter").checked;

    if (!evenOddFilter) {
        return true;
    }

    const wantedEven =
        Number(document.getElementById("evenCount").value);

    const wantedOdd =
        Number(document.getElementById("oddCount").value);

    const targetCount = getGeneratorTargetCount();

    if (wantedEven + wantedOdd !== targetCount) {

        alert(
            `❌ Błędne ustawienie parzystości!\n\n` +
            `Wybrana liczba kul: ${targetCount}\n` +
            `Parzyste + nieparzyste: ${wantedEven + wantedOdd}\n\n` +
            `Suma musi wynosić dokładnie ${targetCount}.`
        );

        return false;
    }

    return true;
}
function validateSumSettings() {

    const sumFilter =
        document.getElementById("sumFilter").checked;

    if (!sumFilter) {
        return true;
    }

    const sumMin =
        Number(document.getElementById("sumMin").value);

    const sumMax =
        Number(document.getElementById("sumMax").value);

    if (sumMin > sumMax) {

        alert(
            `❌ Błędny zakres sumy!\n\n` +
            `Suma od: ${sumMin}\n` +
            `Suma do: ${sumMax}\n\n` +
            `Wartość "Suma od" nie może być większa niż "Suma do".`
        );

        return false;
    }

    return true;
}
function getRequiredSettings() {
    const requiredFilter = document.getElementById("requiredFilter")?.checked ?? false;

    if (!requiredFilter) {
        return { enabled: false, pool: [], count: 0 };
    }

    const pool = [...new Set(
        document.getElementById("requiredNumbers").value
            .split(",")
            .map(n => Number(n.trim()))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= currentGame.max)
    )];

    const count = Number(document.getElementById("requiredCount").value);
    return { enabled: true, pool, count };
}

function validateRequiredSettings(excludedNumbers = [], excludeFilter = false) {
    const settings = getRequiredSettings();
    if (!settings.enabled) return true;

    if (!Number.isInteger(settings.count) || settings.count < 0) {
        alert("❌ Wartość 'ile liczb' musi być liczbą całkowitą od 0 wzwyż.");
        return false;
    }

    const targetCount = getGeneratorTargetCount();

    if (settings.count > targetCount) {
        alert(`❌ Kupon ma ${targetCount} liczb, a chcesz pobrać ${settings.count} obowiązkowych.`);
        return false;
    }

    const availablePool = settings.pool.filter(
        n => !excludeFilter || !excludedNumbers.includes(n)
    );

    if (settings.count > availablePool.length) {
        alert(
            `❌ Za mała pula liczb obowiązkowych!\n\n` +
            `Chcesz wylosować: ${settings.count}\n` +
            `Dostępnych po wykluczeniach: ${availablePool.length}`
        );
        return false;
    }

    return true;
}

function drawRequiredNumbers(excludedNumbers = [], excludeFilter = false) {
    const settings = getRequiredSettings();
    if (!settings.enabled || settings.count === 0) return [];

    const pool = settings.pool.filter(
        n => !excludeFilter || !excludedNumbers.includes(n)
    );
    const selected = [];

    for (let i = 0; i < settings.count; i++) {
        const randomIndex = getBatchAwareRandomIndex(pool);
        selected.push(pool.splice(randomIndex, 1)[0]);
    }

    return selected;
}

function generateMiniLotto(attempt = 0, autoForgePlan = null) {

    const MAX_ATTEMPTS = 5000;

    if (attempt === 0) {
        const singleCopyMount = document.getElementById("singleTicketCopyMount");
        if (singleCopyMount) singleCopyMount.innerHTML = "";
    }

    if (autoForgePlan) {
        // Każda próba jest niezależna. Ślad decyzji pokazuje wyłącznie kupon,
        // który ostatecznie przeszedł wszystkie filtry.
        autoForgePlan.selectionTrace = [];
    }

    if (attempt >= MAX_ATTEMPTS) {
        alert(
            "❌ Nie udało się wygenerować zestawu. Sprawdź filtry — mogą być niemożliwe albo zbyt restrykcyjne."
        );
        return null;
    }

    const numbersDiv = document.getElementById("numbers");
    const sumFilter = document.getElementById("sumFilter").checked;
    const sumMin = Number(document.getElementById("sumMin").value);
    const sumMax = Number(document.getElementById("sumMax").value);
    const targetCount = getGeneratorTargetCount();

    if (!validateStructureSettings()) return null;
    if (!validateEvenOddSettings()) return null;
    if (!validateSumSettings()) return null;

    const excludeFilter = document.getElementById("excludeFilter").checked;
    const manualExcludedNumbers = [...new Set(
        document.getElementById("excludedNumbers").value
            .split(",")
            .map(n => Number(n.trim()))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= currentGame.max)
    )];

    if (!validateRequiredSettings(manualExcludedNumbers, excludeFilter)) {
        return null;
    }

    const requiredSettings = getRequiredSettings();
    const manualRequiredNumbers = drawRequiredNumbers(
        manualExcludedNumbers,
        excludeFilter
    );

    const blockedRequiredNumbers = requiredSettings.enabled
        ? requiredSettings.pool.filter(n => !manualRequiredNumbers.includes(n))
        : [];

    const autoDeadPool = autoForgePlan
        ? getSafeAutoForgeDeadPool(
            autoForgePlan,
            excludeFilter ? manualExcludedNumbers : [],
            requiredSettings.enabled ? requiredSettings.pool : []
        )
        : [];

    const effectiveExcludedNumbers = [...new Set([
        ...(excludeFilter ? manualExcludedNumbers : []),
        ...autoDeadPool
    ])];

    const autoTemperatureNumbers = autoForgePlan
        ? drawAutoForgeTemperatureNumbers(
            autoForgePlan,
            manualRequiredNumbers,
            blockedRequiredNumbers,
            effectiveExcludedNumbers
        )
        : [];

    const requiredNumbers = [...new Set([
        ...manualRequiredNumbers,
        ...autoTemperatureNumbers
    ])];

    const structureFilter = document.getElementById("structureFilter").checked;
    let numbers = [];

    if (structureFilter) {
        numbers = generateNumbersByStructure(
            effectiveExcludedNumbers,
            effectiveExcludedNumbers.length > 0,
            requiredNumbers,
            blockedRequiredNumbers,
            autoForgePlan?.numberScores || null,
            autoForgePlan
        );

        if (numbers === null) {
            return generateMiniLotto(attempt + 1, autoForgePlan);
        }
    } else {
        numbers = [...requiredNumbers];
        const pool = [];

        for (let n = 1; n <= currentGame.max; n++) {
            if (
                !numbers.includes(n) &&
                !blockedRequiredNumbers.includes(n) &&
                !effectiveExcludedNumbers.includes(n)
            ) {
                pool.push(n);
            }
        }

        while (numbers.length < targetCount && pool.length) {
            let candidatePool = pool;
            if (autoForgePlan) {
                const parityPool = filterAutoForgePoolByParity(
                    pool,
                    autoForgePlan,
                    numbers
                );
                if (parityPool.length) candidatePool = parityPool;
            }

            const index = autoForgePlan
                ? getAutoForgeWeightedRandomIndex(
                    candidatePool,
                    autoForgePlan,
                    numbers
                )
                : getWeightedRandomIndex(
                    candidatePool,
                    autoForgePlan?.numberScores || []
                );

            const selected = candidatePool[index];
            const originalIndex = pool.indexOf(selected);
            if (originalIndex < 0) break;

            if (autoForgePlan) {
                traceAutoForgeSelection(
                    autoForgePlan,
                    selected,
                    "RANKING",
                    numbers
                );
            }

            numbers.push(selected);
            pool.splice(originalIndex, 1);
        }

        if (numbers.length !== targetCount) {
            return generateMiniLotto(attempt + 1, autoForgePlan);
        }
    }

    const suma = numbers.reduce((a, b) => a + b, 0);

    if (
        (sumFilter && (suma < sumMin || suma > sumMax)) ||
        !isEvenOddValid(numbers)
    ) {
        return generateMiniLotto(attempt + 1, autoForgePlan);
    }

    numbers.sort((a, b) => a - b);

    let euroNumbers = [];
    let extraNumber = [];

    if (currentGame === games.euro) {
        euroNumbers =
            autoForgeSecondaryOverride?.type === "euro"
                ? [...autoForgeSecondaryOverride.numbers]
                : generateNumbers(currentGame.euroCount, currentGame.euroMax);
    }

    if (currentGame === games.extra) {
        extraNumber =
            autoForgeSecondaryOverride?.type === "extra"
                ? [...autoForgeSecondaryOverride.numbers]
                : generateNumbers(currentGame.extraCount, currentGame.extraMax);
    }

    numbersDiv.innerHTML = "";
    numbers.forEach(number => {
        numbersDiv.innerHTML += `
            <div class="ball">
                ${String(number).padStart(2, "0")}
            </div>
        `;
    });

    if (currentGame === games.euro) {
        const euroDiv = document.getElementById("euroNumbers");
        euroDiv.innerHTML = "";

        euroNumbers.forEach(number => {
            euroDiv.innerHTML += `
                <div class="ball">
                    ⭐ ${String(number).padStart(2, "0")}
                </div>
            `;
        });
    }

    if (currentGame === games.extra) {
        const extraDiv = document.getElementById("extraNumber");
        extraDiv.innerHTML = "";

        extraNumber.forEach(number => {
            extraDiv.innerHTML += `
                <div class="ball">
                    ⭐ ${number}
                </div>
            `;
        });
    }

    renderSingleGeneratedCopy(numbers, euroNumbers, extraNumber);

    const stats = document.getElementById("stats");
    const parzyste = numbers.filter(n => n % 2 === 0).length;
    const nieparzyste = numbers.length - parzyste;
    const ranges = new Array(currentGame.ranges.length).fill(0);

    numbers.forEach(n => {
        for (let i = 0; i < currentGame.ranges.length; i++) {
            if (n <= currentGame.ranges[i]) {
                ranges[i]++;
                break;
            }
        }
    });

    stats.innerHTML = `
        <div class="stats-card">
            <h2>📊 Statystyki kuponu</h2>

            ${isSystemGame() ? `
            <div class="stat">
                <span>Tryb</span>
                <strong>${targetCount === currentGame.count ? "Zwykły" : `System ${targetCount} • ${combinationCount(targetCount, currentGame.count)} kombinacji`}</strong>
            </div>
            ` : ""}

            <div class="stat">
                <span>Suma</span>
                <strong>${suma}</strong>
            </div>

            <div class="stat">
                <span>Parzyste</span>
                <strong>${parzyste}</strong>
            </div>

            <div class="stat">
                <span>Nieparzyste</span>
                <strong>${nieparzyste}</strong>
            </div>

            <div class="structure">
                ${currentGame.ranges.map((value, index) => {
                    const start = index === 0
                        ? 1
                        : currentGame.ranges[index - 1] + 1;

                    return `
                        <div class="stat">
                            <span>${start}-${value}</span>
                            <strong>${ranges[index]}</strong>
                        </div>
                    `;
                }).join("")}

                <div class="stat">
                    <span>Struktura</span>
                    <strong>${ranges.join("-")}</strong>
                </div>
            </div>
        </div>
    `;

    lastGeneratedTicketMeta = buildTicketMeta(numbers, euroNumbers, extraNumber);

    if (autoForgePlan) {
        autoForgePlan.lastTemperatureMix = countAutoForgeTemperatureMix(numbers, autoForgePlan);
        autoForgePlan.lastDeadPoolUsed = autoDeadPool;
    }

    autoForgeSecondaryOverride = null;
    return numbers;
}
function generateNumbers(count, max){
if (currentGame === games.multi) {

    const selected = Number(document.getElementById("multiCount").value);
    count = selected;

}
    let numbers = [];
const euroExcludeFilter =
    document.getElementById("euroExcludeFilter")?.checked;

const euroExcludedNumbers =
    document.getElementById("euroExcludedNumbers")?.value
        .split(",")
        .map(n => Number(n.trim()))
        .filter(n => !isNaN(n));
    while(numbers.length < count){

        let n = cryptoRandomInt(1, max);

       if (
    !numbers.includes(n) &&
    (
        currentGame !== games.euro ||
        max !== currentGame.euroMax ||
        !euroExcludeFilter ||
        !euroExcludedNumbers.includes(n)
    )
) {
    numbers.push(n);
}

    }

    numbers.sort((a,b)=>a-b);

    return numbers;

}function isSumValid(numbers){
    

    const sumFilter = document.getElementById("sumFilter").checked;

    if(!sumFilter){
        return true;
    }

    const min = Number(document.getElementById("sumMin").value);

    const max = Number(document.getElementById("sumMax").value);

    const sum = numbers.reduce((a,b)=>a+b,0);

    return sum >= min && sum <= max;

}function isStructureValid(numbers){

    const structureFilter =
        document.getElementById("structureFilter").checked;

    if(!structureFilter){
        return true;
    }

    let ranges = new Array(currentGame.ranges.length).fill(0);

numbers.forEach(n => {

    for (let i = 0; i < currentGame.ranges.length; i++) {

        if (n <= currentGame.ranges[i]) {
            ranges[i]++;
            break;
        }

    }

});
    
    const wanted = [];

for (let i = 0; i < currentGame.ranges.length; i++) {

    wanted.push(
        Number(document.getElementById(`r${i + 1}`).value)
    );

}

    return ranges.every((value, index) => {
    return value === wanted[index];
});
}function isEvenOddValid(numbers){

    const evenOddFilter =
        document.getElementById("evenOddFilter").checked;

    if(!evenOddFilter){
        return true;
    }

    const even = numbers.filter(n => n % 2 === 0).length;
    const odd = numbers.length - even;

    const wantedEven =
        Number(document.getElementById("evenCount").value);

    const wantedOdd =
        Number(document.getElementById("oddCount").value);

    if(wantedEven === 0 && wantedOdd === 0){
        return true;
    }

    return even === wantedEven && odd === wantedOdd;
}

function getStatsPatternConfig() {
    if (currentGame === games.multi) {
        return {
            pair: { limit: 10, maxWindow: 100 },
            triple: { limit: 10, maxWindow: 50 },
            quad: { limit: 8, maxWindow: 30 },
            returnLimit: 12
        };
    }

    if (currentGame === games.lotto) {
        return {
            pair: { limit: 10, maxWindow: 200 },
            triple: { limit: 8, maxWindow: 120 },
            quad: { limit: 6, maxWindow: 60 },
            returnLimit: 10
        };
    }

    // Mini Lotto, EuroJackpot i Extra Pensja mają mniejsze losowania główne,
    // więc możemy bezpiecznie analizować nieco dłuższe okno kombinacji.
    return {
        pair: { limit: 10, maxWindow: 250 },
        triple: { limit: 8, maxWindow: 150 },
        quad: { limit: 5, maxWindow: 80 },
        returnLimit: 10
    };
}

function buildStatsCombinationRanking(draws, size, limit, maxWindow) {
    const source = Array.isArray(draws) ? draws : [];
    const windowSize = Math.min(source.length, maxWindow);
    const sample = source.slice(-windowSize);
    const counts = new Map();

    sample.forEach(draw => {
        const numbers = getValidDrawNumbers(draw);
        forEachCombination(numbers, size, combo => {
            const key = getCombinationKey(combo);
            counts.set(key, (counts.get(key) || 0) + 1);
        });
    });

    const allEntries = [...counts.entries()]
        .map(([key, count]) => ({
            numbers: key.split('|').map(Number),
            count,
            share: windowSize ? count / windowSize : 0
        }))
        .filter(item => item.count >= 2)
        .sort((a, b) =>
            b.count - a.count ||
            b.share - a.share ||
            a.numbers.join('-').localeCompare(b.numbers.join('-'))
        );

    return {
        windowSize,
        sourceWindow: source.length,
        limited: source.length > windowSize,
        entries: allEntries.slice(0, limit),
        repeatedCount: allEntries.length
    };
}

function buildStatsReturnAnalysis(draws, limit = 10) {
    const sample = (Array.isArray(draws) ? draws : [])
        .map(draw => ({
            draw,
            numbers: getValidDrawNumbers(draw)
        }))
        .filter(item => item.numbers.length > 0);

    const opportunities = new Array(currentGame.max + 1).fill(0);
    const returned = new Array(currentGame.max + 1).fill(0);
    const distribution = new Map();

    let overlapTotal = 0;
    let transitionCount = 0;
    let latestOverlapNumbers = [];
    let latestFrom = null;
    let latestTo = null;

    for (let i = 0; i < sample.length - 1; i++) {
        const previous = sample[i];
        const next = sample[i + 1];
        const nextSet = new Set(next.numbers);
        const overlapNumbers = previous.numbers.filter(number => nextSet.has(number));

        previous.numbers.forEach(number => {
            opportunities[number]++;
            if (nextSet.has(number)) returned[number]++;
        });

        const overlap = overlapNumbers.length;
        distribution.set(overlap, (distribution.get(overlap) || 0) + 1);
        overlapTotal += overlap;
        transitionCount++;

        if (i === sample.length - 2) {
            latestOverlapNumbers = overlapNumbers;
            latestFrom = previous.draw;
            latestTo = next.draw;
        }
    }

    const ranking = [];
    for (let number = 1; number <= currentGame.max; number++) {
        if (!opportunities[number]) continue;
        ranking.push({
            number,
            returned: returned[number],
            opportunities: opportunities[number],
            rate: returned[number] / opportunities[number]
        });
    }

    ranking.sort((a, b) =>
        b.returned - a.returned ||
        b.rate - a.rate ||
        b.opportunities - a.opportunities ||
        a.number - b.number
    );

    return {
        transitionCount,
        average: transitionCount ? overlapTotal / transitionCount : 0,
        distribution: [...distribution.entries()]
            .map(([count, occurrences]) => ({ count, occurrences }))
            .sort((a, b) => a.count - b.count),
        ranking: ranking.slice(0, limit),
        latestOverlapNumbers,
        latestFrom,
        latestTo
    };
}

function formatStatsPatternNumbers(numbers) {
    return numbers
        .map(number => String(number).padStart(2, '0'))
        .join(' – ');
}

function renderStatsPatternBox(title, icon, stats) {
    const windowLabel = stats.limited
        ? `${stats.windowSize} z ${stats.sourceWindow} los.`
        : `${stats.windowSize} los.`;

    const rows = stats.entries.length
        ? stats.entries.map(item => `
            <div class="stats-pattern-row">
                <span>${formatStatsPatternNumbers(item.numbers)}</span>
                <strong>${item.count}× <small>${Math.round(item.share * 100)}%</small></strong>
            </div>
        `).join('')
        : `
            <div class="stats-pattern-empty">
                <span>Brak powtarzających się układów</span>
                <strong>—</strong>
            </div>
        `;

    return `
        <details class="statsBox stats-pattern-box stats-collapsible-card">
            <summary class="stats-collapsible-summary">
                <h3>${icon} ${title} <small>${windowLabel}</small></h3>
                <span>Rozwiń</span>
            </summary>
            <div class="stats-collapsible-body">
                ${rows}
                ${stats.limited ? `
                    <p class="stats-pattern-note">
                        Dłuższy zakres został skrócony dla tej statystyki, aby zachować nacisk na aktualne wzorce i płynność aplikacji.
                    </p>
                ` : ''}
            </div>
        </details>
    `;
}


function buildStatsPulseSnapshot(draws, windowSize) {
    const source = Array.isArray(draws) ? draws : [];
    const sample = source
        .slice(-Math.min(windowSize, source.length))
        .filter(draw => getValidDrawNumbers(draw).length > 0);

    if (sample.length < 2) return null;

    const analysis = analyzeAutoForgeWindow(source, windowSize);
    const bands = getAutoForgeBands();
    const thresholds = getClusterThresholds();

    const bandStats = bands.map((band, index) => {
        const capacity = band.end - band.start + 1;
        const capacityShare = capacity / currentGame.max;
        const share = analysis.bandShares[index] || 0;
        return {
            ...band,
            share,
            intensity: capacityShare > 0 ? share / capacityShare : 0
        };
    });

    const bandRanking = [...bandStats].sort(
        (a, b) => b.intensity - a.intensity || b.share - a.share
    );
    const dominantBand = bandRanking[0];

    const centers = sample.map(draw => {
        const nums = getValidDrawNumbers(draw);
        return nums.length ? average(nums) : 0;
    }).filter(Boolean);

    const split = Math.max(1, Math.floor(centers.length / 2));
    const older = centers.slice(0, split);
    const newer = centers.slice(split);
    const olderCenter = average(older);
    const newerCenter = newer.length ? average(newer) : olderCenter;
    const migrationDelta = newerCenter - olderCenter;
    const migrationThreshold = Math.max(0.6, currentGame.max * 0.01);
    const direction = migrationDelta > migrationThreshold
        ? 1
        : migrationDelta < -migrationThreshold
            ? -1
            : 0;

    let focusKeys;
    if (direction > 0) {
        focusKeys = ["MID", "HIGH"];
    } else if (direction < 0) {
        focusKeys = ["LOW", "MID"];
    } else if (dominantBand?.key === "HIGH") {
        focusKeys = ["MID", "HIGH"];
    } else if (dominantBand?.key === "LOW") {
        focusKeys = ["LOW", "MID"];
    } else {
        const low = bandStats.find(x => x.key === "LOW");
        const high = bandStats.find(x => x.key === "HIGH");
        focusKeys = (high?.intensity || 0) >= (low?.intensity || 0)
            ? ["MID", "HIGH"]
            : ["LOW", "MID"];
    }

    const focusShare = bandStats
        .filter(band => focusKeys.includes(band.key))
        .reduce((sum, band) => sum + band.share, 0);

    const migrationStrength = clamp(
        Math.abs(migrationDelta) / Math.max(1, currentGame.max * 0.06),
        0,
        1
    );

    const sectorScores = analysis.sectorAverageCounts.map((avgCount, index) => {
        const bounds = getSectorBounds(index);
        const midpoint = (bounds.start + bounds.end) / 2;
        const position = ((midpoint - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
        const migrationFactor = Math.max(
            0.60,
            1 + direction * position * migrationStrength * 0.32
        );
        const clusterFactor =
            1 +
            (analysis.sectorClusterRates[index] || 0) * 0.80 +
            (analysis.sectorStrongClusterRates[index] || 0) * 1.00;

        return Math.max(0.001, avgCount || 0) * clusterFactor * migrationFactor;
    });

    const topSectorIndex = sectorScores
        .map((score, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score)[0]?.index ?? 0;

    const clusterHits = Math.round(
        (analysis.sectorClusterRates[topSectorIndex] || 0) * sample.length
    );
    const strongHits = Math.round(
        (analysis.sectorStrongClusterRates[topSectorIndex] || 0) * sample.length
    );

    return {
        requestedWindow: windowSize,
        windowSize: sample.length,
        direction,
        migrationDelta,
        directionLabel: direction > 0 ? "↑ W GÓRĘ" : direction < 0 ? "↓ W DÓŁ" : "→ STABILNIE",
        dominantBand: dominantBand?.key || "—",
        dominantBandShare: dominantBand?.share || 0,
        focusZone: focusKeys.join("/"),
        focusShare,
        topSectorIndex,
        topSectorLabel: getSectorLabel(topSectorIndex),
        topSectorAverage: analysis.sectorAverageCounts[topSectorIndex] || 0,
        clusterHits,
        strongHits,
        maxCluster: analysis.sectorMax[topSectorIndex] || 0,
        clusterThreshold: thresholds.cluster,
        strongThreshold: thresholds.strong
    };
}

function buildStatsShortPulse(draws) {
    const windows = [2, 3, 4, 5];
    const snapshots = windows
        .map(windowSize => buildStatsPulseSnapshot(draws, windowSize))
        .filter(Boolean);

    if (!snapshots.length) {
        return {
            snapshots: [],
            verdict: "ZA MAŁO DANYCH",
            verdictClass: "low",
            agreement: 0,
            direction: 0,
            focusZone: "—",
            topSector: "—",
            summary: "Wczytaj co najmniej 2 poprawne losowania, aby policzyć puls 2/3/4/5."
        };
    }

    const pickMode = values => {
        const counts = new Map();
        values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
    };

    const directionMode = pickMode(snapshots.map(item => item.direction));
    const focusMode = pickMode(snapshots.map(item => item.focusZone));
    const sectorMode = pickMode(snapshots.map(item => item.topSectorLabel));

    const directionShare = directionMode[1] / snapshots.length;
    const focusShare = focusMode[1] / snapshots.length;
    const sectorShare = sectorMode[1] / snapshots.length;
    const agreement = Math.round(
        clamp(directionShare * 0.40 + focusShare * 0.38 + sectorShare * 0.22, 0, 1) * 100
    );

    const direction = Number(directionMode[0]);
    let verdict;
    if (agreement >= 78 && direction > 0) {
        verdict = "SILNY PULS W GÓRĘ";
    } else if (agreement >= 78 && direction < 0) {
        verdict = "SILNY PULS W DÓŁ";
    } else if (agreement >= 74 && direction === 0) {
        verdict = "STABILNY PULS";
    } else if (agreement >= 64 && direction > 0) {
        verdict = "PULS LEKKO W GÓRĘ";
    } else if (agreement >= 64 && direction < 0) {
        verdict = "PULS LEKKO W DÓŁ";
    } else {
        verdict = "PULS MIESZANY";
    }

    const verdictClass = agreement >= 78 ? "high" : agreement >= 62 ? "medium" : "low";
    const averageFocusShare = average(snapshots.map(item => item.focusShare));

    return {
        snapshots,
        verdict,
        verdictClass,
        agreement,
        direction,
        focusZone: focusMode[0],
        focusVotes: focusMode[1],
        topSector: sectorMode[0],
        sectorVotes: sectorMode[1],
        averageFocusShare,
        summary:
            `${focusMode[1]}/${snapshots.length} krótkie okna wskazują ${focusMode[0]}, ` +
            `${sectorMode[1]}/${snapshots.length} mają najmocniejszy sektor ${sectorMode[0]}.`
    };
}

function buildStatsClusterContinuity(draws, maxDraws = 5) {
    const sample = (Array.isArray(draws) ? draws : [])
        .slice(-Math.min(maxDraws, draws.length))
        .filter(draw => getValidDrawNumbers(draw).length > 0);
    const thresholds = getClusterThresholds();

    const rows = currentGame.ranges.map((_, sectorIndex) => {
        const bounds = getSectorBounds(sectorIndex);
        const counts = sample.map(draw =>
            getValidDrawNumbers(draw).filter(
                number => number >= bounds.start && number <= bounds.end
            ).length
        );

        const clusterHits = counts.filter(count => count >= thresholds.cluster).length;
        const strongHits = counts.filter(count => count >= thresholds.strong).length;
        let currentStreak = 0;
        for (let i = counts.length - 1; i >= 0; i--) {
            if (counts[i] >= thresholds.cluster) currentStreak++;
            else break;
        }

        const avg = counts.length ? average(counts) : 0;
        const max = counts.length ? Math.max(...counts) : 0;
        const score = clusterHits * 2.2 + strongHits * 2.6 + currentStreak * 1.7 + avg;

        let status = "spokojny";
        if (currentStreak >= 2) status = "🔥 utrzymuje skupisko";
        else if (strongHits >= 2) status = "🔥 silny";
        else if (clusterHits >= Math.max(2, Math.ceil(sample.length * 0.5))) status = "aktywny";
        else if (max >= thresholds.strong) status = "pojedyncze uderzenie";

        return {
            sectorIndex,
            label: getSectorLabel(sectorIndex),
            counts,
            clusterHits,
            strongHits,
            currentStreak,
            avg,
            max,
            score,
            status
        };
    });

    rows.sort((a, b) =>
        b.score - a.score ||
        b.currentStreak - a.currentStreak ||
        b.clusterHits - a.clusterHits ||
        b.avg - a.avg
    );

    return {
        windowSize: sample.length,
        thresholds,
        rows: rows.slice(0, currentGame === games.multi ? 6 : rows.length)
    };
}

function buildStatsSectorMigration(draws, maxDraws = 5) {
    const sample = (Array.isArray(draws) ? draws : [])
        .slice(-Math.min(maxDraws, draws.length))
        .filter(draw => getValidDrawNumbers(draw).length > 0);

    const points = sample.map(draw => {
        const numbers = getValidDrawNumbers(draw);
        const counts = new Array(currentGame.ranges.length).fill(0);
        numbers.forEach(number => counts[getSectorIndex(number)]++);
        const maxCount = Math.max(...counts, 0);
        const candidates = counts
            .map((count, index) => ({ count, index }))
            .filter(item => item.count === maxCount);
        const center = numbers.length ? average(numbers) : 0;
        const chosen = [...candidates].sort((a, b) => {
            const aBounds = getSectorBounds(a.index);
            const bBounds = getSectorBounds(b.index);
            const aMid = (aBounds.start + aBounds.end) / 2;
            const bMid = (bBounds.start + bBounds.end) / 2;
            return Math.abs(aMid - center) - Math.abs(bMid - center);
        })[0] || { index: 0, count: 0 };

        return {
            date: draw.data || "—",
            index: chosen.index,
            label: getSectorLabel(chosen.index),
            count: chosen.count
        };
    });

    let up = 0;
    let down = 0;
    let stable = 0;
    for (let i = 1; i < points.length; i++) {
        const diff = points[i].index - points[i - 1].index;
        if (diff > 0) up++;
        else if (diff < 0) down++;
        else stable++;
    }

    const net = points.length >= 2
        ? points[points.length - 1].index - points[0].index
        : 0;
    const directionText = net > 0
        ? `↑ ${Math.abs(net)} ${Math.abs(net) === 1 ? "sektor" : "sektory"} w górę`
        : net < 0
            ? `↓ ${Math.abs(net)} ${Math.abs(net) === 1 ? "sektor" : "sektory"} w dół`
            : "→ bez zmiany netto";

    return {
        points,
        up,
        down,
        stable,
        net,
        directionText
    };
}


function renderStatsStructureTrendChart(draws, ranking) {
    const sample = (Array.isArray(draws) ? draws : [])
        .filter(draw => getValidDrawNumbers(draw).length > 0);
    const top = (Array.isArray(ranking) ? ranking : []).slice(0, 5);

    if (sample.length < 2 || !top.length) {
        return `
            <div class="statsBox stats-structure-chart-box">
                <h3>📈 TREND TOP 5 STRUKTUR</h3>
                <div class="stats-migration-empty">Za mało danych do wykresu struktur.</div>
            </div>
        `;
    }

    const rollingSize = Math.min(10, Math.max(2, Math.round(sample.length / 4)));
    const width = 920;
    const height = 310;
    const left = 56;
    const right = 24;
    const topPad = 22;
    const bottom = 54;
    const plotWidth = width - left - right;
    const plotHeight = height - topPad - bottom;

    const series = top.map((item, seriesIndex) => {
        const values = sample.map((_, index) => {
            const start = Math.max(0, index - rollingSize + 1);
            const windowDraws = sample.slice(start, index + 1);
            const count = windowDraws.filter(
                draw => getStructureForNumbers(draw.liczby || []) === item.key
            ).length;
            return windowDraws.length ? (count / windowDraws.length) * 100 : 0;
        });
        return { item, values, seriesIndex };
    });

    const maxValue = Math.max(1, ...series.flatMap(entry => entry.values));
    const yMax = Math.min(100, Math.max(25, Math.ceil(maxValue / 10) * 10));
    const xFor = index => sample.length === 1
        ? left + plotWidth / 2
        : left + (index / (sample.length - 1)) * plotWidth;
    const yFor = value => topPad + ((yMax - clamp(value, 0, yMax)) / yMax) * plotHeight;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(part => Math.round(yMax * part));
    const yGrid = yTicks.map(value => {
        const y = yFor(value);
        return `
            <line class="stats-structure-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" />
            <text class="stats-structure-axis-label" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${value}%</text>
        `;
    }).join("");

    const labelStep = Math.max(1, Math.ceil(sample.length / 8));
    const xLabels = sample.map((draw, index) => {
        const show = index === 0 || index === sample.length - 1 || index % labelStep === 0;
        if (!show) return "";
        const shortDate = String(draw.data || "—").replace(/\.\d{4}$/, "");
        return `<text class="stats-structure-axis-label stats-structure-date-label" x="${xFor(index).toFixed(1)}" y="${height - 18}" text-anchor="middle">${shortDate}</text>`;
    }).join("");

    const lines = series.map(entry => {
        const points = entry.values
            .map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`)
            .join(" ");
        const lastValue = entry.values[entry.values.length - 1] || 0;
        return `
            <polyline class="stats-structure-series stats-structure-series-${entry.seriesIndex + 1}" points="${points}" />
            <circle class="stats-structure-last-dot stats-structure-dot-${entry.seriesIndex + 1}" cx="${xFor(sample.length - 1).toFixed(1)}" cy="${yFor(lastValue).toFixed(1)}" r="3.2">
                <title>${entry.item.key}: ${lastValue.toFixed(0)}% w ostatnim oknie kroczącym</title>
            </circle>
        `;
    }).join("");

    const legend = series.map(entry => `
        <span><i class="stats-structure-legend-dot stats-structure-dot-${entry.seriesIndex + 1}"></i>#${entry.seriesIndex + 1} ${entry.item.key} • ${entry.item.trend.directionShort}</span>
    `).join("");

    return `
        <div class="statsBox stats-structure-chart-box">
            <h3>📈 TREND TOP 5 STRUKTUR</h3>
            <div class="stats-structure-chart-summary">
                <span>Okno analizy: <strong>${sample.length}</strong></span>
                <span>Momentum: <strong>okno kroczące ${rollingSize} los.</strong></span>
                <span>Lider: <strong>${top[0].key}</strong></span>
                <span>Trend lidera: <strong class="structure-trend-${top[0].trend.direction > 0 ? "up" : top[0].trend.direction < 0 ? "down" : "flat"}">${top[0].trend.directionText}</strong></span>
            </div>
            <div class="stats-structure-svg-wrap">
                <svg class="stats-structure-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend aktywności pięciu najczęstszych struktur">
                    ${yGrid}
                    <line class="stats-structure-axis" x1="${left}" y1="${topPad}" x2="${left}" y2="${height - bottom}" />
                    <line class="stats-structure-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
                    ${lines}
                    ${xLabels}
                </svg>
            </div>
            <div class="stats-structure-legend">${legend}</div>
            <p class="stats-migration-note">
                Linia pokazuje udział danej struktury w krótkim oknie kroczącym. Wzrost linii oznacza, że struktura pojawia się częściej w świeższej części wybranego zakresu; spadek oznacza wygaszanie aktywności.
            </p>
        </div>
    `;
}

function renderStatsMigrationChart(draws) {
    const sample = (Array.isArray(draws) ? draws : [])
        .filter(draw => getValidDrawNumbers(draw).length > 0);

    if (sample.length < 2) {
        return `
            <div class="statsBox stats-migration-chart-box">
                <h3>📈 WYKRES MIGRACJI</h3>
                <div class="stats-migration-empty">
                    Za mało danych. Potrzebne są co najmniej 2 losowania.
                </div>
            </div>
        `;
    }

    const centers = sample.map(draw => {
        const numbers = getValidDrawNumbers(draw);
        return {
            date: draw.data || "—",
            value: numbers.length ? average(numbers) : 0
        };
    });

    const split = Math.max(1, Math.floor(centers.length / 2));
    const older = centers.slice(0, split);
    const newer = centers.slice(split);
    const olderAverage = average(older.map(point => point.value));
    const newerAverage = newer.length
        ? average(newer.map(point => point.value))
        : olderAverage;
    const delta = newerAverage - olderAverage;
    const threshold = Math.max(0.6, currentGame.max * 0.01);
    const direction = delta > threshold ? 1 : delta < -threshold ? -1 : 0;
    const directionText = direction > 0
        ? "↑ W GÓRĘ"
        : direction < 0
            ? "↓ W DÓŁ"
            : "→ STABILNIE";

    const width = 920;
    const height = 300;
    const left = 58;
    const right = 26;
    const top = 22;
    const bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    const xFor = index => centers.length === 1
        ? left + plotWidth / 2
        : left + (index / (centers.length - 1)) * plotWidth;
    const yFor = value => top +
        ((currentGame.max - clamp(value, 1, currentGame.max)) /
        Math.max(1, currentGame.max - 1)) * plotHeight;

    const polylinePoints = centers
        .map((point, index) => `${xFor(index).toFixed(1)},${yFor(point.value).toFixed(1)}`)
        .join(" ");

    const bands = getAutoForgeBands();
    const bandRects = bands.map(band => {
        const yTop = yFor(band.end);
        const yBottom = yFor(band.start);
        const bandHeight = Math.max(1, yBottom - yTop);
        return `
            <rect
                class="stats-migration-band stats-migration-band-${band.key.toLowerCase()}"
                x="${left}"
                y="${yTop.toFixed(1)}"
                width="${plotWidth}"
                height="${bandHeight.toFixed(1)}"
                rx="5" />
            <text
                class="stats-migration-band-label"
                x="${width - right - 8}"
                y="${(yTop + 16).toFixed(1)}"
                text-anchor="end">
                ${band.key} ${band.start}-${band.end}
            </text>
        `;
    }).join("");

    const yTicks = [...new Set([
        1,
        ...bands.flatMap(band => [band.start, band.end]),
        currentGame.max
    ])]
        .filter(value => value >= 1 && value <= currentGame.max)
        .sort((a, b) => a - b);

    const yGrid = yTicks.map(value => {
        const y = yFor(value);
        return `
            <line class="stats-migration-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" />
            <text class="stats-migration-axis-label" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${value}</text>
        `;
    }).join("");

    const labelTarget = 8;
    const labelStep = Math.max(1, Math.ceil(centers.length / labelTarget));
    const xLabels = centers.map((point, index) => {
        const show = index === 0 || index === centers.length - 1 || index % labelStep === 0;
        if (!show) return "";
        const shortDate = String(point.date).replace(/\.\d{4}$/, "");
        return `
            <text
                class="stats-migration-axis-label stats-migration-date-label"
                x="${xFor(index).toFixed(1)}"
                y="${height - 18}"
                text-anchor="middle">${shortDate}</text>
        `;
    }).join("");

    const pointRadius = centers.length > 120 ? 1.2 : centers.length > 50 ? 1.7 : 2.7;
    const pointDots = centers.map((point, index) => `
        <circle
            class="stats-migration-point-dot"
            cx="${xFor(index).toFixed(1)}"
            cy="${yFor(point.value).toFixed(1)}"
            r="${pointRadius}">
            <title>${point.date}: środek ${point.value.toFixed(1)}</title>
        </circle>
    `).join("");

    const olderX = left + plotWidth * 0.18;
    const newerX = left + plotWidth * 0.82;
    const trendLine = `
        <line
            class="stats-migration-trend-line"
            x1="${olderX.toFixed(1)}"
            y1="${yFor(olderAverage).toFixed(1)}"
            x2="${newerX.toFixed(1)}"
            y2="${yFor(newerAverage).toFixed(1)}"
            marker-end="url(#migrationArrow)" />
    `;

    return `
        <div class="statsBox stats-migration-chart-box">
            <h3>📈 WYKRES MIGRACJI</h3>

            <div class="stats-migration-chart-summary">
                <div>
                    <span>Starsza połowa</span>
                    <strong>${olderAverage.toFixed(1)}</strong>
                </div>
                <div>
                    <span>Nowsza połowa</span>
                    <strong>${newerAverage.toFixed(1)}</strong>
                </div>
                <div>
                    <span>Zmiana</span>
                    <strong>${delta >= 0 ? "+" : ""}${delta.toFixed(1)}</strong>
                </div>
                <div>
                    <span>Kierunek</span>
                    <strong class="${direction > 0 ? "migration-up" : direction < 0 ? "migration-down" : "migration-flat"}">${directionText}</strong>
                </div>
            </div>

            <div class="stats-migration-svg-wrap">
                <svg
                    class="stats-migration-svg"
                    viewBox="0 0 ${width} ${height}"
                    role="img"
                    aria-label="Wykres migracji środka ciężkości losowań">
                    <defs>
                        <marker id="migrationArrow" markerWidth="8" markerHeight="8" refX="6.5" refY="3.5" orient="auto">
                            <polygon points="0 0, 7 3.5, 0 7" class="stats-migration-arrow-head"></polygon>
                        </marker>
                    </defs>
                    ${bandRects}
                    ${yGrid}
                    <line class="stats-migration-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" />
                    <line class="stats-migration-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
                    <polyline class="stats-migration-series" points="${polylinePoints}" />
                    ${pointDots}
                    ${trendLine}
                    ${xLabels}
                </svg>
            </div>

            <div class="stats-migration-legend">
                <span><i class="migration-line-swatch"></i> Środek ciężkości każdego losowania</span>
                <span><i class="migration-trend-swatch"></i> Kierunek starsza połowa → nowsza połowa</span>
            </div>
            <p class="stats-migration-note">
                Im wyżej idzie linia, tym bardziej koncentracja przesuwa się w stronę wyższych liczb. Tło LOW / MID / HIGH pokazuje, przez którą część planszy przechodzi środek losowania.
            </p>
        </div>
    `;
}

function renderStatsPulsePanel(pulse, continuity, migration) {
    const snapshotCards = pulse.snapshots.length
        ? pulse.snapshots.map(item => `
            <div class="stats-pulse-window-card">
                <div class="stats-pulse-window-head">
                    <strong>${item.requestedWindow}</strong>
                    <span>${item.directionLabel}</span>
                </div>
                <div class="stats-pulse-window-row">
                    <span>Strefa</span>
                    <strong>${item.focusZone} • ${Math.round(item.focusShare * 100)}%</strong>
                </div>
                <div class="stats-pulse-window-row">
                    <span>Dominacja</span>
                    <strong>${item.dominantBand} • ${Math.round(item.dominantBandShare * 100)}%</strong>
                </div>
                <div class="stats-pulse-window-row">
                    <span>TOP sektor</span>
                    <strong>${item.topSectorLabel}</strong>
                </div>
                <div class="stats-pulse-window-row">
                    <span>Skupisko</span>
                    <strong>${item.clusterHits}/${item.windowSize} • max ${item.maxCluster}</strong>
                </div>
            </div>
        `).join("")
        : `<div class="stats-pulse-empty">Za mało danych do policzenia pulsu 2/3/4/5.</div>`;

    const continuityRows = continuity.rows.length
        ? continuity.rows.map(item => `
            <tr>
                <td><strong>${item.label}</strong></td>
                <td>${item.counts.join(" → ") || "—"}</td>
                <td>${item.clusterHits}/${continuity.windowSize}</td>
                <td>${item.strongHits}/${continuity.windowSize}</td>
                <td>${item.currentStreak}</td>
                <td><span class="stats-cluster-status">${item.status}</span></td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">Za mało danych do analizy skupisk.</td></tr>`;

    const migrationTimeline = migration.points.length
        ? migration.points.map((point, index) => `
            <div class="stats-sector-migration-point">
                <small>${point.date}</small>
                <strong>${point.label}</strong>
                <span>${point.count} kul</span>
                ${index < migration.points.length - 1 ? `<i>→</i>` : ""}
            </div>
        `).join("")
        : `<div class="stats-pulse-empty">Za mało danych do migracji sektorowej.</div>`;

    return `
        <section class="stats-pulse-panel">
            <div class="stats-pulse-head">
                <div>
                    <span>💓 PULS PLANSZY • 2 / 3 / 4 / 5</span>
                    <strong>${pulse.verdict}</strong>
                    <small>Stały krótki odczyt niezależny od głównego zakresu statystyk.</small>
                </div>
                <div class="stats-pulse-score ${pulse.verdictClass}">
                    <span>Spójność pulsu</span>
                    <strong>${pulse.agreement}/100</strong>
                </div>
            </div>

            <div class="stats-pulse-consensus">
                <div><span>Wspólna strefa</span><strong>${pulse.focusZone}</strong></div>
                <div><span>Średni udział strefy</span><strong>${Math.round((pulse.averageFocusShare || 0) * 100)}%</strong></div>
                <div><span>Najczęstszy TOP sektor</span><strong>${pulse.topSector}</strong></div>
                <div><span>Werdykt</span><strong>${pulse.summary}</strong></div>
            </div>

            <div class="stats-pulse-window-grid">
                ${snapshotCards}
            </div>

            <div class="stats-pulse-subsection">
                <div class="stats-pulse-subhead">
                    <div>
                        <span>🔥 CIĄGŁOŚĆ SKUPISK</span>
                        <strong>Ostatnie ${continuity.windowSize} losowań</strong>
                    </div>
                    <small>
                        Skupisko = ${continuity.thresholds.cluster}+ kul w sektorze, silne = ${continuity.thresholds.strong}+.
                    </small>
                </div>
                <div class="stats-pulse-table-wrap">
                    <table class="statsTable stats-pulse-table">
                        <thead>
                            <tr>
                                <th>Sektor</th>
                                <th>Obsada losowanie po losowaniu</th>
                                <th>${continuity.thresholds.cluster}+</th>
                                <th>${continuity.thresholds.strong}+</th>
                                <th>Seria teraz</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>${continuityRows}</tbody>
                    </table>
                </div>
            </div>

            <div class="stats-pulse-subsection">
                <div class="stats-pulse-subhead">
                    <div>
                        <span>🧭 MIGRACJA SEKTOROWA</span>
                        <strong>${migration.directionText}</strong>
                    </div>
                    <small>Pokazuje dominujący sektor kolejnych krótkich losowań: skąd → dokąd przesuwa się koncentracja.</small>
                </div>
                <div class="stats-sector-migration-timeline">
                    ${migrationTimeline}
                </div>
                ${migration.points.length >= 2 ? `
                    <div class="stats-sector-migration-summary">
                        <span>Ruchy w górę <strong>${migration.up}</strong></span>
                        <span>Ruchy w dół <strong>${migration.down}</strong></span>
                        <span>Bez zmiany <strong>${migration.stable}</strong></span>
                    </div>
                ` : ""}
            </div>
        </section>
    `;
}


function getColdComebackConfig(selectedWindow = analysisWindow) {
    const drawCount = getHistoricalDrawCount();
    const hitProbability = currentGame.max > 0 ? drawCount / currentGame.max : 0.1;

    // Próg „martwej” liczby jest zależny od gry: im rzadziej pojedyncza liczba
    // wpada w losowaniu, tym dłuższa przerwa jest potrzebna, żeby uznać ją za DEAD.
    const deadDrought = Math.max(
        6,
        Math.ceil(Math.log(0.10) / Math.log(Math.max(0.01, 1 - hitProbability)))
    );

    const minLookback = currentGame === games.multi ? 10 : 15;
    const maxLookback = currentGame === games.multi ? 30 : 40;
    const lookback = clamp(Number(selectedWindow) || 20, minLookback, maxLookback);

    return {
        lookback,
        deadDrought,
        deepColdDrought: Math.max(4, Math.ceil(deadDrought * 0.65)),
        hitProbability
    };
}

function getNumberDroughtBeforeIndex(draws, number, endExclusive) {
    let drought = 0;
    for (let i = endExclusive - 1; i >= 0; i--) {
        const nums = getValidDrawNumbers(draws[i]);
        if (nums.includes(number)) return drought;
        drought++;
    }
    return drought;
}

function buildColdStateSnapshot(draws, endExclusive, config) {
    const start = Math.max(0, endExclusive - config.lookback);
    const sample = draws.slice(start, endExclusive);
    const hits = new Array(currentGame.max + 1).fill(0);

    sample.forEach(draw => {
        getValidDrawNumbers(draw).forEach(number => {
            hits[number]++;
        });
    });

    const values = hits.slice(1).sort((a, b) => a - b);
    const q25Index = values.length ? Math.floor((values.length - 1) * 0.25) : 0;
    const coldHitThreshold = values.length ? values[q25Index] : 0;
    const states = new Array(currentGame.max + 1).fill(null);

    for (let number = 1; number <= currentGame.max; number++) {
        const drought = getNumberDroughtBeforeIndex(draws, number, endExclusive);
        const isCold = hits[number] <= coldHitThreshold;
        const isDead = drought >= config.deadDrought;
        const isDeepCold = isCold && !isDead && drought >= config.deepColdDrought;

        states[number] = {
            number,
            hits: hits[number],
            drought,
            isCold,
            isDeepCold,
            isDead,
            status: isDead ? "DEAD" : isDeepCold ? "DEEP COLD" : isCold ? "COLD" : "ACTIVE"
        };
    }

    return {
        sampleSize: sample.length,
        coldHitThreshold,
        states
    };
}

function buildStatsColdComebackAnalysis(draws, selectedWindow = analysisWindow) {
    const ordered = sortDrawsChronologically(draws || []);
    const config = getColdComebackConfig(selectedWindow);
    const coldOpportunities = new Array(currentGame.max + 1).fill(0);
    const coldComebacks = new Array(currentGame.max + 1).fill(0);
    const deadOpportunities = new Array(currentGame.max + 1).fill(0);
    const deadComebacks = new Array(currentGame.max + 1).fill(0);
    const events = [];

    if (ordered.length < 2) {
        return {
            config,
            latestComebacks: [],
            currentRanking: [],
            exclusionCandidates: [],
            events: [],
            analyzedTransitions: 0,
            totalColdComebacks: 0,
            totalDeadComebacks: 0
        };
    }

    const transitionCount = Math.min(Math.max(2, Number(selectedWindow) || 20), ordered.length - 1);
    const firstTargetIndex = Math.max(1, ordered.length - transitionCount);

    for (let i = 1; i < ordered.length; i++) {
        // Nie klasyfikujemy po 1–2 losowaniach, bo wtedy COLD byłby przypadkowy.
        if (i < Math.min(5, config.lookback)) continue;

        const snapshot = buildColdStateSnapshot(ordered, i, config);
        const currentSet = new Set(getValidDrawNumbers(ordered[i]));
        const includeEvent = i >= firstTargetIndex;

        for (let number = 1; number <= currentGame.max; number++) {
            const state = snapshot.states[number];
            if (!state) continue;

            if (state.isCold) {
                coldOpportunities[number]++;
                if (currentSet.has(number)) {
                    coldComebacks[number]++;
                    if (includeEvent) {
                        events.push({
                            number,
                            date: ordered[i].data || "—",
                            drawNumber: ordered[i].numer || "—",
                            priorStatus: state.status,
                            priorDrought: state.drought,
                            priorHits: state.hits,
                            lookback: snapshot.sampleSize
                        });
                    }
                }
            }

            if (state.isDead) {
                deadOpportunities[number]++;
                if (currentSet.has(number)) deadComebacks[number]++;
            }
        }
    }

    const latestIndex = ordered.length - 1;
    const latestSnapshot = latestIndex >= 1
        ? buildColdStateSnapshot(ordered, latestIndex, config)
        : null;
    const latestNumbers = new Set(getValidDrawNumbers(ordered[latestIndex]));
    const latestComebacks = latestSnapshot
        ? [...latestNumbers]
            .map(number => latestSnapshot.states[number])
            .filter(state => state?.isCold)
            .map(state => ({
                number: state.number,
                priorStatus: state.status,
                priorDrought: state.drought,
                priorHits: state.hits,
                coldRate: coldOpportunities[state.number]
                    ? coldComebacks[state.number] / coldOpportunities[state.number]
                    : 0,
                deadRate: deadOpportunities[state.number]
                    ? deadComebacks[state.number] / deadOpportunities[state.number]
                    : 0
            }))
            .sort((a, b) => b.priorDrought - a.priorDrought || a.number - b.number)
        : [];

    // Stan „na teraz” liczymy po ostatnim zaimportowanym losowaniu.
    const currentSnapshot = buildColdStateSnapshot(ordered, ordered.length, config);
    const expectedHits = Math.max(0.25, config.hitProbability * currentSnapshot.sampleSize);

    const currentRanking = [];
    for (let number = 1; number <= currentGame.max; number++) {
        const state = currentSnapshot.states[number];
        if (!state || !state.isCold) continue;

        const coldRate = coldOpportunities[number]
            ? coldComebacks[number] / coldOpportunities[number]
            : 0;
        const deadRate = deadOpportunities[number]
            ? deadComebacks[number] / deadOpportunities[number]
            : 0;

        const droughtFactor = clamp(state.drought / Math.max(1, config.deadDrought * 1.5), 0, 1);
        const comebackRelative = config.hitProbability > 0
            ? clamp(coldRate / config.hitProbability, 0, 1)
            : 0;
        const frequencyFactor = 1 - clamp(state.hits / expectedHits, 0, 1);
        const deadBoost = state.isDead ? 0.15 : state.isDeepCold ? 0.07 : 0;
        const exclusionScore = Math.round(clamp(
            (droughtFactor * 0.50 + (1 - comebackRelative) * 0.30 + frequencyFactor * 0.20 + deadBoost) * 100,
            0,
            100
        ));

        currentRanking.push({
            number,
            status: state.status,
            hits: state.hits,
            drought: state.drought,
            coldComebacks: coldComebacks[number],
            coldOpportunities: coldOpportunities[number],
            coldRate,
            deadComebacks: deadComebacks[number],
            deadOpportunities: deadOpportunities[number],
            deadRate,
            exclusionScore,
            recommendation:
                exclusionScore >= 78 ? "MOCNY KANDYDAT" :
                exclusionScore >= 62 ? "DO ROZWAŻENIA" :
                "NIE WYCINAJ W CIEMNO"
        });
    }

    currentRanking.sort((a, b) =>
        b.exclusionScore - a.exclusionScore ||
        b.drought - a.drought ||
        a.number - b.number
    );

    return {
        config,
        latestComebacks,
        currentRanking,
        exclusionCandidates: currentRanking.filter(item => item.exclusionScore >= 62).slice(0, 12),
        events: events.sort((a, b) => b.priorDrought - a.priorDrought).slice(0, 30),
        analyzedTransitions: transitionCount,
        totalColdComebacks: events.length,
        totalDeadComebacks: events.filter(item => item.priorStatus === "DEAD").length
    };
}

function renderStatsColdComebackPanel(stats) {
    if (!stats) return "";

    const latestRows = stats.latestComebacks.length
        ? stats.latestComebacks.map(item => `
            <div class="cold-comeback-chip ${item.priorStatus === "DEAD" ? "dead" : ""}">
                <strong>${item.number}</strong>
                <span>${item.priorStatus}</span>
                <small>przerwa ${item.priorDrought} • ${item.priorHits} traf. w oknie</small>
            </div>
        `).join("")
        : `<div class="cold-comeback-empty">W ostatnim losowaniu nie wróciła liczba sklasyfikowana wcześniej jako COLD / DEAD.</div>`;

    const rankingRows = stats.currentRanking.length
        ? stats.currentRanking.slice(0, 18).map(item => `
            <tr class="${item.status === "DEAD" ? "cold-row-dead" : item.status === "DEEP COLD" ? "cold-row-deep" : ""}">
                <td><strong>${item.number}</strong></td>
                <td><span class="cold-state cold-state-${item.status.toLowerCase().replace(/\s+/g, "-")}">${item.status}</span></td>
                <td>${item.drought}</td>
                <td>${item.hits}</td>
                <td>${item.coldComebacks}/${item.coldOpportunities}</td>
                <td>${item.coldOpportunities ? Math.round(item.coldRate * 100) : 0}%</td>
                <td><strong>${item.exclusionScore}/100</strong></td>
                <td>${item.recommendation}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="8">Brak liczb COLD dla aktualnego okna.</td></tr>`;

    const exclusionText = stats.exclusionCandidates.length
        ? stats.exclusionCandidates.map(item => item.number).join(", ")
        : "—";

    return `
        <section class="stats-cold-comeback-panel" data-stats-tab-section="cold-returns">
            <div class="cold-comeback-head">
                <div>
                    <span>❄️ COLD COMEBACK</span>
                    <strong>Czy zimne i „martwe” liczby faktycznie wracają?</strong>
                </div>
                <div class="cold-comeback-meta">
                    <span>Okno statusu <strong>${stats.config.lookback}</strong></span>
                    <span>DEAD od <strong>${stats.config.deadDrought}</strong> los. przerwy</span>
                </div>
            </div>

            <div class="cold-comeback-summary-grid">
                <div>
                    <span>Powroty COLD w badanym okresie</span>
                    <strong>${stats.totalColdComebacks}</strong>
                </div>
                <div>
                    <span>Z tego powroty DEAD</span>
                    <strong>${stats.totalDeadComebacks}</strong>
                </div>
                <div>
                    <span>Kandydaci do wykluczenia</span>
                    <strong>${stats.exclusionCandidates.length}</strong>
                </div>
                <div>
                    <span>Badane przejścia</span>
                    <strong>${stats.analyzedTransitions}</strong>
                </div>
            </div>

            <div class="cold-comeback-section">
                <h4>⚡ Co wróciło w OSTATNIM losowaniu mimo wcześniejszego COLD?</h4>
                <div class="cold-comeback-latest">${latestRows}</div>
            </div>

            <div class="cold-comeback-section">
                <div class="cold-comeback-candidate-box">
                    <div>
                        <span>🧊 Najmocniejsi kandydaci do ręcznego wykluczenia</span>
                        <strong>${exclusionText}</strong>
                    </div>
                    <small>
                        Ranking łączy długość obecnej przerwy, małą częstość w ostatnim oknie i historycznie niski współczynnik comebacków.
                        AUTO FORGE ma ostrzejszą zasadę: twardo wycina tylko DEAD z mocnym wynikiem, co najmniej 3 historycznymi sytuacjami DEAD
                        i bardzo niskim powrotem ze stanu DEAD. Gorące sektory nadal mają ochronę przed automatycznym wycięciem.
                    </small>
                </div>
            </div>

            <div class="cold-comeback-section">
                <h4>📋 Aktualne COLD rozbite na jakość</h4>
                <div class="stats-table-scroll">
                    <table class="statsTable cold-comeback-table">
                        <thead>
                            <tr>
                                <th>Liczba</th>
                                <th>Status</th>
                                <th>Przerwa</th>
                                <th>Traf. w oknie</th>
                                <th>Comebacki</th>
                                <th>Comeback %</th>
                                <th>Wykluczenie</th>
                                <th>Ocena</th>
                            </tr>
                        </thead>
                        <tbody>${rankingRows}</tbody>
                    </table>
                </div>
            </div>

            <p class="cold-comeback-note">
                COLD = dolny kwartyl częstotliwości w bieżącym oknie. DEEP COLD = COLD z dłuższą przerwą.
                DEAD = przerwa wyjątkowo długa dla danej gry. Comeback liczy sytuację, w której liczba była COLD przed losowaniem i pojawiła się w kolejnym.
            </p>
        </section>
    `;
}

function initializeStatsDashboard() {
    const tabs = document.getElementById("statsTabs");
    const summary = document.getElementById("statsSummaryGrid");
    if (!tabs || !summary) return;

    const classify = element => {
        if (element.classList.contains("stats-return-panel")) return "returns";
        const title = (element.querySelector("h3, h4")?.textContent || "").toUpperCase();

        if (title.includes("HOT") || title.includes("COLD")) return "numbers";
        if (title.includes("PARY") || title.includes("TRÓJKI") || title.includes("CZWÓRKI")) return "patterns";
        if (
            title.includes("SEKTOR") || title.includes("MIGRAC") ||
            title.includes("ROZRZUT") || title.includes("ZAGĘSZCZEN")
        ) return "sectors";
        if (title.includes("POWROTY")) return "returns";
        return "overview";
    };

    [...summary.children].forEach(element => {
        element.dataset.statsTabSection = classify(element);
    });

    const standaloneSections = [...document.querySelectorAll("[data-stats-tab-section]")]
        .filter(element => element !== summary);

    const activate = tab => {
        tabs.querySelectorAll("button[data-tab]").forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tab);
        });

        [...summary.children].forEach(element => {
            element.hidden = element.dataset.statsTabSection !== tab;
        });

        standaloneSections.forEach(element => {
            element.hidden = element.dataset.statsTabSection !== tab;
        });
    };

    tabs.querySelectorAll("button[data-tab]").forEach(button => {
        button.addEventListener("click", () => activate(button.dataset.tab));
    });

    activate("overview");
}

function pokazStatystyki() {
    stopRngArena();

    contentArea.classList.remove("lab-view", "rng-arena-view");

    // Widok statystyk korzysta z własnego układu kolumnowego.
    // Bez tego #contentArea (flex w generatorze) rozciągał panele na całą wysokość ekranu.
    contentArea.classList.add("stats-view");

    const statystyki = {};

    for (let i = 1; i <= currentGame.max; i++) {
        statystyki[i] = 0;
    }

    const analizowaneLosowania = getAnalysisDraws();
const rankingStruktur = buildObservedStructureRanking(
    analizowaneLosowania,
    [Math.max(1, analizowaneLosowania.length)],
    [1],
    [],
    getHistoricalDrawCount()
).map(item => ({
    ...item,
    struktura: item.key,
    wystapienia: item.count
}));
analizowaneLosowania.forEach(losowanie => {
    losowanie.liczby.forEach(nr => {
        statystyki[nr]++;
    });
});
const parzystoscStats = {};

analizowaneLosowania.forEach(losowanie => {

    const uklad =
        getEvenOddForNumbers(losowanie.liczby);

    if (!parzystoscStats[uklad]) {
        parzystoscStats[uklad] = 0;
    }

    parzystoscStats[uklad]++;
});
const rankingParzystosci =
    Object.entries(parzystoscStats)
        .map(([uklad, wystapienia]) => ({
            uklad,
            wystapienia
        }))
        .sort((a, b) => b.wystapienia - a.wystapienia);
    console.log(statystyki);
   const ranking = [];

for (let i = 1; i <= currentGame.max; i++) {
    ranking.push({
        liczba: i,
        trafienia: statystyki[i]
    });
}
const sumyLosowan =
    analizowaneLosowania.map(losowanie =>
        losowanie.liczby.reduce((a, b) => a + b, 0)
    );

const sredniaSuma =
    sumyLosowan.length > 0
        ? Math.round(
            sumyLosowan.reduce((a, b) => a + b, 0) /
            sumyLosowan.length
        )
        : 0;

const minSuma =
    sumyLosowan.length > 0
        ? Math.min(...sumyLosowan)
        : 0;

const maxSuma =
    sumyLosowan.length > 0
        ? Math.max(...sumyLosowan)
        : 0;
        const przedzialySumy = {};

sumyLosowan.forEach(suma => {

    const start = Math.floor(suma / 10) * 10;
    const end = start + 9;

    const przedzial = `${start}-${end}`;

    if (!przedzialySumy[przedzial]) {
        przedzialySumy[przedzial] = 0;
    }

    przedzialySumy[przedzial]++;
});
const rankingPrzedzialowSumy =
    Object.entries(przedzialySumy)
        .map(([przedzial, wystapienia]) => ({
            przedzial,
            wystapienia
        }))
        .sort((a, b) => b.wystapienia - a.wystapienia);
        const sectorStats =
    new Array(currentGame.ranges.length).fill(0);

analizowaneLosowania.forEach(losowanie => {

    losowanie.liczby.forEach(number => {

        for (let i = 0; i < currentGame.ranges.length; i++) {

            if (number <= currentGame.ranges[i]) {
                sectorStats[i]++;
                break;
            }
        }
    });
});
const totalSectorHits =
    sectorStats.reduce((a, b) => a + b, 0);
    const sectorRanking =
    sectorStats
        .map((trafienia, index) => {

            const start =
                index === 0
                    ? 1
                    : currentGame.ranges[index - 1] + 1;

            const end =
                currentGame.ranges[index];

            const procent =
                totalSectorHits > 0
                    ? Math.round((trafienia / totalSectorHits) * 100)
                    : 0;

            return {
                sektor: `${start}-${end}`,
                trafienia,
                procent
            };
        })
        .sort((a, b) => b.trafienia - a.trafienia);
const srodkiCiezkosci =
    analizowaneLosowania.map(losowanie => {

        const suma =
            losowanie.liczby.reduce((a, b) => a + b, 0);

        return suma / losowanie.liczby.length;
    });
    const sredniSrodekCiezkosci =
    srodkiCiezkosci.length > 0
        ? (
            srodkiCiezkosci.reduce((a, b) => a + b, 0) /
            srodkiCiezkosci.length
        ).toFixed(1)
        : "0.0";
        const polowa =
    Math.floor(srodkiCiezkosci.length / 2);

const pierwszaPolowa =
    srodkiCiezkosci.slice(0, polowa);

const drugaPolowa =
    srodkiCiezkosci.slice(polowa);

const sredniaPierwszejPolowy =
    pierwszaPolowa.length > 0
        ? pierwszaPolowa.reduce((a, b) => a + b, 0) /
          pierwszaPolowa.length
        : 0;

const sredniaDrugiejPolowy =
    drugaPolowa.length > 0
        ? drugaPolowa.reduce((a, b) => a + b, 0) /
          drugaPolowa.length
        : 0;
        const roznicaMigracji =
    sredniaDrugiejPolowy - sredniaPierwszejPolowy;
    const silaMigracji =
    roznicaMigracji.toFixed(1);

let kierunekMigracji = "→ STABILNIE";

if (roznicaMigracji > 1) {
    kierunekMigracji = "↑ W GÓRĘ";
}
else if (roznicaMigracji < -1) {
    kierunekMigracji = "↓ W DÓŁ";
}
const liczbaLosowanTrend = srodkiCiezkosci.length;

const granica1 =
    Math.floor(liczbaLosowanTrend / 3);

const granica2 =
    Math.floor((liczbaLosowanTrend * 2) / 3);

const trendCzesc1 =
    srodkiCiezkosci.slice(0, granica1);

const trendCzesc2 =
    srodkiCiezkosci.slice(granica1, granica2);

const trendCzesc3 =
    srodkiCiezkosci.slice(granica2);
    function sredniaTablicy(tablica) {

    if (tablica.length === 0) {
        return 0;
    }

    return tablica.reduce((a, b) => a + b, 0) /
        tablica.length;
}
const trend1 =
    sredniaTablicy(trendCzesc1);

const trend2 =
    sredniaTablicy(trendCzesc2);

const trend3 =
    sredniaTablicy(trendCzesc3);
    const rozrzuty =
    analizowaneLosowania.map(losowanie => {

        const minLiczba =
            Math.min(...losowanie.liczby);

        const maxLiczba =
            Math.max(...losowanie.liczby);

        return maxLiczba - minLiczba;
    });
    const sredniRozrzut =
    rozrzuty.length > 0
        ? (
            rozrzuty.reduce((a, b) => a + b, 0) /
            rozrzuty.length
        ).toFixed(1)
        : "0.0";
        const minRozrzut =
    rozrzuty.length > 0
        ? Math.min(...rozrzuty)
        : 0;

const maxRozrzut =
    rozrzuty.length > 0
        ? Math.max(...rozrzuty)
        : 0;
        const srednieOdstepy =
    analizowaneLosowania.map(losowanie => {

        const liczby =
            [...losowanie.liczby].sort((a, b) => a - b);

        const odstepy = [];

        for (let i = 1; i < liczby.length; i++) {
            odstepy.push(liczby[i] - liczby[i - 1]);
        }

        return odstepy.length > 0
            ? odstepy.reduce((a, b) => a + b, 0) / odstepy.length
            : 0;
    });
    const sredniOdstep =
    srednieOdstepy.length > 0
        ? (
            srednieOdstepy.reduce((a, b) => a + b, 0) /
            srednieOdstepy.length
        ).toFixed(1)
        : "0.0";
        const minSredniOdstep =
    srednieOdstepy.length > 0
        ? Math.min(...srednieOdstepy).toFixed(1)
        : "0.0";

const maxSredniOdstep =
    srednieOdstepy.length > 0
        ? Math.max(...srednieOdstepy).toFixed(1)
        : "0.0";

ranking.sort((a, b) => b.trafienia - a.trafienia);
const activeHotColdCount = currentGame === games.multi ? hotColdCount : 5;
const hot = ranking.slice(0, activeHotColdCount);
const cold = [...ranking].reverse().slice(0, activeHotColdCount);
const latestDraw = getLatestImportedDraw();
const statsPatternConfig = getStatsPatternConfig();
const pairStats = buildStatsCombinationRanking(
    analizowaneLosowania,
    2,
    statsPatternConfig.pair.limit,
    statsPatternConfig.pair.maxWindow
);
const tripleStats = buildStatsCombinationRanking(
    analizowaneLosowania,
    3,
    statsPatternConfig.triple.limit,
    statsPatternConfig.triple.maxWindow
);
const quadStats = buildStatsCombinationRanking(
    analizowaneLosowania,
    4,
    statsPatternConfig.quad.limit,
    statsPatternConfig.quad.maxWindow
);
const returnStats = buildStatsReturnAnalysis(
    analizowaneLosowania,
    statsPatternConfig.returnLimit
);
const shortPulse = buildStatsShortPulse(getCurrentGameDraws());
const clusterContinuity = buildStatsClusterContinuity(getCurrentGameDraws(), 5);
const sectorMigration = buildStatsSectorMigration(getCurrentGameDraws(), 5);
const coldComebackStats = buildStatsColdComebackAnalysis(getCurrentGameDraws(), analysisWindow);
    let html = `
<h2>📊 Statystyki ${currentGame.title}</h2>
<div class="stats-command-bar">
    <div>
        <strong>Centrum statystyk</strong>
        <span>Wybierz moduł zamiast przewijać całą ścianę danych.</span>
    </div>
    <div id="statsTabs" class="stats-tabs">
        <button type="button" data-tab="overview" class="active">🏠 Szybki obraz</button>
        <button type="button" data-tab="pulse">⚡ Puls 2/3/4</button>
        <button type="button" data-tab="sectors">🧭 Sektory</button>
        <button type="button" data-tab="numbers">🔥 Liczby</button>
        <button type="button" data-tab="patterns">🧩 Wzorce</button>
        <button type="button" data-tab="returns">🔁 Powroty</button>
        <button type="button" data-tab="cold-returns">❄️ COLD comeback</button>
    </div>
</div>
<div class="stats-window-controls">
    <label for="analysisWindowSelect">
        Zakres analizy:
    </label>

    <select id="analysisWindowSelect">
    <option value="2">2 losowania</option>
    <option value="3">3 losowania</option>
    <option value="4">4 losowania</option>
    <option value="5">5 losowań</option>
    <option value="10">10 losowań</option>
    <option value="20" selected>20 losowań</option>
    <option value="30">30 losowań</option>
    <option value="50">50 losowań</option>
    <option value="100">100 losowań</option>
    <option value="200">200 losowań</option>
    <option value="300">300 losowań</option>
    <option value="500">500 losowań</option>
</select>

${currentGame === games.multi ? `
    <br><br>
    <label for="hotColdCountSelect">
        Ile HOT / COLD pokazać:
    </label>

    <select id="hotColdCountSelect">
        <option value="5">TOP 5</option>
        <option value="10">TOP 10</option>
    </select>
` : ""}
</div>
<div class="stats-tab-section" data-stats-tab-section="pulse">
${renderStatsPulsePanel(shortPulse, clusterContinuity, sectorMigration)}
</div>
<div class="statsSummary" id="statsSummaryGrid">
<div class="statsBox latest-draw-stats-box">
    <h3>✅ OSTATNIE LOSOWANIE</h3>

    ${latestDraw ? `
        <div>
            <span>Data</span>
            <strong>${latestDraw.data}</strong>
        </div>
        <div>
            <span>Nr</span>
            <strong>${latestDraw.numer}</strong>
        </div>
        <div class="latest-draw-stats-numbers">
            <span>Liczby</span>
            <strong>${formatLatestDrawNumbers(latestDraw)}</strong>
        </div>
    ` : `
        <div>
            <span>Status</span>
            <strong>Brak danych</strong>
        </div>
    `}
</div>
<div class="statsBox stats-structure-leaders-box">
    <div class="stats-structure-leaders-head">
        <div>
            <h3>🧩 TOP 5 STRUKTUR</h3>
            <p>Ranking aktywności dla ostatnich ${analizowaneLosowania.length} losowań. Lider ma pierwszeństwo w AUTO FORGE.</p>
        </div>
        ${rankingStruktur[0] ? `
            <div class="stats-structure-leader-badge">
                <span>AKTUALNY LIDER</span>
                <strong>${rankingStruktur[0].struktura}</strong>
            </div>
        ` : ""}
    </div>

    <div class="stats-structure-ranking-list">
        ${rankingStruktur.slice(0, 5).map((item, index) => {
            const lastSeen = item.trend.drawsAgo === 0
                ? "teraz"
                : item.trend.drawsAgo === null
                    ? "—"
                    : `${item.trend.drawsAgo} los. temu`;
            const trendClass = item.trend.direction > 0 ? "up" : item.trend.direction < 0 ? "down" : "flat";
            return `
                <article class="stats-structure-ranking-row ${index === 0 ? "leader" : ""}">
                    <div class="stats-structure-rank-top">
                        <span class="stats-structure-rank-number">#${index + 1}</span>
                        <strong class="stats-structure-code">${item.struktura}</strong>
                        <em class="stats-structure-trend-pill structure-trend-${trendClass}">${item.trend.directionText}</em>
                    </div>

                    <div class="stats-structure-rank-metrics">
                        <div>
                            <span>Wystąpienia</span>
                            <strong>${item.wystapienia}/${item.windowSize}</strong>
                        </div>
                        <div>
                            <span>Udział</span>
                            <strong>${Math.round(item.rate * 100)}%</strong>
                        </div>
                        <div>
                            <span>Ostatnio</span>
                            <strong>${lastSeen}</strong>
                        </div>
                        <div>
                            <span>Max seria</span>
                            <strong>${item.trend.maxStreak || 1}</strong>
                        </div>
                    </div>
                </article>
            `;
        }).join("")}
    </div>
</div>
${renderStatsStructureTrendChart(analizowaneLosowania, rankingStruktur)}
<div class="statsBox">
    <h3>⚖️ TOP PARZYSTOŚĆ</h3>

    ${rankingParzystosci.map(item => `
        <div>
            <span>${item.uklad}</span>
            <strong>${item.wystapienia}</strong>
        </div>
    `).join("")}
</div>
<div class="statsBox">
    <h3>➕ SUMA</h3>

    <div>
        <span>Średnia</span>
        <strong>${sredniaSuma}</strong>
    </div>

    <div>
        <span>Minimum</span>
        <strong>${minSuma}</strong>
    </div>

    <div>
        <span>Maksimum</span>
        <strong>${maxSuma}</strong>
    </div>

    ${rankingPrzedzialowSumy.slice(0, 3).map(item => `
        <div>
            <span>${item.przedzial}</span>
            <strong>${item.wystapienia}</strong>
        </div>
    `).join("")}
    
</div>
<div class="statsBox">
    <h3>🎯 AKTYWNE SEKTORY</h3>

    ${sectorRanking.map(item => `
        <div>
            <span>${item.sektor}</span>
            <strong>${item.trafienia} (${item.procent}%)</strong>
        </div>
    `).join("")}
</div>
<div class="statsBox">
    <h3>🧭 MIGRACJA</h3>

    <div>
        <span>Środek</span>
        <strong>${sredniSrodekCiezkosci}</strong>
    </div>

    <div>
        <span>Pierwsza połowa</span>
        <strong>${sredniaPierwszejPolowy.toFixed(1)}</strong>
    </div>

    <div>
        <span>Druga połowa</span>
        <strong>${sredniaDrugiejPolowy.toFixed(1)}</strong>
    </div>

    <div>
        <span>Kierunek</span>
        <strong>${kierunekMigracji}</strong>
    </div>
    <div>
    <span>Siła</span>
    <strong>
        ${roznicaMigracji > 0 ? "+" : ""}${silaMigracji}
    </strong>
</div>
<div>
    <span>Trend</span>
    <strong>
        ${trend1.toFixed(1)} → ${trend2.toFixed(1)} → ${trend3.toFixed(1)}
    </strong>
</div>
</div>
${renderStatsMigrationChart(analizowaneLosowania)}
<div class="statsBox">
    <h3>📏 ROZRZUT</h3>

    <div>
        <span>Średni</span>
        <strong>${sredniRozrzut}</strong>
    </div>

    <div>
        <span>Minimum</span>
        <strong>${minRozrzut}</strong>
    </div>

    <div>
        <span>Maksimum</span>
        <strong>${maxRozrzut}</strong>
    </div>
</div>
<div class="statsBox">
    <h3>🧲 ZAGĘSZCZENIE</h3>

    <div>
        <span>Średni odstęp</span>
        <strong>${sredniOdstep}</strong>
    </div>

    <div>
        <span>Najciaśniej</span>
        <strong>${minSredniOdstep}</strong>
    </div>

    <div>
        <span>Najluźniej</span>
        <strong>${maxSredniOdstep}</strong>
    </div>
</div>
<div class="statsBox">
<h3>🔥 TOP HOT</h3>

${hot.map(x => `
<div>
    <span class="hot">${x.liczba}</span>
    <strong>${x.trafienia}</strong>
</div>
`).join("")}

<div class="cold-copy-row">
    <input
        type="text"
        id="hotCopyInput"
        value="${hot.map(x => x.liczba).join(",")}"
        readonly
        aria-label="Liczby HOT do skopiowania">
    <button type="button" id="copyHotBtn">📋 Kopiuj HOT</button>
</div>

</div>

<div class="statsBox">
<h3>❄️ TOP COLD</h3>

${cold.map(x => `
<div>
    <span class="cold">${x.liczba}</span>
    <strong>${x.trafienia}</strong>
</div>
`).join("")}

<div class="cold-copy-row">
    <input
        type="text"
        id="coldCopyInput"
        value="${cold.map(x => x.liczba).join(",")}"
        readonly
        aria-label="Liczby COLD do skopiowania">
    <button type="button" id="copyColdBtn">📋 Kopiuj COLD</button>
</div>

</div>

${renderStatsPatternBox("TOP PARY", "🔗", pairStats)}
${renderStatsPatternBox("TOP TRÓJKI", "🔺", tripleStats)}
${renderStatsPatternBox("TOP CZWÓRKI", "◼️", quadStats)}

<details class="stats-return-panel stats-collapsible-card stats-return-collapsible">
    <summary class="stats-return-collapse-summary">
        <span>🔁 POWROTY Z LOSOWANIA DO LOSOWANIA</span>
        <strong>średnio ${returnStats.average.toFixed(2)} • kliknij, aby rozwinąć</strong>
    </summary>
    <div class="stats-return-head">
        <div>
            <span>🔁 POWROTY Z LOSOWANIA DO LOSOWANIA</span>
            <strong>${returnStats.transitionCount} przejść w wybranym oknie</strong>
        </div>
        <div class="stats-return-average">
            <span>Średnio wraca</span>
            <strong>${returnStats.average.toFixed(2)} liczby</strong>
        </div>
    </div>

    <div class="stats-return-grid">
        <div class="stats-return-block">
            <h4>Rozkład liczby powrotów</h4>
            <div class="stats-return-distribution">
                ${returnStats.distribution.length ? returnStats.distribution.map(item => `
                    <div>
                        <span>${item.count} ${item.count === 1 ? "liczba" : "liczb"}</span>
                        <strong>${item.occurrences}×</strong>
                    </div>
                `).join("") : `
                    <div><span>Za mało losowań</span><strong>—</strong></div>
                `}
            </div>
        </div>

        <div class="stats-return-block">
            <h4>Ostatnie przejście</h4>
            ${returnStats.latestFrom && returnStats.latestTo ? `
                <div class="stats-return-latest-meta">
                    <span>${returnStats.latestFrom.data || "—"}</span>
                    <strong>→</strong>
                    <span>${returnStats.latestTo.data || "—"}</span>
                </div>
                <div class="stats-return-latest-numbers">
                    <span>Wróciło ${returnStats.latestOverlapNumbers.length}:</span>
                    <strong>${returnStats.latestOverlapNumbers.length
                        ? returnStats.latestOverlapNumbers.map(n => String(n).padStart(2, "0")).join(", ")
                        : "brak"}</strong>
                </div>
            ` : `
                <div class="stats-return-latest-numbers">
                    <span>Brak danych do porównania dwóch losowań.</span>
                </div>
            `}
        </div>
    </div>

    <div class="stats-return-table-wrap">
        <table class="statsTable stats-return-table">
            <thead>
                <tr>
                    <th>Liczba</th>
                    <th>Powroty</th>
                    <th>Okazje do powrotu</th>
                    <th>Współczynnik</th>
                </tr>
            </thead>
            <tbody>
                ${returnStats.ranking.length ? returnStats.ranking.map(item => `
                    <tr>
                        <td><strong>${item.number}</strong></td>
                        <td>${item.returned}</td>
                        <td>${item.opportunities}</td>
                        <td>${Math.round(item.rate * 100)}%</td>
                    </tr>
                `).join("") : `
                    <tr>
                        <td colspan="4">Za mało danych do policzenia powrotów.</td>
                    </tr>
                `}
            </tbody>
        </table>
    </div>

    <p class="stats-return-note">
        Powrót oznacza, że liczba wystąpiła w jednym losowaniu i pojawiła się ponownie w bezpośrednio następnym losowaniu. Współczynnik pokazuje historyczny udział takich powrotów w wybranym oknie.
    </p>
</details>

</div>

${renderStatsColdComebackPanel(coldComebackStats)}

<div class="stats-number-ranking-panel" data-stats-tab-section="numbers">
<h3>🔢 PEŁNY RANKING LICZB</h3>
<table class="statsTable">

<tr>
<th>Liczba</th>
<th>Trafienia</th>
</tr>
`;

ranking.forEach(item => {

    html += `
    <tr>
        <td>${item.liczba}</td>
        <td>${item.trafienia}</td>
    </tr>
    `;

});

html += "</table></div>";

contentArea.innerHTML = html;
initializeStatsDashboard();
const analysisWindowSelect =
    document.getElementById("analysisWindowSelect");

analysisWindowSelect.value = String(analysisWindow);

analysisWindowSelect.addEventListener("change", () => {

    analysisWindow =
        Number(analysisWindowSelect.value);

    pokazStatystyki();
});

const copyHotBtn = document.getElementById("copyHotBtn");
const hotCopyInput = document.getElementById("hotCopyInput");

if (copyHotBtn && hotCopyInput) {
    copyHotBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(hotCopyInput.value);
            const oldText = copyHotBtn.textContent;
            copyHotBtn.textContent = "✅ Skopiowano";
            setTimeout(() => {
                copyHotBtn.textContent = oldText;
            }, 1200);
        } catch (error) {
            hotCopyInput.focus();
            hotCopyInput.select();
            document.execCommand("copy");
        }
    });
}

const copyColdBtn = document.getElementById("copyColdBtn");
const coldCopyInput = document.getElementById("coldCopyInput");

if (copyColdBtn && coldCopyInput) {
    copyColdBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(coldCopyInput.value);
            const oldText = copyColdBtn.textContent;
            copyColdBtn.textContent = "✅ Skopiowano";
            setTimeout(() => {
                copyColdBtn.textContent = oldText;
            }, 1200);
        } catch (error) {
            coldCopyInput.focus();
            coldCopyInput.select();
            document.execCommand("copy");
        }
    });
}

if (currentGame === games.multi) {
    const hotColdCountSelect =
        document.getElementById("hotColdCountSelect");

    hotColdCountSelect.value = String(hotColdCount);

    hotColdCountSelect.addEventListener("change", () => {
        hotColdCount = Number(hotColdCountSelect.value);
        pokazStatystyki();
    });
}

}

// =========================================================
// LOTTOFORGE — LABORATORIUM 2.0 / WSZYSTKIE GRY
// Każdy zapisany pakiet dotyczy JEDNEGO następnego losowania danej gry.
// Obsługa: Mini Lotto, Lotto, EuroJackpot, Multi Multi, Extra Pensja.
// =========================================================
const LOTTOFORGE_LAB_STORAGE_KEY = "lottoForgeLab.v2";
const LOTTOFORGE_LAB_LEGACY_KEY = "lottoForgeLabMini.v1";
let laboratoryGameKey = "mini";
let laboratoryDraft = null;

const LAB_GAME_CONFIGS = {
    mini: {
        key: "mini",
        label: "Mini Lotto",
        icon: "🎲",
        max: 42,
        baseCount: 5,
        minCount: 5,
        maxCount: 12,
        supportsSystem: true,
        secondary: null
    },
    lotto: {
        key: "lotto",
        label: "Lotto",
        icon: "🎯",
        max: 49,
        baseCount: 6,
        minCount: 6,
        maxCount: 12,
        supportsSystem: true,
        secondary: null
    },
    euro: {
        key: "euro",
        label: "EuroJackpot",
        icon: "⭐",
        max: 50,
        baseCount: 5,
        minCount: 5,
        maxCount: 5,
        supportsSystem: false,
        secondary: { label: "Euro", count: 2, max: 12, drawField: "euroNumbers" }
    },
    multi: {
        key: "multi",
        label: "Multi Multi",
        icon: "🔥",
        max: 80,
        baseCount: 20,
        minCount: 1,
        maxCount: 10,
        supportsSystem: false,
        secondary: null
    },
    extra: {
        key: "extra",
        label: "Extra Pensja",
        icon: "💰",
        max: 35,
        baseCount: 5,
        minCount: 5,
        maxCount: 5,
        supportsSystem: false,
        secondary: { label: "Extra", count: 1, max: 4, drawField: "extraNumber" }
    }
};

function getLaboratoryConfig(gameKey = laboratoryGameKey) {
    return LAB_GAME_CONFIGS[gameKey] || LAB_GAME_CONFIGS.mini;
}

function normalizeLaboratoryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const gameKey = LAB_GAME_CONFIGS[entry.gameKey] ? entry.gameKey : "mini";
    const numbers = Array.isArray(entry.numbers) ? entry.numbers.map(Number).filter(Number.isFinite) : [];
    return {
        ...entry,
        gameKey,
        systemSize: Number(entry.systemSize || numbers.length || LAB_GAME_CONFIGS[gameKey].minCount),
        numbers,
        secondaryNumbers: Array.isArray(entry.secondaryNumbers)
            ? entry.secondaryNumbers.map(Number).filter(Number.isFinite)
            : [],
        status: entry.status === "checked" ? "checked" : "waiting"
    };
}

function loadLaboratoryEntries() {
    try {
        const currentRaw = localStorage.getItem(LOTTOFORGE_LAB_STORAGE_KEY);
        if (currentRaw) {
            const parsed = JSON.parse(currentRaw);
            return Array.isArray(parsed) ? parsed.map(normalizeLaboratoryEntry).filter(Boolean) : [];
        }

        // Migracja z pierwszej wersji Mini Lotto — bez utraty dotychczasowych testów.
        const legacyRaw = localStorage.getItem(LOTTOFORGE_LAB_LEGACY_KEY);
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy)) {
                const migrated = legacy.map(normalizeLaboratoryEntry).filter(Boolean);
                localStorage.setItem(LOTTOFORGE_LAB_STORAGE_KEY, JSON.stringify(migrated));
                return migrated;
            }
        }

        return [];
    } catch (error) {
        console.warn("Laboratorium: nie udało się odczytać danych.", error);
        return [];
    }
}

function saveLaboratoryEntries(entries) {
    try {
        localStorage.setItem(LOTTOFORGE_LAB_STORAGE_KEY, JSON.stringify(entries));
        return true;
    } catch (error) {
        console.error("Laboratorium: nie udało się zapisać danych.", error);
        alert("❌ Nie udało się zapisać Laboratorium w pamięci przeglądarki.");
        return false;
    }
}

function makeLaboratoryId() {
    return `lab-${Date.now()}-${cryptoRandomToken().slice(0, 9)}`;
}

function getLaboratoryDraws(gameKey = laboratoryGameKey) {
    return sortDrawsChronologically(losowaniaGier[gameKey] || []);
}

function parsePolishDrawDate(dateString) {
    const match = String(dateString || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    date.setHours(0, 0, 0, 0);
    return date;
}

function formatLaboratoryCreatedAt(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function laboratoryCombination(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    const safeK = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= safeK; i++) result = result * (n - safeK + i) / i;
    return Math.round(result);
}

function buildLaboratorySystemBreakdown(systemSize, baseCount, hitCount) {
    const totalBets = laboratoryCombination(systemSize, baseCount);
    const tierCounts = {};

    for (let tier = baseCount; tier >= 0; tier--) {
        const matching = laboratoryCombination(hitCount, tier);
        const missing = laboratoryCombination(systemSize - hitCount, baseCount - tier);
        const count = matching * missing;
        if (count > 0) tierCounts[tier] = count;
    }

    return { totalBets, tierCounts };
}

function findLaboratoryTargetDraw(entry, draws) {
    if (!draws.length) return null;

    if (Number.isFinite(Number(entry.anchorDrawNumber))) {
        const anchorNumber = Number(entry.anchorDrawNumber);
        const byNumber = draws
            .filter(draw => Number(draw.numer) > anchorNumber)
            .sort((a, b) => Number(a.numer) - Number(b.numer));
        if (byNumber.length) return byNumber[0];
    }

    if (entry.anchorDrawDate) {
        const anchorDate = parsePolishDrawDate(entry.anchorDrawDate);
        if (anchorDate) {
            const byDate = draws.find(draw => {
                const date = parsePolishDrawDate(draw.data);
                return date && date.getTime() > anchorDate.getTime();
            });
            if (byDate) return byDate;
        }
    }

    const created = new Date(entry.createdAt);
    if (!Number.isNaN(created.getTime())) {
        created.setHours(0, 0, 0, 0);
        return draws.find(draw => {
            const date = parsePolishDrawDate(draw.data);
            return date && date.getTime() > created.getTime();
        }) || null;
    }

    return null;
}

function getDrawSecondaryNumbers(draw, config) {
    if (!config.secondary) return [];
    const raw = draw?.[config.secondary.drawField];
    if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);
    if (Number.isFinite(Number(raw))) return [Number(raw)];
    return [];
}

function evaluateLaboratoryEntry(entry, draw) {
    const config = getLaboratoryConfig(entry.gameKey);
    const drawSet = new Set((draw.liczby || []).map(Number));
    const hitNumbers = entry.numbers.filter(number => drawSet.has(Number(number)));
    const drawSecondaryNumbers = getDrawSecondaryNumbers(draw, config);
    const secondarySet = new Set(drawSecondaryNumbers);
    const secondaryHitNumbers = (entry.secondaryNumbers || []).filter(number => secondarySet.has(Number(number)));

    let totalBets = 1;
    let tierCounts = {};
    if (config.supportsSystem) {
        const breakdown = buildLaboratorySystemBreakdown(entry.systemSize, config.baseCount, hitNumbers.length);
        totalBets = breakdown.totalBets;
        tierCounts = breakdown.tierCounts;
    }

    return {
        drawNumber: Number(draw.numer),
        drawDate: draw.data,
        drawNumbers: [...draw.liczby].sort((a, b) => a - b),
        drawSecondaryNumbers: [...drawSecondaryNumbers].sort((a, b) => a - b),
        hitNumbers: [...hitNumbers].sort((a, b) => a - b),
        hitCount: hitNumbers.length,
        secondaryHitNumbers: [...secondaryHitNumbers].sort((a, b) => a - b),
        secondaryHitCount: secondaryHitNumbers.length,
        totalBets,
        tierCounts,
        checkedAt: new Date().toISOString()
    };
}

function resolveLaboratoryEntries(gameKey = null) {
    const entries = loadLaboratoryEntries();
    if (!entries.length) return 0;

    let resolvedCount = 0;
    let changed = false;

    entries.forEach(entry => {
        if (entry.status === "checked") return;
        if (gameKey && entry.gameKey !== gameKey) return;

        const draws = getLaboratoryDraws(entry.gameKey);
        if (!draws.length) return;
        const targetDraw = findLaboratoryTargetDraw(entry, draws);
        if (!targetDraw) return;

        entry.status = "checked";
        entry.result = evaluateLaboratoryEntry(entry, targetDraw);
        changed = true;
        resolvedCount++;
    });

    if (changed) saveLaboratoryEntries(entries);
    return resolvedCount;
}

function parseLaboratoryNumberTokens(text) {
    const matches = String(text || "").match(/\d+/g) || [];
    return matches.map(Number);
}

function parseLaboratoryLines(rawText, gameKey, expectedCount) {
    const config = getLaboratoryConfig(gameKey);
    const lines = String(rawText || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const valid = [];
    const errors = [];

    lines.forEach((line, index) => {
        const parts = line.split("|").map(part => part.trim());
        const numbers = parseLaboratoryNumberTokens(parts[0]);
        const secondaryNumbers = config.secondary
            ? parseLaboratoryNumberTokens(parts.slice(1).join(" "))
            : [];

        if (numbers.length !== expectedCount) {
            errors.push(`Linia ${index + 1}: oczekiwano ${expectedCount} liczb głównych, jest ${numbers.length}.`);
            return;
        }
        if (numbers.some(number => !Number.isInteger(number) || number < 1 || number > config.max)) {
            errors.push(`Linia ${index + 1}: liczby główne muszą być z zakresu 1–${config.max}.`);
            return;
        }
        if (new Set(numbers).size !== numbers.length) {
            errors.push(`Linia ${index + 1}: liczby główne zawierają powtórkę.`);
            return;
        }

        if (config.secondary) {
            if (secondaryNumbers.length !== config.secondary.count) {
                errors.push(`Linia ${index + 1}: po znaku | oczekiwano ${config.secondary.count} ${config.secondary.label}, jest ${secondaryNumbers.length}.`);
                return;
            }
            if (secondaryNumbers.some(number => !Number.isInteger(number) || number < 1 || number > config.secondary.max)) {
                errors.push(`Linia ${index + 1}: ${config.secondary.label} muszą być z zakresu 1–${config.secondary.max}.`);
                return;
            }
            if (new Set(secondaryNumbers).size !== secondaryNumbers.length) {
                errors.push(`Linia ${index + 1}: część ${config.secondary.label} zawiera powtórkę.`);
                return;
            }
        }

        valid.push({
            numbers: [...numbers].sort((a, b) => a - b),
            secondaryNumbers: [...secondaryNumbers].sort((a, b) => a - b)
        });
    });

    return { valid, errors, sourceLineCount: lines.length };
}

function formatTicketForLaboratory(ticket, gameKey) {
    const config = getLaboratoryConfig(gameKey);
    const main = (ticket.numbers || [])
        .map(number => String(number).padStart(2, "0"))
        .join(" ");

    if (!config.secondary) return main;

    const secondary = gameKey === "euro"
        ? (ticket.euroNumbers || [])
        : (ticket.extraNumber || []);

    return `${main} | ${secondary.map(number => String(number).padStart(2, "0")).join(" ")}`;
}

function formatTicketsForLaboratory(tickets, gameKey) {
    return tickets.map(ticket => formatTicketForLaboratory(ticket, gameKey)).join("\n");
}

// =========================================================
// LOTTOFORGE — KOPIOWANIE POJEDYNCZEGO KUPONU
// Ręczny generator: liczby w formacie 1,5,6,8,...
// =========================================================
function formatSingleGeneratedTicketForCopy(numbers, euroNumbers = [], extraNumber = []) {
    const main = [...(numbers || [])]
        .sort((a, b) => a - b)
        .join(",");

    if (currentGame === games.euro && euroNumbers.length) {
        const secondary = [...euroNumbers]
            .sort((a, b) => a - b)
            .join(",");
        return `${main} | Euro:${secondary}`;
    }

    if (currentGame === games.extra && extraNumber.length) {
        return `${main} | Extra:${extraNumber.join(",")}`;
    }

    return main;
}

function renderSingleGeneratedCopy(numbers, euroNumbers = [], extraNumber = []) {
    const mount = document.getElementById("singleTicketCopyMount");
    if (!mount || !Array.isArray(numbers) || !numbers.length) return;

    const copyText = formatSingleGeneratedTicketForCopy(numbers, euroNumbers, extraNumber);

    mount.innerHTML = `
        <section class="single-ticket-copy-panel">
            <div class="single-ticket-copy-head">
                <span>📋 GOTOWE DO SKOPIOWANIA</span>
                <small>format po przecinku</small>
            </div>
            <div class="single-ticket-copy-row">
                <input
                    id="singleTicketCopyText"
                    class="single-ticket-copy-input"
                    type="text"
                    value="${copyText}"
                    readonly
                    aria-label="Wygenerowane liczby do skopiowania">
                <button
                    type="button"
                    id="singleTicketCopyBtn"
                    class="lab-secondary-btn single-ticket-copy-btn">
                    📋 Kopiuj liczby
                </button>
            </div>
        </section>
    `;

    const input = document.getElementById("singleTicketCopyText");
    const button = document.getElementById("singleTicketCopyBtn");

    button?.addEventListener("click", () => {
        copyLaboratoryText(input?.value || copyText, button);
    });

    input?.addEventListener("click", () => input.select());
}

async function copyLaboratoryText(textValue, button = null) {
    try {
        await navigator.clipboard.writeText(textValue);
    } catch (error) {
        const temp = document.createElement("textarea");
        temp.value = textValue;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand("copy");
        temp.remove();
    }

    if (button) {
        const oldText = button.textContent;
        button.textContent = "✅ Skopiowano";
        setTimeout(() => { button.textContent = oldText; }, 1200);
    }
}

function bindTicketQuickCopyEvents(tickets, gameKey) {
    const copyBtn = document.getElementById("ticketQuickCopyBtn");
    const labBtn = document.getElementById("ticketQuickLabBtn");
    const area = document.getElementById("ticketQuickCopyText");

    copyBtn?.addEventListener("click", () => copyLaboratoryText(area?.value || "", copyBtn));
    labBtn?.addEventListener("click", () => {
        const text = formatTicketsForLaboratory(tickets, gameKey);
        laboratoryDraft = {
            gameKey,
            text,
            mainCount: Number(tickets[0]?.targetCount || getLaboratoryConfig(gameKey).minCount)
        };
        showLaboratory(gameKey);
    });
}

function saveLaboratoryBatch() {
    const config = getLaboratoryConfig(laboratoryGameKey);
    const countSelect = document.getElementById("labSystemCount");
    const setsInput = document.getElementById("labSetsInput");
    const labelInput = document.getElementById("labBatchLabel");
    if (!countSelect || !setsInput) return;

    const systemSize = Number(countSelect.value);
    const parsed = parseLaboratoryLines(setsInput.value, laboratoryGameKey, systemSize);

    if (!parsed.sourceLineCount) {
        alert("🧪 Wpisz przynajmniej jeden zestaw — jeden zestaw w jednej linii.");
        return;
    }
    if (parsed.errors.length) {
        alert(`❌ Nie zapisano zestawów:\n\n${parsed.errors.join("\n")}`);
        return;
    }

    const draws = getLaboratoryDraws(laboratoryGameKey);
    const latest = draws.length ? draws[draws.length - 1] : null;
    const entries = loadLaboratoryEntries();
    const batchId = `batch-${Date.now()}`;
    const batchLabel = String(labelInput?.value || "").trim();

    parsed.valid.forEach((item, index) => {
        entries.push({
            id: makeLaboratoryId(),
            batchId,
            batchIndex: index + 1,
            batchSize: parsed.valid.length,
            label: batchLabel,
            gameKey: laboratoryGameKey,
            systemSize,
            numbers: item.numbers,
            secondaryNumbers: item.secondaryNumbers,
            createdAt: new Date().toISOString(),
            anchorDrawNumber: latest ? Number(latest.numer) : null,
            anchorDrawDate: latest ? latest.data : null,
            status: "waiting",
            result: null
        });
    });

    if (!saveLaboratoryEntries(entries)) return;

    setsInput.value = "";
    if (labelInput) labelInput.value = "";
    if (laboratoryDraft?.gameKey === laboratoryGameKey) laboratoryDraft = null;
    showLaboratory(laboratoryGameKey);

    alert(
        `✅ Laboratorium ${config.label} zapisało ${parsed.valid.length} ${parsed.valid.length === 1 ? "zestaw" : "zestawów"}.\n` +
        (latest
            ? `Każdy czeka na pierwsze losowanie po ${latest.data} (#${latest.numer}).`
            : `Nie ma jeszcze wczytanej bazy ${config.label} — po kolejnym imporcie Laboratorium spróbuje dopasować pierwsze późniejsze losowanie.`)
    );
}

function deleteLaboratoryEntry(entryId) {
    const entries = loadLaboratoryEntries();
    const target = entries.find(entry => entry.id === entryId);
    if (!target) return;
    if (!confirm("Usunąć ten zapis z Laboratorium?")) return;
    saveLaboratoryEntries(entries.filter(entry => entry.id !== entryId));
    showLaboratory(laboratoryGameKey);
}

function clearLaboratoryChecked() {
    const entries = loadLaboratoryEntries();
    const checkedCount = entries.filter(entry => entry.gameKey === laboratoryGameKey && entry.status === "checked").length;
    if (!checkedCount) return;
    if (!confirm(`Usunąć rozliczoną historię tej gry (${checkedCount})? Oczekujące zestawy zostaną.`)) return;
    saveLaboratoryEntries(entries.filter(entry => !(entry.gameKey === laboratoryGameKey && entry.status === "checked")));
    showLaboratory(laboratoryGameKey);
}

function exportLaboratoryJson() {
    const entries = loadLaboratoryEntries();
    const payload = {
        app: "LottoForge",
        module: "Laboratorium",
        exportedAt: new Date().toISOString(),
        version: 2,
        entries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lottoforge-laboratorium-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function importLaboratoryJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const payload = JSON.parse(String(reader.result || "{}"));
                const incomingRaw = Array.isArray(payload) ? payload : payload.entries;
                if (!Array.isArray(incomingRaw)) throw new Error("Brak tablicy entries w kopii.");

                const incoming = incomingRaw.map(normalizeLaboratoryEntry).filter(Boolean);
                incoming.forEach(entry => { if (!entry.id) entry.id = makeLaboratoryId(); });
                const existing = loadLaboratoryEntries();
                const byId = new Map(existing.map(entry => [entry.id, entry]));
                incoming.forEach(entry => byId.set(entry.id, entry));
                const merged = [...byId.values()];
                saveLaboratoryEntries(merged);
                showLaboratory(laboratoryGameKey);
                alert(`✅ Wczytano kopię Laboratorium. Łącznie zapisów: ${merged.length}.`);
            } catch (error) {
                alert(`❌ Nie udało się wczytać kopii JSON:\n\n${error.message}`);
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

function laboratoryNumbersHtml(numbers, hitNumbers = []) {
    const hits = new Set(hitNumbers.map(Number));
    return numbers.map(number => `
        <span class="lab-number ${hits.has(Number(number)) ? "hit" : ""}">${String(number).padStart(2, "0")}</span>
    `).join("");
}

function laboratorySystemLabel(entry) {
    const config = getLaboratoryConfig(entry.gameKey);
    if (entry.gameKey === "multi") return `Typ ${entry.systemSize} liczb`;
    if (config.secondary) return `${config.baseCount} + ${config.secondary.count} ${config.secondary.label}`;
    if (config.supportsSystem) return entry.systemSize === config.baseCount
        ? `Zwykły zakład ${config.baseCount}`
        : `System ${entry.systemSize}`;
    return `${entry.systemSize} liczb`;
}

function laboratoryResultTone(hitCount, config) {
    if (config.key === "multi") {
        if (hitCount >= 7) return "jackpot";
        if (hitCount >= 5) return "great";
        if (hitCount >= 3) return "good";
        if (hitCount === 2) return "medium";
        return "quiet";
    }
    if (hitCount >= config.baseCount) return "jackpot";
    if (hitCount === config.baseCount - 1) return "great";
    if (hitCount === config.baseCount - 2) return "good";
    if (hitCount === config.baseCount - 3) return "medium";
    return "quiet";
}

function renderLaboratorySecondaryNumbers(entry, result = null) {
    const config = getLaboratoryConfig(entry.gameKey);
    if (!config.secondary) return "";
    const hitNumbers = result?.secondaryHitNumbers || [];
    return `
        <div class="lab-secondary-numbers">
            <span>${config.secondary.label}</span>
            <div>${laboratoryNumbersHtml(entry.secondaryNumbers || [], hitNumbers)}</div>
        </div>
    `;
}

function renderLaboratoryPendingCard(entry) {
    const config = getLaboratoryConfig(entry.gameKey);
    const anchorText = entry.anchorDrawDate
        ? `po ${entry.anchorDrawDate}${entry.anchorDrawNumber ? ` (#${entry.anchorDrawNumber})` : ""}`
        : "po dniu zapisu";

    return `
        <article class="lab-ticket-card pending">
            <div class="lab-ticket-head">
                <div>
                    <span class="lab-status waiting">OCZEKUJE</span>
                    <strong>${config.icon} ${laboratorySystemLabel(entry)}</strong>
                    ${entry.label ? `<small>${entry.label}</small>` : ""}
                </div>
                <button type="button" class="lab-icon-btn danger" data-lab-delete="${entry.id}" title="Usuń zapis">✕</button>
            </div>
            <div class="lab-ticket-numbers">${laboratoryNumbersHtml(entry.numbers)}</div>
            ${renderLaboratorySecondaryNumbers(entry)}
            <div class="lab-ticket-foot">
                <span>Zapisano: <strong>${formatLaboratoryCreatedAt(entry.createdAt)}</strong></span>
                <span>Cel: <strong>pierwsze losowanie ${anchorText}</strong></span>
            </div>
        </article>
    `;
}

function renderLaboratorySystemBreakdown(entry, result) {
    const config = getLaboratoryConfig(entry.gameKey);
    if (!config.supportsSystem) return "";
    const tiers = [config.baseCount, config.baseCount - 1, config.baseCount - 2];
    return `
        <div class="lab-system-breakdown">
            ${tiers.map(tier => {
                const count = Number(result.tierCounts?.[tier] || 0);
                return `<div class="${count ? "active" : ""}"><span>${tier}/${config.baseCount}</span><strong>${count}</strong></div>`;
            }).join("")}
        </div>
    `;
}

function renderLaboratoryCheckedCard(entry) {
    const config = getLaboratoryConfig(entry.gameKey);
    const result = entry.result || {};
    const tone = laboratoryResultTone(Number(result.hitCount || 0), config);
    const secondarySummary = config.secondary
        ? `<span class="lab-secondary-hit">${config.secondary.label}: <strong>${Number(result.secondaryHitCount || 0)}/${config.secondary.count}</strong></span>`
        : "";

    return `
        <article class="lab-ticket-card checked ${tone}">
            <div class="lab-ticket-head">
                <div>
                    <span class="lab-status checked">ROZLICZONY</span>
                    <strong>${config.icon} ${laboratorySystemLabel(entry)}</strong>
                    ${entry.label ? `<small>${entry.label}</small>` : ""}
                </div>
                <div class="lab-hit-badge ${tone}">
                    <span>TRAFIONE</span>
                    <strong>${Number(result.hitCount || 0)}/${entry.systemSize}</strong>
                    ${secondarySummary}
                </div>
            </div>

            <div class="lab-ticket-numbers">${laboratoryNumbersHtml(entry.numbers, result.hitNumbers || [])}</div>
            ${renderLaboratorySecondaryNumbers(entry, result)}

            <div class="lab-result-grid">
                <div>
                    <span>Losowanie</span>
                    <strong>${result.drawDate || "—"} ${result.drawNumber ? `#${result.drawNumber}` : ""}</strong>
                </div>
                <div>
                    <span>Wylosowane</span>
                    <strong>${(result.drawNumbers || []).map(number => String(number).padStart(2, "0")).join(" • ") || "—"}</strong>
                </div>
                <div>
                    <span>Trafione liczby</span>
                    <strong>${(result.hitNumbers || []).length ? result.hitNumbers.join(", ") : "brak"}</strong>
                </div>
                <div>
                    <span>${config.supportsSystem ? "Zakładów systemowych" : "Typowanych liczb"}</span>
                    <strong>${config.supportsSystem ? Number(result.totalBets || 1) : entry.systemSize}</strong>
                </div>
                ${config.secondary ? `
                    <div>
                        <span>Wylosowane ${config.secondary.label}</span>
                        <strong>${(result.drawSecondaryNumbers || []).join(" • ") || "—"}</strong>
                    </div>
                    <div>
                        <span>Trafione ${config.secondary.label}</span>
                        <strong>${(result.secondaryHitNumbers || []).length ? result.secondaryHitNumbers.join(", ") : "brak"}</strong>
                    </div>
                ` : ""}
            </div>

            ${renderLaboratorySystemBreakdown(entry, result)}

            <div class="lab-ticket-foot">
                <span>Zapisano: <strong>${formatLaboratoryCreatedAt(entry.createdAt)}</strong></span>
                <button type="button" class="lab-text-btn danger" data-lab-delete="${entry.id}">Usuń</button>
            </div>
        </article>
    `;
}

function buildLaboratorySummary(entries) {
    const waiting = entries.filter(entry => entry.status !== "checked");
    const checked = entries.filter(entry => entry.status === "checked");
    const bestHit = checked.length
        ? Math.max(...checked.map(entry => Number(entry.result?.hitCount || 0)))
        : 0;
    const hit3Plus = checked.filter(entry => Number(entry.result?.hitCount || 0) >= 3).length;
    return { waiting, checked, bestHit, hit3Plus };
}

function renderLaboratoryCountOptions(config, selectedCount) {
    const values = Array.from({ length: config.maxCount - config.minCount + 1 }, (_, index) => config.minCount + index);
    return values.map(value => {
        let label = `${value}`;
        if (config.key === "mini" || config.key === "lotto") {
            label += value === config.baseCount ? " — zwykły zakład" : ` — system ${value}`;
        } else if (config.key === "multi") {
            label += " — typowanych liczb";
        } else if (config.secondary) {
            label += ` głównych + ${config.secondary.count} ${config.secondary.label}`;
        }
        return `<option value="${value}" ${value === selectedCount ? "selected" : ""}>${label}</option>`;
    }).join("");
}

function getLaboratoryPlaceholder(config, count) {
    const sampleMain = Array.from({ length: count }, (_, index) => String(index + 1).padStart(2, "0")).join(" ");
    if (!config.secondary) return `${sampleMain}\n${sampleMain}`;
    const secondary = Array.from({ length: config.secondary.count }, (_, index) => String(index + 1).padStart(2, "0")).join(" ");
    return `${sampleMain} | ${secondary}`;
}

function bindLaboratoryEvents() {
    document.getElementById("labSaveBatchBtn")?.addEventListener("click", saveLaboratoryBatch);
    document.getElementById("labGameSelect")?.addEventListener("change", event => {
        laboratoryDraft = laboratoryDraft?.gameKey === event.target.value ? laboratoryDraft : null;
        showLaboratory(event.target.value);
    });
    document.getElementById("labCheckBtn")?.addEventListener("click", () => {
        const resolved = resolveLaboratoryEntries(laboratoryGameKey);
        showLaboratory(laboratoryGameKey);
        const config = getLaboratoryConfig(laboratoryGameKey);
        alert(resolved > 0
            ? `✅ Rozliczono ${resolved} ${resolved === 1 ? "zestaw" : "zestawów"}.`
            : `🧪 Brak nowych losowań ${config.label} do rozliczenia. Jeśli losowanie już było, wczytaj świeży plik przez Import danych.`);
    });
    document.getElementById("labExportBtn")?.addEventListener("click", exportLaboratoryJson);
    document.getElementById("labImportJsonBtn")?.addEventListener("click", importLaboratoryJson);
    document.getElementById("labClearCheckedBtn")?.addEventListener("click", clearLaboratoryChecked);

    document.querySelectorAll("[data-lab-delete]").forEach(button => {
        button.addEventListener("click", () => deleteLaboratoryEntry(button.dataset.labDelete));
    });
}

function showLaboratory(gameKey = null) {
    stopRngArena();
    if (gameKey && LAB_GAME_CONFIGS[gameKey]) laboratoryGameKey = gameKey;
    const config = getLaboratoryConfig(laboratoryGameKey);
    currentGame = games[laboratoryGameKey];

    contentArea.classList.remove("stats-view", "rng-arena-view");
    contentArea.classList.add("lab-view");

    resolveLaboratoryEntries(laboratoryGameKey);

    const entries = loadLaboratoryEntries()
        .filter(entry => entry.gameKey === laboratoryGameKey)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const summary = buildLaboratorySummary(entries);
    const draws = getLaboratoryDraws(laboratoryGameKey);
    const latest = draws.length ? draws[draws.length - 1] : null;

    const checkedSorted = [...summary.checked].sort((a, b) => {
        const drawDiff = Number(b.result?.drawNumber || 0) - Number(a.result?.drawNumber || 0);
        if (drawDiff !== 0) return drawDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const draftMatches = laboratoryDraft?.gameKey === laboratoryGameKey;
    const selectedCount = clamp(
        Number(draftMatches ? laboratoryDraft.mainCount : config.minCount),
        config.minCount,
        config.maxCount
    );
    const draftText = draftMatches ? laboratoryDraft.text : "";

    contentArea.innerHTML = `
        <div class="lab-shell">
            <div class="lab-hero">
                <div>
                    <span class="lab-kicker">🧪 LOTTOFORGE LAB 2.0</span>
                    <h1>Laboratorium ${config.label}</h1>
                    <p>Każdy zapisany pakiet czeka tylko na <strong>jedno następne losowanie</strong> wybranej gry. Dzisiaj typujesz, jutro wczytujesz świeże dane i LottoForge sam rozlicza wynik.</p>
                    <div class="lab-game-switcher">
                        <label for="labGameSelect">Gra w Laboratorium</label>
                        <select id="labGameSelect">
                            ${Object.values(LAB_GAME_CONFIGS).map(item => `
                                <option value="${item.key}" ${item.key === laboratoryGameKey ? "selected" : ""}>${item.icon} ${item.label}</option>
                            `).join("")}
                        </select>
                    </div>
                </div>
                <div class="lab-latest-draw ${latest ? "ready" : "warning"}">
                    <span>OSTATNIA BAZA ${config.label.toUpperCase()}</span>
                    <strong>${latest ? `${latest.data} • #${latest.numer}` : "brak wczytanych danych"}</strong>
                    <small>${latest ? "Nowe zestawy będą czekały na kolejne losowanie po tej pozycji." : `Najlepiej najpierw wczytać aktualny plik ${config.label}.`}</small>
                </div>
            </div>

            <div class="lab-summary-grid">
                <div><span>Oczekujące</span><strong>${summary.waiting.length}</strong></div>
                <div><span>Rozliczone</span><strong>${summary.checked.length}</strong></div>
                <div><span>Najlepszy wynik</span><strong>${summary.checked.length ? `${summary.bestHit} traf.` : "—"}</strong></div>
                <div><span>Testy 3+ trafień</span><strong>${summary.hit3Plus}</strong></div>
            </div>

            <section class="lab-create-panel">
                <div class="lab-section-head">
                    <div>
                        <span>NOWY EKSPERYMENT</span>
                        <h2>Zapisz dzisiejsze zestawy</h2>
                    </div>
                    <div class="lab-flow">GENERUJ → KOPIUJ/WKLEJ → ZAPISZ → CZEKAJ NA WYNIK</div>
                </div>

                <div class="lab-create-grid">
                    <div class="lab-field compact">
                        <label for="labSystemCount">${config.key === "multi" ? "Ile liczb typujesz?" : "Ile liczb głównych w zestawie?"}</label>
                        <select id="labSystemCount" ${config.minCount === config.maxCount ? "disabled" : ""}>
                            ${renderLaboratoryCountOptions(config, selectedCount)}
                        </select>
                    </div>

                    <div class="lab-field">
                        <label for="labBatchLabel">Nazwa / notatka <small>(opcjonalnie)</small></label>
                        <input id="labBatchLabel" type="text" maxlength="80" placeholder="np. AUTO FORGE / system / test wieczorny">
                    </div>
                </div>

                <div class="lab-field">
                    <label for="labSetsInput">Zestawy — <strong>jeden kupon w jednej linii</strong></label>
                    <textarea id="labSetsInput" rows="8" placeholder="${getLaboratoryPlaceholder(config, selectedCount)}"></textarea>
                    <small>${config.secondary
                        ? `Format: liczby główne | ${config.secondary.label}. Przykład: 01 12 23 34 45 | ${Array.from({ length: config.secondary.count }, (_, i) => i + 1).join(" ")}.`
                        : `Wklej dowolną liczbę kuponów naraz. Każda linia musi mieć dokładnie ${selectedCount} liczb z poprawnego zakresu.`}</small>
                </div>

                <div class="lab-actions">
                    <button type="button" id="labSaveBatchBtn" class="primary-btn">🧪 Zapisz zestawy na następne losowanie</button>
                    <button type="button" id="labCheckBtn" class="lab-secondary-btn">✅ Sprawdź po imporcie</button>
                    <button type="button" id="labExportBtn" class="lab-secondary-btn">💾 Kopia JSON</button>
                    <button type="button" id="labImportJsonBtn" class="lab-secondary-btn">📥 Wczytaj JSON</button>
                </div>
            </section>

            <section class="lab-section">
                <div class="lab-section-head">
                    <div>
                        <span>KOLEJKA</span>
                        <h2>⏳ Oczekujące na wynik</h2>
                    </div>
                    <strong class="lab-counter">${summary.waiting.length}</strong>
                </div>
                <div class="lab-ticket-list">
                    ${summary.waiting.length
                        ? summary.waiting.map(renderLaboratoryPendingCard).join("")
                        : `<div class="lab-empty">Nie ma oczekujących zestawów ${config.label}. Dodaj dzisiejsze typy powyżej.</div>`}
                </div>
            </section>

            <section class="lab-section history">
                <div class="lab-section-head">
                    <div>
                        <span>ARCHIWUM TESTÓW</span>
                        <h2>📚 Historia wyników</h2>
                    </div>
                    ${summary.checked.length ? `<button type="button" id="labClearCheckedBtn" class="lab-text-btn danger">Wyczyść rozliczoną historię tej gry</button>` : ""}
                </div>
                <div class="lab-ticket-list">
                    ${checkedSorted.length
                        ? checkedSorted.map(renderLaboratoryCheckedCard).join("")
                        : `<div class="lab-empty">Historia ${config.label} jest pusta. Po kolejnym imporcie pojawią się tutaj rozliczone testy.</div>`}
                </div>
            </section>
        </div>
    `;

    const setsInput = document.getElementById("labSetsInput");
    if (setsInput && draftText) setsInput.value = draftText;
    bindLaboratoryEvents();
}


// =========================================================
// LOTTOFORGE — EVERY SECOND / RNG ARENA
// =========================================================
const RNG_ARENA_GAME_CONFIG = {
    mini: {
        label: "Mini Lotto",
        drawCount: 5,
        max: 42,
        pickCount: 5,
        pickMin: 5,
        pickMax: 12,
        variablePick: true,
        systemMode: true,
        perfectMode: "draw"
    },
    lotto: {
        label: "Lotto",
        drawCount: 6,
        max: 49,
        pickCount: 6,
        pickMin: 6,
        pickMax: 12,
        variablePick: true,
        systemMode: true,
        perfectMode: "draw"
    },
    euro: {
        label: "EuroJackpot",
        drawCount: 5,
        max: 50,
        pickCount: 5,
        pickMin: 5,
        pickMax: 12,
        variablePick: true,
        systemMode: true,
        perfectMode: "draw",
        secondary: {
            label: "Euro",
            drawCount: 2,
            max: 12,
            pickCount: 2,
            pickMin: 2,
            pickMax: 12,
            variablePick: true,
            systemMode: true,
            perfectMode: "draw"
        }
    },
    multi: {
        label: "Multi Multi",
        drawCount: 20,
        max: 80,
        pickCount: 9,
        pickMin: 1,
        pickMax: 10,
        variablePick: true,
        perfectMode: "ticket"
    },
    extra: {
        label: "Extra Pensja",
        drawCount: 5,
        max: 35,
        pickCount: 5,
        perfectMode: "ticket",
        secondary: { label: "Extra", drawCount: 1, max: 4, pickCount: 1, perfectMode: "ticket" }
    }
};

// =========================================================
// LOTTOFORGE — EVERY SECOND / FINANSE SYMULACJI
// Stan modelu: 09.09.2026.
// Kwoty zmienne są historycznymi średnimi/estymatami — nie prognozą przyszłej wypłaty.
// Plus / Lotto Plus / Ekstra Premia / podwyższone stawki i czasowe promocje nie są tutaj symulowane.
// =========================================================
const RNG_ARENA_FINANCE_MODEL = {
    modelDate: "09.09.2026",
    euroReferenceRate: 4.31,
    mini: {
        baseCost: 2.00,
        payouts: {
            3: 40.31,
            4: 1000.28,
            5: 282743.36
        },
        modelLabel: "ŚREDNIE / ESTYMATA",
        note: "3/5 i 4/5: średnia ważona z ostatnich 100 losowań. 5/5: estymata historyczna na podstawie typowej puli 300–600 tys. zł i liczby zwycięskich kuponów."
    },
    lotto: {
        baseCost: 5.00,
        payouts: {
            3: 35.00,
            4: 180.70,
            5: 6003.53,
            6: 7173107.60
        },
        modelLabel: "35 ZŁ STAŁE + ŚREDNIE",
        note: "3/6: gwarantowane 35 zł. 4/6 i 5/6: średnie z ostatnich 100 losowań. 6/6: historyczna średnia wypłaty na zwycięski kupon — rzeczywista kumulacja może być dużo niższa lub wyższa."
    },
    euro: {
        baseCost: 12.50,
        payouts: {
            "5+2": 155491970.42,
            "5+1": 3817405.53,
            "5+0": 793951.96,
            "4+2": 20983.51,
            "4+1": 1325.60,
            "3+2": 656.65,
            "4+0": 479.35,
            "2+2": 104.38,
            "3+1": 85.34,
            "3+0": 75.35,
            "1+2": 52.27,
            "2+1": 42.04
        },
        modelLabel: "ŚREDNIA OSTATNICH LOSOWAŃ",
        note: "Średnie na zwycięski kupon z 11 ostatnich analizowanych losowań EuroJackpot; poziomy bez zwycięzcy w danym losowaniu pominięto. Przeliczenie referencyjne EUR→PLN: 4,31."
    },
    multi: {
        baseCost: 2.50,
        payouts: {
            1:  { 1: 4 },
            2:  { 2: 16 },
            3:  { 2: 2, 3: 54 },
            4:  { 2: 2, 3: 8, 4: 84 },
            5:  { 3: 4, 4: 20, 5: 700 },
            6:  { 3: 2, 4: 8, 5: 120, 6: 1300 },
            7:  { 3: 2, 4: 4, 5: 20, 6: 200, 7: 6000 },
            8:  { 4: 4, 5: 20, 6: 60, 7: 600, 8: 22000 },
            9:  { 4: 2, 5: 8, 6: 42, 7: 300, 8: 2000, 9: 70000 },
            10: { 4: 2, 5: 4, 6: 12, 7: 140, 8: 520, 9: 10000, 10: 250000 }
        },
        modelLabel: "TABELA STAŁA",
        note: "Oficjalna tabela Multi Multi dla stawki x1 bez Plusa. Czasowe promocje nie są doliczane."
    },
    extra: {
        baseCost: 5.00,
        payouts: {
            "5+1": 1200000,
            "5+0": 25000,
            "4+1": 1000,
            "4+0": 200,
            "3+1": 80,
            "3+0": 25,
            "2+1": 10,
            "2+0": 5
        },
        modelLabel: "TABELA STAŁA",
        note: "Ekstra Pensja bez Ekstra Premii i przy stawce x1. 5+1 pokazujemy nominalnie jako 1 200 000 zł = 240 × 5 000 zł wypłacane przez 20 lat."
    }
};

function rngArenaNCr(n, r) {
    n = Math.floor(Number(n));
    r = Math.floor(Number(r));
    if (!Number.isFinite(n) || !Number.isFinite(r) || r < 0 || r > n) return 0;
    r = Math.min(r, n - r);
    let result = 1;
    for (let i = 1; i <= r; i++) {
        result = (result * (n - r + i)) / i;
    }
    return Math.round(result);
}

function getRngArenaSimpleBetCount(gameKey = rngArenaState?.gameKey, pickCount = getRngArenaPickCount(), secondaryPickCount = getRngArenaSecondaryPickCount()) {
    if (gameKey === "mini") return rngArenaNCr(pickCount, 5);
    if (gameKey === "lotto") return rngArenaNCr(pickCount, 6);
    if (gameKey === "euro") {
        return rngArenaNCr(pickCount, 5) * rngArenaNCr(secondaryPickCount, 2);
    }
    return 1;
}

function getRngArenaTicketCost(gameKey = rngArenaState?.gameKey, pickCount = getRngArenaPickCount(), secondaryPickCount = getRngArenaSecondaryPickCount()) {
    const model = RNG_ARENA_FINANCE_MODEL[gameKey];
    if (!model) return 0;
    return model.baseCost * getRngArenaSimpleBetCount(gameKey, pickCount, secondaryPickCount);
}

function getRngArenaExactSystemComboCount(totalPicked, totalHits, simpleSize, exactHits) {
    return (
        rngArenaNCr(totalHits, exactHits) *
        rngArenaNCr(totalPicked - totalHits, simpleSize - exactHits)
    );
}

function getRngArenaRoundPrize(gameKey, mainHits, secondaryHits, pickCount = getRngArenaPickCount(), secondaryPickCount = getRngArenaSecondaryPickCount()) {
    const model = RNG_ARENA_FINANCE_MODEL[gameKey];
    if (!model) return 0;

    if (gameKey === "mini") {
        let total = 0;
        for (let exactHits = 3; exactHits <= 5; exactHits++) {
            total += getRngArenaExactSystemComboCount(pickCount, mainHits, 5, exactHits) *
                Number(model.payouts[exactHits] || 0);
        }
        return total;
    }

    if (gameKey === "lotto") {
        let total = 0;
        for (let exactHits = 3; exactHits <= 6; exactHits++) {
            total += getRngArenaExactSystemComboCount(pickCount, mainHits, 6, exactHits) *
                Number(model.payouts[exactHits] || 0);
        }
        return total;
    }

    if (gameKey === "euro") {
        let total = 0;
        Object.entries(model.payouts).forEach(([signature, payout]) => {
            const [exactMainHits, exactSecondaryHits] = signature.split("+").map(Number);
            const mainCombos =
                rngArenaNCr(mainHits, exactMainHits) *
                rngArenaNCr(pickCount - mainHits, 5 - exactMainHits);
            const secondaryCombos =
                rngArenaNCr(secondaryHits, exactSecondaryHits) *
                rngArenaNCr(secondaryPickCount - secondaryHits, 2 - exactSecondaryHits);
            total += mainCombos * secondaryCombos * Number(payout || 0);
        });
        return total;
    }

    if (gameKey === "multi") {
        return Number(model.payouts[pickCount]?.[mainHits] || 0);
    }

    if (gameKey === "extra") {
        return Number(model.payouts[`${mainHits}+${secondaryHits}`] || 0);
    }

    return 0;
}

function formatRngArenaMoney(value) {
    return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value || 0));
}

function getRngArenaFinanceInfo(gameKey = rngArenaState?.gameKey, pickCount = getRngArenaPickCount(), secondaryPickCount = getRngArenaSecondaryPickCount()) {
    const model = RNG_ARENA_FINANCE_MODEL[gameKey];
    const simpleBets = getRngArenaSimpleBetCount(gameKey, pickCount, secondaryPickCount);
    const cost = getRngArenaTicketCost(gameKey, pickCount, secondaryPickCount);
    const comboText = simpleBets > 1
        ? `${simpleBets.toLocaleString("pl-PL")} zakładów prostych × ${formatRngArenaMoney(model.baseCost)}`
        : `1 zakład × ${formatRngArenaMoney(model.baseCost)}`;

    return {
        cost,
        simpleBets,
        comboText,
        modelLabel: model?.modelLabel || "—",
        note: model?.note || ""
   };
}

function renderRngArenaPrizeTable(gameKey = rngArenaState?.gameKey, pickCount = getRngArenaPickCount()) {
    const model = RNG_ARENA_FINANCE_MODEL[gameKey];
    if (!model) return "";

    let rows = [];
    if (gameKey === "mini") {
        rows = [
            ["3/5", model.payouts[3], "średnia"],
            ["4/5", model.payouts[4], "średnia"],
            ["5/5", model.payouts[5], "estymata"]
        ];
    } else if (gameKey === "lotto") {
        rows = [
            ["3/6", model.payouts[3], "stała"],
            ["4/6", model.payouts[4], "średnia"],
            ["5/6", model.payouts[5], "średnia"],
            ["6/6", model.payouts[6], "średnia historyczna"]
        ];
    } else if (gameKey === "euro") {
        const order = ["5+2","5+1","5+0","4+2","4+1","3+2","4+0","2+2","3+1","3+0","1+2","2+1"];
        rows = order.map(signature => [signature, model.payouts[signature], "średnia"]);
    } else if (gameKey === "multi") {
        const payoutMap = model.payouts[pickCount] || {};
        rows = Object.entries(payoutMap)
            .map(([hits, payout]) => [ `${hits}/${pickCount}`, payout, "stała" ])
            .sort((a, b) => Number(a[0].split("/")[0]) - Number(b[0].split("/")[0]));
    } else if (gameKey === "extra") {
        const order = ["5+1","5+0","4+1","4+0","3+1","3+0","2+1","2+0"];
        rows = order.map(signature => [signature, model.payouts[signature], "stała"]);
    }

    const rowHtml = rows.map(([result, payout, basis]) => `
        <tr>
            <td><strong>${result}</strong></td>
            <td>${formatRngArenaMoney(payout)}</td>
            <td>${basis}</td>
        </tr>
    `).join("");

    return `
        <details class="rng-arena-prize-table">
            <summary>📋 Tabela wypłat używana przez symulator</summary>
            <div class="rng-arena-prize-table-wrap">
                <table>
                    <thead><tr><th>Wynik</th><th>Kwota</th><th>Model</th></tr></thead>
                    <tbody>${rowHtml}</tbody>
                </table>
            </div>
            <small>
                Kwoty dotyczą pojedynczego zakładu prostego. Przy systemie LottoForge automatycznie liczy wszystkie zwycięskie kombinacje i sumuje ich wypłaty.
            </small>
        </details>
    `;
}

let rngArenaTimer = null;
let rngArenaState = null;
let rngArenaAudioContext = null;

const RNG_ARENA_SOUND_PRIORITY = { alert: 1, big: 2, epic: 3 };

function ensureRngArenaAudio() {
    if (!rngArenaState?.soundEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!rngArenaAudioContext) {
        rngArenaAudioContext = new AudioContextClass();
    }
    if (rngArenaAudioContext.state === "suspended") {
        rngArenaAudioContext.resume().catch(() => {});
    }
    return rngArenaAudioContext;
}

function rngArenaTone(ctx, frequency, start, duration, volume = 0.045, type = "sine") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
}

function playRngArenaSound(tier = "alert") {
    if (!rngArenaState?.soundEnabled) return;
    const ctx = ensureRngArenaAudio();
    if (!ctx) return;
    const now = ctx.currentTime + 0.015;

    if (tier === "epic") {
        // Krótka fanfara jackpotowa — bez zewnętrznych plików audio.
        const notes = [392, 523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, index) => {
            rngArenaTone(ctx, freq, now + index * 0.095, 0.22, 0.055, index < 2 ? "triangle" : "sine");
        });
        [523.25, 659.25, 783.99, 1046.5].forEach(freq => {
            rngArenaTone(ctx, freq, now + 0.52, 0.58, 0.032, "triangle");
        });
        return;
    }

    if (tier === "big") {
        [523.25, 659.25, 783.99, 987.77].forEach((freq, index) => {
            rngArenaTone(ctx, freq, now + index * 0.105, 0.20, 0.045, "triangle");
        });
        return;
    }

    // Zwykłe trafienie/wygrana: wyraźny podwójny buzzer.
    rngArenaTone(ctx, 660, now, 0.16, 0.04, "square");
    rngArenaTone(ctx, 880, now + 0.18, 0.20, 0.045, "square");
}

function getRngArenaWinSound(gameKey, mainHits, secondaryHits, pickCount) {
    if (gameKey === "mini") {
        if (mainHits >= 5) return { tier: "epic", result: `${mainHits}/5`, label: "JACKPOT" };
        if (mainHits >= 3) return { tier: "alert", result: `${mainHits}/5`, label: "WYGRANA" };
        return null;
    }

    if (gameKey === "lotto") {
        if (mainHits >= 6) return { tier: "epic", result: `${mainHits}/6`, label: "JACKPOT" };
        if (mainHits >= 3) return { tier: "alert", result: `${mainHits}/6`, label: "WYGRANA" };
        return null;
    }

    if (gameKey === "euro") {
        const signature = `${mainHits}+${secondaryHits}`;
        const winning = new Set([
            "5+2", "5+1", "5+0", "4+2", "4+1", "3+2",
            "4+0", "2+2", "3+1", "3+0", "1+2", "2+1"
        ]);
        if (!winning.has(signature)) return null;
        if (signature === "5+2") return { tier: "epic", result: signature, label: "JACKPOT" };
        if (["5+1", "5+0", "4+2"].includes(signature)) {
            return { tier: "big", result: signature, label: "DUŻA WYGRANA" };
        }
        return { tier: "alert", result: signature, label: "WYGRANA" };
    }

    if (gameKey === "multi") {
        const rules = {
            1:  { min: 1, big: 1 },
            2:  { min: 2, big: 2 },
            3:  { min: 2, big: 3 },
            4:  { min: 2, big: 4 },
            5:  { min: 3, big: 5 },
            6:  { min: 3, big: 5 },
            7:  { min: 3, big: 6 },
            8:  { min: 4, big: 7 },
            9:  { min: 4, big: 7 },
            10: { min: 4, big: 8 }
        };
        const count = clamp(Number(pickCount || 1), 1, 10);
        const rule = rules[count];
        if (mainHits < rule.min) return null;
        if (mainHits === count) return { tier: "epic", result: `${mainHits}/${count}`, label: "GŁÓWNA WYGRANA" };
        if (mainHits >= rule.big) return { tier: "big", result: `${mainHits}/${count}`, label: "DUŻA WYGRANA" };
        return { tier: "alert", result: `${mainHits}/${count}`, label: "WYGRANA" };
    }

    return null;
}

function pickStrongerRngArenaSound(current, candidate) {
    if (!candidate) return current;
    if (!current) return candidate;
    const currentRank = RNG_ARENA_SOUND_PRIORITY[current.tier] || 0;
    const candidateRank = RNG_ARENA_SOUND_PRIORITY[candidate.tier] || 0;
    return candidateRank >= currentRank ? candidate : current;
}

function triggerRngArenaWinEvent(event) {
    if (!event || !rngArenaState) return;
    rngArenaState.lastWinEvent = { ...event, atRound: event.round || rngArenaState.rounds };
    playRngArenaSound(event.tier);
}

function makeRngArenaCompetitor(label) {
    return {
        label,
        ticket: [],
        secondary: [],
        wins: 0,
        bestMain: 0,
        bestSecondary: 0,
        perfects: 0,
        hitCounts: {},
        lastMainHits: 0,
        lastSecondaryHits: 0,
        spent: 0,
        won: 0,
        lastPrize: 0
    };
}

function createRngArenaState(gameKey = "mini") {
    const key = RNG_ARENA_GAME_CONFIG[gameKey] ? gameKey : "mini";
    const durationMinutes = 60;
    return {
        gameKey: key,
        rounds: 0,
        ties: 0,
        running: false,
        speed: 1,
        pickCount: RNG_ARENA_GAME_CONFIG[key].pickCount,
        secondaryPickCount: RNG_ARENA_GAME_CONFIG[key].secondary?.pickCount || 0,
        user2Enabled: true,
        soundEnabled: true,
        durationMinutes,
        remainingMs: durationMinutes * 60 * 1000,
        timerEndAt: null,
        sessionCompleted: false,
        sessionSummary: null,
        lastWinEvent: null,
        firstPerfect: null,
        lastDraw: [],
        lastSecondaryDraw: [],
        competitors: {
            rng: makeRngArenaCompetitor("🎲 RNG / Chybił-Trafił"),
            me: makeRngArenaCompetitor("👤 Moje typy"),
            user2: makeRngArenaCompetitor("👥 Dodatkowy użytkownik")
        }
    };
}

function getRngArenaDurationMs() {
    const minutes = Math.max(0, Number(rngArenaState?.durationMinutes || 0));
    return minutes * 60 * 1000;
}

function syncRngArenaRemainingTime() {
    if (!rngArenaState) return 0;
    if (Number(rngArenaState.durationMinutes || 0) <= 0) return Infinity;

    if (rngArenaState.running && Number.isFinite(rngArenaState.timerEndAt)) {
        rngArenaState.remainingMs = Math.max(0, rngArenaState.timerEndAt - Date.now());
    }
    return Math.max(0, Number(rngArenaState.remainingMs || 0));
}

function formatRngArenaClock(ms) {
    if (!Number.isFinite(ms)) return "∞";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

function stopRngArena() {
    if (rngArenaState?.running && Number(rngArenaState.durationMinutes || 0) > 0) {
        syncRngArenaRemainingTime();
    }
    if (rngArenaTimer) {
        clearInterval(rngArenaTimer);
        rngArenaTimer = null;
    }
    if (rngArenaState) {
        rngArenaState.running = false;
        rngArenaState.timerEndAt = null;
    }
}

function getRngArenaConfig() {
    return RNG_ARENA_GAME_CONFIG[rngArenaState?.gameKey] || RNG_ARENA_GAME_CONFIG.mini;
}

function getRngArenaPickCount() {
    const config = getRngArenaConfig();
    if (!config.variablePick) return config.pickCount;
    const min = Number(config.pickMin ?? 1);
    const max = Number(config.pickMax ?? config.max);
    return clamp(Number(rngArenaState?.pickCount || config.pickCount), min, max);
}

function getRngArenaSecondaryPickCount() {
    const config = getRngArenaConfig();
    if (!config.secondary) return 0;
    if (!config.secondary.variablePick) return config.secondary.pickCount;
    const min = Number(config.secondary.pickMin ?? config.secondary.pickCount);
    const max = Number(config.secondary.pickMax ?? config.secondary.max);
    return clamp(
        Number(rngArenaState?.secondaryPickCount || config.secondary.pickCount),
        min,
        max
    );
}

function getRngArenaMainResultDenominator(config = getRngArenaConfig()) {
    return config.perfectMode === "draw" ? config.drawCount : getRngArenaPickCount();
}

function getRngArenaSecondaryResultDenominator(config = getRngArenaConfig()) {
    if (!config.secondary) return 0;
    return config.secondary.perfectMode === "draw"
        ? config.secondary.drawCount
        : getRngArenaSecondaryPickCount();
}

function getRngArenaActiveCompetitorEntries() {
    if (!rngArenaState) return [];
    return Object.entries(rngArenaState.competitors)
        .filter(([key]) => key !== "user2" || rngArenaState.user2Enabled);
}

function parseRngArenaNumbers(raw, count, max, label) {
    const values = String(raw || "")
        .split(/[\s,;|]+/)
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value));

    if (values.length !== count) {
        throw new Error(`${label}: wpisz dokładnie ${count} ${count === 1 ? "liczbę" : "liczb"}.`);
    }
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > max)) {
        throw new Error(`${label}: wszystkie liczby muszą być całkowite z zakresu 1–${max}.`);
    }
    if (new Set(values).size !== values.length) {
        throw new Error(`${label}: liczby nie mogą się powtarzać.`);
    }

    return values.sort((a, b) => a - b);
}

function getRngArenaInputTicket(prefix, config, pickCount) {
    const main = parseRngArenaNumbers(
        document.getElementById(`${prefix}Main`)?.value,
        pickCount,
        config.max,
        prefix === "rngArenaMe" ? "Moje typy" : "Dodatkowy użytkownik"
    );

    let secondary = [];
    if (config.secondary) {
        secondary = parseRngArenaNumbers(
            document.getElementById(`${prefix}Secondary`)?.value,
            getRngArenaSecondaryPickCount(),
            config.secondary.max,
            prefix === "rngArenaMe" ? "Moje typy dodatkowe" : "Typy dodatkowego użytkownika"
        );
    }

    return { main, secondary };
}

function rngArenaGenerateQuickPick(render = true) {
    const config = getRngArenaConfig();
    const pickCount = getRngArenaPickCount();
    const competitor = rngArenaState.competitors.rng;
    competitor.ticket = cryptoSampleUnique(pickCount, config.max);
    competitor.secondary = config.secondary
        ? cryptoSampleUnique(getRngArenaSecondaryPickCount(), config.secondary.max)
        : [];

    if (render) renderRngArenaQuickPick();
}

function renderRngArenaQuickPick() {
    const competitor = rngArenaState?.competitors?.rng;
    if (!competitor) return;
    const main = document.getElementById("rngArenaRngMain");
    const secondary = document.getElementById("rngArenaRngSecondary");
    if (main) main.innerHTML = renderRngArenaBalls(competitor.ticket, "rng");
    if (secondary) secondary.innerHTML = renderRngArenaBalls(competitor.secondary, "secondary");
}

function renderRngArenaBalls(numbers = [], variant = "main", matched = new Set()) {
    if (!numbers.length) return `<span class="rng-arena-empty-balls">—</span>`;
    return numbers.map(number => `
        <span class="rng-arena-ball ${variant} ${matched.has(number) ? "hit" : ""}">${String(number).padStart(2, "0")}</span>
    `).join("");
}

function getRngArenaHits(ticket, draw) {
    const drawSet = new Set(draw);
    return ticket.filter(number => drawSet.has(number)).length;
}

function getRngArenaRoundScore(mainHits, secondaryHits) {
    // Najpierw liczą się trafienia główne. Dodatkowe rozstrzygają remis.
    return mainHits * 10 + secondaryHits;
}

function getRngArenaSignature(mainHits, secondaryHits, config) {
    return config.secondary ? `${mainHits}+${secondaryHits}` : String(mainHits);
}

function isRngArenaPerfect(mainHits, secondaryHits, config, pickCount) {
    const mainTarget = config.perfectMode === "draw" ? config.drawCount : pickCount;
    const secondaryTarget = !config.secondary
        ? 0
        : (config.secondary.perfectMode === "draw"
            ? config.secondary.drawCount
            : getRngArenaSecondaryPickCount());
    const mainPerfect = mainHits === mainTarget;
    const secondaryPerfect = !config.secondary || secondaryHits === secondaryTarget;
    return mainPerfect && secondaryPerfect;
}

function resetRngArenaStats(keepTickets = true) {
    stopRngArena();
    if (!rngArenaState) return;

    rngArenaState.rounds = 0;
    rngArenaState.ties = 0;
    rngArenaState.firstPerfect = null;
    rngArenaState.lastWinEvent = null;
    rngArenaState.lastDraw = [];
    rngArenaState.lastSecondaryDraw = [];
    rngArenaState.sessionCompleted = false;
    rngArenaState.sessionSummary = null;
    rngArenaState.timerEndAt = null;
    rngArenaState.remainingMs = Number(rngArenaState.durationMinutes || 0) > 0
        ? getRngArenaDurationMs()
        : Infinity;

    Object.values(rngArenaState.competitors).forEach(competitor => {
        competitor.wins = 0;
        competitor.bestMain = 0;
        competitor.bestSecondary = 0;
        competitor.perfects = 0;
        competitor.hitCounts = {};
        competitor.lastMainHits = 0;
        competitor.lastSecondaryHits = 0;
        competitor.spent = 0;
        competitor.won = 0;
        competitor.lastPrize = 0;
        if (!keepTickets) {
            competitor.ticket = [];
            competitor.secondary = [];
        }
    });

    renderRngArenaLive();
}

function prepareRngArenaTickets() {
    const config = getRngArenaConfig();
    const pickCount = getRngArenaPickCount();
    const me = getRngArenaInputTicket("rngArenaMe", config, pickCount);

    rngArenaState.competitors.me.ticket = me.main;
    rngArenaState.competitors.me.secondary = me.secondary;

    if (rngArenaState.user2Enabled) {
        const user2 = getRngArenaInputTicket("rngArenaUser2", config, pickCount);
        rngArenaState.competitors.user2.ticket = user2.main;
        rngArenaState.competitors.user2.secondary = user2.secondary;
    }

    // To tylko podgląd przed startem. W każdej rundzie RNG dostaje nowy kupon.
    if (rngArenaState.competitors.rng.ticket.length !== pickCount) {
        rngArenaGenerateQuickPick(false);
    }
    if (config.secondary && rngArenaState.competitors.rng.secondary.length !== getRngArenaSecondaryPickCount()) {
        rngArenaGenerateQuickPick(false);
    }
}

function runRngArenaRound() {
    const config = getRngArenaConfig();
    const pickCount = getRngArenaPickCount();

    // Każda runda dostaje NOWY, niezależny kupon Chybił-Trafił.
    // Dzięki temu Arena symuluje prawdziwe „za każdym razem nowy zestaw RNG”.
    rngArenaGenerateQuickPick(false);

    const draw = cryptoSampleUnique(config.drawCount, config.max);
    const secondaryDraw = config.secondary
        ? cryptoSampleUnique(config.secondary.drawCount, config.secondary.max)
        : [];

    rngArenaState.rounds++;
    rngArenaState.lastDraw = draw;
    rngArenaState.lastSecondaryDraw = secondaryDraw;

    const results = [];
    let strongestWinEvent = null;
    for (const [key, competitor] of getRngArenaActiveCompetitorEntries()) {
        const mainHits = getRngArenaHits(competitor.ticket, draw);
        const secondaryHits = config.secondary
            ? getRngArenaHits(competitor.secondary, secondaryDraw)
            : 0;
        competitor.lastMainHits = mainHits;
        competitor.lastSecondaryHits = secondaryHits;

        // Każdy aktywny zawodnik kupuje jeden kupon/system na każdą wirtualną rundę.
        // Systemy liczymy jak realny zestaw zakładów prostych, a nie jak jeden tani kupon.
        const roundCost = getRngArenaTicketCost(
            rngArenaState.gameKey,
            pickCount,
            getRngArenaSecondaryPickCount()
        );
        const roundPrize = getRngArenaRoundPrize(
            rngArenaState.gameKey,
            mainHits,
            secondaryHits,
            pickCount,
            getRngArenaSecondaryPickCount()
        );
        competitor.spent += roundCost;
        competitor.won += roundPrize;
        competitor.lastPrize = roundPrize;

        const signature = getRngArenaSignature(mainHits, secondaryHits, config);
        competitor.hitCounts[signature] = (competitor.hitCounts[signature] || 0) + 1;

        if (
            mainHits > competitor.bestMain ||
            (mainHits === competitor.bestMain && secondaryHits > competitor.bestSecondary)
        ) {
            competitor.bestMain = mainHits;
            competitor.bestSecondary = secondaryHits;
        }

        if (isRngArenaPerfect(mainHits, secondaryHits, config, pickCount)) {
            competitor.perfects++;
            if (!rngArenaState.firstPerfect) {
                rngArenaState.firstPerfect = {
                    key,
                    label: competitor.label,
                    round: rngArenaState.rounds
                };
            }
        }

        const sound = getRngArenaWinSound(rngArenaState.gameKey, mainHits, secondaryHits, pickCount);
        if (sound) {
            strongestWinEvent = pickStrongerRngArenaSound(strongestWinEvent, {
                ...sound,
                key,
                competitorLabel: competitor.label,
                round: rngArenaState.rounds
            });
        }

        results.push({
            key,
            score: getRngArenaRoundScore(mainHits, secondaryHits),
            mainHits,
            secondaryHits
        });
    }

    const bestScore = Math.max(...results.map(result => result.score));
    const winners = results.filter(result => result.score === bestScore);
    if (winners.length === 1) {
        rngArenaState.competitors[winners[0].key].wins++;
    } else {
        rngArenaState.ties++;
    }

    return strongestWinEvent;
}

function buildRngArenaSessionSummary() {
    if (!rngArenaState) return null;
    const config = getRngArenaConfig();
    const entries = getRngArenaActiveCompetitorEntries();
    if (!entries.length) return null;

    const rows = entries.map(([key, competitor]) => {
        const balance = competitor.won - competitor.spent;
        const returnPercent = competitor.spent > 0 ? (competitor.won / competitor.spent) * 100 : 0;
        const best = config.secondary
            ? `${competitor.bestMain}/${getRngArenaMainResultDenominator(config)} + ${competitor.bestSecondary}/${getRngArenaSecondaryResultDenominator(config)}`
            : `${competitor.bestMain}/${getRngArenaMainResultDenominator(config)}`;
        return {
            key,
            label: competitor.label,
            wins: competitor.wins,
            perfects: competitor.perfects,
            best,
            spent: competitor.spent,
            won: competitor.won,
            balance,
            returnPercent
        };
    });

    const maxWins = Math.max(...rows.map(row => row.wins));
    const arenaWinners = rows.filter(row => row.wins === maxWins);
    const maxBalance = Math.max(...rows.map(row => row.balance));
    const financeWinners = rows.filter(row => row.balance === maxBalance);

    const rngRow = rows.find(row => row.key === "rng");
    const meRow = rows.find(row => row.key === "me");
    let duelText = "";
    if (rngRow && meRow) {
        if (meRow.wins > rngRow.wins) {
            duelText = `👤 Twoje typy pokonały RNG o ${(meRow.wins - rngRow.wins).toLocaleString("pl-PL")} wygranych rund.`;
        } else if (rngRow.wins > meRow.wins) {
            duelText = `🎲 RNG pokonał Twoje typy o ${(rngRow.wins - meRow.wins).toLocaleString("pl-PL")} wygranych rund.`;
        } else {
            duelText = `🤝 RNG i Twoje typy zakończyły sesję remisem: ${meRow.wins.toLocaleString("pl-PL")} wygranych rund.`;
        }
    }

    return {
        rounds: rngArenaState.rounds,
        ties: rngArenaState.ties,
        durationMinutes: Number(rngArenaState.durationMinutes || 0),
        endedAt: new Date().toISOString(),
        rows,
        arenaWinners: arenaWinners.map(row => row.label),
        arenaWinnerWins: maxWins,
        financeWinners: financeWinners.map(row => row.label),
        financeWinnerBalance: maxBalance,
        duelText
    };
}

function finishRngArenaTimedSession() {
    if (!rngArenaState || rngArenaState.sessionCompleted) return;
    stopRngArena();
    rngArenaState.remainingMs = 0;
    rngArenaState.timerEndAt = null;
    rngArenaState.sessionCompleted = true;
    rngArenaState.sessionSummary = buildRngArenaSessionSummary();
    if (rngArenaState.soundEnabled) playRngArenaSound("big");
    renderRngArenaLive();
}

function renderRngArenaSessionSummary() {
    const summary = rngArenaState?.sessionSummary;
    if (!summary) return "";
    const arenaWinnerText = summary.arenaWinners.length === 1
        ? summary.arenaWinners[0]
        : `REMIS: ${summary.arenaWinners.join(" + ")}`;
    const financeWinnerText = summary.financeWinners.length === 1
        ? summary.financeWinners[0]
        : `REMIS: ${summary.financeWinners.join(" + ")}`;

    const rows = summary.rows.map(row => {
        const balanceClass = row.balance > 0 ? "positive" : row.balance < 0 ? "negative" : "neutral";
        return `
            <article class="rng-arena-summary-player ${row.key}">
                <strong>${row.label}</strong>
                <div><span>Wygrane rundy</span><b>${row.wins.toLocaleString("pl-PL")}</b></div>
                <div><span>Najlepszy wynik</span><b>${row.best}</b></div>
                <div><span>Pełne trafienia</span><b>${row.perfects.toLocaleString("pl-PL")}</b></div>
                <div><span>Wydane</span><b>${formatRngArenaMoney(row.spent)}</b></div>
                <div><span>Wygrane</span><b>${formatRngArenaMoney(row.won)}</b></div>
                <div class="${balanceClass}"><span>Bilans</span><b>${row.balance > 0 ? "+" : ""}${formatRngArenaMoney(row.balance)}</b></div>
                <div><span>Zwrot</span><b>${row.returnPercent.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%</b></div>
            </article>
        `;
    }).join("");

    return `
        <section class="rng-arena-session-summary">
            <div class="rng-arena-session-summary-head">
                <div>
                    <span>⏱️ SESJA CZASOWA ZAKOŃCZONA</span>
                    <strong>${summary.durationMinutes} min • ${summary.rounds.toLocaleString("pl-PL")} rund</strong>
                </div>
                <b>Automatyczny STOP</b>
            </div>
            <div class="rng-arena-summary-winners">
                <div><span>🏁 Zwycięzca zawodów</span><strong>${arenaWinnerText}</strong><small>${summary.arenaWinnerWins.toLocaleString("pl-PL")} wygranych rund</small></div>
                <div><span>💰 Najlepszy bilans</span><strong>${financeWinnerText}</strong><small>${summary.financeWinnerBalance > 0 ? "+" : ""}${formatRngArenaMoney(summary.financeWinnerBalance)}</small></div>
            </div>
            ${summary.duelText ? `<div class="rng-arena-summary-duel">${summary.duelText}</div>` : ""}
            <div class="rng-arena-summary-grid">${rows}</div>
        </section>
    `;
}

function runRngArenaBatch(amount) {
    let strongestWinEvent = null;
    for (let i = 0; i < amount; i++) {
        strongestWinEvent = pickStrongerRngArenaSound(strongestWinEvent, runRngArenaRound());
    }
    // Przy 10/100/1000 losowaniach na sekundę nie gramy setek dźwięków naraz.
    // Odtwarzamy jeden — najmocniejsze trafienie z całej paczki.
    if (strongestWinEvent) triggerRngArenaWinEvent(strongestWinEvent);
    renderRngArenaLive();
}

function startRngArena() {
    try {
        ensureRngArenaAudio();

        // START po zakończonej sesji czasowej rozpoczyna świeży wyścig,
        // ale zostawia wpisane kupony użytkowników.
        if (
            rngArenaState.sessionCompleted &&
            Number(rngArenaState.durationMinutes || 0) > 0 &&
            Number(rngArenaState.remainingMs || 0) <= 0
        ) {
            resetRngArenaStats(true);
        }

        prepareRngArenaTickets();
        stopRngArena();
        const speed = clamp(Number(document.getElementById("rngArenaSpeed")?.value || 1), 1, 1000);
        rngArenaState.speed = speed;

        const durationMs = getRngArenaDurationMs();
        if (durationMs > 0) {
            if (!Number.isFinite(rngArenaState.remainingMs) || rngArenaState.remainingMs <= 0) {
                rngArenaState.remainingMs = durationMs;
            }
            rngArenaState.timerEndAt = Date.now() + rngArenaState.remainingMs;
        } else {
            rngArenaState.remainingMs = Infinity;
            rngArenaState.timerEndAt = null;
        }

        rngArenaState.running = true;
        rngArenaState.sessionCompleted = false;
        rngArenaState.sessionSummary = null;

        // UI odświeżamy raz na sekundę, a w środku możemy policzyć 1/10/100/1000 rund.
        rngArenaTimer = setInterval(() => {
            if (!document.getElementById("rngArenaRoot")) {
                stopRngArena();
                return;
            }

            if (Number(rngArenaState.durationMinutes || 0) > 0) {
                syncRngArenaRemainingTime();
                if (rngArenaState.remainingMs <= 0) {
                    finishRngArenaTimedSession();
                    return;
                }
            }

            runRngArenaBatch(rngArenaState.speed);

            if (Number(rngArenaState.durationMinutes || 0) > 0) {
                syncRngArenaRemainingTime();
                if (rngArenaState.remainingMs <= 0) {
                    finishRngArenaTimedSession();
                }
            }
        }, 1000);
        renderRngArenaLive();
    } catch (error) {
        console.error("RNG Arena:", error);
        alert(`❌ Nie mogę wystartować zawodów.\n\n${error.message}`);
    }
}

function pauseRngArena() {
    stopRngArena();
    renderRngArenaLive();
}

function getRngArenaSortedHitRows(competitor, config) {
    return Object.entries(competitor.hitCounts)
        .sort((a, b) => {
            const parse = value => value.split("+").map(Number);
            const [am, as = 0] = parse(a[0]);
            const [bm, bs = 0] = parse(b[0]);
            return bm - am || bs - as;
        })
        .slice(0, 8)
        .map(([signature, count]) => {
            if (!config.secondary) {
                return `${signature}/${getRngArenaMainResultDenominator(config)} → ${count.toLocaleString("pl-PL")}`;
            }
            const [mainHits, secondaryHits = 0] = signature.split("+").map(Number);
            return `${mainHits}/${getRngArenaMainResultDenominator(config)} + ${secondaryHits}/${getRngArenaSecondaryResultDenominator(config)} → ${count.toLocaleString("pl-PL")}`;
        })
        .join(" • ") || "—";
}

function renderRngArenaCompetitorCard(key, competitor, config) {
    const drawSet = new Set(rngArenaState.lastDraw || []);
    const secondarySet = new Set(rngArenaState.lastSecondaryDraw || []);
    const mainDenominator = getRngArenaMainResultDenominator(config);
    const secondaryDenominator = getRngArenaSecondaryResultDenominator(config);
    const bestText = config.secondary
        ? `${competitor.bestMain}/${mainDenominator} + ${competitor.bestSecondary}/${secondaryDenominator}`
        : `${competitor.bestMain}/${mainDenominator}`;
    const lastText = config.secondary
        ? `${competitor.lastMainHits}/${mainDenominator} + ${competitor.lastSecondaryHits}/${secondaryDenominator}`
        : `${competitor.lastMainHits}/${mainDenominator}`;

    const balance = competitor.won - competitor.spent;
    const returnPercent = competitor.spent > 0
        ? (competitor.won / competitor.spent) * 100
        : 0;
    const balanceClass = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";

    return `
        <article class="rng-arena-player ${key}">
            <div class="rng-arena-player-head">
                <strong>${competitor.label}</strong>
                <span>ostatnio: ${lastText}</span>
            </div>
            <div class="rng-arena-player-balls">${renderRngArenaBalls(competitor.ticket, key === "rng" ? "rng" : "main", drawSet)}</div>
            ${config.secondary ? `<div class="rng-arena-player-balls secondary-row">${renderRngArenaBalls(competitor.secondary, "secondary", secondarySet)}</div>` : ""}
            <div class="rng-arena-player-stats">
                <div><span>Wygrane rundy</span><strong>${competitor.wins.toLocaleString("pl-PL")}</strong></div>
                <div><span>Najlepszy wynik</span><strong>${bestText}</strong></div>
                <div><span>Pełne trafienia</span><strong>${competitor.perfects.toLocaleString("pl-PL")}</strong></div>
            </div>

            <div class="rng-arena-finance-grid">
                <div class="spent"><span>💸 Wydane</span><strong>${formatRngArenaMoney(competitor.spent)}</strong></div>
                <div class="won"><span>💰 Wygrane</span><strong>${formatRngArenaMoney(competitor.won)}</strong></div>
                <div class="balance ${balanceClass}"><span>📊 Bilans</span><strong>${balance > 0 ? "+" : ""}${formatRngArenaMoney(balance)}</strong></div>
                <div class="last-prize"><span>🎯 Ostatnia wygrana</span><strong>${formatRngArenaMoney(competitor.lastPrize)}</strong></div>
                <div class="return"><span>↩ Zwrot</span><strong>${returnPercent.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%</strong></div>
            </div>

            <small class="rng-arena-hitlog">${getRngArenaSortedHitRows(competitor, config)}</small>
        </article>
    `;
}

function renderRngArenaLive() {
    if (!rngArenaState || !document.getElementById("rngArenaRoot")) return;
    const config = getRngArenaConfig();
    const status = document.getElementById("rngArenaStatus");
    const draw = document.getElementById("rngArenaDraw");
    const secondaryDraw = document.getElementById("rngArenaSecondaryDraw");
    const players = document.getElementById("rngArenaPlayers");
    const firstPerfect = document.getElementById("rngArenaFirstPerfect");
    const winAlert = document.getElementById("rngArenaWinAlert");
    const financeInfo = document.getElementById("rngArenaFinanceInfo");
    const sessionSummaryHost = document.getElementById("rngArenaSessionSummary");

    if (status) {
        status.innerHTML = `
            <div><span>Rundy</span><strong>${rngArenaState.rounds.toLocaleString("pl-PL")}</strong></div>
            <div><span>Tempo</span><strong>${rngArenaState.speed.toLocaleString("pl-PL")}/s</strong></div>
            <div><span>Remisy</span><strong>${rngArenaState.ties.toLocaleString("pl-PL")}</strong></div>
            <div><span>Koszt / gracza / rundę</span><strong>${formatRngArenaMoney(getRngArenaTicketCost())}</strong></div>
            <div class="rng-arena-clock-stat"><span>⏱️ Pozostało</span><strong>${formatRngArenaClock(syncRngArenaRemainingTime())}</strong></div>
            <div><span>Status</span><strong class="${rngArenaState.running ? "running" : "paused"}">${rngArenaState.running ? "● DZIAŁA" : (rngArenaState.sessionCompleted ? "■ KONIEC SESJI" : "■ PAUZA")}</strong></div>
        `;
    }

    if (sessionSummaryHost) {
        sessionSummaryHost.innerHTML = renderRngArenaSessionSummary();
    }

    if (financeInfo) {
        const info = getRngArenaFinanceInfo();
        financeInfo.innerHTML = `
            <div class="rng-arena-finance-price">
                <span>💳 REALNY KOSZT JEDNEJ WIRTUALNEJ RUNDY / GRACZA</span>
                <strong>${formatRngArenaMoney(info.cost)}</strong>
                <small>${info.comboText}</small>
            </div>
            <div class="rng-arena-finance-model">
                <span>MODEL WYPŁAT • ${RNG_ARENA_FINANCE_MODEL.modelDate}</span>
                <strong>${info.modelLabel}</strong>
                <small>${info.note}</small>
            </div>
        `;
    }

    // Podgląd RNG pokazuje zawsze kupon użyty w ostatniej przeliczonej rundzie.
    renderRngArenaQuickPick();

    if (draw) draw.innerHTML = renderRngArenaBalls(rngArenaState.lastDraw, "draw");
    if (secondaryDraw) secondaryDraw.innerHTML = config.secondary
        ? renderRngArenaBalls(rngArenaState.lastSecondaryDraw, "secondary")
        : "";
    if (players) {
        players.classList.toggle("two-players", !rngArenaState.user2Enabled);
        players.innerHTML = getRngArenaActiveCompetitorEntries()
            .map(([key, competitor]) => renderRngArenaCompetitorCard(key, competitor, config))
            .join("");
    }

    const setup = document.querySelector(".rng-arena-ticket-setup");
    const user2Setup = document.getElementById("rngArenaUser2Setup");
    const user2Toggle = document.getElementById("rngArenaUser2Enabled");
    const soundToggle = document.getElementById("rngArenaSoundEnabled");
    if (setup) setup.classList.toggle("two-players", !rngArenaState.user2Enabled);
    if (user2Setup) user2Setup.classList.toggle("user2-disabled", !rngArenaState.user2Enabled);
    if (user2Toggle) user2Toggle.checked = rngArenaState.user2Enabled;
    if (firstPerfect) {
        firstPerfect.innerHTML = rngArenaState.firstPerfect
            ? `🏆 Pierwsze pełne trafienie: <strong>${rngArenaState.firstPerfect.label}</strong> w rundzie <strong>#${rngArenaState.firstPerfect.round.toLocaleString("pl-PL")}</strong>`
            : "🏁 Wyścig trwa: kto pierwszy zaliczy pełne trafienie?";
    }

    if (winAlert) {
        const event = rngArenaState.lastWinEvent;
        if (!event) {
            winAlert.className = "rng-arena-win-alert empty";
            winAlert.innerHTML = "🔈 Dźwięk odezwie się, gdy któryś zawodnik zaliczy poziom wygranej.";
        } else {
            const icon = event.tier === "epic" ? "🏆" : event.tier === "big" ? "🔥" : "🔔";
            winAlert.className = `rng-arena-win-alert ${event.tier}`;
            winAlert.innerHTML = `${icon} <strong>${event.competitorLabel}</strong> — ${event.result} • ${event.label} <small>runda #${Number(event.atRound || event.round || 0).toLocaleString("pl-PL")}</small>`;
        }
    }

    const startBtn = document.getElementById("rngArenaStartBtn");
    const pauseBtn = document.getElementById("rngArenaPauseBtn");
    if (startBtn) startBtn.disabled = rngArenaState.running;
    if (pauseBtn) pauseBtn.disabled = !rngArenaState.running;
}

function bindRngArenaEvents() {
    const gameSelect = document.getElementById("rngArenaGame");
    const pickSelect = document.getElementById("rngArenaPickCount");
    const secondaryPickSelect = document.getElementById("rngArenaSecondaryPickCount");
    const speedSelect = document.getElementById("rngArenaSpeed");
    const durationSelect = document.getElementById("rngArenaDuration");
    const user2Toggle = document.getElementById("rngArenaUser2Enabled");
    const soundToggle = document.getElementById("rngArenaSoundEnabled");

    gameSelect?.addEventListener("change", () => showRngArena(gameSelect.value));
    pickSelect?.addEventListener("change", () => {
        const gameKey = rngArenaState.gameKey;
        showRngArena(gameKey, Number(pickSelect.value), getRngArenaSecondaryPickCount());
    });
    secondaryPickSelect?.addEventListener("change", () => {
        const gameKey = rngArenaState.gameKey;
        showRngArena(gameKey, getRngArenaPickCount(), Number(secondaryPickSelect.value));
    });
    speedSelect?.addEventListener("change", () => {
        rngArenaState.speed = clamp(Number(speedSelect.value || 1), 1, 1000);
        if (rngArenaState.running) startRngArena();
        else renderRngArenaLive();
    });

    durationSelect?.addEventListener("change", () => {
        stopRngArena();
        rngArenaState.durationMinutes = Math.max(0, Number(durationSelect.value || 0));
        // Zmiana długości sesji rozpoczyna nowy, uczciwy pomiar od zera.
        resetRngArenaStats(true);
    });

    user2Toggle?.addEventListener("change", () => {
        // Zmieniamy skład zawodów, więc zerujemy ranking, żeby porównanie było uczciwe.
        stopRngArena();
        rngArenaState.user2Enabled = user2Toggle.checked;
        resetRngArenaStats(true);
    });

    soundToggle?.addEventListener("change", () => {
        rngArenaState.soundEnabled = soundToggle.checked;
        if (rngArenaState.soundEnabled) {
            ensureRngArenaAudio();
            playRngArenaSound("alert");
        }
    });

    document.getElementById("rngArenaStartBtn")?.addEventListener("click", startRngArena);
    document.getElementById("rngArenaPauseBtn")?.addEventListener("click", pauseRngArena);
    document.getElementById("rngArenaStepBtn")?.addEventListener("click", () => {
        try {
            ensureRngArenaAudio();
            prepareRngArenaTickets();
            runRngArenaBatch(1);
        } catch (error) {
            alert(`❌ ${error.message}`);
        }
    });
    document.getElementById("rngArenaResetBtn")?.addEventListener("click", () => resetRngArenaStats(true));
    document.getElementById("rngArenaSoundTestBtn")?.addEventListener("click", () => {
        ensureRngArenaAudio();
        playRngArenaSound("epic");
    });
}

function showRngArena(gameKey = null, forcedPickCount = null, forcedSecondaryPickCount = null) {
    stopRngArena();
    const resolvedKey = RNG_ARENA_GAME_CONFIG[gameKey] ? gameKey : getCurrentGameKey();
    const previous = rngArenaState;
    const config = RNG_ARENA_GAME_CONFIG[resolvedKey];
    const previousPickCount = previous?.gameKey === resolvedKey
        ? Number(previous.pickCount || config.pickCount)
        : config.pickCount;
    const pickMin = Number(config.pickMin ?? config.pickCount);
    const pickMax = Number(config.pickMax ?? config.pickCount);
    const pickCount = config.variablePick
        ? clamp(Number(forcedPickCount ?? previousPickCount), pickMin, pickMax)
        : config.pickCount;

    const secondaryDefault = config.secondary?.pickCount || 0;
    const previousSecondaryPickCount = previous?.gameKey === resolvedKey
        ? Number(previous.secondaryPickCount || secondaryDefault)
        : secondaryDefault;
    const secondaryPickMin = Number(config.secondary?.pickMin ?? secondaryDefault);
    const secondaryPickMax = Number(config.secondary?.pickMax ?? secondaryDefault);
    const secondaryPickCount = config.secondary?.variablePick
        ? clamp(Number(forcedSecondaryPickCount ?? previousSecondaryPickCount), secondaryPickMin, secondaryPickMax)
        : secondaryDefault;

    rngArenaState = createRngArenaState(resolvedKey);
    rngArenaState.pickCount = pickCount;
    rngArenaState.secondaryPickCount = secondaryPickCount;
    rngArenaState.speed = previous?.speed || 1;
    rngArenaState.user2Enabled = previous ? previous.user2Enabled !== false : true;
    rngArenaState.soundEnabled = previous ? previous.soundEnabled !== false : true;
    rngArenaState.durationMinutes = previous ? Math.max(0, Number(previous.durationMinutes ?? 60)) : 60;
    rngArenaState.remainingMs = rngArenaState.durationMinutes > 0
        ? rngArenaState.durationMinutes * 60 * 1000
        : Infinity;
    rngArenaGenerateQuickPick(false);

    contentArea.classList.remove("stats-view", "lab-view");
    contentArea.classList.add("rng-arena-view");
    contentArea.innerHTML = `
        <div id="rngArenaRoot" class="rng-arena-root">
            <div class="rng-arena-hero">
                <div>
                    <span class="rng-arena-kicker">LOTTOFORGE • WEB CRYPTO</span>
                    <h1>⚡ Every Second — RNG Arena</h1>
                    <p>Jedno wspólne wirtualne losowanie. RNG kontra Twoje typy — opcjonalnie także drugi gracz.</p>
                </div>
                <div class="rng-arena-controls-grid">
                    <label>Gra
                        <select id="rngArenaGame">
                            ${Object.entries(RNG_ARENA_GAME_CONFIG).map(([key, item]) => `<option value="${key}" ${key === resolvedKey ? "selected" : ""}>${item.label}</option>`).join("")}
                        </select>
                    </label>
                    ${config.variablePick ? `<label>${config.systemMode ? "System — liczby główne" : "Ile liczb typuje każdy?"}
                        <select id="rngArenaPickCount">
                            ${Array.from({ length: (config.pickMax - config.pickMin + 1) }, (_, index) => config.pickMin + index).map(value => `<option value="${value}" ${value === pickCount ? "selected" : ""}>${value}${config.systemMode ? (value === config.drawCount ? " — zwykły zakład" : " — system") : ""}</option>`).join("")}
                        </select>
                    </label>` : ""}
                    ${config.secondary?.variablePick ? `<label>System — liczby ${config.secondary.label}
                        <select id="rngArenaSecondaryPickCount">
                            ${Array.from({ length: (config.secondary.pickMax - config.secondary.pickMin + 1) }, (_, index) => config.secondary.pickMin + index).map(value => `<option value="${value}" ${value === secondaryPickCount ? "selected" : ""}>${value}${value === config.secondary.drawCount ? " — zwykły zakład" : " — system"}</option>`).join("")}
                        </select>
                    </label>` : ""}
                    <label>Tempo symulacji
                        <select id="rngArenaSpeed">
                            ${[1,10,100,1000].map(value => `<option value="${value}" ${value === rngArenaState.speed ? "selected" : ""}>${value.toLocaleString("pl-PL")} los./s</option>`).join("")}
                        </select>
                    </label>
                    <label>Czas sesji
                        <select id="rngArenaDuration">
                            ${[
                                [0, "Bez limitu"],
                                [1, "1 minuta"],
                                [5, "5 minut"],
                                [10, "10 minut"],
                                [15, "15 minut"],
                                [30, "30 minut"],
                                [60, "60 minut"],
                                [120, "120 minut"]
                            ].map(([value, label]) => `<option value="${value}" ${Number(value) === Number(rngArenaState.durationMinutes) ? "selected" : ""}>${label}</option>`).join("")}
                        </select>
                    </label>
                    <label class="rng-arena-toggle-control">Dodatkowy gracz
                        <span class="rng-arena-toggle-line">
                            <input id="rngArenaUser2Enabled" type="checkbox" ${rngArenaState.user2Enabled ? "checked" : ""}>
                            <strong>Uwzględnij w zawodach</strong>
                        </span>
                    </label>
                    <label class="rng-arena-toggle-control">Dźwięki wygranych
                        <span class="rng-arena-toggle-line">
                            <input id="rngArenaSoundEnabled" type="checkbox" ${rngArenaState.soundEnabled ? "checked" : ""}>
                            <strong>🔊 Alert / Big / EPIC</strong>
                        </span>
                    </label>
                </div>
            </div>

            <section class="rng-arena-ticket-setup">
                <article class="rng-arena-setup-card rng">
                    <div class="rng-arena-setup-head"><strong>🎲 RNG / Chybił-Trafił</strong><span class="rng-arena-live-badge">NOWY CO RUNDĘ</span></div>
                    <div id="rngArenaRngMain" class="rng-arena-setup-balls"></div>
                    ${config.secondary ? `<div id="rngArenaRngSecondary" class="rng-arena-setup-balls secondary-row"></div>` : ""}
                    <small>W każdej wirtualnej rundzie Web Crypto tworzy zupełnie nowy ${config.systemMode && pickCount > config.drawCount ? `system ${pickCount}` : "kupon RNG"}${config.secondary?.systemMode && secondaryPickCount > config.secondary.drawCount ? ` + system Euro ${secondaryPickCount}` : ""}. Tu widzisz zestaw użyty w ostatniej rundzie.</small>
                </article>

                <article class="rng-arena-setup-card">
                    <strong>👤 Moje typy</strong>
                    <input id="rngArenaMeMain" type="text" placeholder="${Array.from({ length: pickCount }, (_, i) => Math.min(i + 1, config.max)).join(", ")}">
                    ${config.secondary ? `<input id="rngArenaMeSecondary" type="text" placeholder="${config.secondary.label}: ${Array.from({ length: secondaryPickCount }, (_, i) => i + 1).join(", ")}">` : ""}
                    <small>${config.systemMode ? `System ${pickCount}: wpisz dokładnie ${pickCount} liczb z 1–${config.max}. Pełne trafienie = wszystkie ${config.drawCount} wylosowanych liczb są w systemie.` : `Dokładnie ${pickCount} ${pickCount === 1 ? "liczba" : "liczb"} z 1–${config.max}.`}${config.secondary ? ` ${config.secondary.systemMode ? `Euro system ${secondaryPickCount}: wpisz ${secondaryPickCount} liczb z 1–${config.secondary.max}; pełne = ${config.secondary.drawCount}/${config.secondary.drawCount}.` : `+ ${secondaryPickCount} z 1–${config.secondary.max}.`}` : ""}</small>
                </article>

                <article id="rngArenaUser2Setup" class="rng-arena-setup-card ${rngArenaState.user2Enabled ? "" : "user2-disabled"}">
                    <strong>👥 Dodatkowy użytkownik</strong>
                    <input id="rngArenaUser2Main" type="text" placeholder="${Array.from({ length: pickCount }, (_, i) => Math.max(1, config.max - pickCount + 1 + i)).join(", ")}">
                    ${config.secondary ? `<input id="rngArenaUser2Secondary" type="text" placeholder="${config.secondary.label}: ${Array.from({ length: secondaryPickCount }, (_, i) => Math.max(1, config.secondary.max - secondaryPickCount + 1 + i)).join(", ")}">` : ""}
                    <small>Drugi stały kupon porównywany z dokładnie tym samym losowaniem.</small>
                </article>
            </section>

            <div class="rng-arena-actions">
                <button id="rngArenaStartBtn" class="primary-btn">▶ START</button>
                <button id="rngArenaPauseBtn" class="lab-secondary-btn">⏸ PAUZA</button>
                <button id="rngArenaStepBtn" class="lab-secondary-btn">⏭ 1 LOSOWANIE</button>
                <button id="rngArenaResetBtn" class="lab-secondary-btn">↺ RESET STATYSTYK</button>
                <button id="rngArenaSoundTestBtn" class="lab-secondary-btn">🔊 TEST EPIC</button>
            </div>

            <section class="rng-arena-draw-card">
                <div class="rng-arena-draw-head">
                    <div><span>GŁÓWNE WIRTUALNE LOSOWANIE</span><strong>${config.label}</strong></div>
                    <small>${config.drawCount} z ${config.max}${config.secondary ? ` • ${config.secondary.drawCount} z ${config.secondary.max}` : ""}${config.systemMode && pickCount > config.drawCount ? ` • SYSTEM ${pickCount}` : ""}${config.secondary?.systemMode && secondaryPickCount > config.secondary.drawCount ? ` + EURO ${secondaryPickCount}` : ""}</small>
                </div>
                <div id="rngArenaDraw" class="rng-arena-draw-balls"></div>
                ${config.secondary ? `<div id="rngArenaSecondaryDraw" class="rng-arena-draw-balls secondary-row"></div>` : ""}
            </section>

            <div id="rngArenaFinanceInfo" class="rng-arena-finance-info"></div>
            <div id="rngArenaPrizeTableHost">${renderRngArenaPrizeTable(resolvedKey, pickCount)}</div>
            <div id="rngArenaStatus" class="rng-arena-status"></div>
            <div id="rngArenaWinAlert" class="rng-arena-win-alert empty"></div>
            <div id="rngArenaFirstPerfect" class="rng-arena-first-perfect"></div>
            <div id="rngArenaSessionSummary"></div>
            <section id="rngArenaPlayers" class="rng-arena-players ${rngArenaState.user2Enabled ? "" : "two-players"}"></section>

            <div class="rng-arena-footnote">
                <strong>Jak liczymy zawody i pieniądze?</strong> Każda wirtualna runda oznacza zakup nowego zakładu przez każdego aktywnego zawodnika. Systemy Mini/Lotto/Euro są rozbijane na wszystkie zakłady proste: koszt i wygrana sumują się dokładnie z liczby kombinacji. Multi Multi liczymy przy stawce x1 bez Plusa, Lotto bez Lotto Plus, a Ekstra Pensję bez Ekstra Premii. Kwoty zmienne w Mini/Lotto/Euro są symulowane na historycznych średnich/estymatach, więc nie są obietnicą przyszłej wypłaty. Pokazywane wygrane są kwotami brutto — symulator nie odejmuje podatku. W Ekstra Pensji 5+1 wartość 1,2 mln zł oznacza nominalnie 240 wypłat po 5 000 zł. Czasowe promocje Multi Multi nie są doliczane. Najpierw porównujemy trafienia główne; liczby dodatkowe rozstrzygają remis. Dźwięki i wyścig pełnych trafień działają tak jak wcześniej. Sesja czasowa odlicza rzeczywisty czas działania (pauza zatrzymuje zegar); po dojściu do zera Arena robi automatyczny STOP i tworzy podsumowanie zwycięzcy rund oraz najlepszego bilansu.
            </div>
        </div>
    `;

    renderRngArenaQuickPick();
    bindRngArenaEvents();
    renderRngArenaLive();
}

/* =========================================================
   LOTTOFORGE MOBILE v9 — NAWIGACJA TELEFON
   Desktop pozostaje bez zmian; aktywne tylko do 899 px.
   ========================================================= */
(function initLottoForgeMobileNavigation(){
    const MOBILE_BREAKPOINT = 899;
    const body = document.body;
    const menuButton = document.getElementById("mobileMenuBtn");
    const closeButton = document.getElementById("mobileMenuCloseBtn");
    const backdrop = document.getElementById("mobileNavBackdrop");
    const sidebar = document.getElementById("appSidebar");

    if (!body || !menuButton || !closeButton || !backdrop || !sidebar) return;

    const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

    const setOpen = (open) => {
        const shouldOpen = Boolean(open && isMobile());
        body.classList.toggle("mobile-menu-open", shouldOpen);
        menuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        backdrop.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    };

    menuButton.addEventListener("click", () => {
        setOpen(!body.classList.contains("mobile-menu-open"));
    });

    closeButton.addEventListener("click", () => setOpen(false));
    backdrop.addEventListener("click", () => setOpen(false));

    sidebar.querySelectorAll("button").forEach(button => {
        if (button === closeButton) return;
        button.addEventListener("click", () => {
            if (isMobile()) setOpen(false);
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && body.classList.contains("mobile-menu-open")) {
            setOpen(false);
        }
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) setOpen(false);
    }, { passive: true });
})();
