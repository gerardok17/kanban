import { formatDateTime } from '@/lib/dates'

// Built from local parts, so the expectations hold in any time zone.
const local = (year: number, month: number, day: number, hours = 9, minutes = 17) =>
  new Date(year, month, day, hours, minutes).toISOString()
const now = new Date(2026, 8, 27, 12, 0)

describe('formatDateTime', () => {
  it('writes a short month, an ordinal day, and a 24-hour time', () => {
    expect(formatDateTime(local(2026, 8, 17), now)).toBe('Sept 17th 09:17')
    expect(formatDateTime(local(2026, 0, 5, 23, 5), now)).toBe('Jan 5th 23:05')
  })

  it('adds the year only when it is not the current one', () => {
    expect(formatDateTime(local(2025, 11, 31, 22, 40), now)).toBe('Dec 31st, 2025 22:40')
  })

  it('uses the right ordinal suffix', () => {
    const suffixes = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map((day) =>
      formatDateTime(local(2026, 9, day), now).split(' ')[1],
    )
    expect(suffixes).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ])
  })
})
