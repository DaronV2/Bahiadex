import { useEffect, useState } from 'react'
import { request } from '../api/local.js'

const CHANGE_EVENT = 'tcg-classeurs-change'

export function useClasseurs() {
  const [classeurs, setClasseurs] = useState([])

  useEffect(() => {
    let isActive = true

    const refreshClasseurs = () => {
      request('/binders')
        .then(data => {
          if (isActive) setClasseurs(data.binders)
        })
        .catch(error => {
          if (isActive) console.error('Chargement des classeurs impossible:', error)
        })
    }

    refreshClasseurs()
    window.addEventListener(CHANGE_EVENT, refreshClasseurs)
    return () => {
      isActive = false
      window.removeEventListener(CHANGE_EVENT, refreshClasseurs)
    }
  }, [])

  return classeurs
}

function notifyClasseursChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export async function createClasseur(name) {
  const data = await request('/binders', {
    method: 'POST',
    body: { name },
  })
  notifyClasseursChanged()
  return data.binder
}

export async function addCardsToClasseur(classeurId, cards) {
  await request(`/binders/${encodeURIComponent(classeurId)}/cards`, {
    method: 'POST',
    body: { cards },
  })
  notifyClasseursChanged()
}

export async function removeCardFromClasseur(classeurId, cardId) {
  await request(
    `/binders/${encodeURIComponent(classeurId)}/cards/${encodeURIComponent(cardId)}`,
    { method: 'DELETE' },
  )
  notifyClasseursChanged()
}

export async function reorderCardsInClasseur(classeurId, positions) {
  await request(`/binders/${encodeURIComponent(classeurId)}/cards/order`, {
    method: 'PUT',
    body: { positions },
  })
  notifyClasseursChanged()
}

export async function deleteClasseur(classeurId) {
  await request(`/binders/${encodeURIComponent(classeurId)}`, {
    method: 'DELETE',
  })
  notifyClasseursChanged()
}