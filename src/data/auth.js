import { request } from '../api/local.js'

const LEGACY_BINDERS_KEY = 'tcg-classeurs'
const MIGRATION_COMPLETE_KEY = 'tcg-classeurs-migrated'

export async function getCurrentUser() {
  return (await request('/auth/me')).user
}

export async function login(username, password) {
  return (await request('/auth/login', {
    method: 'POST',
    body: { username, password },
  })).user
}

export async function register(username, password) {
  return (await request('/auth/register', {
    method: 'POST',
    body: { username, password },
  })).user
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' })
}

export async function migrateLegacyClasseurs() {
  if (localStorage.getItem(MIGRATION_COMPLETE_KEY)) return

  const savedBinders = localStorage.getItem(LEGACY_BINDERS_KEY)
  if (savedBinders) {
    const binders = JSON.parse(savedBinders)
    if (Array.isArray(binders) && binders.length) {
      await request('/binders/import', {
        method: 'POST',
        body: { binders },
      })
    }
    localStorage.removeItem(LEGACY_BINDERS_KEY)
  }

  localStorage.setItem(MIGRATION_COMPLETE_KEY, 'true')
}