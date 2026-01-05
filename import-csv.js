// Script to import CSV file into MongoDB database
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// CSV file path (can be passed as argument or use default)
const CSV_FILE = process.argv[2] || path.join(__dirname, 'Zamówienia - Lista Ogólna - main (1).csv');

// CSV parser that handles quoted values with commas
function parseCSVLine(line) {
	const cells = [];
	let current = '';
	let inQuotes = false;
	
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];
		
		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next quote
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			// End of cell
			cells.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}
	// Add last cell
	cells.push(current.trim());
	
	return cells;
}

// Simple CSV parser
function parseCSV(content) {
	const lines = content.split(/\r?\n/).filter(line => line.trim());
	if (lines.length === 0) return { headers: [], rows: [] };
	
	const headers = parseCSVLine(lines[0]).map(h => h.trim());
	const rows = [];
	
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue; // Skip empty lines
		
		const cells = parseCSVLine(line);
		
		// Map cells to headers
		const row = {};
		headers.forEach((header, index) => {
			if (header && cells[index] !== undefined) {
				const value = cells[index].trim();
				// Skip empty values and only system columns that are not needed
				if (value && !header.startsWith('Akcja') && header !== 'Usun-inator') {
					row[header] = value;
				}
			}
		});
		
		// Only add row if it has meaningful data (at least Numer zlecenia or Zleceniobiorca)
		if (row['Numer zlecenia'] || row['Zleceniobiorca']) {
			rows.push(row);
		}
	}
	
	return { headers, rows };
}

// Map CSV columns to database fields
function mapCSVToOrder(csvRow) {
	const order = {};
	
	// Copy all fields from CSV row to order (except system columns and production assignments)
	// Production assignments (Wytłaczarka, Drukarnia, Automaty) are handled separately
	const systemColumns = ['Akcja 1 copy', 'Akcja 2 copy', 'Akcja 3 copy', 'Usun-inator'];
	
	Object.entries(csvRow).forEach(([csvField, csvValue]) => {
		// Skip system columns
		if (systemColumns.some(col => csvField.startsWith(col))) {
			return;
		}
		
		// Skip production assignments (handled separately)
		if (csvField === 'Wytłaczarka' || csvField === 'Drukarnia' || csvField === 'Automaty') {
			return;
		}
		
		// Copy all other fields directly
		if (csvValue && csvValue.trim()) {
			order[csvField] = csvValue.trim();
		}
	});
	
	// Handle production assignments (Wytłaczarka, Drukarnia, Automaty)
	// These are stored in the order data but also need to be in plan_produkcji
	const productionAssignments = {};
	const productionFields = ['Wytłaczarka', 'Drukarnia', 'Automaty'];
	
	productionFields.forEach(field => {
		if (csvRow[field] && csvRow[field].trim() && csvRow[field].trim() !== 'Empty') {
			order[field] = csvRow[field].trim();
			productionAssignments[field] = csvRow[field].trim();
		}
	});
	
	return { order, productionAssignments };
}

async function importCSV() {
	let client;
	try {
		// Check if file exists
		if (!fs.existsSync(CSV_FILE)) {
			console.error(`❌ File not found: ${CSV_FILE}`);
			console.error('   Usage: node import-csv.js [path-to-csv-file]');
			process.exit(1);
		}
		
		console.log('📄 Reading CSV file:', CSV_FILE);
		const content = fs.readFileSync(CSV_FILE, 'utf-8');
		
		console.log('📊 Parsing CSV...');
		const { headers, rows } = parseCSV(content);
		console.log(`   Found ${headers.length} columns and ${rows.length} data rows`);
		
		if (rows.length === 0) {
			console.error('❌ No data rows found in CSV file');
			process.exit(1);
		}
		
		// Connect to MongoDB
		console.log('\n🔗 Connecting to MongoDB...');
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		console.log('✅ Connected to database:', DB_NAME);
		
		// Import orders
		console.log('\n📦 Importing orders...');
		let imported = 0;
		let skipped = 0;
		let errors = 0;
		const productionPlans = [];
		
		for (let i = 0; i < rows.length; i++) {
			const csvRow = rows[i];
			try {
				const { order, productionAssignments } = mapCSVToOrder(csvRow);
				
				// Validate required fields
				if (!order['Zleceniobiorca'] || !order['Numer zlecenia']) {
					console.log(`   ⚠️  Row ${i + 2}: Skipping - missing required fields (Zleceniobiorca or Numer zlecenia)`);
					skipped++;
					continue;
				}
				
				// Check if order already exists
				const existing = await db.collection('zamowienia').findOne({ 'data.Numer zlecenia': order['Numer zlecenia'] });
				if (existing) {
					console.log(`   ⚠️  Row ${i + 2}: Skipping - order "${order['Numer zlecenia']}" already exists`);
					skipped++;
					continue;
				}
				
				// Insert order
				const result = await db.collection('zamowienia').insertOne({
					data: order,
					createdAt: new Date()
				});
				
				// Store production assignments for later
				if (Object.keys(productionAssignments).length > 0) {
					Object.entries(productionAssignments).forEach(([kind, destination]) => {
						productionPlans.push({
							orderId: result.insertedId.toString(),
							numerZlecenia: order['Numer zlecenia'],
							destination: destination,
							kind: kind,
							createdAt: new Date(),
							updatedAt: new Date()
						});
					});
				}
				
				imported++;
				if (imported % 10 === 0) {
					process.stdout.write(`   Imported ${imported} orders...\r`);
				}
			} catch (err) {
				console.error(`   ❌ Row ${i + 2}: Error - ${err.message}`);
				errors++;
			}
		}
		
		console.log(`\n✅ Imported ${imported} orders`);
		if (skipped > 0) console.log(`   ⚠️  Skipped ${skipped} orders (duplicates or missing data)`);
		if (errors > 0) console.log(`   ❌ Errors: ${errors}`);
		
		// Import production plans
		if (productionPlans.length > 0) {
			console.log(`\n📋 Importing ${productionPlans.length} production plan assignments...`);
			let planImported = 0;
			let planSkipped = 0;
			
			for (const plan of productionPlans) {
				try {
					// Check if assignment already exists
					const existing = await db.collection('plan_produkcji').findOne({
						orderId: plan.orderId,
						kind: plan.kind
					});
					
					if (existing) {
						planSkipped++;
						continue;
					}
					
					await db.collection('plan_produkcji').insertOne(plan);
					planImported++;
				} catch (err) {
					if (err.code === 11000) { // Duplicate key error
						planSkipped++;
					} else {
						console.error(`   ❌ Error importing production plan: ${err.message}`);
					}
				}
			}
			
			console.log(`✅ Imported ${planImported} production plan assignments`);
			if (planSkipped > 0) console.log(`   ⚠️  Skipped ${planSkipped} assignments (duplicates)`);
		}
		
		// Summary
		console.log('\n📊 Summary:');
		const totalOrders = await db.collection('zamowienia').countDocuments();
		const totalPlans = await db.collection('plan_produkcji').countDocuments();
		console.log(`   Total orders in database: ${totalOrders}`);
		console.log(`   Total production plans: ${totalPlans}`);
		
		console.log('\n✅ CSV import completed successfully!');
		
	} catch (err) {
		console.error('❌ Error importing CSV:', err.message);
		
		if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
			console.error('\n   Cannot connect to MongoDB. Please:');
			console.error('   1. Make sure MongoDB is installed and running');
			console.error('   2. Check your MONGODB_URI in .env file');
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

// Run the import
importCSV();

