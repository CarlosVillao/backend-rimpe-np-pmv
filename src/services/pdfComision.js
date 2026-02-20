import PDFDocument from 'pdfkit';

/**
 * Generar Recibo de Comisión Mensual en memoria
 */
export const generarPdfComision = ({
  anio,
  mes,
  notasGeneradas,
  tarifaAplicada,
  totalComision
}) => {

  return new Promise((resolve, reject) => {

    const doc = new PDFDocument();
    const buffers = [];

    const nombreMes = new Date(anio, mes - 1).toLocaleString('es-ES', {
      month: 'long'
    });

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    doc.on('error', reject);

    // ===== CONTENIDO =====

    doc.fontSize(18).text('RECIBO DE COMISIÓN MENSUAL', {
      align: 'center'
    });

    doc.moveDown(2);

    doc.fontSize(12);
    doc.text(`Mes: ${nombreMes.toUpperCase()} ${anio}`);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`);

    doc.moveDown();

    doc.text(`Notas ACTIVAS generadas: ${notasGeneradas}`);
    doc.text(`Tarifa aplicada por nota: $${tarifaAplicada}`);
    doc.text(`Total comisión a cobrar: $${totalComision.toFixed(2)}`);

    doc.moveDown(2);
    doc.text('Estado: PENDIENTE DE PAGO');

    doc.moveDown(3);
    doc.text('______________________________');
    doc.text('Firma Responsable');

    doc.end();
  });
};
