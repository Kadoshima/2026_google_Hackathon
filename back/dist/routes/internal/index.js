import { Hono } from 'hono';
import { registerTaskRoutes } from './tasks.js';
export const registerInternalRoutes = (app) => {
    const internal = new Hono();
    registerTaskRoutes(internal);
    app.route('/internal', internal);
};
//# sourceMappingURL=index.js.map