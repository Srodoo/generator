const games = {
    mini: {
        title: "🎲 Generator Mini Lotto",
        count: 5,
        max: 42,
        ranges: [10,20,30,40,42]
    },

    lotto: {
        title: "🎲 Generator Lotto",
        count: 6,
        max: 49,
        ranges: [10,20,30,40,49]
    },

    euro: {
    title: "🎲 Generator EuroJackpot",
    count: 5,
    max: 50,

    euroCount: 2,
    euroMax: 12,

    ranges: [10,20,30,40,50]
},

    multi: {
        title: "🎲 Generator Multi Multi",
        count: 10,
        max: 80,
        ranges: [10,20,30,40,50,60,70,80]
    },

    extra: {
    title: "🎲 Generator Extra Pensja",
    count: 5,
    max: 35,

    extraCount: 1,
    extraMax: 4,

    ranges: [10,20,30,35]
}
};
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

            alert(
                `✅ Zaimportowano ${gameDraws.length} losowań dla ${currentGame.title}!` +
                (ignoredRows > 0 ? `\nPominięto wierszy: ${ignoredRows}` : "") +
                (latestDraw
                    ? `\n\n📅 Ostatnie losowanie: ${latestDraw.data}` +
                      `\n🔢 ${formatLatestDrawNumbers(latestDraw)}`
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

<div class="auto-forge-controls">
    <div class="auto-forge-stage-badge">ETAP 4 • ANALIZA + SILNIK WYBORU</div>
    <label for="autoForgeMode">Tryb analizy AUTO FORGE</label>
    <select id="autoForgeMode">
        <option value="auto" selected>AUTO — 5 / 10 / 15</option>
        <option value="5">Tylko 5 ostatnich</option>
        <option value="10">Tylko 10 ostatnich</option>
        <option value="15">Tylko 15 ostatnich</option>
    </select>
</div>

<div class="generator-actions">
<button id="generateBtn" class="primary-btn">
    Generuj liczby
</button>

<button id="autoForgeBtn" class="primary-btn auto-forge-btn">
    🧠 AUTO FORGE — ANALIZUJ
</button>
</div>

<div id="autoForgeReport" class="auto-forge-report"></div>

    <div id="numbers" class="ball-container"></div>

${currentGame === games.euro ? `
<div id="euroNumbers" class="ball-container"></div>
` : ""}
${currentGame === games.extra ? `
<div id="extraNumber" class="ball-container"></div>
` : ""}
<div id="stats"></div>

<div class="side-panel">

   <h2>🎯 Filtry</h2>
   <hr>


<h3>Struktura</h3>

${currentGame.ranges.map((value,index)=>{

    return `

<label>${labels[index]}</label>

<input
    type="number"
    id="r${index+1}"
    min="0"
    max="${currentGame.count}"
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
    value="${getMinPossibleSum(currentGame.count)}"
    min="0">

<br><br>

<label>Suma do</label>

<input
    type="number"
    id="sumMax"
    value="${getMaxPossibleSum(currentGame.count, currentGame.max)}"
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
    max="${currentGame === games.multi ? 10 : currentGame.count}"
    value="0">

<br><br>

<label>Nieparzyste:</label>
<input
    type="number"
    id="oddCount"
    min="0"
    max="${currentGame === games.multi ? 10 : currentGame.count}"
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
    max="${currentGame.count}"
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

`;

    const generateBtn = document.getElementById("generateBtn");
    const autoForgeBtn = document.getElementById("autoForgeBtn");

    const autoForgeModeSelect = document.getElementById("autoForgeMode");
    autoForgeModeSelect.value = autoForgeMode;
    autoForgeModeSelect.addEventListener("change", () => {
        autoForgeMode = autoForgeModeSelect.value;
    });

    generateBtn.addEventListener("click", generateMiniLotto);
    autoForgeBtn.addEventListener("click", runAutoForge);
    if (currentGame === games.multi) {

    const multiCount = document.getElementById("multiCount");
    const sumMinInput = document.getElementById("sumMin");
    const sumMaxInput = document.getElementById("sumMax");

    multiCount.addEventListener("change", () => {

        const count = Number(multiCount.value);

        sumMinInput.value = getMinPossibleSum(count);
        sumMaxInput.value = getMaxPossibleSum(count, currentGame.max);
    });
}

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

function getAutoForgeTargetCount() {
    if (currentGame === games.multi) {
        return Number(document.getElementById("multiCount")?.value || currentGame.count);
    }
    return currentGame.count;
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
            { key: "LOW", label: "LOW", start: 1, end: 30 },
            { key: "MID", label: "MID", start: 31, end: 50 },
            { key: "HIGH", label: "HIGH", start: 51, end: 80 }
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
    if (autoForgeMode === "5" || autoForgeMode === "10" || autoForgeMode === "15") {
        return {
            requestedWindows: [Number(autoForgeMode)],
            weights: [1],
            label: `${autoForgeMode}`
        };
    }

    return {
        requestedWindows: [5, 10, 15],
        weights: [0.40, 0.35, 0.25],
        label: "5 / 10 / 15"
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
            // tylko na krótkich oknach 5/10/15, więc koszt pozostaje kontrolowany.
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

    // ETAP 4: relacje między liczbami. Najpierw budujemy niezależny model
    // powrotów oraz współwystępowania par / trójek / czwórek na tych samych
    // ważonych oknach 5/10/15.
    const patternModel = buildAutoForgePatternModel(
        draws,
        requestedWindows,
        weights
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

    // AUTO SCORE konkretnej liczby. Geografia planszy ma najwyższy priorytet,
    // potem HOT/MID/COLD, powroty i relacje. Losowość zostaje dopiero na końcu.
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
        const isLatest = latestSet.has(n);

        const sectorComponent = sectorNorm * 35;
        const hotColdComponent = isHot ? 20 : isCold ? -18 : frequencyNorm * 10;
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
            status: isHot ? "HOT" : isCold ? "COLD" : "MID",
            returnRate: isLatest ? patternModel.returnScores[n] : 0,
            isLatest
        };
        rankedNumbers.push({ number: n, score: total });
    }
    rankedNumbers.sort((a, b) => b.score - a.score || a.number - b.number);

    const activeNumberSet = new Set();
    structure.forEach((quota, sectorIndex) => {
        if (quota <= 0) return;
        const bounds = getSectorBounds(sectorIndex);
        for (let n = bounds.start; n <= bounds.end; n++) activeNumberSet.add(n);
    });

    const topPairs = getTopPatternEntries(patternModel.pairScores, activeNumberSet, 5, structure);
    const topTriples = getTopPatternEntries(patternModel.tripleScores, activeNumberSet, 4, structure);
    const topQuads = getTopPatternEntries(patternModel.quadScores, activeNumberSet, 3, structure);

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

    // Spójność profilu 5/10/15 — to nie jest prawdopodobieństwo trafienia.
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
        focusPercent,
        focusTargetCount,
        outsideTargetCount,
        signalStrength,
        structure,
        activeSectors,
        suggestedEven,
        suggestedOdd,
        focusEvenShare,
        hotPool,
        coldPool,
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


function buildAutoForgeGenerationPlan(analysis) {
    // HOT oznacza wyłącznie prawdziwy TOP HOT z diagnozy.
    // Szerszy ranking liczbowy jest osobnym mechanizmem i nie miesza etykiet.
    const hotPool = [...(analysis.hotPool || [])];
    const hotBySector = new Array(currentGame.ranges.length).fill(0);
    hotPool.forEach(number => hotBySector[getSectorIndex(number)]++);

    const maxHotThatFits = analysis.structure.reduce(
        (sum, quota, index) => sum + Math.min(quota, hotBySector[index]),
        0
    );

    const hotRatio = analysis.signalStrength >= 0.68
        ? 0.55
        : analysis.signalStrength >= 0.42
            ? 0.45
            : 0.35;

    const hotCount = clamp(
        Math.min(
            Math.round(analysis.targetCount * hotRatio),
            maxHotThatFits,
            hotPool.length
        ),
        0,
        analysis.targetCount
    );

    return {
        analysis,
        targetCount: analysis.targetCount,
        structure: [...analysis.structure],
        hotPool,
        hotCount,
        coldPool: [...(analysis.coldPool || [])],
        numberScores: analysis.numberScores || [],
        numberComponents: analysis.numberComponents || [],
        patternModel: analysis.patternModel || null,
        sectorScores: analysis.sectorScores || [],
        suggestedEven: analysis.suggestedEven,
        suggestedOdd: analysis.suggestedOdd,
        suggestedReturnCount: analysis.suggestedReturnCount || 0,
        lastSelectedHotNumbers: [],
        lastColdPoolUsed: [],
        selectionTrace: []
    };
}

function getSafeAutoForgeColdPool(plan, manualExcludedNumbers = [], manualRequiredPool = []) {
    if (!plan) return [];

    const manualExcludedSet = new Set(manualExcludedNumbers);
    const manualRequiredSet = new Set(manualRequiredPool);
    const safeCold = [];

    for (const number of plan.coldPool) {
        if (manualRequiredSet.has(number) || manualExcludedSet.has(number)) continue;

        const sector = getSectorIndex(number);
        const quota = plan.structure[sector] || 0;
        const bounds = getSectorBounds(sector);

        const unavailableManual = [...manualExcludedSet]
            .filter(n => getSectorIndex(n) === sector).length;
        const unavailableAuto = safeCold
            .filter(n => getSectorIndex(n) === sector).length;

        const availableAfterExclusion =
            bounds.capacity - unavailableManual - unavailableAuto - 1;

        if (availableAfterExclusion >= quota) {
            safeCold.push(number);
        }
    }

    return safeCold;
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

    if (!pattern) {
        return {
            score: base,
            base,
            pair: { raw: 0, normalized: 0, numbers: [] },
            triple: { raw: 0, normalized: 0, numbers: [] },
            quad: { raw: 0, normalized: 0, numbers: [] },
            returnRate: 0,
            returnBoost: 0,
            parityBoost: 0
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
        parityBoost
    );

    return {
        score,
        base,
        pair,
        triple,
        quad,
        returnRate,
        returnBoost,
        parityBoost
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
    const weights = scored.map(item => {
        const normalized = clamp(item.score / maxScore, 0, 1);
        return 0.10 + Math.pow(normalized, 2.15) * 3.40;
    });
    const total = weights.reduce((a, b) => a + b, 0);

    let roll = Math.random() * total;
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
        return Math.floor(Math.random() * pool.length);
    }

    const rawScores = pool.map(number =>
        Math.max(0, Number(numberScores[number]) || 0)
    );
    const maxScore = Math.max(...rawScores, 0.0001);
    const weights = rawScores.map(score => 0.30 + (score / maxScore) * 1.70);
    const total = weights.reduce((a, b) => a + b, 0);

    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }

    return pool.length - 1;
}

function drawAutoForgeHotNumbers(
    plan,
    existingRequired = [],
    blockedRequired = [],
    excludedNumbers = []
) {
    if (!plan || plan.hotCount <= 0) return [];

    const hotSet = new Set(plan.hotPool);
    const alreadyHot = existingRequired.filter(number => hotSet.has(number)).length;
    let needed = Math.max(0, plan.hotCount - alreadyHot);
    if (!needed) return [];

    const blockedSet = new Set(blockedRequired);
    const excludedSet = new Set(excludedNumbers);
    const selectedSet = new Set(existingRequired);
    const sectorUsed = new Array(currentGame.ranges.length).fill(0);

    existingRequired.forEach(number => sectorUsed[getSectorIndex(number)]++);

    const available = plan.hotPool.filter(number =>
        !selectedSet.has(number) &&
        !blockedSet.has(number) &&
        !excludedSet.has(number)
    );

    const selected = [];

    while (needed > 0 && available.length) {
        const selectedContext = [...existingRequired, ...selected];
        let allowed = available.filter(number => {
            const sector = getSectorIndex(number);
            return sectorUsed[sector] < (plan.structure[sector] || 0);
        });

        if (!allowed.length) break;

        const parityAllowed = filterAutoForgePoolByParity(
            allowed,
            plan,
            selectedContext
        );
        if (parityAllowed.length) allowed = parityAllowed;

        const allowedIndex = getAutoForgeWeightedRandomIndex(
            allowed,
            plan,
            selectedContext
        );
        const number = allowed[allowedIndex];
        const originalIndex = available.indexOf(number);
        if (originalIndex >= 0) available.splice(originalIndex, 1);

        traceAutoForgeSelection(plan, number, "HOT", selectedContext);
        selected.push(number);
        sectorUsed[getSectorIndex(number)]++;
        needed--;
    }

    return selected;
}

function applyAutoForgeProfileToControls(analysis) {
    if (currentGame === games.multi) {
        currentGame.count = analysis.targetCount;
    }

    const structureFilter = document.getElementById("structureFilter");
    if (structureFilter) structureFilter.checked = true;

    analysis.structure.forEach((value, index) => {
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

function renderAutoForgeGenerationResult(analysis, plan, numbers) {
    const container = document.getElementById("autoForgeGenerationResult");
    if (!container || !Array.isArray(numbers)) return;

    const hotSet = new Set(plan.hotPool);
    const hotOnTicket = numbers.filter(number => hotSet.has(number));
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
            <td><span class="af-status af-status-${row.status.toLowerCase()}">${row.status}</span></td>
            <td>${row.returnRate === null ? "—" : `${Math.round(row.returnRate * 100)}%`}</td>
            <td>${row.relations.length ? row.relations.join(" • ") : "—"}</td>
            <td><strong>${row.score100}</strong></td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="auto-forge-generation-result">
            <div class="auto-forge-generation-head">
                <div>
                    <span>🎯 PROFIL ZASTOSOWANY</span>
                    <strong>Kupon osadzony w strefie ${analysis.focusZone}</strong>
                </div>
                <strong>${analysis.focusTargetCount}/${analysis.targetCount} liczb w strefie docelowej</strong>
            </div>

            <div class="auto-forge-generation-grid">
                <div><span>Struktura kuponu</span><strong>${structure}</strong></div>
                <div><span>Parzystość</span><strong>${even}/${odd}</strong></div>
                <div><span>HOT w kuponie</span><strong>${hotOnTicket.length}: ${hotOnTicket.join(", ") || "—"}</strong></div>
                <div><span>Powroty z ostatniego</span><strong>${returnsOnTicket.length}: ${returnsOnTicket.join(", ") || "—"}</strong></div>
                <div><span>COLD wyłączone</span><strong>${plan.lastColdPoolUsed.join(", ") || "—"}</strong></div>
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
                AUTO FORGE waży HOT/MID/COLD, powroty, pary, trójki, czwórki i parzystość. Losowość jest ostatnim krokiem,
                więc kupony mogą się różnić, ale pozostają wierne temu samemu profilowi danych.
            </p>
        </div>
    `;
}

function generateAutoForgeFromAnalysis(analysis) {
    const plan = buildAutoForgeGenerationPlan(analysis);
    applyAutoForgeProfileToControls(analysis);

    const numbers = generateMiniLotto(0, plan);
    if (!Array.isArray(numbers) || !numbers.length) return;

    renderAutoForgeGenerationResult(analysis, plan, numbers);
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
                <div><span>Dominująca strefa</span><strong>${analysis.dominantBand.key} • aktywność ×${analysis.dominantBand.intensity.toFixed(2)}</strong></div>
                <div><span>Sugerowana struktura</span><strong>${analysis.structure.join("-")}</strong></div>
                <div><span>Parzystość aktywnej strefy</span><strong>${analysis.suggestedEven}/${analysis.suggestedOdd} • ${Math.round(analysis.focusEvenShare * 100)}% parzystych</strong></div>
                <div><span>Skupisko</span><strong>próg ${analysis.thresholds.cluster}+ • mocne ${analysis.thresholds.strong}+</strong></div>
                <div><span>HOT — TOP trendu</span><strong>${analysis.hotPool.join(", ")}</strong></div>
                <div><span>COLD — dół trendu</span><strong>${analysis.coldPool.join(", ")}</strong></div>
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

            <div class="auto-forge-section auto-forge-pattern-section">
                <h4>🔁 Powroty + pary + trójki + czwórki</h4>
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
                    Procent przy relacji oznacza ważoną częstość współwystąpienia w aktualnych oknach analizy 5/10/15.
                    Powroty i relacje są wagami wyboru, nie sztywnymi wymogami kuponu.
                </small>
            </div>

            <div class="auto-forge-section">
                <h4>🧩 Ostatnie struktury — kontrola wzorca</h4>
                <div class="auto-forge-recent-list">${recentRows}</div>
            </div>

            <div class="auto-forge-next-step">
                <div>
                    <span>ETAP 4 — SILNIK WYBORU LICZB AKTYWNY</span>
                    <strong>Profil wybiera sektory, a scoring decyduje które liczby wewnątrz nich mają priorytet.</strong>
                    <small>Struktura → HOT/MID/COLD → powroty → pary/trójki/czwórki → parzystość → ważone RNG. Suma nie steruje AUTO FORGE.</small>
                </div>
                <button id="autoForgeGenerateFromProfileBtn" class="primary-btn auto-forge-generate-profile-btn">
                    🎯 GENERUJ Z TEGO PROFILU
                </button>
            </div>

            <div id="autoForgeGenerationResult"></div>

            <p class="auto-forge-note">
                Najpierw AUTO FORGE czyta planszę. Dopiero przyciskiem powyżej uruchamiasz generator z tą decyzją.
                Manualne liczby obowiązkowe i ręczne wykluczenia nadal są respektowane.
            </p>
        </div>
    `;

    const generateFromProfileBtn = document.getElementById("autoForgeGenerateFromProfileBtn");
    if (generateFromProfileBtn) {
        generateFromProfileBtn.addEventListener("click", () => {
            generateAutoForgeFromAnalysis(analysis);
        });
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

    if (wantedTotal !== currentGame.count) {
        alert(
            `❌ Błędna struktura!\n\n` +
            `Wybrana liczba kul: ${currentGame.count}\n` +
            `Struktura wymaga: ${wantedTotal}\n\n` +
            `Suma pól struktury musi wynosić dokładnie ${currentGame.count}.`
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

    if (wantedEven + wantedOdd !== currentGame.count) {

        alert(
            `❌ Błędne ustawienie parzystości!\n\n` +
            `Wybrana liczba kul: ${currentGame.count}\n` +
            `Parzyste + nieparzyste: ${wantedEven + wantedOdd}\n\n` +
            `Suma musi wynosić dokładnie ${currentGame.count}.`
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

    if (settings.count > currentGame.count) {
        alert(`❌ Kupon ma ${currentGame.count} liczb, a chcesz pobrać ${settings.count} obowiązkowych.`);
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
        const randomIndex = Math.floor(Math.random() * pool.length);
        selected.push(pool.splice(randomIndex, 1)[0]);
    }

    return selected;
}

function generateMiniLotto(attempt = 0, autoForgePlan = null) {

    const MAX_ATTEMPTS = 5000;

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

    if (currentGame === games.multi) {
        currentGame.count = Number(document.getElementById("multiCount").value);
    }

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

    const autoColdPool = autoForgePlan
        ? getSafeAutoForgeColdPool(
            autoForgePlan,
            excludeFilter ? manualExcludedNumbers : [],
            requiredSettings.enabled ? requiredSettings.pool : []
        )
        : [];

    const effectiveExcludedNumbers = [...new Set([
        ...(excludeFilter ? manualExcludedNumbers : []),
        ...autoColdPool
    ])];

    const autoHotNumbers = autoForgePlan
        ? drawAutoForgeHotNumbers(
            autoForgePlan,
            manualRequiredNumbers,
            blockedRequiredNumbers,
            effectiveExcludedNumbers
        )
        : [];

    const requiredNumbers = [...new Set([
        ...manualRequiredNumbers,
        ...autoHotNumbers
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

        while (numbers.length < currentGame.count && pool.length) {
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

        if (numbers.length !== currentGame.count) {
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

    const stats = document.getElementById("stats");
    const parzyste = numbers.filter(n => n % 2 === 0).length;
    const nieparzyste = currentGame.count - parzyste;
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

    if (autoForgePlan) {
        const hotSet = new Set(autoForgePlan.hotPool);
        autoForgePlan.lastSelectedHotNumbers = numbers.filter(number => hotSet.has(number));
        autoForgePlan.lastColdPoolUsed = autoColdPool;
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

        let n = Math.floor(Math.random()*max)+1;

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
    const odd = currentGame.count - even;

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
        <div class="statsBox stats-pattern-box">
            <h3>${icon} ${title} <small>${windowLabel}</small></h3>
            ${rows}
            ${stats.limited ? `
                <p class="stats-pattern-note">
                    Dłuższy zakres został skrócony dla tej statystyki, aby zachować nacisk na aktualne wzorce i płynność aplikacji.
                </p>
            ` : ''}
        </div>
    `;
}

function pokazStatystyki() {

    const statystyki = {};

    for (let i = 1; i <= currentGame.max; i++) {
        statystyki[i] = 0;
    }

    const analizowaneLosowania = getAnalysisDraws();
const struktury = {};

analizowaneLosowania.forEach(losowanie => {

    const struktura =
        getStructureForNumbers(losowanie.liczby);

    if (!struktury[struktura]) {
        struktury[struktura] = 0;
    }

    struktury[struktura]++;
});
const rankingStruktur =
    Object.entries(struktury)
        .map(([struktura, wystapienia]) => ({
            struktura,
            wystapienia
        }))
        .sort((a, b) => b.wystapienia - a.wystapienia);
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
    let html = `
<h2>📊 Statystyki ${currentGame.title}</h2>
<div style="margin: 15px 0 25px 0;">
    <label for="analysisWindowSelect">
        Zakres analizy:
    </label>

    <select id="analysisWindowSelect">
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
<div class="statsSummary">
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
<div class="statsBox">
    <h3>🧩 TOP STRUKTURY</h3>

    ${rankingStruktur.slice(0, 5).map(item => `
        <div>
            <span>${item.struktura}</span>
            <strong>${item.wystapienia}</strong>
        </div>
    `).join("")}
    
</div>
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

<section class="stats-return-panel">
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
</section>

</div>

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

html += "</table>";

contentArea.innerHTML = html;
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