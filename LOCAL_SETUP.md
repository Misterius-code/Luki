# Local Development Setup

## Quick Start: Running Locally with MongoDB

### Step 1: Install MongoDB

**Windows:**
1. Download MongoDB Community Server from [MongoDB Downloads](https://www.mongodb.com/try/download/community)
2. Run the installer and follow the setup wizard
3. MongoDB will be installed as a Windows service and start automatically

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu/Debian):**
```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

### Step 2: Verify MongoDB is Running

**Windows:**
- Check Services (services.msc) for "MongoDB" service
- Or open Command Prompt and run: `mongod --version`

**macOS/Linux:**
```bash
mongod --version
# Should show MongoDB version
```

### Step 3: Create `.env` File

Create a file named `.env` in the project root (same folder as `server.js`).

**Important**: Never commit the `.env` file to Git! It's already in `.gitignore`.

Add this content to `.env`:

```env
# Server Configuration
PORT=3000

# MongoDB Connection String
# For local MongoDB (default):
MONGODB_URI=mongodb://localhost:27017

# Database name
DB_NAME=syn_prezesa

# Optional: Default admin password (defaults to 'admin1234')
DEFAULT_ADMIN_PASSWORD=admin1234
```

**Connection String Options:**

- **Local MongoDB (default)**: `mongodb://localhost:27017`
- **With authentication**: `mongodb://username:password@localhost:27017`
- **Custom port**: `mongodb://localhost:27018`
- **MongoDB Atlas (cloud)**: `mongodb+srv://username:password@cluster.mongodb.net/syn_prezesa?retryWrites=true&w=majority`

### Step 4: Initialize Database

Run the initialization script to create collections and indexes:

```bash
npm run init-db
```

Or directly:
```bash
node init-mongodb.js
```

This will:
- Create the necessary collections (users, zamowienia, zamowienia_archiwum, plan_produkcji)
- Set up indexes for better performance
- Verify the connection

### Step 5: Create Admin User

Create an admin user to log in:

```bash
npm run create-admin
```

Or with custom username/password:
```bash
node create-admin.js myusername mypassword
```

**Default credentials:**
- Username: `admin`
- Password: `admin1234`

⚠️ **Important**: Change the default password after first login!

### Step 6: Install Dependencies

If you haven't already:

```bash
npm install
```

### Step 7: Run the Server

```bash
npm start
```

Or:
```bash
node server.js
```

### Step 8: Access the Application

Open your browser to:
```
http://localhost:3000
```

You should be redirected to the login page. Use the admin credentials you created.

## Troubleshooting

### Error: "Cannot connect to MongoDB" or "ECONNREFUSED"
- **Solution**: Make sure MongoDB is running
  - Windows: Check Services for "MongoDB" service
  - macOS: `brew services start mongodb-community`
  - Linux: `sudo systemctl start mongod`
- Verify connection string in `.env` file
- Check if MongoDB is listening on the correct port (default: 27017)

### Error: "MongoDB connection string not found!"
- Make sure `.env` file exists in the project root
- Check that `MONGODB_URI=` line is present (no spaces around `=`)
- Verify the file is named exactly `.env` (not `.env.txt`)

### Error: "Authentication failed" (for MongoDB Atlas)
- Double-check username/password in connection string
- Make sure special characters in password are URL-encoded
- Verify database user exists in Atlas → Database Access

### Error: "Connection timeout" or "Connection refused" (for MongoDB Atlas)
- Check Network Access settings in Atlas dashboard
- Add your IP address or allow access from anywhere (0.0.0.0/0)
- Verify Atlas cluster is running (not paused)

### Error: "Invalid connection string format"
- Make sure connection string starts with `mongodb://` or `mongodb+srv://`
- For local MongoDB, use: `mongodb://localhost:27017`
- For Atlas, use: `mongodb+srv://username:password@cluster.mongodb.net/database`

### Error: "Collection doesn't exist"
- Run `npm run init-db` to create collections and indexes
- Collections are created automatically on first insert, but indexes need to be created

## Testing Connection

After starting the server, check the console output. You should see:
- ✅ `Connected to MongoDB database: syn_prezesa` = Working!
- ✅ `Database indexes created` = Indexes are set up!
- ✅ `Created default admin user` = Admin user ready!
- ❌ Any error message = Check troubleshooting above

## MongoDB Shell (mongosh)

You can interact with MongoDB using the MongoDB shell:

```bash
mongosh
```

Then:
```javascript
use syn_prezesa
db.users.find()
db.zamowienia.find()
```

## Database Backup

To backup your database:
```bash
mongodump --db=syn_prezesa --out=./backup
```

To restore:
```bash
mongorestore --db=syn_prezesa ./backup/syn_prezesa
```

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to Git
- Never share your connection string publicly
- Use strong passwords for database users
- For production, use MongoDB authentication
- Consider restricting network access instead of allowing all IPs

## Next Steps

1. ✅ Install MongoDB
2. ✅ Create `.env` file
3. ✅ Run `npm run init-db`
4. ✅ Run `npm run create-admin`
5. ✅ Start server: `npm start`
6. ✅ Open browser: `http://localhost:3000`
7. ✅ Login with admin credentials

## Optional: MongoDB Compass (GUI)

MongoDB Compass is a GUI tool for MongoDB:
- Download from [MongoDB Compass](https://www.mongodb.com/products/compass)
- Connect to `mongodb://localhost:27017`
- Browse and edit your data visually
