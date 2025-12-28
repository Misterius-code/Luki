// Script to create an admin user in MongoDB database
require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// MongoDB connection configuration
// Railway automatically sets MONGO_URL, so check that first, then MONGODB_URI
const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// Password hashing utilities (same as server.js)
function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
	return `${salt}:${hash}`;
}

async function createAdminUser() {
	let client;
	try {
		// Connect to MongoDB
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		console.log('✅ Connected to MongoDB database:', DB_NAME);

		// Get username and password from command line or use defaults
		const username = process.argv[2] || 'admin';
		const password = process.argv[3] || process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234';

		// Check if user already exists
		const existing = await db.collection('users').findOne({ username: username });

		if (existing) {
			console.log(`⚠️  User "${username}" already exists!`);
			console.log('   To update the password, delete the user first or use a different username.');
			process.exit(1);
		}

		// Hash password
		const hashedPassword = hashPassword(password);
		const createdAt = new Date();

		// Insert admin user
		await db.collection('users').insertOne({
			username: username,
			password: hashedPassword,
			createdAt: createdAt,
			lastActivity: null
		});

		console.log('✅ Admin user created successfully!');
		console.log('   Username:', username);
		console.log('   Password:', password);
		console.log('   ⚠️  Please change the password after first login!');

	} catch (err) {
		console.error('❌ Error creating admin user:', err.message);
		
		if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
			console.error('   Cannot connect to MongoDB. Make sure MongoDB is running.');
			console.error('   Default connection: mongodb://localhost:27017');
		} else if (err.code === 11000) {
			console.error('   User already exists (duplicate key error).');
		} else {
			console.error('   Full error:', err);
		}
		process.exit(1);
	} finally {
		if (client) {
			await client.close();
		}
	}
}

// Run the script
createAdminUser();
