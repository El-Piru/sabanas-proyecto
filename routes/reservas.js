const express = require('express')
const router  = express.Router()
const { PrismaClient } = require('@prisma/client')
const auth    = require('../middleware/auth.middleware')
const { MercadoPagoConfig, Preference } = require('mercadopago')
const { enviarAvisoCancelacion } = require('../utils/email')
const prisma  = new PrismaClient()

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || ''
})

router.post('/', auth, async (req, res) => {
  const { capacidad, llegada, salida } = req.body
  if (!capacidad || !llegada || !salida)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })

  const d1 = new Date(llegada)
  const d2 = new Date(salida)
  if (d2 <= d1)
    return res.status(400).json({ ok: false, mensaje: 'Fechas inválidas' })

  try {
    const cabanasFisicas = await prisma.cabana.findMany({
      where: { capacidad: parseInt(capacidad), disponible: true }
    })

    if (cabanasFisicas.length === 0)
      return res.status(400).json({ ok: false, mensaje: `No hay cabañas configuradas para ${capacidad} personas` })

    let cabanaSeleccionada = null

    for (const cabana of cabanasFisicas) {
      const conflicto = await prisma.reserva.findFirst({
        where: {
          cabanaId: cabana.id,
          estado: { not: 'cancelada' },
          AND: [
            { llegada: { lte: d2 } },
            { salida: { gte: d1 } }
          ]
        }
      })

      if (!conflicto) {
        cabanaSeleccionada = cabana
        break
      }
    }

    if (!cabanaSeleccionada)
      return res.status(400).json({ ok: false, mensaje: 'No hay cabañas disponibles para esas fechas' })

    const noches = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
    const total  = noches * cabanaSeleccionada.precio

    const reserva = await prisma.reserva.create({
      data: { usuarioId: req.usuario.id, cabanaId: cabanaSeleccionada.id, llegada: d1, salida: d2, total, estado: 'pendiente' }
    })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const esHttps = frontendUrl.startsWith('https')

    const preference = new Preference(mpClient)
    const result = await preference.create({
      body: {
        items: [
          {
            id: String(reserva.id),
            title: `Cabaña para ${capacidad} personas — Reserva`,
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
        auto_return: esHttps ? 'approved' : undefined,
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
    console.error('Error al crear reserva por capacidad:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al procesar la reserva' })
  }
})

// POST /api/reservas/:id/pagar (Regenera link para reservas pendientes de pago)
router.post('/:id/pagar', auth, async (req, res) => {
  try {
    const { id } = req.params
    const reserva = await prisma.reserva.findFirst({
      where: { id: parseInt(id), usuarioId: req.usuario.id },
      include: { cabana: true }
    })

    if (!reserva)
      return res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' })

    if (reserva.estado !== 'pendiente')
      return res.status(400).json({ ok: false, mensaje: 'La reserva ya no está pendiente de pago' })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const esHttps = frontendUrl.startsWith('https')

    const preference = new Preference(mpClient)
    const result = await preference.create({
      body: {
        items: [
          {
            id: String(reserva.id),
            title: `${reserva.cabana.nombre} — Pago Reserva`,
            quantity: 1,
            unit_price: reserva.total,
            currency_id: 'CLP'
          }
        ],
        back_urls: {
          success: `${frontendUrl}/pago/resultado?status=success`,
          failure: `${frontendUrl}/pago/resultado?status=failure`,
          pending: `${frontendUrl}/pago/resultado?status=pending`
        },
        auto_return: esHttps ? 'approved' : undefined,
        notification_url: `${process.env.BACKEND_URL || 'https://sabanas-proyecto-production.up.railway.app'}/api/pagos/webhook`,
        external_reference: String(reserva.id)
      }
    })

    res.json({ ok: true, initPoint: result.init_point })
  } catch (error) {
    console.error('Error al generar enlace de re-pago:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al generar el portal de pago' })
  }
})

// PUT /api/reservas/:id/cancelar (Permite al usuario cancelar su propia reserva)
router.put('/:id/cancelar', auth, async (req, res) => {
  try {
    const { id } = req.params
    const reserva = await prisma.reserva.findFirst({
      where: { id: parseInt(id), usuarioId: req.usuario.id },
      include: { usuario: true, cabana: true }
    })

    if (!reserva)
      return res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' })

    if (reserva.estado === 'cancelada')
      return res.status(400).json({ ok: false, mensaje: 'La reserva ya está cancelada' })

    const reservaActualizada = await prisma.reserva.update({
      where: { id: parseInt(id) },
      data: { estado: 'cancelada' }
    })

    // Enviar notificación de cancelación por correo
    enviarAvisoCancelacion({
      emailCliente: reserva.usuario.email,
      nombreCliente: reserva.usuario.nombre,
      cabana: reserva.cabana.nombre,
      llegada: reserva.llegada,
      salida: reserva.salida,
      total: reserva.total
    }).catch(console.error)

    res.json({ ok: true, data: reservaActualizada, mensaje: 'Reserva cancelada con éxito' })
  } catch (error) {
    console.error('Error al cancelar reserva:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar la reserva' })
  }
})

router.get('/capacidad/:capacidad/ocupadas', async (req, res) => {
  try {
    const capacidad = parseInt(req.params.capacidad)

    const cabanas = await prisma.cabana.findMany({
      where: { capacidad, disponible: true }
    })

    const totalCabanas = cabanas.length
    if (totalCabanas === 0) return res.json({ ok: true, data: [] })

    const cabanasIds = cabanas.map(c => c.id)
    const reservas = await prisma.reserva.findMany({
      where: {
        cabanaId: { in: cabanasIds },
        estado: { not: 'cancelada' }
      },
      select: {
        llegada: true,
        salida: true
      }
    })

    const conteoFechas = {}

    reservas.forEach(r => {
      const dInicio = new Date(r.llegada)
      const dFin = new Date(r.salida)

      let temp = new Date(dInicio)
      while (temp < dFin) {
        const fechaStr = temp.toISOString().split('T')[0]
        conteoFechas[fechaStr] = (conteoFechas[fechaStr] || 0) + 1
        temp.setDate(temp.getDate() + 1)
      }
    })

    const fechasAgotadas = []
    Object.keys(conteoFechas).forEach(fechaStr => {
      if (conteoFechas[fechaStr] >= totalCabanas) {
        fechasAgotadas.push({
          llegada: `${fechaStr}T00:00:00.000Z`,
          salida: `${fechaStr}T00:00:00.000Z`
        })
      }
    })

    res.json({ ok: true, data: fechasAgotadas })
  } catch (error) {
    console.error('Error al obtener fechas ocupadas por capacidad:', error)
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
