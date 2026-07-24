const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const router   = express.Router()
const { PrismaClient } = require('@prisma/client')
const { z }            = require('zod')
const prisma   = new PrismaClient()
const { enviarRestablecerPassword, getFrontendUrl } = require('../utils/email')
const authMiddleware = require('../middleware/auth.middleware')

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
      return res.status(401).json({ ok: false, mensaje: 'Tu correo o contraseña no son correctos. Intenta de nuevo!' })

    const valida = await bcrypt.compare(password, usuario.password)
    if (!valida)
      return res.status(401).json({ ok: false, mensaje: 'Tu correo o contraseña no son correctos. Intenta de nuevo!' })

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    const esProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined
    res.cookie('token', token, {
      httpOnly: true,
      secure: esProd,
      sameSite: esProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    })
    
    // Retornamos el token en el JSON para compatibilidad local y de cabeceras
    res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, telefono: usuario.telefono } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, mensaje: error.errors[0].message })
    }
    console.error(error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' })
  }
})

router.post('/logout', (req, res) => {
  const esProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined
  res.clearCookie('token', {
    httpOnly: true,
    secure: esProd,
    sameSite: esProd ? 'none' : 'lax'
  })
  res.json({ ok: true, mensaje: 'Sesión cerrada exitosamente' })
})

// POST /recuperar-password
router.post('/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ ok: false, mensaje: 'El correo electrónico es requerido.' })
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } })

    // Respuesta genérica siempre, exista o no la cuenta (evita que se pueda
    // usar este endpoint para averiguar qué correos están registrados)
    const mensajeGenerico = 'Si el correo está registrado, se ha enviado un enlace de recuperación.'

    if (usuario) {
      // Generar token JWT firmado con el hash actual de la contraseña
      const secret = process.env.JWT_SECRET + usuario.password
      const token = jwt.sign({ id: usuario.id, email: usuario.email }, secret, { expiresIn: '1h' })

      const frontendUrl = getFrontendUrl()
      const enlace = `${frontendUrl}/restablecer-password?token=${token}&id=${usuario.id}`

      // Enviar el correo en segundo plano para evitar que la petición quede colgada si el servidor de correo responde lento
      enviarRestablecerPassword({
        emailCliente: usuario.email,
        nombreCliente: usuario.nombre,
        enlace
      }).catch(err => {
        console.error('Error enviando email de recuperación en segundo plano:', err)
      })
    }

    res.json({ ok: true, mensaje: mensajeGenerico })
  } catch (error) {
    console.error('Error en recuperar-password:', error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor al procesar la solicitud.' })
  }
})

// POST /verificar-token-reset
router.post('/verificar-token-reset', async (req, res) => {
  try {
    const { id, token } = req.body
    if (!id || !token) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan parámetros requeridos.' })
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: parseInt(id) } })
    if (!usuario) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado.' })
    }

    const secret = process.env.JWT_SECRET + usuario.password
    try {
      jwt.verify(token, secret)
      res.json({ ok: true, mensaje: 'Token válido.' })
    } catch (err) {
      res.status(400).json({ ok: false, mensaje: 'El enlace de recuperación es inválido o ha expirado.' })
    }
  } catch (error) {
    console.error('Error en verificar-token-reset:', error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' })
  }
})

// POST /restablecer-password
router.post('/restablecer-password', async (req, res) => {
  try {
    const { id, token, password } = req.body
    if (!id || !token || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan parámetros requeridos.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' })
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: parseInt(id) } })
    if (!usuario) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado.' })
    }

    const secret = process.env.JWT_SECRET + usuario.password
    try {
      jwt.verify(token, secret)
    } catch (err) {
      return res.status(400).json({ ok: false, mensaje: 'El enlace de recuperación es inválido o ha expirado.' })
    }

    // Hash new password
    const hash = await bcrypt.hash(password, 10)

    // Update password in DB
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { password: hash }
    })

    res.json({ ok: true, mensaje: 'Contraseña restablecida con éxito. Ya puedes iniciar sesión.' })
  } catch (error) {
    console.error('Error en restablecer-password:', error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' })
  }
})

// DELETE /eliminar-cuenta
router.delete('/eliminar-cuenta', authMiddleware, async (req, res) => {
  try {
    const usuarioId = req.usuario.id

    // Eliminar reseñas y reservas asociadas al usuario
    await prisma.resena.deleteMany({ where: { usuarioId } })
    await prisma.reserva.deleteMany({ where: { usuarioId } })

    // Eliminar el registro del usuario
    await prisma.usuario.delete({ where: { id: usuarioId } })

    const esProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT !== undefined
    res.clearCookie('token', {
      httpOnly: true,
      secure: esProd,
      sameSite: esProd ? 'none' : 'lax'
    })

    res.json({ ok: true, mensaje: 'Tu cuenta ha sido eliminada exitosamente.' })
  } catch (error) {
    console.error('Error al eliminar cuenta:', error)
    res.status(500).json({ ok: false, mensaje: 'Error al intentar eliminar la cuenta. Por favor, intenta más tarde.' })
  }
})

module.exports = router
