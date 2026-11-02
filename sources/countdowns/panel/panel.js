// The Countdowns panel: add a date, see how far away each one is, remove it.
// Dates live in the pack's own storage, which the new tab card reads too.
import { daysUntil, upcoming } from './dates.js'

const list = document.getElementById('list')
const status = document.getElementById('status')
const form = document.getElementById('add')
const nameInput = document.getElementById('name')
const dateInput = document.getElementById('date')

async function load() {
  return (await apex.storage.get('events')) ?? []
}

async function save(events) {
  await apex.storage.set('events', events)
}

function label(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

async function render() {
  const events = upcoming(await load())
  list.replaceChildren(
    ...events.map((event) => {
      const li = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = event.name
      const days = document.createElement('span')
      days.className = 'days'
      days.textContent = label(daysUntil(event.date))
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'remove'
      remove.textContent = 'Remove'
      remove.setAttribute('aria-label', `Remove ${event.name}`)
      remove.addEventListener('click', async () => {
        await save((await load()).filter((e) => !(e.name === event.name && e.date === event.date)))
        status.textContent = `Removed ${event.name}.`
        await render()
      })
      li.append(name, days, remove)
      return li
    }),
  )
  if (events.length === 0) status.textContent = 'No dates yet. Add one above.'
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = nameInput.value.trim()
  const date = dateInput.value
  if (!name || !date) return
  if (daysUntil(date) < 0) {
    status.textContent = 'Pick today or a later date.'
    return
  }
  const events = await load()
  await save([...events, { name, date }].slice(-50))
  form.reset()
  status.textContent = `Added ${name}.`
  await render()
})

render()
