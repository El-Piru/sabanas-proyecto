const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

module.exports = async (req, res, next) => {
  const token = req.cookies.token || (req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null)

  if (!token)
    return res.status(401).json({ ok: false, mensaje: 'Token requerido' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const usuario = await prisma.usuario.findUnique({ where: { id: decoded.id } })
    
    if (!usuario || usuario.rol !== 'admin')
      return res.status(403).json({ ok: false, mensaje: 'Acceso denegado' })
      
    req.usuario = decoded
    next()
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido' })
  }
}
