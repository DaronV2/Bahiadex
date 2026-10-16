import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { cardImg, enc, formatDate, get, logoUrl } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import CardDialog from '../components/CardDialog.jsx'
import { CollectionProgress } from '../components/CollectionProgress.jsx'
import { Crumbs } from '../components/Crumbs.jsx'
import { ErrorState, SkeletonCards } from '../components/Feedback.jsx'
import VariantDialog from '../components/VariantDialog.jsx'
import { addCardsToClasseur, useClasseurs } from '../data/binders.js'
import { getCardVariants, matchOwnedVariants, updateCollectionCard, useCollection } from '../data/collection.js'
import { updateWishlistCard, useWishlist } from '../data/wishlist.js'
import { useAsync } from '../hooks/index.js'

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter(currentValue => currentValue !== value)
    : [...values, value]
}

function rarityRank(value) {
  const rarity = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/uncommon|peu commune|poco comun|pouco comum|nicht haufig|ungewohnlich/.test(rarity)) return 20
  if (/common|commune|comun|comune|comum|haufig/.test(rarity)) return 10
  if (/double rare|doble rara|doppia rara|dupla rara|rara doble/.test(rarity)) return 50
  if (/special illustration|illustration speciale|ilustracion especial|illustracao especial/.test(rarity)) return 85
  if (/illustration rare|rare illustration|rara ilustracion|rare ilustracion|rare ilustracao/.test(rarity)) return 60
  if (/trainer gallery|amazing rare|classic collection/.test(rarity)) return 65
  if (/hyper rare|rare hyper|hiper rara|rare hiper/.test(rarity)) return 100
  if (/ultra rare|rare ultra|ultra rara|rara ultra/.test(rarity)) return 70
  if (/secret|rainbow|arc.en.ciel|shiny|shining|gold star|rare prime/.test(rarity)) return 90
  if (/promo|promocional|promozione/.test(rarity)) return 45
  if (/rare holo.*(ex|gx|vmax|vstar)|rare (break|ace)|ace spec/.test(rarity)) return 80
  if (/rare holo|holo rare/.test(rarity)) return 40
  if (/rare|rara|raro/.test(rarity)) return 30
  return 500
}

function CardTile({ card, onOpen, ownedVariants = [] }) {
  // Effet holographique : inclinaison + reflet qui suivent le doigt ou la souris
  const move = e => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
  }
  const reset = e => {
    e.currentTarget.style.setProperty('--rx', '0deg')
    e.currentTarget.style.setProperty('--ry', '0deg')
  }

  return (
    <button
      className="card"
      type="button"
      onClick={onOpen}
      onPointerMove={move}
      onPointerLeave={reset}
      aria-label={`${card.name}, carte ${card.localId}`}
    >
      <span className="card-face">
        {card.image
          ? <img src={cardImg(card.image, 'low')} alt="" loading="lazy" decoding="async" />
          : <span className="card-noimg">Image indisponible</span>}
      </span>
      <span className="card-cap">
        <b>{card.name}</b>
        <small>n° {card.localId}</small>
      </span>
      {ownedVariants.length > 0 && (
        <span className="card-owned-variants" aria-label={`Variantes possédées : ${ownedVariants.map(variant => variant.label).join(', ')}`}>
          {ownedVariants.map(variant => (
            <span className="card-owned-variant" key={variant.id}><b aria-hidden="true">✓</b> {variant.label}{variant.quantity > 1 ? ` ×${variant.quantity}` : ''}</span>
          ))}
        </span>
      )}
    </button>
  )
}

export default function SetPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const lang = useLang()
  const [state, retry] = useAsync(() => get(lang, `/sets/${enc(id)}`), [lang, id])
  const [term, setTerm] = useState('')
  const [desc, setDesc] = useState(false) // false = du n° 1 au dernier
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [selectedRarities, setSelectedRarities] = useState([])
  const [selectedTypes, setSelectedTypes] = useState([])
  const [metadataRequested, setMetadataRequested] = useState(false)
  const [pos, setPos] = useState(null)
  const classeurs = useClasseurs()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState([])
  const [classeurId, setClasseurId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const set = state.data
  const cards = useMemo(() => set?.cards || [], [set])
  const { cards: collectionCards, error: collectionError, loading: collectionLoading } = useCollection(set?.id, state.status === 'ok')
  const { cards: wishlistCards, error: wishlistError } = useWishlist(set?.id, state.status === 'ok')
  const wishlistedIds = useMemo(() => new Set(wishlistCards.map(card => card.id)), [wishlistCards])
  const ownedVariants = useMemo(() => new Map(collectionCards.map(card => [card.id, card.variants || []])), [collectionCards])
  const ownedVariantCount = collectionCards.reduce((count, card) => count + (card.variants?.length || 0), 0)
  const ownedCopyCount = collectionCards.reduce((count, card) => count + (card.variants || []).reduce((copies, variant) => copies + (variant.quantity || 1), 0), 0)
  const [availableVariants, setAvailableVariants] = useState({})
  const [cardDetails, setCardDetails] = useState({})
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [variantCard, setVariantCard] = useState(null)
  const [variantBusy, setVariantBusy] = useState([])
  const [variantError, setVariantError] = useState('')
  const [wishlistBusy, setWishlistBusy] = useState([])
  const [wishlistActionError, setWishlistActionError] = useState('')
  const variantRequests = useRef(new Map())

  useEffect(() => {
    setTerm('')
    setPos(null)
    setSelected([])
    setSelecting(false)
    setSelectedRarities([])
    setSelectedTypes([])
    setMetadataRequested(false)
    setCardDetails({})
  }, [id])
  useEffect(() => {
    document.title = set ? `${set.name} · Classeur Pokémon TCG` : 'Classeur Pokémon TCG'
  }, [set])

  const searched = useMemo(() => {
    const t = term.trim().toLowerCase()
    return cards.filter(c =>
      !t || (c.name || '').toLowerCase().includes(t) || String(c.localId).toLowerCase().includes(t)
    )
  }, [cards, term])

  useEffect(() => {
    if (!metadataRequested || !searched.length) {
      setDetailsLoading(false)
      setDetailsError('')
      return undefined
    }
    let active = true
    setDetailsLoading(true)
    setDetailsError('')
    const loadDetails = async () => {
      let failed = false
      for (let start = 0; start < searched.length; start += 8) {
        const batch = searched.slice(start, start + 8)
        const results = await Promise.all(batch.map(async card => {
          try {
            return [card.id, await get(lang, `/cards/${enc(card.id)}`)]
          } catch {
            failed = true
            return [card.id, null]
          }
        }))
        if (!active) return
        setCardDetails(current => ({
          ...current,
          ...Object.fromEntries(results.filter(([, details]) => details))
        }))
      }
      if (!active) return
      if (failed) setDetailsError('Certaines cartes n’ont pas pu être chargées pour les filtres.')
      setDetailsLoading(false)
    }
    loadDetails()
    return () => { active = false }
  }, [lang, metadataRequested, searched])

  const rarityOptions = useMemo(() => [...new Set(
    Object.values(cardDetails).map(details => details.rarity).filter(Boolean)
  )].sort((left, right) => rarityRank(left) - rarityRank(right) || left.localeCompare(right, lang, { sensitivity: 'base' })), [cardDetails, lang])
  const typeOptions = useMemo(() => [...new Set(
    Object.values(cardDetails).flatMap(details => Array.isArray(details.types) ? details.types : details.types ? [details.types] : [])
  )].sort((left, right) => left.localeCompare(right, lang, { sensitivity: 'base' })), [cardDetails, lang])

  const visible = useMemo(() => {
    const filtered = searched.filter(card => {
      const owned = ownedVariants.get(card.id) || []
      if (collectionFilter === 'owned') return owned.length > 0
      if (collectionFilter === 'missing') return owned.length === 0
      if (collectionFilter === 'duplicates') return owned.some(variant => (variant.quantity || 1) > 1)
      const details = cardDetails[card.id]
      if (selectedRarities.length && !selectedRarities.includes(details?.rarity)) return false
      const cardTypes = Array.isArray(details?.types) ? details.types : details?.types ? [details.types] : []
      if (selectedTypes.length && !cardTypes.some(type => selectedTypes.includes(type))) return false
      return true
    })
    return desc ? [...filtered].reverse() : filtered
  }, [searched, collectionFilter, selectedRarities, selectedTypes, cardDetails, ownedVariants, desc])

  const serieId = params.get('s') || set?.serie?.id
  const serieName = set?.serie?.name

  const toggleSelectionMode = () => {
    setSelecting(current => !current)
    setSelected([])
  }

  const toggleCardSelection = cardId => {
    setSelecting(true)
    setSelected(current => toggleValue(current, cardId))
  }

  const addSelectedCardsToClasseur = async () => {
    const cardsToAdd = cards
      .filter(card => selected.includes(card.id))
      .map(card => ({
        id: card.id,
        name: card.name,
        localId: card.localId,
        image: card.image,
        setId: set.id,
        setName: set.name,
        serieId: serieId || '',
      }))

    setSaving(true)
    setSaveError('')
    try {
      await addCardsToClasseur(classeurId, cardsToAdd)
      setSelected([])
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleWishlist = async card => {
    setWishlistBusy(current => [...current, card.id])
    setWishlistActionError('')
    try {
      await updateWishlistCard(card, !wishlistedIds.has(card.id), set)
    } catch (error) {
      setWishlistActionError(error.message)
    } finally {
      setWishlistBusy(current => current.filter(cardId => cardId !== card.id))
    }
  }

  const loadVariants = card => {
    const key = `${lang}:${card.id}`
    if (variantRequests.current.has(key)) return variantRequests.current.get(key)
    const request = get(lang, `/cards/${enc(card.id)}`)
      .then(details => {
        const variants = getCardVariants(details)
        setAvailableVariants(current => ({ ...current, [card.id]: variants }))
        return variants
      })
      .catch(error => {
        variantRequests.current.delete(key)
        throw error
      })
    variantRequests.current.set(key, request)
    return request
  }
  const toggleCollectionCard = async card => {
    setVariantBusy(current => [...current, card.id])
    setVariantError('')
    try {
      const variants = await loadVariants(card)
      const owned = matchOwnedVariants(variants, ownedVariants.get(card.id) || [])
      if (variants.length === 1) {
        await updateCollectionCard(card, owned.length ? [] : variants, set)
      } else {
        setVariantCard({ card, variants })
      }
    } catch (error) {
      setVariantError(error.message)
    } finally {
      setVariantBusy(current => current.filter(cardId => cardId !== card.id))
    }
  }
  const trail = [{ label: 'Séries', to: '/' }]
  if (serieId) trail.push({ label: serieName || 'Série', to: `/serie/${enc(serieId)}` })
  trail.push({ label: set?.name || '…' })

  return (
    <>
      <Crumbs items={trail} />

      {state.status === 'loading' && (<><h1>Chargement…</h1><SkeletonCards /></>)}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={retry} />}
      {state.status === 'ok' && (
        <>
          <div className="set-head">
            {set.logo && <img className="logo" src={logoUrl(set.logo)} alt="" />}
            <div>
              <h1>{set.name}</h1>
              <p className="lede" style={{ margin: 0 }}>
                {set.cardCount
                  ? `${set.cardCount.official} cartes numérotées, ${set.cardCount.total} au total`
                  : `${cards.length} cartes`}
                {set.releaseDate ? ` · sortie en ${formatDate(set.releaseDate, lang)}` : ''}
              </p>
            </div>
          </div>
          <CollectionProgress
            label={`Collection de ${set.name}`}
            owned={collectionCards.length}
            total={set.cardCount?.total || cards.length}
            loading={collectionLoading}
          />

          <div className="toolbar">
            <label className="sr" htmlFor="q">Rechercher une carte</label>
            <input
              id="q"
              className="search"
              type="search"
              placeholder="Nom ou numéro de la carte"
              autoComplete="off"
              value={term}
              onChange={e => setTerm(e.target.value)}
            />
            <details className="set-filter-menu" onToggle={event => {
              if (event.currentTarget.open) setMetadataRequested(true)
            }}>
              <summary>Raretés{selectedRarities.length ? ` · ${selectedRarities.length}` : ''}</summary>
              <div className="set-filter-options">
                {detailsLoading && !rarityOptions.length && <span role="status">Chargement…</span>}
                {!detailsLoading && !rarityOptions.length && <span>Aucune rareté disponible</span>}
                {rarityOptions.map(rarity => (
                  <label key={rarity}>
                    <input
                      type="checkbox"
                      checked={selectedRarities.includes(rarity)}
                      onChange={() => setSelectedRarities(current => toggleValue(current, rarity))}
                    />
                    {rarity}
                  </label>
                ))}
                {selectedRarities.length > 0 && <button className="btn" type="button" onClick={() => setSelectedRarities([])}>Tout effacer</button>}
              </div>
            </details>
            <details className="set-filter-menu" onToggle={event => {
              if (event.currentTarget.open) setMetadataRequested(true)
            }}>
              <summary>Types{selectedTypes.length ? ` · ${selectedTypes.length}` : ''}</summary>
              <div className="set-filter-options">
                {detailsLoading && !typeOptions.length && <span role="status">Chargement…</span>}
                {!detailsLoading && !typeOptions.length && <span>Aucun type disponible</span>}
                {typeOptions.map(type => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      onChange={() => setSelectedTypes(current => toggleValue(current, type))}
                    />
                    {type}
                  </label>
                ))}
                {selectedTypes.length > 0 && <button className="btn" type="button" onClick={() => setSelectedTypes([])}>Tout effacer</button>}
              </div>
            </details>
            <label className="sr" htmlFor="collection-filter">Filtrer les cartes</label>
            <select id="collection-filter" value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)}>
              <option value="all">Toutes les cartes</option>
              <option value="owned">Possédées</option>
              <option value="missing">Manquantes</option>
              <option value="duplicates">Avec doublons</option>
            </select>
            <button className="btn" type="button" onClick={() => setDesc(v => !v)}>
              {desc ? 'Du dernier au premier' : 'Du premier au dernier'}
            </button>
            <button className="btn" type="button" onClick={toggleSelectionMode}>
              {selecting ? 'Terminer la sélection' : 'Sélectionner des cartes'}
            </button>
            {selecting && (classeurs.length ? (
              <>
                <label className="sr" htmlFor="target-binder">Classeur de destination</label>
                <select id="target-binder" value={classeurId} onChange={event => setClasseurId(event.target.value)}>
                  <option value="">Choisir un classeur</option>
                  {classeurs.map(classeur => <option key={classeur.id} value={classeur.id}>{classeur.name}</option>)}
                </select>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!classeurId || !selected.length || saving}
                  onClick={addSelectedCardsToClasseur}
                >
                  {saving ? 'Ajout…' : `Ajouter ${selected.length || ''} sélectionnée${selected.length > 1 ? 's' : ''}`}
                </button>
              </>
            ) : <Link className="btn" to="/classeurs">Créer un classeur</Link>)}
            <span className="count" aria-live="polite">{visible.length} carte{visible.length > 1 ? 's' : ''}</span>
            <span className="collection-count" aria-live="polite">{collectionCards.length} cartes · {ownedVariantCount} variantes · {ownedCopyCount} exemplaires</span>
            {detailsLoading && <span className="count" role="status">Chargement des données de tri…</span>}
          </div>
          {saveError && <p className="auth-error" role="alert">{saveError}</p>}
          {(collectionError || variantError || wishlistError || wishlistActionError) && <p className="auth-error" role="alert">{variantError || wishlistActionError || collectionError || wishlistError}</p>}
          {detailsError && <p className="auth-error" role="alert">{detailsError}</p>}

          {visible.length > 0 ? (
            <ul className="cards">
              {visible.map((c, i) => {
                const variants = availableVariants[c.id]
                const ownedCount = variants ? matchOwnedVariants(variants, ownedVariants.get(c.id) || []).length : (ownedVariants.get(c.id) || []).length
                const complete = variants?.length > 0 && ownedCount === variants.length
                const indicator = variants ? (complete ? '✓' : `${ownedCount}/${variants.length}`) : ownedCount ? `${ownedCount}/?` : '+'
                const status = variants
                  ? complete ? `Tous les variants possédés (${ownedCount}/${variants.length})` : `${ownedCount} sur ${variants.length} variants possédés`
                  : 'Choisir les variants possédés'
                return (
                  <li className={`selectable-card${selected.includes(c.id) ? ' is-selected' : ''}`} key={c.id}>
                    <CardTile card={c} ownedVariants={ownedVariants.get(c.id)} onOpen={() => setPos(i)} />
                    <button
                      className={`collection-toggle${ownedCount ? ' is-owned' : ''}${complete ? ' is-complete' : ''}`}
                      type="button"
                      aria-pressed={complete}
                      aria-label={`${status} pour ${c.name}`}
                      title={status}
                      disabled={variantBusy.includes(c.id)}
                      onPointerEnter={() => loadVariants(c).catch(() => {})}
                      onFocus={() => loadVariants(c).catch(() => {})}
                      onClick={() => toggleCollectionCard(c)}
                    ><span aria-hidden="true">{variantBusy.includes(c.id) ? '…' : indicator}</span></button>
                    <button
                      className={`wishlist-toggle${wishlistedIds.has(c.id) ? ' is-wished' : ''}`}
                      type="button"
                      aria-pressed={wishlistedIds.has(c.id)}
                      aria-label={`${wishlistedIds.has(c.id) ? 'Retirer' : 'Ajouter'} ${c.name} ${wishlistedIds.has(c.id) ? 'de' : 'à'} la liste de souhaits`}
                      title={wishlistedIds.has(c.id) ? 'Retirer de la liste de souhaits' : 'Ajouter à la liste de souhaits'}
                      disabled={wishlistBusy.includes(c.id)}
                      onClick={() => toggleWishlist(c)}
                    ><span aria-hidden="true">{wishlistBusy.includes(c.id) ? '…' : wishlistedIds.has(c.id) ? '★' : '☆'}</span></button>
                  <button
                    className={`card-select${selected.includes(c.id) ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={selected.includes(c.id)}
                    aria-label={`${selected.includes(c.id) ? 'Désélectionner' : 'Sélectionner'} ${c.name}`}
                    onClick={() => toggleCardSelection(c.id)}
                  ><span aria-hidden="true">{selected.includes(c.id) ? '✓' : ''}</span></button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="state"><strong>Aucun résultat</strong>Essayez un autre nom ou un autre numéro.</div>
          )}

          {pos !== null && visible[pos] && (
            <CardDialog cards={visible} pos={pos} set={set} onPos={setPos} onClose={() => setPos(null)} />
          )}
          {variantCard && (
            <VariantDialog
              key={variantCard.card.id}
              card={variantCard.card}
              variants={variantCard.variants}
              ownedVariants={ownedVariants.get(variantCard.card.id) || []}
              onSave={(card, variants) => updateCollectionCard(card, variants, set)}
              onClose={() => setVariantCard(null)}
            />
          )}
        </>
      )}
    </>
  )
}
