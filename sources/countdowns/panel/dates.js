// Shared by the panel and the card: whole days from today to a yyyy-mm-dd date.
export function daysUntil(date) {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86400000)
}

/** Dates from today on, soonest first. */
export function upcoming(events) {
  return events.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
}
