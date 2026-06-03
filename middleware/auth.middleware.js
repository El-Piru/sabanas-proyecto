const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  // Busca el token en las cookies, si no existe busca en las cabeceras
  const token = req.cookies.token || (req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null)

  if (!token)
    return res.status(401).json({ ok: false, mensaje: 'Token requerido' })

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido' })
  }
}
