import { generarPDFNotaVenta } from './pdfNotaVenta.js';
import { enviarNotaVentaPorCorreo } from './emailService.js';
import db from '../config/db.js';

// ===============================
// Validar vigencia de cotización
// ===============================
const esCotizacionValida = (cotizacion) => {
  const fechaCotizacion = new Date(cotizacion.fecha);
  const hoy = new Date();
  const diferenciaDias = (hoy - fechaCotizacion) / (1000 * 60 * 60 * 24);
  return diferenciaDias <= 15 && cotizacion.estado === 'ACTIVA';
};

// ===============================
// Generar número secuencial seguro
// ===============================
const generarNumeroSecuencial = async (connection) => {
  const [rows] = await connection.query(
    'SELECT MAX(id) as lastId FROM notas_venta'
  );

  const nextId = (rows[0].lastId || 0) + 1;
  return `NV-${nextId.toString().padStart(6, '0')}`;
};

// ===============================
// Crear Nota de Venta
// ===============================
export const crearNotaVentaDesdeCotizacion = async (cotizacionId) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Obtener cotización
    const [rows] = await connection.query(
      'SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE',
      [cotizacionId]
    );

    const cotizacion = rows[0];

    if (!cotizacion) {
      throw new Error('Cotización no encontrada');
    }

    if (!esCotizacionValida(cotizacion)) {
      throw new Error('Cotización no válida o ya convertida');
    }

    // 2️⃣ Obtener productos con nombre
    const [productos] = await connection.query(
      `SELECT cd.*, p.nombre, p.stock
       FROM cotizacion_detalle cd
       JOIN productos p ON cd.producto_id = p.id
       WHERE cd.cotizacion_id = ?`,
      [cotizacionId]
    );

    if (productos.length === 0) {
      throw new Error('La cotización no tiene productos');
    }

    // 3️⃣ Validar stock antes de descontar
    for (const item of productos) {
      if (item.stock < item.cantidad) {
        throw new Error(
          `Stock insuficiente para el producto: ${item.nombre}`
        );
      }
    }

    // 4️⃣ Generar número
    const numero = await generarNumeroSecuencial(connection);
    const fechaActual = new Date();

    // 5️⃣ Insertar nota de venta
    const [result] = await connection.query(
      `INSERT INTO notas_venta 
      (numero, cliente_id, cliente_nombre, subtotal, total, forma_pago, tipo_precio, fecha, observacion, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numero,
        cotizacion.cliente_id,
        cotizacion.cliente_nombre || 'CONSUMIDOR FINAL',
        cotizacion.total,
        cotizacion.total,
        'EFECTIVO',
        'PVP',
        fechaActual,
        'Generado desde cotización',
        'ACTIVA'
      ]
    );

    const notaVentaId = result.insertId;

    // 6️⃣ Insertar detalle + descontar stock
    for (const item of productos) {
      await connection.query(
        `INSERT INTO nota_venta_detalle
        (nota_venta_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)`,
        [
          notaVentaId,
          item.producto_id,
          item.cantidad,
          item.precio_unitario,
          item.subtotal
        ]
      );

      await connection.query(
        'UPDATE productos SET stock = stock - ? WHERE id = ?',
        [item.cantidad, item.producto_id]
      );
    }

    // 7️⃣ Actualizar cotización
    await connection.query(
      'UPDATE cotizaciones SET estado = ? WHERE id = ?',
      ['CONVERTIDA', cotizacionId]
    );

    await connection.commit();

    // ===============================
    // Generar PDF (fuera de transacción)
    // ===============================
    const notaData = {
      numero,
      fecha: fechaActual.toISOString().split('T')[0],
      cliente: {
        nombre: cotizacion.cliente_nombre || 'CONSUMIDOR FINAL',
        identificacion: cotizacion.cliente_identificacion,
        telefono: cotizacion.cliente_telefono,
        direccion: cotizacion.cliente_direccion,
        email: cotizacion.cliente_email
      },
      productos,
      subtotal: cotizacion.total,
      total: cotizacion.total,
      forma_pago: 'EFECTIVO',
      tipo_precio: 'PVP',
      observacion: 'Generado desde cotización'
    };

    const pdfBuffer = await generarPDFNotaVenta(notaData);

    // ===============================
    // Enviar correo (no rompe venta)
    // ===============================
    if (notaData.cliente.email) {
      try {
        await enviarNotaVentaPorCorreo({
          numero,
          clienteEmail: notaData.cliente.email,
          pdfBuffer, // 👈 ahora buffer
          total: notaData.total
        });
      } catch (emailError) {
        console.error('Error enviando correo:', emailError.message);
      }
    }

    return {
      venta: notaData,
      pdfBuffer
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ========================================
// Anular Nota de Venta (RIMPE NP)
// ========================================
export const anularNotaVenta = async (notaVentaId, motivo) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Verificar que exista y esté activa
    const [rows] = await connection.query(
      'SELECT * FROM notas_venta WHERE id = ? FOR UPDATE',
      [notaVentaId]
    );

    const nota = rows[0];

    if (!nota) {
      throw new Error('Nota de venta no encontrada');
    }

    if (nota.estado === 'ANULADA') {
      throw new Error('La nota ya está anulada');
    }

    // 2️⃣ Obtener detalle
    const [detalle] = await connection.query(
      'SELECT * FROM nota_venta_detalle WHERE nota_venta_id = ?',
      [notaVentaId]
    );

    // 3️⃣ Devolver stock
    for (const item of detalle) {
      await connection.query(
        'UPDATE productos SET stock = stock + ? WHERE id = ?',
        [item.cantidad, item.producto_id]
      );
    }

    // 4️⃣ Actualizar nota
    await connection.query(
      `UPDATE notas_venta 
       SET estado = ?, 
           motivo_anulacion = ?, 
           fecha_anulacion = ?
       WHERE id = ?`,
      [
        'ANULADA',
        motivo || 'Anulación manual',
        new Date(),
        notaVentaId
      ]
    );

    await connection.commit();

    return {
      message: 'Nota de venta anulada correctamente'
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};