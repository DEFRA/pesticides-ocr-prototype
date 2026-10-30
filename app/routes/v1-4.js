//
// OCR register journey — version 1.4 (Figma master, "Future OCR register flow
// v1.4"). Mounted under /v1-4. Covers users of professional PPPs and sellers of
// amateur PPPs, with contact details and email verification first.
//
const {
  toArray,
  filled,
  validate,
  consumeReturnTo
} = require('./journey-helpers')
const { findAddresses, filterByBuilding, serviceError } = require('./os-places')
const { registrationPdf } = require('./v1-4-pdf')

const V = 'v1-4'
const P = '/' + V
const view = (name) => V + '/' + name

const SERVICE_NAME = 'Register work involving pesticides'
const REGISTRATION_REF = 'PPP-409-28G'

const USING = 'using'
const SELLING = 'selling'
const ACTIVITY_LABELS = {
  [USING]: 'Using PPPs as part of your work',
  [SELLING]: 'Seller of amateur plant protection products'
}

const ANOTHER_ORG = 'Another organisation applies PPPs on our behalf'
const STORE_OWN = 'At sites we own'
const STORE_THIRD_PARTY = 'By a third party on our behalf'
const STORE_NONE = 'We do not store PPPs'
const SITE_MAIN = 'main'
const SITE_ANOTHER = 'another'

// Sample contact details for a participant who opens the email link in a
// browser that has none, so check answers still reads as a real registration.
const SAMPLE_CONTACT = {
  'contact-name': 'John Smith',
  'contact-job-title': 'Head of PPPs',
  'contact-telephone': '01234 567890',
  'contact-email': 'john@pesticides.co.uk'
}

const sectors = (d) => toArray(d.sector)
const hasSector = (d, sector) => sectors(d).includes(sector)
const activities = (d) => toArray(d.activities)
const storedAt = (d) => toArray(d['store-applied'])
const storeSites = (d) => toArray(d['store-sites'])
const storageAddresses = (d) => d['storage-addresses'] || []

// The pages of the activity flows, in order, for the answers so far.
const usingRoute = (d) => [
  'who-applies',
  ...(d['who-applies'] === ANOTHER_ORG ? ['third-party'] : []),
  'sector',
  ...(hasSector(d, 'Agriculture') ? ['agri-subsectors'] : []),
  ...(hasSector(d, 'Amenity') ? ['amenity-subsectors'] : []),
  ...(hasSector(d, 'Horticulture') ? ['horti-subsectors'] : []),
  ...(hasSector(d, 'Agriculture') || hasSector(d, 'Horticulture')
    ? ['assurance-schemes']
    : []),
  'store-applied',
  ...(storedAt(d).includes(STORE_OWN) ? ['store-sites'] : []),
  ...(storedAt(d).includes(STORE_OWN) && storeSites(d).includes(SITE_ANOTHER)
    ? ['storage-addresses']
    : []),
  ...(storedAt(d).includes(STORE_THIRD_PARTY)
    ? ['store-3rd-party-contact']
    : []),
  'quantity'
]
const activityRoute = (d) => [
  ...(activities(d).includes(USING) ? usingRoute(d) : []),
  ...(activities(d).includes(SELLING) ? ['sell-amateur-quantity'] : [])
]
const routeAfter = (d, page) => {
  const route = activityRoute(d)
  return route.slice(route.indexOf(page) + 1)
}

// Whether each activity page has been answered, so a check answers Change can
// walk only the pages a new answer needs.
const answered = {
  'who-applies': (d) => filled(d['who-applies']),
  'third-party': (d) => filled(d['third-party-name']),
  sector: (d) => sectors(d).length > 0 || filled(d['sector-other']),
  'agri-subsectors': (d) =>
    toArray(d['agri-subsector']).length > 0 ||
    filled(d['agri-subsector-other']),
  'amenity-subsectors': (d) =>
    toArray(d['amenity-subsector']).length > 0 ||
    filled(d['amenity-subsector-other']),
  'horti-subsectors': (d) =>
    toArray(d['horti-subsector']).length > 0 ||
    filled(d['horti-subsector-other']),
  // Optional page: submitting it always sends the Other box, even when empty.
  'assurance-schemes': (d) =>
    d['assurance-schemes-other'] !== undefined ||
    toArray(d['assurance-schemes']).length > 0,
  'store-applied': (d) => storedAt(d).length > 0,
  'store-sites': (d) => storeSites(d).length > 0,
  'storage-addresses': (d) => storageAddresses(d).length > 0,
  'store-3rd-party-contact': (d) => filled(d['store-3p-name']),
  quantity: (d) => filled(d.quantity),
  'sell-amateur-quantity': (d) => filled(d['sell-amateur-quantity'])
}

// On to the first of `steps`, or check answers. After a check answers Change,
// to the first unanswered step instead (keeping returnTo), or straight back.
const goNext = (req, res, steps) => {
  const d = req.session.data
  const pending =
    d.returnTo && steps.find((page) => answered[page] && !answered[page](d))
  if (pending) return res.redirect(P + '/' + pending)
  res.redirect(P + '/' + (consumeReturnTo(req) || steps[0] || 'check-answers'))
}

// Back links for the activity pages follow the route taken.
const activityBack = (d, page) => {
  const route = activityRoute(d)
  const index = route.indexOf(page)
  return index > 0 ? route[index - 1] : 'activities'
}

// Check answers rows, shared with the PDF download. Each row is
// { key, lines, change }, where change is the page the Change link opens.
const addressLines = (address) =>
  [
    address.line1,
    address.line2,
    address.town,
    address.postcode,
    address.country
  ].filter(filled)
const mainAddressLines = (d) =>
  filled(d['international-address'])
    ? d['international-address'].split(/\r?\n/).filter(filled)
    : addressLines({
        line1: d['address-line-1'],
        line2: d['address-line-2'],
        town: d['address-town'],
        postcode: d['address-postcode'],
        country: d['address-country']
      })
const withOther = (values, other) => [
  ...toArray(values),
  ...(filled(other) ? [other] : [])
]

const businessRows = (d) => [
  {
    key: 'Business PPP activities',
    lines: activities(d).map((activity) => ACTIVITY_LABELS[activity]),
    change: 'activities'
  },
  {
    key: 'Business name',
    lines: [d['business-name']],
    change: 'business-name'
  },
  { key: 'Main address', lines: mainAddressLines(d), change: 'address-lookup' },
  {
    key: 'Contact name',
    lines: [d['contact-name']],
    change: 'contact-details'
  },
  {
    key: 'Contact role',
    lines: [d['contact-job-title']],
    change: 'contact-details'
  },
  {
    key: 'Contact email',
    lines: [d['contact-email']],
    change: 'contact-details'
  },
  {
    key: 'Contact telephone',
    lines: [d['contact-telephone']],
    change: 'contact-details'
  }
]

const storeLocationRows = (d) => {
  const locations = []
  if (storedAt(d).includes(STORE_OWN)) {
    if (storeSites(d).includes(SITE_MAIN)) {
      locations.push({
        lines: ['At the main business address'],
        change: 'store-sites'
      })
    }
    if (storeSites(d).includes(SITE_ANOTHER)) {
      storageAddresses(d).forEach((address) =>
        locations.push({
          lines: addressLines(address),
          change: 'storage-addresses'
        })
      )
    }
  }
  if (storedAt(d).includes(STORE_THIRD_PARTY)) {
    locations.push({
      lines: [
        d['store-3p-name'],
        d['store-3p-business'],
        d['store-3p-telephone'],
        d['store-3p-email']
      ].filter(filled),
      change: 'store-3rd-party-contact'
    })
  }
  return locations.map((location, index) => ({
    key:
      index === 0 ? 'PPP store location' : 'PPP store location ' + (index + 1),
    ...location
  }))
}

const subsectorRow = (d, sector, key, prefix, page) =>
  hasSector(d, sector)
    ? [
        {
          key,
          lines: withOther(
            d[prefix + '-subsector'],
            d[prefix + '-subsector-other']
          ),
          change: page
        }
      ]
    : []

const usingRows = (d) => [
  {
    key: 'Who applies PPPs?',
    lines: [d['who-applies']],
    change: 'who-applies'
  },
  ...(d['who-applies'] === ANOTHER_ORG
    ? [
        {
          key: 'Third party details',
          lines: [
            d['third-party-name'],
            ...addressLines({
              line1: d['third-party-line-1'],
              line2: d['third-party-line-2'],
              town: d['third-party-town'],
              postcode: d['third-party-postcode'],
              country: d['third-party-country']
            })
          ].filter(filled),
          change: 'third-party'
        }
      ]
    : []),
  {
    key: 'Main sectors of work',
    lines: withOther(d.sector, d['sector-other']),
    change: 'sector'
  },
  ...subsectorRow(
    d,
    'Agriculture',
    'Agriculture sectors',
    'agri',
    'agri-subsectors'
  ),
  ...subsectorRow(
    d,
    'Amenity',
    'Amenity sectors',
    'amenity',
    'amenity-subsectors'
  ),
  ...subsectorRow(
    d,
    'Horticulture',
    'Horticulture sectors',
    'horti',
    'horti-subsectors'
  ),
  ...(hasSector(d, 'Agriculture') || hasSector(d, 'Horticulture')
    ? [
        {
          key: 'Assurance schemes',
          lines: withOther(
            d['assurance-schemes'],
            d['assurance-schemes-other']
          ),
          change: 'assurance-schemes'
        }
      ]
    : []),
  {
    key: 'Where are PPPs stored?',
    lines: storedAt(d),
    change: 'store-applied'
  },
  ...storeLocationRows(d),
  {
    key: 'Quantity of PPPs or adjuvants used in the last year',
    lines: filled(d.quantity) ? [d.quantity + ' Kgs/litres'] : [],
    change: 'quantity'
  }
]

const sellingRows = (d) => [
  {
    key: 'Total value of PPPs sold in a typical year',
    lines: filled(d['sell-amateur-quantity'])
      ? ['£' + d['sell-amateur-quantity']]
      : [],
    change: 'sell-amateur-quantity'
  }
]

const registrationSummary = (d) => ({
  businessRows: businessRows(d),
  usingRows: activities(d).includes(USING) ? usingRows(d) : null,
  sellingRows: activities(d).includes(SELLING) ? sellingRows(d) : null,
  // With both activities, check answers and the PDF give each its own heading.
  bothActivities:
    activities(d).includes(USING) && activities(d).includes(SELLING)
})

// OS Places address lookup: search page → select page (more than one match) →
// result page → `next`. "Use this address" copies the chosen address into the
// same fields the manual page fills, or hands it to `save` if given. The select
// and result pages share templates in includes/, given this config as `lookup`.
const addressLookup = (router, lookup) => {
  const resultsKey = lookup.name + '-lookup-results'
  const selectedKey = lookup.name + '-lookup-selected'
  const choiceField = lookup.name + '-address-choice'
  const locals = { lookup: { ...lookup, resultsKey, selectedKey, choiceField } }
  const renderSearch = (res, extra) =>
    res.render(view(lookup.search), { ...locals, ...extra })

  router.post(P + '/' + lookup.search, async (req, res) => {
    const d = req.session.data
    delete d[resultsKey]
    delete d[selectedKey]

    const postcode = d[lookup.searchFields.postcode]
    const building = d[lookup.searchFields.building]
    const v = validate([
      {
        field: lookup.searchFields.postcode,
        message: 'Enter a postcode',
        valid: filled(postcode)
      }
    ])
    if (!v.ok) return renderSearch(res, v)

    let addresses
    try {
      addresses = await findAddresses(postcode)
    } catch (err) {
      console.error('Address lookup failed for postcode ' + postcode, err)
      return renderSearch(res, serviceError(err))
    }

    if (filled(building)) addresses = filterByBuilding(addresses, building)
    if (addresses.length === 0) {
      return renderSearch(
        res,
        validate([
          {
            field: lookup.searchFields.postcode,
            message: 'No addresses found',
            valid: false
          }
        ])
      )
    }

    d[resultsKey] = addresses
    if (addresses.length === 1) {
      d[selectedKey] = addresses[0]
      return res.redirect(P + '/' + lookup.result)
    }
    res.redirect(P + '/' + lookup.select)
  })

  router.get(P + '/' + lookup.select, (req, res) => {
    if (!req.session.data[resultsKey]) {
      return res.redirect(P + '/' + lookup.search)
    }
    res.render(view('includes/address-select'), locals)
  })

  router.post(P + '/' + lookup.select, (req, res) => {
    const d = req.session.data
    const chosen = (d[resultsKey] || []).find((a) => a.uprn === d[choiceField])
    const v = validate([
      {
        field: choiceField,
        message: 'Select an address',
        valid: Boolean(chosen)
      }
    ])
    if (!v.ok) {
      return res.render(view('includes/address-select'), { ...locals, ...v })
    }
    d[selectedKey] = chosen
    res.redirect(P + '/' + lookup.result)
  })

  router.get(P + '/' + lookup.result, (req, res) => {
    if (!req.session.data[selectedKey]) {
      return res.redirect(P + '/' + lookup.search)
    }
    res.render(view('includes/address-result'), locals)
  })

  router.post(P + '/' + lookup.result, (req, res) => {
    const d = req.session.data
    const address = d[selectedKey]
    if (!address) return res.redirect(P + '/' + lookup.search)
    const [line1, ...rest] = address.lines
    const chosen = {
      line1,
      line2: rest.join(', '),
      town: address.town,
      postcode: address.postcode,
      country: address.country
    }
    if (lookup.save) {
      lookup.save(d, chosen)
    } else {
      const fields = lookup.addressFields
      d[fields.line1] = chosen.line1
      d[fields.line2] = chosen.line2
      d[fields.town] = chosen.town
      d[fields.postcode] = chosen.postcode
      d[fields.country] = chosen.country
    }
    for (const field of lookup.clear || []) delete d[field]
    lookup.next(req, res)
  })
}

// The fields every manual address page shares, as <prefix>-line-1 and so on.
const manualAddressRules = (d, prefix) => [
  {
    field: prefix + '-line-1',
    message: 'Enter address line 1',
    valid: filled(d[prefix + '-line-1'])
  },
  {
    field: prefix + '-town',
    message: 'Enter a town or city',
    valid: filled(d[prefix + '-town'])
  },
  {
    field: prefix + '-postcode',
    message: 'Enter a postcode',
    valid: filled(d[prefix + '-postcode'])
  },
  {
    field: prefix + '-country',
    message: 'Select a country',
    valid: filled(d[prefix + '-country'])
  }
]

const contactRules = (d, prefix) => [
  {
    field: prefix + '-name',
    message: 'Enter a contact name',
    valid: filled(d[prefix + '-name'])
  },
  {
    field: prefix + '-telephone',
    message: 'Enter a telephone number',
    valid: filled(d[prefix + '-telephone'])
  },
  {
    field: prefix + '-email',
    message: 'Enter an email address',
    valid: filled(d[prefix + '-email'])
  }
]

const STORAGE_SEARCH_FIELDS = ['store-postcode', 'store-building']
const STORAGE_MANUAL_FIELDS = [
  'store-line-1',
  'store-line-2',
  'store-town',
  'store-postcode',
  'store-country'
]

// An address being changed from the summary page replaces that one;
// otherwise the address is added to the list.
const saveStorageAddress = (d, address) => {
  const list = [...storageAddresses(d)]
  const index = d['store-editing']
  if (index !== undefined && Number(index) < list.length)
    list[Number(index)] = address
  else list.push(address)
  d['storage-addresses'] = list
  delete d['store-editing']
}

module.exports = (router) => {
  router.get(P, (req, res) => res.redirect(P + '/start'))

  // The new service name, for version 1.4 only.
  router.use(P, (req, res, next) => {
    res.locals.serviceName = SERVICE_NAME
    next()
  })

  // A check answers Change link's ?returnTo=check-answers, kept until the page
  // it opens is saved.
  router.use((req, res, next) => {
    if (req.path.startsWith(P) && req.query.returnTo && req.session.data) {
      req.session.data.returnTo = req.query.returnTo
    }
    next()
  })

  // Back links on the activity pages follow the route taken. Set for POSTs
  // too, so a page shown again with errors keeps it.
  router.use((req, res, next) => {
    const page = req.path.startsWith(P + '/')
      ? req.path.slice(P.length + 1).replace(/\/$/, '')
      : ''
    if (req.session.data && answered[page]) {
      res.locals.pathBackLink = P + '/' + activityBack(req.session.data, page)
    }
    next()
  })

  // --- Register or update ----------------------------------------------------
  router.post(P + '/register-or-update', (req, res) => {
    const answer = req.session.data['register-or-update']
    const v = validate([
      {
        field: 'register-or-update',
        message: 'Select what you would like to do',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('register-or-update'), v)
    res.redirect(
      P + '/' + (answer === 'update' ? 'update-not-built' : 'contact-details')
    )
  })

  // --- Contact details and email verification --------------------------------
  router.post(P + '/contact-details', (req, res) => {
    const v = validate(contactRules(req.session.data, 'contact'))
    if (!v.ok) return res.render(view('contact-details'), v)
    res.redirect(P + '/' + (consumeReturnTo(req) || 'check-your-email'))
  })

  // The verification link in the email. The user researcher sends the email,
  // so the link may be opened in a browser with no answers yet.
  router.get(P + '/confirm-email', (req, res) => {
    const d = req.session.data
    if (!filled(d['contact-email'])) Object.assign(d, SAMPLE_CONTACT)
    d['email-verified'] = 'yes'
    res.redirect(P + '/business-name')
  })

  // --- Business name and main address ----------------------------------------
  router.post(P + '/business-name', (req, res) => {
    const v = validate([
      {
        field: 'business-name',
        message: 'Enter your business or organisation name',
        valid: filled(req.session.data['business-name'])
      }
    ])
    if (!v.ok) return res.render(view('business-name'), v)
    res.redirect(P + '/' + (consumeReturnTo(req) || 'address-lookup'))
  })

  const afterMainAddress = (req, res) =>
    res.redirect(P + '/' + (consumeReturnTo(req) || 'activities'))

  addressLookup(router, {
    name: 'main',
    heading: 'What is the main address for your business or organisation?',
    search: 'address-lookup',
    select: 'address-lookup-select',
    result: 'address-lookup-result',
    manual: 'main-address',
    searchFields: { postcode: 'lookup-postcode', building: 'lookup-building' },
    addressFields: {
      line1: 'address-line-1',
      line2: 'address-line-2',
      town: 'address-town',
      postcode: 'address-postcode',
      country: 'address-country'
    },
    clear: ['international-address'],
    next: afterMainAddress
  })

  router.post(P + '/main-address', (req, res) => {
    const d = req.session.data
    const v = validate(manualAddressRules(d, 'address'))
    if (!v.ok) return res.render(view('main-address'), v)
    delete d['international-address']
    afterMainAddress(req, res)
  })

  router.post(P + '/address-international', (req, res) => {
    const v = validate([
      {
        field: 'international-address',
        message: 'Enter your business address',
        valid: filled(req.session.data['international-address'])
      }
    ])
    if (!v.ok) return res.render(view('address-international'), v)
    afterMainAddress(req, res)
  })

  // --- Business activities ---------------------------------------------------
  router.post(P + '/activities', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'activities',
        message: 'Select which activities your organisation carries out',
        valid: activities(d).length > 0
      }
    ])
    if (!v.ok) return res.render(view('activities'), v)
    goNext(req, res, activityRoute(d))
  })

  // --- Using PPPs ------------------------------------------------------------
  // A page whose answer is required, then on through the rest of the route.
  const activityPage = (page, rules) =>
    router.post(P + '/' + page, (req, res) => {
      const d = req.session.data
      const v = validate(rules(d))
      if (!v.ok) return res.render(view(page), v)
      goNext(req, res, routeAfter(d, page))
    })

  activityPage('who-applies', (d) => [
    {
      field: 'who-applies',
      message: 'Select who mainly applies PPPs for your organisation',
      valid: filled(d['who-applies'])
    }
  ])

  activityPage('third-party', (d) => [
    {
      field: 'third-party-name',
      message: 'Enter the business or company name',
      valid: filled(d['third-party-name'])
    },
    ...manualAddressRules(d, 'third-party')
  ])

  activityPage('sector', (d) => [
    {
      field: 'sector',
      message: 'Select a sector, or describe your work in the ‘Other’ box',
      valid: answered.sector(d)
    }
  ])

  activityPage('agri-subsectors', (d) => [
    {
      field: 'agri-subsector',
      message:
        'Select an agricultural sector, or describe your work in the ‘Other’ box',
      valid: answered['agri-subsectors'](d)
    }
  ])

  activityPage('amenity-subsectors', (d) => [
    {
      field: 'amenity-subsector',
      message:
        'Select an amenity sector, or describe your work in the ‘Other’ box',
      valid: answered['amenity-subsectors'](d)
    }
  ])

  activityPage('horti-subsectors', (d) => [
    {
      field: 'horti-subsector',
      message:
        'Select a horticultural sector, or describe your work in the ‘Other’ box',
      valid: answered['horti-subsectors'](d)
    }
  ])

  activityPage('assurance-schemes', () => [])

  // --- Storage ---------------------------------------------------------------
  activityPage('store-applied', (d) => [
    {
      field: 'store-applied',
      message: 'Select where the products are stored',
      valid: storedAt(d).length > 0
    },
    {
      field: 'store-applied',
      message:
        'Select where the products are stored, or select ‘We do not store PPPs’',
      valid: !(storedAt(d).includes(STORE_NONE) && storedAt(d).length > 1)
    }
  ])

  router.post(P + '/store-sites', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'store-sites',
        message: 'Select which of your sites store PPPs',
        valid: storeSites(d).length > 0
      }
    ])
    if (!v.ok) return res.render(view('store-sites'), v)
    // The first other address goes through the search; its summary comes after.
    if (
      storeSites(d).includes(SITE_ANOTHER) &&
      storageAddresses(d).length === 0
    ) {
      return res.redirect(P + '/store-own-address-lookup')
    }
    goNext(req, res, routeAfter(d, 'store-sites'))
  })

  const toStorageSummary = (req, res) => res.redirect(P + '/storage-addresses')

  addressLookup(router, {
    name: 'store',
    heading: 'What is the location where you store PPPs?',
    search: 'store-own-address-lookup',
    select: 'store-own-address-select',
    result: 'store-own-address-result',
    manual: 'store-own-address-manual',
    searchFields: { postcode: 'store-postcode', building: 'store-building' },
    save: saveStorageAddress,
    next: toStorageSummary
  })

  // Opened from a card's Change link (?edit=<index>): show that address. The
  // kit has already copied the session into res.locals.data for the page, so
  // both get the address.
  router.get(P + '/store-own-address-manual', (req, res, next) => {
    const address = storageAddresses(req.session.data)[Number(req.query.edit)]
    if (req.query.edit !== undefined && address) {
      const editing = {
        'store-editing': Number(req.query.edit),
        'store-line-1': address.line1,
        'store-line-2': address.line2,
        'store-town': address.town,
        'store-postcode': address.postcode,
        'store-country': address.country
      }
      Object.assign(req.session.data, editing)
      Object.assign(res.locals.data, editing)
    }
    next()
  })

  router.post(P + '/store-own-address-manual', (req, res) => {
    const d = req.session.data
    const v = validate(manualAddressRules(d, 'store'))
    if (!v.ok) return res.render(view('store-own-address-manual'), v)
    saveStorageAddress(d, {
      line1: d['store-line-1'],
      line2: d['store-line-2'],
      town: d['store-town'],
      postcode: d['store-postcode'],
      country: d['store-country']
    })
    STORAGE_MANUAL_FIELDS.forEach((field) => delete d[field])
    toStorageSummary(req, res)
  })

  router.get(P + '/storage-addresses', (req, res, next) => {
    if (storageAddresses(req.session.data).length === 0) {
      return res.redirect(P + '/store-own-address-lookup')
    }
    next()
  })

  router.get(P + '/storage-addresses/remove/:index', (req, res) => {
    const d = req.session.data
    const list = [...storageAddresses(d)]
    list.splice(Number(req.params.index), 1)
    d['storage-addresses'] = list
    res.redirect(
      P + '/' + (list.length > 0 ? 'storage-addresses' : 'store-sites')
    )
  })

  router.post(P + '/storage-addresses', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'add-another-address',
        message: 'Select yes if you want to add another address',
        valid: filled(d['add-another-address'])
      }
    ])
    if (!v.ok) return res.render(view('storage-addresses'), v)
    const addAnother = d['add-another-address'] === 'Yes'
    delete d['add-another-address']
    if (addAnother) {
      ;[...STORAGE_SEARCH_FIELDS, ...STORAGE_MANUAL_FIELDS].forEach(
        (field) => delete d[field]
      )
      delete d['store-editing']
      return res.redirect(P + '/store-own-address-lookup')
    }
    goNext(req, res, routeAfter(d, 'storage-addresses'))
  })

  activityPage('store-3rd-party-contact', (d) => [
    {
      field: 'store-3p-business',
      message: 'Enter the business name',
      valid: filled(d['store-3p-business'])
    },
    ...contactRules(d, 'store-3p')
  ])

  activityPage('quantity', (d) => [
    {
      field: 'quantity',
      message:
        'Select the quantity of PPPs or adjuvants you use in a typical year',
      valid: filled(d.quantity)
    }
  ])

  // --- Selling amateur PPPs --------------------------------------------------
  activityPage('sell-amateur-quantity', (d) => [
    {
      field: 'sell-amateur-quantity',
      message: 'Enter the estimated sales value',
      valid: filled(d['sell-amateur-quantity'])
    }
  ])

  // --- Check answers, confirmation and the PDF -------------------------------
  router.get(P + '/check-answers', (req, res) => {
    const d = req.session.data
    const route = activityRoute(d)
    res.render(view('check-answers'), {
      ...registrationSummary(d),
      cyaBack: P + '/' + (route[route.length - 1] || 'activities')
    })
  })

  router.post(P + '/check-answers', (req, res) =>
    res.redirect(P + '/confirmation')
  )

  router.get(P + '/confirmation', (req, res) =>
    res.render(view('confirmation'), { registrationRef: REGISTRATION_REF })
  )

  router.get(P + '/registration.pdf', (req, res) => {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="registration-' + REGISTRATION_REF + '.pdf"'
    )
    registrationPdf(res, {
      serviceName: SERVICE_NAME,
      reference: REGISTRATION_REF,
      registeredOn: new Date(),
      ...registrationSummary(req.session.data)
    })
  })
}
