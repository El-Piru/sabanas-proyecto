const express = require('express')
const router  = express.Router()
const admin   = require('../middleware/admin.middleware')
const { PrismaClient } = require('@prisma/client')
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
  await prisma.cabana.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ ok: true, mensaje: 'Cabaña eliminada' })
})

// PUT cancelar reserva
router.put('/reservas/:id/cancelar', admin, async (req, res) => {
  const reserva = await prisma.reserva.update({
    where: { id: parseInt(req.params.id) },
    data: { estado: 'cancelada' }
  })
  res.json({ ok: true, data: reserva })
})

// GET todos los usuarios
router.get('/usuarios', admin, async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, createdAt: true }
  })
  res.json({ ok: true, data: usuarios })
})

module.exports = router
