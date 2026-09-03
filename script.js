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
            gameDraws.length = 0;
            gameDraws.push(...parsedDraws);

            console.log("Zaimportowane losowania:", gameDraws);

            alert(
                `✅ Zaimportowano ${gameDraws.length} losowań dla ${currentGame.title}!` +
                (ignoredRows > 0 ? `\nPominięto wierszy: ${ignoredRows}` : "")
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
    🧠 AUTO FORGE
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

function analyzeAutoForgeWindow(draws, windowSize) {
    const sample = draws.slice(-Math.min(windowSize, draws.length));
    const numberHits = new Array(currentGame.max + 1).fill(0);
    const sectorHits = new Array(currentGame.ranges.length).fill(0);

    let totalNumbers = 0;
    let evenNumbers = 0;
    const drawMeans = [];

    sample.forEach(draw => {
        const validNumbers = (draw.liczby || []).filter(
            n => Number.isInteger(n) && n >= 1 && n <= currentGame.max
        );

        if (!validNumbers.length) return;

        validNumbers.forEach(number => {
            numberHits[number]++;
            sectorHits[getSectorIndex(number)]++;
            totalNumbers++;
            if (number % 2 === 0) evenNumbers++;
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

    return {
        windowSize: sample.length,
        frequencies,
        sectorShares,
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

function buildSecondaryRanking(draws, requestedWindows, weights, max, extractor) {
    const scores = new Array(max + 1).fill(0);
    let totalWeight = 0;

    requestedWindows.forEach((windowSize, index) => {
        const sample = draws.slice(-Math.min(windowSize, draws.length));
        if (!sample.length) return;

        const counts = new Array(max + 1).fill(0);
        sample.forEach(draw => {
            extractor(draw)
                .filter(n => Number.isInteger(n) && n >= 1 && n <= max)
                .forEach(n => counts[n]++);
        });

        const weight = weights[index];
        totalWeight += weight;
        for (let n = 1; n <= max; n++) {
            scores[n] += (counts[n] / sample.length) * weight;
        }
    });

    if (!totalWeight) return [];

    return scores
        .map((score, number) => ({ number, score: score / totalWeight }))
        .filter(item => item.number > 0)
        .sort((a, b) => b.score - a.score || a.number - b.number);
}

function drawFromPool(pool, count, excluded = []) {
    const available = pool.filter(n => !excluded.includes(n));
    const selected = [];

    while (selected.length < count && available.length) {
        const index = Math.floor(Math.random() * available.length);
        selected.push(available.splice(index, 1)[0]);
    }

    return selected.sort((a, b) => a - b);
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

    const windowAnalyses = requestedWindows.map(
        size => analyzeAutoForgeWindow(draws, size)
    );

    // Jeżeli mamy mniej niż 15 losowań, nadal działamy, ale liczymy tylko
    // na realnie dostępnych danych.
    const frequencyScore = new Array(currentGame.max + 1).fill(0);
    const sectorShares = new Array(currentGame.ranges.length).fill(0);
    let evenShare = 0;
    let meanNumber = 0;
    let meanSpread = 0;
    let totalWeight = 0;

    windowAnalyses.forEach((analysis, idx) => {
        if (!analysis.windowSize) return;

        const weight = weights[idx];
        totalWeight += weight;

        for (let n = 1; n <= currentGame.max; n++) {
            frequencyScore[n] += analysis.frequencies[n] * weight;
        }

        analysis.sectorShares.forEach((share, sectorIndex) => {
            sectorShares[sectorIndex] += share * weight;
        });

        evenShare += analysis.evenShare * weight;
        meanNumber += analysis.meanNumber * weight;
        meanSpread += analysis.meanSpread * weight;
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
    for (let i = 0; i < sectorShares.length; i++) {
        sectorShares[i] /= totalWeight;
    }
    evenShare /= totalWeight;
    meanNumber /= totalWeight;
    meanSpread /= totalWeight;

    // Migracja: porównujemy starszą i nowszą połowę maks. 15 ostatnich losowań.
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

    // Mały bonus kierunkowy. Migracja nie dominuje rankingu HOT,
    // tylko delikatnie rozstrzyga podobne wyniki.
    const migrationStrength = clamp(Math.abs(migrationDelta) / Math.max(1, currentGame.max * 0.08), 0, 1);
    const direction = migrationDelta > 0.75 ? 1 : migrationDelta < -0.75 ? -1 : 0;

    const rankedNumbers = [];
    for (let n = 1; n <= currentGame.max; n++) {
        const position = ((n - 1) / Math.max(1, currentGame.max - 1)) * 2 - 1;
        const migrationBonus = direction * position * migrationStrength * 0.08;

        rankedNumbers.push({
            number: n,
            score: frequencyScore[n] + migrationBonus
        });
    }

    rankedNumbers.sort((a, b) => b.score - a.score || a.number - b.number);

    const hotPoolSize = currentGame === games.multi
        ? Math.min(10, currentGame.max)
        : Math.min(5, currentGame.max);

    const coldPoolSize = currentGame === games.multi
        ? Math.min(10, currentGame.max)
        : Math.min(5, currentGame.max);

    const hotPool = rankedNumbers.slice(0, hotPoolSize).map(x => x.number);
    const hotSet = new Set(hotPool);

    const coldPool = [...rankedNumbers]
        .reverse()
        .map(x => x.number)
        .filter(n => !hotSet.has(n))
        .slice(0, coldPoolSize);

    // Dla Multi: 9 liczb => 5 z TOP10 HOT, 8 => 4, 10 => 5.
    // Dla mniejszych gier nie robimy z HOT połowy całego kuponu na siłę.
    const requiredCount = currentGame === games.multi
        ? Math.min(hotPool.length, Math.ceil(targetCount / 2))
        : Math.min(hotPool.length, Math.max(1, Math.round(targetCount * 0.4)));

    const structure = apportionCounts(sectorShares, targetCount);

    let wantedEven = clamp(Math.round(evenShare * targetCount), 0, targetCount);
    let wantedOdd = targetCount - wantedEven;

    const targetSum = Math.round(meanNumber * targetCount);
    const possibleMin = getMinPossibleSum(targetCount);
    const possibleMax = getMaxPossibleSum(targetCount, currentGame.max);

    // Zakres celowo jest umiarkowany — Auto Forge ma kierować,
    // a nie zablokować generator zbyt wąskim pasmem.
    const baseTolerance = currentGame === games.multi
        ? Math.max(12, Math.round(targetCount * 2.5))
        : Math.max(7, Math.round(targetCount * 2));

    const dynamicTolerance = Math.round(meanSpread * targetCount * 0.45);
    const tolerance = Math.max(baseTolerance, dynamicTolerance);

    const sumMin = clamp(targetSum - tolerance, possibleMin, possibleMax);
    const sumMax = clamp(targetSum + tolerance, possibleMin, possibleMax);

    // Confidence = spójność 5/10/15, nie "szansa wygranej".
    const evenValues = windowAnalyses.filter(x => x.windowSize).map(x => x.evenShare);
    const meanValues = windowAnalyses.filter(x => x.windowSize).map(x => x.meanNumber);

    let sectorDispersion = 0;
    for (let sector = 0; sector < currentGame.ranges.length; sector++) {
        const vals = windowAnalyses
            .filter(x => x.windowSize)
            .map(x => x.sectorShares[sector]);
        sectorDispersion += standardDeviation(vals);
    }
    sectorDispersion /= Math.max(1, currentGame.ranges.length);

    const evenDispersion = standardDeviation(evenValues);
    const meanDispersion = standardDeviation(meanValues) / Math.max(1, currentGame.max);

    const confidence = Math.round(clamp(
        100
        - sectorDispersion * 180
        - evenDispersion * 120
        - meanDispersion * 120,
        35,
        95
    ));

    const migrationText = direction > 0
        ? `↑ W GÓRĘ (+${migrationDelta.toFixed(1)})`
        : direction < 0
            ? `↓ W DÓŁ (${migrationDelta.toFixed(1)})`
            : `→ STABILNIE (${migrationDelta >= 0 ? "+" : ""}${migrationDelta.toFixed(1)})`;

    let secondary = null;

    if (currentGame === games.euro) {
        const ranking = buildSecondaryRanking(
            draws, requestedWindows, weights, currentGame.euroMax,
            draw => draw.euroNumbers || []
        );
        const pool = ranking.slice(0, Math.min(5, ranking.length)).map(item => item.number);
        secondary = { type: "euro", pool, count: currentGame.euroCount };
    }

    if (currentGame === games.extra) {
        const ranking = buildSecondaryRanking(
            draws, requestedWindows, weights, currentGame.extraMax,
            draw => Number.isInteger(draw.extraNumber) ? [draw.extraNumber] : []
        );
        const pool = ranking.slice(0, Math.min(2, ranking.length)).map(item => item.number);
        secondary = { type: "extra", pool, count: currentGame.extraCount };
    }

    return {
        ok: true,
        targetCount,
        modeLabel: windowConfig.label,
        windowsUsed: windowAnalyses.map(x => x.windowSize).join(" / "),
        structure,
        wantedEven,
        wantedOdd,
        sumMin,
        sumMax,
        targetSum,
        hotPool,
        coldPool,
        requiredCount,
        migrationText,
        confidence,
        sectorShares,
        secondary
    };
}

function applyAutoForgeSettings(analysis) {
    // Multi Multi najpierw ustala wielkość kuponu.
    if (currentGame === games.multi) {
        currentGame.count = analysis.targetCount;
    }

    const structureFilter = document.getElementById("structureFilter");
    structureFilter.checked = true;

    analysis.structure.forEach((value, index) => {
        const input = document.getElementById(`r${index + 1}`);
        if (input) input.value = value;
    });

    document.getElementById("evenOddFilter").checked = true;
    document.getElementById("evenCount").value = analysis.wantedEven;
    document.getElementById("oddCount").value = analysis.wantedOdd;

    document.getElementById("sumFilter").checked = true;
    document.getElementById("sumMin").value = analysis.sumMin;
    document.getElementById("sumMax").value = analysis.sumMax;

    document.getElementById("requiredFilter").checked = true;
    document.getElementById("requiredNumbers").value = analysis.hotPool.join(",");
    document.getElementById("requiredCount").value = analysis.requiredCount;

    document.getElementById("excludeFilter").checked = true;
    document.getElementById("excludedNumbers").value = analysis.coldPool.join(",");
}

function renderAutoForgeReport(analysis) {
    const report = document.getElementById("autoForgeReport");
    if (!report) return;

    const confidenceClass =
        analysis.confidence >= 75 ? "high" :
        analysis.confidence >= 55 ? "medium" : "low";

    report.innerHTML = `
        <div class="auto-forge-card">
            <div class="auto-forge-title">
                <strong>🧠 AUTO FORGE — konfiguracja wybrana</strong>
                <span class="confidence ${confidenceClass}">
                    Spójność ${analysis.confidence}/100
                </span>
            </div>

            <div class="auto-forge-grid">
                <div><span>Tryb analizy</span><strong>${analysis.modeLabel} (${analysis.windowsUsed})</strong></div>
                <div><span>Struktura</span><strong>${analysis.structure.join("-")}</strong></div>
                <div><span>Parzystość</span><strong>${analysis.wantedEven}/${analysis.wantedOdd}</strong></div>
                <div><span>Suma</span><strong>${analysis.sumMin}-${analysis.sumMax} (cel ${analysis.targetSum})</strong></div>
                <div><span>Migracja</span><strong>${analysis.migrationText}</strong></div>
                <div><span>HOT</span><strong>${analysis.hotPool.join(", ")}</strong></div>
                <div><span>HOT → losuj</span><strong>${analysis.requiredCount} z ${analysis.hotPool.length}</strong></div>
                <div><span>COLD → wyklucz</span><strong>${analysis.coldPool.join(", ")}</strong></div>
                ${analysis.secondary ? `
                <div><span>${analysis.secondary.type === "euro" ? "⭐ Euro — pula" : "⭐ Extra — pula"}</span><strong>${analysis.secondary.pool.length ? analysis.secondary.pool.join(", ") : "brak danych dodatkowych"}</strong></div>
                ` : ""}
            </div>

            <p class="auto-forge-note">
                Spójność opisuje stabilność danych użytych przez AUTO FORGE; w trybie 5/10/15 uwzględnia zgodność kilku okien.
            </p>
        </div>
    `;
}

function runAutoForge() {
    const analysis = buildAutoForgeAnalysis();

    if (!analysis.ok) {
        alert(`❌ AUTO FORGE\n\n${analysis.message}`);
        return;
    }

    applyAutoForgeSettings(analysis);
    renderAutoForgeReport(analysis);

    autoForgeSecondaryOverride = null;

    if (analysis.secondary?.pool?.length) {
        if (analysis.secondary.type === "euro") {
            const excluded = document.getElementById("euroExcludeFilter")?.checked
                ? (document.getElementById("euroExcludedNumbers")?.value || "")
                    .split(",")
                    .map(n => Number(n.trim()))
                    .filter(Number.isInteger)
                : [];

            const selected = drawFromPool(
                analysis.secondary.pool,
                analysis.secondary.count,
                excluded
            );

            if (selected.length === analysis.secondary.count) {
                autoForgeSecondaryOverride = { type: "euro", numbers: selected };
            }
        }

        if (analysis.secondary.type === "extra") {
            const selected = drawFromPool(analysis.secondary.pool, 1);
            if (selected.length) {
                autoForgeSecondaryOverride = { type: "extra", numbers: selected };
            }
        }
    }

    // Po ustawieniu parametrów używamy istniejącego generatora i walidacji.
    generateMiniLotto();
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
    blockedRequiredNumbers = []
) {
    const result = [...requiredNumbers];

    for (let i = 0; i < currentGame.ranges.length; i++) {
        const start = i === 0 ? 1 : currentGame.ranges[i - 1] + 1;
        const end = currentGame.ranges[i];
        const wanted = Number(document.getElementById(`r${i + 1}`).value);

        const requiredInRange = requiredNumbers.filter(
            n => n >= start && n <= end
        ).length;
        const needed = wanted - requiredInRange;

        if (needed < 0) {
            return null;
        }

        const pool = [];
        for (let n = start; n <= end; n++) {
            if (
                !requiredNumbers.includes(n) &&
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
            const randomIndex = Math.floor(Math.random() * pool.length);
            result.push(pool.splice(randomIndex, 1)[0]);
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

function generateMiniLotto(attempt = 0){

    const MAX_ATTEMPTS = 5000;

    if (attempt >= MAX_ATTEMPTS) {
        alert("❌ Nie udało się wygenerować zestawu. Sprawdź filtry — mogą być niemożliwe albo zbyt restrykcyjne.");
        return;
    }

    const numbersDiv = document.getElementById("numbers");
const sumFilter = document.getElementById("sumFilter").checked;

const sumMin = Number(document.getElementById("sumMin").value);

const sumMax = Number(document.getElementById("sumMax").value);
    let numbers = [];
    if (currentGame === games.multi) {
    currentGame.count = Number(document.getElementById("multiCount").value);
}
if (!validateStructureSettings()) {
    return;
}
if (!validateEvenOddSettings()) {
    return;
}
if (!validateSumSettings()) {
    return;
}
const excludeFilter = document.getElementById("excludeFilter").checked;

const excludedNumbers = [...new Set(
    document.getElementById("excludedNumbers").value
        .split(",")
        .map(n => Number(n.trim()))
        .filter(n => Number.isInteger(n) && n >= 1 && n <= currentGame.max)
)];

if (!validateRequiredSettings(excludedNumbers, excludeFilter)) {
    return;
}

const requiredNumbers = drawRequiredNumbers(excludedNumbers, excludeFilter);
const requiredSettings = getRequiredSettings();
const blockedRequiredNumbers = requiredSettings.enabled
    ? requiredSettings.pool.filter(n => !requiredNumbers.includes(n))
    : [];
const structureFilter = document.getElementById("structureFilter").checked;

if (structureFilter) {
    numbers = generateNumbersByStructure(
        excludedNumbers,
        excludeFilter,
        requiredNumbers,
        blockedRequiredNumbers
    );

    if (numbers === null) {
        generateMiniLotto(attempt + 1);
        return;
    }
} else {
    numbers = [...requiredNumbers];

    while (numbers.length < currentGame.count) {
        let n = Math.floor(Math.random() * currentGame.max) + 1;

        if (
            !numbers.includes(n) &&
            !blockedRequiredNumbers.includes(n) &&
            (!excludeFilter || !excludedNumbers.includes(n))
        ) {
            numbers.push(n);
        }
    }
}

const suma = numbers.reduce((a, b) => a + b, 0);

if (
    (sumFilter && (suma < sumMin || suma > sumMax)) ||
    !isEvenOddValid(numbers)
) {
    generateMiniLotto(attempt + 1);
    return;
}


    numbers.sort((a,b)=>a-b);
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

} numbers.forEach(number=>{

        numbersDiv.innerHTML += `

            <div class="ball">

                ${String(number).padStart(2,"0")}

            </div>

        `;
        

    const stats = document.getElementById("stats");

const suma = numbers.reduce((a,b)=>a+b,0);

const parzyste = numbers.filter(n => n % 2 === 0).length;

const nieparzyste = currentGame.count - parzyste;
let ranges = new Array(currentGame.ranges.length).fill(0);

numbers.forEach(n => {

    for(let i = 0; i < currentGame.ranges.length; i++){

        if(n <= currentGame.ranges[i]){
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

${currentGame.ranges.map((value,index)=>{

    const start = index===0
        ? 1
        : currentGame.ranges[index-1]+1;

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

`;});

    autoForgeSecondaryOverride = null;

}function generateNumbers(count, max){
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