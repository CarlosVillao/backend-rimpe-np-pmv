import express from 'express';
import { login } from '../controllers/authController.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Middleware para validar campos
const validarLogin = [
  body('email').isEmail().withMessage('Debe enviar un email válido'),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

router.post('/login', validarLogin, login);

export default router;
