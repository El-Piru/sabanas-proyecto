/**
 * Utilitario para comunicarse con el Webhook de Google Sheets.
 */

async function registrarReservaEnSheets(reserva) {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    console.log('[Google Sheets] GOOGLE_SHEET_WEBHOOK_URL no configurado, saltando registro.');
    return;
  }

  try {
    const response = await fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        id: reserva.id,
        cabana: reserva.cabana.nombre,
        cliente: reserva.usuario.nombre,
        email: reserva.usuario.email,
        telefono: reserva.usuario.telefono || 'No registrado',
        entrada: new Date(reserva.llegada).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        salida: new Date(reserva.salida).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        total: reserva.total,
        estado: reserva.estado,
        fechaCompra: new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
      })
    });
    console.log(`[Google Sheets] Registro de reserva ${reserva.id} enviado. Estado respuesta: ${response.status}`);
  } catch (error) {
    console.error('[Google Sheets] Error al registrar reserva en Google Sheets:', error);
  }
}

async function cancelarReservaEnSheets(reserva) {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    console.log('[Google Sheets] GOOGLE_SHEET_WEBHOOK_URL no configurado, saltando cancelación.');
    return;
  }

  try {
    const response = await fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'cancelar',
        id: reserva.id,
        estado: 'cancelada'
      })
    });
    console.log(`[Google Sheets] Notificación de cancelación de reserva ${reserva.id} enviada. Estado respuesta: ${response.status}`);
  } catch (error) {
    console.error('[Google Sheets] Error al notificar cancelación a Google Sheets:', error);
  }
}

async function modificarReservaEnSheets(reserva) {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    console.log('[Google Sheets] GOOGLE_SHEET_WEBHOOK_URL no configurado, saltando modificación.');
    return;
  }

  try {
    const response = await fetch(process.env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'modificar',
        id: reserva.id,
        cabana: reserva.cabana.nombre,
        cliente: reserva.usuario.nombre,
        email: reserva.usuario.email,
        telefono: reserva.usuario.telefono || 'No registrado',
        entrada: new Date(reserva.llegada).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        salida: new Date(reserva.salida).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        total: reserva.total,
        estado: reserva.estado,
        fechaCompra: new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
      })
    });
    console.log(`[Google Sheets] Notificación de modificación de reserva ${reserva.id} enviada. Estado respuesta: ${response.status}`);
  } catch (error) {
    console.error('[Google Sheets] Error al notificar modificación a Google Sheets:', error);
  }
}

module.exports = {
  registrarReservaEnSheets,
  cancelarReservaEnSheets,
  modificarReservaEnSheets
};
