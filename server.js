// Load environment variables from .env file (for local development)
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;

// MongoDB connection configuration
// Railway automatically sets MONGO_URL, so check that first, then MONGODB_URI
const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// Session management (in-memory for simplicity)
const sessions = new Map(); // sessionToken -> { username, expires }
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Initialize MongoDB client
let client;
let db;

async function connectToDatabase() {
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		db = client.db(DB_NAME);
		console.log('✅ Connected to MongoDB database:', DB_NAME);
		
		// Create indexes
		await db.collection('users').createIndex({ username: 1 }, { unique: true });
		await db.collection('zamowienia').createIndex({ 'data.Numer zlecenia': 1 });
		await db.collection('plan_produkcji').createIndex({ orderId: 1, kind: 1 }, { unique: true });
		await db.collection('plan_produkcji').createIndex({ kind: 1 });
		await db.collection('zamowienia_archiwum').createIndex({ archivedAt: 1 });
		
		console.log('✅ Database indexes created');
	} catch (err) {
		console.error('❌ MongoDB connection error:', err.message);
		process.exit(1);
	}
}

// Check connection on startup
connectToDatabase();

// Password hashing utilities
function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
	return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
	const [salt, hash] = storedHash.split(':');
	const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
	return hash === verifyHash;
}

// Session management
function generateSessionToken() {
	return crypto.randomBytes(32).toString('hex');
}

function createSession(username) {
	const token = generateSessionToken();
	const expires = Date.now() + SESSION_DURATION;
	sessions.set(token, { username, expires });
	// Cleanup expired sessions periodically
	if (sessions.size > 1000) {
		cleanupExpiredSessions();
	}
	return { token, expires };
}

function getSession(token) {
	if (!token) return null;
	const session = sessions.get(token);
	if (!session) return null;
	if (Date.now() > session.expires) {
		sessions.delete(token);
		return null;
	}
	return session;
}

function deleteSession(token) {
	if (token) {
		sessions.delete(token);
	}
}

function cleanupExpiredSessions() {
	const now = Date.now();
	for (const [token, session] of sessions.entries()) {
		if (now > session.expires) {
			sessions.delete(token);
		}
	}
}

// Initialize default admin user if no users exist
async function initializeDefaultUser() {
	try {
		const usersCount = await db.collection('users').countDocuments();
		if (usersCount === 0) {
			const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin1234';
			const hashedPassword = hashPassword(defaultPassword);
			await db.collection('users').insertOne({
				username: 'admin',
				password: hashedPassword,
				createdAt: new Date(),
				lastActivity: null
			});
			console.log('✅ Created default admin user');
			console.log('   Username: admin');
			console.log('   Password: ' + defaultPassword);
			console.log('   ⚠️  Please change the default password after first login!');
		}
	} catch (err) {
		console.error('Error initializing default user:', err);
	}
}

// Authentication middleware
function requireAuth(req, res, callback) {
	const cookies = parseCookies(req.headers.cookie || '');
	const sessionToken = cookies.sessionToken;
	const session = getSession(sessionToken);

	if (!session) {
		// Redirect to login
		res.writeHead(302, { 'Location': '/login' });
		res.end();
		return;
	}

	// Continue with authenticated request
	callback();
}

function parseCookies(cookieHeader) {
	const cookies = {};
	if (cookieHeader) {
		cookieHeader.split(';').forEach(cookie => {
			const [name, value] = cookie.trim().split('=');
			if (name && value) {
				cookies[name] = decodeURIComponent(value);
			}
		});
	}
	return cookies;
}

function serveFile(res, filePath, contentType) {
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': contentType });
		res.end(data);
	});
}

const server = http.createServer((req, res) => {
	const parsed = url.parse(req.url, true);

	// Healthcheck (public)
	if (parsed.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ ok: true }));
		return;
	}

	// Login page (public)
	if (parsed.pathname === '/login' || parsed.pathname === '/login/') {
		return serveFile(res, path.join(__dirname, 'login.html'), 'text/html; charset=utf-8');
	}

	// Login API (public)
	if (parsed.pathname === '/api/login' && req.method === 'POST') {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				const payload = body ? JSON.parse(body) : {};
				const { username, password } = payload;

				if (!username || !password) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nazwa użytkownika i hasło są wymagane' }));
					return;
				}

				if (password.length < 8) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Hasło musi mieć co najmniej 8 znaków' }));
					return;
				}

				const user = await db.collection('users').findOne({ username: username.trim() });

				if (!user || !verifyPassword(password, user.password)) {
					res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowa nazwa użytkownika lub hasło' }));
					return;
				}

				// Create session
				const { token, expires } = createSession(username);
				const cookieOptions = [
					`sessionToken=${token}`,
					`Path=/`,
					`HttpOnly`,
					`SameSite=Strict`,
					`Max-Age=${SESSION_DURATION / 1000}`
				];

				res.writeHead(200, {
					'Content-Type': 'application/json; charset=utf-8',
					'Set-Cookie': cookieOptions.join('; ')
				});
				res.end(JSON.stringify({ ok: true, username }));
			} catch (e) {
				console.error('login error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd logowania' }));
			}
		});
		return;
	}

	// Logout API
	if (parsed.pathname === '/api/logout' && req.method === 'POST') {
		const cookies = parseCookies(req.headers.cookie || '');
		const sessionToken = cookies.sessionToken;
		deleteSession(sessionToken);

		res.writeHead(200, {
			'Content-Type': 'application/json; charset=utf-8',
			'Set-Cookie': 'sessionToken=; Path=/; Max-Age=0'
		});
		res.end(JSON.stringify({ ok: true }));
		return;
	}

	// Check authentication for all other routes
	const cookies = parseCookies(req.headers.cookie || '');
	const sessionToken = cookies.sessionToken;
	const session = getSession(sessionToken);

	if (!session) {
		// Redirect to login for HTML pages
		if (parsed.pathname.endsWith('.html') || parsed.pathname === '/' || parsed.pathname.match(/^\/(plan|karta|archiwum|nowe-zamowienie)/)) {
			res.writeHead(302, { 'Location': '/login' });
			res.end();
			return;
		}
		// Return 401 for API requests
		res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
		return;
	}

	// Protected routes below
	if (parsed.pathname === '/') {
		return serveFile(res, path.join(__dirname, 'zamowienia.html'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/admin' || parsed.pathname === '/admin/') {
		return serveFile(res, path.join(__dirname, 'admin.html'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/plan' || parsed.pathname === '/plan/') {
		return serveFile(res, path.join(__dirname, 'plan_produkcji.htm'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/karta' || parsed.pathname === '/karta/') {
		return serveFile(res, path.join(__dirname, 'karta-wyrobu.html'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/karta-wyrobu' || parsed.pathname === '/karta-wyrobu/') {
		return serveFile(res, path.join(__dirname, 'karta-wyrobu.html'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/archiwum' || parsed.pathname === '/archiwum/') {
		return serveFile(res, path.join(__dirname, 'archiwum.html'), 'text/html; charset=utf-8');
	}
	if (parsed.pathname === '/nowe-zamowienie' || parsed.pathname === '/nowe-zamowienie/') {
		return serveFile(res, path.join(__dirname, 'nowe-zamowienie.html'), 'text/html; charset=utf-8');
	}

	// Get user preferences (requires authentication)
	if (parsed.pathname === '/api/user/preferences' && req.method === 'GET') {
		(async () => {
			try {
				const cookies = parseCookies(req.headers.cookie || '');
				const sessionToken = cookies.sessionToken;
				const session = getSession(sessionToken);
				
				if (!session) {
					res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
					return;
				}
				
				const user = await db.collection('users').findOne({ username: session.username });
				if (!user) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'User not found' }));
					return;
				}
				
				const preferences = user.preferences || {};
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, preferences }));
			} catch (e) {
				console.error('get preferences error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd pobierania preferencji' }));
			}
		})();
		return;
	}

	// Save user preferences (requires authentication)
	if (parsed.pathname === '/api/user/preferences' && req.method === 'POST') {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				const cookies = parseCookies(req.headers.cookie || '');
				const sessionToken = cookies.sessionToken;
				const session = getSession(sessionToken);
				
				if (!session) {
					res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
					return;
				}
				
				const payload = body ? JSON.parse(body) : {};
				const preferences = payload.preferences || {};
				
				await db.collection('users').updateOne(
					{ username: session.username },
					{ $set: { preferences: preferences } }
				);
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true }));
			} catch (e) {
				console.error('save preferences error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd zapisywania preferencji' }));
			}
		});
		return;
	}

	// Get users list (requires authentication)
	if (parsed.pathname === '/api/users' && req.method === 'GET') {
		(async () => {
			try {
				const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
				const formattedUsers = users.map(u => ({
					id: u._id.toString(),
					username: u.username,
					createdAt: u.createdAt ? u.createdAt.toISOString() : null,
					lastActivity: u.lastActivity ? u.lastActivity.toISOString() : (u.createdAt ? u.createdAt.toISOString() : null)
				}));
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, users: formattedUsers }));
			} catch (e) {
				console.error('get users error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd pobierania użytkowników' }));
			}
		})();
		return;
	}

	// Create new order
	if (parsed.pathname === '/api/zamowienia' && req.method === 'POST') {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				const payload = body ? JSON.parse(body) : {};
				
				// Validate required fields
				if (!payload['Zleceniobiorca'] || !payload['Numer zlecenia']) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Zleceniobiorca i Numer zlecenia są wymagane' }));
					return;
				}

				// Check if order number already exists
				const existing = await db.collection('zamowienia').findOne({ 'data.Numer zlecenia': payload['Numer zlecenia'] });
				if (existing) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Zamówienie z tym numerem zlecenia już istnieje' }));
					return;
				}

				const result = await db.collection('zamowienia').insertOne({
					data: payload,
					createdAt: new Date()
				});
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, id: result.insertedId.toString() }));
			} catch (e) {
				console.error('create order error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd tworzenia zamówienia: ' + e.message }));
			}
		});
		return;
	}

	// Headers from database
	if (parsed.pathname === '/api/zamowienia/headers') {
		(async () => {
			try {
				const doc = await db.collection('zamowienia').findOne({});
				const headers = doc && doc.data ? Object.keys(doc.data).filter(k => k !== '_id') : [];
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ headers }));
			} catch (e) {
				console.error('headers error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch headers' }));
			}
		})();
		return;
	}

	// List data
	if (parsed.pathname === '/api/zamowienia' && req.method === 'GET') {
		(async () => {
			const page = Math.max(1, parseInt(parsed.query.page || '1', 10));
			const pageSize = Math.min(200, Math.max(1, parseInt(parsed.query.pageSize || '100', 10)));
			const skip = (page - 1) * pageSize;
			try {
				const items = await db.collection('zamowienia')
					.find({})
					.sort({ _id: -1 })
					.skip(skip)
					.limit(pageSize)
					.toArray();
				
				const formattedItems = items.map(item => ({
					...item.data,
					_id: item._id.toString()
				}));
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ page, pageSize, items: formattedItems }));
			} catch (e) {
				console.error('list error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch data' }));
			}
		})();
		return;
	}

	// Archive: headers
	if (parsed.pathname === '/api/archiwum/headers') {
		(async () => {
			try {
				const doc = await db.collection('zamowienia_archiwum').findOne({});
				if (doc && doc.data) {
					const headers = Object.keys(doc.data).filter(k => k !== '_id' && k !== 'archivedAt');
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ headers }));
				} else {
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ headers: [] }));
				}
			} catch (e) {
				console.error('arch headers error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch headers from archive' }));
			}
		})();
		return;
	}

	// Archive: list
	if (parsed.pathname === '/api/archiwum' && req.method === 'GET') {
		(async () => {
			const page = Math.max(1, parseInt(parsed.query.page || '1', 10));
			const pageSize = Math.min(200, Math.max(1, parseInt(parsed.query.pageSize || '100', 10)));
			const skip = (page - 1) * pageSize;
			try {
				const items = await db.collection('zamowienia_archiwum')
					.find({})
					.sort({ _id: -1 })
					.skip(skip)
					.limit(pageSize)
					.toArray();
				
				const formattedItems = items.map(item => ({
					...item.data,
					_id: item._id.toString()
				}));
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ page, pageSize, items: formattedItems }));
			} catch (e) {
				console.error('arch list error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch archive' }));
			}
		})();
		return;
	}

	// Archive: restore to active
	if (parsed.pathname.endsWith('/restore') && parsed.pathname.startsWith('/api/archiwum/') && req.method === 'POST') {
		(async () => {
			const id = parsed.pathname.split('/')[3]; // /api/archiwum/:id/restore
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const doc = await db.collection('zamowienia_archiwum').findOne({ _id: new ObjectId(id) });
				if (!doc) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nie znaleziono w archiwum' }));
					return;
				}
				
				const data = { ...doc.data };
				delete data.archivedAt;
				
				await db.collection('zamowienia').insertOne({
					data: data,
					createdAt: doc.createdAt || new Date()
				});
				await db.collection('zamowienia_archiwum').deleteOne({ _id: new ObjectId(id) });
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, restoredId: id }));
			} catch (e) {
				console.error('restore error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd przywracania' }));
			}
		})();
		return;
	}

	// Plan produkcji: headers
	if (parsed.pathname === '/api/plan/headers' && req.method === 'GET') {
		(async () => {
			try {
				const doc = await db.collection('plan_produkcji').findOne({});
				if (doc) {
					const headers = Object.keys(doc).filter(k => k !== '_id' && k !== 'id');
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ headers }));
				} else {
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ headers: ['orderId', 'numerZlecenia', 'destination', 'kind', 'createdAt', 'updatedAt'] }));
				}
			} catch (e) {
				console.error('plan headers error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch plan headers' }));
			}
		})();
		return;
	}

	// Plan produkcji: list
	if (parsed.pathname === '/api/plan' && req.method === 'GET') {
		(async () => {
			const page = Math.max(1, parseInt(parsed.query.page || '1', 10));
			const pageSize = Math.min(200, Math.max(1, parseInt(parsed.query.pageSize || '100', 10)));
			const skip = (page - 1) * pageSize;
			try {
				const items = await db.collection('plan_produkcji')
					.find({})
					.sort({ _id: -1 })
					.skip(skip)
					.limit(pageSize)
					.toArray();
				
				const formattedItems = items.map(item => ({
					...item,
					_id: item._id.toString(),
					id: item._id.toString(),
					createdAt: item.createdAt ? item.createdAt.toISOString() : null,
					updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null
				}));
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ page, pageSize, items: formattedItems }));
			} catch (e) {
				console.error('plan list error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Failed to fetch plan data' }));
			}
		})();
		return;
	}

	// Plan produkcji: assign destination for order (upsert/delete)
	if (parsed.pathname === '/api/plan/assign' && req.method === 'POST') {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				const payload = body ? JSON.parse(body) : {};
				const orderId = payload.orderId;
				const numerZlecenia = (payload.numerZlecenia || '').toString();
				const destination = (payload.destination || '').toString();
				const kind = (payload.kind || '').toString(); // 'Wytłaczarka' | 'Drukarnia' | 'Automaty'

				if (!orderId || !kind) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'orderId and kind required' }));
					return;
				}

				// If destination is empty → delete assignment for this kind
				if (!destination) {
					await db.collection('plan_produkcji').deleteOne({ orderId, kind });
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, deleted: true }));
					return;
				}

				const now = new Date();
				// Check if record exists
				const existing = await db.collection('plan_produkcji').findOne({ orderId, kind });
				const createdAt = existing ? existing.createdAt : now;
				
				// MongoDB upsert
				await db.collection('plan_produkcji').updateOne(
					{ orderId, kind },
					{
						$set: {
							numerZlecenia,
							destination,
							updatedAt: now
						},
						$setOnInsert: {
							createdAt: createdAt
						}
					},
					{ upsert: true }
				);
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true }));
			} catch (e) {
				console.error('plan assign error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
			}
		});
		return;
	}

	// Plan produkcji: delete one
	if (parsed.pathname.startsWith('/api/plan/') && req.method === 'DELETE') {
		(async () => {
			const id = parsed.pathname.split('/').pop();
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const result = await db.collection('plan_produkcji').deleteOne({ _id: new ObjectId(id) });
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, deleted: result.deletedCount > 0 }));
			} catch (e) {
				console.error('plan delete error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Nie udało się usunąć przypisania.' }));
			}
		})();
		return;
	}

	// Plan produkcji: update one
	if (parsed.pathname.startsWith('/api/plan/') && (req.method === 'PATCH' || req.method === 'PUT')) {
		const id = parsed.pathname.split('/').pop();
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const payload = body ? JSON.parse(body) : {};
				if ('_id' in payload) delete payload._id;
				if ('id' in payload) delete payload.id;

				const fields = Object.keys(payload);
				if (fields.length === 0) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'No fields to update' }));
					return;
				}

				payload.updatedAt = new Date();
				const result = await db.collection('plan_produkcji').updateOne(
					{ _id: new ObjectId(id) },
					{ $set: payload }
				);
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, matched: result.matchedCount, modified: result.modifiedCount }));
			} catch (e) {
				console.error('plan update error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Nie udało się zapisać zmian planu.' }));
			}
		});
		return;
	}

	// Update one doc
	if (parsed.pathname.startsWith('/api/zamowienia/') && (req.method === 'PATCH' || req.method === 'PUT')) {
		const id = parsed.pathname.split('/').pop();
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const payload = body ? JSON.parse(body) : {};
				if ('_id' in payload) delete payload._id;

				// Get existing data
				const doc = await db.collection('zamowienia').findOne({ _id: new ObjectId(id) });
				if (!doc) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nie znaleziono zamówienia' }));
					return;
				}

				// Merge with existing data
				const updatedData = { ...doc.data, ...payload };

				// Update in database
				const result = await db.collection('zamowienia').updateOne(
					{ _id: new ObjectId(id) },
					{ $set: { data: updatedData } }
				);
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, matched: result.matchedCount, modified: result.modifiedCount }));
			} catch (e) {
				console.error('update error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Nie udało się zapisać zmian.' }));
			}
		});
		return;
	}

	// Get one doc
	if (parsed.pathname.startsWith('/api/zamowienia/') && req.method === 'GET') {
		(async () => {
			const id = parsed.pathname.split('/').pop();
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const doc = await db.collection('zamowienia').findOne({ _id: new ObjectId(id) });
				if (!doc) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ error: 'Nie znaleziono zamówienia' }));
					return;
				}
				
				const out = { ...doc.data, _id: doc._id.toString() };
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify(out));
			} catch (e) {
				console.error('get one error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ error: 'Błąd pobierania zamówienia' }));
			}
		})();
		return;
	}

	// Archive one doc: move from active to archive collection
	if (parsed.pathname.endsWith('/archive') && parsed.pathname.startsWith('/api/zamowienia/') && req.method === 'POST') {
		(async () => {
			const id = parsed.pathname.split('/')[3]; // /api/zamowienia/:id/archive
			try {
				if (!ObjectId.isValid(id)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator' }));
					return;
				}
				
				const doc = await db.collection('zamowienia').findOne({ _id: new ObjectId(id) });
				if (!doc) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nie znaleziono zamówienia' }));
					return;
				}
				
				const data = { ...doc.data };
				const archivedAt = new Date();
				data.archivedAt = archivedAt.toISOString();
				
				await db.collection('zamowienia_archiwum').insertOne({
					data: data,
					archivedAt: archivedAt,
					createdAt: doc.createdAt || new Date()
				});
				await db.collection('zamowienia').deleteOne({ _id: new ObjectId(id) });
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, archivedId: id }));
			} catch (e) {
				console.error('archive error:', e);
				res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd archiwizacji' }));
			}
		})();
		return;
	}

	// Static files
	const filePath = path.join(__dirname, parsed.pathname);
	try {
		if (filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath).toLowerCase();
			const map = {
				'.css': 'text/css; charset=utf-8',
				'.js': 'application/javascript; charset=utf-8',
				'.html': 'text/html; charset=utf-8'
			};
			return serveFile(res, filePath, map[ext] || 'application/octet-stream');
		}
	} catch {}

	res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
	res.end('Not found');
});

server.on('error', (err) => {
	console.error('HTTP server error:', err && err.stack ? err.stack : err);
});

process.on('uncaughtException', (err) => {
	console.error('Uncaught exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
	console.error('Unhandled rejection:', reason);
});

// Graceful shutdown
process.on('SIGINT', async () => {
	console.log('\nShutting down gracefully...');
	if (client) {
		await client.close();
	}
	process.exit(0);
});

server.listen(PORT, '0.0.0.0', async () => {
	console.log(`Server running at http://localhost:${PORT}`);
	// Wait for database connection before initializing default user
	if (db) {
		await initializeDefaultUser();
	} else {
		// Retry after a short delay if db is not ready
		setTimeout(async () => {
			if (db) await initializeDefaultUser();
		}, 1000);
	}
});
