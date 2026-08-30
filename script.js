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

            const gameDraws = getCurrentGameDraws();

gameDraws.length = 0;

            // pomijamy nagłówek CSV
            for (let i = 1; i < lines.length; i++) {

                const cols = lines[i]
                    .split(";")
                    .map(col => col.trim());

                if (currentGame === games.extra) {

                    const dzien = Number(cols[1]);
                    const miesiac = Number(cols[2]);
                    const rok = Number(cols[3]);

                    const liczby = [
                        Number(cols[4]),
                        Number(cols[5]),
                        Number(cols[6]),
                        Number(cols[7]),
                        Number(cols[8])
                    ];

                    const extraNumber = Number(cols[10]);

                    gameDraws.push({
                        numer: Number(cols[0]),
                        data:
                            `${String(dzien).padStart(2, "0")}.` +
                            `${String(miesiac).padStart(2, "0")}.` +
                            `${rok}`,
                        liczby: liczby,
                        extraNumber: extraNumber
                    });
                }
            
            if (currentGame === games.mini) {

    const dzien = Number(cols[1]);
    const miesiac = Number(cols[2]);
    const rok = Number(cols[3]);

    const liczby = [
        Number(cols[4]),
        Number(cols[5]),
        Number(cols[6]),
        Number(cols[7]),
        Number(cols[8])
    ];

    gameDraws.push({
        numer: Number(cols[0]),
        data:
            `${String(dzien).padStart(2, "0")}.` +
            `${String(miesiac).padStart(2, "0")}.` +
            `${rok}`,
        liczby: liczby
    });
}

if (currentGame === games.multi) {

    const dzien = Number(cols[1]);
    const miesiac = Number(cols[2]);
    const rok = Number(cols[3]);

    const liczby = cols
        .slice(4, 24)
        .map(Number);

    gameDraws.push({
        numer: Number(cols[0]),
        data:
            `${String(dzien).padStart(2, "0")}.` +
            `${String(miesiac).padStart(2, "0")}.` +
            `${rok}`,
        liczby: liczby
    });
}
}

            console.log("Zaimportowane losowania:", gameDraws);

alert(
    `✅ Zaimportowano ${gameDraws.length} losowań dla ${currentGame.title}!`
);

        } catch (error) {

            console.error("Błąd importu:", error);

            alert(
                `❌ Błąd podczas importowania pliku:\n\n${error.message}`
            );
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

<button id="generateBtn" class="primary-btn">
    Generuj liczby
</button>

    <<div id="numbers" class="ball-container"></div>

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

    generateBtn.addEventListener("click", generateMiniLotto);
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
}function generateNumbersByStructure(excludedNumbers = [], excludeFilter = false) {

    const result = [];

    for (let i = 0; i < currentGame.ranges.length; i++) {

        const start =
            i === 0
                ? 1
                : currentGame.ranges[i - 1] + 1;

        const end = currentGame.ranges[i];

        const wanted =
            Number(document.getElementById(`r${i + 1}`).value);

        const pool = [];

        for (let n = start; n <= end; n++) {
            if (
                !excludeFilter ||
                !excludedNumbers.includes(n)
            ) {
                pool.push(n);
            }
        }

        if (wanted > pool.length) {
            alert(
                `❌ Za mało dostępnych liczb w zakresie ${start}-${end}.\n\n` +
                `Struktura wymaga: ${wanted}\n` +
                `Dostępnych po wykluczeniach: ${pool.length}`
            );

            return null;
        }

        for (let j = 0; j < wanted; j++) {

            const randomIndex =
                Math.floor(Math.random() * pool.length);

            const selected =
                pool.splice(randomIndex, 1)[0];

            result.push(selected);
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

const excludedNumbers = document
    .getElementById("excludedNumbers")
    .value
    .split(",")
    .map(n => Number(n.trim()))
    .filter(n => !isNaN(n));
    const structureFilter =
    document.getElementById("structureFilter").checked;

if (structureFilter) {

    numbers = generateNumbersByStructure(
        excludedNumbers,
        excludeFilter
    );

    if (numbers === null) {
        return;
    }

} else {

    while (numbers.length < currentGame.count) {

        let n =
            Math.floor(Math.random() * currentGame.max) + 1;

        if (
            !numbers.includes(n) &&
            (
                !excludeFilter ||
                !excludedNumbers.includes(n)
            )
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

    euroNumbers = generateNumbers(
        currentGame.euroCount,
        currentGame.euroMax
    );

}

if (currentGame === games.extra) {

    extraNumber = generateNumbers(
        currentGame.extraCount,
        currentGame.extraMax
    );

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
const hot = ranking.slice(0, 5);
const cold = [...ranking].reverse().slice(0, 5); 
    let html = `
<h2>📊 Statystyki ${currentGame.title}</h2>
<div style="margin: 15px 0 25px 0;">
    <label for="analysisWindowSelect">
        Zakres analizy:
    </label>

    <select id="analysisWindowSelect">
        <option value="10">10 losowań</option>
        <option value="20">20 losowań</option>
        <option value="30">30 losowań</option>
        <option value="50">50 losowań</option>
        <option value="100">100 losowań</option>
    </select>
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

</div>

<div class="statsBox">
<h3>❄️ TOP COLD</h3>

${cold.map(x => `
<div>
    <span class="cold">${x.liczba}</span>
    <strong>${x.trafienia}</strong>
</div>
`).join("")}

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

}