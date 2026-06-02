const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/auth.middleware')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

router.get('/', async (req, res) => {
  const cabanas = await prisma.cabana.findMany()
  res.json({ ok: true, data: cabanas })
})

router.get('/:id', auth, async (req, res) => {
  const cabana = await prisma.cabana.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!cabana) return res.status(404).json({ ok: false, mensaje: 'No encontrada' })
  res.json({ ok: true, data: cabana })
})

module.exports = router
