//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// Treat a checkbox/radio value as an array whether one or many were selected
const toArray = (value) =>
  value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value]

// Only professional-facing selling activities need the "main customer" question.
// "Sell amateur PPPs" (public) and "Use professional PPPs" skip it and go straight
// to business name — this is the bifurcation shown in the Figma flow.
const MAIN_CUSTOMER_ACTIVITIES = ['manufacture', 'place-on-market', 'sell-professional']

// --- Activities: decide whether to ask the "main customer" question ---
router.post('/activities', (req, res) => {
  const activities = toArray(req.session.data.activities)
  const needsMainCustomer = activities.some((a) => MAIN_CUSTOMER_ACTIVITIES.includes(a))

  if (needsMainCustomer) {
    return res.redirect('/main-customer')
  }
  // sell-amateur, use-professional (or nothing) → skip main customer
  res.redirect('/business-name')
})

// --- Shared business detail steps ---
router.post('/main-customer', (req, res) => res.redirect('/business-name'))
router.post('/business-name', (req, res) => res.redirect('/main-address'))
router.post('/main-address', (req, res) => res.redirect('/contact-details'))
router.post('/contact-details', (req, res) => res.redirect('/activity-at-address'))
router.post('/activity-at-address', (req, res) => res.redirect('/quantity'))

// --- After quantity: only an amateur-only seller goes straight to check answers.
// If ANY activity other than "sell-amateur" was selected, continue to the
// sector / assurance / additional-address steps (the Figma bifurcation). ---
const isAmateurOnly = (activities) =>
  activities.length > 0 && activities.every((a) => a === 'sell-amateur')

router.post('/quantity', (req, res) => {
  const activities = toArray(req.session.data.activities)
  if (isAmateurOnly(activities)) {
    return res.redirect('/check-answers')
  }
  res.redirect('/sector')
})

router.post('/sector', (req, res) => res.redirect('/assurance-schemes'))
router.post('/assurance-schemes', (req, res) => res.redirect('/additional-addresses-question'))

// --- Additional addresses branch ---
router.post('/additional-addresses-question', (req, res) => {
  if (req.session.data['add-additional'] === 'yes') {
    return res.redirect('/additional-address')
  }
  res.redirect('/check-answers')
})

router.post('/additional-address', (req, res) => res.redirect('/additional-address-contact'))
router.post('/additional-address-contact', (req, res) => res.redirect('/additional-address-activity'))

// Assemble the temporary "add-*" fields into a saved additional address, then reset them
router.post('/additional-address-activity', (req, res) => {
  const d = req.session.data

  const address = {
    businessName: d['business-name'],
    line1: d['add-line-1'],
    line2: d['add-line-2'],
    town: d['add-town'],
    postcode: d['add-postcode'],
    country: d['add-country'],
    contactName: d['add-contact-name'],
    contactTelephone: d['add-contact-telephone'],
    contactEmail: d['add-contact-email'],
    activity: toArray(d['add-activity'])
  }

  d.additionalAddresses = d.additionalAddresses || []
  d.additionalAddresses.push(address)

  clearAdditionalAddressFields(d)
  res.redirect('/additional-addresses')
})

// Summary page: add another, or finish
router.post('/additional-addresses', (req, res) => {
  if (req.session.data['add-another'] === 'yes') {
    return res.redirect('/additional-address')
  }
  res.redirect('/check-answers')
})

// Remove an additional address by index, then return to the summary
router.get('/additional-addresses/remove/:index', (req, res) => {
  const d = req.session.data
  const index = Number(req.params.index)

  if (Array.isArray(d.additionalAddresses) && index >= 0 && index < d.additionalAddresses.length) {
    d.additionalAddresses.splice(index, 1)
  }

  if (!d.additionalAddresses || d.additionalAddresses.length === 0) {
    return res.redirect('/additional-addresses-question')
  }
  res.redirect('/additional-addresses')
})

// --- Finish ---
router.post('/check-answers', (req, res) => res.redirect('/confirmation'))

function clearAdditionalAddressFields(d) {
  const fields = [
    'add-line-1',
    'add-line-2',
    'add-town',
    'add-postcode',
    'add-country',
    'add-contact-name',
    'add-contact-telephone',
    'add-contact-email',
    'add-activity',
    'add-another'
  ]
  fields.forEach((f) => delete d[f])
}
