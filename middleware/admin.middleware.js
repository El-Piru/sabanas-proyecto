const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader)
    return res.status(401).json({ ok: false, mensaje: 'Token requerido' })

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const usuario = await prisma.usuario.findUnique({ where: { id: decoded.id } })
    if (!usuario || usuario.rol !== 'admin')
      return res.status(403).json({ ok: false, mensaje: 'Acceso denegado' })
    req.usuario = decoded
    next()
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token invalido' })
  }
}
