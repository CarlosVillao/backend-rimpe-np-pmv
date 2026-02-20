import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/* =====================================================
   LOGIN
===================================================== */
export const login = async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña requeridos' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const usuario = rows[0];

    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        rol: usuario.rol,
        email: usuario.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
