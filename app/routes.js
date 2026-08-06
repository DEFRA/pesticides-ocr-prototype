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
const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// Register each version's journey routes.
require('./routes/v1-1')(router)
require('./routes/v1-2')(router)
