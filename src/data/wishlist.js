import { useEffect, useState } from 'react'
import { request } from '../api/local.js'

const CHANGE_EVENT = 'tcg-wishlist-change'

export async function updateWishlistCard(card, wanted, set) {
  const path = `/wishlist/cards/${encodeURIComponent(card.id)}`
  if (wanted) {
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
          serieId: set.serie?.id || ''
        }
      }
    })
  } else {
    await request(path, { method: 'DELETE' })
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useWishlist(setId, enabled = true) {
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
      request(`/wishlist${query}`)
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