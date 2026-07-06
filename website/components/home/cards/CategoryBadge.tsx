export function CategoryBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: color,
        color: '#050508',
        marginBottom: '10px',
      }}
    >
      {label}
    </span>
  )
}
