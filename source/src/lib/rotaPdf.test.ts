import { expect, it } from 'vitest'
import { createRotaPdf } from './rotaPdf'
import { CONSULTATIONS, DEMO_STAFF } from '../data/constants'
import { buildDemoSchedule } from '../data/demoSchedule'

it('fits the complete team and the legend on one PDF page', () => {
  const pdf = createRotaPdf('2026-10', DEMO_STAFF, buildDemoSchedule(), CONSULTATIONS)
  expect(pdf.getNumberOfPages()).toBe(1)
  expect(pdf.output()).toContain('/Count 1')
})
