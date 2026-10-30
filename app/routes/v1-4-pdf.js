//
// The version 1.4 "Download a copy of your registration" PDF, laid out as the
// Figma "registration download" page.
//
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const GOVUK_ASSETS = path.join(
  path.dirname(require.resolve('govuk-frontend/package.json')),
  'dist/govuk/assets'
)
// GDS Transport, as on the service's pages; it covers Welsh letters such as ŵ.
// pdfkit can't read the .woff2 versions.
const FONTS = {
  regular: path.join(GOVUK_ASSETS, 'fonts/light-f591b13f7d-v2.woff'),
  bold: path.join(GOVUK_ASSETS, 'fonts/bold-affa96571d-v2.woff')
}
// The royal arms (125 × 102), drawn from the crest in the page footer.
const CREST_WIDTH = 125
const CREST_PATHS = [
  ...fs
    .readFileSync(path.join(GOVUK_ASSETS, 'images/govuk-crest.svg'), 'utf8')
    .matchAll(/<path d="([^"]+)"/g)
].map((match) => match[1])

const TEXT = '#0b0c0c'
const FOOTER_GREY = '#505a5f'
const RULE = '#b1b4b6'
const DEFRA_GREEN = '#00a33b'

const MARGIN = 56
const KEY_WIDTH = 150
const GAP = 16
const ROW_PADDING = 6
const FOOTER_HEIGHT = 80
const LOGO_WIDTH = 175
const CREST_IN_FOOTER = 64

const ukDate = (date) =>
  [date.getDate(), date.getMonth() + 1]
    .map((part) => String(part).padStart(2, '0'))
    .concat(date.getFullYear())
    .join('/')

const drawCrest = (doc, x, y, width, colour) => {
  doc
    .save()
    .translate(x, y)
    .scale(width / CREST_WIDTH)
  for (const d of CREST_PATHS) doc.path(d).fill(colour)
  doc.restore()
}

// The Defra logo: the arms, a green rule, then the department's name.
const drawDefraLogo = (doc, x, y) => {
  drawCrest(doc, x, y + 2, 46, TEXT)
  doc
    .moveTo(x + 54, y)
    .lineTo(x + 54, y + 50)
    .lineWidth(1.5)
    .strokeColor(DEFRA_GREEN)
    .stroke()
  doc.fillColor(TEXT).font('regular').fontSize(12)
  drawLines(
    doc,
    ['Department', 'for Environment', 'Food & Rural Affairs'],
    x + 61,
    y + 3
  )
}

const drawHeader = (doc, registration, right) => {
  drawDefraLogo(doc, right - LOGO_WIDTH, MARGIN)
  doc.fillColor(TEXT).font('bold').fontSize(20)
  doc.text(registration.serviceName, MARGIN, MARGIN, { width: 300 })
  doc.moveDown(0.4).font('regular').fontSize(14)
  doc.text('Your reference number')
  doc.text(registration.reference)
  doc.moveDown(1.5).font('bold').fontSize(12).text('Registration date')
  doc.font('regular').text(ukDate(registration.registeredOn))
}

// Text one line at a time: GDS Transport has no usable newline glyph.
const linesOf = (lines) => lines.flatMap((line) => String(line).split(/\r?\n/))
const linesHeight = (doc, lines, width) =>
  linesOf(lines).reduce(
    (height, line) => height + doc.heightOfString(line || ' ', { width }),
    0
  )
const drawLines = (doc, lines, x, y, width) => {
  doc.y = y
  for (const line of linesOf(lines)) doc.text(line || ' ', x, doc.y, { width })
}

const roomLeft = (doc) => doc.page.height - MARGIN - FOOTER_HEIGHT - doc.y

const drawHeading = (doc, text, size) => {
  if (roomLeft(doc) < 60) doc.addPage()
  doc.moveDown(1.5).font('bold').fontSize(size).fillColor(TEXT)
  doc.text(text, MARGIN)
  doc.moveDown(0.5)
}

// Rows of { key, lines }, each with a rule below, starting a new page when one
// wouldn't fit above the footer.
const drawRows = (doc, rows, right) => {
  const valueX = MARGIN + KEY_WIDTH + GAP
  const valueWidth = right - valueX
  for (const row of rows) {
    const lines = row.lines.length ? row.lines : [' ']
    doc.fontSize(10)
    const height = Math.max(
      linesHeight(doc.font('regular'), lines, valueWidth),
      linesHeight(doc.font('bold'), [row.key], KEY_WIDTH)
    )
    if (roomLeft(doc) < height + 3 * ROW_PADDING) doc.addPage()
    const top = doc.y + ROW_PADDING
    drawLines(doc.font('bold'), [row.key], MARGIN, top, KEY_WIDTH)
    drawLines(doc.font('regular'), lines, valueX, top, valueWidth)
    const bottom = top + height + ROW_PADDING
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

// The licence footer, without the page background. It sits in the bottom
// margin, which pdfkit would otherwise treat as the start of a new page.
const drawFooter = (doc, right) => {
  doc.page.margins.bottom = 0
  const top = doc.page.height - MARGIN - FOOTER_HEIGHT + 10
  const textTop = top + 60
  drawCrest(doc, right - 77, top, CREST_IN_FOOTER, FOOTER_GREY)
  doc.fillColor(TEXT).font('bold').fontSize(10)
  doc.text('OGL', MARGIN, textTop - 1)
  doc.font('regular').fontSize(8)
  doc.text(
    'All content is available under the Open Government Licence v3.0, except where otherwise stated',
    MARGIN + 28,
    textTop,
    { width: right - MARGIN - 138 }
  )
  doc.text('© Crown copyright', right - 90, textTop, {
    width: 90,
    align: 'center'
  })
}

const drawRegistration = (doc, registration) => {
  const right = doc.page.width - MARGIN

  drawHeader(doc, registration, right)
  drawHeading(doc, 'Business details', 14)
  drawRows(doc, registration.businessRows, right)

  drawHeading(doc, 'PPP activity details', 14)
  if (registration.usingRows) {
    if (registration.bothActivities) {
      drawHeading(doc, 'Users of professional PPPs', 11)
    }
    drawRows(doc, registration.usingRows, right)
  }
  if (registration.sellingRows) {
    if (registration.bothActivities) {
      drawHeading(doc, 'Seller of amateur plant protection products', 11)
    }
    drawRows(doc, registration.sellingRows, right)
  }

  drawFooter(doc, right)
}

// The PDF as a Buffer, so a failure can still be answered with an error page.
const registrationPdf = (registration) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: registration.serviceName + ' – ' + registration.reference }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      doc.registerFont('regular', FONTS.regular)
      doc.registerFont('bold', FONTS.bold)
      drawRegistration(doc, registration)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })

module.exports = { registrationPdf }
