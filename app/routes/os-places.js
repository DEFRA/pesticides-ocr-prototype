//
// OS Places postcode search, used by the versioned journeys' address lookups.
// https://docs.os.uk/os-apis/accessing-os-apis/os-places-api
//
const Fuse = require('fuse.js')

// Includes the response body in the error so the log shows why it failed.
const failedResponse = async (response) => {
  const body = await response.text().catch(() => '')
  return new Error('the API returned ' + response.status + ': ' + body)
}

const COUNTRIES = {
  E: 'England',
  S: 'Scotland',
  W: 'Wales',
  N: 'Northern Ireland'
}

// The API returns everything in capitals: "PESTICIDES HOUSE" → "Pesticides House".
const titleCase = (text) =>
  text.toLowerCase().replace(/(^|[\s\-'(])\S/g, (c) => c.toUpperCase())

// Splits a DPA record into the lines we show and store: everything above the
// town, one part per line, eg ["Flat 2", "Pesticides House", "10 Chemical Close"].
const addressLines = (dpa) => {
  const street = [dpa.DEPENDENT_THOROUGHFARE_NAME, dpa.THOROUGHFARE_NAME]
    .filter(Boolean)
    .join(', ')
  return [
    dpa.ORGANISATION_NAME,
    dpa.SUB_BUILDING_NAME,
    dpa.BUILDING_NAME,
    [dpa.BUILDING_NUMBER, street].filter(Boolean).join(' '),
    dpa.DOUBLE_DEPENDENT_LOCALITY,
    dpa.DEPENDENT_LOCALITY
  ]
    .filter(Boolean)
    .map(titleCase)
}

const findAddresses = async (postcode) => {
  for (const name of ['OS_API_URL', 'OS_API_KEY']) {
    if (!process.env[name]) throw new Error(name + ' is not set')
  }
  const response = await fetch(
    process.env.OS_API_URL +
      '?postcode=' +
      encodeURIComponent(postcode) +
      '&key=' +
      encodeURIComponent(process.env.OS_API_KEY)
  )
  // 400 = not a postcode.
  if (response.status === 400) return []
  if (!response.ok) throw await failedResponse(response)
  const body = await response.json()
  // results is left out when nothing is at that postcode.
  return (body.results || []).map(({ DPA }) => ({
    uprn: DPA.UPRN,
    addressLine: DPA.ADDRESS,
    buildingNumber: DPA.BUILDING_NUMBER,
    buildingName: DPA.BUILDING_NAME,
    subBuildingName: DPA.SUB_BUILDING_NAME,
    lines: addressLines(DPA),
    town: titleCase(DPA.POST_TOWN || ''),
    postcode: DPA.POSTCODE,
    country: COUNTRIES[DPA.COUNTRY_CODE] || ''
  }))
}

const buildingValues = (address) =>
  [address.buildingNumber, address.buildingName, address.subBuildingName].map(
    (value) => String(value || '').toLowerCase()
  )

// addressLine has commas between parts ("10, DOWNING STREET, …") but people
// type without them.
const withoutCommas = (text) => text.replace(/,/g, '')

// Catches small typos, eg "Prospct Cottage". Best match first. The match can be
// anywhere in the address, as organisation names often come first.
const fuzzyMatches = (addresses, text) =>
  new Fuse(addresses, {
    keys: ['addressLine'],
    getFn: (address) => withoutCommas(address.addressLine),
    ignoreFieldNorm: true,
    ignoreLocation: true,
    threshold: 0.4
  }).search(withoutCommas(text))

// Exact matches win, so "4" finds number 4 and not 40–49 too. Then anything
// starting with it, then a fuzzy match on the whole address for typos like
// "Prospct Cottage". A number with no match is just not there, so it gets no
// fuzzy match (it would hit every address with a 4 in it).
const filterByBuilding = (addresses, building) => {
  const wanted = building.trim().toLowerCase()
  const exact = addresses.filter((a) => buildingValues(a).includes(wanted))
  if (exact.length > 0) return exact
  const startsWith = addresses.filter((a) =>
    buildingValues(a).some((value) => value && value.startsWith(wanted))
  )
  if (startsWith.length > 0 || /^\d+[a-z]?$/.test(wanted)) return startsWith

  // "4 Portland Rd": the number has to match exactly, since fuzzy matching
  // can't tell 4 from 14 or 24. The rest is matched fuzzily among those.
  const [, number, rest] = wanted.match(/^(\d+[a-z]?),?\s+(.+)$/) || []
  if (number) {
    const numbered = addresses.filter(
      (a) => String(a.buildingNumber || '').toLowerCase() === number
    )
    const matches = fuzzyMatches(numbered, rest)
    return matches.length > 0 ? matches.map((m) => m.item) : numbered
  }
  return fuzzyMatches(addresses, building).map((m) => m.item)
}

// Shown in the error summary at the top of the page.
const serviceError = (err) => ({
  errorList: [{ text: 'Address lookup failed: ' + err.message }]
})

module.exports = { findAddresses, filterByBuilding, serviceError }
