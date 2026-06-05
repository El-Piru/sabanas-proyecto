const express = require('express')
const router  = express.Router()
const admin   = require('../middleware/admin.middleware')
const { PrismaClient } = require('@prisma/client')
const { enviarAvisoCancelacion } = require('../utils/email')
const prisma  = new PrismaClient()

// Endpoint temporal (Sin seguridad de token para que lo abras fácil desde el navegador)
// Corrige los registros antiguos de la base de datos
router.get('/migrar-ortografia', async (req, res) => {
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

// Endpoint temporal para borrar todas las reservas en producción
router.get('/reiniciar-reservas', async (req, res) => {
  try {
    const deleted = await prisma.reserva.deleteMany()
    let secuenciaReiniciada = true
    try {
      await prisma.$executeRaw`ALTER SEQUENCE "Reserva_id_seq" RESTART WITH 1;`
    } catch (seqError) {
      console.log('No se pudo reiniciar la secuencia:', seqError.message)
      secuenciaReiniciada = false
    }
    res.json({ 
      ok: true, 
      mensaje: `Todas las reservas han sido eliminadas (${deleted.count} eliminadas). Secuencia reiniciada: ${secuenciaReiniciada}` 
    })
  } catch (error) {
    console.error('Error al reiniciar reservas:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al reiniciar las reservas' })
  }
})

// Endpoint temporal para probar el SMTP de Gmail en producción y ver el error exacto
router.get('/test-email-smtp', async (req, res) => {
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

// Endpoint temporal para listar las claves de entorno configuradas en producción
router.get('/env-keys', (req, res) => {
  res.json({ keys: Object.keys(process.env) })
})


// === A partir de aquí se protegen las rutas con el middleware admin ===

// GET todas las reservas
router.get('/reservas', admin, async (req, res) => {
  const reservas = await prisma.reserva.findMany({
    include: { usuario: { select: { nombre: true, email: true } }, cabana: true },
    orderBy: { createdAt: 'desc' }
  })
  res.json({ ok: true, data: reservas })
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

// PUT cancelar reserva
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

    res.json({ ok: true, data: reserva })
  } catch (error) {
    console.error('Error al cancelar reserva por el admin:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar la reserva' })
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
