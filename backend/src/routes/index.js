import { Router } from 'express'
import authRoutes from './auth.js'
import dashboardRoutes from './dashboard.js'
import eventsRoutes from './events.js'
import checkinRoutes from './checkin.js'
import profileRoutes from './profile.js'
import weatherRoutes from './weather.js'
import feedbackRoutes from './feedback.js'
import applyRoutes from './apply.js'
import staffRoutes from './staff.js'
import meetingsRoutes from './meetings.js'
import controllersRoutes from './controllers.js'
import flightplanRoutes from './flightplans.js'
import ticketRoutes from './tickets.js'
import verifyRoutes from './verify.js'
import chartRoutes from './charts.js'
import notificationRoutes from './notifications.js'
import forumRoutes from './forum.js'
import contentRoutes from './content.js'
import pointsRoutes from './points.js'
import trainingRoutes from './training.js'
import adminRoutes from './admin.js'
import securityRoutes from './security.js'
import tracksRoutes from './tracks.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/events', eventsRoutes)
router.use('/checkin', checkinRoutes)
router.use('/profile', profileRoutes)
router.use('/weather', weatherRoutes)
router.use('/feedback', feedbackRoutes)
router.use('/apply', applyRoutes)
router.use('/staff', staffRoutes)
router.use('/meetings', meetingsRoutes)
router.use('/controllers', controllersRoutes)
router.use('/flightplans', flightplanRoutes)
router.use('/tickets', ticketRoutes)
router.use('/verify', verifyRoutes)
router.use('/charts', chartRoutes)
router.use('/notifications', notificationRoutes)
router.use('/forum', forumRoutes)
router.use('/content', contentRoutes)
router.use('/points', pointsRoutes)
router.use('/training', trainingRoutes)
router.use('/admin', adminRoutes)
router.use('/security', securityRoutes)
router.use('/tracks', tracksRoutes)

export default router
