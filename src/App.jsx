import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './AuthPage.jsx'
import { getCurrentUser, logout, migrateLegacyClasseurs } from './classeurs.js'
import { LangContext } from './context.js'
import { useInstall } from './hooks.js'
import Classeurs from './pages/Classeurs.jsx'
import Collection from './pages/Collection.jsx'
import Scanner from './pages/Scanner.jsx'
import Serie from './pages/Serie.jsx'
import Series from './pages/Series.jsx'
import SetPage from './pages/SetPage.jsx'
import Wishlist from './pages/Wishlist.jsx'

const LANGS = [
  ['fr', 'Français'],
  ['en', 'English'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['de', 'Deutsch'],
  ['ja', '日本語'],
]

function readPreference(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePreference(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Le stockage peut être indisponible dans certains contextes privés.
  }
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const [lang, setLang] = useState(() => readPreference('tcg-lang') || 'fr')
  const [theme, setTheme] = useState(() => readPreference('tcg-theme') || 'light')
  const [auth, setAuth] = useState({ loading: true, user: null, error: '', notice: '' })
  const [authAttempt, setAuthAttempt] = useState(0)
  const install = useInstall()
  const ctx = useMemo(() => ({ lang }), [lang])

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then(user => {
        if (active) {
          setAuth({ loading: false, user, error: '', notice: '' })
        }
      })
      .catch(error => {
        if (active) {
          setAuth({ loading: false, user: null, error: error.message, notice: '' })
        }
      })
    return () => { active = false }
  }, [authAttempt])

  useEffect(() => {
    const root = document.documentElement
    if (theme) root.dataset.theme = theme
    else delete root.dataset.theme
  }, [theme])

  const changeLang = event => {
    const nextLanguage = event.target.value
    setLang(nextLanguage)
    writePreference('tcg-lang', nextLanguage)
  }

  const toggleTheme = () => {
    const isDark = theme
      ? theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches
    const nextTheme = isDark ? 'light' : 'dark'
    setTheme(nextTheme)
    writePreference('tcg-theme', nextTheme)
  }

  const onAuthenticated = async user => {
    let notice = ''
    try {
      await migrateLegacyClasseurs()
    } catch {
      notice =
        'La migration des anciens classeurs a échoué. Les données locales n’ont pas été supprimées.'
    }
    setAuth({ loading: false, user, error: '', notice })
  }

  const signOut = async () => {
    try {
      await logout()
      setAuth({ loading: false, user: null, error: '', notice: '' })
    } catch (error) {
      setAuth(current => ({ ...current, notice: error.message }))
    }
  }

  const retryAuthentication = () => {
    setAuth({ loading: true, user: null, error: '', notice: '' })
    setAuthAttempt(attempt => attempt + 1)
  }

  if (auth.loading) {
    return <main><div className="state">Connexion au serveur local…</div></main>
  }

  if (auth.error) {
    return (
      <main>
        <div className="state" role="alert">
          <strong>Serveur local inaccessible</strong>
          {auth.error}
          <br />
          <button className="btn primary" type="button" onClick={retryAuthentication}>
            Réessayer
          </button>
        </div>
      </main>
    )
  }

  if (!auth.user) return <AuthPage onAuthenticated={onAuthenticated} />

  return (
    <LangContext.Provider value={ctx}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/" aria-label="Accueil, liste des séries">
            <span className="brand-mark" aria-hidden="true" />
            Classeur TCG
          </Link>
          <Link className="nav-link" to="/collection">Ma collection</Link>
          <Link className="nav-link" to="/souhaits">Liste de souhaits</Link>
          <Link className="nav-link" to="/scanner">Scanner</Link>
          <Link className="nav-link" to="/classeurs">Mes classeurs</Link>
          <div className="controls">
            {install && <button className="btn primary" type="button" onClick={install}>Installer</button>}
            <span className="account-name">{auth.user.username}</span>
            <label className="sr" htmlFor="lang">Langue des cartes</label>
            <select id="lang" value={lang} onChange={changeLang}>
              {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <button className="btn" type="button" onClick={toggleTheme} aria-label="Changer de thème">◐</button>
            <button className="btn" type="button" onClick={signOut}>Déconnexion</button>
          </div>
        </div>
      </header>

      <main>
        <ScrollToTop />
        {auth.notice && <p className="notice" role="status">{auth.notice}</p>}
        <Routes>
          <Route path="/" element={<Series />} />
          <Route path="/serie/:id" element={<Serie />} />
          <Route path="/set/:id" element={<SetPage />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/souhaits" element={<Wishlist />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/classeurs" element={<Classeurs />} />
          <Route path="/classeurs/:id" element={<Classeurs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer>
        Données et images : <a href="https://tcgdex.dev" target="_blank" rel="noopener noreferrer">TCGdex</a>.
        Projet non officiel, sans lien avec Nintendo, Creatures ou The Pokémon Company.
      </footer>
    </LangContext.Provider>
  )
}
