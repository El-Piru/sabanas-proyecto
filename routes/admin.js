const express = require('express')
const router  = express.Router()
const admin   = require('../middleware/admin.middleware')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

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
  const { nombre, descripcion, precio, capacidad } = req.body
  if (!nombre || !precio || !capacidad)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })
  const cabana = await prisma.cabana.create({
    data: { nombre, descripcion, precio: parseInt(precio), capacidad: parseInt(capacidad) }
  })
  res.status(201).json({ ok: true, data: cabana })
})

// PUT editar cabana
router.put('/cabanas/:id', admin, async (req, res) => {
  const { nombre, descripcion, precio, capacidad, disponible } = req.body
  const cabana = await prisma.cabana.update({
    where: { id: parseInt(req.params.id) },
    data: { nombre, descripcion, precio: parseInt(precio), capacidad: parseInt(capacidad), disponible }
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
