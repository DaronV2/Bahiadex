import { useMemo, useRef, useState } from 'react'
import { enc, get } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import { Crumbs } from '../components/Crumbs.jsx'
import VariantDialog from '../components/VariantDialog.jsx'
import { getCardVariants, matchOwnedVariants, updateCollectionCard, useCollection } from '../data/collection.js'
import { updateWishlistCard } from '../data/wishlist.js'

const POKEUM_API = import.meta.env.VITE_POKEUM_API || '/pokeum/api/identify'

const STATUS_LABELS = {
  confident: 'Correspondance trouvée',
  uncertain: 'Correspondance à confirmer',
  no_match: 'Aucune correspondance trouvée',
  no_card_detected: 'Aucune carte détectée',
}

function fallbackCard(match) {
  const cardNumber = String(match.number || '')
  const separator = cardNumber.lastIndexOf('/')
  const localId = separator < 0 ? cardNumber : cardNumber.slice(0, separator)
  return {
    id: match.card_id,
    name: match.name,
    localId,
    image: match.image_url?.replace(/\/low\.webp$/, '') || '',
    setId: match.set?.id || '',
    setName: match.set?.name || ''
  }
}

export default function Scanner() {
  const lang = useLang()
  const { cards: collectionCards } = useCollection()
  const ownedVariants = useMemo(() => new Map(collectionCards.map(card => [card.id, card.variants || []])), [collectionCards])
  const photoUrl = useRef('')
  const [photo, setPhoto] = useState('')
  const [result, setResult] = useState(null)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [destination, setDestination] = useState('collection')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [variantDialog, setVariantDialog] = useState(null)

  const scanPhoto = async file => {
    if (!file) return
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    photoUrl.current = URL.createObjectURL(file)
    setPhoto(photoUrl.current)
    setResult(null)
    setSelectedMatch(null)
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file, file.name || 'pokemon-card.jpg')
      const response = await fetch(`${POKEUM_API}?top_k=6`, { method: 'POST', body })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `Erreur Pokeum ${response.status}`)
      setResult(data)
      setSelectedMatch(data.match || data.alternates?.[0] || null)
      if (data.status === 'no_card_detected') {
        setNotice('Aucune carte détectée. Cadre la carte entière et reprends la photo.')
      } else if (data.status === 'no_match') {
        setNotice('Aucune correspondance trouvée. Essaie une photo plus nette et mieux éclairée.')
      } else if (data.status === 'uncertain') {
        setNotice('Résultat incertain. Vérifie la carte proposée et ses alternatives avant l’ajout.')
      }
    } catch (cause) {
      setError(`Le service Pokeum est indisponible : ${cause.message}. Réessaie dans un instant.`)
    } finally {
      setBusy(false)
    }
  }

  const addSelected = async () => {
    if (!selectedMatch) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const fallback = fallbackCard(selectedMatch)
      const set = { id: fallback.setId, name: fallback.setName, serie: { id: '' } }
      if (destination === 'wishlist') {
        await updateWishlistCard(fallback, true, set)
        setNotice(`${fallback.name} ajoutée à ta liste de souhaits.`)
      } else {
        const details = await get(lang, `/cards/${enc(selectedMatch.card_id)}`).catch(() => null)
        const card = details || fallback
        const variants = details
          ? getCardVariants(details)
          : (selectedMatch.variants || []).filter(variant => variant.present).map(variant => ({
            id: variant.kind,
            label: variant.kind,
            quantity: 1
          }))
        const available = variants.length ? variants : [{ id: 'normal', label: 'Normale', quantity: 1 }]
        const cardSet = card.set || set
        if (available.length === 1) {
          const owned = matchOwnedVariants(available, ownedVariants.get(card.id) || [])
          await updateCollectionCard(card, [{ ...available[0], quantity: (owned[0]?.quantity || 0) + 1 }], cardSet)
          setNotice(`${card.name} ajoutée à ta collection.`)
        } else {
          setVariantDialog({ card, variants: available, set: cardSet })
        }
      }
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSaving(false)
    }
  }

  const candidates = [result?.match, ...(result?.alternates || [])].filter(Boolean)
  const statusLabel = STATUS_LABELS[result?.status] || 'Résultat de reconnaissance'
  const isConfident = result?.status === 'confident'

  return (
    <>
      <section className="scanner-desktop-message" aria-labelledby="scanner-desktop-title">
        <Crumbs items={[{ label: 'Scanner une carte' }]} />
        <h1 id="scanner-desktop-title">Scanner sur mobile</h1>
        <p className="lede">
          Le scanner utilise l’appareil photo du téléphone. Ouvre Classeur TCG sur ton mobile pour identifier une carte.
        </p>
      </section>

      <div className="scanner-mobile-only">
        <Crumbs items={[{ label: 'Scanner une carte' }]} />
        <h1>Scanner une carte</h1>
        <p className="lede">Photographie une carte pour identifier son édition, son numéro et ses variantes.</p>

        <div className="scanner-layout">
          <section className="scanner-capture" aria-label="Photo de la carte">
            {photo
              ? <img className="scanner-photo" src={photo} alt="Carte photographiée" />
              : <div className="scanner-placeholder"><span aria-hidden="true">▧</span><span>Aucune photo</span></div>}
            <label className="btn primary scanner-photo-button">
              {photo ? 'Reprendre une photo' : 'Prendre une photo'}
              <input className="scanner-file-input" type="file" accept="image/*" capture="environment" onChange={event => scanPhoto(event.target.files?.[0])} />
            </label>
            {busy && <p className="count" role="status">Analyse Pokeum en cours…</p>}
          </section>

          <section className="scanner-search" aria-label="Résultat de reconnaissance">
            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            {result && (
              <>
                <p className={`scanner-confidence${isConfident ? ' is-confident' : ''}`} role="status">
                  {statusLabel}
                  {result.match && ` · ${Math.round(result.match.confidence * 100)} %`}
                </p>
                {candidates.length > 0 && (
                  <div className="scanner-results">
                    <h2>Carte reconnue et alternatives</h2>
                    <ul className="scanner-result-list">
                      {candidates.map(candidate => (
                        <li key={candidate.card_id}>
                          <button className={`scanner-result${selectedMatch?.card_id === candidate.card_id ? ' is-current' : ''}`} type="button" onClick={() => setSelectedMatch(candidate)}>
                            {candidate.image_url
                              ? <img src={candidate.image_url} alt="" loading="lazy" />
                              : <span className="scanner-result-placeholder" aria-hidden="true">?</span>}
                            <span><b>{candidate.name}</b><small>{candidate.set?.name || 'Série inconnue'} · n° {candidate.number}</small></span>
                            <span className="count">{Math.round(candidate.confidence * 100)} %</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedMatch && (
                  <div className="scanner-add">
                    <label htmlFor="scan-destination">Ajouter à</label>
                    <select id="scan-destination" value={destination} onChange={event => setDestination(event.target.value)}>
                      <option value="collection">Ma collection</option>
                      <option value="wishlist">Ma liste de souhaits</option>
                    </select>
                    {ownedVariants.has(selectedMatch.card_id) && destination === 'collection' && <p className="count">Carte déjà possédée; un exemplaire sera ajouté.</p>}
                    <button className="btn primary" type="button" disabled={saving || busy} onClick={addSelected}>
                      {saving ? 'Ajout…' : destination === 'collection' ? 'Ajouter à ma collection' : 'Ajouter à ma liste de souhaits'}
                    </button>
                  </div>
                )}
              </>
            )}
            {!result && !error && <div className="state"><strong>Prête à scanner</strong>La reconnaissance est assurée par le service Pokeum configuré pour cette application.</div>}
          </section>
        </div>

        {variantDialog && (
          <VariantDialog
            key={variantDialog.card.id}
            card={variantDialog.card}
            variants={variantDialog.variants}
            ownedVariants={ownedVariants.get(variantDialog.card.id) || []}
            onSave={async (card, variants) => {
              await updateCollectionCard(card, variants, variantDialog.set)
              setNotice(`${card.name} ajoutée à ta collection.`)
            }}
            onClose={() => setVariantDialog(null)}
          />
        )}
      </div>
    </>
  )
}