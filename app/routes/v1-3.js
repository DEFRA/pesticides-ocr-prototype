//
// OCR register journey — version 1.3 (Figma master flow 1.3).
// Mounted under /v1-3. What's changing from 1.2 (build in progress):
//  - business-activities offers 7 options — 6 multi-select (using, manufacturing,
//    importing, processing, selling, distributing) + 1 exclusive ("only storing");
//  - each selected activity has its own flow, traversed in the order selected,
//    then a combined check-answers;
//  - common route: activities → business name → address → contact → {activity
//    flows}; special case: selling only → business name → sell flow.
// NOTE: the per-activity flows are being added as the Figma 1.3 screens land; the
// tail below is still the 1.2 wiring and will be reworked per activity.
//
const {
  toArray,
  filled,
  validate,
  isAmateurOnly,
  clearAdditionalAddressFields
} = require('./journey-helpers')

const V = 'v1-3'
const P = '/' + V // URL prefix for redirects
const view = (name) => V + '/' + name // view path for render (app/views/v1-3/…)

module.exports = (router) => {
  // Bare version root → the version's start page. Without this, /v1-2 has no
  // matching view and hits the Prototype Kit's (broken) built-in 404 page.
  router.get(P, (req, res) => res.redirect(P + '/start'))

  // Where the quantity page leads — also used when the quantity page is skipped:
  // amateur-only journeys go straight to check-answers, everyone else to sector.
  const afterQuantity = (activities) =>
    isAmateurOnly(activities) ? P + '/check-answers' : P + '/sector'

  // --- Business activities (v1.3) ---
  // Each selected activity has its own flow, traversed in the order selected,
  // then a combined check-answers. The selection order is the checkbox DOM order
  // (page top-to-bottom); if UR needs literal click order we'd capture it client
  // side. Both the common route and the selling-only special case start at
  // business name, so route there; the per-activity traversal after that is wired
  // as the Figma 1.3 flows land.
  router.post(P + '/activities', (req, res) => {
    const activities = toArray(req.session.data.activities)
    const v = validate([
      {
        field: 'activities',
        message: 'Select which activities your organisation carries out',
        valid: activities.length > 0
      }
    ])
    if (!v.ok) return res.render(view('activities'), v)
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
        message: 'Enter your business or organisation name',
        valid: filled(req.session.data['business-name'])
      }
    ])
    if (!v.ok) return res.render(view('business-name'), v)

    // Special case (Figma 1.3): if selling is the ONLY activity, skip the common
    // address/contact pages and go straight to the Sell section. Everyone else
    // follows the common route (address lookup next).
    const activities = toArray(req.session.data.activities)
    const sellingOnly = activities.length === 1 && activities[0] === 'selling'
    // TODO: /sell = Sell-section entry, /main-address = common address lookup —
    // both wired to their real 1.3 pages as those screens land.
    if (sellingOnly) return res.redirect(P + '/sell')
    res.redirect(P + '/address-lookup')
  })

  // Business address lookup (Figma 1.3). "Enter an address manually" is a direct
  // link to /main-address. "Find an address" would lead to a results/select page
  // — that screen is pending, so for now it proceeds to the manual page.
  router.post(P + '/address-lookup', (req, res) => {
    const v = validate([
      {
        field: 'lookup-postcode',
        message: 'Enter a postcode',
        valid: filled(req.session.data['lookup-postcode'])
      }
    ])
    if (!v.ok) return res.render(view('address-lookup'), v)
    // TODO: real "select an address" results page for the Find path (pending).
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

    // Only ask about quantity if they USE PPPs/adjuvants at this address. Storing
    // or record-keeping alone doesn't need a quantity, so skip straight past it.
    const addressActivity = toArray(req.session.data['address-activity'])
    if (addressActivity.includes('use')) return res.redirect(P + '/quantity')
    res.redirect(afterQuantity(toArray(req.session.data.activities)))
  })

  // --- Quantity: pick how to express it (amount or area), fill the revealed
  // field, then branch (amateur-only skips sector) ---
  router.post(P + '/quantity', (req, res) => {
    const d = req.session.data
    const type = d['quantity-type']

    const rules = [
      {
        field: 'quantity-type',
        message: 'Select how you want to give the quantity',
        valid: filled(type)
      }
    ]
    if (type === 'amount') {
      rules.push({
        field: 'quantity',
        message: 'Enter an estimated annual quantity',
        valid: filled(d.quantity)
      })
    }
    if (type === 'area') {
      rules.push({
        field: 'area',
        message: 'Enter an estimated annual area covered',
        valid: filled(d.area)
      })
    }

    const v = validate(rules)
    if (!v.ok) return res.render(view('quantity'), v)

    res.redirect(afterQuantity(toArray(d.activities)))
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
