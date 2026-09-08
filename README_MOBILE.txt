LOTTOFORGE MOBILE PWA — 08.09.2026
==================================

Ta paczka jest gotową mobilną wersją PWA opartą na aktualnym LottoForge.
Nie trzeba przerabiać kodu.

CO JEST W ŚRODKU
- cały obecny Generator + AUTO FORGE
- Statystyki
- Laboratorium wszystkich gier
- szybki transfer kuponów do Laboratorium
- mobilny interfejs z dolną nawigacją
- przełącznik gier u góry
- instalacja PWA na ekranie telefonu
- cache offline rdzenia aplikacji
- dane Laboratorium nadal zapisują się lokalnie w przeglądarce/PWA

NA TELEFONIE
PWA wymaga uruchomienia z HTTPS. Najprościej użyć Twojego GitHub Pages:
1. Wgraj zawartość tej paczki do repozytorium strony LottoForge (zastępując stare pliki strony).
2. Otwórz adres LottoForge w Chrome na Androidzie.
3. Użyj przycisku "Zainstaluj" w aplikacji albo menu Chrome → Zainstaluj aplikację / Dodaj do ekranu głównego.
4. LottoForge uruchamia się potem z własnej ikony jak aplikacja.

WAŻNE O DANYCH
- dane Laboratorium są lokalne dla danego urządzenia/originu;
- zainstalowana PWA na tym samym adresie GitHub Pages korzysta z tych samych danych strony;
- nie kasuj danych witryny, jeśli nie masz kopii JSON;
- synchronizację PC ↔ telefon możemy później dodać jako LottoForge Cloud Sync.

PLIKÓW CSV nie trzeba wysyłać do serwera: aplikacja czyta je lokalnie w przeglądarce tak jak dotychczas.
