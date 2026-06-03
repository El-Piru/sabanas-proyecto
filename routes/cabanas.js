const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/auth.middleware')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

router.get('/', async (req, res) => {
  const cabanas = await prisma.cabana.findMany()
  res.json({ ok: true, data: cabanas })
})

router.get('/tipos', async (req, res) => {
  try {
    const cabanas = await prisma.cabana.findMany({
      where: { disponible: true },
      orderBy: { capacidad: 'asc' }
    })

    const tiposMap = {}
    for (const c of cabanas) {
      if (!tiposMap[c.capacidad]) {
        tiposMap[c.capacidad] = {
          capacidad: c.capacidad,
          precio: c.precio,
          nombre: `Cabaña para ${c.capacidad} personas`,
          descripcion: c.descripcion,
          imagen: c.imagen
        }
      }
    }

    const tipos = Object.values(tiposMap)
    res.json({ ok: true, data: tipos })
  } catch (error) {
    console.error('Error al obtener tipos de cabañas:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al obtener tipos de cabañas' })
  }
})

router.get('/:id', auth, async (req, res) => {
  const cabana = await prisma.cabana.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!cabana) return res.status(404).json({ ok: false, mensaje: 'No encontrada' })
  res.json({ ok: true, data: cabana })
})

module.exports = router
