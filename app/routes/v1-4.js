//
// OCR register journey — version 1.4 (Figma "Future OCR register flow v1.4").
//
const { filled, validate, consumeReturnTo } = require('./journey-helpers')
const { findAddresses, filterByBuilding, serviceError } = require('./os-places')
const {
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
} = require('./v1-4-answers')
const { registrationPdf } = require('./v1-4-pdf')

const V = 'v1-4'
const P = '/' + V
const view = (name) => V + '/' + name

const SERVICE_NAME = 'Register work involving pesticides'
const REGISTRATION_REF = 'PPP-409-28G'

// For a participant who opens the email link in a browser with no answers.
const SAMPLE_CONTACT = {
  'contact-name': 'John Smith',
  'contact-job-title': 'Head of PPPs',
  'contact-telephone': '01234 567890',
  'contact-email': 'john@pesticides.co.uk'
}

const routeAfter = (d, page) => {
  const route = activityRoute(d)
  return route.slice(route.indexOf(page) + 1)
}

// On to the first of `steps`, or check answers. After a check answers Change,
// to the first unanswered step (keeping returnTo), or straight back.
const goNext = (req, res, steps) => {
  const d = req.session.data
  const pending =
    d.returnTo && steps.find((page) => answered[page] && !answered[page](d))
  if (pending) return res.redirect(P + '/' + pending)
  res.redirect(P + '/' + (consumeReturnTo(req) || steps[0] || 'check-answers'))
}

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

const saveMainAddress = (d, address) => {
  setAddress(d, 'address', address)
  delete d['international-address']
}

// A storage address being changed from its card replaces that card; any other
// is added to the list.
const saveStorageAddress = (d, address) => {
  const list = [...storageAddresses(d)]
  const index = Number(d['store-editing'])
  if (Number.isInteger(index) && index < list.length) {
    list[index] = address
  } else {
    list.push(address)
  }
  d['storage-addresses'] = list
}
const STORAGE_FORM_FIELDS = [
  ...addressFieldNames('store'),
  'store-building',
  'store-editing'
]
const clearStorageForm = (d) => {
  for (const field of STORAGE_FORM_FIELDS) delete d[field]
}

// OS Places address lookup: search → select (more than one match) → result →
// `save` the chosen address, then `next`. The select and result pages share the
// templates in includes/, given this config as `lookup`.
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
    lookup.save(d, {
      line1,
      line2: rest.join(', '),
      town: address.town,
      postcode: address.postcode,
      country: address.country
    })
    lookup.next(req, res)
  })
}

module.exports = (router) => {
  router.get(P, (req, res) => res.redirect(P + '/start'))

  // The new service name, for version 1.4 only.
  router.use(P, (req, res, next) => {
    res.locals.serviceName = SERVICE_NAME
    next()
  })

  // A Change link's ?returnTo=check-answers is kept until its page is saved,
  // and until then Back goes to check answers too.
  router.use((req, res, next) => {
    const d = req.session.data
    if (req.path.startsWith(P) && d) {
      if (req.query.returnTo) d.returnTo = req.query.returnTo
      if (d.returnTo) res.locals.returnBackLink = P + '/' + d.returnTo
    }
    next()
  })

  // Back links on the activity pages follow the route taken, for POSTs too, so
  // a page shown again with errors keeps it.
  router.use((req, res, next) => {
    const d = req.session.data
    const page = req.path.startsWith(P + '/')
      ? req.path.slice(P.length + 1).replace(/\/$/, '')
      : ''
    const route = d ? activityRoute(d) : []
    if (route.includes(page)) {
      const index = route.indexOf(page)
      res.locals.pathBackLink =
        P + '/' + (index > 0 ? route[index - 1] : 'activities')
    }
    next()
  })

  // Starting again, or arriving at check answers, ends any Change.
  const endChange = (req, res, next) => {
    delete req.session.data.returnTo
    delete res.locals.returnBackLink
    next()
  }
  router.get(P + '/start', endChange)

  // --- Register or update ---------------------------------------------------
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

  // --- Contact details and email verification -------------------------------
  router.post(P + '/contact-details', (req, res) => {
    const v = validate(contactRules(req.session.data, 'contact'))
    if (!v.ok) return res.render(view('contact-details'), v)
    res.redirect(P + '/' + (consumeReturnTo(req) || 'check-your-email'))
  })

  // The link in the verification email, which the user researcher sends.
  router.get(P + '/confirm-email', (req, res) => {
    const d = req.session.data
    if (!filled(d['contact-email'])) Object.assign(d, SAMPLE_CONTACT)
    d['email-verified'] = 'yes'
    res.redirect(P + '/business-name')
  })

  // --- Business name and main address ---------------------------------------
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
    save: saveMainAddress,
    next: afterMainAddress
  })

  router.post(P + '/main-address', (req, res) => {
    const d = req.session.data
    const v = validate(manualAddressRules(d, 'address'))
    if (!v.ok) return res.render(view('main-address'), v)
    saveMainAddress(d, addressFrom(d, 'address'))
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

  // --- Business activities --------------------------------------------------
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

  // An activity page: check its `rules`, then on through the rest of the route.
  const activityPage = (page, rules) =>
    router.post(P + '/' + page, (req, res) => {
      const d = req.session.data
      const v = validate(rules(d))
      if (!v.ok) return res.render(view(page), v)
      goNext(req, res, routeAfter(d, page))
    })

  // --- Using PPPs -----------------------------------------------------------
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

  for (const { page, field, message } of SUBSECTORS) {
    activityPage(page, (d) => [{ field, message, valid: answered[page](d) }])
  }

  activityPage('assurance-schemes', () => [])

  // --- Storage --------------------------------------------------------------
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
    // The first other address goes through the search before its summary.
    if (
      storeSites(d).includes(SITE_ANOTHER) &&
      storageAddresses(d).length === 0
    ) {
      return res.redirect(P + '/store-own-address-lookup')
    }
    goNext(req, res, routeAfter(d, 'store-sites'))
  })

  const toStorageSummary = (req, res) => {
    clearStorageForm(req.session.data)
    res.redirect(P + '/storage-addresses')
  }

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

  // A new storage address starts from an empty form, unless a card's Change
  // link (?edit=<index>) opens that address. The kit has already copied the
  // session into res.locals.data, so both are updated.
  const startStorageForm = (req, res, next) => {
    const d = req.session.data
    const index = Number(req.query.edit)
    const address = storageAddresses(d)[index]
    const form = Object.fromEntries(
      STORAGE_FORM_FIELDS.map((f) => [f, undefined])
    )
    if (req.query.edit !== undefined && address) {
      setAddress(form, 'store', address)
      form['store-editing'] = index
    }
    for (const [field, value] of Object.entries(form)) {
      if (value === undefined) {
        delete d[field]
        delete res.locals.data[field]
      } else {
        d[field] = value
        res.locals.data[field] = value
      }
    }
    next()
  }
  router.get(P + '/store-own-address-lookup', startStorageForm)
  router.get(P + '/store-own-address-manual', startStorageForm)

  router.post(P + '/store-own-address-manual', (req, res) => {
    const d = req.session.data
    const v = validate(manualAddressRules(d, 'store'))
    if (!v.ok) return res.render(view('store-own-address-manual'), v)
    saveStorageAddress(d, addressFrom(d, 'store'))
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
    clearStorageForm(d)
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
    if (addAnother) return res.redirect(P + '/store-own-address-lookup')
    goNext(req, res, routeAfter(d, 'storage-addresses'))
  })

  activityPage('store-3rd-party-contact', (d) => {
    const [name, ...rest] = contactRules(d, 'store-3p')
    return [
      name,
      {
        field: 'store-3p-business',
        message: 'Enter the business name',
        valid: filled(d['store-3p-business'])
      },
      ...rest
    ]
  })

  activityPage('quantity', (d) => [
    {
      field: 'quantity',
      message:
        'Select the quantity of PPPs or adjuvants you use in a typical year',
      valid: filled(d.quantity)
    }
  ])

  // --- Selling amateur PPPs -------------------------------------------------
  activityPage('sell-amateur-quantity', (d) => [
    {
      field: 'sell-amateur-quantity',
      message: 'Enter the estimated sales value',
      valid: filled(d['sell-amateur-quantity'])
    }
  ])

  // --- Check answers, confirmation and the PDF ------------------------------
  router.get(P + '/check-answers', endChange, (req, res) => {
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

  router.get(P + '/registration.pdf', async (req, res, next) => {
    try {
      const pdf = await registrationPdf({
        serviceName: SERVICE_NAME,
        reference: REGISTRATION_REF,
        registeredOn: new Date(),
        ...registrationSummary(req.session.data)
      })
      res
        .type('application/pdf')
        .attachment('registration-' + REGISTRATION_REF + '.pdf')
        .send(pdf)
    } catch (err) {
      next(err)
    }
  })
}
