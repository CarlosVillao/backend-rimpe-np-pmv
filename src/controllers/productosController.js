import pool from '../config/db.js';

/**
 * Crear producto
 */
export const crearProducto = async (req, res) => {
  try {
    const { nombre, costo, stock } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    if (!costo || costo <= 0) {
      return res.status(400).json({ message: 'El costo debe ser mayor a 0' });
    }

    // Cálculos automáticos de precios según intervalos
    let efectivo, pvp;
    if (costo >= 0.01 && costo <= 0.99) {
      efectivo = costo * 10;
      pvp = costo * 12.5;
    } else if (costo >= 1.0 && costo <= 39.99) {
      efectivo = costo * 2.1;
      pvp = costo * 2.6;
    } else if (costo >= 40.0 && costo <= 99.99) {
      efectivo = costo * 1.5;
      pvp = costo * 1.9;
    } else if (costo >= 100.0 && costo <= 499.99) {
      efectivo = costo * 1.2;
      pvp = costo * 1.3;
    } else if (costo >= 500.0 && costo <= 1499.99) {
      efectivo = costo * 1.1;
      pvp = costo * 1.15;
    } else if (costo >= 1500.0) {
      efectivo = costo * 1.05;
      pvp = costo * 1.1;
    }

    // Créditos se calculan siempre igual
    const cred_10 = pvp * 1.1;
    const cred_15 = pvp * 1.15;

    // Insertar con un valor temporal en código
    const sqlInsert = `
      INSERT INTO productos
      (codigo, nombre, costo, efectivo, pvp, cred_10, cred_15, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sqlInsert, [
      'TEMP',
      nombre,
      costo,
      efectivo,
      pvp,
      cred_10,
      cred_15,
      stock ?? 0
    ]);

    const newId = result.insertId;
    const codigo = String(newId).padStart(5, '0');

    await pool.execute('UPDATE productos SET codigo = ? WHERE id = ?', [codigo, newId]);

    res.status(201).json({ message: 'Producto creado correctamente', codigo });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El código del producto ya existe' });
    }
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto' });
  }
};

/**
 * Listar productos
 */
export const listarProductos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM productos ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al listar productos' });
  }
};

/**
 * Obtener producto por ID
 */
export const obtenerProducto = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM productos WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener producto' });
  }
};

/**
 * Actualizar producto
 */
export const actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, costo, stock } = req.body;

    if (!costo || costo <= 0) {
      return res.status(400).json({ message: 'El costo debe ser mayor a 0' });
    }

    // Cálculos automáticos según intervalos
    let efectivo, pvp;
    if (costo >= 0.01 && costo <= 0.99) {
      efectivo = costo * 10;
      pvp = costo * 12.5;
    } else if (costo >= 1.0 && costo <= 39.99) {
      efectivo = costo * 2.1;
      pvp = costo * 2.6;
    } else if (costo >= 40.0 && costo <= 99.99) {
      efectivo = costo * 1.5;
      pvp = costo * 1.9;
    } else if (costo >= 100.0 && costo <= 499.99) {
      efectivo = costo * 1.2;
      pvp = costo * 1.3;
    } else if (costo >= 500.0 && costo <= 1499.99) {
      efectivo = costo * 1.1;
      pvp = costo * 1.15;
    } else if (costo >= 1500.0) {
      efectivo = costo * 1.05;
      pvp = costo * 1.1;
    }

    const cred_10 = pvp * 1.1;
    const cred_15 = pvp * 1.15;

    const sql = `
      UPDATE productos SET
        nombre = ?,
        costo = ?,
        efectivo = ?,
        pvp = ?,
        cred_10 = ?,
        cred_15 = ?,
        stock = ?
      WHERE id = ?
    `;

    const [result] = await pool.execute(sql, [
      nombre,
      costo,
      efectivo,
      pvp,
      cred_10,
      cred_15,
      stock,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
};

/**
 * Eliminar producto
 */
export const eliminarProducto = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el producto está en uso en nota_venta_detalle
    const [detalles] = await pool.execute(
      'SELECT COUNT(*) AS count FROM nota_venta_detalle WHERE producto_id = ?',
      [id]
    );

    if (detalles[0].count > 0) {
      return res.status(400).json({
        message: 'No se puede eliminar el producto porque está asociado a notas de venta'
      });
    }

    const [result] = await pool.execute(
      'DELETE FROM productos WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    console.error(error);

    // Capturar error de integridad referencial directamente
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        message: 'No se puede eliminar el producto porque está asociado a notas de venta'
      });
    }

    res.status(500).json({ message: 'Error al eliminar producto' });
  }
};

export const obtenerProductoPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;
    const [[producto]] = await pool.query(
      `SELECT id, codigo, nombre, efectivo, pvp, cred_10, cred_15, stock 
       FROM productos 
       WHERE codigo = ?`,
      [codigo]
    );

    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(producto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener producto por código' });
  }
};