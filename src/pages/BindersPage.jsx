import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { cardImg, enc } from '../api/tcgdex.js'
import CardDialog from '../components/CardDialog.jsx'
import { Crumbs } from '../components/Crumbs.jsx'
import { createClasseur, deleteClasseur, removeCardFromClasseur, reorderCardsInClasseur, useClasseurs } from '../data/binders.js'

const binderLayouts = [
  { value: '2x2', label: '2 × 2' },
  { value: '3x3', label: '3 × 3' },
  { value: '4x4', label: '4 × 4' },
  { value: '4x3', label: '4 × 3' }
]

export default function Classeurs() {
  const { id } = useParams()
  const navigate = useNavigate()
  const classeurs = useClasseurs()
  const createDialog = useRef(null)
  const [name, setName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [layout, setLayout] = useState('3x3')
  const [spread, setSpread] = useState(0)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetPosition, setDropTargetPosition] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const classeur = classeurs.find(item => item.id === id)
  const [columns, rows] = layout.split('x').map(Number)
  const pageSize = columns * rows
  const cardsByPosition = new Map((classeur?.cards || []).map(card => [card.position, card]))
  const lastPosition = (classeur?.cards || []).reduce((maximum, card) => Math.max(maximum, card.position), -1)
  const spreadCount = Math.max(1, Math.ceil((lastPosition + 1) / (pageSize * 2)))
  const currentSpread = Math.min(spread, spreadCount - 1)

  const moveCard = async (cardId, targetPosition) => {
    if (!classeur) return
    const source = classeur.cards.find(card => card.id === cardId)
    const target = cardsByPosition.get(targetPosition)
    if (!source || source.position === targetPosition) return
    const positions = classeur.cards.map(card => ({
      id: card.id,
      position: card.id === source.id ? targetPosition : card.id === target?.id ? source.position : card.position
    }))
    setError('')
    try {
      await reorderCardsInClasseur(classeur.id, positions)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setDraggingId(null)
      setDropTargetPosition(null)
    }
  }

  useEffect(() => {
    if (createOpen && createDialog.current && !createDialog.current.open) createDialog.current.showModal()
  }, [createOpen])

  if (id && classeur) {
    return (
      <>
        <Crumbs items={[{ label: 'Mes classeurs', to: '/classeurs' }, { label: classeur.name }]} />
        <div className="set-head">
          <div>
            <h1>{classeur.name}</h1>
            <p className="lede" style={{ margin: 0 }}>{classeur.cards.length} carte{classeur.cards.length > 1 ? 's' : ''}</p>
          </div>
          <button className="btn" type="button" onClick={() => {
            setError('')
            deleteClasseur(classeur.id)
              .then(() => navigate('/classeurs'))
              .catch(cause => setError(cause.message))
          }}>Supprimer le classeur</button>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {classeur.cards.length ? (
          <>
            <div className="toolbar binder-view-toolbar">
              <label htmlFor="binder-layout">Cartes par page</label>
              <select id="binder-layout" value={layout} onChange={event => { setLayout(event.target.value); setSpread(0) }}>
                {binderLayouts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="binder-spread-nav" aria-label="Navigation des pages">
                <button className="btn" type="button" onClick={() => setSpread(Math.max(0, currentSpread - 1))} disabled={currentSpread === 0} aria-label="Double page précédente">←</button>
                <span className="count" aria-live="polite">Double page {currentSpread + 1} / {spreadCount}</span>
                <button className="btn" type="button" onClick={() => setSpread(Math.min(spreadCount - 1, currentSpread + 1))} disabled={currentSpread >= spreadCount - 1} aria-label="Double page suivante">→</button>
              </div>
            </div>
            <div className="binder-spread">
              {[0, 1].map(pageOffset => {
                const pageNumber = currentSpread * 2 + pageOffset + 1
                const firstIndex = (pageNumber - 1) * pageSize
                return (
                  <section className="binder-page" key={pageNumber} aria-label={`Page ${pageNumber}`}>
                    <h2 className="binder-page-title">Page {pageNumber}</h2>
                    <ul className="binder-page-grid" style={{ '--page-columns': columns }}>
                      {Array.from({ length: pageSize }, (_, slot) => {
                        const position = firstIndex + slot
                        const card = cardsByPosition.get(position)
                        return card ? (
                          <li
                            className={`binder-card${draggingId === card.id ? ' is-dragging' : ''}${dropTargetPosition === position ? ' is-drop-target' : ''}`}
                            key={card.id}
                            draggable
                            onDragStart={event => {
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', card.id)
                              setDraggingId(card.id)
                            }}
                            onDragEnd={() => { setDraggingId(null); setDropTargetPosition(null) }}
                            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetPosition(position) }}
                            onDrop={event => { event.preventDefault(); moveCard(event.dataTransfer.getData('text/plain'), position) }}
                          >
                            <button className="card" type="button" onClick={() => setPos(classeur.cards.findIndex(item => item.id === card.id))} aria-label={`${card.name}, carte ${card.localId}`}>
                              <span className="card-face">
                                {card.image
                                  ? <img src={cardImg(card.image, 'low')} alt="" loading="lazy" decoding="async" />
                                  : <span className="card-noimg">Image indisponible</span>}
                              </span>
                              <span className="card-cap"><b>{card.name}</b><small>{card.setName} · n° {card.localId}</small></span>
                            </button>
                            <button className="btn binder-remove" type="button" onClick={() => {
                              setError('')
                              removeCardFromClasseur(classeur.id, card.id).catch(cause => setError(cause.message))
                            }} aria-label={`Retirer ${card.name} du classeur`}>Retirer</button>
                          </li>
                        ) : (
                          <li
                            className={`binder-slot-empty${dropTargetPosition === position ? ' is-drop-target' : ''}`}
                            key={`empty-${pageNumber}-${slot}`}
                            aria-hidden="true"
                            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetPosition(position) }}
                            onDrop={event => { event.preventDefault(); moveCard(event.dataTransfer.getData('text/plain'), position) }}
                          />
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          </>
        ) : (
          <div className="state"><strong>Ce classeur est vide</strong>Parcourez les extensions et sélectionnez des cartes pour les ajouter.<br /><Link className="btn primary binder-browse" to="/">Parcourir les cartes</Link></div>
        )}
        {pos !== null && classeur.cards[pos] && (
          <CardDialog
            cards={classeur.cards}
            pos={pos}
            set={{ name: classeur.cards[pos].setName }}
            onPos={setPos}
            onClose={() => setPos(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Crumbs items={[{ label: 'Mes classeurs' }]} />
      <h1>Mes classeurs</h1>
      <p className="lede">Créez vos collections et retrouvez-y les cartes sélectionnées.</p>
      <div className="toolbar">
        <button className="btn primary" type="button" onClick={() => { setError(''); setCreateOpen(true) }}>Créer un classeur</button>
      </div>
      <dialog className="create-dialog" ref={createDialog} aria-labelledby="create-title" onClose={() => setCreateOpen(false)}>
        <form className="create-form" onSubmit={event => {
          event.preventDefault()
          setError('')
          setBusy(true)
          createClasseur(name.trim())
            .then(created => navigate(`/classeurs/${enc(created.id)}`))
            .catch(cause => setError(cause.message))
            .finally(() => setBusy(false))
        }}>
          <h2 id="create-title">Nouveau classeur</h2>
          <label htmlFor="binder-name">Nom du classeur</label>
          <input id="binder-name" className="search" value={name} onChange={event => setName(event.target.value)} placeholder="Ex. Collection de base" maxLength={60} autoFocus required />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="create-actions">
            <button className="btn" type="button" onClick={() => createDialog.current?.close()}>Annuler</button>
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      </dialog>
      {classeurs.length ? (
        <div className="binder-list">
          {classeurs.map(item => (
            <Link className="binder-row" key={item.id} to={`/classeurs/${enc(item.id)}`}>
              <span><b>{item.name}</b><small>{item.cards.length} carte{item.cards.length > 1 ? 's' : ''}</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="state"><strong>Aucun classeur pour le moment</strong>Créez votre premier classeur pour commencer votre collection.</div>
      )}
    </>
  )
}