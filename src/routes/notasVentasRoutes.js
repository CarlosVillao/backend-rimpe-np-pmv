import { Router } from 'express';
import {
  crearNotaVenta,
  crearNotaDesdeCotizacion,
  listarNotasVenta,
  obtenerNotaVenta,
  anularNotaVenta,
  descargarNotaVentaPDF,
  actualizarNotaVenta,
  eliminarNotaVenta
} from '../controllers/notasVentasController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddlewares.js';

const router = Router();

// Listar
router.get('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), listarNotasVenta);

// Crear
router.post('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), crearNotaVenta);

// Crear desde cotización
router.post('/desde-cotizacion', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), crearNotaDesdeCotizacion);

// Descargar PDF (ANTES DE :id)
router.get('/:id/pdf', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), descargarNotaVentaPDF);

// Obtener detalle
router.get('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), obtenerNotaVenta);

// Anular
router.put('/:id/anular', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), anularNotaVenta);

// Actualizar
router.put('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), actualizarNotaVenta);

// Eliminar
router.delete('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), eliminarNotaVenta);

// 🚀 En el futuro aquí se agregará la ruta de marcar comisión pagada:
// router.put('/:id/comision-pagada', verificarToken, verificarRol('DESARROLLADOR'), marcarComisionPagada);

export default router;