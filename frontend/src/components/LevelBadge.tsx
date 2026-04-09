interface LevelBadgeProps {
  level: string;
}

const LEVEL_ICONS: Record<string, string> = {
  fatal:     "💀",
  error:     "✖",
  exception: "⚡",
  warning:   "⚠",
  info:      "ℹ",
  debug:     "🐛",
};

export function LevelBadge({ level }: LevelBadgeProps) {
  const normalized = level.toLowerCase().trim();
  const icon = LEVEL_ICONS[normalized] ?? "●";
  return (
    <span className={`level-badge ${normalized}`} aria-label={`Nivel: ${level}`}>
      <span aria-hidden="true">{icon}</span>
      {level}
    </span>
  );
}
