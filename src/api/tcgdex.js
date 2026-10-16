const API = 'https://api.tcgdex.net/v2'
const cache = new Map()

export const enc = encodeURIComponent

// GET avec cache mémoire (les promesses sont partagées, donc pas de requêtes en double)
export function get(lang, path) {
  const key = `${lang}${path}`
  if (cache.has(key)) return cache.get(key)
  const p = fetch(`${API}/${lang}${path}`).then(res => {
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return res.json()
  })
  p.catch(() => cache.delete(key))
  cache.set(key, p)
  return p
}

export const logoUrl = base => (base ? `${base}.png` : '')
export const cardImg = (base, quality) => (base ? `${base}/${quality}.webp` : '')

export function formatDate(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
}

// Date de sortie d'une extension (null si indisponible)
export async function setDate(lang, id) {
  try {
    const s = await get(lang, `/sets/${enc(id)}`)
    return s.releaseDate || null
  } catch {
    return null
  }
}

// Date d'une série = date de sa dernière extension (l'API les liste du plus ancien au plus récent)
export async function seriesDate(lang, id) {
  try {
    const serie = await get(lang, `/series/${enc(id)}`)
    const sets = serie.sets || []
    if (!sets.length) return null
    return await setDate(lang, sets[sets.length - 1].id)
  } catch {
    return null
  }
}

// Tri par date de sortie. Tant que les dates ne sont pas toutes connues,
// on affiche l'ordre de l'API inversé (qui est chronologique), puis on affine.
export function sortByRecency(list, dates, ready, newestFirst) {
  if (!ready) return newestFirst ? [...list].reverse() : [...list]
  const withDate = list.filter(x => dates[x.id])
  const without = list.filter(x => !dates[x.id])
  withDate.sort((a, b) => dates[a.id].localeCompare(dates[b.id])) // ancien -> récent
  if (newestFirst) withDate.reverse()
  return [...withDate, ...without.slice().reverse()]
}
