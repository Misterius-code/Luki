// Load environment variables from .env file (for local development)
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

// Use PORT from environment variable, default to 3000
const PORT = parseInt(process.env.PORT || '3000', 10);

// MongoDB connection configuration
// Check if Local mode is enabled (for local development)
const isLocal = process.env.Local === 'True' || process.env.Local === 'true';

// Support both MONGODB_URI and MONGO_URL (common in different deployment platforms)
let MONGODB_URI;
if (isLocal) {
	// Force local database when Local=True
	MONGODB_URI = 'mongodb://localhost:27017';
	console.log('🔧 Local mode enabled - using local MongoDB');
} else {
	MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
}

const DB_NAME = process.env.DB_NAME || 'syn_prezesa';

// Check if connection string contains unresolved template variables
if (MONGODB_URI.includes('${{') || MONGODB_URI.includes('${')) {
	console.error('❌ ERROR: MongoDB connection string contains unresolved template variables!');
	console.error('   Found:', MONGODB_URI);
	console.error('   This usually means the environment variable was not properly set.');
	console.error('   Please check your .env file or environment variables.');
	console.error('   Falling back to localhost...');
	MONGODB_URI = 'mongodb://localhost:27017';
}

// Log connection info (without exposing credentials)
const uriForLogging = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
console.log('📊 Configuration:');
console.log('   PORT:', PORT);
console.log('   MongoDB URI:', uriForLogging);
console.log('   Database:', DB_NAME);

// Session management (in-memory for simplicity)
const sessions = new Map(); // sessionToken -> { username, role, expires }
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Role definitions and permissions
const ROLES = {
	admin: {
		name: 'Admin',
		permissions: {
			viewOrders: true,
			editOrders: true,
			createOrders: true,
			archiveOrders: true,
			viewPlan: true,
			editPlan: true,
			assignToMachines: true,
			viewArchive: true,
			manageUsers: true,
			assignRoles: true,
			viewAdmin: true
		}
	},
	moderator: {
		name: 'Moderator',
		permissions: {
			viewOrders: true,
			editOrders: true,
			createOrders: true,
			archiveOrders: false,
			viewPlan: true,
			editPlan: true,
			assignToMachines: true,
			viewArchive: true,
			manageUsers: false,
			assignRoles: false,
			viewAdmin: false
		}
	},
	handlowiec: {
		name: 'Handlowiec',
		permissions: {
			viewOrders: true,
			editOrders: false,
			createOrders: true,
			archiveOrders: false,
			viewPlan: true,
			editPlan: false,
			assignToMachines: false,
			viewArchive: false,
			manageUsers: false,
			assignRoles: false,
			viewAdmin: false
		}
	},
	produkcja: {
		name: 'Produkcja',
		permissions: {
			viewOrders: false,
			editOrders: false,
			createOrders: false,
			archiveOrders: false,
			viewPlan: true,
			editPlan: false,
			assignToMachines: false,
			viewArchive: false,
			manageUsers: false,
			assignRoles: false,
			viewAdmin: false,
			checkPlan: true // Only checkboxes in plan
		}
	},
	przegladajacy: {
		name: 'Przeglądający',
		permissions: {
			viewOrders: true,
			editOrders: false,
			createOrders: false,
			archiveOrders: false,
			viewPlan: true,
			editPlan: false,
			assignToMachines: false,
			viewArchive: false,
			manageUsers: false,
			assignRoles: false,
			viewAdmin: false
		}
	},
	edytujacy: {
		name: 'Edytujący',
		permissions: {
			viewOrders: true,
			editOrders: true,
			createOrders: false,
			archiveOrders: false,
			viewPlan: true,
			editPlan: false,
			assignToMachines: false,
			viewArchive: false,
			manageUsers: false,
			assignRoles: false,
			viewAdmin: false
		}
	}
};

// Helper function to get user role from database
async function getUserRole(username) {
	try {
		const user = await db.collection('users').findOne({ username });
		return user?.role || 'przegladajacy'; // Default role
	} catch (err) {
		console.error('Error getting user role:', err);
		return 'przegladajacy';
	}
}

// Helper function to check if user has permission
function hasPermission(role, permission) {
	if (!role || !ROLES[role]) {
		return false;
	}
	return ROLES[role].permissions[permission] === true;
}

// Helper function to require specific permission
function requirePermission(permission) {
	return async (req, res, callback) => {
		const cookies = parseCookies(req.headers.cookie || '');
		const sessionToken = cookies.sessionToken;
		const session = getSession(sessionToken);
		
		if (!session) {
			res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
			return;
		}
		
		const userRole = session.role || await getUserRole(session.username);
		if (!hasPermission(userRole, permission)) {
			res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ ok: false, error: 'Forbidden - insufficient permissions' }));
			return;
		}
		
		callback();
	};
}

// Initialize MongoDB client
let client;
let db;

async function connectToDatabase() {
	try {
		if (client) {
			await client.close();
		}
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		db = client.db(DB_NAME);
		isDbConnected = true;
		console.log('✅ Connected to MongoDB database:', DB_NAME);
		
		// Create indexes
		await db.collection('users').createIndex({ username: 1 }, { unique: true });
		await db.collection('zamowienia').createIndex({ 'data.Numer zlecenia': 1 });
		await db.collection('plan_produkcji').createIndex({ orderId: 1, kind: 1 }, { unique: true });
		await db.collection('plan_produkcji').createIndex({ kind: 1 });
		await db.collection('zamowienia_archiwum').createIndex({ archivedAt: 1 });
		
		console.log('✅ Database indexes created');
		return true;
	} catch (err) {
		isDbConnected = false;
		db = null;
		console.error('❌ MongoDB connection error:', err.message);
		// Don't exit immediately - allow server to start and show error on requests
		console.error('⚠️  Server will start but database operations will fail until connection is established');
		return false;
	}
}

// Database connection state
let isDbConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 10;
const RETRY_DELAY = 5000; // 5 seconds

// Retry connection function
async function connectToDatabaseWithRetry() {
	while (connectionRetries < MAX_RETRIES && !isDbConnected) {
		try {
			await connectToDatabase();
			if (isDbConnected) {
				connectionRetries = 0; // Reset on success
				return;
			}
		} catch (err) {
			connectionRetries++;
			if (connectionRetries < MAX_RETRIES) {
				console.log(`⏳ Retrying database connection (${connectionRetries}/${MAX_RETRIES})...`);
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
			} else {
				console.error('❌ Max retries reached. Database connection failed.');
			}
		}
	}
}

// Helper function to ensure database is connected
function ensureDbConnected() {
	if (!db || !isDbConnected) {
		throw new Error('Database not connected. Please check MongoDB connection.');
	}
	return db;
}

// Start connection with retry
connectToDatabaseWithRetry();

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

async function createSession(username) {
	const token = generateSessionToken();
	const expires = Date.now() + SESSION_DURATION;
	const role = await getUserRole(username);
	sessions.set(token, { username, role, expires });
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
			
			// Default column order for new users (readable, logical order)
			const defaultColumnOrder = [
				'Wytłaczarka',
				'Drukarnia',
				'Automaty',
				'Numer zlecenia',
				'Zleceniodawca',
				'Wymiar wyrobu gotowego',
				'Nazwa wyrobu gotowego',
				'Ilość kg/szt/mb',
				'Barwnik',
				'Jonizacja',
				'Tworzywo',
				'Całkowita szerokość rękawa',
				'Zakładka boczna',
				'Grubość',
				'Rodzaj wyrobu'
			];
			
			// Set default preferences for new user
			const defaultPreferences = {
				columnVisibility: {
					order: defaultColumnOrder,
					hidden: [],
					widths: {}
				}
			};
			
			await db.collection('users').insertOne({
				username: 'admin',
				password: hashedPassword,
				role: 'admin',
				createdAt: new Date(),
				lastActivity: null,
				preferences: defaultPreferences
			});
			console.log('✅ Created default admin user');
			console.log('   Username: admin');
			console.log('   Password: ' + defaultPassword);
			console.log('   Role: admin');
			console.log('   ⚠️  Please change the default password after first login!');
		} else {
			// Update existing users without role to have default role
			await db.collection('users').updateMany(
				{ role: { $exists: false } },
				{ $set: { role: 'przegladajacy' } }
			);
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
				// Check if database is connected
				if (!db || !isDbConnected) {
					res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Baza danych nie jest dostępna. Sprawdź połączenie z MongoDB.' }));
					return;
				}

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

				// Get user role
				const userRole = user.role || 'przegladajacy';
				
				// Create session
				const { token, expires } = await createSession(username);
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
				res.end(JSON.stringify({ ok: true, username, role: userRole }));
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
		// Log authentication failure for debugging
		if (parsed.pathname.startsWith('/api/')) {
			console.log(`🔒 API ${parsed.pathname}: Unauthorized - no valid session`);
		}
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
		// Check if user has permission to view orders
		(async () => {
			const userRole = session.role || await getUserRole(session.username);
			if (!hasPermission(userRole, 'viewOrders')) {
				// Redirect to plan if user doesn't have viewOrders permission (e.g., produkcja role)
				res.writeHead(302, { 'Location': '/plan' });
				res.end();
				return;
			}
			serveFile(res, path.join(__dirname, 'zamowienia.html'), 'text/html; charset=utf-8');
		})();
		return;
	}
	if (parsed.pathname === '/admin' || parsed.pathname === '/admin/') {
		// Check admin permission
		(async () => {
			const userRole = session.role || await getUserRole(session.username);
			if (!hasPermission(userRole, 'viewAdmin')) {
				res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end('Brak uprawnień do panelu administracyjnego');
				return;
			}
			return serveFile(res, path.join(__dirname, 'admin.html'), 'text/html; charset=utf-8');
		})();
		return;
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
		// Check if user has permission to view archive
		(async () => {
			const userRole = session.role || await getUserRole(session.username);
			if (!hasPermission(userRole, 'viewArchive')) {
				// Redirect to plan if user doesn't have viewArchive permission (e.g., produkcja role)
				res.writeHead(302, { 'Location': '/plan' });
				res.end();
				return;
			}
			serveFile(res, path.join(__dirname, 'archiwum.html'), 'text/html; charset=utf-8');
		})();
		return;
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
				
				// Update user preferences (preserve existing preferences, merge new ones)
				const user = await db.collection('users').findOne({ username: session.username });
				const existingPreferences = user?.preferences || {};
				const mergedPreferences = { ...existingPreferences, ...preferences };
				
				await db.collection('users').updateOne(
					{ username: session.username },
					{ $set: { preferences: mergedPreferences } }
				);
				
				console.log(`✅ Saved preferences for user: ${session.username}`);
				
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

	// Get current user info
	if (parsed.pathname === '/api/user/me' && req.method === 'GET') {
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
				
				const userRole = user.role || 'przegladajacy';
				const roleInfo = ROLES[userRole] || ROLES.przegladajacy;
				
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ 
					ok: true, 
					username: user.username,
					role: userRole,
					roleName: roleInfo.name,
					permissions: roleInfo.permissions
				}));
			} catch (e) {
				console.error('get user info error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd pobierania informacji o użytkowniku' }));
			}
		})();
		return;
	}

	// Helper function to safely convert date to ISO string
	function toISOString(date) {
		if (!date) return null;
		if (date instanceof Date) {
			return date.toISOString();
		}
		if (typeof date === 'string') {
			// Try to parse string date
			const parsed = new Date(date);
			if (!isNaN(parsed.getTime())) {
				return parsed.toISOString();
			}
			return date; // Return as-is if can't parse
		}
		return null;
	}

	// Get users list (requires authentication)
	if (parsed.pathname === '/api/users' && req.method === 'GET') {
		(async () => {
			try {
				const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
				const formattedUsers = users.map(u => ({
					id: u._id.toString(),
					username: u.username,
					role: u.role || 'przegladajacy',
					roleName: (ROLES[u.role || 'przegladajacy'] || ROLES.przegladajacy).name,
					createdAt: toISOString(u.createdAt),
					lastActivity: toISOString(u.lastActivity) || toISOString(u.createdAt)
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

	// Create new user (requires admin permission)
	if (parsed.pathname === '/api/users' && req.method === 'POST') {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				if (!db || !isDbConnected) {
					res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Baza danych nie jest dostępna' }));
					return;
				}

				// Check admin permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'manageUsers')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do tworzenia użytkowników' }));
					return;
				}

				const payload = body ? JSON.parse(body) : {};
				const { username, password, role } = payload;

				if (!username || !password) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nazwa użytkownika i hasło są wymagane' }));
					return;
				}

				if (username.trim().length < 3) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nazwa użytkownika musi mieć co najmniej 3 znaki' }));
					return;
				}

				if (password.length < 8) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Hasło musi mieć co najmniej 8 znaków' }));
					return;
				}

				// Validate role
				const userRoleToAssign = role && ROLES[role] ? role : 'przegladajacy';

				// Check if user already exists
				const existing = await db.collection('users').findOne({ username: username.trim() });
				if (existing) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Użytkownik o tej nazwie już istnieje' }));
					return;
				}

				// Hash password and create user
				const hashedPassword = hashPassword(password);
				
				// Default column order for new users (readable, logical order)
				const defaultColumnOrder = [
					'Wytłaczarka',
					'Drukarnia',
					'Automaty',
					'Numer zlecenia',
					'Zleceniodawca',
					'Wymiar wyrobu gotowego',
					'Nazwa wyrobu gotowego',
					'Ilość kg/szt/mb',
					'Barwnik',
					'Jonizacja',
					'Tworzywo',
					'Całkowita szerokość rękawa',
					'Zakładka boczna',
					'Grubość',
					'Rodzaj wyrobu'
				];
				
				// Set default preferences for new user
				const defaultPreferences = {
					columnVisibility: {
						order: defaultColumnOrder,
						hidden: [],
						widths: {}
					}
				};
				
				const result = await db.collection('users').insertOne({
					username: username.trim(),
					password: hashedPassword,
					role: userRoleToAssign,
					createdAt: new Date(),
					lastActivity: null,
					preferences: defaultPreferences
				});

				console.log(`✅ Created new user: ${username.trim()} with role: ${userRoleToAssign}`);

				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ 
					ok: true, 
					id: result.insertedId.toString(),
					username: username.trim(),
					role: userRoleToAssign
				}));
			} catch (e) {
				console.error('create user error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd tworzenia użytkownika: ' + e.message }));
			}
		});
		return;
	}

	// Update user role (requires admin permission)
	if (parsed.pathname.startsWith('/api/users/') && parsed.pathname.endsWith('/role') && req.method === 'PATCH') {
		const userId = parsed.pathname.split('/')[3];
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				// Check admin permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'assignRoles')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do zmiany ról' }));
					return;
				}

				const payload = body ? JSON.parse(body) : {};
				const { role } = payload;

				if (!role || !ROLES[role]) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowa rola' }));
					return;
				}

				if (!ObjectId.isValid(userId)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator użytkownika' }));
					return;
				}

				const result = await db.collection('users').updateOne(
					{ _id: new ObjectId(userId) },
					{ $set: { role: role } }
				);

				if (result.matchedCount === 0) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Użytkownik nie znaleziony' }));
					return;
				}

				// Invalidate session if role changed for logged in user
				const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
				if (user && session.username === user.username) {
					// Update session role
					session.role = role;
				}

				console.log(`✅ Updated user role: ${user.username} -> ${role}`);

				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, role: role }));
			} catch (e) {
				console.error('update user role error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd aktualizacji roli: ' + e.message }));
			}
		});
		return;
	}

	// Reset user password (requires admin permission)
	if (parsed.pathname.startsWith('/api/users/') && parsed.pathname.endsWith('/reset-password') && req.method === 'POST') {
		const userId = parsed.pathname.split('/')[3];
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', async () => {
			try {
				// Check admin permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'manageUsers')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do resetowania haseł' }));
					return;
				}

				if (!ObjectId.isValid(userId)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator użytkownika' }));
					return;
				}

				const payload = body ? JSON.parse(body) : {};
				const newPassword = payload.password;

				if (!newPassword) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Hasło jest wymagane' }));
					return;
				}

				if (newPassword.length < 8) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Hasło musi mieć co najmniej 8 znaków' }));
					return;
				}

				const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
				if (!user) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Użytkownik nie znaleziony' }));
					return;
				}

				// Hash new password
				const hashedPassword = hashPassword(newPassword);
				await db.collection('users').updateOne(
					{ _id: new ObjectId(userId) },
					{ $set: { password: hashedPassword } }
				);

				// Invalidate all sessions for this user (force re-login)
				for (const [token, sess] of sessions.entries()) {
					if (sess.username === user.username) {
						sessions.delete(token);
					}
				}

				console.log(`✅ Reset password for user: ${user.username}`);

				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, message: 'Hasło zostało zresetowane' }));
			} catch (e) {
				console.error('reset password error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd resetowania hasła: ' + e.message }));
			}
		});
		return;
	}

	// Delete user (requires admin permission)
	// Match /api/users/:id but not /api/users/:id/role or /api/users/:id/reset-password
	if (parsed.pathname.startsWith('/api/users/') && req.method === 'DELETE' && 
	    !parsed.pathname.endsWith('/role') && !parsed.pathname.endsWith('/reset-password')) {
		const userId = parsed.pathname.split('/')[3];
		(async () => {
			try {
				// Check admin permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'manageUsers')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do usuwania użytkowników' }));
					return;
				}

				if (!ObjectId.isValid(userId)) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowy identyfikator użytkownika' }));
					return;
				}

				const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
				if (!user) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Użytkownik nie znaleziony' }));
					return;
				}

				// Prevent deleting yourself
				if (user.username === session.username) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Nie możesz usunąć własnego konta' }));
					return;
				}

				// Prevent deleting the last admin
				if (user.role === 'admin') {
					const adminCount = await db.collection('users').countDocuments({ role: 'admin' });
					if (adminCount <= 1) {
						res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
						res.end(JSON.stringify({ ok: false, error: 'Nie można usunąć ostatniego administratora' }));
						return;
					}
				}

				// Delete user
				const result = await db.collection('users').deleteOne({ _id: new ObjectId(userId) });

				// Invalidate all sessions for this user
				for (const [token, sess] of sessions.entries()) {
					if (sess.username === user.username) {
						sessions.delete(token);
					}
				}

				if (result.deletedCount === 0) {
					res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Użytkownik nie znaleziony' }));
					return;
				}

				console.log(`✅ Deleted user: ${user.username}`);

				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: true, message: 'Użytkownik został usunięty' }));
			} catch (e) {
				console.error('delete user error:', e);
				res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ ok: false, error: 'Błąd usuwania użytkownika: ' + e.message }));
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
				// Check permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'createOrders')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do tworzenia zamówień' }));
					return;
				}

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
				// Get all unique headers from all documents
				const allDocs = await db.collection('zamowienia').find({}).toArray();
				const headersSet = new Set();
				
				// Collect all unique keys from all documents
				allDocs.forEach(doc => {
					if (doc.data && typeof doc.data === 'object') {
						Object.keys(doc.data).forEach(key => {
							if (key !== '_id') {
								headersSet.add(key);
							}
						});
					}
				});
				
				let headers = Array.from(headersSet);
				
				// Consolidate "Parametry dodatkowe" fields
				const parametryDodatkoweFields = ['Zimny nóż', 'Taśma klejąca', 'Zrywka', 'Opaski', 'Klipsy', 'Druty'];
				const hasParametryDodatkowe = parametryDodatkoweFields.some(field => headers.includes(field));
				
				// Remove individual "Parametry dodatkowe" fields
				headers = headers.filter(h => !parametryDodatkoweFields.includes(h));
				
				// Add "Parametry dodatkowe" as a single column if any of those fields exist
				// or if "Parametry dodatkowe" already exists
				if (hasParametryDodatkowe && !headers.includes('Parametry dodatkowe')) {
					headers.push('Parametry dodatkowe');
				} else if (!hasParametryDodatkowe && !headers.includes('Parametry dodatkowe')) {
					// Always include it for new forms
					headers.push('Parametry dodatkowe');
				}
				
				// Add standard columns that should always be available
				const standardColumns = [
					'Zleceniobiorca',
					'Priorytet',
					'Numer zlecenia',
					'Zleceniodawca',
					'Nazwa wyrobu gotowego',
					'Wymiar wyrobu gotowego',
					'Ilość kg/szt/mb',
					'Wytłaczarka NR1',
					'Wytłaczarka NR2',
					'Barwnik',
					'Jonizacja',
					'Tworzywo',
					'Całkowita szerokość rękawa',
					'Zakładka boczna',
					'Grubość',
					'Rodzaj wyrobu',
					'Nawój na wałek (jaki/ile)',
					'UWAGI',
					'DRUKARNIA',
					'Szerokość',
					'Wysokość',
					'Zakładka denna',
					'Zrywka/Klapka',
					'Zgrzew',
					'Parametry dodatkowe',
					'Zrywka',
					'Perforacja',
					'Pakowanie (szt.paczek/szt.zbiorowych)',
					'Podliczone?',
					'Wytłaczarka',
					'Drukarnia',
					'Automaty'
				];
				
				// Add standard columns that are not already in headers
				standardColumns.forEach(col => {
					if (!headers.includes(col)) {
						headers.push(col);
					}
				});
				
				// Sort headers alphabetically for consistency (optional, but helpful)
				headers.sort();
				
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
				if (!db || !isDbConnected) {
					console.error('❌ API /api/zamowienia: Database not connected');
					res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ error: 'Database not connected' }));
					return;
				}
				
				const items = await db.collection('zamowienia')
					.find({})
					.sort({ _id: -1 })
					.skip(skip)
					.limit(pageSize)
					.toArray();
				
				console.log(`📊 API /api/zamowienia: Found ${items.length} items (page ${page}, pageSize ${pageSize})`);
				
				// Helper function to consolidate "Parametry dodatkowe" fields
				function consolidateParametryDodatkowe(data) {
					const parametryDodatkoweFields = ['Zimny nóż', 'Taśma klejąca', 'Zrywka', 'Opaski', 'Klipsy', 'Druty'];
					const parametryValues = [];
					
					// Collect values from individual fields
					parametryDodatkoweFields.forEach(field => {
						if (data[field]) {
							parametryValues.push(data[field]);
							delete data[field]; // Remove individual field
						}
					});
					
					// Combine into "Parametry dodatkowe" if we have values
					if (parametryValues.length > 0) {
						// If "Parametry dodatkowe" already exists, combine with existing
						if (data['Parametry dodatkowe']) {
							data['Parametry dodatkowe'] = [data['Parametry dodatkowe'], ...parametryValues].join(', ');
						} else {
							data['Parametry dodatkowe'] = parametryValues.join(', ');
						}
					}
					
					return data;
				}
				
				const formattedItems = items.map(item => {
					const data = { ...item.data };
					consolidateParametryDodatkowe(data);
					return {
						...data,
						_id: item._id.toString()
					};
				});
				
				console.log(`✅ API /api/zamowienia: Returning ${formattedItems.length} formatted items`);
				res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify({ page, pageSize, items: formattedItems }));
			} catch (e) {
				console.error('❌ API /api/zamowienia error:', e);
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
				// Get session
				const cookies = parseCookies(req.headers.cookie || '');
				const sessionToken = cookies.sessionToken;
				const session = getSession(sessionToken);
				
				if (!session) {
					res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
					return;
				}
				
				// Check permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'assignToMachines')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do przypisywania do maszyn' }));
					return;
				}

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
				// Check permission
				const userRole = session.role || await getUserRole(session.username);
				if (!hasPermission(userRole, 'editOrders')) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do edycji zamówień' }));
					return;
				}

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
				
				// Consolidate "Parametry dodatkowe" fields
				const data = { ...doc.data };
				const parametryDodatkoweFields = ['Zimny nóż', 'Taśma klejąca', 'Zrywka', 'Opaski', 'Klipsy', 'Druty'];
				const parametryValues = [];
				parametryDodatkoweFields.forEach(field => {
					if (data[field]) {
						parametryValues.push(data[field]);
						delete data[field];
					}
				});
				if (parametryValues.length > 0) {
					if (data['Parametry dodatkowe']) {
						data['Parametry dodatkowe'] = [data['Parametry dodatkowe'], ...parametryValues].join(', ');
					} else {
						data['Parametry dodatkowe'] = parametryValues.join(', ');
					}
				}
				
				const out = { ...data, _id: doc._id.toString() };
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
				// Check permission
				const userRole = session.role || await getUserRole(session.username);
				// Allow produkcja role to archive from plan production (checkPlan permission)
				const canArchive = hasPermission(userRole, 'archiveOrders') || 
				                   (hasPermission(userRole, 'checkPlan') && userRole === 'produkcja');
				if (!canArchive) {
					res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: 'Brak uprawnień do archiwizacji zamówień' }));
					return;
				}

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

