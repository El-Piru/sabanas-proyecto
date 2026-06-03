const express = require('express')
const router  = express.Router()
const { PrismaClient } = require('@prisma/client')
const auth    = require('../middleware/auth.middleware')
const { MercadoPagoConfig, Preference } = require('mercadopago')
const prisma  = new PrismaClient()

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || ''
})

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

  // Crear la reserva en estado "pendiente"
  const reserva = await prisma.reserva.create({
    data: { usuarioId: req.usuario.id, cabanaId, llegada: d1, salida: d2, total, estado: 'pendiente' }
  })

  // Generar la preferencia de Mercado Pago
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const esHttps = frontendUrl.startsWith('https')

    const preference = new Preference(mpClient)
    const result = await preference.create({
      body: {
        items: [
          {
            id: String(reserva.id),
            title: `${cabana.nombre} — Reserva`,
            quantity: 1,
            unit_price: total,
            currency_id: 'CLP'
          }
        ],
        back_urls: {
          success: `${frontendUrl}/pago/resultado?status=success`,
          failure: `${frontendUrl}/pago/resultado?status=failure`,
          pending: `${frontendUrl}/pago/resultado?status=pending`
        },
        auto_return: esHttps ? 'approved' : undefined, // Solo activa auto_return si es HTTPS seguro
        notification_url: `${process.env.BACKEND_URL || 'https://sabanas-proyecto-production.up.railway.app'}/api/pagos/webhook`,
        external_reference: String(reserva.id)
      }
    })

    res.status(201).json({
      ok: true,
      data: reserva,
      initPoint: result.init_point,
      mensaje: 'Reserva creada. Procede al pago.'
    })
  } catch (error) {
    console.error('Error al crear preferencia de Mercado Pago:', error)
    res.status(201).json({
      ok: true,
      data: reserva,
      initPoint: null,
      mensaje: 'Reserva creada pero hubo un problema al generar el pago de Mercado Pago.'
    })
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
