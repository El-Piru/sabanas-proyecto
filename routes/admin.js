const express = require('express')
const router  = express.Router()
const admin   = require('../middleware/admin.middleware')
const { PrismaClient } = require('@prisma/client')
const { enviarAvisoCancelacion, enviarConfirmacionReserva, enviarEmail } = require('../utils/email')
const { registrarReservaEnSheets, cancelarReservaEnSheets } = require('../utils/sheets')
const prisma  = new PrismaClient()

// Endpoint temporal (Sin seguridad de token para que lo abras fácil desde el navegador)
// Corrige los registros antiguos de la base de datos
router.get('/migrar-ortografia', admin, async (req, res) => {
  try {
    const cabanas = await prisma.cabana.findMany()
    let corregidas = 0
    
    for (const c of cabanas) {
      const nuevoNombre = c.nombre.replace(/Cabana/g, 'Cabaña').replace(/cabana/g, 'cabaña')
      const nuevaDesc = c.descripcion ? c.descripcion.replace(/Cabana/g, 'Cabaña').replace(/cabana/g, 'cabaña') : c.descripcion
      
      await prisma.cabana.update({
        where: { id: c.id },
        data: { nombre: nuevoNombre, descripcion: nuevaDesc }
      })
      corregidas++
    }
    
    res.json({ ok: true, mensaje: `Base de datos corregida. Se actualizaron ${corregidas} cabañas.` })
  } catch (error) {
    console.error('Error en la migración:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al corregir los nombres' })
  }
})

// Endpoint para borrar todas las reservas y usuarios de prueba en producción
router.post('/limpieza-total-produccion', admin, async (req, res) => {
  try {
    const deletedReservas = await prisma.reserva.deleteMany()
    const deletedResenas = await prisma.resena.deleteMany()
    const deletedUsuarios = await prisma.usuario.deleteMany({
      where: { email: { not: 'admin@cabanas.cl' } }
    })

    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Reserva_id_seq" RESTART WITH 1;`
    } catch (seqError) {
      console.log('No se pudo reiniciar la secuencia:', seqError.message)
    }

    res.json({ 
      ok: true, 
      mensaje: `Limpieza completada en producción: ${deletedReservas.count} reservas eliminadas, ${deletedUsuarios.count} usuarios de prueba eliminados.`,
      reservasBorradas: deletedReservas.count,
      usuariosBorrados: deletedUsuarios.count
    })
  } catch (error) {
    console.error('Error al realizar limpieza en producción:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al realizar limpieza' })
  }
})

// Endpoint temporal para probar el SMTP de Gmail en producción y ver el error exacto
router.get('/test-email-smtp', admin, async (req, res) => {
  try {
    const { enviarRestablecerPassword } = require('../utils/email')
    await enviarRestablecerPassword({
      emailCliente: req.query.email || 'juinzhy@gmail.com',
      nombreCliente: 'Prueba Admin',
      enlace: 'https://example.com'
    })
    res.json({ ok: true, mensaje: 'Email enviado con éxito en producción' })
  } catch (error) {
    console.error('Error de SMTP de prueba:', error)
    res.status(500).json({ 
      ok: false, 
      mensaje: 'Error de SMTP', 
      error: error.message, 
      code: error.code,
      command: error.command
    })
  }
})

// Endpoint temporal para simular reserva confirmada sin pago y enviar email en producción
router.get('/test-confirmacion-reserva', admin, async (req, res) => {
  try {
    const email = req.query.email || 'juizhy@gmail.com'
    const nombre = req.query.nombre || 'Cliente Test Simulación'
    
    // Buscar o crear usuario
    let usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) {
      const bcrypt = require('bcryptjs')
      const pass = Math.random().toString(36).slice(-10)
      const hash = await bcrypt.hash(pass, 10)
      usuario = await prisma.usuario.create({
        data: {
          nombre,
          email,
          telefono: '+56912345678',
          password: hash,
          rol: 'cliente'
        }
      })
    }

    // Buscar la cabaña 11 (2 personas) o cualquiera
    const cabana = await prisma.cabana.findFirst({ where: { capacidad: 2 } })
    if (!cabana) {
      return res.status(404).json({ ok: false, mensaje: 'No hay cabaña de capacidad 2 para el test' })
    }

    // Rango de fechas ficticio
    const d1 = new Date()
    d1.setDate(d1.getDate() + 30) // en 30 días
    const d2 = new Date()
    d2.setDate(d2.getDate() + 32) // 2 noches

    const total = 2 * cabana.precio

    // Crear la reserva directamente en estado 'confirmada'
    const reserva = await prisma.reserva.create({
      data: {
        usuarioId: usuario.id,
        cabanaId: cabana.id,
        llegada: d1,
        salida: d2,
        total,
        estado: 'confirmada'
      },
      include: { usuario: true, cabana: true }
    })

    // Enviar correo de confirmación (usando Resend en producción)
    await enviarConfirmacionReserva({
      emailCliente: email,
      nombreCliente: nombre,
      cabana: cabana.nombre,
      llegada: d1,
      salida: d2,
      total: total
    })

    // Registrar en Google Sheets
    await registrarReservaEnSheets(reserva)

    res.json({ 
      ok: true, 
      mensaje: `Reserva de prueba #${reserva.id} creada y confirmada. Se envió el correo a ${email}.`,
      reserva 
    })
  } catch (error) {
    console.error('Error en test-confirmacion-reserva:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
})



// Endpoint temporal para listar las claves de entorno configuradas en producción
router.get('/env-keys', admin, (req, res) => {
  res.json({ keys: Object.keys(process.env) })
})


// === A partir de aquí se protegen las rutas con el middleware admin ===

// GET todas las reservas
router.get('/reservas', admin, async (req, res) => {
  const reservas = await prisma.reserva.findMany({
    include: { usuario: { select: { id: true, nombre: true, email: true, telefono: true } }, cabana: true },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ ok: true, data: reservas })
})

// POST crear reserva manual o bloqueo (Admin)
router.post('/reservas/manual', admin, async (req, res) => {
  try {
    const { cabanaId, llegada, salida, nombreCliente, emailCliente, telefonoCliente, esBloqueo } = req.body
    if (!cabanaId || !llegada || !salida) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos requeridos (Cabaña, llegada y salida)' })
    }

    const d1 = new Date(llegada)
    const d2 = new Date(salida)
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) {
      return res.status(400).json({ ok: false, mensaje: 'Fechas de llegada/salida inválidas' })
    }

    const cabana = await prisma.cabana.findUnique({ where: { id: parseInt(cabanaId) } })
    if (!cabana) {
      return res.status(404).json({ ok: false, mensaje: 'Cabaña no encontrada' })
    }

    // Verificar conflicto de fechas
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

    if (conflicto) {
      return res.status(400).json({ ok: false, mensaje: `La cabaña ya está ocupada en ese rango de fechas por una reserva activa` })
    }

    let targetUsuarioId
    if (esBloqueo) {
      // Bloqueo de mantenimiento: Crear o buscar un usuario virtual de mantenimiento
      let usuarioMant = await prisma.usuario.findUnique({ where: { email: 'mantenimiento@cabanaslahiguera.cl' } })
      if (!usuarioMant) {
        const bcrypt = require('bcryptjs')
        const pass = Math.random().toString(36).slice(-10)
        const hash = await bcrypt.hash(pass, 10)
        usuarioMant = await prisma.usuario.create({
          data: {
            nombre: 'Bloqueo de Mantenimiento',
            email: 'mantenimiento@cabanaslahiguera.cl',
            telefono: '',
            password: hash,
            rol: 'cliente'
          }
        })
      }
      targetUsuarioId = usuarioMant.id
    } else {
      // Reserva de cliente manual: validar campos
      if (!nombreCliente || !emailCliente) {
        return res.status(400).json({ ok: false, mensaje: 'Para una reserva de cliente se requiere nombre y correo' })
      }

      // Buscar o crear usuario
      let usuario = await prisma.usuario.findUnique({ where: { email: emailCliente } })
      if (!usuario) {
        const bcrypt = require('bcryptjs')
        const passTemporal = Math.random().toString(36).slice(-10)
        const hash = await bcrypt.hash(passTemporal, 10)
        usuario = await prisma.usuario.create({
          data: {
            nombre: nombreCliente,
            email: emailCliente,
            telefono: telefonoCliente || null,
            password: hash,
            rol: 'cliente'
          }
        })
      }
      targetUsuarioId = usuario.id
    }

    const noches = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
    const total = esBloqueo ? 0 : (noches * cabana.precio)

    const reserva = await prisma.reserva.create({
      data: {
        usuarioId: targetUsuarioId,
        cabanaId: cabana.id,
        llegada: d1,
        salida: d2,
        total,
        estado: esBloqueo ? 'mantenimiento' : 'confirmada'
      },
      include: { usuario: { select: { nombre: true, email: true, telefono: true } }, cabana: true }
    })

    // Enviar correo de confirmación de reserva si es un cliente real
    if (!esBloqueo && emailCliente) {
      enviarConfirmacionReserva({
        emailCliente: emailCliente,
        nombreCliente: nombreCliente,
        cabana: cabana.nombre,
        llegada: d1,
        salida: d2,
        total: total
      }).catch(err => {
        console.error('Error enviando email de reserva manual:', err)
      })
    }

    // Registrar en Google Sheets (tanto reservas como bloqueos)
    registrarReservaEnSheets(reserva).catch(err => {
      console.error('Error registrando en Google Sheets:', err)
    })

    res.status(201).json({ ok: true, data: reserva, mensaje: esBloqueo ? 'Cabaña bloqueada con éxito' : 'Reserva manual creada con éxito' })
  } catch (error) {
    console.error('Error al crear reserva manual:', error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor al procesar la reserva manual' })
  }
})

// GET todas las cabanas
router.get('/cabanas', admin, async (req, res) => {
  const cabanas = await prisma.cabana.findMany()
  res.json({ ok: true, data: cabanas })
})

// POST crear cabana
router.post('/cabanas', admin, async (req, res) => {
  const { nombre, descripcion, precio, capacidad, imagen } = req.body
  if (!nombre || !precio || !capacidad)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })
  const cabana = await prisma.cabana.create({
    data: { nombre, descripcion, precio: parseInt(precio), capacidad: parseInt(capacidad), imagen: imagen || null }
  })
  res.status(201).json({ ok: true, data: cabana })
})

// PUT editar cabana
router.put('/cabanas/:id', admin, async (req, res) => {
  const { nombre, descripcion, precio, capacidad, disponible, imagen } = req.body
  const cabana = await prisma.cabana.update({
    where: { id: parseInt(req.params.id) },
    data: { nombre, descripcion, precio: parseInt(precio), capacidad: parseInt(capacidad), disponible, imagen }
  })
  res.json({ ok: true, data: cabana })
})

// DELETE cabana
router.delete('/cabanas/:id', admin, async (req, res) => {
  try {
    const cabanaId = parseInt(req.params.id)
    // Eliminar primero todas las reservas de esta cabaña para evitar el error de clave foránea de Postgres
    await prisma.reserva.deleteMany({ where: { cabanaId } })
    // Ahora sí podemos eliminar la cabaña de forma segura
    await prisma.cabana.delete({ where: { id: cabanaId } })
    res.json({ ok: true, mensaje: 'Cabaña eliminada con éxito' })
  } catch (error) {
    console.error('Error al eliminar cabaña:', error)
    res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar la cabaña debido a un error del servidor.' })
  }
})

// PUT confirmar reserva (Admin)
router.put('/reservas/:id/confirmar', admin, async (req, res) => {
  try {
    const reserva = await prisma.reserva.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'confirmada' },
      include: { usuario: true, cabana: true }
    })

    // Enviar notificación de confirmación por correo al cliente
    enviarConfirmacionReserva({
      emailCliente: reserva.usuario.email,
      nombreCliente: reserva.usuario.nombre,
      cabana: reserva.cabana.nombre,
      llegada: reserva.llegada,
      salida: reserva.salida,
      total: reserva.total
    }).catch(console.error)

    // Registrar en Google Sheets
    registrarReservaEnSheets(reserva).catch(err => {
      console.error('Error al registrar en Google Sheets:', err)
    })

    res.json({ ok: true, data: reserva, mensaje: 'Reserva confirmada exitosamente' })
  } catch (error) {
    console.error('Error al confirmar reserva por el admin:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al confirmar la reserva' })
  }
})

// PUT cambiar fechas y/o cabaña de reserva (Admin)
router.put('/reservas/:id/cambiar-fechas', admin, async (req, res) => {
  try {
    const reservaId = parseInt(req.params.id)
    const { llegada, salida, cabanaId } = req.body
    if (!llegada || !salida) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan fechas de llegada y salida' })
    }

    const d1 = new Date(llegada)
    const d2 = new Date(salida)
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) {
      return res.status(400).json({ ok: false, mensaje: 'Rango de fechas inválido' })
    }

    const reservaExistente = await prisma.reserva.findUnique({
      where: { id: reservaId },
      include: { cabana: true, usuario: true }
    })

    if (!reservaExistente) {
      return res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' })
    }

    const nuevaCabanaId = cabanaId ? parseInt(cabanaId) : reservaExistente.cabanaId
    const nuevaCabanaObj = await prisma.cabana.findUnique({ where: { id: nuevaCabanaId } })

    if (!nuevaCabanaObj) {
      return res.status(400).json({ ok: false, mensaje: 'La cabaña seleccionada no existe' })
    }

    // Verificar si hay conflicto con otra reserva activa en la cabaña elegida
    const conflicto = await prisma.reserva.findFirst({
      where: {
        id: { not: reservaId },
        cabanaId: nuevaCabanaId,
        estado: { not: 'cancelada' },
        AND: [
          { llegada: { lte: d2 } },
          { salida: { gte: d1 } }
        ]
      }
    })

    if (conflicto) {
      return res.status(400).json({ ok: false, mensaje: 'La cabaña seleccionada ya se encuentra ocupada en esas fechas' })
    }

    const noches = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
    const nuevoTotal = noches * (nuevaCabanaObj.precio || 0)

    const reservaActualizada = await prisma.reserva.update({
      where: { id: reservaId },
      data: {
        cabanaId: nuevaCabanaId,
        llegada: d1,
        salida: d2,
        total: nuevoTotal > 0 ? nuevoTotal : reservaExistente.total
      },
      include: { usuario: true, cabana: true }
    })

    res.json({ ok: true, data: reservaActualizada, mensaje: 'Reserva y cabaña actualizadas con éxito' })
  } catch (error) {
    console.error('Error al cambiar fechas y cabaña de reserva:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al modificar la reserva' })
  }
})

// PUT cancelar reserva (Admin)
router.put('/reservas/:id/cancelar', admin, async (req, res) => {
  try {
    const reserva = await prisma.reserva.update({
      where: { id: parseInt(req.params.id) },
      data: { estado: 'cancelada' },
      include: { usuario: true, cabana: true }
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

    // Notificar la cancelación en Google Sheets
    cancelarReservaEnSheets(reserva).catch(err => {
      console.error('Error al cancelar reserva en Google Sheets:', err)
    })

    res.json({ ok: true, data: reserva })
  } catch (error) {
    console.error('Error al cancelar reserva por el admin:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar la reserva' })
  }
})

// POST /api/admin/reservas/:id/reenviar-email (Envia comprobante de reserva al correo del dueño)
router.post('/reservas/:id/reenviar-email', admin, async (req, res) => {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { usuario: true, cabana: true }
    })

    if (!reserva) {
      return res.status(404).json({ ok: false, mensaje: 'Reserva no encontrada' })
    }

    const emailDestino = process.env.ADMIN_EMAIL || 'bana_ju@hotmail.com'

    // Límite de tiempo máximo de 3.5s para asegurar que la UI jamás se pegue
    const timerTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de envío')), 3500))

    try {
      await Promise.race([
        enviarConfirmacionReserva({
          emailCliente: emailDestino,
          nombreCliente: reserva.usuario?.nombre || 'Cliente',
          cabana: reserva.cabana?.nombre || 'Cabaña',
          llegada: reserva.llegada,
          salida: reserva.salida,
          total: reserva.total
        }),
        timerTimeout
      ])
    } catch (e) {
      console.warn('[reenviar-email] Tiempo límite o aviso de envío:', e.message || e)
    }

    return res.json({ ok: true, mensaje: 'Confirmación enviada exitosamente por correo' })
  } catch (error) {
    console.error('Error al enviar comprobante a admin:', error)
    return res.status(500).json({ ok: false, mensaje: 'Error al enviar el comprobante por correo' })
  }
})

// GET /api/admin/test-email (Prueba directa de correo y devuelve el diagnóstico exacto)
router.get('/test-email', async (req, res) => {
  try {
    const destino = req.query.email || 'juinzhy@gmail.com'
    const resultado = await enviarEmail({
      to: destino,
      subject: '🧪 Prueba de correo — Cabañas La Higuera',
      html: '<h1>Prueba de correo</h1><p>Si estás viendo este mensaje, los envíos de correo están 100% funcionales.</p>'
    })
    res.json({ ok: true, mensaje: `Correo enviado exitosamente a ${destino}`, resultado })
  } catch (err) {
    console.error('Error en /test-email:', err)
    res.status(500).json({ ok: false, error: err.message || err.toString(), name: err.name, details: err })
  }
})

// GET todos los usuarios
router.get('/usuarios', admin, async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, createdAt: true }
  })
  res.json({ ok: true, data: usuarios })
})

module.exports = router
