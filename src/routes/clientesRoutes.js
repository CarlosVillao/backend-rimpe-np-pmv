import { Router } from 'express';
import { crearCliente, listarClientes, obtenerCliente, actualizarCliente, eliminarCliente, obtenerClientePorIdentificacion } from '../controllers/clientesController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddlewares.js';

const router = Router();

// Estas rutas son accesibles por ADMIN y DESARROLLADOR
router.post('/', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), crearCliente);
router.get('/', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), listarClientes);
router.get('/:id', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), obtenerCliente);
router.put('/:id', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), actualizarCliente);
router.delete('/:id', verificarToken, verificarRol('ADMIN','DESARROLLADOR'), eliminarCliente);
router.get('/identificacion/:identificacion', obtenerClientePorIdentificacion);

export default router;
