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
const pagos    = require('./routes/pagos')

const app  = express()
const PORT = process.env.PORT || 3000

// Confía en el proxy de Render para obtener la IP real del cliente en el Rate Limiter
app.set('trust proxy', 1)

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
app.use('/api/auth/recuperar-password', authLimiter)
app.use('/api/auth/verificar-token-reset', authLimiter)
app.use('/api/auth/restablecer-password', authLimiter)

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://cabanas-fronted-production.up.railway.app'
]
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL)
  if (process.env.FRONTEND_URL.endsWith('/')) {
    allowedOrigins.push(process.env.FRONTEND_URL.slice(0, -1))
  } else {
    allowedOrigins.push(process.env.FRONTEND_URL + '/')
  }
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true // Permitir el intercambio de cookies cross-site
}))
app.use(express.json())

// Rutas
app.use('/api/auth',     auth)
app.use('/api/cabanas',  cabanas)
app.use('/api/reservas', reservas)
app.use('/api/admin',    admin)
app.use('/api/pagos',    pagos)

app.get('/', (req, res) => res.json({ mensaje: 'Servidor de Cabañas funcionando de manera segura' }))

// Sincronizar y poblar base de datos automáticamente al arrancar
const { exec } = require('child_process')
exec('npx prisma db push', (err, stdout, stderr) => {
  if (err) {
    console.error('Error al sincronizar base de datos:', err)
  } else {
    console.log('Base de datos sincronizada y poblada con éxito:', stdout)
  }
})

app.listen(PORT, () => console.log(`Servidor seguro corriendo en http://localhost:${PORT}`))
