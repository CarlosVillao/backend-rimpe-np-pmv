import pool from '../config/db.js';
import ExcelJS from 'exceljs';

import { calcularComision } from '../services/comisionService.js';
import { generarPdfComision } from '../services/pdfComision.js';
import { enviarComisionMensual } from '../services/emailService.js';

/* =====================================================
   REPORTE DIARIO (HOY)
===================================================== */
export const reporteDiario = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT  
        COUNT(*) AS notas_generadas,
        COALESCE(SUM(CASE WHEN estado = 'ACTIVA' THEN total ELSE 0 END), 0) AS total_vendido,
        COALESCE(SUM(CASE WHEN estado = 'ANULADA' THEN 1 ELSE 0 END), 0) AS notas_anuladas
      FROM notas_venta
      WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-05:00'))
    `);

    res.json(rows[0]);
  } catch (error) {
    console.error("❌ Error en reporteDiario:", error);
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   REPORTE MENSUAL (MES ACTUAL + COMISIÓN)
===================================================== */
export const reporteMensual = async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = fechaActual.getMonth() + 1;

    // 1️⃣ Verificar si ya existe comisión del mes
    const [existente] = await pool.query(
      `SELECT * FROM comisiones_mensuales
       WHERE anio = ? AND mes = ?`,
      [anio, mes]
    );

    // 2️⃣ Obtener datos del mes (ajustando zona horaria)
    const [rows] = await pool.query(`
      SELECT  
        COUNT(*) AS notas_generadas,
        COALESCE(SUM(CASE WHEN estado = 'ACTIVA' THEN total ELSE 0 END), 0) AS total_vendido,
        COALESCE(SUM(CASE WHEN estado = 'ANULADA' THEN 1 ELSE 0 END), 0) AS notas_anuladas,
        COALESCE(SUM(CASE WHEN estado = 'ACTIVA' THEN 1 ELSE 0 END), 0) AS notas_activas
      FROM notas_venta
      WHERE MONTH(CONVERT_TZ(fecha, '+00:00', '-05:00')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '-05:00'))
        AND YEAR(CONVERT_TZ(fecha, '+00:00', '-05:00')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '-05:00'))
    `);

    const data = rows[0];

    // 3️⃣ Si ya existe comisión, devolver lo guardado
    if (existente.length > 0) {
      return res.json({
        ...data,
        tarifa_aplicada: existente[0].tarifa_aplicada,
        total_comision: existente[0].total_comision,
        ya_generado: true
      });
    }

    // 4️⃣ Calcular comisión sobre TODAS las notas emitidas (activas + anuladas)
    const comisionData = calcularComision(data.notas_generadas);

    // 5️⃣ Guardar comisión en BD
    await pool.query(
      `INSERT INTO comisiones_mensuales
       (anio, mes, notas_generadas, tarifa_aplicada, total_comision)
       VALUES (?, ?, ?, ?, ?)`,
      [
        anio,
        mes,
        comisionData.notas_generadas,
        comisionData.tarifa_aplicada,
        comisionData.total_comision
      ]
    );

    // 6️⃣ Generar PDF en memoria (lo mantienes aunque aún no lo uses)
    const pdfBuffer = await generarPdfComision({
      anio,
      mes,
      notasGeneradas: comisionData.notas_generadas,
      tarifaAplicada: comisionData.tarifa_aplicada,
      totalComision: comisionData.total_comision
    });

    // 7️⃣ Enviar correo
    await enviarComisionMensual({
      anio,
      mes,
      notasGeneradas: comisionData.notas_generadas,
      tarifaAplicada: comisionData.tarifa_aplicada,
      totalComision: comisionData.total_comision,
      pdfBuffer
    });

    // 8️⃣ Devolver respuesta
    res.json({
      ...data,
      tarifa_aplicada: comisionData.tarifa_aplicada,
      total_comision: comisionData.total_comision,
      ya_generado: false
    });

  } catch (error) {
    console.error("❌ Error en reporteMensual:", error);
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   EXPORTAR REPORTE A EXCEL (POR RANGO)
===================================================== */
export const exportarExcel = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ message: 'Debe enviar desde y hasta' });
    }

    const [rows] = await pool.query(
      `SELECT 
         nv.numero AS serie,
         p.nombre AS descripcion,
         p.costo,
         nvd.cantidad,
         nvd.subtotal AS venta,
         (nvd.subtotal - (p.costo * nvd.cantidad)) AS ganancia
       FROM notas_venta nv
       INNER JOIN nota_venta_detalle nvd ON nv.id = nvd.nota_venta_id
       INNER JOIN productos p ON nvd.producto_id = p.id
       WHERE DATE(CONVERT_TZ(nv.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
         AND nv.estado = 'ACTIVA'
       ORDER BY nv.fecha ASC`,
      [desde, hasta]
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte Diario');

    // Encabezado principal
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Casa Musical Buena Melodía J&G';
    worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4B0082' }
    };

    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = `Reporte Diario de ventas - Fecha: ${desde}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.getCell('A2').font = { bold: true };

    worksheet.addRow([]);

    // Encabezado de tabla
    const headerRow = worksheet.addRow(['SERIE', 'DESCRIPCIÓN', 'CANTIDAD', 'COSTO', 'VENTA', 'GANANCIA']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6A5ACD' }
    };
    headerRow.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Ajustar ancho de columnas y formato monetario
    worksheet.getColumn(2).width = 40;
    worksheet.getColumn(4).numFmt = '"$"#,##0.00';
    worksheet.getColumn(5).numFmt = '"$"#,##0.00';
    worksheet.getColumn(6).numFmt = '"$"#,##0.00';

    // Filas de datos
    rows.forEach(r => {
      const dataRow = worksheet.addRow([
        r.serie,
        r.descripcion,
        Number(r.cantidad),
        Number(r.costo) * Number(r.cantidad),
        Number(r.venta),
        Number(r.ganancia)
      ]);
      dataRow.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    // Totales
    const totalCosto = rows.reduce((acc, r) => acc + (Number(r.costo) * Number(r.cantidad)), 0);
    const totalVenta = rows.reduce((acc, r) => acc + Number(r.venta), 0);
    const totalGanancia = rows.reduce((acc, r) => acc + Number(r.ganancia), 0);

    worksheet.addRow([]);
    const totalRow = worksheet.addRow(['Totales:', '', '', totalCosto, totalVenta, totalGanancia]);
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };
    totalRow.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    totalRow.getCell(4).numFmt = '"$"#,##0.00';
    totalRow.getCell(5).numFmt = '"$"#,##0.00';
    totalRow.getCell(6).numFmt = '"$"#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_${desde}_${hasta}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("❌ Error en exportarExcel:", error);
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   MARCAR COMISIÓN MENSUAL COMO PAGADA (SOLO DESARROLLADOR)
===================================================== */
export const marcarComisionPagada = async (req, res) => {
  try {
    const usuario = req.usuario; // viene del authMiddleware
    if (usuario.rol !== 'DESARROLLADOR') {
      return res.status(403).json({ message: 'Acceso denegado. Solo DESARROLLADOR puede marcar comisión pagada.' });
    }

    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = fechaActual.getMonth() + 1;

    // Obtenemos la comisión del mes
    const [comisionRows] = await pool.query(
      `SELECT * FROM comisiones_mensuales
       WHERE anio = ? AND mes = ?`,
      [anio, mes]
    );

    if (!comisionRows.length) {
      return res.status(400).json({ message: 'No hay comisión generada para este mes.' });
    }

    const comision = comisionRows[0];

    if (comision.pagado) {
      return res.status(400).json({ message: 'La comisión ya fue marcada como pagada.' });
    }

    // Marcamos como pagada
    await pool.query(
      `UPDATE comisiones_mensuales
       SET pagado = 1, fecha_pago = NOW()
       WHERE id = ?`,
      [comision.id]
    );

    // Generamos PDF del recibo en memoria
    const pdfBuffer = await generarPdfComision({
      anio,
      mes,
      notasGeneradas: comision.notas_generadas,
      tarifaAplicada: comision.tarifa_aplicada,
      totalComision: comision.total_comision
    });

    // Enviamos correo al desarrollador y empresa
    await enviarComisionMensual({
      anio,
      mes,
      notasGeneradas: comision.notas_generadas,
      tarifaAplicada: comision.tarifa_aplicada,
      totalComision: comision.total_comision,
      pdfBuffer
    });

    res.json({ message: 'Comisión marcada como pagada correctamente.' });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   DETALLE MENSUAL (MES ACTUAL)
===================================================== */
export const detalleMensual = async (req, res) => {
  try {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = fechaActual.getMonth() + 1;

    const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0);
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT 
         nv.numero AS numero,
         p.nombre AS producto,
         p.costo,
         nvd.cantidad,
         (p.costo * nvd.cantidad) AS costo_total,
         nvd.subtotal AS venta,
         (nvd.subtotal - (p.costo * nvd.cantidad)) AS ganancia
       FROM notas_venta nv
       INNER JOIN nota_venta_detalle nvd ON nv.id = nvd.nota_venta_id
       INNER JOIN productos p ON nvd.producto_id = p.id
       WHERE DATE(CONVERT_TZ(nv.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
         AND nv.estado = 'ACTIVA'
       ORDER BY nv.fecha ASC`,
      [primerDia, hasta]
    );

    res.json(rows);
  } catch (error) {
    console.error("❌ Error en detalleMensual:", error);
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   DETALLE DIARIO (HOY)
===================================================== */
export const detalleDiario = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         nv.numero AS numero,
         p.nombre AS producto,
         p.costo,
         nvd.cantidad,
         (p.costo * nvd.cantidad) AS costo_total,
         nvd.subtotal AS venta,
         (nvd.subtotal - (p.costo * nvd.cantidad)) AS ganancia
       FROM notas_venta nv
       INNER JOIN nota_venta_detalle nvd ON nv.id = nvd.nota_venta_id
       INNER JOIN productos p ON nvd.producto_id = p.id
       WHERE DATE(CONVERT_TZ(nv.fecha, '+00:00', '-05:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '-05:00'))
         AND nv.estado = 'ACTIVA'
       ORDER BY nv.fecha ASC`
    );

    res.json(rows);
  } catch (error) {
    console.error("❌ Error en detalleDiario:", error);
    res.status(500).json({ message: error.message });
  }
};

// Endpoint para calcular comisiones mensuales
export const reporteComisiones = async (req, res) => {
  try {
    // Obtener cantidad de notas emitidas en el mes actual (activas + anuladas)
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = fechaActual.getMonth() + 1;

    const primerDia = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0);
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`;

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total_notas
       FROM notas_venta nv
       WHERE DATE(CONVERT_TZ(nv.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?`,
      [primerDia, hasta]
    );

    const numeroNotas = rows[0].total_notas;

    // Calcular comisión con el servicio
    const resultado = calcularComision(numeroNotas);

    res.json(resultado);
  } catch (error) {
    console.error("❌ Error en reporteComisiones:", error);
    res.status(500).json({ message: error.message });
  }
};
