// The new tab card: the next three dates, counted in days. Atelier draws the lines.
import { daysUntil, upcoming } from '../panel/dates.js'

export async function run() {
  const events = upcoming((await atelier.storage.get('events')) ?? [])
  if (events.length === 0) return 'Add a date in the Countdowns panel.'
  return events.slice(0, 3).map((e) => {
    const days = daysUntil(e.date)
    return `${e.name}: ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`
  })
}
