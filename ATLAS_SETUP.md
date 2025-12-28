# MongoDB Atlas + Railway Setup Guide

## Quick Setup Steps

### 1. MongoDB Atlas Configuration

1. **Create Database User** (if not done):
   - Go to Atlas Dashboard → Database Access
   - Click "Add New Database User"
   - Create username/password (save these!)
   - Set permissions: "Read and write to any database"

2. **Configure Network Access** (CRITICAL):
   - Go to Atlas Dashboard → Network Access
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - Or get Railway's IP addresses (less secure but more restrictive)
   - Click "Confirm"

3. **Get Connection String**:
   - Go to Atlas Dashboard → Database → Connect
   - Click "Connect your application"
   - Choose "Node.js" and copy the connection string
   - It will look like:
     ```
     mongodb+srv://<username>:<password>@cluster.mongodb.net/
     ```

### 2. Railway Configuration

1. **Add Environment Variable**:
   - Go to Railway Dashboard → Your Project
   - Click "Variables" tab
   - Click "New Variable"
   - Name: `MONGODB_URI`
   - Value: Your full connection string with database name:
     ```
     mongodb+srv://yourusername:yourpassword@cluster.mongodb.net/Luki?retryWrites=true&w=majority
     ```
   - **Important**: Replace `<username>` and `<password>` with your actual credentials
   - **Important**: Add `/Luki` before the `?` (this is your database name)

2. **Deploy**:
   - Railway will automatically redeploy when you save the variable
   - Check logs to see connection status

### 3. Verify Connection

Check Railway logs. You should see:
- ✅ `Connected to MongoDB successfully` = Success!
- ❌ Error messages = See troubleshooting below

## Common Issues & Fixes

### Issue: "Authentication failed"
**Fix**: 
- Check username/password are correct in connection string
- Ensure database user exists in Atlas
- Make sure special characters in password are URL-encoded

### Issue: "Timeout" or "Connection refused"
**Fix**:
- Verify Network Access allows `0.0.0.0/0` (all IPs)
- Check if Atlas cluster is running (not paused)
- Verify connection string format is correct

### Issue: "Database not found"
**Fix**:
- Atlas will create the database automatically when you first write data
- Make sure `/Luki` is in your connection string
- Or change `DB_NAME` environment variable if using different database name

### Issue: Connection string format
**Correct format**:
```
mongodb+srv://username:password@cluster-name.mongodb.net/DATABASE_NAME?retryWrites=true&w=majority
```

**Wrong format** (missing database):
```
mongodb+srv://username:password@cluster-name.mongodb.net
```

## Testing Locally

Before deploying to Railway, test locally:

1. Create `.env` file (don't commit this!):
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/Luki?retryWrites=true&w=majority
   ```

2. Install dotenv (optional):
   ```bash
   npm install dotenv
   ```
   Then add to top of `server.js`:
   ```js
   require('dotenv').config();
   ```

3. Run server:
   ```bash
   npm start
   ```

4. Check console for connection message

## Security Notes

⚠️ **Important**:
- Never commit `.env` files or connection strings to Git
- Use environment variables for all sensitive data
- Consider restricting IP access instead of `0.0.0.0/0` for production
- Rotate database passwords regularly
