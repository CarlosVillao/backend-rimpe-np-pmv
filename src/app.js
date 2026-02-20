import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

// Rutas (las usaremos luego)
import productosRoutes from './routes/productosRoutes.js';
import clientesRoutes from './routes/clientesRoutes.js';
import notasVentasRoutes from './routes/notasVentasRoutes.js';
import cotizacionesRoutes from './routes/cotizacionesRoutes.js';
import reportesRoutes from './routes/reportesRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Ruta de prueba (salud)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend RIMPE NP funcionando' });
});

// Rutas API
app.use('/api/productos', productosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/notas-venta', notasVentasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auth', authRoutes);

export default app;
