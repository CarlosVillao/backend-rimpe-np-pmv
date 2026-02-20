import jwt from 'jsonwebtoken';

/* =====================================================
   VERIFICAR TOKEN
===================================================== */
export const verificarToken = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();

  } catch (error) {
    return res.status(401).json({ message: 'Token inválido' });
  }
};


/* =====================================================
   VERIFICAR ROL
===================================================== */
export const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    next();
  };
};
