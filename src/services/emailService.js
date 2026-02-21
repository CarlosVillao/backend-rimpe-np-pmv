import nodemailer from 'nodemailer';
import { empresa } from '../config/empresaConfig.js';

/* =====================================================
   CONFIGURACIÓN SMTP OUTLOOK (MODERNA)
   Compatible 2026
===================================================== */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  family: 4,
  tls: { rejectUnauthorized: false },
  connectionTimeout: 20000 // 👈 aumenta el tiempo de espera a 20s
});

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

    const info = await transporter.sendMail({
      from: `"${empresa?.nombre || 'Casa Musical'}" <${process.env.EMAIL_USER}>`,
      to: destinatarios.join(','),
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
          filename: `${numero}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    console.log(`✅ Nota ${numero} enviada correctamente`);
    console.log(`📧 MessageId: ${info.messageId}`);

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

    if (process.env.EMAIL_USER) {
      destinatarios.push(process.env.EMAIL_USER);
    }

    if (destinatarios.length === 0) {
      throw new Error('No hay destinatarios para comisión mensual');
    }

    const info = await transporter.sendMail({
      from: `"${empresa?.nombre || 'Sistema de Facturación'}" <${process.env.EMAIL_USER}>`,
      to: destinatarios.join(','),
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
          filename: `comision_${anio}_${mes}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    console.log(`✅ Comisión mensual enviada`);
    console.log(`📧 MessageId: ${info.messageId}`);

    return true;

  } catch (error) {

    console.error('❌ Error enviando comisión mensual:');
    console.error(error.message);

    return false;
  }
};
