const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const router   = express.Router()
const { PrismaClient } = require('@prisma/client')
const prisma   = new PrismaClient()

router.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body
  if (!nombre || !email || !password)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })
  const existe = await prisma.usuario.findUnique({ where: { email } })
  if (existe)
    return res.status(400).json({ ok: false, mensaje: 'Email ya registrado' })
  const hash = await bcrypt.hash(password, 10)
  const usuario = await prisma.usuario.create({ data: { nombre, email, password: hash } })
  res.status(201).json({ ok: true, mensaje: 'Usuario creado', id: usuario.id })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos' })
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario)
    return res.status(401).json({ ok: false, mensaje: 'Credenciales invalidas' })
  const valida = await bcrypt.compare(password, usuario.password)
  if (!valida)
    return res.status(401).json({ ok: false, mensaje: 'Credenciales invalidas' })
  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )
  res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } })
})

module.exports = router