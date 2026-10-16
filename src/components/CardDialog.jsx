import { useEffect, useRef } from 'react'
import { cardImg, enc, get } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import { useAsync } from '../hooks/index.js'

const Fact = ({ label, value }) => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return null
  return (
    <div>
      <dt>{label}</dt>
      <dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
    </div>
  )
}

const fmtMods = list => (list || []).map(w => `${w.type} ${w.value || ''}`.trim())

export default function CardDialog({ cards, pos, set, onPos, onClose }) {
  const lang = useLang()
  const ref = useRef(null)
  const base = cards[pos]
  const [state] = useAsync(() => get(lang, `/cards/${enc(base.id)}`), [lang, base.id])
  const full = state.status === 'ok' ? state.data : null
  const c = full || base

  // Dialogue modal natif : Échap, focus et fond assombri sont gérés par le navigateur
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const close = () => ref.current?.close()
  const go = d => {
    const n = pos + d
    if (n >= 0 && n < cards.length) onPos(n)
  }

  const attacks = full?.attacks || []
  const weak = fmtMods(full?.weaknesses)
  const resist = fmtMods(full?.resistances)

  return (
    <dialog
      ref={ref}
      aria-label={`Détail de la carte ${c.name}`}
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) close() }}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <div className="dlg">
        <div className="dlg-img">
          {c.image
            ? <img key={c.id} src={cardImg(c.image, 'high')} alt={`Carte ${c.name}`} />
            : <div className="state">Image indisponible</div>}
        </div>

        <div className="dlg-body">
          <div className="dlg-top">
            <div>
              <h2 className="dlg-title">{c.name}</h2>
              <p className="dlg-sub">
                {set?.name} · n° {c.localId}{set?.cardCount ? ` / ${set.cardCount.official}` : ''}
              </p>
            </div>
            <button className="btn" type="button" onClick={close} aria-label="Fermer">✕</button>
          </div>

          {full ? (
            <>
              <dl className="facts">
                <Fact label="Catégorie" value={full.category} />
                <Fact label="Rareté" value={full.rarity} />
                <Fact label="PV" value={full.hp} />
                <Fact label="Type" value={full.types} />
                <Fact label="Stade" value={full.stage} />
                <Fact label="Évolue de" value={full.evolveFrom} />
                <Fact label="Illustrateur" value={full.illustrator} />
                <Fact label="Retraite" value={full.retreat} />
              </dl>

              {attacks.length > 0 && (
                <div className="block">
                  <h3>Attaques</h3>
                  {attacks.map((a, i) => (
                    <div className="attack" key={i}>
                      <div className="attack-head">
                        <span>{(a.cost || []).join(' ')} {a.name}</span>
                        <span>{a.damage ?? ''}</span>
                      </div>
                      {a.effect && <p>{a.effect}</p>}
                    </div>
                  ))}
                </div>
              )}

              {(weak.length > 0 || resist.length > 0) && (
                <dl className="facts">
                  <Fact label="Faiblesse" value={weak} />
                  <Fact label="Résistance" value={resist} />
                </dl>
              )}

              {full.description && (
                <div className="block">
                  <h3>Description</h3>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>{full.description}</p>
                </div>
              )}
            </>
          ) : state.status === 'loading' ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : null}

          <div className="pager">
            <button className="btn" type="button" onClick={() => go(-1)} disabled={pos <= 0}>← Précédente</button>
            <button className="btn" type="button" onClick={() => go(1)} disabled={pos >= cards.length - 1}>Suivante →</button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
