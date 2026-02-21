import sgMail from '@sendgrid/mail';
import { empresa } from '../config/empresaConfig.js';

/* =====================================================
   CONFIGURACIÓN SENDGRID
   ===================================================== */
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* =====================================================
   ENVIAR NOTA DE VENTA
===================================================== */
export const enviarNotaVentaPorCorreo = async ({
  numero,
  clienteEmail,
  pdfBuffer,
  total
}) => {
  try {
    if (!pdfBuffer) {
      throw new Error('PDF vacío o no generado');
    }

    const destinatarios = [];

    if (process.env.EMAIL_EMPRESA) {
      destinatarios.push(process.env.EMAIL_EMPRESA);
    }

    if (clienteEmail && clienteEmail.trim() !== '') {
      destinatarios.push(clienteEmail.trim());
    }

    if (destinatarios.length === 0) {
      throw new Error('No hay destinatarios definidos');
    }

    const msg = {
      to: destinatarios,
      from: process.env.EMAIL_EMPRESA, // remitente verificado en SendGrid
      subject: `Nota de Venta ${numero}`,
      text: `
Gracias por su compra.

Adjunto encontrará la Nota de Venta ${numero}
Total: $${Number(total).toFixed(2)}

Documento emitido bajo el régimen
RIMPE - Negocio Popular.

Este correo fue generado automáticamente.
      `,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `${numero}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);

    console.log(`✅ Nota ${numero} enviada correctamente`);
    return true;

  } catch (error) {
    console.error(`❌ Error enviando correo nota ${numero}:`);
    console.error(error.message);
    return false;
  }
};

/* =====================================================
   ENVIAR COMISIÓN MENSUAL
===================================================== */
export const enviarComisionMensual = async ({
  anio,
  mes,
  notasGeneradas,
  tarifaAplicada,
  totalComision,
  pdfBuffer
}) => {
  try {
    if (!pdfBuffer) {
      throw new Error('PDF de comisión vacío');
    }

    const nombreMes = new Date(anio, mes - 1).toLocaleString('es-ES', {
      month: 'long'
    });

    const destinatarios = [];

    if (empresa?.email) {
      destinatarios.push(empresa.email);
    }

    if (process.env.EMAIL_EMPRESA) {
      destinatarios.push(process.env.EMAIL_EMPRESA);
    }

    if (destinatarios.length === 0) {
      throw new Error('No hay destinatarios para comisión mensual');
    }

    const msg = {
      to: destinatarios,
      from: process.env.EMAIL_EMPRESA,
      subject: `Comisión mensual - ${nombreMes.toUpperCase()} ${anio}`,
      text: `
REPORTE DE COMISIÓN MENSUAL

Mes: ${nombreMes.toUpperCase()} ${anio}
Notas ACTIVAS generadas: ${notasGeneradas}
Tarifa aplicada: $${Number(tarifaAplicada).toFixed(2)}
Total comisión a cobrar: $${Number(totalComision).toFixed(2)}

Este correo fue generado automáticamente por el sistema.
      `,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `comision_${anio}_${mes}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);

    console.log(`✅ Comisión mensual enviada`);
    return true;

  } catch (error) {
    console.error('❌ Error enviando comisión mensual:');
    console.error(error.message);
    return false;
  }
};