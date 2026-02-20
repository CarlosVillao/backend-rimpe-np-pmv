import pool from '../config/db.js';

/**
 * Validar identificación ecuatoriana básica
 */
const validarIdentificacion = (identificacion) => {
  const soloNumeros = /^\d+$/;

  if (!soloNumeros.test(identificacion)) {
    return 'La identificación solo debe contener números';
  }

  if (identificacion.length !== 10 && identificacion.length !== 13) {
    return 'La identificación debe tener 10 dígitos (cédula) o 13 dígitos (RUC)';
  }

  return null;
};

/**
 * Crear cliente
 */
export const crearCliente = async (req, res) => {
  try {
    const { nombre, identificacion, telefono, direccion, email } = req.body;

    if (!nombre) {
      return res.status(400).json({
        message: 'El nombre del cliente es obligatorio'
      });
    }

    if (identificacion) {
      const errorIdentificacion = validarIdentificacion(identificacion);
      if (errorIdentificacion) {
        return res.status(400).json({ message: errorIdentificacion });
      }

      // 🔒 Validar duplicado
      const [existente] = await pool.query(
        'SELECT id FROM clientes WHERE identificacion = ?',
        [identificacion]
      );

      if (existente.length > 0) {
        return res.status(409).json({
          message: 'Ya existe un cliente registrado con esa identificación'
        });
      }
    }

    const sql = `
      INSERT INTO clientes
      (nombre, identificacion, telefono, direccion, email)
      VALUES (?, ?, ?, ?, ?)
    `;

    await pool.execute(sql, [
      nombre,
      identificacion || null,
      telefono || null,
      direccion || null,
      email || null
    ]);

    res.status(201).json({
      message: 'Cliente creado correctamente'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error al crear cliente'
    });
  }
};

/**
 * Listar clientes
 */
export const listarClientes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM clientes ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error al listar clientes'
    });
  }
};

/**
 * Obtener cliente por ID
 */
export const obtenerCliente = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Cliente no encontrado'
      });
    }

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error al obtener cliente'
    });
  }
};

/**
 * Actualizar cliente
 */
export const actualizarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, identificacion, telefono, direccion, email } = req.body;

    if (!nombre) {
      return res.status(400).json({
        message: 'El nombre del cliente es obligatorio'
      });
    }

    if (identificacion) {
      const errorIdentificacion = validarIdentificacion(identificacion);
      if (errorIdentificacion) {
        return res.status(400).json({ message: errorIdentificacion });
      }

      // 🔒 Validar duplicado excluyendo el mismo ID
      const [existente] = await pool.query(
        'SELECT id FROM clientes WHERE identificacion = ? AND id <> ?',
        [identificacion, id]
      );

      if (existente.length > 0) {
        return res.status(409).json({
          message: 'Otra persona ya tiene registrada esa identificación'
        });
      }
    }

    const sql = `
      UPDATE clientes SET
        nombre = ?,
        identificacion = ?,
        telefono = ?,
        direccion = ?,
        email = ?
      WHERE id = ?
    `;

    const [result] = await pool.execute(sql, [
      nombre,
      identificacion || null,
      telefono || null,
      direccion || null,
      email || null,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      message: 'Cliente actualizado correctamente'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error al actualizar cliente'
    });
  }
};

/**
 * Eliminar cliente
 */
export const eliminarCliente = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM clientes WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        message: 'No se puede eliminar el cliente porque tiene cotizaciones asociadas'
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
};

// controllers/clientesController.js
export const obtenerClientePorIdentificacion = async (req, res) => {
  try {
    const { identificacion } = req.params;
    const [[cliente]] = await pool.query(
      'SELECT * FROM clientes WHERE identificacion = ?',
      [identificacion]
    );

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(cliente);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener cliente por identificación' });
  }
};