import { Router } from 'express';
import {
  crearCotizacion,
  listarCotizaciones,
  obtenerCotizacion,
  convertirCotizacionANota,
  descargarPDFCotizacion,
  actualizarCotizacion,
  eliminarCotizacion
} from '../controllers/cotizacionesController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddlewares.js';

const router = Router();

// Todas estas rutas pueden ser accedidas por ADMIN y DESARROLLADOR
router.get('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), listarCotizaciones);
router.get('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), obtenerCotizacion);
router.post('/', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), crearCotizacion);
router.put('/:id/convertir', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), convertirCotizacionANota);
router.get('/:id/pdf', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), descargarPDFCotizacion);
router.put('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), actualizarCotizacion);
router.delete('/:id', verificarToken, verificarRol('ADMIN', 'DESARROLLADOR'), eliminarCotizacion);


export default router;
