import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { empresa } from '../config/empresaConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generarPDFNotaVenta = (nota) => {
  return new Promise((resolve, reject) => {

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const primaryColor = '#0d47a1';
    const secondaryColor = '#f5f5f5';

    const logoPath = path.join(__dirname, '../assets/logo.png');

    try {
      doc.image(logoPath, 40, 30, { width: 120 });
    } catch { }

    /* =====================================================
       FORMATEAR FECHA CORRECTAMENTE (ECUADOR)
    ===================================================== */

    const fechaFormateada = new Date(nota.fecha).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    /* =====================================================
       ENCABEZADO
    ===================================================== */

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .text('CASA MUSICAL', 0, 40, { align: 'center' });

    doc
      .fontSize(20)
      .text('BUENA MELODIA J&G', { align: 'center' });

    doc
      .moveDown(0.1)
      .fontSize(8)
      .fillColor('black')
      .text(empresa.regimen || '', { align: 'center' })
      .text(`Propietario: ${empresa.propietario || '-'}`, { align: 'center' })
      .text(`RUC: ${empresa.ruc || '-'}`, { align: 'center' })
      .text(empresa.direccion || '-', { align: 'center' })
      .text(`Tel: ${empresa.telefono || '-'} | ${empresa.email || '-'}`, { align: 'center' });

    doc
      .moveDown(1)
      .strokeColor(primaryColor)
      .lineWidth(2)
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke();

    doc.moveDown(1.5);

    /* =====================================================
       BLOQUE NOTA
    ===================================================== */

    const top = doc.y;

    doc
      .rect(40, top, 515, 100)
      .fill(secondaryColor);

    doc
      .fillColor(primaryColor)
      .fontSize(15)
      .text(`NOTA DE VENTA: ${nota.numero}`, 50, top + 10);

    doc
      .fillColor('black')
      .fontSize(11)
      .text(`Fecha: ${fechaFormateada}`, 50, top + 32)
      .text(`Cliente: ${nota.cliente?.nombre || 'CONSUMIDOR FINAL'}`, 50, top + 47)
      .text(`Cédula/RUC: ${nota.cliente?.identificacion || '-'}`, 50, top + 62)
      .text(`Forma de pago: ${nota.forma_pago || '-'}`, 50, top + 77)
      .text(`Teléfono: ${nota.cliente?.telefono || '-'}`, 300, top + 32)
      .text(`Correo: ${nota.cliente?.email || '-'}`, 300, top + 47)
      .text(`Dirección: ${nota.direccion || '-'}`, 300, top + 62);

    doc.moveDown(3);

    /* =====================================================
       TABLA HEADER
    ===================================================== */

    const tableTop = doc.y;

    doc
      .rect(40, tableTop, 515, 25)
      .fill(primaryColor);

    doc
      .fillColor('white')
      .fontSize(11)
      .text('Descripción', 50, tableTop + 7)
      .text('Cant.', 300, tableTop + 7)
      .text('P.V.P.', 350, tableTop + 7)
      .text('Subtotal', 430, tableTop + 7);

    let y = tableTop + 30;

    /* =====================================================
    PRODUCTOS
    ===================================================== */
    (nota.productos || []).forEach((item, index) => {
      const precio = Number(item.precio_unitario || 0);
      const subtotal = Number(item.subtotal || 0);

      // ✅ Usar descripcion (que viene de p.nombre)
      const descripcionCompleta = item.descripcion || '';

      const textHeight = doc.heightOfString(descripcionCompleta, {
        width: 230
      });

      const rowHeight = Math.max(20, textHeight + 5);

      if (index % 2 === 0) {
        doc
          .rect(40, y - 5, 515, rowHeight)
          .fill('#fafafa');
      }

      doc.fillColor('black').fontSize(10);

      doc.text(descripcionCompleta, 50, y, {
        width: 230
      });

      doc.text(String(item.cantidad || 0), 300, y);
      doc.text(`$${precio.toFixed(2)}`, 350, y);
      doc.text(`$${subtotal.toFixed(2)}`, 430, y);

      y += rowHeight;
    });

    /* =====================================================
       TOTAL
    ===================================================== */

    y += 15;

    const total = Number(nota.total || 0);

    doc
      .rect(300, y, 255, 35)
      .fill(primaryColor);

    doc
      .fillColor('white')
      .fontSize(14)
      .text(`TOTAL: $${total.toFixed(2)}`, 320, y + 10);

    y += 60;

    /* =====================================================
       OBSERVACIÓN
    ===================================================== */

    if (nota.observacion) {
      doc
        .fillColor('black')
        .fontSize(10)
        .text(`Observación: ${nota.observacion}`, 40, y);
    }

    /* =====================================================
       LEYENDA RIMPE
    ===================================================== */

    doc
      .fontSize(8)
      .fillColor('#666666')
      .text(
        'Documento emitido conforme al régimen RIMPE - Negocio Popular',
        40,
        doc.page.height - 50,
        {
          align: 'center',
          width: doc.page.width - 80
        }
      );

    doc.end();
  });
};
