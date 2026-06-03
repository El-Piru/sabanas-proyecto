const express = require('express')
const router  = express.Router()
const { PrismaClient } = require('@prisma/client')
const auth    = require('../middleware/auth.middleware')
const { enviarConfirmacionReserva, enviarAvisoAdmin } = require('../utils/email')
const prisma  = new PrismaClient()

router.post('/', auth, async (req, res) => {
  const { cabanaId, llegada, salida } = req.body
  if (!cabanaId || !llegada || !salida)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })

  const cabana = await prisma.cabana.findUnique({ where: { id: cabanaId } })
  if (!cabana || !cabana.disponible)
    return res.status(400).json({ ok: false, mensaje: 'Cabaña no disponible' })

  const d1 = new Date(llegada)
  const d2 = new Date(salida)
  if (d2 <= d1)
    return res.status(400).json({ ok: false, mensaje: 'Fechas inválidas' })

  // Verificar solapamiento bloqueando el mismo día de transición (Opción 2)
  const conflicto = await prisma.reserva.findFirst({
    where: {
      cabanaId,
      estado: { not: 'cancelada' },
      AND: [
        { llegada: { lte: d2 } },
        { salida: { gte: d1 } }
      ]
    }
  })

  if (conflicto)
    return res.status(400).json({ ok: false, mensaje: 'La cabaña no está disponible en esas fechas' })

  const noches = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
  const total  = noches * cabana.precio

  const reserva = await prisma.reserva.create({
    data: { usuarioId: req.usuario.id, cabanaId, llegada: d1, salida: d2, total, estado: 'confirmada' }
  })

  // Responde inmediatamente sin esperar procesos secundarios
  res.status(201).json({ ok: true, data: reserva, mensaje: 'Reserva confirmada' })

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } })

  // 1. Envía el email en segundo plano
  enviarConfirmacionReserva({
    emailCliente: usuario.email,
    nombreCliente: usuario.nombre,
    cabana: cabana.nombre,
    llegada: d1,
    salida: d2,
    total
  }).catch(console.error)

  enviarAvisoAdmin({
    nombreCliente: usuario.nombre,
    emailCliente: usuario.email,
    cabana: cabana.nombre,
    llegada: d1,
    salida: d2,
    total
  }).catch(console.error)

  // 2. Envía la reserva a Google Sheets automáticamente en segundo plano
  if (process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reserva.id,
        cabana: cabana.nombre,
        cliente: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono || 'No registrado',
        entrada: d1.toLocaleDateString('es-CL'),
        salida: d2.toLocaleDateString('es-CL'),
        total: total,
        estado: reserva.estado,
        fechaCompra: new Date().toLocaleDateString('es-CL')
      })
    }).catch(err => console.error('Error al enviar datos a Google Sheets:', err))
  }
})

// GET /api/reservas/cabana/:cabanaId/ocupadas
router.get('/cabana/:cabanaId/ocupadas', async (req, res) => {
  try {
    const { cabanaId } = req.params
    const reservas = await prisma.reserva.findMany({
      where: {
        cabanaId: parseInt(cabanaId),
        estado: { not: 'cancelada' }
      },
      select: {
        llegada: true,
        salida: true
      }
    })
    res.json({ ok: true, data: reservas })
  } catch (error) {
    console.error('Error al obtener fechas ocupadas:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al obtener fechas ocupadas' })
  }
})

router.get('/mis-reservas', auth, async (req, res) => {
  const reservas = await prisma.reserva.findMany({
    where: { usuarioId: req.usuario.id },
    include: { cabana: true },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ ok: true, data: reservas })
})

module.exports = router
