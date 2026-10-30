//
// The "Download a copy of your registration" PDF for version 1.4, laid out as
// the Figma "registration download" page: title and reference, the Defra logo,
// the registration date, the check answers rows, and the licence footer.
//
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

// The royal arms, drawn from GOV.UK Frontend's crest (125 × 102), the same
// artwork as the page footer.
const CREST_FILE = path.join(
  path.dirname(require.resolve('govuk-frontend/package.json')),
  'dist/govuk/assets/images/govuk-crest.svg'
)
const CREST_WIDTH = 125
const CREST_PATHS = [
  ...fs.readFileSync(CREST_FILE, 'utf8').matchAll(/<path d="([^"]+)"/g)
].map((match) => match[1])

const DEFRA_GREEN = '#00a33b'

const MARGIN = 56
const KEY_WIDTH = 150
const GAP = 16
const TEXT = '#0b0c0c'
const RULE = '#b1b4b6'
const FOOTER_SPACE = 110

const ukDate = (date) =>
  [date.getDate(), date.getMonth() + 1]
    .map((part) => String(part).padStart(2, '0'))
    .concat(date.getFullYear())
    .join('/')

const drawCrest = (doc, x, y, width, colour) => {
  const scale = width / CREST_WIDTH
  doc.save().translate(x, y).scale(scale)
  for (const d of CREST_PATHS) doc.path(d).fill(colour)
  doc.restore()
}

// The Defra logo: the arms, a green rule, then the department's name.
const drawDefraLogo = (doc, x, y) => {
  drawCrest(doc, x, y + 2, 46, '#0b0c0c')
  doc
    .moveTo(x + 54, y)
    .lineTo(x + 54, y + 50)
    .lineWidth(1.5)
    .strokeColor(DEFRA_GREEN)
    .stroke()
  doc.fillColor('#0b0c0c').font('Helvetica').fontSize(12)
  doc.text('Department\nfor Environment\nFood & Rural Affairs', x + 61, y + 3, {
    lineGap: 0
  })
}

const registrationPdf = (stream, registration) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: registration.serviceName + ' – ' + registration.reference }
  })
  doc.pipe(stream)

  const right = doc.page.width - MARGIN
  const valueX = MARGIN + KEY_WIDTH + GAP
  const valueWidth = right - valueX

  // Title and reference, with the Defra logo on the right.
  drawDefraLogo(doc, right - 175, MARGIN)
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(20)
  doc.text(registration.serviceName, MARGIN, MARGIN, { width: 300 })
  doc.moveDown(0.4).font('Helvetica').fontSize(14)
  doc.text('Your reference number')
  doc.text(registration.reference)

  doc
    .moveDown(1.5)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Registration date')
  doc.font('Helvetica').text(ukDate(registration.registeredOn))

  const ensureSpace = (height) => {
    if (doc.y + height > doc.page.height - FOOTER_SPACE) doc.addPage()
  }

  const heading = (text, size) => {
    ensureSpace(60)
    doc.moveDown(1.5).font('Helvetica-Bold').fontSize(size).text(text, MARGIN)
    doc.moveDown(0.5)
  }

  const rows = (list) => {
    for (const row of list) {
      const value = row.lines.join('\n') || ' '
      doc.font('Helvetica').fontSize(10)
      const valueHeight = doc.heightOfString(value, { width: valueWidth })
      doc.font('Helvetica-Bold')
      const keyHeight = doc.heightOfString(row.key, { width: KEY_WIDTH })
      const height = Math.max(valueHeight, keyHeight)
      ensureSpace(height + 20)

      const top = doc.y + 6
      doc.text(row.key, MARGIN, top, { width: KEY_WIDTH })
      doc.font('Helvetica').text(value, valueX, top, { width: valueWidth })
      const bottom = top + height + 8
      doc
        .moveTo(MARGIN, bottom)
        .lineTo(right, bottom)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke()
      doc.x = MARGIN
      doc.y = bottom
    }
  }

  heading('Business details', 14)
  rows(registration.businessRows)

  heading('PPP activity details', 14)
  if (registration.usingRows) {
    if (registration.bothActivities) heading('Users of professional PPPs', 11)
    rows(registration.usingRows)
  }
  if (registration.sellingRows) {
    if (registration.bothActivities) {
      heading('Seller of amateur plant protection products', 11)
    }
    rows(registration.sellingRows)
  }

  // The licence footer, without the page background. It sits in the bottom
  // margin, which pdfkit would otherwise treat as the start of a new page.
  doc.page.margins.bottom = 0
  const footerTop = doc.page.height - MARGIN - 70
  drawCrest(doc, right - 77, footerTop, 64, '#505a5f')
  doc.font('Helvetica').fontSize(8).fillColor(TEXT)
  doc.text('© Crown copyright', right - 90, footerTop + 60, {
    width: 90,
    align: 'center'
  })
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('OGL', MARGIN, footerTop + 59)
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(
      'All content is available under the Open Government Licence v3.0, except where otherwise stated',
      MARGIN + 28,
      footerTop + 60,
      { width: right - MARGIN - 138 }
    )

  doc.end()
}

module.exports = { registrationPdf }
