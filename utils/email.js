const { Resend } = require('resend')
const resend = new Resend(process.env.RESEND_API_KEY)

async function enviarConfirmacionReserva({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  try {
    await resend.emails.send({
      from: 'Cabañas La Higuera Rapel <onboarding@resend.dev>',
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
            <p style="color:#666">Tu reserva ha sido recibida exitosamente. Aquí están los detalles:</p>
            <div style="background:#F5ECD7;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:0 0 8px"><strong>🏕️ Cabaña:</strong> ${cabana}</p>
              <p style="margin:0 0 8px"><strong>📅 Llegada:</strong> ${new Date(llegada).toLocaleDateString('es-CL')}</p>
              <p style="margin:0 0 8px"><strong>📅 Salida:</strong> ${new Date(salida).toLocaleDateString('es-CL')}</p>
              <p style="margin:0"><strong>💰 Total:</strong> $${total.toLocaleString('es-CL')}</p>
            </div>
            <p style="color:#666">Para cualquier consulta contáctanos:</p>
            <p style="color:#666">📞 9 8669 8970 | ✉️ Bana_ju@hotmail.com</p>
            <div style="text-align:center;margin-top:20px">
              <a href="https://wa.me/56986698970" style="background:#25D366;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none">💬 Contactar por WhatsApp</a>
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

module.exports = { enviarConfirmacionReserva }
