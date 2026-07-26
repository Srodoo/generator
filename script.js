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

let currentGame = games.mini;
let losowania = [];
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
    csvFile.click();
});
statsBtn.addEventListener("click", () => {

    pokazStatystyki();

});
csvFile.addEventListener("change", (e) => {

    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

reader.onload = function(event) {

    const text = event.target.result;

    const lines = text.split("\n");

losowania = [];

for (let i = 1; i < lines.length; i++) {

    if (lines[i].trim() === "") continue;

    const cols = lines[i].split(",");

    losowania.push({
        data: cols[0],
        liczby: [
            Number(cols[1]),
            Number(cols[2]),
            Number(cols[3]),
            Number(cols[4]),
            Number(cols[5])
        ],
        struktura: cols[6],
        suma: Number(cols[7]),
        trafienia: cols[8],
        parzystosc: cols[9]
    });

}

console.log(losowania);
alert(`Zaimportowano ${losowania.length} losowań!`);
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

<input type="number" id="sumMin" value="0">

<br><br>

<label>Suma do</label>

<input type="number" id="sumMax" value="210">
<hr>

<h3>Parzyste / Nieparzyste</h3>

<label>
    <input type="checkbox" id="evenOddFilter">
    Aktywuj filtr
</label>

<br><br>

<label>Parzyste:</label>
<input type="number" id="evenCount" min="0" max="5" value="0">

<br><br>

<label>Nieparzyste:</label>
<input type="number" id="oddCount" min="0" max="5" value="0">
<hr>

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

}

function generateMiniLotto(){

    const numbersDiv = document.getElementById("numbers");
const sumFilter = document.getElementById("sumFilter").checked;

const sumMin = Number(document.getElementById("sumMin").value);

const sumMax = Number(document.getElementById("sumMax").value);
    let numbers = [];
    if (currentGame === games.multi) {
    currentGame.count = Number(document.getElementById("multiCount").value);
}
const excludeFilter = document.getElementById("excludeFilter").checked;

const excludedNumbers = document
    .getElementById("excludedNumbers")
    .value
    .split(",")
    .map(n => Number(n.trim()))
    .filter(n => !isNaN(n));
    while (numbers.length < currentGame.count) {

    let n = Math.floor(Math.random() * currentGame.max) + 1;

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

const suma = numbers.reduce((a, b) => a + b, 0);

if (
    (sumFilter && (suma < sumMin || suma > sumMax)) ||
    !isStructureValid(numbers) ||
    !isEvenOddValid(numbers)
) {
    generateMiniLotto();
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

    if (wanted[index] === 0) {
        return true;
    }

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

    losowania.forEach(losowanie => {
        losowanie.liczby.forEach(nr => {
            statystyki[nr]++;
        });
    });

    console.log(statystyki);
   const ranking = [];

for (let i = 1; i <= currentGame.max; i++) {
    ranking.push({
        liczba: i,
        trafienia: statystyki[i]
    });
}

ranking.sort((a, b) => b.trafienia - a.trafienia);
const hot = ranking.slice(0, 5);
const cold = [...ranking].reverse().slice(0, 5); 
    let html = `
<h2>📊 Statystyki ${currentGame.title}</h2>

<div class="statsSummary">

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

}