const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' })
const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
}

const pad = (value: number) => String(value).padStart(2, '0')

// "Sept 17th 09:17" in the viewer's local time, with the year only when it is
// not the current one: "Sept 17th, 2025 09:17". The API sends timestamps with
// an explicit UTC offset, so the Date converts them.
export const formatDateTime = (iso: string, now = new Date()) => {
  const date = new Date(iso)
  const day = date.getDate()
  const suffix = ORDINAL_SUFFIXES[ordinalRules.select(day)] ?? 'th'
  const year = date.getFullYear() === now.getFullYear() ? '' : `, ${date.getFullYear()}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${MONTHS[date.getMonth()]} ${day}${suffix}${year} ${time}`
}
