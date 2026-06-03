const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  family: 4, // Fuerza el uso de IPv4 para evitar el error ENETUNREACH en Railway
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
})

async function enviarConfirmacionReserva({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  try {
    await transporter.sendMail({
      from: `"Cabañas La Higuera Rapel" <${process.env.GMAIL_USER}>`,
      to: emailCliente,
      subject: '✅ Reserva confirmada — Cabañas La Higuera Rapel',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#2C4A2E;padding:30px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:1.5rem">Cabañas La Higuera Rapel</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Lago Rapel, Chile</p>
          </div>
          <div style="background:#fff;padding:30px;border:1px solid #eee;border-radius:0 0 12px 12px">
            <h2 style="color:#1A2E1B">¡Reserva confirmada, ${nombreCliente}!</h2>
            <p style="color:#666">Tu reserva ha sido recibida. Aquí están los detalles:</p>
            <div style="background:#F5ECD7;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:0 0 8px"><strong>🏕️ Cabaña:</strong> ${cabana}</p>
              <p style="margin:0 0 8px"><strong>📅 Entrada:</strong> ${new Date(llegada).toLocaleDateString('es-CL')}</p>
              <p style="margin:0 0 8px"><strong>📅 Salida:</strong> ${new Date(salida).toLocaleDateString('es-CL')}</p>
              <p style="margin:0"><strong>💰 Total:</strong> $${total.toLocaleString('es-CL')}</p>
            </div>
            <p style="color:#666">📞 9 8669 8970 | ✉️ Bana_ju@hotmail.com</p>
            <div style="text-align:center;margin-top:20px">
              <a href="https://wa.me/56986698970" style="background:#25D366;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none">💬 WhatsApp</a>
            </div>
          </div>
        </div>
      `
    })
    console.log('Email enviado a', emailCliente)
  } catch (error) {
    console.error('Error enviando email:', error)
  }
}

async function enviarAvisoAdmin({ nombreCliente, emailCliente, cabana, llegada, salida, total }) {
  try {
    await transporter.sendMail({
      from: `"Cabañas La Higuera Rapel" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: '🔔 Nueva reserva recibida',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1A2E1B">Nueva reserva recibida</h2>
          <div style="background:#F5ECD7;border-radius:8px;padding:20px">
            <p><strong>Cliente:</strong> ${nombreCliente} (${emailCliente})</p>
            <p><strong>Cabaña:</strong> ${cabana}</p>
            <p><strong>Entrada:</strong> ${new Date(llegada).toLocaleDateString('es-CL')}</p>
            <p><strong>Salida:</strong> ${new Date(salida).toLocaleDateString('es-CL')}</p>
            <p><strong>Total:</strong> $${total.toLocaleString('es-CL')}</p>
          </div>
        </div>
      `
    })
  } catch (error) {
    console.error('Error enviando aviso admin:', error)
  }
async function enviarAvisoCancelacion({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  try {
    await transporter.sendMail({
      from: `"Cabañas La Higuera Rapel" <${process.env.GMAIL_USER}>`,
      // Se envía a ambos: al cliente y a ti (el administrador)
      to: [emailCliente, process.env.GMAIL_USER],
      subject: '❌ Reserva cancelada — Cabañas La Higuera Rapel',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#991B1B;padding:30px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:1.5rem">Reserva Cancelada</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Cabañas La Higuera Rapel</p>
          </div>
          <div style="background:#fff;padding:30px;border:1px solid #eee;border-radius:0 0 12px 12px">
            <h2 style="color:#1A2E1B">Notificación de Cancelación</h2>
            <p style="color:#666">Te informamos que la reserva de <strong>${nombreCliente}</strong> ha sido cancelada.</p>
            <div style="background:#FEE2E2;border-radius:8px;padding:20px;margin:20px 0;color:#991B1B">
              <p style="margin:0 0 8px"><strong>🏕️ Cabaña:</strong> ${cabana}</p>
              <p style="margin:0 0 8px"><strong>📅 Entrada:</strong> ${new Date(llegada).toLocaleDateString('es-CL')}</p>
              <p style="margin:0 0 8px"><strong>📅 Salida:</strong> ${new Date(salida).toLocaleDateString('es-CL')}</p>
              <p style="margin:0"><strong>💰 Total liberado:</strong> $${total.toLocaleString('es-CL')}</p>
            </div>
            <p style="color:#666">Si tienes alguna duda o consideras que esto es un error, por favor contáctanos:</p>
            <p style="color:#666">📞 9 8669 8970 | ✉️ Bana_ju@hotmail.com</p>
          </div>
        </div>
      `
    })
    console.log('Email de cancelación enviado a', emailCliente, 'y admin')
  } catch (error) {
    console.error('Error enviando email de cancelación:', error)
  }
}

module.exports = { 
  enviarConfirmacionReserva, 
  enviarAvisoAdmin, 
  enviarAvisoCancelacion 
}
