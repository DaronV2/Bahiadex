import { useCallback, useEffect, useState } from 'react'

// Chargement asynchrone avec état { status, data, error } et relance manuelle
export function useAsync(fn, deps) {
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isActive = true
    setState({ status: 'loading' })
    Promise.resolve()
      .then(fn)
      .then(data => {
        if (isActive) setState({ status: 'ok', data })
      })
      .catch(error => {
        if (isActive) setState({ status: 'error', error })
      })
    return () => {
      isActive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const retry = useCallback(() => setAttempt(attempt => attempt + 1), [])
  return [state, retry]
}

// Récupère en parallèle la date de chaque élément ; `ready` passe à true quand tout est arrivé
export function useDates(items, fetcher, lang) {
  const [state, setState] = useState({ dates: {}, ready: false })
  const key = `${lang}|${items.map(i => i.id).join(',')}`

  useEffect(() => {
    let isActive = true
    if (!items.length) {
      setState({ dates: {}, ready: true })
      return undefined
    }
    setState({ dates: {}, ready: false })
    Promise.all(items.map(async item => [item.id, await fetcher(item.id)])).then(entries => {
      if (!isActive) return
      setState({
        dates: Object.fromEntries(entries.filter(([, date]) => date)),
        ready: true,
      })
    })
    return () => {
      isActive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

// Ordre d'affichage mémorisé : plus récent en premier par défaut
export function useOrder() {
  const [newest, setNewest] = useState(() => {
    try { return localStorage.getItem('tcg-order') !== 'old' } catch { return true }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tcg-order', newest ? 'new' : 'old')
    } catch {
      // Le stockage peut être indisponible dans certains contextes privés.
    }
  }, [newest])
  const toggle = useCallback(() => setNewest(current => !current), [])
  return [newest, toggle]
}

// Bouton « Installer l'app » (Chrome / Edge / Android). Renvoie null si indisponible.
export function useInstall() {
  const [evt, setEvt] = useState(null)
  useEffect(() => {
    const onPrompt = event => {
      event.preventDefault()
      setEvt(event)
    }
    const onDone = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onDone)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onDone)
    }
  }, [])
  if (!evt) return null
  return async () => {
    const installPrompt = evt
    installPrompt.prompt()
    await installPrompt.userChoice
    setEvt(null)
  }
}
