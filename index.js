const express      = require('express')
const cors         = require('cors')
const helmet       = require('helmet')
const rateLimit    = require('express-rate-limit')
const cookieParser = require('cookie-parser') // Importar cookie-parser
require('dotenv').config()

const auth     = require('./routes/auth')
const cabanas  = require('./routes/cabanas')
const reservas = require('./routes/reservas')
const admin    = require('./routes/admin')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cookieParser()) // Habilitar lectura de cookies

// Limitador global de peticiones
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { ok: false, mensaje: 'Demasiadas peticiones desde esta IP. Intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(globalLimiter)

// Limitador estricto para Login y Registro
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, mensaje: 'Demasiados intentos de acceso desde esta IP. Por seguridad, espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/registro', authLimiter)

// Configuración CORS compatible con credenciales/cookies
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://cabanas-fronted-production.up.railway.app'
  ],
  credentials: true // Permitir el intercambio de cookies cross-site
}))
app.use(express.json())

// Rutas
app.use('/api/auth',     auth)
app.use('/api/cabanas',  cabanas)
app.use('/api/reservas', reservas)
app.use('/api/admin',    admin)

app.get('/', (req, res) => res.json({ mensaje: 'Servidor de Cabañas funcionando de manera segura' }))

app.listen(PORT, () => console.log(`Servidor seguro corriendo en http://localhost:${PORT}`))
