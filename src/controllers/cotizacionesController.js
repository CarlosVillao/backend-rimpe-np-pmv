import pool from '../config/db.js'
import { generarPDFCotizacion } from '../services/pdfCotizacionService.js'

/* =====================================================
   GENERAR NÚMERO DE COTIZACIÓN COT-000001
===================================================== */
const generarNumeroCotizacion = async (connection) => {
  const [rows] = await connection.query(
    'SELECT numero FROM cotizaciones ORDER BY id DESC LIMIT 1'
  );

  if (rows.length === 0) return 'COT-000001';

  const sec = parseInt(rows[0].numero.split('-')[1]) + 1;
  return `COT-${sec.toString().padStart(6, '0')}`;
};

/* =====================================================
   GENERAR NÚMERO DE NOTA
===================================================== */
const generarNumeroNota = async (connection) => {
  const [rows] = await connection.query(
    'SELECT numero FROM notas_venta ORDER BY id DESC LIMIT 1'
  );

  if (rows.length === 0) return 'NV-000001';

  const sec = parseInt(rows[0].numero.split('-')[1]) + 1;
  return `NV-${sec.toString().padStart(6, '0')}`;
};

/* =====================================================
   CREAR COTIZACIÓN
===================================================== */
export const crearCotizacion = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { cliente_id, cliente, productos } = req.body;

    if ((!cliente_id && !cliente) || !productos?.length) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }

    await connection.beginTransaction();

    // Si no viene cliente_id, crear cliente nuevo
    let clienteId = cliente_id;
    if (!clienteId && cliente) {
      const [clienteRes] = await connection.execute(
        `INSERT INTO clientes (nombre, identificacion, telefono, email, direccion)
         VALUES (?, ?, ?, ?, ?)`,
        [
          cliente.nombre,
          cliente.identificacion,
          cliente.telefono || null,
          cliente.email || null,
          cliente.direccion || null // 👈 dirección opcional
        ]
      );
      clienteId = clienteRes.insertId;
    }

    const numero = await generarNumeroCotizacion(connection);

    const [result] = await connection.execute(
      `INSERT INTO cotizaciones 
       (numero, cliente_id, total, estado) 
       VALUES (?, ?, 0, 'ACTIVA')`,
      [numero, clienteId]
    );

    const cotizacionId = result.insertId;
    let total = 0;

    for (const item of productos) {
      const [[producto]] = await connection.query(
        'SELECT * FROM productos WHERE id = ?',
        [item.producto_id]
      );

      if (!producto) throw new Error('Producto no encontrado');

      const precio = producto.pvp;
      const subtotal = precio * item.cantidad;
      total += subtotal;

      await connection.execute(
        `INSERT INTO cotizacion_detalle
         (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [cotizacionId, item.producto_id, item.cantidad, precio, subtotal]
      );
    }

    await connection.execute(
      'UPDATE cotizaciones SET total = ? WHERE id = ?',
      [total, cotizacionId]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Cotización creada correctamente',
      numero
    });

  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

/* =====================================================
   LISTAR COTIZACIONES
===================================================== */
export const listarCotizaciones = async (req, res) => {
  try {
    const { search = '' } = req.query;

    let sql = `
      SELECT 
        c.id,
        c.numero,
        cl.nombre AS cliente_nombre,
        c.total,
        c.estado,
        c.fecha
      FROM cotizaciones c
      JOIN clientes cl ON cl.id = c.cliente_id
      WHERE 1 = 1
    `;

    const params = [];

    if (search) {
      sql += ` AND (c.numero LIKE ? OR cl.nombre LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.fecha DESC`;

    const [rows] = await pool.query(sql, params);

    res.json(rows);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   OBTENER DETALLE COTIZACIÓN
===================================================== */
export const obtenerCotizacion = async (req, res) => {
  try {
    const { id } = req.params;

    const [[cot]] = await pool.query(
      `SELECT  
         c.id,
         c.numero,
         c.total,
         c.estado,
         c.fecha,
         cl.id AS cliente_id,
         cl.identificacion,
         cl.nombre,
         cl.telefono,
         cl.email,
         cl.direccion
       FROM cotizaciones c
       JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = ?`,
      [id]
    );

    if (!cot) {
      return res.status(404).json({ message: 'Cotización no encontrada' });
    }

    const [detalle] = await pool.query(
      `SELECT  
         d.producto_id,
         d.cantidad,
         d.precio_unitario,
         d.subtotal,
         p.nombre,
         p.codigo
       FROM cotizacion_detalle d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.cotizacion_id = ?`,
      [id]
    );

    res.json({
      id: cot.id,
      numero: cot.numero,
      total: cot.total,
      estado: cot.estado,
      fecha: cot.fecha,
      cliente: {
        id: cot.cliente_id,
        identificacion: cot.identificacion,
        nombre: cot.nombre,
        telefono: cot.telefono,
        email: cot.email,
        direccion: cot.direccion
      },
      productos: detalle.map(d => ({
        producto_id: d.producto_id,
        nombre: d.nombre,
        descripcion: d.nombre, // 👈 usamos nombre como descripción
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal,
        codigo: d.codigo
      }))
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   DESCARGAR PDF COTIZACIÓN  🔥 NUEVO
===================================================== */
export const descargarPDFCotizacion = async (req, res) => {
  try {
    const { id } = req.params;

    // Cabecera con cliente completo
    const [[cot]] = await pool.query(
      `SELECT  
         c.id,
         c.numero,
         c.total,
         c.estado,
         c.fecha,
         cl.nombre AS cliente_nombre,
         cl.identificacion,
         cl.telefono,
         cl.email,
         cl.direccion
       FROM cotizaciones c
       JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = ?`,
      [id]
    );

    if (!cot) {
      return res.status(404).json({ message: 'Cotización no encontrada' });
    }

    // Detalle con nombre como descripción
    const [detalle] = await pool.query(
      `SELECT  
         d.cantidad,
         d.precio_unitario,
         d.subtotal,
         p.nombre
       FROM cotizacion_detalle d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.cotizacion_id = ?`,
      [id]
    );

    // Armar objeto para PDF
    const cotizacionData = {
      numero: cot.numero,
      fecha: cot.fecha,
      cliente: {
        nombre: cot.cliente_nombre,
        identificacion: cot.identificacion,
        telefono: cot.telefono,
        email: cot.email,
        direccion: cot.direccion
      },
      total: cot.total,
      productos: detalle.map(d => ({
        nombre: d.nombre,
        descripcion: d.nombre, // 👈 usamos nombre como descripción
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal
      }))
    };

    // Generar PDF
    const pdfBuffer = await generarPDFCotizacion(cotizacionData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${cot.numero}.pdf`
    );

    res.send(pdfBuffer);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =====================================================
   CONVERTIR COTIZACIÓN A NOTA
===================================================== */
export const convertirCotizacionANota = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    const [[cot]] = await connection.query(
      'SELECT * FROM cotizaciones WHERE id = ? FOR UPDATE',
      [id]
    );

    if (!cot) throw new Error('Cotización no encontrada');
    if (cot.estado === 'CONVERTIDA')
      throw new Error('La cotización ya fue convertida');

    const [detalle] = await connection.query(
      'SELECT * FROM cotizacion_detalle WHERE cotizacion_id = ?',
      [id]
    );

    const numeroNota = await generarNumeroNota(connection);

    const [notaRes] = await connection.execute(
      `INSERT INTO notas_venta
       (numero, cliente_id, subtotal, total, estado)
       VALUES (?, ?, ?, ?, 'ACTIVA')`,
      [numeroNota, cot.cliente_id, cot.total, cot.total]
    );

    const notaId = notaRes.insertId;

    for (const item of detalle) {

      const [[producto]] = await connection.query(
        'SELECT stock FROM productos WHERE id = ? FOR UPDATE',
        [item.producto_id]
      );

      if (!producto || producto.stock < item.cantidad) {
        throw new Error('Stock insuficiente para convertir');
      }

      await connection.execute(
        `INSERT INTO nota_venta_detalle
         (nota_venta_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [
          notaId,
          item.producto_id,
          item.cantidad,
          item.precio_unitario,
          item.subtotal
        ]
      );

      await connection.execute(
        'UPDATE productos SET stock = stock - ? WHERE id = ?',
        [item.cantidad, item.producto_id]
      );
    }

    await connection.execute(
      'UPDATE cotizaciones SET estado = "CONVERTIDA" WHERE id = ?',
      [id]
    );

    await connection.commit();

    res.json({
      message: 'Cotización convertida correctamente',
      numeroNota
    });

  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

/* =====================================================
   ACTUALIZAR COTIZACIÓN
===================================================== */
export const actualizarCotizacion = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { cliente_id, productos } = req.body;

    if (!cliente_id || !productos?.length) {
      return res.status(400).json({ message: 'Datos incompletos' });
    }

    await connection.beginTransaction();

    // Actualizar cabecera (cliente y resetear total)
    await connection.execute(
      'UPDATE cotizaciones SET cliente_id = ?, total = 0 WHERE id = ?',
      [cliente_id, id]
    );

    // Borrar detalle anterior
    await connection.execute(
      'DELETE FROM cotizacion_detalle WHERE cotizacion_id = ?',
      [id]
    );

    // Insertar nuevo detalle
    let total = 0;
    for (const item of productos) {
      const [[producto]] = await connection.query(
        'SELECT * FROM productos WHERE id = ?',
        [item.producto_id]
      );

      if (!producto) throw new Error('Producto no encontrado');

      const precio = producto.pvp;
      const subtotal = precio * item.cantidad;
      total += subtotal;

      await connection.execute(
        `INSERT INTO cotizacion_detalle
         (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [id, item.producto_id, item.cantidad, precio, subtotal]
      );
    }

    // Actualizar total
    await connection.execute(
      'UPDATE cotizaciones SET total = ? WHERE id = ?',
      [total, id]
    );

    await connection.commit();

    res.json({ message: 'Cotización actualizada correctamente' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

/* =====================================================
   ELIMINAR COTIZACIÓN
===================================================== */
export const eliminarCotizacion = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    await connection.beginTransaction();

    // Borrar detalle primero
    await connection.execute(
      'DELETE FROM cotizacion_detalle WHERE cotizacion_id = ?',
      [id]
    );

    // Borrar cabecera
    const [result] = await connection.execute(
      'DELETE FROM cotizaciones WHERE id = ?',
      [id]
    );

    await connection.commit();

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cotización no encontrada' });
    }

    res.json({ message: 'Cotización eliminada correctamente' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};