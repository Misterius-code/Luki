// Script to clean/delete all data from the database
// WARNING: This will delete ALL data from all collections!
require('dotenv').config();
const { MongoClient } = require('mongodb');

// MongoDB connection configuration
// Check if Local mode is enabled (for local development)
const isLocal = process.env.Local === 'True' || process.env.Local === 'true';
const MONGODB_URI = isLocal ? 'mongodb://localhost:27017' : (process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017');
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

async function cleanDatabase() {
	let client;
	try {
		// Connect to MongoDB
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		
		console.log('⚠️  WARNING: This will delete ALL data from the database!');
		console.log('📊 Database:', DB_NAME);
		console.log('🔗 Connection:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@'));
		console.log('');

		// List of collections to clean
		const collections = ['users', 'zamowienia', 'zamowienia_archiwum', 'plan_produkcji'];
		
		// Get counts before deletion
		console.log('📊 Current data counts:');
		for (const collectionName of collections) {
			try {
				const count = await db.collection(collectionName).countDocuments();
				console.log(`   ${collectionName}: ${count} documents`);
			} catch (e) {
				console.log(`   ${collectionName}: collection doesn't exist or error: ${e.message}`);
			}
		}
		
		console.log('\n🗑️  Deleting all data from collections...');
		
		// Delete all documents from each collection
		for (const collectionName of collections) {
			try {
				const result = await db.collection(collectionName).deleteMany({});
				console.log(`✅ Deleted ${result.deletedCount} documents from ${collectionName}`);
			} catch (e) {
				if (e.codeName === 'NamespaceNotFound') {
					console.log(`ℹ️  Collection ${collectionName} doesn't exist, skipping...`);
				} else {
					console.error(`❌ Error deleting from ${collectionName}:`, e.message);
				}
			}
		}
		
		// Verify deletion
		console.log('\n📊 Verification (should all be 0):');
		for (const collectionName of collections) {
			try {
				const count = await db.collection(collectionName).countDocuments();
				console.log(`   ${collectionName}: ${count} documents`);
			} catch (e) {
				console.log(`   ${collectionName}: collection doesn't exist`);
			}
		}
		
		console.log('\n✅ Database cleaned successfully!');
		console.log('\n📝 Next steps:');
		console.log('   1. Re-initialize database: npm run init-db');
		console.log('   2. Create admin user: npm run create-admin');
		
	} catch (err) {
		console.error('❌ Error cleaning database:', err.message);
		
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

// Run the cleanup
cleanDatabase();

