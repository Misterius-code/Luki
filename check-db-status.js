// Script to check database connection and admin user status
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Railway automatically sets MONGO_URL, so check that first, then MONGODB_URI
const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

async function checkDatabaseStatus() {
	let client;
	try {
		console.log('🔍 Checking database status...\n');
		console.log('MONGODB_URI:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide password
		console.log('DB_NAME:', DB_NAME);
		console.log('');

		// Connect to MongoDB
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		console.log('✅ Connected to MongoDB database:', DB_NAME);

		// Check collections
		console.log('\n📊 Collections:');
		const collections = await db.listCollections().toArray();
		if (collections.length === 0) {
			console.log('   ⚠️  No collections found. Database might be empty.');
		} else {
			collections.forEach(col => {
				console.log(`   - ${col.name}`);
			});
		}

		// Check users
		console.log('\n👥 Users:');
		const users = await db.collection('users').find().toArray();
		if (users.length === 0) {
			console.log('   ⚠️  No users found!');
			console.log('   💡 Run: node create-admin.js to create an admin user');
		} else {
			users.forEach(user => {
				console.log(`   - ${user.username} (created: ${user.createdAt || 'unknown'})`);
			});
		}

		// Check admin user specifically
		const admin = await db.collection('users').findOne({ username: 'admin' });
		if (admin) {
			console.log('\n✅ Admin user exists!');
			console.log('   Username: admin');
			console.log('   You can login with this account');
		} else {
			console.log('\n⚠️  Admin user NOT found!');
			console.log('   Run: node create-admin.js');
		}

		// Check other collections
		console.log('\n📦 Data counts:');
		const zamowieniaCount = await db.collection('zamowienia').countDocuments();
		const archiwumCount = await db.collection('zamowienia_archiwum').countDocuments();
		const planCount = await db.collection('plan_produkcji').countDocuments();
		console.log(`   - Zamówienia: ${zamowieniaCount}`);
		console.log(`   - Archiwum: ${archiwumCount}`);
		console.log(`   - Plan produkcji: ${planCount}`);

		console.log('\n✅ Database check completed!');

	} catch (err) {
		console.error('\n❌ Error checking database:', err.message);
		
		if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
			console.error('\n   Cannot connect to MongoDB. Please check:');
			console.error('   1. MONGODB_URI is correct');
			console.error('   2. MongoDB is running and accessible');
			console.error('   3. Network/firewall allows connection');
		} else if (err.message.includes('authentication')) {
			console.error('\n   Authentication failed. Please check:');
			console.error('   1. Username and password in MONGODB_URI');
			console.error('   2. Database user has correct permissions');
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

// Run the check
checkDatabaseStatus();

