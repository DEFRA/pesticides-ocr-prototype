//
// Shared helpers for the versioned OCR register journeys.
// Each version's routes (app/routes/v1-1.js, v1-2.js, …) imports these so the
// validation/branching primitives stay identical across versions — only the
// journey wiring that actually changed between Figma versions differs.
//

// Treat a checkbox/radio value as an array whether one or many were selected
const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
      ? value
      : [value]

const filled = (value) => typeof value === 'string' && value.trim() !== ''

// Build an errors object + error summary list from a set of rules.
// Each rule: { field, href?, message, valid }
const validate = (rules) => {
  const errors = {}
  const errorList = []
  for (const rule of rules) {
    if (!rule.valid) {
      errors[rule.field] = rule.message
      errorList.push({
        text: rule.message,
        href: '#' + (rule.href || rule.field)
      })
    }
  }
  return { errors, errorList, ok: errorList.length === 0 }
}

const SELLER_ACTIVITIES = [
  'manufacture',
  'place-on-market',
  'sell-professional'
]

const isAmateurOnly = (activities) =>
  activities.length > 0 && activities.every((a) => a === 'sell-amateur')

const clearAdditionalAddressFields = (d) => {
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

module.exports = {
  toArray,
  filled,
  validate,
  SELLER_ACTIVITIES,
  isAmateurOnly,
  clearAdditionalAddressFields
}
