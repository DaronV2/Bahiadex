import { useEffect, useState } from 'react'

const CHANGE_EVENT = 'tcg-collection-change'
const variantNames = {
  firstEdition: 'Première édition',
  holo: 'Holo',
  normal: 'Normale',
  reverse: 'Reverse holo',
  wPromo: 'Promo'
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`)
  return data
}

function notifyCollectionChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getCardVariants(card) {
  const detailed = card?.variantsDetailed || card?.variantsdetailed || []
  if (detailed.length) {
    const variants = new Map()
    for (const variant of detailed) {
      const stamps = Array.isArray(variant.stamp)
        ? variant.stamp
        : variant.stamp
          ? [variant.stamp]
          : []
      const id = [variant.type, variant.subtype, ...stamps].filter(Boolean).join('|') || variant.variantId
      if (!id) continue
      const readableStamps = stamps.map(stamp =>
        stamp === '1st-edition' ? '1re édition' : stamp
      )
      const parts = [variantNames[variant.type] || variant.type, variant.subtype, ...readableStamps]
        .filter(Boolean)
      variants.set(id, { id, label: parts.join(' · ') })
    }
    if (variants.size) return [...variants.values()]
  }

  const available = Object.entries(card?.variants || {})
    .filter(([, exists]) => exists)
    .map(([id]) => ({ id, label: variantNames[id] || id }))
  return available.length ? available : [{ id: 'normal', label: 'Normale' }]
}

export function matchOwnedVariants(available, owned) {
  return owned.map(ownedVariant => {
    const exactMatch = available.find(variant => variant.id === ownedVariant.id)
    if (exactMatch) {
      return { ...exactMatch, quantity: ownedVariant.quantity || 1 }
    }

    if (ownedVariant.id !== 'normal') return null

    const normalVariant = available.find(variant =>
      variant.id === 'normal' || variant.id.startsWith('normal|')
    ) || available[0]
    return normalVariant
      ? { ...normalVariant, quantity: ownedVariant.quantity || 1 }
      : null
  }).filter(Boolean)
}

export async function updateCollectionCard(card, variants, set) {
  const path = `/collection/cards/${encodeURIComponent(card.id)}`
  if (variants.length) {
    await request(path, {
      method: 'PUT',
      body: {
        card: {
          id: card.id,
          name: card.name,
          localId: card.localId,
          image: card.image,
          setId: set.id,
          setName: set.name,
          serieId: set.serie?.id || '',
          variants
        }
      }
    })
  } else {
    await request(path, { method: 'DELETE' })
  }
  notifyCollectionChanged()
}

export function useCollection(setId, enabled = true) {
  const [state, setState] = useState(() => ({ cards: [], error: '', loading: enabled }))

  useEffect(() => {
    if (!enabled) {
      setState({ cards: [], error: '', loading: false })
      return undefined
    }
    let active = true
    const refresh = () => {
      const query = setId ? `?setId=${encodeURIComponent(setId)}` : ''
      setState(current => ({ ...current, error: '', loading: true }))
      request(`/collection${query}`)
        .then(data => {
          if (active) setState({ cards: data.cards, error: '', loading: false })
        })
        .catch(error => {
          if (active) {
            setState(current => ({ ...current, error: error.message, loading: false }))
          }
        })
    }
    refresh()
    window.addEventListener(CHANGE_EVENT, refresh)
    return () => {
      active = false
      window.removeEventListener(CHANGE_EVENT, refresh)
    }
  }, [setId, enabled])

  return state
}