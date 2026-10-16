import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { chmodSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const root = dirname(fileURLToPath(import.meta.url))
const dataDirectory = resolve(process.env.DATA_DIR || join(root, 'data'))
const userDataDirectory = join(dataDirectory, 'users')
const distDirectory = join(root, 'dist')
const sessions = new Map()
const userDatabases = new Map()
const sessionCookie = 'tcg_session'
const sessionLifetime = 60 * 60 * 24 * 7

mkdirSync(userDataDirectory, { recursive: true, mode: 0o700 })
chmodSync(dataDirectory, 0o700)
chmodSync(userDataDirectory, 0o700)

const accounts = new DatabaseSync(join(dataDirectory, 'accounts.sqlite'))
accounts.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_salt BLOB NOT NULL,
    password_hash BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)
chmodSync(join(dataDirectory, 'accounts.sqlite'), 0o600)

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  })
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 1024 * 1024) throw new HttpError(413, 'Requête trop volumineuse.')
  }
  try {
    return JSON.parse(body || '{}')
  } catch {
    throw new HttpError(400, 'Corps JSON invalide.')
  }
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || ''
  const entry = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

function sessionHeaders(request, token) {
  const secure = request.socket.encrypted ? '; Secure' : ''
  return {
    'set-cookie': `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetime}${secure}`
  }
}

function clearSessionCookie() {
  return { 'set-cookie': `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` }
}

function currentUser(request) {
  const token = getCookie(request, sessionCookie)
  const userId = token && sessions.get(token)
  if (!userId) return null
  return accounts.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) || null
}

function requireUser(request) {
  const user = currentUser(request)
  if (!user) throw new HttpError(401, 'Connectez-vous pour continuer.')
  return user
}

function databaseForUser(userId) {
  if (userDatabases.has(userId)) return userDatabases.get(userId)
  const filePath = join(userDataDirectory, `${userId}.sqlite`)
  const database = new DatabaseSync(filePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS binders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cards (
      binder_id TEXT NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      local_id TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      set_id TEXT NOT NULL DEFAULT '',
      set_name TEXT NOT NULL DEFAULT '',
      serie_id TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (binder_id, id)
    );
    CREATE TABLE IF NOT EXISTS collection_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_id TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      set_id TEXT NOT NULL DEFAULT '',
      set_name TEXT NOT NULL DEFAULT '',
      serie_id TEXT NOT NULL DEFAULT '',
      variants TEXT NOT NULL DEFAULT '[]',
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS collection_cards_set_idx ON collection_cards(set_id);
    CREATE TABLE IF NOT EXISTS wishlist_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      local_id TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      set_id TEXT NOT NULL DEFAULT '',
      set_name TEXT NOT NULL DEFAULT '',
      serie_id TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS wishlist_cards_set_idx ON wishlist_cards(set_id);
  `)
  const cardColumns = database.prepare('PRAGMA table_info(cards)').all()
  if (!cardColumns.some(column => column.name === 'position')) {
    database.exec(`
      ALTER TABLE cards ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE cards SET position = (
        SELECT COUNT(*) - 1 FROM cards AS earlier
        WHERE earlier.binder_id = cards.binder_id AND earlier.rowid <= cards.rowid
      );
    `)
  }
  const collectionColumns = database.prepare('PRAGMA table_info(collection_cards)').all()
  if (!collectionColumns.some(column => column.name === 'variants')) {
    database.exec(`
      ALTER TABLE collection_cards ADD COLUMN variants TEXT NOT NULL DEFAULT '[]';
      UPDATE collection_cards SET variants = '[{"id":"normal","label":"Normale","quantity":1}]';
    `)
  }
  chmodSync(filePath, 0o600)
  userDatabases.set(userId, database)
  return database
}

function userInfo(user) {
  return { id: user.id, username: user.username }
}

function binderList(database) {
  const binders = database.prepare('SELECT id, name FROM binders ORDER BY created_at, rowid').all()
  const cards = database.prepare(`
    SELECT id, name, local_id AS localId, image, set_id AS setId,
      set_name AS setName, serie_id AS serieId, position
    FROM cards WHERE binder_id = ? ORDER BY position, rowid
  `)
  return binders.map(binder => ({ ...binder, cards: cards.all(binder.id) }))
}

function cleanCard(card) {
  if (!card || typeof card.id !== 'string' || typeof card.name !== 'string') return null
  return {
    id: card.id.slice(0, 180),
    name: card.name.slice(0, 180),
    localId: String(card.localId || '').slice(0, 40),
    image: String(card.image || '').slice(0, 500),
    setId: String(card.setId || '').slice(0, 120),
    setName: String(card.setName || '').slice(0, 180),
    serieId: String(card.serieId || '').slice(0, 120)
  }
}

function cleanVariants(variants) {
  if (!Array.isArray(variants) || variants.length > 40) throw new HttpError(400, 'Liste de variantes invalide.')
  const unique = new Map()
  for (const variant of variants) {
    if (!variant || typeof variant.id !== 'string' || typeof variant.label !== 'string') {
      throw new HttpError(400, 'Variante invalide.')
    }
    const id = variant.id.trim().slice(0, 240)
    const label = variant.label.trim().slice(0, 180)
    const quantity = variant.quantity ?? 1
    if (!id || !label || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, 'Variante invalide.')
    }
    unique.set(id, { id, label, quantity })
  }
  return [...unique.values()]
}

function insertCards(database, binderId, cards) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO cards (binder_id, id, name, local_id, image, set_id, set_name, serie_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const nextPosition = database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS value FROM cards WHERE binder_id = ?')
  for (const source of cards) {
    const card = cleanCard(source)
    if (card) insert.run(binderId, card.id, card.name, card.localId, card.image, card.setId, card.setName, card.serieId, nextPosition.get(binderId).value)
  }
}

function reorderCards(database, binderId, positions) {
  if (!Array.isArray(positions)) throw new HttpError(400, 'Positions des cartes invalides.')
  const existingIds = database.prepare('SELECT id FROM cards WHERE binder_id = ?').all(binderId).map(card => card.id)
  const cardIds = new Set()
  const slots = new Set()
  for (const item of positions) {
    if (!item || typeof item.id !== 'string' || !Number.isSafeInteger(item.position) || item.position < 0 || item.position > 100000) {
      throw new HttpError(400, 'Position de carte invalide.')
    }
    if (cardIds.has(item.id) || slots.has(item.position)) throw new HttpError(400, 'Positions de cartes invalides.')
    cardIds.add(item.id)
    slots.add(item.position)
  }
  if (positions.length !== existingIds.length || existingIds.some(cardId => !cardIds.has(cardId))) {
    throw new HttpError(400, 'La liste des cartes ne correspond pas au classeur.')
  }

  const update = database.prepare('UPDATE cards SET position = ? WHERE binder_id = ? AND id = ?')
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const item of positions) update.run(item.position, binderId, item.id)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function createSession(response, request, user) {
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, user.id)
  json(response, 200, { user: userInfo(user) }, sessionHeaders(request, token))
}

async function authenticate(request, response, mode) {
  const body = await readJson(request)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const usernameKey = username.toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new HttpError(400, 'L’identifiant doit contenir de 3 à 32 lettres, chiffres, points, tirets ou soulignés.')
  }
  if (Array.from(password).length < 10 || Array.from(password).length > 128) {
    throw new HttpError(400, 'Le mot de passe doit contenir entre 10 et 128 caractères.')
  }

  if (mode === 'register') {
    const salt = randomBytes(16)
    const passwordHash = await scryptAsync(password, salt, 64)
    const user = { id: randomUUID(), username }
    try {
      accounts.prepare(`
        INSERT INTO users (id, username, username_key, password_salt, password_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, user.username, usernameKey, salt, passwordHash)
    } catch (error) {
      if (error.errcode === 2067) throw new HttpError(409, 'Cet identifiant est déjà utilisé.')
      throw error
    }
    databaseForUser(user.id)
    createSession(response, request, user)
    return
  }

  const user = accounts.prepare(`
    SELECT id, username, password_salt AS passwordSalt, password_hash AS passwordHash
    FROM users WHERE username_key = ?
  `).get(usernameKey)
  if (!user) throw new HttpError(401, 'Identifiant ou mot de passe incorrect.')
  const candidate = await scryptAsync(password, user.passwordSalt, user.passwordHash.length)
  if (!timingSafeEqual(candidate, user.passwordHash)) {
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect.')
  }
  createSession(response, request, user)
}

function importBinders(database, value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Liste de classeurs invalide.')
  database.exec('BEGIN')
  try {
    for (const source of value.slice(0, 500)) {
      if (!source || typeof source.name !== 'string') continue
      const id = typeof source.id === 'string' && source.id.length < 100 ? source.id : randomUUID()
      database.prepare('INSERT OR IGNORE INTO binders (id, name) VALUES (?, ?)').run(id, source.name.trim().slice(0, 60) || 'Mon classeur')
      if (Array.isArray(source.cards)) insertCards(database, id, source.cards.slice(0, 5000))
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function serveStatic(request, response, pathname) {
  const decoded = decodeURIComponent(pathname)
  const relativePath = normalize(decoded).replace(/^([/\\])+/, '')
  const filePath = resolve(distDirectory, relativePath || 'index.html')
  if (!filePath.startsWith(`${distDirectory}${sep}`) && filePath !== distDirectory) {
    throw new HttpError(403, 'Accès refusé.')
  }
  const target = existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distDirectory, 'index.html')
  if (!existsSync(target)) throw new HttpError(404, 'Application non construite. En développement, utilisez npm run dev.')
  const types = {
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
    '.webp': 'image/webp', '.woff2': 'font/woff2'
  }
  response.writeHead(200, {
    'content-type': types[extname(target)] || 'application/octet-stream',
    'x-content-type-options': 'nosniff'
  })
  createReadStream(target).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    const { pathname } = url

    if (!pathname.startsWith('/api/')) {
      serveStatic(request, response, pathname)
      return
    }

    if (request.method === 'POST' && pathname === '/api/auth/register') {
      await authenticate(request, response, 'register')
      return
    }
    if (request.method === 'POST' && pathname === '/api/auth/login') {
      await authenticate(request, response, 'login')
      return
    }
    if (request.method === 'GET' && pathname === '/api/auth/me') {
      const user = currentUser(request)
      json(response, 200, { user: user ? userInfo(user) : null }, user ? {} : clearSessionCookie())
      return
    }
    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      const token = getCookie(request, sessionCookie)
      if (token) sessions.delete(token)
      json(response, 200, { ok: true }, clearSessionCookie())
      return
    }

    const user = requireUser(request)
    const database = databaseForUser(user.id)

    if (request.method === 'GET' && pathname === '/api/collection') {
      const setId = url.searchParams.get('setId')
      const query = `
        SELECT id, name, local_id AS localId, image, set_id AS setId,
          set_name AS setName, serie_id AS serieId, variants
        FROM collection_cards ${setId === null ? '' : 'WHERE set_id = ?'}
        ORDER BY set_name COLLATE NOCASE, local_id COLLATE NOCASE, name COLLATE NOCASE
      `
      const rows = setId === null ? database.prepare(query).all() : database.prepare(query).all(setId)
      const cards = rows.map(card => ({ ...card, variants: JSON.parse(card.variants) }))
      json(response, 200, { cards })
      return
    }
    const ownedCardMatch = pathname.match(/^\/api\/collection\/cards\/([^/]+)$/)
    if (ownedCardMatch) {
      const cardId = decodeURIComponent(ownedCardMatch[1])
      if (request.method === 'PUT') {
        const body = await readJson(request)
        const card = cleanCard(body.card)
        if (!card || card.id !== cardId) throw new HttpError(400, 'Carte invalide.')
        const variants = cleanVariants(body.card.variants ?? [{ id: 'normal', label: 'Normale' }])
        if (!variants.length) {
          database.prepare('DELETE FROM collection_cards WHERE id = ?').run(cardId)
          json(response, 200, { ok: true })
          return
        }
        database.prepare(`
          INSERT INTO collection_cards (id, name, local_id, image, set_id, set_name, serie_id, variants)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, local_id = excluded.local_id, image = excluded.image,
            set_id = excluded.set_id, set_name = excluded.set_name, serie_id = excluded.serie_id,
            variants = excluded.variants
        `).run(card.id, card.name, card.localId, card.image, card.setId, card.setName, card.serieId, JSON.stringify(variants))
        json(response, 200, { card: { ...card, variants } })
        return
      }
      if (request.method === 'DELETE') {
        database.prepare('DELETE FROM collection_cards WHERE id = ?').run(cardId)
        json(response, 200, { ok: true })
        return
      }
    }

    if (request.method === 'GET' && pathname === '/api/wishlist') {
      const setId = url.searchParams.get('setId')
      const query = `
        SELECT id, name, local_id AS localId, image, set_id AS setId,
          set_name AS setName, serie_id AS serieId
        FROM wishlist_cards ${setId === null ? '' : 'WHERE set_id = ?'}
        ORDER BY set_name COLLATE NOCASE, local_id COLLATE NOCASE, name COLLATE NOCASE
      `
      const cards = setId === null ? database.prepare(query).all() : database.prepare(query).all(setId)
      json(response, 200, { cards })
      return
    }
    const wishlistCardMatch = pathname.match(/^\/api\/wishlist\/cards\/([^/]+)$/)
    if (wishlistCardMatch) {
      const cardId = decodeURIComponent(wishlistCardMatch[1])
      if (request.method === 'PUT') {
        const body = await readJson(request)
        const card = cleanCard(body.card)
        if (!card || card.id !== cardId) throw new HttpError(400, 'Carte invalide.')
        database.prepare(`
          INSERT INTO wishlist_cards (id, name, local_id, image, set_id, set_name, serie_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, local_id = excluded.local_id, image = excluded.image,
            set_id = excluded.set_id, set_name = excluded.set_name, serie_id = excluded.serie_id
        `).run(card.id, card.name, card.localId, card.image, card.setId, card.setName, card.serieId)
        json(response, 200, { card })
        return
      }
      if (request.method === 'DELETE') {
        database.prepare('DELETE FROM wishlist_cards WHERE id = ?').run(cardId)
        json(response, 200, { ok: true })
        return
      }
    }

    if (request.method === 'GET' && pathname === '/api/binders') {
      json(response, 200, { binders: binderList(database) })
      return
    }
    if (request.method === 'POST' && pathname === '/api/binders') {
      const body = await readJson(request)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > 60) throw new HttpError(400, 'Le nom doit contenir de 1 à 60 caractères.')
      const binder = { id: randomUUID(), name }
      database.prepare('INSERT INTO binders (id, name) VALUES (?, ?)').run(binder.id, binder.name)
      json(response, 201, { binder: { ...binder, cards: [] } })
      return
    }
    if (request.method === 'POST' && pathname === '/api/binders/import') {
      const body = await readJson(request)
      importBinders(database, body.binders)
      json(response, 200, { binders: binderList(database) })
      return
    }

    const match = pathname.match(/^\/api\/binders\/([^/]+)(?:\/cards(?:\/([^/]+))?)?$/)
    if (match) {
      const binderId = decodeURIComponent(match[1])
      const cardId = match[2] ? decodeURIComponent(match[2]) : null
      const binderExists = database.prepare('SELECT 1 FROM binders WHERE id = ?').get(binderId)
      if (!binderExists) throw new HttpError(404, 'Classeur introuvable.')
      if (request.method === 'DELETE' && !cardId) {
        database.prepare('DELETE FROM binders WHERE id = ?').run(binderId)
        json(response, 200, { ok: true })
        return
      }
      if (request.method === 'POST' && pathname.endsWith('/cards')) {
        const body = await readJson(request)
        if (!Array.isArray(body.cards)) throw new HttpError(400, 'Liste de cartes invalide.')
        insertCards(database, binderId, body.cards.slice(0, 5000))
        json(response, 200, { binders: binderList(database) })
        return
      }
      if (request.method === 'PUT' && cardId === 'order') {
        const body = await readJson(request)
        reorderCards(database, binderId, body.positions)
        json(response, 200, { binders: binderList(database) })
        return
      }
      if (request.method === 'DELETE' && cardId) {
        database.prepare('DELETE FROM cards WHERE binder_id = ? AND id = ?').run(binderId, cardId)
        json(response, 200, { ok: true })
        return
      }
    }

    throw new HttpError(404, 'Route introuvable.')
  } catch (error) {
    if (response.headersSent) {
      response.destroy()
      return
    }
    if (!(error instanceof HttpError)) console.error(error)
    json(response, error.status || 500, { error: error.status ? error.message : 'Erreur interne du serveur.' })
  }
})

const port = Number(process.env.API_PORT || process.env.PORT || 4173)
const host = process.env.HOST || '127.0.0.1'
server.listen(port, host, () => console.log(`Classeur TCG local : http://${host}:${port}`))

function shutdown() {
  server.close(() => {
    for (const database of userDatabases.values()) database.close()
    accounts.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)