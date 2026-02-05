import { Hono } from 'hono';
import { registerV1Routes } from './routes/v1/index.js';
import { registerInternalRoutes } from './routes/internal/index.js';
export const createApp = () => {
    const app = new Hono();
    registerV1Routes(app);
    registerInternalRoutes(app);
    return app;
};
//# sourceMappingURL=server.js.map