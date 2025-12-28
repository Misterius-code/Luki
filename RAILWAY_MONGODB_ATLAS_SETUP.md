# MongoDB Atlas Setup dla Railway

## Problem z Railway MongoDB

Railway MongoDB ma ograniczenie miejsca na dysku (minimum 500MB), co może powodować błąd:
```
available disk space of 233979904 bytes is less than required minimum of 524288000
```

**Rozwiązanie**: Użyj MongoDB Atlas (darmowe konto ma 512MB, co wystarczy dla małych projektów).

## Krok po kroku: MongoDB Atlas

### 1. Utwórz konto MongoDB Atlas

1. Przejdź na https://www.mongodb.com/cloud/atlas/register
2. Zarejestruj się (darmowe konto)
3. Wybierz plan **M0 (Free)** - 512MB storage

### 2. Utwórz Cluster

1. Po zalogowaniu kliknij **"Build a Database"**
2. Wybierz **M0 FREE** (Shared)
3. Wybierz region (najbliższy do Railway)
4. Kliknij **"Create"**
5. Poczekaj 3-5 minut na utworzenie cluster

### 3. Skonfiguruj Network Access

1. W lewym menu kliknij **"Network Access"**
2. Kliknij **"Add IP Address"**
3. Wybierz **"Allow Access from Anywhere"** (0.0.0.0/0)
   - Lub dodaj konkretne IP Railway jeśli znasz
4. Kliknij **"Confirm"**

### 4. Utwórz Database User

1. W lewym menu kliknij **"Database Access"**
2. Kliknij **"Add New Database User"**
3. Wybierz **"Password"** jako Authentication Method
4. Wpisz:
   - **Username**: np. `synprezesa` lub `admin`
   - **Password**: wygeneruj bezpieczne hasło (zapisz je!)
5. W "Database User Privileges" wybierz **"Atlas admin"** lub **"Read and write to any database"**
6. Kliknij **"Add User"**

### 5. Pobierz Connection String

1. W lewym menu kliknij **"Database"**
2. Kliknij **"Connect"** przy swoim cluster
3. Wybierz **"Connect your application"**
4. Wybierz **"Node.js"** i wersję **"5.5 or later"**
5. Skopiuj connection string - wygląda tak:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Zastąp `<username>` i `<password>` danymi z kroku 4
   - Przykład: `mongodb+srv://synprezesa:MojeHaslo123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

### 6. Ustaw na Railway

1. Przejdź do swojego projektu na Railway
2. Kliknij na swój serwis Node.js
3. Przejdź do **"Variables"**
4. Dodaj/edytuj zmienne:
   - **MONGODB_URI** = twój connection string z Atlas (z username i password)
   - **DB_NAME** = `syn_prezesa`
   - **DEFAULT_ADMIN_PASSWORD** = hasło dla użytkownika admin w aplikacji (np. `admin1234`)

### 7. Usuń Railway MongoDB (opcjonalnie)

Jeśli nie używasz Railway MongoDB, możesz go usunąć:
1. W projekcie Railway znajdź serwis MongoDB
2. Kliknij na niego → Settings → Delete

## Przykładowa konfiguracja zmiennych na Railway

```
MONGODB_URI=mongodb+srv://synprezesa:MojeHaslo123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DB_NAME=syn_prezesa
DEFAULT_ADMIN_PASSWORD=admin1234
PORT=3000
```

## Sprawdzenie

Po wdrożeniu sprawdź logi Railway - powinieneś zobaczyć:
```
✅ Connected to MongoDB database: syn_prezesa
✅ Database indexes created
✅ Created default admin user
   Username: admin
   Password: admin1234
```

## Alternatywa: Użyj MONGO_URL z Railway

Jeśli chcesz zostać przy Railway MongoDB (ale masz problem z miejscem), możesz:

1. **Usuń zmienną MONGODB_URI** z Railway
2. Railway automatycznie ustawia **MONGO_URL** - kod już to obsługuje
3. Upewnij się, że używasz **RAILWAY_PRIVATE_DOMAIN** w connection string

Ale **zalecam MongoDB Atlas** - jest bardziej niezawodne i ma więcej miejsca.

