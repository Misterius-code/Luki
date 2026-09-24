// Przygotowuje plik CSV wyeksportowany z Google Sheets do importu w aplikacji Luki.
//
// Poprawia typowe bledy eksportu arkusza:
//   1) pierwsza kolumna bez wlasciwej nazwy (np. "uki.zamow")  -> "Data zamowienia"
//   2) pusta nazwa kolumny pomiedzy "Wytlaczarka" i "Automaty" -> "Drukarnia"
//   3) usuwa wiersz szablonu ("Template"), ktory nie jest zamowieniem
//
// Uzycie: node przygotuj-csv.js [zrodlo.csv] [cel.csv]
// Bez argumentow: bierze najnowszy plik .csv z folderu aplikacji i zapisuje jako import-gotowy.csv

const fs = require('fs');
const path = require('path');

function najnowszyCsv(folder) {
	const pliki = fs
		.readdirSync(folder)
		.filter((f) => f.toLowerCase().endsWith('.csv') && f !== 'import-gotowy.csv')
		.map((f) => ({ name: f, time: fs.statSync(path.join(folder, f)).mtimeMs }))
		.sort((a, b) => b.time - a.time);
	return pliki.length > 0 ? pliki[0].name : null;
}

function przygotuj(sciezkaZrodla, sciezkaCelu) {
	let tekst = fs.readFileSync(sciezkaZrodla, 'utf8');
	const raport = {};

	raport.poprawionaKolumnaDrukarnia = tekst.includes('Wytłaczarka,,Automaty');
	tekst = tekst.replace('Wytłaczarka,,Automaty', 'Wytłaczarka,Drukarnia,Automaty');

	raport.poprawionaPierwszaKolumna = /^\uFEFF?uki\.zamow,/m.test(tekst);
	tekst = tekst.replace(/^\uFEFF?uki\.zamow,/m, 'Data zamówienia,');

	const liczbaWierszyPrzed = tekst.split(/\r?\n/).filter((l) => l.trim()).length;
	const linie = tekst.split(/\r?\n/).filter((l) => !l.includes(',Template,'));
	raport.usunietyWierszSzablonu = tekst.includes(',Template,');

	fs.writeFileSync(sciezkaCelu, linie.join('\n'), 'utf8');

	raport.wierszePrzed = liczbaWierszyPrzed;
	raport.wierszePo = linie.filter((l) => l.trim()).length;
	raport.plikZrodlowy = path.basename(sciezkaZrodla);
	raport.plikGotowy = path.basename(sciezkaCelu);

	if (!/Data zamówienia|uki\.zamow/.test(linie[0])) {
		raport.ostrzezenie = 'Nie rozpoznano pierwszej kolumny - sprawdz plik recznie.';
	}
	return raport;
}

const folder = __dirname;
const zrodlo = process.argv[2] || najnowszyCsv(folder);
const cel = process.argv[3] || path.join(folder, 'import-gotowy.csv');

if (!zrodlo) {
	console.error('Nie znaleziono zadnego pliku .csv w folderze aplikacji.');
	process.exit(1);
}

const sciezkaZrodla = path.isAbsolute(zrodlo) ? zrodlo : path.join(folder, zrodlo);

if (!fs.existsSync(sciezkaZrodla)) {
	console.error('Nie znaleziono pliku: ' + sciezkaZrodla);
	process.exit(1);
}

try {
	const raport = przygotuj(sciezkaZrodla, cel);
	console.log('Przygotowano plik do importu:');
	console.log(JSON.stringify(raport, null, 1));
	console.log('');
	console.log('Teraz zaimportuj go komenda:  npm run import-csv import-gotowy.csv');
} catch (e) {
	console.error('Blad przygotowania pliku: ' + e.message);
	process.exit(1);
}
