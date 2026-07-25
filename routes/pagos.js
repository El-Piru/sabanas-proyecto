const express = require('express')
const router  = express.Router()
const { PrismaClient } = require('@prisma/client')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { enviarConfirmacionReserva, enviarAvisoAdmin } = require('../utils/email')
const { registrarReservaEnSheets } = require('../utils/sheets')
const prisma  = new PrismaClient()

// Configurar SDK de Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || ''
})

// Webhook / IPN de Mercado Pago
router.post('/webhook', async (req, res) => {
  // Respondemos 200 inmediatamente a Mercado Pago para evitar reintentos duplicados
  res.status(200).send('OK')

  try {
    const { type, data } = req.body

    // Solo procesamos eventos del tipo 'payment'
    if (type === 'payment' && data && data.id) {
      const paymentId = data.id
      console.log(`[Mercado Pago Webhook] Procesando pago ID: ${paymentId}`)

      // Consultar el detalle del pago a Mercado Pago
      const payment = new Payment(mpClient)
      const mpPago = await payment.get({ id: paymentId })

      const estadoPago = mpPago.status // ej. 'approved', 'pending', 'rejected'
      const reservaIdStr = mpPago.external_reference // ID de la reserva enviado en la preferencia

      console.log(`[Mercado Pago Webhook] Estado: ${estadoPago}, Reserva ID: ${reservaIdStr}`)

      if (estadoPago === 'approved' && reservaIdStr) {
        const reservaId = parseInt(reservaIdStr)

        // Buscar la reserva en la base de datos
        const reserva = await prisma.reserva.findUnique({
          where: { id: reservaId },
          include: { usuario: true, cabana: true }
        })

        if (!reserva) {
          console.error(`[Mercado Pago Webhook] Reserva con ID ${reservaId} no encontrada.`)
          return
        }

        // Si ya estaba confirmada, evitamos duplicar correos y sheets
        if (reserva.estado === 'confirmada') {
          console.log(`[Mercado Pago Webhook] La reserva ${reservaId} ya estaba confirmada previamente.`)
          return
        }

        // 1. Actualizar el estado de la reserva en la Base de Datos a "confirmada"
        await prisma.reserva.update({
          where: { id: reservaId },
          data: { estado: 'confirmada' }
        })
        console.log(`[Mercado Pago Webhook] Reserva ${reservaId} actualizada a "confirmada".`)

        // 2. Enviar notificaciones por correo en segundo plano
        enviarConfirmacionReserva({
          emailCliente: reserva.usuario.email,
          nombreCliente: reserva.usuario.nombre,
          cabana: `Cabaña para ${reserva.cabana.capacidad} personas`,
          llegada: reserva.llegada,
          salida: reserva.salida,
          total: reserva.total
        }).catch(console.error)

        enviarAvisoAdmin({
          nombreCliente: reserva.usuario.nombre,
          emailCliente: reserva.usuario.email,
          cabana: `Cabaña para ${reserva.cabana.capacidad} personas`,
          llegada: reserva.llegada,
          salida: reserva.salida,
          total: reserva.total
        }).catch(console.error)

        // 3. Registrar la reserva en Google Sheets en segundo plano
        registrarReservaEnSheets(reserva).catch(console.error)
      }
    }
  } catch (error) {
    console.error('[Mercado Pago Webhook Error]:', error)
  }
})

// Endpoint de respaldo para confirmar reserva automáticamente al retornar de Mercado Pago
router.post('/confirmar-retorno', async (req, res) => {
  try {
    const { externalReference, status } = req.body
    if (status !== 'success' || !externalReference) {
      return res.status(400).json({ ok: false, mensaje: 'Transacción no aprobada' })
    }

    const reservaId = parseInt(externalReference)
    const reserva = await prisma.reserva.findUnique({
      where: { id: reservaId },
      include: { usuario: true, cabana: true }
    })

    if (!reserva) {
      return res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' })
    }

    if (reserva.estado !== 'confirmada') {
      await prisma.reserva.update({
        where: { id: reservaId },
        data: { estado: 'confirmada' }
      })

      enviarConfirmacionReserva({
        emailCliente: reserva.usuario.email,
        nombreCliente: reserva.usuario.nombre,
        cabana: `Cabaña para ${reserva.cabana.capacidad} personas`,
        llegada: reserva.llegada,
        salida: reserva.salida,
        total: reserva.total
      }).catch(console.error)

      enviarAvisoAdmin({
        nombreCliente: reserva.usuario.nombre,
        emailCliente: reserva.usuario.email,
        cabana: `Cabaña para ${reserva.cabana.capacidad} personas`,
        llegada: reserva.llegada,
        salida: reserva.salida,
        total: reserva.total
      }).catch(console.error)

      registrarReservaEnSheets(reserva).catch(console.error)
    }

    res.json({ ok: true, mensaje: 'Reserva confirmada automáticamente' })
  } catch (error) {
    console.error('Error al confirmar retorno de pago:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al confirmar retorno de pago' })
  }
})

module.exports = router
