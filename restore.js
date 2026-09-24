// ODTWORZENIE BAZY Z KOPII ZAPASOWEJ
// Uruchomienie: node restore.js backup/2026-09-23_18-45
//
// UWAGA: skrypt USUWA obecna zawartosc kolekcji i wstawia dane z kopii.
// Dlatego najpierw trzeba wpisac slowo TAK, zeby potwierdzic.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { MongoClient } = require('mongodb');

let EJSON;
try {
	EJSON = require('bson').EJSON;
} catch (e) {
	console.error('BLAD: brak biblioteki "bson". Uruchom: npm install bson');
	process.exit(1);
}

const isLocal = process.env.Local === 'True' || process.env.Local === 'true';
const MONGODB_URI = isLocal ? 'mongodb://localhost:27017' : (process.env.MONGODB_URI || 'mongodb://localhost:27017');
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

async function main() {
	const folder = process.argv[2];
	if (!folder) {
		console.error('Podaj folder z kopia, np.:');
		console.error('   node restore.js backup/2026-09-23_18-45');
		process.exit(1);
	}

	const src = path.isAbsolute(folder) ? folder : path.join(__dirname, folder);
	if (!fs.existsSync(src)) {
		console.error(`Nie znaleziono folderu: ${src}`);
		process.exit(1);
	}

	const files = fs.readdirSync(src).filter((f) => f.endsWith('.json') && f !== '_info.json');
	if (files.length === 0) {
		console.error('W tym folderze nie ma plikow z danymi.');
		process.exit(1);
	}

	console.log(`Odtwarzam baze "${DB_NAME}" z kopii: ${src}`);
	console.log('Kolekcje w kopii: ' + files.map((f) => f.replace('.json', '')).join(', '));
	console.log('');
	console.log('UWAGA! Obecne dane w tych kolekcjach zostana USUNIETE i zastapione danymi z kopii.');

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question('Jesli chcesz kontynuowac, wpisz TAK: ');
	rl.close();

	if (answer.trim().toUpperCase() !== 'TAK') {
		console.log('Przerwane - nic nie zmieniono.');
		return;
	}

	const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
	try {
		await client.connect();
		const db = client.db(DB_NAME);

		for (const file of files) {
			const name = file.replace('.json', '');
			const docs = EJSON.parse(fs.readFileSync(path.join(src, file), 'utf8'));

			await db.collection(name).deleteMany({});
			if (docs.length > 0) {
				await db.collection(name).insertMany(docs);
			}
			console.log(`   OK  ${name}: wczytano ${docs.length} dokumentow`);
		}

		console.log('');
		console.log('GOTOWE. Baza zostala odtworzona z kopii zapasowej.');
	} finally {
		await client.close();
	}
}

main().catch((err) => {
	console.error('');
	console.error('BLAD podczas odtwarzania: ' + err.message);
	process.exitCode = 1;
});
