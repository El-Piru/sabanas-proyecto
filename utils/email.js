const dns = require('dns');
const nodemailer = require('nodemailer');

function getGmailTransporter() {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { family: 4 }, callback);
    },
    auth: { user, pass }
  });
}

/**
 * Función principal para enviar correos usando Resend REST API (HTTPS Puerto 443) y Gmail SMTP (IPv4 Puerto 587).
 */
async function enviarEmail({ to, subject, html }) {
  // 1. Intentar vía Resend REST API (HTTPS 443 - Ultra Rápido ~200ms)
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const defaultFrom = 'Cabanas La Higuera Rapel <reservas@xn--cabaaslahiguera-1qb.cl>';
      const envFrom = (process.env.EMAIL_FROM || '').trim();
      const fromEmail = (envFrom && !envFrom.includes('resend.dev')) ? envFrom : defaultFrom;
      console.log(`[Email Resend API] Enviando a ${to} (Desde: ${fromEmail})...`);

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: Array.isArray(to) ? to : [to],
          reply_to: 'bana_ju@hotmail.com',
          subject: subject,
          html: html
        })
      });

      const resData = await response.json().catch(() => ({}));

      if (response.ok) {
        console.log('[Email Resend API] ✅ Entregado exitosamente:', resData);
        return resData; // Retorno inmediato en ~200ms
      }

      console.error('[Email Resend API] Resend devolvió error:', response.status, resData);
    } catch (err) {
      console.error('[Email Resend API] Error al conectar:', err.message || err);
    }
  }

  // 2. Fallback a Gmail SMTP sólo si Resend no está configurado o falló
  const transporter = getGmailTransporter();
  if (transporter) {
    try {
      const gmailUser = process.env.GMAIL_USER.trim();
      const fromEmail = `"Cabañas La Higuera Rapel" <${gmailUser}>`;
      console.log(`[Email Gmail SMTP] Intentando fallback a ${to}...`);

      const info = await transporter.sendMail({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html
      });
      console.log('[Email Gmail SMTP] ✅ Entregado exitosamente vía Gmail:', info.messageId);
      return info;
    } catch (gmailErr) {
      console.error('[Email Gmail SMTP] Error SMTP:', gmailErr.message || gmailErr);
    }
  }

  throw new Error('No se pudo entregar el correo por ningún servicio.');
}

function getFrontendUrl() {
  const envUrl = process.env.FRONTEND_URL || '';
  if (envUrl && !envUrl.includes('railway.app') && !envUrl.includes('onrender.com')) {
    return envUrl.replace(/\/$/, '');
  }
  return 'https://www.xn--cabaaslahiguera-1qb.cl';
}

async function enviarConfirmacionReserva({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  const frontendUrl = getFrontendUrl();
  try {
    await enviarEmail({
      to: emailCliente,
      subject: '✅ Reserva confirmada — Cabañas La Higuera Rapel',
      html: `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#FAF8F5;color:#333;">
          <!-- Header Banner -->
          <div style="background:#2C4A2E;padding:35px 20px;text-align:center;border-radius:16px 16px 0 0;box-shadow:0 4px 10px rgba(44,74,46,0.15)">
            <h1 style="color:#FAF8F5;margin:0;font-size:1.8rem;font-weight:600;letter-spacing:0.5px">Cabañas La Higuera Rapel</h1>
            <p style="color:rgba(250,248,245,0.8);margin:8px 0 0;font-size:0.95rem;letter-spacing:1px;text-transform:uppercase">Lago Rapel, Chile</p>
          </div>
          
          <!-- Body -->
          <div style="background:#ffffff;padding:40px 30px;border:1px solid #ECE8E0;border-top:none;border-radius:0 0 16px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.02)">
            <h2 style="color:#1A2E1B;margin-top:0;font-size:1.4rem;font-weight:600">¡Tu reserva está confirmada!</h2>
            <p style="color:#5A6A5C;font-size:0.95rem;line-height:1.6">Hola <strong>${nombreCliente}</strong>, ya hemos registrado y asegurado tu estadía. A continuación encuentras los detalles de tu reserva:</p>
            
            <!-- Details Box -->
            <div style="background:#FDFBF7;border:1px solid #F3EDE2;border-radius:12px;padding:25px;margin:25px 0">
              <h3 style="margin-top:0;margin-bottom:15px;color:#1A2E1B;font-size:1.05rem;border-bottom:1px solid #F3EDE2;padding-bottom:10px">Resumen de la Estadía</h3>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>🏕️ Cabaña:</strong> ${cabana}</p>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>📅 Entrada (Check-in):</strong> ${new Date(llegada).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santiago' })}</p>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>📅 Salida (Check-out):</strong> ${new Date(salida).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santiago' })}</p>
              <p style="margin:0;font-size:1.1rem;color:#C01C1C;font-weight:600;padding-top:8px;border-top:1px dashed #ECE8E0"><strong>💰 Total:</strong> $${total.toLocaleString('es-CL')}</p>
            </div>
            
            <!-- Button -->
            <div style="text-align:center;margin:35px 0">
              <a href="${frontendUrl}/mis-reservas" style="background:#2C4A2E;color:#FAF8F5;padding:14px 30px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(44,74,46,0.25);font-size:0.95rem">Ver mis reservas</a>
            </div>

            <!-- Contact Box -->
            <div style="background:#F0F4F1;border-radius:12px;padding:20px;text-align:center;margin-top:30px;border:1px solid #E2EAE3">
              <h4 style="margin:0 0 8px 0;color:#1A2E1B;font-size:0.95rem;font-weight:600">¿Tienes dudas o necesitas asistencia?</h4>
              <p style="margin:0 0 15px 0;color:#5A6A5C;font-size:0.85rem">Contáctanos directamente por cualquiera de nuestros canales oficiales:</p>
              <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center">
                <a href="https://wa.me/56986698970" style="background:#25D366;color:#ffffff;padding:8px 18px;border-radius:50px;text-decoration:none;font-size:0.85rem;font-weight:600;display:inline-block;box-shadow:0 2px 5px rgba(37,211,102,0.15)">💬 WhatsApp</a>
                <a href="mailto:Bana_ju@hotmail.com" style="background:#FAF8F5;color:#2C4A2E;border:1px solid #2C4A2E;padding:8px 18px;border-radius:50px;text-decoration:none;font-size:0.85rem;font-weight:600;display:inline-block">✉️ Correo</a>
              </div>
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

async function enviarAvisoAdmin({ emailDestino, nombreCliente, emailCliente, cabana, llegada, salida, total }) {
  const frontendUrl = getFrontendUrl();
  const destino = emailDestino || process.env.ADMIN_EMAIL || 'bana_ju@hotmail.com';

  try {
    await enviarEmail({
      to: destino,
      subject: '🔔 Nueva Reserva Pagada Online',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1A2E1B">Nueva Reserva Recibida</h2>
          <div style="background:#F5ECD7;border-radius:8px;padding:20px;margin-bottom:20px">
            <p><strong>Cliente:</strong> ${nombreCliente} (${emailCliente})</p>
            <p><strong>Cabaña:</strong> ${cabana}</p>
            <p><strong>Entrada:</strong> ${new Date(llegada).toLocaleDateString('es-CL')}</p>
            <p><strong>Salida:</strong> ${new Date(salida).toLocaleDateString('es-CL')}</p>
            <p><strong>Total:</strong> $${total.toLocaleString('es-CL')}</p>
          </div>
          <div style="text-align:center">
            <a href="${frontendUrl}/admin" style="background:#2C4A2E;color:#fff;padding:12px 26px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block">Ir al Panel de Administración</a>
          </div>
        </div>
      `
    })
  } catch (error) {
    console.error(`Error enviando aviso admin a ${destino}:`, error)
  }
}

async function enviarAvisoCancelacion({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'bana_ju@hotmail.com';
    // Para Resend sin dominio verificado, enviar en correos separados para evitar errores de envío multifuncional
    await enviarEmail({
      to: emailCliente,
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
    });

    const emailsAdmin = [process.env.ADMIN_EMAIL || 'bana_ju@hotmail.com'];
    for (const adminEmail of emailsAdmin) {
      try {
        await enviarEmail({
          to: adminEmail,
          subject: '❌ Reserva cancelada (Copia Admin) — Cabañas La Higuera Rapel',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <h2>Notificación de Cancelación de Reserva</h2>
              <p>La reserva del cliente <strong>${nombreCliente}</strong> (${emailCliente}) ha sido cancelada.</p>
              <p>Cabaña: ${cabana}</p>
            </div>
          `
        });
      } catch (e) {
        console.error(`Error enviando aviso cancelacion a ${adminEmail}:`, e)
      }
    }

    console.log('Email de cancelación enviado a', emailCliente, 'y admin')
  } catch (error) {
    console.error('Error enviando email de cancelación:', error)
  }
}

async function enviarRestablecerPassword({ emailCliente, nombreCliente, enlace }) {
  try {
    await enviarEmail({
      to: emailCliente,
      subject: '🔑 Recuperación de contraseña — Cabañas La Higuera Rapel',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#2C4A2E;padding:30px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;font-size:1.5rem">Cabañas La Higuera Rapel</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Restablecer tu contraseña</p>
          </div>
          <div style="background:#fff;padding:30px;border:1px solid #eee;border-radius:0 0 12px 12px">
            <h2 style="color:#1A2E1B">Hola, ${nombreCliente}:</h2>
            <p style="color:#666">Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada al correo <strong>${emailCliente}</strong>.</p>
            <p style="color:#666">Para restablecer tu contraseña, haz clic en el siguiente botón (este enlace expira en 1 hora):</p>
            <div style="text-align:center;margin:30px 0">
              <a href="${enlace}" style="background:#C01C1C;color:#fff;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 15px rgba(192,28,28,0.3)">Restablecer contraseña</a>
            </div>
            <p style="color:#666;font-size:0.9rem">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña seguirá siendo la misma.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
            <p style="color:#999;font-size:0.8rem;text-align:center">Este es un correo automático, por favor no respondas a este mensaje.</p>
          </div>
        </div>
      `
    })
    console.log('Email de recuperación enviado a', emailCliente)
  } catch (error) {
    console.error('Error enviando email de recuperación:', error)
    throw error
  }
}

async function enviarCambioReserva({ emailCliente, nombreCliente, cabana, llegada, salida, total }) {
  const frontendUrl = getFrontendUrl();
  try {
    await enviarEmail({
      to: emailCliente,
      subject: '🔄 Actualización de tu reserva — Cabañas La Higuera Rapel',
      html: `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#FAF8F5;color:#333;">
          <!-- Header Banner -->
          <div style="background:#2C4A2E;padding:35px 20px;text-align:center;border-radius:16px 16px 0 0;box-shadow:0 4px 10px rgba(44,74,46,0.15)">
            <h1 style="color:#FAF8F5;margin:0;font-size:1.8rem;font-weight:600;letter-spacing:0.5px">Cabañas La Higuera Rapel</h1>
            <p style="color:rgba(250,248,245,0.8);margin:8px 0 0;font-size:0.95rem;letter-spacing:1px;text-transform:uppercase">Lago Rapel, Chile</p>
          </div>
          
          <!-- Body -->
          <div style="background:#ffffff;padding:40px 30px;border:1px solid #ECE8E0;border-top:none;border-radius:0 0 16px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.02)">
            <h2 style="color:#1A2E1B;margin-top:0;font-size:1.4rem;font-weight:600">Actualización de tu estadía</h2>
            <p style="color:#5A6A5C;font-size:0.95rem;line-height:1.6">Hola <strong>${nombreCliente}</strong>, te informamos que nuestro equipo ha modificado los detalles de tu reserva según lo acordado. A continuación encuentras los datos actualizados:</p>
            
            <!-- Details Box -->
            <div style="background:#FDFBF7;border:1px solid #F3EDE2;border-radius:12px;padding:25px;margin:25px 0">
              <h3 style="margin-top:0;margin-bottom:15px;color:#1A2E1B;font-size:1.05rem;border-bottom:1px solid #F3EDE2;padding-bottom:10px">Nuevos Detalles de la Reserva</h3>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>🏕️ Cabaña:</strong> ${cabana}</p>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>📅 Entrada (Check-in):</strong> ${new Date(llegada).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santiago' })}</p>
              <p style="margin:0 0 10px;font-size:0.95rem;color:#3D4C5E"><strong>📅 Salida (Check-out):</strong> ${new Date(salida).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santiago' })}</p>
              <p style="margin:0;font-size:1.1rem;color:#C01C1C;font-weight:600;padding-top:8px;border-top:1px dashed #ECE8E0"><strong>💰 Total:</strong> $${total.toLocaleString('es-CL')}</p>
            </div>
            
            <!-- Button -->
            <div style="text-align:center;margin:35px 0">
              <a href="${frontendUrl}/mis-reservas" style="background:#2C4A2E;color:#FAF8F5;padding:14px 30px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(44,74,46,0.25);font-size:0.95rem">Ver mis reservas</a>
            </div>

            <!-- Contact Box -->
            <div style="background:#F0F4F1;border-radius:12px;padding:20px;text-align:center;margin-top:30px;border:1px solid #E2EAE3">
              <h4 style="margin:0 0 8px 0;color:#1A2E1B;font-size:0.95rem;font-weight:600">¿Tienes dudas o necesitas asistencia?</h4>
              <p style="margin:0 0 15px 0;color:#5A6A5C;font-size:0.85rem">Contáctanos directamente por cualquiera de nuestros canales oficiales:</p>
              <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center">
                <a href="https://wa.me/56986698970" style="background:#25D366;color:#ffffff;padding:8px 18px;border-radius:50px;text-decoration:none;font-size:0.85rem;font-weight:600;display:inline-block;box-shadow:0 2px 5px rgba(37,211,102,0.15)">💬 WhatsApp</a>
                <a href="mailto:Bana_ju@hotmail.com" style="background:#FAF8F5;color:#2C4A2E;border:1px solid #2C4A2E;padding:8px 18px;border-radius:50px;text-decoration:none;font-size:0.85rem;font-weight:600;display:inline-block">✉️ Correo</a>
              </div>
            </div>
          </div>
        </div>
      `
    })
    console.log('Email de cambio enviado a', emailCliente)
  } catch (error) {
    console.error('Error enviando email de cambio:', error)
  }
}

module.exports = { 
  getFrontendUrl,
  enviarEmail,
  enviarConfirmacionReserva, 
  enviarAvisoAdmin, 
  enviarAvisoCancelacion,
  enviarRestablecerPassword,
  enviarCambioReserva
}
