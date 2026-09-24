// JEDNORAZOWA NAPRAWA POL ZAMOWIEN
// ---------------------------------------------------------------------------
// Formularz "nowe zamowienie" zapisywal czesc danych pod wlasnymi kluczami,
// przez co w tabeli powstaly zbedne kolumny (np. "Ilość", "Szerokość Automaty",
// "UWAGI Wytłaczarka"). Ten skrypt przenosi takie wartosci do ISTNIEJACYCH
// kolumn i usuwa zbedne klucze.
//
// Uruchomienie:  npm run backup   (kopia zapasowa!)
//                node napraw-pola-zamowien.js
// ---------------------------------------------------------------------------

require('dotenv').config();
const { MongoClient } = require('mongodb');

const isLocal = process.env.Local === 'True' || process.env.Local === 'true';
const MONGODB_URI = isLocal ? 'mongodb://localhost:27017' : (process.env.MONGODB_URI || 'mongodb://localhost:27017');
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// Klucz zbedny  ->  istniejaca kolumna
const FIELD_ALIASES = {
	'Ilość': 'Ilość kg/szt/mb',
	'Ilosc': 'Ilość kg/szt/mb',
	'Nawój wartość': 'Nawój na wałek (jaki/ile)',
	'Nawój na wałek': 'Nawój na wałek (jaki/ile)',
	'Pakowanie': 'Pakowanie (szt.paczek/szt.zbiorowych)',
	'Szerokość Automaty': 'Szerokość',
	'Wysokość Automaty': 'Wysokość',
	'UWAGI Wytłaczarka': 'UWAGI',
	'Perforacja typ': 'Perforacja'
};

// Klucze pomocnicze - usuwamy bez przenoszenia (ich wartosc jest juz w innym polu)
const HELPER_FIELDS = ['Ilość jednostka', 'Nawój jednostka', 'Perforacja wartość', 'Pakowanie inne'];

// Pola skladane w jedno "Parametry dodatkowe"
// UWAGA: "Zrywka" ma wlasna kolumne (sekcja "Zrywka") - nie moze byc scalane!
const PARAM_FIELDS = ['Zimny nóż', 'Taśma klejąca', 'Opaski', 'Druty'];

// Znaki inne niz ASCII psuja sie w konsoli PowerShell - zamieniamy na '?'
const safe = (s) => String(s).replace(/[^\x20-\x7E]/g, '?');
const splitList = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

function fixData(data) {
	const out = { ...data };
	let changed = false;

	// 1) Przenies wartosci z kluczy zbednych do istniejacych kolumn
	Object.entries(FIELD_ALIASES).forEach(([alias, target]) => {
		if (!(alias in out)) return;
		const val = out[alias] === null || out[alias] === undefined ? '' : String(out[alias]).trim();
		delete out[alias];
		changed = true;
		if (!val) return;
		const current = out[target] === null || out[target] === undefined ? '' : String(out[target]).trim();
		if (!current) {
			out[target] = val;
		} else if (!splitList(current).includes(val)) {
			out[target] = current + ', ' + val;
		}
	});

	// 2) Usun klucze pomocnicze
	HELPER_FIELDS.forEach((f) => {
		if (f in out) {
			delete out[f];
			changed = true;
		}
	});

	// 3) Scal "Parametry dodatkowe" w jedno pole, bez powtorzen
	const paramValues = [];
	PARAM_FIELDS.forEach((f) => {
		if (f in out) {
			paramValues.push(...splitList(out[f]));
			delete out[f];
			changed = true;
		}
	});
	if (out['Parametry dodatkowe']) {
		const merged = [...splitList(out['Parametry dodatkowe']), ...paramValues];
		const dedup = [...new Set(merged)].join(', ');
		if (dedup !== out['Parametry dodatkowe']) {
			out['Parametry dodatkowe'] = dedup;
			changed = true;
		}
	} else if (paramValues.length > 0) {
		out['Parametry dodatkowe'] = [...new Set(paramValues)].join(', ');
		changed = true;
	}

	return { out, changed };
}

(async () => {
	const client = new MongoClient(MONGODB_URI);
	try {
		await client.connect();
		const db = client.db(DB_NAME);
		const docs = await db.collection('zamowienia').find({}).toArray();
		console.log(`Sprawdzam ${docs.length} zamowien...\n`);

		let fixed = 0;
		for (const doc of docs) {
			const before = doc.data || {};
			const { out, changed } = fixData(before);
			if (!changed) continue;

			const removed = Object.keys(before).filter((k) => !(k in out));
			await db.collection('zamowienia').updateOne({ _id: doc._id }, { $set: { data: out } });
			fixed++;
			console.log(`  OK  ${safe(out['Numer zlecenia'] || doc._id)}`);
			console.log(`      usunieto ${removed.length} kluczy: ${safe(removed.join(', ')) || '-'}`);
		}

		console.log(`\nGOTOWE. Poprawiono ${fixed} z ${docs.length} zamowien.`);
	} catch (e) {
		console.error('BLAD:', e.message);
		process.exitCode = 1;
	} finally {
		await client.close();
	}
})();
