const router = require('express').Router();
const {
  getPublicTeams,
  createPublicVolunteer
} = require('../controllers/volunteerController');

router.get('/public-teams', getPublicTeams);
router.post('/public-register', createPublicVolunteer);

module.exports = router;
