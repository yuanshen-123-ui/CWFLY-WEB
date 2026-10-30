function normalizeFsdFlightPlan(plan) {
  const flightType = plan.flightType === 'VFR' ? 'V' : 'I'
  const tas = Number.parseInt(plan.cruiseSpeed, 10) || 450
  const depTime = plan.depTime ? String(plan.depTime).replace(/[^0-9]/g, '') : ''
  const alt = plan.cruiseAlt || '35000'
  const hrsEnroute = String(plan.flightTime || '').split(':')[0] || '0'
  const minEnroute = String(plan.flightTime || '').split(':')[1] || '0'
  const hrsFuel = String(plan.endurance || '').split(':')[0] || '0'
  const minFuel = String(plan.endurance || '').split(':')[1] || '0'

  return {
    flightType,
    tas,
    depTime,
    alt,
    hrsEnroute,
    minEnroute,
    hrsFuel,
    minFuel,
    depIcao: String(plan.depIcao || '').toUpperCase(),
    arrIcao: String(plan.arrIcao || '').toUpperCase(),
    alternate: String(plan.alternate || '').toUpperCase(),
    remarks: String(plan.remarks || ''),
    route: String(plan.route || ''),
    aircraft: String(plan.aircraft || ''),
    callsign: String(plan.callsign || '').toUpperCase(),
  }
}

export function buildFsdFlightPlanPayload(plan) {
  const normalized = normalizeFsdFlightPlan(plan)
  const parts = [
    normalized.callsign,   // parts[0] = callsign（fsd-py 解析必需）
    '0',                    // parts[1] = revision
    normalized.flightType,
    normalized.aircraft,
    String(normalized.tas),
    normalized.depIcao,
    normalized.depTime,
    '0',
    normalized.alt,
    normalized.arrIcao,
    normalized.hrsEnroute,
    normalized.minEnroute,
    normalized.hrsFuel,
    normalized.minFuel,
    normalized.alternate,
    normalized.remarks,
    normalized.route,
  ]

  return parts.join(':')
}

export function buildFsdFlightPlanMessage(plan) {
  return `$FP${buildFsdFlightPlanPayload(plan)}\r\n`
}
