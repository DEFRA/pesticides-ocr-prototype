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
  consumeReturnTo,
  clearAdditionalAddressFields
} = require('./journey-helpers')

const V = 'v1-3'
const P = '/' + V // URL prefix for redirects
const view = (name) => V + '/' + name // view path for render (app/views/v1-3/…)

// v1.3 sector → subsector → schemes chain (Using journey). A subsector page
// appears per selected sector (Agriculture/Amenity/Horticulture, in that order);
// the assurance-schemes page only if Agriculture or Horticulture was selected;
// then on to store-applied. Given the page just completed (null at the start),
// return the next page name in the chain.
const sectorChainNext = (afterPage, sectors) => {
  const steps = []
  if (sectors.includes('Agriculture')) steps.push('agri-subsectors')
  if (sectors.includes('Amenity')) steps.push('amenity-subsectors')
  if (sectors.includes('Horticulture')) steps.push('horti-subsectors')
  if (sectors.includes('Agriculture') || sectors.includes('Horticulture')) {
    steps.push('assurance-schemes')
  }
  steps.push('store-applied')
  return steps[steps.indexOf(afterPage) + 1]
}

// Entry page for each activity's sub-flow. The common route (activities →
// business name → address → contact) hands off to the FIRST selected activity's
// entry; each sub-flow currently ends at check-answers. As more activities land
// they'll be chained in selection order. Activities without a built flow yet are
// skipped over. selling-only is handled separately (business-name → /sell).
const activityEntry = {
  using: 'who-applies',
  manufacturing: 'manufacture-products',
  importing: 'import-products'
}
const firstActivityEntry = (activities) => {
  for (const a of activities) {
    if (activityEntry[a]) return activityEntry[a]
  }
  return 'check-answers'
}

module.exports = (router) => {
  // Bare version root → the version's start page. Without this, /v1-2 has no
  // matching view and hits the Prototype Kit's (broken) built-in 404 page.
  router.get(P, (req, res) => res.redirect(P + '/start'))

  // Capture a CYA "Change" link's ?returnTo=<cya> into session (on the GET of the
  // page being edited), so that page's POST can return to the CYA. Scoped to this
  // version's paths. See consumeReturnTo in journey-helpers.
  router.use((req, res, next) => {
    if (req.path.startsWith(P) && req.query.returnTo && req.session.data) {
      req.session.data.returnTo = req.query.returnTo
    }
    next()
  })

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
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
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

    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)

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
    res.redirect(P + '/address-lookup-result')
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
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/contact-details')
  })

  // Main business address outside Great Britain (free-text) — reached from the
  // "outside of Great Britain" link on the manual address page.
  router.post(P + '/address-international', (req, res) => {
    const v = validate([
      {
        field: 'international-address',
        message: 'Enter your business address',
        valid: filled(req.session.data['international-address'])
      }
    ])
    if (!v.ok) return res.render(view('address-international'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
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
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    // Hand off to the first selected activity's sub-flow. Ordered chaining across
    // multiple activities is added as the remaining flows land.
    res.redirect(
      P + '/' + firstActivityEntry(toArray(req.session.data.activities))
    )
  })

  // --- Using PPPs journey (Figma 1.3) -------------------------------------

  // Who applies PPPs? Branch: we-apply → sector; another org → 3rd-party details.
  router.post(P + '/who-applies', (req, res) => {
    const answer = req.session.data['who-applies']
    const v = validate([
      {
        field: 'who-applies',
        message: 'Select who applies PPPs for your organisation',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('who-applies'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    if (answer === 'Another organisation applies PPPs on our behalf') {
      return res.redirect(P + '/third-party')
    }
    res.redirect(P + '/sector')
  })

  // Third-party applicator details (reached when another org applies) → sector.
  router.post(P + '/third-party', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'third-party-name',
        message: 'Enter the business or company name',
        valid: filled(d['third-party-name'])
      },
      {
        field: 'third-party-line-1',
        message: 'Enter address line 1',
        valid: filled(d['third-party-line-1'])
      },
      {
        field: 'third-party-town',
        message: 'Enter a town or city',
        valid: filled(d['third-party-town'])
      },
      {
        field: 'third-party-postcode',
        message: 'Enter a postcode',
        valid: filled(d['third-party-postcode'])
      },
      {
        field: 'third-party-country',
        message: 'Select a country',
        valid: filled(d['third-party-country'])
      }
    ])
    if (!v.ok) return res.render(view('third-party'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/sector')
  })

  // Which sector(s)? Assurance schemes only apply to agriculture / horticulture,
  // so branch past them otherwise.
  router.post(P + '/sector', (req, res) => {
    const d = req.session.data
    const sectors = toArray(d.sector)
    const v = validate([
      {
        field: 'sector',
        message: 'Select a sector, or describe your work in the ‘Other’ box',
        valid: sectors.length > 0 || filled(d['sector-other'])
      }
    ])
    if (!v.ok) return res.render(view('sector'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/' + sectorChainNext(null, sectors))
  })

  // Agricultural subsectors (shown when Agriculture is a selected sector).
  router.post(P + '/agri-subsectors', (req, res) => {
    const d = req.session.data
    const sub = toArray(d['agri-subsector'])
    const v = validate([
      {
        field: 'agri-subsector',
        message:
          'Select an agricultural sector, or describe your work in the ‘Other’ box',
        valid: sub.length > 0 || filled(d['agri-subsector-other'])
      }
    ])
    if (!v.ok) return res.render(view('agri-subsectors'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P + '/' + sectorChainNext('agri-subsectors', toArray(d.sector))
    )
  })

  // Amenity subsectors (shown when Amenity is a selected sector).
  router.post(P + '/amenity-subsectors', (req, res) => {
    const d = req.session.data
    const sub = toArray(d['amenity-subsector'])
    const v = validate([
      {
        field: 'amenity-subsector',
        message:
          'Select an amenity sector, or describe your work in the ‘Other’ box',
        valid: sub.length > 0 || filled(d['amenity-subsector-other'])
      }
    ])
    if (!v.ok) return res.render(view('amenity-subsectors'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P + '/' + sectorChainNext('amenity-subsectors', toArray(d.sector))
    )
  })

  // Horticultural subsectors (shown when Horticulture is a selected sector).
  router.post(P + '/horti-subsectors', (req, res) => {
    const d = req.session.data
    const sub = toArray(d['horti-subsector'])
    const v = validate([
      {
        field: 'horti-subsector',
        message:
          'Select a horticultural sector, or describe your work in the ‘Other’ box',
        valid: sub.length > 0 || filled(d['horti-subsector-other'])
      }
    ])
    if (!v.ok) return res.render(view('horti-subsectors'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P + '/' + sectorChainNext('horti-subsectors', toArray(d.sector))
    )
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

  // Quantity band (Using journey) → the combined check-answers.
  router.post(P + '/quantity', (req, res) => {
    const v = validate([
      {
        field: 'quantity',
        message: 'Select the quantity range that best matches your use',
        valid: filled(req.session.data.quantity)
      }
    ])
    if (!v.ok) return res.render(view('quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/check-answers')
  })

  // Assurance schemes (optional, no validation) → next in the sector chain.
  router.post(P + '/assurance-schemes', (req, res) => {
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        sectorChainNext('assurance-schemes', toArray(req.session.data.sector))
    )
  })

  // Do you store products you apply? Branch: own sites → where; 3rd party → how
  // many sites; don't store → skip storage details (on to quantity).
  router.post(P + '/store-applied', (req, res) => {
    const answer = req.session.data['store-applied']
    const v = validate([
      {
        field: 'store-applied',
        message: 'Select whether you store products you apply',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('store-applied'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    if (answer === 'Yes, at sites we own') {
      return res.redirect(P + '/storing-where')
    }
    if (answer === 'Yes, a third party stores them for us') {
      return res.redirect(P + '/store-3rd-party-contact')
    }
    res.redirect(P + '/quantity')
  })

  // Third-party storage contact → how many sites.
  router.post(P + '/store-3rd-party-contact', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'store-3p-name',
        message: 'Enter a contact name',
        valid: filled(d['store-3p-name'])
      },
      {
        field: 'store-3p-business',
        message: 'Enter the business name',
        valid: filled(d['store-3p-business'])
      },
      {
        field: 'store-3p-telephone',
        message: 'Enter a telephone number',
        valid: filled(d['store-3p-telephone'])
      },
      {
        field: 'store-3p-email',
        message: 'Enter an email address',
        valid: filled(d['store-3p-email'])
      }
    ])
    if (!v.ok) return res.render(view('store-3rd-party-contact'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/store-sites')
  })

  // Where do you store? Main address → how many sites; different location →
  // storage address lookup.
  router.post(P + '/storing-where', (req, res) => {
    const answer = req.session.data['storing-where']
    const v = validate([
      {
        field: 'storing-where',
        message: 'Select where you store products you apply',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('storing-where'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    if (answer === 'Main business address') {
      return res.redirect(P + '/store-sites')
    }
    res.redirect(P + '/store-own-address-lookup')
  })

  // How many storage sites → quantity.
  router.post(P + '/store-sites', (req, res) => {
    const v = validate([
      {
        field: 'store-sites',
        message: 'Select the number of sites you are responsible for',
        valid: filled(req.session.data['store-sites'])
      }
    ])
    if (!v.ok) return res.render(view('store-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/quantity')
  })

  // Storage location lookup (own, different location) → how many sites.
  // "Enter an address manually" links straight to store-sites for now.
  router.post(P + '/store-own-address-lookup', (req, res) => {
    const v = validate([
      {
        field: 'store-postcode',
        message: 'Enter a postcode',
        valid: filled(req.session.data['store-postcode'])
      }
    ])
    if (!v.ok) return res.render(view('store-own-address-lookup'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/store-own-address-result')
  })

  // Storage location entered manually → how many sites.
  router.post(P + '/store-own-address-manual', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'store-line-1',
        message: 'Enter address line 1',
        valid: filled(d['store-line-1'])
      },
      {
        field: 'store-town',
        message: 'Enter a town or city',
        valid: filled(d['store-town'])
      },
      {
        field: 'store-postcode',
        message: 'Enter a postcode',
        valid: filled(d['store-postcode'])
      },
      {
        field: 'store-country',
        message: 'Select a country',
        valid: filled(d['store-country'])
      }
    ])
    if (!v.ok) return res.render(view('store-own-address-manual'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/store-sites')
  })

  // --- Manufacturing PPPs journey (Figma 1.3) -----------------------------
  // products → number of sites → quantity band → check-answers.

  router.post(P + '/manufacture-products', (req, res) => {
    const v = validate([
      {
        field: 'manufacture-products',
        message: 'Select what products you manufacture',
        valid: filled(req.session.data['manufacture-products'])
      }
    ])
    if (!v.ok) return res.render(view('manufacture-products'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/manufacture-sites')
  })

  router.post(P + '/manufacture-sites', (req, res) => {
    const v = validate([
      {
        field: 'manufacture-sites',
        message: 'Select the number of sites you are responsible for',
        valid: filled(req.session.data['manufacture-sites'])
      }
    ])
    if (!v.ok) return res.render(view('manufacture-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/manufacture-quantity')
  })

  router.post(P + '/manufacture-quantity', (req, res) => {
    const v = validate([
      {
        field: 'manufacture-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['manufacture-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('manufacture-quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/check-answers')
  })

  // --- Importing PPPs journey (Figma 1.3) ---------------------------------
  // products → do you store? → (storage sub-flow) → quantity → check-answers.

  router.post(P + '/import-products', (req, res) => {
    const v = validate([
      {
        field: 'import-products',
        message: 'Select what products you import',
        valid: filled(req.session.data['import-products'])
      }
    ])
    if (!v.ok) return res.render(view('import-products'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/import-storing')
  })

  // Do you store products you import? Own sites → where; 3rd party → contact;
  // don't store → quantity.
  router.post(P + '/import-storing', (req, res) => {
    const answer = req.session.data['import-storing']
    const v = validate([
      {
        field: 'import-storing',
        message: 'Select whether you store products you import',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('import-storing'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    if (answer === 'Yes, at sites we own') {
      return res.redirect(P + '/import-storing-where')
    }
    if (answer === 'Yes, a third party stores them on our behalf') {
      return res.redirect(P + '/import-store-3rd-party-contact')
    }
    res.redirect(P + '/import-quantity')
  })

  // Third-party storage contact (import) → how many sites.
  router.post(P + '/import-store-3rd-party-contact', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'import-store-3p-name',
        message: 'Enter a contact name',
        valid: filled(d['import-store-3p-name'])
      },
      {
        field: 'import-store-3p-telephone',
        message: 'Enter a telephone number',
        valid: filled(d['import-store-3p-telephone'])
      },
      {
        field: 'import-store-3p-email',
        message: 'Enter an email address',
        valid: filled(d['import-store-3p-email'])
      }
    ])
    if (!v.ok) return res.render(view('import-store-3rd-party-contact'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/import-store-sites')
  })

  // Where do you store? Main address → how many sites; different location →
  // storage address lookup.
  router.post(P + '/import-storing-where', (req, res) => {
    const answer = req.session.data['import-storing-where']
    const v = validate([
      {
        field: 'import-storing-where',
        message: 'Select where you store products you import',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('import-storing-where'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    if (answer === 'Main business address') {
      return res.redirect(P + '/import-store-sites')
    }
    res.redirect(P + '/import-store-own-address-lookup')
  })

  // How many storage sites (import) → quantity.
  router.post(P + '/import-store-sites', (req, res) => {
    const v = validate([
      {
        field: 'import-store-sites',
        message: 'Select the number of sites you are responsible for',
        valid: filled(req.session.data['import-store-sites'])
      }
    ])
    if (!v.ok) return res.render(view('import-store-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/import-quantity')
  })

  // Storage location lookup intro (own, different location): "Find an address" →
  // the postcode search page; "enter manually" links straight to the manual page.
  router.post(P + '/import-store-own-address-lookup', (req, res) =>
    res.redirect(P + '/import-store-own-address-search')
  )

  // Storage location postcode search → results.
  router.post(P + '/import-store-own-address-search', (req, res) => {
    const v = validate([
      {
        field: 'import-store-postcode',
        message: 'Enter a postcode',
        valid: filled(req.session.data['import-store-postcode'])
      }
    ])
    if (!v.ok) return res.render(view('import-store-own-address-search'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/import-store-own-address-result')
  })

  // Storage location entered manually → how many sites.
  router.post(P + '/import-store-own-address-manual', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'import-store-line-1',
        message: 'Enter address line 1',
        valid: filled(d['import-store-line-1'])
      },
      {
        field: 'import-store-town',
        message: 'Enter a town or city',
        valid: filled(d['import-store-town'])
      },
      {
        field: 'import-store-postcode',
        message: 'Enter a postcode',
        valid: filled(d['import-store-postcode'])
      },
      {
        field: 'import-store-country',
        message: 'Select a country',
        valid: filled(d['import-store-country'])
      }
    ])
    if (!v.ok) return res.render(view('import-store-own-address-manual'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/import-store-sites')
  })

  // Quantity (import, free-text) → the combined check-answers.
  router.post(P + '/import-quantity', (req, res) => {
    const v = validate([
      {
        field: 'import-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['import-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('import-quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/check-answers')
  })

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

  // Check-answers is rendered here (not auto-rendered) so all option-string
  // comparisons live in JS. The formatter reflows nunjucks {% set %} blocks like
  // prose and can insert newlines inside string literals, which silently breaks
  // in-template string comparisons; computing the flags here avoids that.
  const NO_STORE = "No, we don't store PPPs"
  const STORING_WHERE_LABEL = {
    'Main business address': 'At main business address',
    'A different location to the main business address':
      'At a different location'
  }
  router.get(P + '/check-answers', (req, res) => {
    const d = req.session.data || {}
    const sectors = toArray(d.sector)
    res.render(view('check-answers'), {
      // Resolved "where do you store" label lines (kept out of the template so
      // the formatter can't split the multi-word map keys used for lookup)
      usingStoringWhereText:
        STORING_WHERE_LABEL[d['storing-where']] || d['storing-where'] || '',
      importStoringWhereText:
        STORING_WHERE_LABEL[d['import-storing-where']] ||
        d['import-storing-where'] ||
        '',
      // Using PPPs section
      usingAnotherOrg:
        d['who-applies'] === 'Another organisation applies PPPs on our behalf',
      usingAssurance:
        sectors.includes('Agriculture') || sectors.includes('Horticulture'),
      usingStoreOwnSites: d['store-applied'] === 'Yes, at sites we own',
      usingStoreThirdParty:
        d['store-applied'] === 'Yes, a third party stores them for us',
      usingStoreOwnDifferent:
        d['store-applied'] === 'Yes, at sites we own' &&
        d['storing-where'] ===
          'A different location to the main business address',
      usingShowStorageSites:
        !!d['store-applied'] && d['store-applied'] !== NO_STORE,
      // Importing PPPs section
      importStoreOwnSites: d['import-storing'] === 'Yes, at sites we own',
      importStoreThirdParty:
        d['import-storing'] === 'Yes, a third party stores them on our behalf',
      importStoreOwnDifferent:
        d['import-storing'] === 'Yes, at sites we own' &&
        d['import-storing-where'] ===
          'A different location to the main business address',
      importShowStorageSites:
        !!d['import-storing'] && d['import-storing'] !== NO_STORE
    })
  })

  // --- Finish ---
  router.post(P + '/check-answers', (req, res) =>
    res.redirect(P + '/confirmation')
  )
}
