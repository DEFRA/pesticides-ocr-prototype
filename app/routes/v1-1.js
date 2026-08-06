//
// OCR register journey — version 1.1 (original Figma master flow 1.1).
// Mounted under /v1-1. Kept as a historic reference build:
//  - the quantity page is always shown after "activity at address";
//  - quantity is a single amount (kilograms or litres).
//
const {
  toArray,
  filled,
  validate,
  SELLER_ACTIVITIES,
  isAmateurOnly,
  clearAdditionalAddressFields
} = require('./journey-helpers')

const V = 'v1-1'
const P = '/' + V // URL prefix for redirects
const view = (name) => V + '/' + name // view path for render (app/views/v1-1/…)

module.exports = (router) => {
  // --- Activities: validate, then decide whether to ask "main customer" ---
  router.post(P + '/activities', (req, res) => {
    const activities = toArray(req.session.data.activities)
    const v = validate([
      {
        field: 'activities',
        message:
          'Select what your business does with plant protection products',
        valid: activities.length > 0
      }
    ])
    if (!v.ok) return res.render(view('activities'), v)

    const needsMainCustomer = activities.some((a) =>
      SELLER_ACTIVITIES.includes(a)
    )
    if (needsMainCustomer) return res.redirect(P + '/main-customer')
    res.redirect(P + '/business-name')
  })

  router.post(P + '/main-customer', (req, res) => {
    const v = validate([
      {
        field: 'main-customer',
        message:
          'Select whether your main customer is a professional or amateur user',
        valid: filled(req.session.data['main-customer'])
      }
    ])
    if (!v.ok) return res.render(view('main-customer'), v)
    res.redirect(P + '/business-name')
  })

  router.post(P + '/business-name', (req, res) => {
    const v = validate([
      {
        field: 'business-name',
        message: 'Enter your business or company name',
        valid: filled(req.session.data['business-name'])
      }
    ])
    if (!v.ok) return res.render(view('business-name'), v)
    res.redirect(P + '/main-address')
  })

  router.post(P + '/main-address', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'address-line-1',
        message: 'Enter address line 1',
        valid: filled(d['address-line-1'])
      },
      {
        field: 'address-town',
        message: 'Enter a town or city',
        valid: filled(d['address-town'])
      },
      {
        field: 'address-postcode',
        message: 'Enter a postcode',
        valid: filled(d['address-postcode'])
      },
      {
        field: 'address-country',
        message: 'Select a country',
        valid: filled(d['address-country'])
      }
    ])
    if (!v.ok) return res.render(view('main-address'), v)
    res.redirect(P + '/contact-details')
  })

  router.post(P + '/contact-details', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'contact-name',
        message: 'Enter a name',
        valid: filled(d['contact-name'])
      },
      {
        field: 'contact-telephone',
        message: 'Enter a telephone number',
        valid: filled(d['contact-telephone'])
      },
      {
        field: 'contact-email',
        message: 'Enter an email address',
        valid: filled(d['contact-email'])
      }
    ])
    if (!v.ok) return res.render(view('contact-details'), v)
    res.redirect(P + '/activity-at-address')
  })

  router.post(P + '/activity-at-address', (req, res) => {
    const v = validate([
      {
        field: 'address-activity',
        message: 'Select what your business does at this address',
        valid: toArray(req.session.data['address-activity']).length > 0
      }
    ])
    if (!v.ok) return res.render(view('activity-at-address'), v)
    res.redirect(P + '/quantity')
  })

  // --- Quantity: single amount (kilograms or litres), then branch ---
  router.post(P + '/quantity', (req, res) => {
    const v = validate([
      {
        field: 'quantity',
        message: 'Enter an estimated annual quantity',
        valid: filled(req.session.data.quantity)
      }
    ])
    if (!v.ok) return res.render(view('quantity'), v)

    const activities = toArray(req.session.data.activities)
    if (isAmateurOnly(activities)) return res.redirect(P + '/check-answers')
    res.redirect(P + '/sector')
  })

  router.post(P + '/sector', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'sector',
        message:
          'Select the main sector of your work, or describe it in the ‘Other’ box',
        valid: toArray(d.sector).length > 0 || filled(d['sector-other'])
      }
    ])
    if (!v.ok) return res.render(view('sector'), v)
    res.redirect(P + '/assurance-schemes')
  })

  // Assurance schemes is optional — no validation
  router.post(P + '/assurance-schemes', (req, res) =>
    res.redirect(P + '/additional-addresses-question')
  )

  // --- Additional addresses branch ---
  router.post(P + '/additional-addresses-question', (req, res) => {
    const v = validate([
      {
        field: 'add-additional',
        message:
          'Select whether you need to add any additional business addresses',
        valid: filled(req.session.data['add-additional'])
      }
    ])
    if (!v.ok) return res.render(view('additional-addresses-question'), v)

    if (req.session.data['add-additional'] === 'yes')
      return res.redirect(P + '/additional-address')
    res.redirect(P + '/check-answers')
  })

  router.post(P + '/additional-address', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'add-line-1',
        message: 'Enter address line 1',
        valid: filled(d['add-line-1'])
      },
      {
        field: 'add-town',
        message: 'Enter a town or city',
        valid: filled(d['add-town'])
      },
      {
        field: 'add-country',
        message: 'Select a country',
        valid: filled(d['add-country'])
      }
    ])
    if (!v.ok) return res.render(view('additional-address'), v)
    res.redirect(P + '/additional-address-contact')
  })

  router.post(P + '/additional-address-contact', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'add-contact-name',
        message: 'Enter a name',
        valid: filled(d['add-contact-name'])
      },
      {
        field: 'add-contact-telephone',
        message: 'Enter a telephone number',
        valid: filled(d['add-contact-telephone'])
      },
      {
        field: 'add-contact-email',
        message: 'Enter an email address',
        valid: filled(d['add-contact-email'])
      }
    ])
    if (!v.ok) return res.render(view('additional-address-contact'), v)
    res.redirect(P + '/additional-address-activity')
  })

  // Assemble the temporary "add-*" fields into a saved additional address, then reset them
  router.post(P + '/additional-address-activity', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'add-activity',
        message: 'Select what your business does at this address',
        valid: toArray(d['add-activity']).length > 0
      }
    ])
    if (!v.ok) return res.render(view('additional-address-activity'), v)

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
    res.redirect(P + '/additional-addresses')
  })

  // Summary page: add another, or finish
  router.post(P + '/additional-addresses', (req, res) => {
    const v = validate([
      {
        field: 'add-another',
        message: 'Select whether you want to add another address',
        valid: filled(req.session.data['add-another'])
      }
    ])
    if (!v.ok) return res.render(view('additional-addresses'), v)

    if (req.session.data['add-another'] === 'yes')
      return res.redirect(P + '/additional-address')
    res.redirect(P + '/check-answers')
  })

  // Remove an additional address by index, then return to the summary
  router.get(P + '/additional-addresses/remove/:index', (req, res) => {
    const d = req.session.data
    const index = Number(req.params.index)

    if (
      Array.isArray(d.additionalAddresses) &&
      index >= 0 &&
      index < d.additionalAddresses.length
    ) {
      d.additionalAddresses.splice(index, 1)
    }

    if (!d.additionalAddresses || d.additionalAddresses.length === 0) {
      return res.redirect(P + '/additional-addresses-question')
    }
    res.redirect(P + '/additional-addresses')
  })

  // --- Finish ---
  router.post(P + '/check-answers', (req, res) =>
    res.redirect(P + '/confirmation')
  )
}
