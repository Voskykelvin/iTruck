const express = require('express');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const maps = require('../services/maps');
const { geocodeSchema, routeSchema } = require('../validators/maps');

const router = express.Router();
router.use(protect);

router.get('/config', (req, res) => {
  res.json(maps.browserConfig());
});

router.post('/geocode', geocodeSchema, validate, async (req, res, next) => {
  try {
    res.json({ location: await maps.geocode(req.body.address, { region: req.body.region }) });
  } catch (err) {
    next(err);
  }
});

router.post('/route', routeSchema, validate, async (req, res, next) => {
  try {
    res.json({
      route: await maps.computeRoute({
        pickup: req.body.pickup,
        destination: req.body.destination,
        origin: req.body.origin,
        destinationCoordinates: req.body.destinationCoordinates,
        intermediates: req.body.intermediates,
        optimizeWaypointOrder: req.body.optimizeWaypointOrder
      })
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
