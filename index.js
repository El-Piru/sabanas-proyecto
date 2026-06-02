const express  = require('express')
const cors     = require('cors')
require('dotenv').config()

const auth     = require('./routes/auth')
const cabanas  = require('./routes/cabanas')
const reservas = require('./routes/reservas')
const admin    = require('./routes/admin')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://cabanas-fronted-production.up.railway.app'
  ]
}))
app.use(express.json())
app.use('/api/auth',     auth)
app.use('/api/cabanas',  cabanas)
app.use('/api/reservas', reservas)
app.use('/api/admin',    admin)

app.get('/', (req, res) => res.json({ mensaje: 'Servidor de Cabanas funcionando' }))

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))
