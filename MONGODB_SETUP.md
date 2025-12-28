# MongoDB Setup Guide

This guide provides detailed instructions for setting up MongoDB for the syn-prezesa application.

## Installation

### Windows

1. **Download MongoDB Community Server**
   - Visit [MongoDB Downloads](https://www.mongodb.com/try/download/community)
   - Select "Windows" and download the MSI installer
   - Run the installer and follow the setup wizard
   - Choose "Complete" installation
   - Install MongoDB as a Windows Service (recommended)

2. **Verify Installation**
   - Open Command Prompt
   - Run: `mongod --version`
   - Check Services (services.msc) for "MongoDB" service

3. **Start MongoDB**
   - MongoDB should start automatically as a Windows service
   - If not, start it from Services or run: `net start MongoDB`

### macOS

```bash
# Install MongoDB using Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify it's running
brew services list
```

### Linux (Ubuntu/Debian)

```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update package list
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Check status
sudo systemctl status mongod
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# MongoDB Connection String
# Local MongoDB (default):
MONGODB_URI=mongodb://localhost:27017

# With authentication:
# MONGODB_URI=mongodb://username:password@localhost:27017

# Database name
DB_NAME=syn_prezesa

# Server port
PORT=3000

# Default admin password (optional)
DEFAULT_ADMIN_PASSWORD=admin1234
```

### Connection String Formats

**Local MongoDB (no authentication):**
```
mongodb://localhost:27017
```

**Local MongoDB (with authentication):**
```
mongodb://username:password@localhost:27017
```

**MongoDB Atlas (cloud):**
```
mongodb+srv://username:password@cluster.mongodb.net/syn_prezesa?retryWrites=true&w=majority
```

**Custom port:**
```
mongodb://localhost:27018
```

## Database Initialization

### Step 1: Initialize Database

Run the initialization script:

```bash
npm run init-db
```

This script will:
- Create collections: `users`, `zamowienia`, `zamowienia_archiwum`, `plan_produkcji`
- Create indexes for better query performance
- Verify the connection

### Step 2: Create Admin User

```bash
npm run create-admin
```

Or with custom credentials:
```bash
node create-admin.js myusername mypassword
```

## MongoDB Collections

The application uses the following collections:

### 1. `users`
- Stores user accounts and authentication data
- Index: `username` (unique)

### 2. `zamowienia`
- Stores active orders
- Document structure: `{ data: {...}, createdAt: Date }`
- Indexes: `data.Numer zlecenia`, `createdAt`

### 3. `zamowienia_archiwum`
- Stores archived orders
- Document structure: `{ data: {...}, archivedAt: Date, createdAt: Date }`
- Indexes: `archivedAt`, `createdAt`

### 4. `plan_produkcji`
- Stores production plan assignments
- Document structure: `{ orderId, numerZlecenia, destination, kind, createdAt, updatedAt }`
- Indexes: `orderId + kind` (unique), `kind`, `updatedAt`

## MongoDB Shell (mongosh)

Access MongoDB shell:

```bash
mongosh
```

### Useful Commands

```javascript
// Switch to database
use syn_prezesa

// List collections
show collections

// Find all users
db.users.find()

// Find orders
db.zamowienia.find().limit(10)

// Count documents
db.zamowienia.countDocuments()

// Find by ID
db.zamowienia.findOne({ _id: ObjectId("...") })

// Update a document
db.users.updateOne(
  { username: "admin" },
  { $set: { lastActivity: new Date() } }
)

// Delete a document
db.zamowienia.deleteOne({ _id: ObjectId("...") })
```

## Backup and Restore

### Backup Database

```bash
mongodump --db=syn_prezesa --out=./backup
```

### Restore Database

```bash
mongorestore --db=syn_prezesa ./backup/syn_prezesa
```

### Export Collection to JSON

```bash
mongoexport --db=syn_prezesa --collection=zamowienia --out=zamowienia.json
```

### Import Collection from JSON

```bash
mongoimport --db=syn_prezesa --collection=zamowienia --file=zamowienia.json
```

## Security

### Enable Authentication (Recommended for Production)

1. **Create Admin User:**
```javascript
use admin
db.createUser({
  user: "admin",
  pwd: "secure_password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
```

2. **Update Connection String:**
```env
MONGODB_URI=mongodb://admin:secure_password@localhost:27017
```

3. **Restart MongoDB with authentication:**
   - Edit MongoDB config file (usually `/etc/mongod.conf` or `C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg`)
   - Set `security.authorization: enabled`
   - Restart MongoDB service

### Network Security

- By default, MongoDB listens on `localhost:27017` (local only)
- For production, configure firewall rules
- Use MongoDB Atlas for cloud hosting with built-in security

## Troubleshooting

### MongoDB Won't Start

**Windows:**
- Check Services for error messages
- Check MongoDB logs: `C:\Program Files\MongoDB\Server\7.0\log\mongod.log`
- Ensure port 27017 is not in use

**macOS/Linux:**
```bash
# Check MongoDB status
sudo systemctl status mongod

# View logs
sudo journalctl -u mongod
# or
tail -f /var/log/mongodb/mongod.log
```

### Connection Refused

- Verify MongoDB is running: `mongosh --eval "db.version()"`
- Check connection string in `.env`
- Verify port (default: 27017)
- Check firewall settings

### Permission Denied

- Ensure MongoDB data directory has correct permissions
- On Linux: `sudo chown -R mongodb:mongodb /var/lib/mongodb`

## MongoDB Compass (GUI Tool)

MongoDB Compass provides a visual interface:

1. Download from [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Connect to: `mongodb://localhost:27017`
3. Browse collections, run queries, edit documents

## Performance Tips

1. **Indexes**: Already created by `init-mongodb.js`
2. **Connection Pooling**: Handled automatically by MongoDB driver
3. **Query Optimization**: Use `.explain()` to analyze queries
4. **Regular Backups**: Set up automated backups for production

## Migration from MySQL

If you're migrating from MySQL:
1. Export MySQL data to JSON/CSV
2. Use `mongoimport` to import into MongoDB
3. Adjust data structure if needed (MongoDB is more flexible)

## Next Steps

1. ✅ Install MongoDB
2. ✅ Configure `.env` file
3. ✅ Run `npm run init-db`
4. ✅ Run `npm run create-admin`
5. ✅ Start server: `npm start`

For more information, visit [MongoDB Documentation](https://docs.mongodb.com/).

