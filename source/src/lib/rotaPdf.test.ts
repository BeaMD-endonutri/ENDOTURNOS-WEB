import { expect, it } from 'vitest'
import { createRotaPdf } from './rotaPdf'
import { CONSULTATIONS, DEMO_STAFF } from '../data/constants'
import { buildDemoSchedule } from '../data/demoSchedule'

it('fits the complete team, morning and afternoon blocks, and the legend on one PDF page', () => {
  const pdf = createRotaPdf('2026-10', DEMO_STAFF, buildDemoSchedule(), CONSULTATIONS)
  expect(pdf.getNumberOfPages()).toBe(1)
  expect(pdf.output()).toContain('/Count 1')
})

it('keeps a full team month on a single landscape sheet without per-assignment time labels', () => {
  const pdf = createRotaPdf('2026-10', DEMO_STAFF, buildDemoSchedule(), CONSULTATIONS)
  const output = pdf.output()
  expect(output).toContain('Mañanas')
  expect(output).toContain('Tardes')
  expect(output).not.toContain('08:00-15:00')
  expect(output).not.toContain('15:00-20:00')
})


it('shows an 08:00–20:00 assignment in both morning and afternoon PDF bands', () => {
  const staff = [DEMO_STAFF[0]]
  const assignment = {
    ...buildDemoSchedule()[0],
    professional_id: staff[0].id,
    work_date: '2026-10-06',
    consultation_id: 'NUTRICION',
    start_time: '08:00',
    end_time: '20:00',
  }
  const pdf = createRotaPdf('2026-10', staff, [assignment], CONSULTATIONS)
  const output = pdf.output()
  const matches = output.match(/NUT/g) ?? []
  expect(matches.length).toBeGreaterThanOrEqual(2)
})
