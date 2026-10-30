//
// The version 1.4 registration answers: which pages a journey needs, and the
// check answers rows (shared with the PDF).
//
const { toArray, filled } = require('./journey-helpers')

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

// One subsector page per main sector that has one, in route order.
const SUBSECTORS = [
  {
    sector: 'Agriculture',
    page: 'agri-subsectors',
    field: 'agri-subsector',
    rowKey: 'Agriculture sectors',
    message:
      'Select an agricultural sector, or describe your work in the ‘Other’ box'
  },
  {
    sector: 'Amenity',
    page: 'amenity-subsectors',
    field: 'amenity-subsector',
    rowKey: 'Amenity sectors',
    message:
      'Select an amenity sector, or describe your work in the ‘Other’ box'
  },
  {
    sector: 'Horticulture',
    page: 'horti-subsectors',
    field: 'horti-subsector',
    rowKey: 'Horticulture sectors',
    message:
      'Select a horticultural sector, or describe your work in the ‘Other’ box'
  }
]

const sectors = (d) => toArray(d.sector)
const activities = (d) => toArray(d.activities)
const storedAt = (d) => toArray(d['store-applied'])
const storeSites = (d) => toArray(d['store-sites'])
const storageAddresses = (d) => d['storage-addresses'] || []
const subsectorsNeeded = (d) =>
  SUBSECTORS.filter(({ sector }) => sectors(d).includes(sector))
const needsAssuranceSchemes = (d) =>
  sectors(d).includes('Agriculture') || sectors(d).includes('Horticulture')
const storesAtOtherAddresses = (d) =>
  storedAt(d).includes(STORE_OWN) && storeSites(d).includes(SITE_ANOTHER)

// An address held as <prefix>-line-1, <prefix>-town and so on.
const ADDRESS_PARTS = {
  line1: 'line-1',
  line2: 'line-2',
  town: 'town',
  postcode: 'postcode',
  country: 'country'
}
const addressFrom = (d, prefix) =>
  Object.fromEntries(
    Object.entries(ADDRESS_PARTS).map(([part, suffix]) => [
      part,
      d[prefix + '-' + suffix]
    ])
  )
const setAddress = (d, prefix, address) => {
  for (const [part, suffix] of Object.entries(ADDRESS_PARTS)) {
    d[prefix + '-' + suffix] = address[part]
  }
}
const addressFieldNames = (prefix) =>
  Object.values(ADDRESS_PARTS).map((suffix) => prefix + '-' + suffix)
const addressLines = (address) =>
  [
    address.line1,
    address.line2,
    address.town,
    address.postcode,
    address.country
  ].filter(filled)

// The pages of the activity flows, in order, for the answers so far.
const usingRoute = (d) => [
  'who-applies',
  ...(d['who-applies'] === ANOTHER_ORG ? ['third-party'] : []),
  'sector',
  ...subsectorsNeeded(d).map(({ page }) => page),
  ...(needsAssuranceSchemes(d) ? ['assurance-schemes'] : []),
  'store-applied',
  ...(storedAt(d).includes(STORE_OWN) ? ['store-sites'] : []),
  ...(storesAtOtherAddresses(d) ? ['storage-addresses'] : []),
  ...(storedAt(d).includes(STORE_THIRD_PARTY)
    ? ['store-3rd-party-contact']
    : []),
  'quantity'
]
const activityRoute = (d) => [
  ...(activities(d).includes(USING) ? usingRoute(d) : []),
  ...(activities(d).includes(SELLING) ? ['sell-amateur-quantity'] : [])
]

const ticksOrOther = (d, field) =>
  toArray(d[field]).length > 0 || filled(d[field + '-other'])

// Whether each activity page is answered, so a check answers Change walks only
// the pages a new answer needs.
const answered = {
  'who-applies': (d) => filled(d['who-applies']),
  'third-party': (d) => filled(d['third-party-name']),
  sector: (d) => ticksOrOther(d, 'sector'),
  ...Object.fromEntries(
    SUBSECTORS.map(({ page, field }) => [page, (d) => ticksOrOther(d, field)])
  ),
  // Optional, so answered once its Other box (sent even when empty) arrives.
  'assurance-schemes': (d) =>
    d['assurance-schemes-other'] !== undefined ||
    ticksOrOther(d, 'assurance-schemes'),
  'store-applied': (d) => storedAt(d).length > 0,
  'store-sites': (d) => storeSites(d).length > 0,
  'storage-addresses': (d) => storageAddresses(d).length > 0,
  'store-3rd-party-contact': (d) => filled(d['store-3p-name']),
  quantity: (d) => filled(d.quantity),
  'sell-amateur-quantity': (d) => filled(d['sell-amateur-quantity'])
}

// Check answers rows: { key, lines, change }, where change is the page the
// Change link opens.
const withOther = (d, field) => [
  ...toArray(d[field]),
  ...(filled(d[field + '-other']) ? [d[field + '-other']] : [])
]
const mainAddressLines = (d) =>
  filled(d['international-address'])
    ? d['international-address'].split(/\r?\n/).filter(filled)
    : addressLines(addressFrom(d, 'address'))

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
  ...[
    ['Contact name', 'contact-name'],
    ['Contact role', 'contact-job-title'],
    ['Contact email', 'contact-email'],
    ['Contact telephone', 'contact-telephone']
  ].map(([key, field]) => ({
    key,
    lines: [d[field]],
    change: 'contact-details'
  }))
]

const storeLocationRows = (d) => {
  const locations = []
  if (storedAt(d).includes(STORE_OWN) && storeSites(d).includes(SITE_MAIN)) {
    locations.push({
      lines: ['At the main business address'],
      change: 'store-sites'
    })
  }
  if (storesAtOtherAddresses(d)) {
    for (const address of storageAddresses(d)) {
      locations.push({
        lines: addressLines(address),
        change: 'storage-addresses'
      })
    }
  }
  if (storedAt(d).includes(STORE_THIRD_PARTY)) {
    locations.push({
      lines: [
        d['store-3p-name'],
        d['store-3p-job-title'],
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
            ...addressLines(addressFrom(d, 'third-party'))
          ].filter(filled),
          change: 'third-party'
        }
      ]
    : []),
  {
    key: 'Main sectors of work',
    lines: withOther(d, 'sector'),
    change: 'sector'
  },
  ...subsectorsNeeded(d).map(({ rowKey, field, page }) => ({
    key: rowKey,
    lines: withOther(d, field),
    change: page
  })),
  ...(needsAssuranceSchemes(d)
    ? [
        {
          key: 'Assurance schemes',
          lines: withOther(d, 'assurance-schemes'),
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

// The page already shows a £ prefix, so one typed in isn't repeated.
const salesValue = (d) =>
  filled(d['sell-amateur-quantity'])
    ? ['£' + d['sell-amateur-quantity'].trim().replace(/^£\s*/, '')]
    : []

const registrationSummary = (d) => ({
  businessRows: businessRows(d),
  usingRows: activities(d).includes(USING) ? usingRows(d) : null,
  sellingRows: activities(d).includes(SELLING)
    ? [
        {
          key: 'Total value of PPPs sold in a typical year',
          lines: salesValue(d),
          change: 'sell-amateur-quantity'
        }
      ]
    : null,
  bothActivities:
    activities(d).includes(USING) && activities(d).includes(SELLING)
})

module.exports = {
  STORE_NONE,
  SITE_ANOTHER,
  SUBSECTORS,
  activities,
  storedAt,
  storeSites,
  storageAddresses,
  addressFrom,
  setAddress,
  addressFieldNames,
  activityRoute,
  answered,
  registrationSummary
}
