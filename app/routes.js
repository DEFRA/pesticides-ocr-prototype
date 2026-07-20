//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// Treat a checkbox/radio value as an array whether one or many were selected
const toArray = (value) =>
  value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value]

const filled = (value) => typeof value === 'string' && value.trim() !== ''

// Build an errors object + error summary list from a set of rules.
// Each rule: { field, href?, message, valid }
const validate = (rules) => {
  const errors = {}
  const errorList = []
  for (const rule of rules) {
    if (!rule.valid) {
      errors[rule.field] = rule.message
      errorList.push({ text: rule.message, href: '#' + (rule.href || rule.field) })
    }
  }
  return { errors, errorList, ok: errorList.length === 0 }
}

const SELLER_ACTIVITIES = ['manufacture', 'place-on-market', 'sell-professional']

const isAmateurOnly = (activities) =>
  activities.length > 0 && activities.every((a) => a === 'sell-amateur')

// --- Activities: validate, then decide whether to ask "main customer" ---
router.post('/activities', (req, res) => {
  const activities = toArray(req.session.data.activities)
  const v = validate([
    {
      field: 'activities',
      message: 'Select what your business does with plant protection products',
      valid: activities.length > 0
    }
  ])
  if (!v.ok) return res.render('activities', v)

  const needsMainCustomer = activities.some((a) => SELLER_ACTIVITIES.includes(a))
  if (needsMainCustomer) return res.redirect('/main-customer')
  // sell-amateur / use-professional → skip main customer
  res.redirect('/business-name')
})

router.post('/main-customer', (req, res) => {
  const v = validate([
    {
      field: 'main-customer',
      message: 'Select whether your main customer is a professional or amateur user',
      valid: filled(req.session.data['main-customer'])
    }
  ])
  if (!v.ok) return res.render('main-customer', v)
  res.redirect('/business-name')
})

router.post('/business-name', (req, res) => {
  const v = validate([
    {
      field: 'business-name',
      message: 'Enter your business or company name',
      valid: filled(req.session.data['business-name'])
    }
  ])
  if (!v.ok) return res.render('business-name', v)
  res.redirect('/main-address')
})

router.post('/main-address', (req, res) => {
  const d = req.session.data
  const v = validate([
    { field: 'address-line-1', message: 'Enter address line 1', valid: filled(d['address-line-1']) },
    { field: 'address-town', message: 'Enter a town or city', valid: filled(d['address-town']) },
    { field: 'address-postcode', message: 'Enter a postcode', valid: filled(d['address-postcode']) },
    { field: 'address-country', message: 'Select a country', valid: filled(d['address-country']) }
  ])
  if (!v.ok) return res.render('main-address', v)
  res.redirect('/contact-details')
})

router.post('/contact-details', (req, res) => {
  const d = req.session.data
  const v = validate([
    { field: 'contact-name', message: 'Enter a name', valid: filled(d['contact-name']) },
    { field: 'contact-telephone', message: 'Enter a telephone number', valid: filled(d['contact-telephone']) },
    { field: 'contact-email', message: 'Enter an email address', valid: filled(d['contact-email']) }
  ])
  if (!v.ok) return res.render('contact-details', v)
  res.redirect('/activity-at-address')
})

router.post('/activity-at-address', (req, res) => {
  const v = validate([
    {
      field: 'address-activity',
      message: 'Select what your business does at this address',
      valid: toArray(req.session.data['address-activity']).length > 0
    }
  ])
  if (!v.ok) return res.render('activity-at-address', v)
  res.redirect('/quantity')
})

// --- Quantity: validate, then branch (amateur-only skips sector) ---
router.post('/quantity', (req, res) => {
  const v = validate([
    {
      field: 'quantity',
      message: 'Enter an estimated annual quantity',
      valid: filled(req.session.data.quantity)
    }
  ])
  if (!v.ok) return res.render('quantity', v)

  const activities = toArray(req.session.data.activities)
  if (isAmateurOnly(activities)) return res.redirect('/check-answers')
  res.redirect('/sector')
})

router.post('/sector', (req, res) => {
  const d = req.session.data
  const v = validate([
    {
      field: 'sector',
      message: 'Select the main sector of your work, or describe it in the ‘Other’ box',
      valid: toArray(d.sector).length > 0 || filled(d['sector-other'])
    }
  ])
  if (!v.ok) return res.render('sector', v)
  res.redirect('/assurance-schemes')
})

// Assurance schemes is optional — no validation
router.post('/assurance-schemes', (req, res) => res.redirect('/additional-addresses-question'))

// --- Additional addresses branch ---
router.post('/additional-addresses-question', (req, res) => {
  const v = validate([
    {
      field: 'add-additional',
      message: 'Select whether you need to add any additional business addresses',
      valid: filled(req.session.data['add-additional'])
    }
  ])
  if (!v.ok) return res.render('additional-addresses-question', v)

  if (req.session.data['add-additional'] === 'yes') return res.redirect('/additional-address')
  res.redirect('/check-answers')
})

router.post('/additional-address', (req, res) => {
  const d = req.session.data
  const v = validate([
    { field: 'add-line-1', message: 'Enter address line 1', valid: filled(d['add-line-1']) },
    { field: 'add-town', message: 'Enter a town or city', valid: filled(d['add-town']) },
    { field: 'add-country', message: 'Select a country', valid: filled(d['add-country']) }
  ])
  if (!v.ok) return res.render('additional-address', v)
  res.redirect('/additional-address-contact')
})

router.post('/additional-address-contact', (req, res) => {
  const d = req.session.data
  const v = validate([
    { field: 'add-contact-name', message: 'Enter a name', valid: filled(d['add-contact-name']) },
    { field: 'add-contact-telephone', message: 'Enter a telephone number', valid: filled(d['add-contact-telephone']) },
    { field: 'add-contact-email', message: 'Enter an email address', valid: filled(d['add-contact-email']) }
  ])
  if (!v.ok) return res.render('additional-address-contact', v)
  res.redirect('/additional-address-activity')
})

// Assemble the temporary "add-*" fields into a saved additional address, then reset them
router.post('/additional-address-activity', (req, res) => {
  const d = req.session.data
  const v = validate([
    {
      field: 'add-activity',
      message: 'Select what your business does at this address',
      valid: toArray(d['add-activity']).length > 0
    }
  ])
  if (!v.ok) return res.render('additional-address-activity', v)

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
  const v = validate([
    {
      field: 'add-another',
      message: 'Select whether you want to add another address',
      valid: filled(req.session.data['add-another'])
    }
  ])
  if (!v.ok) return res.render('additional-addresses', v)

  if (req.session.data['add-another'] === 'yes') return res.redirect('/additional-address')
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
