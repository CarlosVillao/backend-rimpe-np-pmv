import express from 'express';
import {
  reporteDiario,
  reporteMensual,
  exportarExcel,
  marcarComisionPagada,
  detalleDiario,
  detalleMensual,
  reporteComisiones   
} from '../controllers/reportesController.js';
import { verificarToken, verificarRol } from '../middlewares/authMiddlewares.js';

const router = express.Router();

// Reporte diario (resumen)
router.get(
  '/diario',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  reporteDiario
);

// Reporte mensual (resumen + comisión)
router.get(
  '/mensual',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  reporteMensual
);

// Detalle diario (notas con costo, venta y ganancia)
router.get(
  '/detalle/diario',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  detalleDiario
);

// Detalle mensual (notas con costo, venta y ganancia)
router.get(
  '/detalle/mensual',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  detalleMensual
);

// Exportar reporte a Excel
router.get(
  '/excel',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  exportarExcel
);

// Marcar comisión mensual como pagada (solo DESARROLLADOR)
router.post(
  '/comision/pagar',
  verificarToken,
  verificarRol('DESARROLLADOR'),
  marcarComisionPagada
);

// Reporte de comisiones mensuales
router.get(
  '/comisiones',
  verificarToken,
  verificarRol('ADMIN', 'DESARROLLADOR'),
  reporteComisiones
);


export default router;