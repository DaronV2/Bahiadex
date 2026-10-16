import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardImg, enc, get } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import CardDialog from '../components/CardDialog.jsx'
import { CollectionProgress } from '../components/CollectionProgress.jsx'
import { Crumbs } from '../components/Crumbs.jsx'
import { updateCollectionCard, useCollection } from '../data/collection.js'

export default function Collection() {
  const lang = useLang()
  const { cards, error } = useCollection()
  const [dialog, setDialog] = useState(null)
  const [busyIds, setBusyIds] = useState([])
  const [actionError, setActionError] = useState('')
  const [setTotals, setSetTotals] = useState({})
  const groups = useMemo(() => {
    const bySet = new Map()
    for (const card of cards) {
      const key = card.setId || card.setName || 'autres'
      if (!bySet.has(key)) bySet.set(key, { id: card.setId, name: card.setName || 'Autres cartes', cards: [] })
      bySet.get(key).cards.push(card)
    }
    return [...bySet.values()]
  }, [cards])

  useEffect(() => {
    const groupsToLoad = groups.filter(group => group.id && !Object.hasOwn(setTotals, group.id))
    if (!groupsToLoad.length) return undefined
    let active = true
    Promise.all(groupsToLoad.map(async group => {
      try {
        const set = await get(lang, `/sets/${enc(group.id)}`)
        return [group.id, set.cardCount?.total || set.cardCount?.official || set.cards?.length || 0]
      } catch {
        return [group.id, null]
      }
    })).then(results => {
      if (active) setSetTotals(current => ({ ...current, ...Object.fromEntries(results) }))
    })
    return () => { active = false }
  }, [groups, lang])

  return (
    <>
      <Crumbs items={[{ label: 'Ma collection' }]} />
      <h1>Ma collection</h1>
      <p className="lede">{cards.length} carte{cards.length > 1 ? 's' : ''} possédée{cards.length > 1 ? 's' : ''}, répartie{groups.length > 1 ? 's' : ''} dans {groups.length} set{groups.length > 1 ? 's' : ''}.</p>
      {(error || actionError) && <p className="auth-error" role="alert">{actionError || error}</p>}
      {groups.length ? (
        <div className="collection-groups">
          {groups.map(group => (
            <section className="collection-set" key={group.id || group.name}>
              <div className="collection-set-head">
                <h2>{group.id ? <Link to={`/set/${enc(group.id)}`}>{group.name}</Link> : group.name}</h2>
                <span className="count">{group.cards.length} carte{group.cards.length > 1 ? 's' : ''}</span>
              </div>
              {group.id && (
                <CollectionProgress
                  label="Complétion du set"
                  owned={group.cards.length}
                  total={setTotals[group.id] || 0}
                  loading={!Object.hasOwn(setTotals, group.id)}
                />
              )}
              <ul className="cards">
                {group.cards.map((card, index) => (
                  <li className="selectable-card" key={card.id}>
                    <button className="card" type="button" onClick={() => setDialog({ cards: group.cards, pos: index, setName: group.name })} aria-label={`${card.name}, carte ${card.localId}`}>
                      <span className="card-face">
                        {card.image
                          ? <img src={cardImg(card.image, 'low')} alt="" loading="lazy" decoding="async" />
                          : <span className="card-noimg">Image indisponible</span>}
                      </span>
                      <span className="card-cap"><b>{card.name}</b><small>{card.setName} · n° {card.localId}</small></span>
                    </button>
                    <span className="card-owned-variants" aria-label={`Variantes possédées : ${(card.variants || []).map(variant => variant.label).join(', ')}`}>
                      {(card.variants || []).map(variant => (
                        <span className="card-owned-variant" key={variant.id}><b aria-hidden="true">✓</b> {variant.label}{variant.quantity > 1 ? ` ×${variant.quantity}` : ''}</span>
                      ))}
                    </span>
                    <button
                      className="collection-toggle is-owned"
                      type="button"
                      aria-label={`Retirer ${card.name} de ma collection`}
                      title="Retirer de ma collection"
                      disabled={busyIds.includes(card.id)}
                      onClick={async () => {
                        setBusyIds(current => [...current, card.id])
                        setActionError('')
                        try {
                          await updateCollectionCard(card, [])
                        } catch (cause) {
                          setActionError(cause.message)
                        } finally {
                          setBusyIds(current => current.filter(cardId => cardId !== card.id))
                        }
                      }}
                    ><span aria-hidden="true">✓</span></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="state"><strong>Ta collection est vide</strong>Parcours une extension et coche les cartes que tu possèdes.<br /><Link className="btn primary binder-browse" to="/">Parcourir les extensions</Link></div>
      )}
      {dialog && (
        <CardDialog
          cards={dialog.cards}
          pos={dialog.pos}
          set={{ name: dialog.setName }}
          onPos={pos => setDialog(current => ({ ...current, pos }))}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}