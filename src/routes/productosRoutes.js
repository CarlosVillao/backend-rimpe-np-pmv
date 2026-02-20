import { Router } from 'express';
import {
  crearProducto,
  listarProductos,
  obtenerProducto,
  actualizarProducto,
  eliminarProducto,
  obtenerProductoPorCodigo
} from '../controllers/productosController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddlewares.js';

const router = Router();

// Crear producto
router.post('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), crearProducto);

// Listar productos
router.get('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), listarProductos);

// Obtener producto por ID
router.get('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), obtenerProducto);

// 🚀 Nueva ruta: obtener producto por código
router.get('/codigo/:codigo', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), obtenerProductoPorCodigo);

// Actualizar producto
router.put('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), actualizarProducto);

// Eliminar producto
router.delete('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), eliminarProducto);

export default router;