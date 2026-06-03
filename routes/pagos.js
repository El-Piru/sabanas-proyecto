const express = require('express')
const router  = express.Router()
const { PrismaClient } = require('@prisma/client')
const { MercadoPagoConfig, Payment } = require('mercadopago')
const { enviarConfirmacionReserva, enviarAvisoAdmin } = require('../utils/email')
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
          cabana: reserva.cabana.nombre,
          llegada: reserva.llegada,
          salida: reserva.salida,
          total: reserva.total
        }).catch(console.error)

        enviarAvisoAdmin({
          nombreCliente: reserva.usuario.nombre,
          emailCliente: reserva.usuario.email,
          cabana: reserva.cabana.nombre,
          llegada: reserva.llegada,
          salida: reserva.salida,
          total: reserva.total
        }).catch(console.error)

        // 3. Registrar la reserva en Google Sheets en segundo plano
        if (process.env.GOOGLE_SHEET_WEBHOOK_URL) {
          fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: reserva.id,
              cabana: reserva.cabana.nombre,
              cliente: reserva.usuario.nombre,
              email: reserva.usuario.email,
              telefono: reserva.usuario.telefono || 'No registrado',
              entrada: new Date(reserva.llegada).toLocaleDateString('es-CL'),
              salida: new Date(reserva.salida).toLocaleDateString('es-CL'),
              total: reserva.total,
              estado: 'confirmada',
              fechaCompra: new Date().toLocaleDateString('es-CL')
            })
          })
            .then(resSheets => console.log(`[Webhook Google Sheets] Estado respuesta: ${resSheets.status}`))
            .catch(err => console.error('Error al enviar datos a Google Sheets:', err))
        }
      }
    }
  } catch (error) {
    console.error('[Mercado Pago Webhook Error]:', error)
  }
})

module.exports = router
