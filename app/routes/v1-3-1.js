//
// OCR register journey — version 1.3.1. Mounted under /v1-3-1.
// Starts as a copy of 1.3, brought in line with the Figma master. Version 1.4
// stays for the sign-in changes.
//
const {
  toArray,
  filled,
  validate,
  isAmateurOnly,
  consumeReturnTo,
  clearAdditionalAddressFields
} = require('./journey-helpers')

const V = 'v1-3-1'
const P = '/' + V // URL prefix for redirects
const view = (name) => V + '/' + name // view path for render (app/views/v1-3-1/…)

// v1.3 sector → subsector → schemes chain (Using journey). A subsector page
// appears per selected sector (Agriculture/Amenity/Horticulture, in that order);
// the assurance-schemes page only if Agriculture or Horticulture was selected;
// then on to store-applied.
const sectorChain = (sectors) => {
  const steps = ['sector']
  if (sectors.includes('Agriculture')) steps.push('agri-subsectors')
  if (sectors.includes('Amenity')) steps.push('amenity-subsectors')
  if (sectors.includes('Horticulture')) steps.push('horti-subsectors')
  if (sectors.includes('Agriculture') || sectors.includes('Horticulture')) {
    steps.push('assurance-schemes')
  }
  steps.push('store-applied')
  return steps
}
// The pages after the one just completed.
const sectorChainAfter = (page, sectors) => {
  const steps = sectorChain(sectors)
  return steps.slice(steps.indexOf(page) + 1)
}
const sectorChainPrev = (page, sectors) => {
  const steps = sectorChain(sectors)
  return steps[steps.indexOf(page) - 1]
}

const ANOTHER_ORG = 'Another organisation applies PPPs on our behalf'

// Pages a check-answers Change can lead on to, and whether each is answered.
// Pages not listed here count as answered.
const answered = {
  'third-party': (d) => filled(d['third-party-name']),
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
  'store-own-address-lookup': (d) => filled(d['store-postcode']),
  'store-3rd-party-contact': (d) => filled(d['store-3p-name']),
  quantity: (d) => filled(d.quantity),
  'import-store-own-address-lookup': (d) => filled(d['import-store-postcode']),
  'import-store-3rd-party-contact': (d) => filled(d['import-store-3p-name']),
  'import-quantity': (d) => filled(d['import-quantity']),
  'sell-pro-products': (d) => filled(d['sell-pro-products']),
  'sell-pro-quantity': (d) => filled(d['sell-pro-quantity']),
  'sell-pro-sites': (d) => filled(d['sell-pro-sites']),
  'sell-amateur-quantity': (d) => filled(d['sell-amateur-quantity']),
  'address-lookup': (d) =>
    filled(d['address-postcode']) || filled(d['international-address']),
  'contact-details': (d) => filled(d['contact-name']),
  'sell-amateur-head-office-address-lookup': (d) =>
    filled(d['sell-ho-postcode']),
  'sell-amateur-contact-details': (d) => filled(d['sell-contact-name']),
  sell: (d) => activityDone('selling', d)
}

// Go to the first of `steps` (the rest of the route). After a check-answers
// Change, go to the first unanswered step instead, keeping returnTo set, or
// straight back to check answers when every step is answered.
const goNext = (req, res, steps) => {
  const d = req.session.data
  const pending =
    d.returnTo && steps.find((page) => answered[page] && !answered[page](d))
  if (pending) return res.redirect(P + '/' + pending)
  res.redirect(P + '/' + (consumeReturnTo(req) || steps[0]))
}

// Accepting a lookup result replaces any manually entered address.
const clearManualAddress = (d, prefix) =>
  ['line-1', 'line-2', 'town', 'country'].forEach(
    (field) => delete d[prefix + '-' + field]
  )

// The page before a storage quantity page, following the storage answers.
// Manual entry is recognised by its address line 1, as on the check-answers page.
const storageBack = (d, f) => {
  if (d[f.store] === 'Yes, at sites we own') {
    if (d[f.where] === 'Main business address') return f.wherePage
    return filled(d[f.line1]) ? f.manualPage : f.resultPage
  }
  if (d[f.store] === f.thirdPartyAnswer) return f.thirdPartyPage
  return f.storePage
}

// Selling-only collects the address and contact after the Sell flow, not before.
const isSellingOnly = (activities) =>
  activities.length === 1 && activities[0] === 'selling'
const isSellPro = (d) => d['sell-use-type'] === 'Mostly professional use'
const sellingOnlyAddressSteps = (d) =>
  isSellPro(d)
    ? ['address-lookup', 'contact-details']
    : [
        'sell-amateur-head-office-address-lookup',
        'sell-amateur-contact-details'
      ]

// Back links that depend on the path taken. Templates use
// `pathBackLink or <default>`.
const pathBack = {
  'address-lookup': (d) =>
    isSellingOnly(toArray(d.activities)) && isSellPro(d)
      ? 'sell-pro-sites'
      : 'business-name',
  sector: (d) =>
    d['who-applies'] === ANOTHER_ORG ? 'third-party' : 'who-applies',
  'sell-amateur-contact-details': (d) =>
    filled(d['sell-ho-line-1'])
      ? 'sell-amateur-head-office-manual-address'
      : 'sell-amateur-head-office-address-lookup-result',
  'amenity-subsectors': (d) =>
    sectorChainPrev('amenity-subsectors', toArray(d.sector)),
  'horti-subsectors': (d) =>
    sectorChainPrev('horti-subsectors', toArray(d.sector)),
  'assurance-schemes': (d) =>
    sectorChainPrev('assurance-schemes', toArray(d.sector)),
  'store-applied': (d) => sectorChainPrev('store-applied', toArray(d.sector)),
  quantity: (d) =>
    storageBack(d, {
      store: 'store-applied',
      where: 'storing-where',
      line1: 'store-line-1',
      thirdPartyAnswer: 'Yes, a third party stores them for us',
      storePage: 'store-applied',
      wherePage: 'storing-where',
      manualPage: 'store-own-address-manual',
      resultPage: 'store-own-address-result',
      thirdPartyPage: 'store-3rd-party-contact'
    }),
  'import-quantity': (d) =>
    storageBack(d, {
      store: 'import-storing',
      where: 'import-storing-where',
      line1: 'import-store-line-1',
      thirdPartyAnswer: 'Yes, a third party stores them on our behalf',
      storePage: 'import-storing',
      wherePage: 'import-storing-where',
      manualPage: 'import-store-own-address-manual',
      resultPage: 'import-store-own-address-result',
      thirdPartyPage: 'import-store-3rd-party-contact'
    })
}

// Entry page for each activity's sub-flow. The common route (activities →
// business name → address → contact) hands off to the FIRST selected activity's
// entry; each sub-flow currently ends at check-answers. As more activities land
// they'll be chained in selection order. Activities without a built flow yet are
// skipped over. selling-only is handled separately (business-name → /sell).
const activityEntry = {
  using: 'who-applies',
  manufacturing: 'manufacture-products',
  importing: 'import-products',
  processing: 'process-products',
  selling: 'sell',
  distributing: 'distribute-products',
  'storing-only': 'store-only-products'
}
// Has this activity's flow been completed? (its final answer is in session).
const activityDone = (act, d) => {
  switch (act) {
    case 'using':
      return filled(d['quantity'])
    case 'manufacturing':
      return filled(d['manufacture-quantity'])
    case 'importing':
      return filled(d['import-quantity'])
    case 'processing':
      return filled(d['process-quantity'])
    case 'distributing':
      return filled(d['distribute-quantity'])
    case 'storing-only':
      return filled(d['store-only-quantity'])
    case 'selling':
      return isSellPro(d)
        ? filled(d['sell-pro-sites'])
        : filled(d['sell-amateur-quantity'])
    default:
      return true
  }
}

// The entry page of the first selected activity (selection = checkbox DOM order)
// that has NOT yet been completed, or check-answers when they all have. Used both
// to chain multiple activities on a fresh walk and to walk only the newly-added
// activity when the selection is changed from the check-answers page.
const nextUnanswered = (activities, d) => {
  for (const a of activities) {
    if (activityEntry[a] && !activityDone(a, d)) return activityEntry[a]
  }
  return 'check-answers'
}

// Inverse of activityEntry: entry page → activity, for the entry-page back link.
const entryActivity = Object.fromEntries(
  Object.entries(activityEntry).map(([act, page]) => [page, act])
)
// The final page of an activity's flow (Sell varies by pro/amateur).
const lastPageOfActivity = (act, d) => {
  if (act === 'selling') {
    return isSellPro(d) ? 'sell-pro-sites' : 'sell-amateur-quantity'
  }
  return {
    using: 'quantity',
    manufacturing: 'manufacture-quantity',
    importing: 'import-quantity',
    processing: 'process-quantity',
    distributing: 'distribute-quantity',
    'storing-only': 'store-only-quantity'
  }[act]
}

// Confirmation: the whole registration is covered by ONE reference number,
// however many activities were selected (sample ref — prototype only, for UR).
const REGISTRATION_REF = 'PPP-409-28G'

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

  // On an activity entry page that isn't the first in the chain, point Back at the
  // previous selected activity's final page (entry pages otherwise default Back to
  // contact-details). Templates use `entryBackLink or <default>`.
  router.use((req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith(P + '/')) {
      const act = entryActivity[req.path.slice(P.length + 1).replace(/\/$/, '')]
      const acts = toArray(
        req.session.data && req.session.data.activities
      ).filter((a) => activityEntry[a])
      const idx = act ? acts.indexOf(act) : -1
      if (idx > 0) {
        res.locals.entryBackLink =
          P + '/' + lastPageOfActivity(acts[idx - 1], req.session.data)
      }
    }
    next()
  })

  // Path-dependent back links (see pathBack). Set for POSTs too, so a page
  // re-rendered with errors keeps the same back link.
  router.use((req, res, next) => {
    if (req.path.startsWith(P + '/') && req.session.data) {
      const backOf = pathBack[req.path.slice(P.length + 1).replace(/\/$/, '')]
      const back = backOf && backOf(req.session.data)
      if (back) res.locals.pathBackLink = P + '/' + back
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
    let activities = toArray(req.session.data.activities)
    const v = validate([
      {
        field: 'activities',
        message: 'Select which activities your organisation carries out',
        valid: activities.length > 0
      }
    ])
    if (!v.ok) return res.render(view('activities'), v)

    // Reorder to the click order captured client-side (activities-order); anything
    // not in it (e.g. JS off) keeps DOM order at the end. This is the order the
    // activity flows are then traversed in.
    const clickOrder = (req.session.data['activities-order'] || '')
      .split(',')
      .filter(Boolean)
    activities = [
      ...clickOrder.filter((a) => activities.includes(a)),
      ...activities.filter((a) => !clickOrder.includes(a))
    ]
    const d = req.session.data
    d.activities = activities
    if (isSellingOnly(activities) && d.returnTo) {
      return goNext(req, res, ['sell', ...sellingOnlyAddressSteps(d)])
    }
    // Changed from the CYA: collect a missing main address or contact, then walk
    // the first activity with no answers yet.
    if (consumeReturnTo(req)) {
      const missingAddress = ['address-lookup', 'contact-details'].find(
        (page) => !answered[page](d)
      )
      return res.redirect(
        P + '/' + (missingAddress || nextUnanswered(activities, d))
      )
    }
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

    // Selling-only goes straight to the Sell section (see sellingOnlyAddressSteps).
    if (isSellingOnly(toArray(req.session.data.activities))) {
      return res.redirect(P + '/sell')
    }
    res.redirect(P + '/address-lookup')
  })

  // Business address lookup (Figma 1.3). "Enter an address manually" is a direct
  // link to /main-address.
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

  // "Use this address": save the prototype's sample result as the main address.
  router.post(P + '/address-lookup-result', (req, res) => {
    const d = req.session.data
    Object.assign(d, {
      'address-line-1': d['lookup-building'] || 'Pesticides House',
      'address-line-2': 'Chemical close',
      'address-town': 'City',
      'address-postcode': d['lookup-postcode'] || 'AA3 1AB',
      'address-country': 'England'
    })
    delete d['international-address']
    goNext(req, res, ['contact-details'])
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
    delete d['international-address']
    goNext(req, res, ['contact-details'])
  })

  // Main business address outside Great Britain (free-text). Not linked from
  // any page for now.
  router.post(P + '/address-international', (req, res) => {
    const v = validate([
      {
        field: 'international-address',
        message: 'Enter your business address',
        valid: filled(req.session.data['international-address'])
      }
    ])
    if (!v.ok) return res.render(view('address-international'), v)
    goNext(req, res, ['contact-details'])
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
    // Hand off to the first not-yet-answered selected activity's sub-flow.
    res.redirect(P + '/' + nextUnanswered(toArray(d.activities), d))
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
    goNext(
      req,
      res,
      answer === ANOTHER_ORG ? ['third-party', 'sector'] : ['sector']
    )
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
    goNext(req, res, sectorChainAfter('sector', sectors))
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
    goNext(req, res, sectorChainAfter('agri-subsectors', toArray(d.sector)))
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
    goNext(req, res, sectorChainAfter('amenity-subsectors', toArray(d.sector)))
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
    goNext(req, res, sectorChainAfter('horti-subsectors', toArray(d.sector)))
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
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // Assurance schemes (optional, no validation) → next in the sector chain.
  router.post(P + '/assurance-schemes', (req, res) =>
    goNext(
      req,
      res,
      sectorChainAfter('assurance-schemes', toArray(req.session.data.sector))
    )
  )

  // Do you store products you apply? Branch: own sites → where; 3rd party →
  // contact; don't store → quantity.
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
    // Own sites always asks where, as check answers shows both in one row.
    if (answer === 'Yes, at sites we own') {
      return res.redirect(P + '/storing-where')
    }
    if (answer === 'Yes, a third party stores them for us') {
      return goNext(req, res, ['store-3rd-party-contact', 'quantity'])
    }
    goNext(req, res, ['quantity'])
  })

  // Third-party storage contact → quantity.
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
    res.redirect(P + '/quantity')
  })

  // Where do you store? Main address → quantity; different location → storage
  // location chooser.
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
    if (answer === 'Main business address') {
      return goNext(req, res, ['quantity'])
    }
    goNext(req, res, ['store-own-address-lookup', 'quantity'])
  })

  // Storage location chooser: "Find an address" and Continue both go to the
  // postcode search; "enter an address manually" links to the manual page.
  router.post(P + '/store-own-address-lookup', (req, res) =>
    res.redirect(P + '/store-own-address-search')
  )

  // Storage location postcode search → address result.
  router.post(P + '/store-own-address-search', (req, res) => {
    const v = validate([
      {
        field: 'store-postcode',
        message: 'Enter a postcode',
        valid: filled(req.session.data['store-postcode'])
      }
    ])
    if (!v.ok) return res.render(view('store-own-address-search'), v)
    res.redirect(P + '/store-own-address-result')
  })

  router.post(P + '/store-own-address-result', (req, res) => {
    clearManualAddress(req.session.data, 'store')
    res.redirect(P + '/' + (consumeReturnTo(req) || 'quantity'))
  })

  // Storage location entered manually → quantity.
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
    res.redirect(P + '/quantity')
  })

  // --- Manufacturing PPPs journey (Figma 1.3) -----------------------------
  // products → number of sites → free-text annual volume → check-answers.

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
        message: 'Select how many sites you manufacture PPPs at',
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
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // --- Selling PPPs journey (Figma 1.3) -----------------------------------
  // PPP use type splits into a professional branch (products → quantity → sites)
  // and an amateur branch (quantity). Selling-only then collects the address and
  // contact (see sellingOnlyAddressSteps).
  router.post(P + '/sell', (req, res) => {
    const answer = req.session.data['sell-use-type']
    const v = validate([
      {
        field: 'sell-use-type',
        message:
          'Select whether the PPPs you sell are mostly professional or amateur use',
        valid: filled(answer)
      }
    ])
    if (!v.ok) return res.render(view('sell'), v)
    const d = req.session.data
    const addressSteps = isSellingOnly(toArray(d.activities))
      ? sellingOnlyAddressSteps(d)
      : []
    if (answer === 'Mostly amateur use') {
      return goNext(req, res, ['sell-amateur-quantity', ...addressSteps])
    }
    goNext(req, res, [
      'sell-pro-products',
      'sell-pro-quantity',
      'sell-pro-sites',
      ...addressSteps
    ])
  })

  router.post(P + '/sell-pro-products', (req, res) => {
    const v = validate([
      {
        field: 'sell-pro-products',
        message: 'Select what products you sell',
        valid: filled(req.session.data['sell-pro-products'])
      }
    ])
    if (!v.ok) return res.render(view('sell-pro-products'), v)
    goNext(req, res, ['sell-pro-quantity', 'sell-pro-sites'])
  })

  router.post(P + '/sell-amateur-quantity', (req, res) => {
    const v = validate([
      {
        field: 'sell-amateur-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['sell-amateur-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('sell-amateur-quantity'), v)
    if (isSellingOnly(toArray(req.session.data.activities))) {
      return goNext(req, res, sellingOnlyAddressSteps(req.session.data))
    }
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  router.post(P + '/sell-pro-quantity', (req, res) => {
    const v = validate([
      {
        field: 'sell-pro-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['sell-pro-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('sell-pro-quantity'), v)
    goNext(req, res, ['sell-pro-sites'])
  })

  router.post(P + '/sell-pro-sites', (req, res) => {
    const v = validate([
      {
        field: 'sell-pro-sites',
        message: 'Select how many sites you sell professional PPPs at',
        valid: filled(req.session.data['sell-pro-sites'])
      }
    ])
    if (!v.ok) return res.render(view('sell-pro-sites'), v)
    if (isSellingOnly(toArray(req.session.data.activities))) {
      return goNext(req, res, sellingOnlyAddressSteps(req.session.data))
    }
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // Head office address (amateur sellers, selling-only). "Find an address" →
  // postcode search; "enter manually" links to the manual page.
  router.post(P + '/sell-amateur-head-office-address-lookup', (req, res) =>
    res.redirect(P + '/sell-amateur-head-office-lookup-search')
  )

  router.post(P + '/sell-amateur-head-office-lookup-search', (req, res) => {
    const v = validate([
      {
        field: 'sell-ho-postcode',
        message: 'Enter a postcode',
        valid: filled(req.session.data['sell-ho-postcode'])
      }
    ])
    if (!v.ok)
      return res.render(view('sell-amateur-head-office-lookup-search'), v)
    res.redirect(P + '/sell-amateur-head-office-address-lookup-result')
  })

  router.post(
    P + '/sell-amateur-head-office-address-lookup-result',
    (req, res) => {
      clearManualAddress(req.session.data, 'sell-ho')
      goNext(req, res, ['sell-amateur-contact-details'])
    }
  )

  router.post(P + '/sell-amateur-head-office-manual-address', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'sell-ho-line-1',
        message: 'Enter address line 1',
        valid: filled(d['sell-ho-line-1'])
      },
      {
        field: 'sell-ho-town',
        message: 'Enter a town or city',
        valid: filled(d['sell-ho-town'])
      },
      {
        field: 'sell-ho-postcode',
        message: 'Enter a postcode',
        valid: filled(d['sell-ho-postcode'])
      },
      {
        field: 'sell-ho-country',
        message: 'Select a country',
        valid: filled(d['sell-ho-country'])
      }
    ])
    if (!v.ok)
      return res.render(view('sell-amateur-head-office-manual-address'), v)
    goNext(req, res, ['sell-amateur-contact-details'])
  })

  router.post(P + '/sell-amateur-contact-details', (req, res) => {
    const d = req.session.data
    const v = validate([
      {
        field: 'sell-contact-name',
        message: 'Enter a name',
        valid: filled(d['sell-contact-name'])
      },
      {
        field: 'sell-contact-telephone',
        message: 'Enter a telephone number',
        valid: filled(d['sell-contact-telephone'])
      },
      {
        field: 'sell-contact-email',
        message: 'Enter an email address',
        valid: filled(d['sell-contact-email'])
      }
    ])
    if (!v.ok) return res.render(view('sell-amateur-contact-details'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // --- Only storing PPPs journey (Figma 1.3) ------------------------------
  // products → number of sites → free-text annual volume → check-answers.
  // (storing-only is exclusive but still uses the common address/contact route.)

  router.post(P + '/store-only-products', (req, res) => {
    const v = validate([
      {
        field: 'store-only-products',
        message: 'Select what products you store',
        valid: filled(req.session.data['store-only-products'])
      }
    ])
    if (!v.ok) return res.render(view('store-only-products'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/store-only-sites')
  })

  router.post(P + '/store-only-sites', (req, res) => {
    const v = validate([
      {
        field: 'store-only-sites',
        message: 'Select how many sites you store PPPs at',
        valid: filled(req.session.data['store-only-sites'])
      }
    ])
    if (!v.ok) return res.render(view('store-only-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/store-only-quantity')
  })

  router.post(P + '/store-only-quantity', (req, res) => {
    const v = validate([
      {
        field: 'store-only-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['store-only-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('store-only-quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // --- Distributing PPPs journey (Figma 1.3) ------------------------------
  // products → number of sites → free-text annual volume → check-answers.

  router.post(P + '/distribute-products', (req, res) => {
    const v = validate([
      {
        field: 'distribute-products',
        message: 'Select what products you distribute',
        valid: filled(req.session.data['distribute-products'])
      }
    ])
    if (!v.ok) return res.render(view('distribute-products'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/distribute-sites')
  })

  router.post(P + '/distribute-sites', (req, res) => {
    const v = validate([
      {
        field: 'distribute-sites',
        message: 'Select how many sites you distribute PPPs at',
        valid: filled(req.session.data['distribute-sites'])
      }
    ])
    if (!v.ok) return res.render(view('distribute-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/distribute-quantity')
  })

  router.post(P + '/distribute-quantity', (req, res) => {
    const v = validate([
      {
        field: 'distribute-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['distribute-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('distribute-quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
  })

  // --- Processing PPPs journey (Figma 1.3) --------------------------------
  // products → number of sites → free-text annual volume → check-answers.

  router.post(P + '/process-products', (req, res) => {
    const v = validate([
      {
        field: 'process-products',
        message: 'Select what products you process',
        valid: filled(req.session.data['process-products'])
      }
    ])
    if (!v.ok) return res.render(view('process-products'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/process-sites')
  })

  router.post(P + '/process-sites', (req, res) => {
    const v = validate([
      {
        field: 'process-sites',
        message: 'Select how many sites you process PPPs at',
        valid: filled(req.session.data['process-sites'])
      }
    ])
    if (!v.ok) return res.render(view('process-sites'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(P + '/process-quantity')
  })

  router.post(P + '/process-quantity', (req, res) => {
    const v = validate([
      {
        field: 'process-quantity',
        message: 'Enter the estimated annual quantity',
        valid: filled(req.session.data['process-quantity'])
      }
    ])
    if (!v.ok) return res.render(view('process-quantity'), v)
    const back = consumeReturnTo(req)
    if (back) return res.redirect(P + '/' + back)
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
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
    // Own sites always asks where, as check answers shows both in one row.
    if (answer === 'Yes, at sites we own') {
      return res.redirect(P + '/import-storing-where')
    }
    if (answer === 'Yes, a third party stores them on our behalf') {
      return goNext(req, res, [
        'import-store-3rd-party-contact',
        'import-quantity'
      ])
    }
    goNext(req, res, ['import-quantity'])
  })

  // Third-party storage contact (import) → quantity.
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
    res.redirect(P + '/import-quantity')
  })

  // Where do you store? Main address → quantity; different location → storage
  // location chooser.
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
    if (answer === 'Main business address') {
      return goNext(req, res, ['import-quantity'])
    }
    goNext(req, res, ['import-store-own-address-lookup', 'import-quantity'])
  })

  // Storage location chooser (import), as for the Using journey.
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
    res.redirect(P + '/import-store-own-address-result')
  })

  router.post(P + '/import-store-own-address-result', (req, res) => {
    clearManualAddress(req.session.data, 'import-store')
    res.redirect(P + '/' + (consumeReturnTo(req) || 'import-quantity'))
  })

  // Storage location entered manually → quantity.
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
    res.redirect(P + '/import-quantity')
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
    res.redirect(
      P +
        '/' +
        nextUnanswered(toArray(req.session.data.activities), req.session.data)
    )
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
  const STORING_WHERE_LABEL = {
    'Main business address': 'At main business address',
    'A different location to the main business address':
      'At a different location'
  }
  router.get(P + '/check-answers', (req, res) => {
    const d = req.session.data || {}
    const sectors = toArray(d.sector)
    const acts = toArray(d.activities)
    const sellPro = isSellPro(d)
    const sellSellingOnly = isSellingOnly(acts)
    // Back link → the final page of the LAST selected activity's flow.
    const flowActs = acts.filter((a) => activityEntry[a])
    const lastPage = sellSellingOnly
      ? sellingOnlyAddressSteps(d).at(-1)
      : lastPageOfActivity(flowActs[flowActs.length - 1], d)
    res.render(view('check-answers'), {
      cyaBack: P + '/' + (lastPage || 'quantity'),
      // Resolved "where do you store" label lines (kept out of the template so
      // the formatter can't split the multi-word map keys used for lookup)
      usingStoringWhereText:
        STORING_WHERE_LABEL[d['storing-where']] || d['storing-where'] || '',
      importStoringWhereText:
        STORING_WHERE_LABEL[d['import-storing-where']] ||
        d['import-storing-where'] ||
        '',
      // Using PPPs section: a subsector row only for its selected main sector
      usingAgri: sectors.includes('Agriculture'),
      usingAmenity: sectors.includes('Amenity'),
      usingHorti: sectors.includes('Horticulture'),
      usingAnotherOrg: d['who-applies'] === ANOTHER_ORG,
      usingAssurance:
        sectors.includes('Agriculture') || sectors.includes('Horticulture'),
      usingStoreOwnSites: d['store-applied'] === 'Yes, at sites we own',
      usingStoreThirdParty:
        d['store-applied'] === 'Yes, a third party stores them for us',
      usingStoreOwnDifferent:
        d['store-applied'] === 'Yes, at sites we own' &&
        d['storing-where'] ===
          'A different location to the main business address',
      // Importing PPPs section
      importStoreOwnSites: d['import-storing'] === 'Yes, at sites we own',
      importStoreThirdParty:
        d['import-storing'] === 'Yes, a third party stores them on our behalf',
      importStoreOwnDifferent:
        d['import-storing'] === 'Yes, at sites we own' &&
        d['import-storing-where'] ===
          'A different location to the main business address',
      // Selling PPPs section. Amateur selling-only gave a head office address and
      // contact in the Sell flow, so business details shows those instead.
      sellPro: sellPro,
      sellHeadOffice: sellSellingOnly && !sellPro
    })
  })

  // --- Finish ---
  router.post(P + '/check-answers', (req, res) =>
    res.redirect(P + '/confirmation')
  )

  // Confirmation — one "Registration complete" panel with a single reference
  // number covering the whole registration, however many activities were selected.
  router.get(P + '/confirmation', (req, res) => {
    res.render(view('confirmation'), { registrationRef: REGISTRATION_REF })
  })
}
