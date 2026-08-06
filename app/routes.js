//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//
// This prototype hosts multiple historic versions of the OCR register journey
// side by side, so researchers and designers can compare them. Each version is
// self-contained:
//   - views  → app/views/<version>/…       (served at /<version>/…)
//   - routes → app/routes/<version>.js      (POST handlers + branching)
// The landing page (app/views/index.html) lists every version.
//
// To add a new version, see the "Adding a version" section of the README.
//
const fs = require('fs')
const path = require('path')
const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// Register each version's journey routes.
require('./routes/v1-1')(router)
require('./routes/v1-2')(router)

// Safety net for stray/old URLs.
//
// The Prototype Kit's built-in 404 page is broken (it extends a management
// layout that isn't resolvable), so any unknown URL crashes with a confusing
// template error. Because these app routes run BEFORE the Kit's own view
// rendering and password/management routes, this handler must only act on a
// GET that (a) isn't a Kit/asset path, and (b) has no backing view file — then
// it sends the visitor to the versions hub instead of the broken 404.
const VIEWS_DIR = path.join(__dirname, 'views')
const RESERVED_PREFIXES = [
  '/public',
  '/manage-prototype',
  '/plugin-assets',
  '/docs',
  '/browser-sync'
]

router.get(/^\/(.*)$/, (req, res, next) => {
  const pathname = req.path
  // Leave the hub, Kit/asset paths, and anything with a file extension
  // (e.g. .html strip-redirects, /favicon.ico, static files) to the Kit.
  if (
    pathname === '/' ||
    pathname.includes('.') ||
    RESERVED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return next()
  }
  // Let a real view (foo.html or foo/index.html) render normally.
  const rel = pathname.replace(/^\/+|\/+$/g, '')
  const backedByView = [
    path.join(VIEWS_DIR, rel + '.html'),
    path.join(VIEWS_DIR, rel, 'index.html')
  ].some((file) => fs.existsSync(file))
  if (backedByView) {
    return next()
  }
  res.redirect('/')
})
