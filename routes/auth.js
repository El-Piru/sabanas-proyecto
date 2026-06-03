const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const router   = express.Router()
const { PrismaClient } = require('@prisma/client')
const { z }            = require('zod') // Importar Zod
const prisma   = new PrismaClient()

// 1. Definir esquemas de validación de Zod
const registroSchema = z.object({
  nombre: z.string()
           .min(2, 'El nombre debe tener al menos 2 caracteres')
           .max(50, 'El nombre es demasiado largo'),
  email: z.string()
          .email('El formato del correo electrónico no es válido'),
  password: z.string()
             .min(6, 'La contraseña debe tener al menos 6 caracteres')
})

const loginSchema = z.object({
  email: z.string()
          .email('El formato del correo electrónico no es válido'),
  password: z.string()
             .min(1, 'La contraseña no puede estar vacía')
})

// 2. Ruta de Registro
router.post('/registro', async (req, res) => {
  try {
    // Validar datos de entrada con el esquema
    const { nombre, email, password } = registroSchema.parse(req.body)

    const existe = await prisma.usuario.findUnique({ where: { email } })
    if (existe)
      return res.status(400).json({ ok: false, mensaje: 'Email ya registrado' })

    const hash = await bcrypt.hash(password, 10)
    const usuario = await prisma.usuario.create({ data: { nombre, email, password: hash } })
    
    res.status(201).json({ ok: true, mensaje: 'Usuario creado', id: usuario.id })
  } catch (error) {
    // Si el error es de validación de Zod, enviamos el mensaje al frontend
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, mensaje: error.errors[0].message })
    }
    console.error(error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' })
  }
})

// 3. Ruta de Login
router.post('/login', async (req, res) => {
  try {
    // Validar datos de entrada con el esquema
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
    
    res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, mensaje: error.errors[0].message })
    }
    console.error(error)
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' })
  }
})

module.exports = router
