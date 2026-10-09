import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from './api/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// API Route for Gemini workouts and exercise info
app.post('/api/gemini', async (req, res) => {
  try {
    await handler(req, res);
  } catch (error: any) {
    console.error('Server error handling /api/gemini:', error);
    if (!res.headersSent) {
      res.status(500).json({
        responseText: 'שגיאה: אירעה שגיאה בעיבוד הבקשה בשרת.',
        message: error?.message || 'Internal server error',
      });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.use((_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
