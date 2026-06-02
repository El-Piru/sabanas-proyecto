const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/auth.middleware')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

// POST /api/reservas — crear reserva (requiere token)
router.post('/', auth, async (req, res) => {
  const { cabanaId, llegada, salida } = req.body

  if (!cabanaId || !llegada || !salida)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })

  const fechaLlegada = new Date(llegada)
  const fechaSalida  = new Date(salida)

  if (fechaSalida <= fechaLlegada)
    return res.status(400).json({ ok: false, mensaje: 'La salida debe ser posterior a la llegada' })

  // Verificar que la cabana existe
  const cabana = await prisma.cabana.findUnique({ where: { id: cabanaId } })
  if (!cabana)
    return res.status(404).json({ ok: false, mensaje: 'Cabana no encontrada' })

  // Verificar disponibilidad — buscar reservas que se crucen
  const cruce = await prisma.reserva.findFirst({
    where: {
      cabanaId,
      estado: { not: 'cancelada' },
      AND: [
        { llegada: { lt: fechaSalida } },
        { salida:  { gt: fechaLlegada } }
      ]
    }
  })

  if (cruce)
    return res.status(409).json({ ok: false, mensaje: 'La cabana no esta disponible en esas fechas' })

  // Calcular total
  const noches = Math.ceil((fechaSalida - fechaLlegada) / (1000 * 60 * 60 * 24))
  const total  = noches * cabana.precio

  const reserva = await prisma.reserva.create({
    data: {
      usuarioId: req.usuario.id,
      cabanaId,
      llegada:  fechaLlegada,
      salida:   fechaSalida,
      total,
      estado:   'confirmada'
    }
  })

  res.status(201).json({ ok: true, data: reserva, noches, total })
})

// GET /api/reservas/mis-reservas — ver mis reservas
router.get('/mis-reservas', auth, async (req, res) => {
  const reservas = await prisma.reserva.findMany({
    where: { usuarioId: req.usuario.id },
    include: { cabana: true }
  })
  res.json({ ok: true, data: reservas })
})

module.exports = router
