const Fuse = require('fuse.js')
const { filled, validate } = require('./journey-helpers')

const SEARCH_FIELDS = [
  'lookup-postcode',
  'lookup-building',
  'lookup-results',
  'lookup-show',
  'address-choice',
  'address-correct',
  'address-selected'
]

const clearSearch = (data) => SEARCH_FIELDS.forEach((f) => delete data[f])

// Includes the response body in the error so the log shows why it failed.
const failedResponse = async (response) => {
  const body = await response.text().catch(() => '')
  return new Error('the API returned ' + response.status + ': ' + body)
}

// OS Places postcode search:
// https://docs.os.uk/os-apis/accessing-os-apis/os-places-api
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
    subBuildingName: DPA.SUB_BUILDING_NAME
  }))
}

const matchesBuilding = (address, building) =>
  [address.buildingNumber, address.buildingName, address.subBuildingName].some(
    (value) => (value || '').toLowerCase().startsWith(building.toLowerCase())
  )

// addressLine has commas between parts ("10, DOWNING STREET, …") but people
// type the first line without them.
const withoutCommas = (text) => text.replace(/,/g, '')

// Catches small typos in the first line, eg "10 Downing Stret".
const closestAddress = (addresses, line1) => {
  const fuse = new Fuse(addresses, {
    keys: ['addressLine'],
    getFn: (address) => withoutCommas(address.addressLine),
    ignoreFieldNorm: true,
    threshold: 0.4
  })
  const [best] = fuse.search(line1)
  return best && best.item.addressLine
}

// Shown in the error summary at the top of the page.
const serviceError = (err) => ({
  errorList: [{ text: 'Address lookup failed: ' + err.message }]
})

const renderLookup = (res, data, locals) =>
  res.render('address-lookup', { data: { ...data }, ...locals })

module.exports = (router) => {
  router.get('/address-lookup', (req, res, next) => {
    const data = req.session.data
    if (data['lookup-show']) delete data['lookup-show']
    else clearSearch(data)
    res.locals.data = { ...data }
    next()
  })

  router.get('/address-confirm', (req, res, next) => {
    if (!req.session.data['address-selected']) {
      return res.redirect('/address-lookup')
    }
    next()
  })

  router.post('/address-lookup', async (req, res) => {
    const data = req.session.data
    delete data['lookup-results']

    const postcode = data['lookup-postcode']
    const building = data['lookup-building']
    const v = validate([
      {
        field: 'lookup-postcode',
        message: 'Enter a postcode',
        valid: filled(postcode)
      }
    ])
    if (!v.ok) return renderLookup(res, data, v)

    let addresses
    try {
      addresses = await findAddresses(postcode)
    } catch (err) {
      console.error('Address lookup failed for postcode ' + postcode, err)
      return renderLookup(res, data, serviceError(err))
    }

    if (filled(building)) {
      addresses = addresses.filter((a) => matchesBuilding(a, building))
    }
    if (addresses.length === 0) {
      return renderLookup(
        res,
        data,
        validate([
          {
            field: 'lookup-postcode',
            message: 'No addresses found',
            valid: false
          }
        ])
      )
    }

    data['lookup-results'] = addresses.map((a) => ({
      value: a.uprn,
      text: a.addressLine
    }))

    if (addresses.length === 1) {
      data['address-selected'] = data['lookup-results'][0]
      return res.redirect('/address-confirm')
    }
    data['lookup-show'] = true
    res.redirect('/address-lookup')
  })

  router.post('/address-select', (req, res) => {
    const data = req.session.data

    const chosen = (data['lookup-results'] || []).find(
      (address) => address.value === data['address-choice']
    )
    const v = validate([
      {
        field: 'address-choice',
        message: 'Select an address',
        valid: Boolean(chosen)
      }
    ])
    if (!v.ok) return renderLookup(res, data, v)

    data['address-selected'] = chosen
    res.redirect('/address-confirm')
  })

  router.post('/address-confirm', (req, res) => {
    const data = req.session.data
    const v = validate([
      {
        field: 'address-correct',
        message: 'Select yes if this is the correct address',
        valid: filled(data['address-correct'])
      }
    ])
    if (!v.ok) return res.render('address-confirm', v)

    if (data['address-correct'] === 'no') return res.redirect('/address-lookup')

    res.render('address-confirm', { confirmed: true })
  })

  router.post('/address-validate', async (req, res) => {
    const data = req.session.data
    const line1 = data['validate-line-1']
    let addresses
    try {
      addresses = await findAddresses(data['validate-postcode'])
    } catch (err) {
      console.error(
        'Address validation failed for postcode ' + data['validate-postcode'],
        err
      )
      return res.render('address-validate', serviceError(err))
    }
    const found = addresses.some((a) =>
      withoutCommas(a.addressLine)
        .toLowerCase()
        .startsWith(withoutCommas(line1).toLowerCase())
    )
    const suggestion = found ? undefined : closestAddress(addresses, line1)
    res.render('address-validate', { found, suggestion })
  })
}
