import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { cloudStatus, pairCloudEdge, syncCloudNow, unpairCloudEdge } from '../cloud/syncWorker.js'
import { getCloudBranchConfig } from '../cloud/store.js'

const router = Router()
const admin = [authenticate, requireRole('admin')]

router.get('/cloud/status', ...admin, (req, res) => {
  res.json({ success:true, cloud:cloudStatus() })
})

router.get('/cloud/config', ...admin, (req, res) => {
  res.json({ success:true, cloudConfig:getCloudBranchConfig() })
})

router.post('/cloud/pair', ...admin, async (req, res, next) => {
  try {
    const cloud = await pairCloudEdge(req.body?.pairingCode)
    res.json({ success:true, cloud })
  } catch (error) { next(error) }
})

router.post('/cloud/sync-now', ...admin, async (req, res, next) => {
  try {
    const result = await syncCloudNow()
    res.json({ success:true, ...result })
  } catch (error) { next(error) }
})

router.post('/cloud/unpair', ...admin, async (req, res, next) => {
  try {
    const cloud = await unpairCloudEdge({ remote:req.body?.remote !== false })
    res.json({ success:true, cloud })
  } catch (error) { next(error) }
})

export default router
