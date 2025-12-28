// MongoDB Database Initialization Script
// This script creates the necessary collections and indexes for the syn-prezesa application
require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

async function initializeDatabase() {
	let client;
	try {
		// Connect to MongoDB
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		
		console.log('✅ Connected to MongoDB database:', DB_NAME);

		// Create collections (MongoDB creates them automatically on first insert, but we'll ensure they exist)
		const collections = ['users', 'zamowienia', 'zamowienia_archiwum', 'plan_produkcji'];
		
		for (const collectionName of collections) {
			const collectionsList = await db.listCollections({ name: collectionName }).toArray();
			if (collectionsList.length === 0) {
				await db.createCollection(collectionName);
				console.log(`✅ Created collection: ${collectionName}`);
			} else {
				console.log(`ℹ️  Collection already exists: ${collectionName}`);
			}
		}

		// Create indexes
		console.log('\n📊 Creating indexes...');
		
		// Users collection indexes
		await db.collection('users').createIndex({ username: 1 }, { unique: true });
		console.log('✅ Created index on users.username (unique)');
		
		// Zamowienia collection indexes
		await db.collection('zamowienia').createIndex({ 'data.Numer zlecenia': 1 });
		console.log('✅ Created index on zamowienia.data.Numer zlecenia');
		await db.collection('zamowienia').createIndex({ createdAt: -1 });
		console.log('✅ Created index on zamowienia.createdAt');
		
		// Archive collection indexes
		await db.collection('zamowienia_archiwum').createIndex({ archivedAt: -1 });
		console.log('✅ Created index on zamowienia_archiwum.archivedAt');
		await db.collection('zamowienia_archiwum').createIndex({ createdAt: -1 });
		console.log('✅ Created index on zamowienia_archiwum.createdAt');
		
		// Plan produkcji collection indexes
		await db.collection('plan_produkcji').createIndex({ orderId: 1, kind: 1 }, { unique: true });
		console.log('✅ Created index on plan_produkcji.orderId + kind (unique)');
		await db.collection('plan_produkcji').createIndex({ kind: 1 });
		console.log('✅ Created index on plan_produkcji.kind');
		await db.collection('plan_produkcji').createIndex({ updatedAt: -1 });
		console.log('✅ Created index on plan_produkcji.updatedAt');

		console.log('\n✅ Database initialization completed successfully!');
		console.log('\n📝 Next steps:');
		console.log('   1. Create an admin user: npm run create-admin');
		console.log('   2. Start the server: npm start');
		
	} catch (err) {
		console.error('❌ Error initializing database:', err.message);
		
		if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
			console.error('\n   Cannot connect to MongoDB. Please:');
			console.error('   1. Make sure MongoDB is installed and running');
			console.error('   2. Check your MONGODB_URI in .env file');
			console.error('   3. Default connection: mongodb://localhost:27017');
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

// Run the initialization
initializeDatabase();

