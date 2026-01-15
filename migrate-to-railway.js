// Script to migrate database from local MongoDB to Railway MongoDB
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Source database (local)
const SOURCE_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
const SOURCE_DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// Target database (Railway) - can be passed as argument or environment variable
const TARGET_URI = process.argv[2] || process.env.RAILWAY_MONGODB_URI || '';
const TARGET_DB_NAME = process.env.RAILWAY_DB_NAME || process.env.DB_NAME || 'syn_prezesa';

if (!TARGET_URI) {
	console.error('❌ Target MongoDB URI is required!');
	console.error('');
	console.error('Usage:');
	console.error('  node migrate-to-railway.js "mongodb://user:pass@host:port"');
	console.error('');
	console.error('Or set RAILWAY_MONGODB_URI environment variable:');
	console.error('  RAILWAY_MONGODB_URI="mongodb://..." node migrate-to-railway.js');
	process.exit(1);
}

// Collections to migrate
const COLLECTIONS = ['users', 'zamowienia', 'zamowienia_archiwum', 'plan_produkcji'];

async function migrateDatabase() {
	let sourceClient, targetClient;
	
	try {
		console.log('🔄 Database Migration Script');
		console.log('============================\n');
		
		// Connect to source database
		console.log('📥 Connecting to SOURCE database (local)...');
		console.log('   URI:', SOURCE_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@'));
		console.log('   Database:', SOURCE_DB_NAME);
		sourceClient = new MongoClient(SOURCE_URI);
		await sourceClient.connect();
		const sourceDb = sourceClient.db(SOURCE_DB_NAME);
		console.log('✅ Connected to source database\n');
		
		// Connect to target database
		console.log('📤 Connecting to TARGET database (Railway)...');
		console.log('   URI:', TARGET_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@'));
		console.log('   Database:', TARGET_DB_NAME);
		targetClient = new MongoClient(TARGET_URI);
		await targetClient.connect();
		const targetDb = targetClient.db(TARGET_DB_NAME);
		console.log('✅ Connected to target database\n');
		
		// Check source data
		console.log('📊 Checking source database...');
		const sourceCounts = {};
		for (const collectionName of COLLECTIONS) {
			try {
				const count = await sourceDb.collection(collectionName).countDocuments();
				sourceCounts[collectionName] = count;
				console.log(`   ${collectionName}: ${count} documents`);
			} catch (e) {
				console.log(`   ${collectionName}: collection doesn't exist or error`);
				sourceCounts[collectionName] = 0;
			}
		}
		console.log('');
		
		// Check target data
		console.log('📊 Checking target database...');
		const targetCounts = {};
		for (const collectionName of COLLECTIONS) {
			try {
				const count = await targetDb.collection(collectionName).countDocuments();
				targetCounts[collectionName] = count;
				console.log(`   ${collectionName}: ${count} documents`);
			} catch (e) {
				console.log(`   ${collectionName}: collection doesn't exist or error`);
				targetCounts[collectionName] = 0;
			}
		}
		console.log('');
		
		// Warn if target has data
		const hasTargetData = Object.values(targetCounts).some(count => count > 0);
		if (hasTargetData) {
			console.log('⚠️  WARNING: Target database already contains data!');
			console.log('   This script will ADD data to existing collections.');
			console.log('   Duplicate documents (based on _id) will be skipped.\n');
		}
		
		// Migrate each collection
		console.log('🚀 Starting migration...\n');
		let totalMigrated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;
		
		for (const collectionName of COLLECTIONS) {
			const sourceCount = sourceCounts[collectionName] || 0;
			
			if (sourceCount === 0) {
				console.log(`⏭️  Skipping ${collectionName} (no documents in source)`);
				continue;
			}
			
			console.log(`📦 Migrating ${collectionName}...`);
			try {
				const sourceCollection = sourceDb.collection(collectionName);
				const targetCollection = targetDb.collection(collectionName);
				
				// Get all documents from source
				const documents = await sourceCollection.find({}).toArray();
				console.log(`   Found ${documents.length} documents`);
				
				// Create indexes on target (same as source)
				try {
					const indexes = await sourceCollection.indexes();
					for (const index of indexes) {
						if (index.name !== '_id_') { // Skip default _id index
							try {
								await targetCollection.createIndex(index.key, index.options || {});
								console.log(`   ✅ Created index: ${index.name}`);
							} catch (e) {
								if (e.code !== 85) { // 85 = IndexOptionsConflict
									console.log(`   ⚠️  Index ${index.name}: ${e.message}`);
								}
							}
						}
					}
				} catch (e) {
					console.log(`   ⚠️  Could not copy indexes: ${e.message}`);
				}
				
				// Insert documents
				let migrated = 0;
				let skipped = 0;
				let errors = 0;
				
				for (const doc of documents) {
					try {
						// Check if document already exists
						const existing = await targetCollection.findOne({ _id: doc._id });
						if (existing) {
							skipped++;
							continue;
						}
						
						// Insert document
						await targetCollection.insertOne(doc);
						migrated++;
						
						if ((migrated + skipped) % 10 === 0) {
							process.stdout.write(`   Progress: ${migrated} migrated, ${skipped} skipped\r`);
						}
					} catch (e) {
						if (e.code === 11000) { // Duplicate key error
							skipped++;
						} else {
							console.error(`   ❌ Error migrating document ${doc._id}: ${e.message}`);
							errors++;
						}
					}
				}
				
				console.log(`   ✅ ${collectionName}: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
				totalMigrated += migrated;
				totalSkipped += skipped;
				totalErrors += errors;
				
			} catch (e) {
				console.error(`   ❌ Error migrating ${collectionName}: ${e.message}`);
				totalErrors++;
			}
			console.log('');
		}
		
		// Final summary
		console.log('📊 Migration Summary:');
		console.log('============================');
		console.log(`✅ Migrated: ${totalMigrated} documents`);
		console.log(`⏭️  Skipped: ${totalSkipped} documents (duplicates)`);
		if (totalErrors > 0) {
			console.log(`❌ Errors: ${totalErrors} documents`);
		}
		console.log('');
		
		// Verify target data
		console.log('📊 Verifying target database...');
		for (const collectionName of COLLECTIONS) {
			try {
				const count = await targetDb.collection(collectionName).countDocuments();
				console.log(`   ${collectionName}: ${count} documents`);
			} catch (e) {
				console.log(`   ${collectionName}: error - ${e.message}`);
			}
		}
		
		console.log('\n✅ Migration completed successfully!');
		console.log('\n📝 Next steps:');
		console.log('   1. Update your Railway environment variables:');
		console.log(`      MONGODB_URI="${TARGET_URI}"`);
		console.log(`      DB_NAME="${TARGET_DB_NAME}"`);
		console.log('   2. Restart your Railway service');
		console.log('   3. Test the application');
		
	} catch (err) {
		console.error('\n❌ Migration error:', err.message);
		
		if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
			console.error('\n   Cannot connect to database. Please check:');
			console.error('   1. Connection strings are correct');
			console.error('   2. Network access is allowed (for Railway)');
			console.error('   3. Credentials are valid');
		} else if (err.message.includes('authentication')) {
			console.error('\n   Authentication failed. Please check:');
			console.error('   1. Username and password are correct');
			console.error('   2. User has proper permissions');
		} else {
			console.error('   Full error:', err);
		}
		process.exit(1);
	} finally {
		if (sourceClient) {
			await sourceClient.close();
			console.log('\n🔌 Closed source database connection');
		}
		if (targetClient) {
			await targetClient.close();
			console.log('🔌 Closed target database connection');
		}
	}
}

// Run migration
migrateDatabase();



