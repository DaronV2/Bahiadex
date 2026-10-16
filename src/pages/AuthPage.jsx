import { useState } from 'react'
import { login, register } from '../data/auth.js'

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegistering = mode === 'register'

  const submit = async event => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await (isRegistering ? register : login)(username, password)
      await onAuthenticated(user)
    } catch (cause) {
      setError(cause.message || 'Connexion impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <section className="auth" aria-labelledby="auth-title">
        <p className="eyebrow">Collection personnelle</p>
        <h1 id="auth-title">{isRegistering ? 'Créer un compte' : 'Connexion'}</h1>
        <p className="lede">Chaque compte possède ses propres classeurs enregistrés sur cet ordinateur.</p>

        <div className="auth-switch" role="group" aria-label="Type d’accès">
          <button className={`btn${!isRegistering ? ' is-current' : ''}`} type="button" aria-pressed={!isRegistering} onClick={() => { setMode('login'); setError('') }}>Connexion</button>
          <button className={`btn${isRegistering ? ' is-current' : ''}`} type="button" aria-pressed={isRegistering} onClick={() => { setMode('register'); setError('') }}>Créer un compte</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="username">Identifiant</label>
          <input
            id="username"
            className="search"
            value={username}
            onChange={event => setUsername(event.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={32}
            required
          />
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            className="search"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            minLength={10}
            maxLength={128}
            required
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Patientez…' : isRegistering ? 'Créer mon compte' : 'Se connecter'}
          </button>
        </form>
      </section>
    </main>
  )
}