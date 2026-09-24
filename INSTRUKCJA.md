# LUKI — instrukcja obsługi (dla nie-programisty)

Aplikacja do zamówień i planu produkcji. Wszystkie dane siedzą w chmurze (MongoDB Atlas),
na komputerze jest tylko program, który je wyświetla.

---

## 1. Jak uruchomić

**Na pulpicie masz skrót o nazwie `Luki` — kliknij go dwa razy.**

Co się stanie:
1. Otworzy się czarne okno z napisem „NIE ZAMYKAJ TEGO OKNA".
2. Po ~5 sekundach sama otworzy się przeglądarka z aplikacją.

> ⚠️ **Czarne okno musi być cały czas otwarte.** To jest serwer aplikacji.
> Zamknięcie okna = zamknięcie aplikacji dla wszystkich.

Jeśli klikniesz skrót drugi raz, gdy aplikacja już działa — nic się nie zepsuje,
program po prostu otworzy przeglądarkę.

**Zatrzymanie aplikacji:** zamknij czarne okno albo kliknij w nim i naciśnij `Ctrl+C`.

---

## 2. Codzienna praca

- Linki w aplikacji: **Zamówienia** → `Plan Produkcji` → `Archiwum`
- `+ Nowe zamówienie` — dodawanie zamówienia
- `Panel Admin` — użytkownicy, role, uprawnienia

---

## 3. KOPIA ZAPASOWA — rób to raz w tygodniu

Na pulpicie jest skrót **`Luki - kopia zapasowa`**. Kliknij dwa razy.

Program zapisze wszystkie dane do folderu `Luki\backup\data_godzina`.
Program sam pilnuje, żeby kopii nie było za dużo (trzyma ostatnie 30).

**Bardzo ważne:** kopia leżąca tylko na tym samym komputerze nie ochroni Cię,
gdy padnie dysk. Dlatego raz w miesiącu skopiuj folder `Luki\backup` na pendrive
albo do chmury (OneDrive / Dysk Google / Google Drive).

### Odtworzenie danych z kopii (gdy coś zniknie)

W czarnym oknie / w terminalu, w folderze `Luki`:

```
node restore.js backup/2026-09-23_18-48
```

(podmień nazwę folderu na właściwą). Program zapyta o potwierdzenie — wpisz `TAK`.
**Uwaga:** obecne dane w tych kolekcjach zostaną zastąpione danymi z kopii.

---

## 4. Logowanie i hasła

- Pierwsze konto: użytkownik `admin`.
- **Zmień hasło po pierwszym zalogowaniu** i nie używaj domyślnego `admin1234`.
- Zmiana hasła: `Panel Admin` → użytkownik → `Resetuj hasło` (min. 8 znaków).

---

## 5. Dostęp z telefonu / innego komputera w firmie

Aplikacja działa też w sieci lokalnej. Aby wejść z telefonu:

1. Na komputerze z aplikacją otwórz czarne okno i sprawdź adres IP:
   wpisz `ipconfig` i znajdź `Adres IPv4`, np. `192.168.0.15`.
2. W telefonie (musi być w tej samej sieci Wi-Fi) wejdź na: `http://192.168.0.15:3000`
3. Windows może zapytać o dostęp sieciowy dla Node.js — **zezwól, ale tylko dla sieci prywatnej**.

> Nie otwieraj tego na zewnątrz internetu (nie przekierowuj portu na routerze) —
> aplikacja nie ma szyfrowania HTTPS.

---

## 6. Gdy coś nie działa — szybka checklista

| Objaw | Co zrobić |
|---|---|
| „Otworzyła się przeglądarka, ale błąd" | Serwer jeszcze nie wstał — odczekaj 5 s i odśwież (`F5`) |
| Aplikacja nie loguje, „błąd połączenia" | Sprawdź internet — baza jest w chmurze |
| Program nie startuje, okno znika | Kliknij skrót ponownie; jeśli dalej nie działa, sprawdź czy nie brakuje Node.js (https://nodejs.org) |
| Zamknąłem czarne okno | Uruchom skrót `Luki` od nowa |
| Dane się nie zapisują | Sprawdź internet i czy Twoje IP jest dopuszczone w MongoDB Atlas → Network Access |
| Zmieniłem hasło w Atlas i przestało działać | Trzeba poprawić plik `.env` (patrz niżej) |

---

## 7. Czego NIE ruszać

- **Plik `.env`** (w folderze `Luki`) — tu są hasła i adres bazy. Nie usuwaj go,
  nie pokazuj nikomu, nie wysyłaj mailem. Jest już wykluczony z Gita.
- **Folder `node_modules`** — nie usuwaj i nie przenoś.
- **Folder `backup`** — to Twoje kopie zapasowe.

## 8. Ważne pliki

| Plik / folder | Do czego służy |
|---|---|
| `START-LUKI.bat` | uruchamia aplikację |
| `BACKUP-LUKI.bat` | robi kopię zapasową |
| `IMPORT-CSV.bat` | wgrywa zamówienia z pliku CSV |
| `.env` | hasła i adres bazy (tajne!) |
| `backup\` | kopie zapasowe danych |
| `server.js` | główny program (nie ruszaj) |
| `LOCAL_SETUP.md`, `ATLAS_SETUP.md` | dokumentacja techniczna |

---

## 9. Import zamówień z arkusza Google (CSV)

Gdy chcesz wgrać wiele zamówień naraz:

1. W Arkuszach Google: **Plik → Pobierz → CSV**.
2. Wrzuć pobrany plik `.csv` do folderu `Luki`.
3. Kliknij dwa razy **`IMPORT-CSV.bat`**.

Program sam:
- poprawi typowe błędy eksportu arkusza (brakująca nazwa kolumny „Drukarnia", dziwna nazwa pierwszej kolumny, wiersz „Template"),
- dopisze zamówienia do bazy,
- **pominie te, które już w bazie są** — możesz uruchamiać go wielokrotnie, duplikaty nie powstaną.

Trzy rzeczy, o których warto wiedzieć:

- Kolumny `Zimny nóż` i `Taśma klejąca` aplikacja pokazuje razem jako jedną kolumnę **„Parametry dodatkowe"**.
- **`Zrywka` ma własną kolumnę** — w formularzu „nowe zamówienie" to osobna sekcja, w której wybiera się jedną z trzech opcji: `Opaski` / `Klipsy` / `Druty`.
- Tabela zamówień ma 34 kolumny. Kliknij ikonę **koła zębatego** („Ustawienia kolumn"), żeby ukryć te, których nie używasz — wtedy tabela będzie czytelna. Szerokość kolumn zmieniasz przeciągając ich krawędzie.

Przed importem warto kliknąć skrót `Luki - kopia zapasowa`.
