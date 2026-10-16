import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardImg, enc } from '../api/tcgdex.js'
import CardDialog from '../components/CardDialog.jsx'
import { Crumbs } from '../components/Crumbs.jsx'
import { updateWishlistCard, useWishlist } from '../data/wishlist.js'

export default function Wishlist() {
  const { cards, error } = useWishlist()
  const [dialog, setDialog] = useState(null)
  const [busyIds, setBusyIds] = useState([])
  const [actionError, setActionError] = useState('')
  const groups = useMemo(() => {
    const bySet = new Map()
    for (const card of cards) {
      const key = card.setId || card.setName || 'autres'
      if (!bySet.has(key)) bySet.set(key, { id: card.setId, name: card.setName || 'Autres cartes', cards: [] })
      bySet.get(key).cards.push(card)
    }
    return [...bySet.values()]
  }, [cards])

  return (
    <>
      <Crumbs items={[{ label: 'Liste de souhaits' }]} />
      <h1>Liste de souhaits</h1>
      <p className="lede">{cards.length} carte{cards.length > 1 ? 's' : ''} à trouver dans {groups.length} set{groups.length > 1 ? 's' : ''}.</p>
      {(error || actionError) && <p className="auth-error" role="alert">{actionError || error}</p>}
      {groups.length ? (
        <div className="collection-groups">
          {groups.map(group => (
            <section className="collection-set" key={group.id || group.name}>
              <div className="collection-set-head">
                <h2>{group.id ? <Link to={`/set/${enc(group.id)}`}>{group.name}</Link> : group.name}</h2>
                <span className="count">{group.cards.length} carte{group.cards.length > 1 ? 's' : ''}</span>
              </div>
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
                    <button
                      className="wishlist-toggle is-wished"
                      type="button"
                      aria-label={`Retirer ${card.name} de la liste de souhaits`}
                      title="Retirer de la liste de souhaits"
                      disabled={busyIds.includes(card.id)}
                      onClick={async () => {
                        setBusyIds(current => [...current, card.id])
                        setActionError('')
                        try {
                          await updateWishlistCard(card, false)
                        } catch (cause) {
                          setActionError(cause.message)
                        } finally {
                          setBusyIds(current => current.filter(cardId => cardId !== card.id))
                        }
                      }}
                    ><span aria-hidden="true">★</span></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="state"><strong>Ta liste de souhaits est vide</strong>Ajoute les cartes que tu aimerais trouver depuis les pages des sets.<br /><Link className="btn primary binder-browse" to="/">Parcourir les sets</Link></div>
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