import { useEffect, useRef, useState } from 'react'
import { matchOwnedVariants } from '../data/collection.js'

export default function VariantDialog({ card, variants, ownedVariants, onSave, onClose }) {
  const ref = useRef(null)
  const [quantities, setQuantities] = useState(() => Object.fromEntries(
    matchOwnedVariants(variants, ownedVariants).map(variant => [variant.id, variant.quantity])
  ))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = variants
    .filter(variant => Number(quantities[variant.id]) > 0)
    .map(variant => ({ ...variant, quantity: Number(quantities[variant.id]) }))

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const changeQuantity = (variant, quantity) => setQuantities(current => ({
    ...current,
    [variant.id]: Math.max(0, Math.min(99, Number(quantity) || 0))
  }))

  return (
    <dialog className="variant-dialog" ref={ref} aria-labelledby="variant-title" onClose={onClose}>
      <form className="variant-form" onSubmit={async event => {
        event.preventDefault()
        setSaving(true)
        setError('')
        try {
          await onSave(card, selected)
          ref.current?.close()
        } catch (cause) {
          setError(cause.message)
        } finally {
          setSaving(false)
        }
      }}>
        <h2 id="variant-title">Variantes de {card.name}</h2>
        <p className="variant-subtitle">Coche les versions que tu possèdes.</p>
        <fieldset className="variant-options">
          <legend>Variantes disponibles</legend>
          {variants.map(variant => (
            <div className="variant-option" key={variant.id}>
              <span className="variant-name">{variant.label}</span>
              <button className="variant-step" type="button" disabled={!quantities[variant.id]} onClick={() => changeQuantity(variant, Number(quantities[variant.id]) - 1)} aria-label={`Retirer un exemplaire ${variant.label}`}>−</button>
              <input
                className="variant-quantity"
                type="number"
                min="0"
                max="99"
                value={quantities[variant.id] || 0}
                onChange={event => changeQuantity(variant, event.target.value)}
                aria-label={`Nombre d’exemplaires ${variant.label}`}
              />
              <button className="variant-step" type="button" disabled={Number(quantities[variant.id]) >= 99} onClick={() => changeQuantity(variant, Number(quantities[variant.id] || 0) + 1)} aria-label={`Ajouter un exemplaire ${variant.label}`}>+</button>
            </div>
          ))}
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="create-actions">
          <button className="btn" type="button" onClick={() => ref.current?.close()}>Annuler</button>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </dialog>
  )
}