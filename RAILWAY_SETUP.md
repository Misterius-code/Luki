# Railway Deployment Guide

## Konfiguracja zmiennych środowiskowych

Na Railway musisz ustawić następujące zmienne środowiskowe:

### Wymagane zmienne:

1. **MONGODB_URI** - Connection string do MongoDB
   - Jeśli używasz MongoDB Atlas: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`
   - Jeśli używasz Railway MongoDB: Sprawdź w sekcji "Variables" twojego serwisu MongoDB
   - Format: `mongodb://username:password@host:port` lub `mongodb+srv://...` dla Atlas

2. **DB_NAME** (opcjonalne) - Nazwa bazy danych
   - Domyślnie: `syn_prezesa`
   - Możesz zostawić puste, jeśli chcesz użyć domyślnej nazwy

3. **DEFAULT_ADMIN_PASSWORD** (opcjonalne) - Hasło dla domyślnego użytkownika admin
   - Domyślnie: `admin1234`
   - ⚠️ **WAŻNE**: Zmień to hasło po pierwszym logowaniu!

### Jak ustawić zmienne na Railway:

1. Przejdź do swojego projektu na Railway
2. Kliknij na swój serwis (service)
3. Przejdź do zakładki **"Variables"**
4. Dodaj zmienne:
   - `MONGODB_URI` = twój connection string do MongoDB
   - `DB_NAME` = `syn_prezesa` (lub zostaw puste)
   - `DEFAULT_ADMIN_PASSWORD` = wybierz bezpieczne hasło

## Sprawdzanie czy wszystko działa

### 1. Sprawdź logi na Railway

W sekcji "Deployments" → wybierz ostatni deployment → "View Logs"

Powinieneś zobaczyć:
```
✅ Connected to MongoDB database: syn_prezesa
✅ Database indexes created
✅ Created default admin user
   Username: admin
   Password: admin1234 (lub twoje hasło z DEFAULT_ADMIN_PASSWORD)
```

### 2. Sprawdź czy możesz się zalogować

1. Otwórz swoją aplikację na Railway
2. Spróbuj zalogować się:
   - **Username**: `admin`
   - **Password**: `admin1234` (lub hasło z `DEFAULT_ADMIN_PASSWORD`)

### 3. Jeśli logowanie nie działa

#### Problem: "Cannot connect to MongoDB"
- Sprawdź czy `MONGODB_URI` jest poprawnie ustawione
- Sprawdź czy MongoDB jest dostępne z internetu (nie tylko localhost)
- Dla MongoDB Atlas: sprawdź czy IP Railway jest na liście dozwolonych IP (lub użyj 0.0.0.0/0)

#### Problem: "Cannot login"
- Sprawdź logi Railway - czy widzisz "Created default admin user"?
- Jeśli nie, możesz ręcznie utworzyć użytkownika (patrz poniżej)

## Ręczne utworzenie użytkownika admin

Jeśli automatyczne tworzenie nie zadziałało, możesz użyć Railway CLI:

1. Zainstaluj Railway CLI: `npm i -g @railway/cli`
2. Zaloguj się: `railway login`
3. Połącz się z projektem: `railway link`
4. Uruchom skrypt:
   ```bash
   railway run node create-admin.js
   ```

Lub możesz użyć Railway Console (web terminal):
1. Przejdź do swojego serwisu na Railway
2. Kliknij "View Logs" → "Open Console"
3. Uruchom: `node create-admin.js`

## MongoDB Atlas - Konfiguracja

Jeśli używasz MongoDB Atlas:

1. **Network Access**:
   - Przejdź do "Network Access" w MongoDB Atlas
   - Dodaj IP: `0.0.0.0/0` (lub konkretne IP Railway jeśli znasz)
   - Lub użyj "Add Current IP Address" dla testów

2. **Database User**:
   - Utwórz użytkownika bazy danych w "Database Access"
   - Zapisz username i password
   - Użyj ich w `MONGODB_URI`: `mongodb+srv://username:password@cluster.mongodb.net/`

3. **Connection String**:
   - W "Database" → "Connect" → "Connect your application"
   - Skopiuj connection string
   - Zastąp `<password>` swoim hasłem
   - Ustaw jako `MONGODB_URI` na Railway

## Railway MongoDB Plugin

Alternatywnie możesz użyć Railway MongoDB:

1. W projekcie Railway kliknij "+ New" → "Database" → "Add MongoDB"
2. Railway automatycznie utworzy MongoDB i ustawi zmienną `MONGO_URL`
3. W twoim serwisie Node.js ustaw:
   - `MONGODB_URI` = wartość z `MONGO_URL` (Railway automatycznie ustawia to jako zmienną)
   - Lub użyj `MONGO_URL` bezpośrednio w kodzie (wymaga zmiany w server.js)

## Troubleshooting

### Sprawdź czy baza danych jest połączona:

W logach Railway powinieneś zobaczyć:
- `✅ Connected to MongoDB database: syn_prezesa`
- Jeśli widzisz błąd: sprawdź `MONGODB_URI`

### Sprawdź czy admin został utworzony:

W logach powinieneś zobaczyć:
- `✅ Created default admin user`
- Jeśli nie widzisz tego: sprawdź czy baza danych jest pusta (nie ma użytkowników)

### Test połączenia z bazą danych:

Możesz użyć Railway Console do testowania:
```bash
node -e "require('dotenv').config(); const {MongoClient} = require('mongodb'); (async () => { const client = new MongoClient(process.env.MONGODB_URI); await client.connect(); console.log('✅ Connected!'); const db = client.db(process.env.DB_NAME || 'syn_prezesa'); const users = await db.collection('users').find().toArray(); console.log('Users:', users); await client.close(); })();"
```

