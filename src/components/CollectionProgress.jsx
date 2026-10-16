// Barre de progression commune aux vues de série et d'extension.
export function CollectionProgress({ label, owned, total, loading = false }) {
  const percentage = total > 0 ? Math.min(100, Math.round(owned / total * 100)) : 0

  return (
    <div className="collection-progress">
      <div className="progress-copy">
        <span>{label}</span>
        <span>
          {loading
            ? 'Chargement…'
            : total > 0
              ? `${percentage}% · ${owned} / ${total}`
              : 'Données indisponibles'}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`Progression de ${label}`}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percentage}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}