// KOPIA ZAPASOWA BAZY DANYCH
// Tworzy kopie wszystkich kolekcji z bazy do folderu ./backup/DATA_GODZINA/
// Uruchomienie: npm run backup   (albo dwuklik na BACKUP-LUKI.bat)
//
// Kopie sa zapisywane w formacie EJSON (bezstratnie - mozna je pozniej wczytac przez restore.js)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

// Ile ostatnich kopii trzymac na dysku (starsze sa usuwane automatycznie)
const KEEP_LAST_BACKUPS = 30;

function stamp() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

function pruneOld(backupRoot) {
	try {
		const dirs = fs.readdirSync(backupRoot, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort()
			.reverse();
		const toDelete = dirs.slice(KEEP_LAST_BACKUPS);
		for (const name of toDelete) {
			fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
			console.log(`   (usunieto stara kopie: ${name})`);
		}
	} catch (e) {
		// sprzatanie nie jest krytyczne
	}
}

async function main() {
	const backupRoot = path.join(__dirname, 'backup');
	const target = path.join(backupRoot, stamp());
	fs.mkdirSync(target, { recursive: true });

	const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
	try {
		await client.connect();
		const db = client.db(DB_NAME);
		console.log(`Kopia zapasowa bazy "${DB_NAME}"`);
		console.log('');

		const collections = await db.listCollections().toArray();
		if (collections.length === 0) {
			console.log('UWAGA: baza nie ma jeszcze zadnych kolekcji - nie ma czego kopiowac.');
		}

		let totalDocs = 0;
		for (const info of collections) {
			const docs = await db.collection(info.name).find({}).toArray();
			fs.writeFileSync(
				path.join(target, `${info.name}.json`),
				EJSON.stringify(docs, null, 1),
				'utf8'
			);
			totalDocs += docs.length;
			console.log(`   OK  ${info.name}: ${docs.length} dokumentow`);
		}

		// Zapisujemy tez wersje i date - przydaje sie przy odtwarzaniu
		fs.writeFileSync(
			path.join(target, '_info.json'),
			JSON.stringify(
				{
					database: DB_NAME,
					createdAt: new Date().toISOString(),
					collections: collections.map((c) => c.name),
					totalDocuments: totalDocs
				},
				null,
				2
			),
			'utf8'
		);

		pruneOld(backupRoot);

		console.log('');
		console.log(`GOTOWE. Skopiowano ${totalDocs} dokumentow.`);
		console.log(`Kopia jest tutaj: ${target}`);
		console.log('');
		console.log('WSKAZOWKA: skopiuj folder backup na pendrive albo do chmury (OneDrive/Google Drive),');
		console.log('bo kopia na tym samym dysku nie ochroni przed awaria komputera.');
	} finally {
		await client.close();
	}
}

main().catch((err) => {
	console.error('');
	console.error('BLAD - nie udalo sie zrobic kopii zapasowej:');
	console.error('   ' + err.message);
	console.error('');
	console.error('Najczestsze przyczyny:');
	console.error('   - brak internetu (baza jest w chmurze MongoDB Atlas)');
	console.error('   - zmienione haslo do bazy w pliku .env');
	console.error('   - Twoje IP nie jest dopuszczone w Atlasie (Network Access)');
	process.exitCode = 1;
});
