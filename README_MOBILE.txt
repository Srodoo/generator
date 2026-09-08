LottoForge Mobile PWA — INTERACTION FIX v3 (2026-09-08)

CO POPRAWIONE:
- usunięty krytyczny punkt startowy: brak dostępu do localStorage nie zatrzymuje już app-mobile.js,
- mobilne przyciski wywołują logikę LottoForge bezpośrednio przez bridge,
- fallback do starych przycisków desktopowych został zachowany,
- obsługa pointerup + click dla Android / Opera / Chrome,
- wymuszone pointer-events i touch-action dla mobilnej nawigacji,
- uproszczone warstwy fixed/sticky pod stabilne hit-testy,
- cache-busting CSS/JS oraz service worker v3,
- desktop pozostaje bez zmian stylistycznych (mobile.css działa tylko <= 900 px).

WDROŻENIE NA GITHUB PAGES:
1. W katalogu /generator/ PODMIEŃ wszystkie pliki z tej paczki.
2. Zachowaj dokładne nazwy: index.html, style.css, mobile.css, script.js, app-mobile.js, sw.js itd.
3. Po wdrożeniu na telefonie otwórz jednorazowo:
   https://srodoo.github.io/generator/?v=20260908-interaction-v3
   Ten parametr omija stary wpis strony w cache poprzedniego service workera.
4. Potem normalny adres /generator/ powinien już korzystać z nowej wersji.

SZYBKI TEST:
- klik Mini/Lotto/EuroJackpot/Multi Multi/Pensja,
- klik Generator/Statystyki/Lab,
- Import powinien otworzyć wybór pliku,
- desktop powinien zachować dotychczasowy układ.
