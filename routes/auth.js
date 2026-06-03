const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const router   = express.Router()
const { PrismaClient } = require('@prisma/client')
const { z }            = require('zod')
const prisma   = new PrismaClient()

const registroSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(50, 'El nombre es demasiado largo'),
  email: z.string().email('El formato del correo electrónico no es válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  telefono: z.string().optional().or(z.literal(''))
})

const loginSchema = z.object({
  email: z.string().email('El formato del correo electrónico no es válido'),
  password: z.string().min(1, 'La contraseña no puede estar vacía')
})

router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, telefono } = registroSchema.parse(req.body)
    const existe = await prisma.usuario.findUnique({ where: { email } })
    if (existe)
      return res.status(400).json({ ok: false, mensaje: 'Email ya registrado' })

    const hash = await bcrypt.hash(password, 10)
    const usuario = await prisma.usuario.create({
      data: { nombre, email, password: hash, telefono: telefono || null }
    })
    res.status(201).json({ ok: true, mensaje: 'Usuario creado', id: usuario.id })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, mensaje: error.errors[0].message })
    }
    console.error(error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario)
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' })

    const valida = await bcrypt.compare(password, usuario.password)
    if (!valida)
      return res.status(401).json({ ok: false, mensaje: 'Credenciales inválidas' })

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    // Si es entorno Railway o producción, forzamos SameSite: None y Secure
    const esProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined
    res.cookie('token', token, {
      httpOnly: true, // Previene XSS
      secure: esProd, // Requiere HTTPS
      sameSite: esProd ? 'none' : 'lax', // Requerido para cookies entre distintos dominios
      maxAge: 24 * 60 * 60 * 1000 // 24 horas
    })
    
    res.json({ ok: true, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, telefono: usuario.telefono } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, mensaje: error.errors[0].message })
    }
    console.error(error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' })
  }
})

// Endpoint para cerrar sesión borrando la cookie
router.post('/logout', (req, res) => {
  const esProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined
  res.clearCookie('token', {
    httpOnly: true,
    secure: esProd,
    sameSite: esProd ? 'none' : 'lax'
  })
  res.json({ ok: true, mensaje: 'Sesión cerrada exitosamente' })
})

module.exports = router
