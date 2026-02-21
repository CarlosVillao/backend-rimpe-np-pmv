import pool from '../config/db.js';
import { generarPDFNotaVenta } from '../services/pdfNotaVenta.js';
import { enviarNotaVentaPorCorreo } from '../services/emailService.js';

/* =====================================================
   GENERAR NÚMERO SEGURO (ANTI DUPLICADOS)
===================================================== */
const generarNumeroNota = async (connection) => {
  const [[row]] = await connection.query(
    'SELECT MAX(id) as lastId FROM notas_venta'
  );

  const nextId = (row.lastId || 0) + 1;
  return `NV-${nextId.toString().padStart(6, '0')}`;
};

/* =====================================================
   HELPER: CREAR NOTA DE VENTA INTERNA
===================================================== */
const crearNotaVentaInterna = async (connection, datos) => {
  const { cliente_id, cliente, forma_pago, tipo_precio, observacion, productos } = datos;

  if ((!cliente_id && !cliente) || !forma_pago || !tipo_precio || !productos?.length) {
    throw new Error('Datos incompletos');
  }

  let clienteFinal;
  let numero;
  let fechaActual;
  let subtotal = 0;
  let notaId;

  try {
    await connection.beginTransaction();

    // 1️⃣ OBTENER O CREAR CLIENTE
    if (cliente_id) {
      const [[c]] = await connection.query('SELECT * FROM clientes WHERE id = ?', [cliente_id]);
      if (!c) throw new Error('Cliente no existe');
      clienteFinal = c;
    } else if (cliente) {
      const [[existing]] = await connection.query(
        'SELECT * FROM clientes WHERE identificacion = ?',
        [cliente.identificacion]
      );

      if (existing) {
        clienteFinal = existing;
      } else {
        const [result] = await connection.execute(
          `INSERT INTO clientes (identificacion, nombre, telefono, direccion, email) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            cliente.identificacion,
            cliente.nombre,
            cliente.telefono || '',
            cliente.direccion || '',
            cliente.email || ''
          ]
        );

        const [[nuevo]] = await connection.query('SELECT * FROM clientes WHERE id = ?', [result.insertId]);
        clienteFinal = nuevo;
      }
    }

    // 2️⃣ CREAR NOTA
    numero = await generarNumeroNota(connection);
    fechaActual = new Date();

    const [notaRes] = await connection.execute(
      `INSERT INTO notas_venta
       (numero, cliente_id, cliente_nombre, subtotal, total, forma_pago, tipo_precio, fecha, observacion, estado)
       VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 'ACTIVA')`,
      [
        numero,
        clienteFinal.id,
        clienteFinal.nombre,
        forma_pago,
        tipo_precio,
        fechaActual,
        observacion || null
      ]
    );

    notaId = notaRes.insertId;
    const productosPDF = [];

    // 3️⃣ INSERTAR DETALLES
    for (const item of productos) {
      const [[p]] = await connection.query('SELECT * FROM productos WHERE id = ? FOR UPDATE', [item.producto_id]);
      if (!p) throw new Error('Producto no existe');
      if (p.stock < item.cantidad) {
        throw new Error(`Stock insuficiente: ${p.nombre}`);
      }

      // 🔥 USAR PRECIO EDITABLE DEL FRONTEND
      const precio = item.precio_unitario;
      const sub = precio * item.cantidad;
      subtotal += sub;

      await connection.execute(
        `INSERT INTO nota_venta_detalle
         (nota_venta_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [notaId, item.producto_id, item.cantidad, precio, sub]
      );

      await connection.execute('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.producto_id]);

      productosPDF.push({
        descripcion: p.nombre, // descripción del catálogo
        cantidad: item.cantidad,
        precio_unitario: precio,
        subtotal: sub
      });
    }

    // 4️⃣ ACTUALIZAR TOTALES
    await connection.execute('UPDATE notas_venta SET subtotal = ?, total = ? WHERE id = ?', [subtotal, subtotal, notaId]);

    await connection.commit();

    // 5️⃣ GENERAR PDF
    const clientePlano = {
      nombre: clienteFinal.nombre || 'CONSUMIDOR FINAL',
      identificacion: clienteFinal.identificacion || '0999999999',
      telefono: clienteFinal.telefono || '0999999999',
      email: clienteFinal.email || '',
      direccion: clienteFinal.direccion || ''
    };

    const pdfBuffer = await generarPDFNotaVenta({
      numero,
      fecha: fechaActual,
      cliente: clientePlano,
      productos: productosPDF,
      subtotal,
      total: subtotal,
      forma_pago,
      tipo_precio,
      observacion: observacion || ''
    });

    if (clientePlano.email && clientePlano.email.trim() !== '') {
      try {
        await enviarNotaVentaPorCorreo({
          numero,
          clienteEmail: clientePlano.email,
          pdfBuffer,
          total: subtotal
        });
      } catch (emailError) {
        console.error(`Error enviando correo nota ${numero}:`, emailError.message);
      }
    }

    return { numero, total: subtotal };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    throw error;
  }
};

/* =====================================================
   CREAR NOTA DE VENTA DIRECTA
===================================================== */
export const crearNotaVenta = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const resultado = await crearNotaVentaInterna(connection, req.body);

    return res.status(201).json({
      success: true,
      message: 'Nota creada correctamente',
      numero: resultado.numero,
      total: resultado.total
    });

  } catch (error) {
    console.error('Error creando nota de venta:', error);

    return res.status(500).json({
      success: false,
      message: 'Error al crear la nota de venta',
      error: error.message
    });

  } finally {
    connection.release();
  }
};

/* =====================================================
   CREAR NOTA DESDE COTIZACIÓN
===================================================== */
export const crearNotaDesdeCotizacion = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { cotizacion_id, forma_pago, tipo_precio } = req.body;

    await connection.beginTransaction();

    const [[cotizacion]] = await connection.query(
      'SELECT * FROM cotizaciones WHERE id = ? AND estado = "ACTIVA" FOR UPDATE',
      [cotizacion_id]
    );

    if (!cotizacion) throw new Error('Cotización no válida');

    const [detalle] = await connection.query(
      'SELECT * FROM cotizacion_detalle WHERE cotizacion_id = ?',
      [cotizacion_id]
    );

    if (!detalle.length) throw new Error('Cotización sin productos');

    await connection.execute(
      'UPDATE cotizaciones SET estado = "CONVERTIDA" WHERE id = ?',
      [cotizacion_id]
    );

    await connection.commit();
    connection.release(); // 🔥 LIBERAMOS

    // 🔥 NUEVA CONEXIÓN PARA CREAR NOTA
    const newConnection = await pool.getConnection();

    const datos = {
      cliente_id: cotizacion.cliente_id,
      forma_pago,
      tipo_precio,
      observacion: `Generada desde cotización ${cotizacion.numero}`,
      productos: detalle.map(d => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad
      }))
    };

    const resultado = await crearNotaVentaInterna(newConnection, datos);

    newConnection.release();

    return res.status(201).json({
      success: true,
      message: 'Nota creada correctamente desde cotización',
      numero: resultado.numero,
      total: resultado.total
    });

  } catch (error) {
    try {
      await connection.rollback();
    } catch { }
    connection.release();

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================================
   ANULAR NOTA (RIMPE NP)
===================================================== */
export const anularNotaVenta = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { motivo } = req.body;

    await connection.beginTransaction();

    const [[nota]] = await connection.query(
      'SELECT * FROM notas_venta WHERE id = ? FOR UPDATE',
      [id]
    );

    if (!nota) return res.status(404).json({ message: 'No encontrada' });
    if (nota.estado === 'ANULADA')
      return res.status(400).json({ message: 'Ya anulada' });

    const [detalles] = await connection.query(
      'SELECT * FROM nota_venta_detalle WHERE nota_venta_id = ?',
      [id]
    );

    for (const d of detalles) {
      await connection.execute(
        'UPDATE productos SET stock = stock + ? WHERE id = ?',
        [d.cantidad, d.producto_id]
      );
    }

    await connection.execute(
      `UPDATE notas_venta 
       SET estado = "ANULADA",
           motivo_anulacion = ?,
           fecha_anulacion = ?
       WHERE id = ?`,
      [motivo || 'Anulación manual', new Date(), id]
    );

    await connection.commit();

    res.json({ message: 'Nota anulada correctamente' });

  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

// Listar todas las notas de venta
export const listarNotasVenta = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, numero, cliente_nombre, fecha, total, estado
       FROM notas_venta
       ORDER BY fecha DESC`
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener detalle de una nota de venta
export const obtenerNotaVenta = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(`
      SELECT n.*,
             c.identificacion AS cliente_identificacion,
             c.nombre AS cliente_nombre,
             c.telefono AS cliente_telefono,
             c.email AS cliente_email,
             c.direccion AS cliente_direccion
      FROM notas_venta n
      LEFT JOIN clientes c ON n.cliente_id = c.id
      WHERE n.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Nota no encontrada' });
    }

    const nota = rows[0];

    const [productos] = await pool.query(`
      SELECT d.producto_id,
       d.cantidad,
       d.precio_unitario,
       d.subtotal,
       p.nombre AS descripcion
      FROM nota_venta_detalle d
      JOIN productos p ON p.id = d.producto_id
      WHERE d.nota_venta_id = ?
    `, [id]);

    res.json({
      ...nota,
      productos: productos.map(d => ({
        producto_id: d.producto_id,
        descripcion: d.descripcion, // 👈 usar aquí
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal
      })),
      cliente: {
        nombre: nota.cliente_nombre,
        identificacion: nota.cliente_identificacion,
        telefono: nota.cliente_telefono,
        email: nota.cliente_email,
        direccion: nota.cliente_direccion
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error obteniendo nota' });
  }
};

// Generar y descargar PDF de una nota de venta
export const descargarNotaVentaPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(`
      SELECT n.*,
             c.identificacion AS cliente_identificacion,
             c.nombre AS cliente_nombre,
             c.telefono AS cliente_telefono,
             c.email AS cliente_email,
             c.direccion AS cliente_direccion
      FROM notas_venta n
      LEFT JOIN clientes c ON n.cliente_id = c.id
      WHERE n.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Nota de venta no encontrada' });
    }

    const nota = rows[0];

    // 🔥 USAR PRECIO Y DETALLE GUARDADO
    const [productos] = await pool.query(`
      SELECT d.cantidad,
             d.precio_unitario,
             d.subtotal,
             p.nombre AS descripcion
      FROM nota_venta_detalle d
      JOIN productos p ON p.id = d.producto_id
      WHERE d.nota_venta_id = ?
    `, [id]);

    const pdfBuffer = await generarPDFNotaVenta({
      ...nota,
      productos,
      cliente: {
        nombre: nota.cliente_nombre || 'CONSUMIDOR FINAL',
        identificacion: nota.cliente_identificacion || '',
        telefono: nota.cliente_telefono || '',
        email: nota.cliente_email || '',
        direccion: nota.cliente_direccion || ''
      }
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=nota_venta_${nota.numero}.pdf`,
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error generando PDF' });
  }
};

/* =====================================================
   HELPER: ACTUALIZAR NOTA DE VENTA INTERNA
===================================================== */
const actualizarNotaVentaInterna = async (connection, id, datos) => {
  const { cliente_id, productos, forma_pago, tipo_precio, observacion } = datos;

  if (!cliente_id || !productos?.length) {
    throw new Error('Datos incompletos');
  }

  await connection.beginTransaction();

  // Actualizar cabecera
  await connection.execute(
    `UPDATE notas_venta 
     SET cliente_id = ?, 
         cliente_nombre = (SELECT nombre FROM clientes WHERE id = ?), 
         subtotal = 0, 
         total = 0, 
         forma_pago = ?, 
         tipo_precio = ?, 
         observacion = ? 
     WHERE id = ?`,
    [cliente_id, cliente_id, forma_pago, tipo_precio, observacion || null, id]
  );

  // Borrar detalle anterior
  await connection.execute(
    'DELETE FROM nota_venta_detalle WHERE nota_venta_id = ?',
    [id]
  );

  let subtotal = 0;

  // Insertar nuevo detalle respetando precio editado
  for (const item of productos) {
    const [[producto]] = await connection.query(
      'SELECT * FROM productos WHERE id = ?',
      [item.producto_id]
    );

    if (!producto) throw new Error('Producto no encontrado');

    // Validar que el precio no sea menor al costo
    if (item.precio_unitario < producto.costo) {
      throw new Error(`El precio no puede ser menor al costo (${producto.costo})`);
    }

    const sub = item.precio_unitario * item.cantidad;
    subtotal += sub;

    await connection.execute(
      `INSERT INTO nota_venta_detalle
       (nota_venta_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [id, item.producto_id, item.cantidad, item.precio_unitario, sub]
    );
  }

  // Actualizar totales
  await connection.execute(
    'UPDATE notas_venta SET subtotal = ?, total = ? WHERE id = ?',
    [subtotal, subtotal, id]
  );

  await connection.commit();

  // 🔥 Obtener nota completa (CON DIRECCIÓN)
  const [[nota]] = await connection.query(
    `SELECT n.*, 
            c.email AS cliente_email, 
            c.identificacion AS cliente_identificacion, 
            c.telefono AS cliente_telefono, 
            c.nombre AS cliente_nombre,
            c.direccion AS cliente_direccion
     FROM notas_venta n
     JOIN clientes c ON c.id = n.cliente_id
     WHERE n.id = ?`,
    [id]
  );

  const [detalle] = await connection.query(
    `SELECT d.cantidad, 
            d.precio_unitario, 
            d.subtotal, 
            p.nombre
     FROM nota_venta_detalle d
     JOIN productos p ON p.id = d.producto_id
     WHERE d.nota_venta_id = ?`,
    [id]
  );

  // 🔥 Generar PDF con dirección incluida
  const pdfBuffer = await generarPDFNotaVenta({
    numero: nota.numero,
    fecha: nota.fecha,
    cliente: {
      nombre: nota.cliente_nombre,
      identificacion: nota.cliente_identificacion || '',
      telefono: nota.cliente_telefono || '',
      email: nota.cliente_email || '',
      direccion: nota.cliente_direccion || ''
    },
    productos: detalle.map(d => ({
      nombre: d.nombre,
      descripcion: d.nombre, // 👈 añadimos descripción
      cantidad: d.cantidad,
      precio_unitario: d.precio_unitario,
      subtotal: d.subtotal
    })),
    subtotal: nota.subtotal,
    total: nota.total,
    forma_pago: nota.forma_pago,
    tipo_precio: nota.tipo_precio,
    observacion: nota.observacion || ''
  });

  // Enviar correo si existe email válido
  if (nota.cliente_email && nota.cliente_email.trim() !== '') {
    try {
      await enviarNotaVentaPorCorreo({
        numero: nota.numero,
        clienteEmail: nota.cliente_email,
        pdfBuffer,
        total: nota.total
      });
    } catch (emailError) {
      console.error('Error enviando correo:', emailError.message);
    }
  } else {
    console.warn(`Nota ${nota.numero} actualizada sin correo porque el cliente no tiene email válido`);
  }

  return { numero: nota.numero, total: nota.total };
};

/* =====================================================
   ACTUALIZAR NOTA DE VENTA
===================================================== */
export const actualizarNotaVenta = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const resultado = await actualizarNotaVentaInterna(connection, id, req.body);
    res.json({
      message: 'Nota de venta actualizada correctamente',
      numero: resultado.numero,
      total: resultado.total
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};

/* =====================================================
   ELIMINAR NOTA DE VENTA
===================================================== */
export const eliminarNotaVenta = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    // Borrar detalle primero
    await connection.execute(
      'DELETE FROM nota_venta_detalle WHERE nota_venta_id = ?',
      [id]
    );

    // Borrar cabecera
    const [result] = await connection.execute(
      'DELETE FROM notas_venta WHERE id = ?',
      [id]
    );

    await connection.commit();

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Nota de venta no encontrada' });
    }

    res.json({ message: 'Nota de venta eliminada correctamente' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
};