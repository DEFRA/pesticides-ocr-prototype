//
// For guidance on how to add JavaScript see:
// https://prototype-kit.service.gov.uk/docs/adding-css-javascript-and-images
//

window.GOVUKPrototypeKit.documentReady(() => {
  // Capture the ORDER the user ticks the business-activities boxes, so the v1.3
  // journey can traverse the selected activities in click order (checkboxes
  // otherwise submit in DOM order). Written to a hidden `activities-order` field;
  // the /activities route reorders from it. Degrades to DOM order with JS off.
  const form = document.querySelector('form[action$="/activities"]')
  if (!form) return
  const boxes = form.querySelectorAll(
    'input[type="checkbox"][name="activities"]'
  )
  if (!boxes.length) return

  let orderField = form.querySelector('input[name="activities-order"]')
  if (!orderField) {
    orderField = document.createElement('input')
    orderField.type = 'hidden'
    orderField.name = 'activities-order'
    form.appendChild(orderField)
  }

  // Seed from any already-ticked boxes (returning user), in DOM order.
  const order = []
  boxes.forEach((b) => {
    if (b.checked) order.push(b.value)
  })
  const sync = () => {
    orderField.value = order.join(',')
  }
  sync()

  boxes.forEach((b) => {
    b.addEventListener('change', () => {
      const i = order.indexOf(b.value)
      if (b.checked && i === -1) order.push(b.value)
      else if (!b.checked && i !== -1) order.splice(i, 1)
      sync()
    })
  })
})
