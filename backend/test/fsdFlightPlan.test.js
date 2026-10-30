import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFsdFlightPlanPayload } from '../src/services/fsdFlightPlan.js'

test('buildFsdFlightPlanPayload uses the FSD-compatible field order', () => {
  const payload = buildFsdFlightPlanPayload({
    flightType: 'IFR',
    aircraft: 'A320',
    cruiseSpeed: '450',
    depIcao: 'zsss',
    depTime: '2204',
    cruiseAlt: '35000',
    arrIcao: 'zgha',
    flightTime: '02:30',
    endurance: '04:00',
    alternate: 'zhhh',
    remarks: 'RMK',
    route: 'A461'
  })

  const parts = payload.split(':')
  assert.equal(parts[0], 'I')
  assert.equal(parts[1], 'A320')
  assert.equal(parts[3], 'ZSSS')
  assert.equal(parts[7], 'ZGHA')
  assert.equal(parts[12], 'ZHHH')
  assert.equal(parts[13], 'RMK')
  assert.equal(parts[14], 'A461')
})
