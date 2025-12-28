# MySQL Local Database Setup Guide

This guide will help you set up a local MySQL database for the syn-prezesa application.

## Prerequisites

1. **Install MySQL Server**
   - **Windows**: Download from [MySQL Downloads](https://dev.mysql.com/downloads/mysql/)
     - Choose "MySQL Installer for Windows"
     - During installation, set a root password (remember this!)
   - **macOS**: 
     ```bash
     brew install mysql
     brew services start mysql
     ```
   - **Linux (Ubuntu/Debian)**:
     ```bash
     sudo apt update
     sudo apt install mysql-server
     sudo systemctl start mysql
     ```

2. **Verify MySQL Installation**
   ```bash
   mysql --version
   ```

## Database Setup Steps

### Step 1: Create the Database and Tables

1. **Open MySQL Command Line** (or MySQL Workbench):
   ```bash
   mysql -u root -p
   ```
   Enter your MySQL root password when prompted.

2. **Run the Schema File**:
   ```bash
   mysql -u root -p < database_schema.sql
   ```
   
   Or manually in MySQL:
   ```sql
   source database_schema.sql;
   ```

3. **Verify Tables Were Created**:
   ```sql
   USE syn_prezesa;
   SHOW TABLES;
   ```
   
   You should see:
   - `users`
   - `zamowienia`
   - `zamowienia_archiwum`
   - `plan_produkcji`

### Step 2: Configure Environment Variables

Create or update your `.env` file in the project root:

```env
# Server Configuration
PORT=3000

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_root_password
DB_NAME=syn_prezesa

# Optional: Default admin password (defaults to 'admin1234')
DEFAULT_ADMIN_PASSWORD=admin1234
```

**Important**: Replace `your_mysql_root_password` with your actual MySQL root password.

### Step 3: Test the Connection

1. **Start the Server**:
   ```bash
   npm start
   ```

2. **Check Console Output**:
   You should see:
   ```
   ✅ Connected to MySQL database: syn_prezesa
   ✅ Database connection verified
   ✅ Created default admin user
   Server running at http://localhost:3000
   ```

3. **If You See Errors**:
   - Check that MySQL is running
   - Verify database credentials in `.env`
   - Ensure the database and tables exist

## Troubleshooting

### Error: "Access denied for user"
- **Solution**: Check your `DB_USER` and `DB_PASSWORD` in `.env`
- Make sure the MySQL user has permissions to access the database

### Error: "Unknown database 'syn_prezesa'"
- **Solution**: Run `database_schema.sql` to create the database
- Or manually create it:
  ```sql
  CREATE DATABASE syn_prezesa;
  ```

### Error: "Can't connect to MySQL server"
- **Solution**: 
  - Check if MySQL service is running
  - Windows: Check Services (services.msc) for "MySQL"
  - Linux: `sudo systemctl status mysql`
  - macOS: `brew services list`

### Error: "Table doesn't exist"
- **Solution**: Run the `database_schema.sql` file to create all tables

## Creating a Dedicated MySQL User (Recommended for Production)

Instead of using root, create a dedicated user:

```sql
-- Connect as root
mysql -u root -p

-- Create user
CREATE USER 'syn_prezesa_user'@'localhost' IDENTIFIED BY 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON syn_prezesa.* TO 'syn_prezesa_user'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;
```

Then update your `.env`:
```env
DB_USER=syn_prezesa_user
DB_PASSWORD=your_secure_password
```

## Database Backup

To backup your database:
```bash
mysqldump -u root -p syn_prezesa > backup.sql
```

To restore:
```bash
mysql -u root -p syn_prezesa < backup.sql
```

## Creating Admin User

After setting up the database, create an admin user:

**Option 1: Using npm script (recommended)**
```bash
npm run create-admin
```

**Option 2: Direct command**
```bash
node create-admin.js
```

**Option 3: With custom username and password**
```bash
node create-admin.js myusername mypassword
```

The script will:
- Connect to your MySQL database
- Create an admin user (default: `admin` / `admin1234`)
- Use the same password hashing as the server
- Show clear error messages if something goes wrong

## Next Steps

1. Create admin user: `npm run create-admin`
2. Start the server: `npm start`
3. Open browser: `http://localhost:3000`
4. Login with the credentials you created

## Notes

- The database uses UTF8MB4 encoding for full Unicode support
- JSON columns are used for flexible order data storage
- All timestamps are stored as DATETIME
- The application automatically creates the default admin user on first run

