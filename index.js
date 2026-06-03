const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const auth     = require('./routes/auth')
const cabanas  = require('./routes/cabanas')
const reservas = require('./routes/reservas')
const admin    = require('./routes/admin')

const app  = express()
const PORT = process.env.PORT || 3000

// 1. Cabeceras HTTP seguras
app.use(helmet())

// 2. Limitador global de peticiones (evita sobrecargas)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 150, // Límite de 150 peticiones por IP
  message: { ok: false, mensaje: 'Demasiadas peticiones desde esta IP. Intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(globalLimiter)

// 3. Limitador estricto para Login y Registro (previene fuerza bruta de contraseñas)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máximo 10 intentos de inicio de sesión o registro por IP
  message: { ok: false, mensaje: 'Demasiados intentos de acceso desde esta IP. Por seguridad, espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/registro', authLimiter)

// Configuración CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://cabanas-fronted-production.up.railway.app'
  ]
}))
app.use(express.json())

// Rutas
app.use('/api/auth',     auth)
app.use('/api/cabanas',  cabanas)
app.use('/api/reservas', reservas)
app.use('/api/admin',    admin)

app.get('/', (req, res) => res.json({ mensaje: 'Servidor de Cabañas funcionando de manera segura' }))

app.listen(PORT, () => console.log(`Servidor seguro corriendo en http://localhost:${PORT}`))
