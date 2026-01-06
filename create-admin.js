// Script to create an admin user in MongoDB database
require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// MongoDB connection configuration
// Check if Local mode is enabled (for local development)
const isLocal = process.env.Local === 'True' || process.env.Local === 'true';
const MONGODB_URI = isLocal ? 'mongodb://localhost:27017' : (process.env.MONGODB_URI || 'mongodb://localhost:27017');
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
			// Update existing user to admin role if not already admin
			if (existing.role !== 'admin') {
				await db.collection('users').updateOne(
					{ username: username },
					{ $set: { role: 'admin' } }
				);
				console.log(`✅ Updated user "${username}" to admin role!`);
				console.log('   Username:', username);
				console.log('   Role: admin (updated)');
			} else {
				console.log(`⚠️  User "${username}" already exists with admin role!`);
				console.log('   No changes needed.');
			}
			process.exit(0);
		}

		// Hash password
		const hashedPassword = hashPassword(password);
		const createdAt = new Date();

		// Insert admin user with admin role
		await db.collection('users').insertOne({
			username: username,
			password: hashedPassword,
			role: 'admin',
			createdAt: createdAt,
			lastActivity: null
		});

		console.log('✅ Admin user created successfully!');
		console.log('   Username:', username);
		console.log('   Password:', password);
		console.log('   Role: admin');
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
