import { getCachedWhazzup } from '../src/services/whazzup.js'
import { getAtcClients, getPilotTrails } from '../src/services/fsdTracker.js'
import { getControllerBoundaries } from '../src/services/controllerBoundaries.js'

const whazzup = getCachedWhazzup()
console.log('=== Whazzup Cache ===')
console.log('Controllers:', JSON.stringify(whazzup?.controllers || [], null, 2))

const atc = getAtcClients()
console.log('\n=== ATC Clients (from tracker) ===')
console.log('Count:', atc.length)
console.log(JSON.stringify(atc, null, 2))

const boundaries = getControllerBoundaries(atc)
console.log('\n=== Boundaries ===')
console.log('Count:', boundaries.length)
console.log(JSON.stringify(boundaries, null, 2))

const pilots = getPilotTrails()
console.log('\n=== Pilots ===')
console.log('Count:', pilots.length)
