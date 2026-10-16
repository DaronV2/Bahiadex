// États de chargement et d'erreur réutilisés par les pages de catalogue.
export function SkeletonTiles({ count = 8 }) {
  return (
    <div className="tiles" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton sk-tile" />
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 12 }) {
  return (
    <ul className="cards" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="skeleton sk-card" />
      ))}
    </ul>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state" role="alert">
      <strong>Impossible de charger les données</strong>
      {error?.message || 'Erreur réseau'}. Vérifiez votre connexion, puis réessayez.
      <br />
      <button className="btn primary" type="button" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  )
}