const router = require('express').Router();
const {
  getPublicTeams,
  createPublicVolunteer,
  resendVolunteerOtp
} = require('../controllers/volunteerController');

router.get('/public-teams', getPublicTeams);
router.post('/public-register', createPublicVolunteer);
router.post('/resend-otp', resendVolunteerOtp);

module.exports = router;
