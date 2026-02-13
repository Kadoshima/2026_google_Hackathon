import { AnalysisOrchestrator } from '../../services/analysis/orchestrator.js';
import { FirestoreRepo } from '../../services/firestore.repo.js';
import { buildError, ErrorCodes, toErrorResponse } from '../../utils/errors.js';
import { runAnalysisTask } from '../../services/tasks/analysis.task-runner.js';
const ANALYSIS_ID_PATTERN = /^ana_[A-Za-z0-9_-]+$/;
const parseBody = (value) => {
    if (!value || typeof value !== 'object') {
        throw new Error('request body must be an object');
    }
    const body = value;
    if (typeof body.analysis_id !== 'string' || body.analysis_id.trim().length === 0) {
        throw new Error('analysis_id is required');
    }
    if (!ANALYSIS_ID_PATTERN.test(body.analysis_id)) {
        throw new Error('analysis_id format is invalid');
    }
    return { analysis_id: body.analysis_id.trim() };
};
const getRequestId = (headerValue, fallback) => headerValue?.trim() || fallback;
export const registerTaskRoutes = (app) => {
    const repo = new FirestoreRepo();
    const orchestrator = new AnalysisOrchestrator({ repo });
    app.post('/tasks/analysis', async (c) => {
        const bodyPayload = await c.req.json().catch(() => null);
        let body;
        try {
            body = parseBody(bodyPayload);
        }
        catch (error) {
            return c.json(buildError(ErrorCodes.INVALID_INPUT, error instanceof Error ? error.message : 'invalid request body'), 400);
        }
        const analysisId = body.analysis_id;
        const lockOwner = `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const requestId = getRequestId(c.req.header('x-cloud-tasks-taskname'), lockOwner);
        try {
            const result = await runAnalysisTask({ analysisId, requestId, lockOwner }, { repo, orchestrator });
            if (!result.accepted) {
                return c.json({
                    accepted: false,
                    analysis_id: analysisId,
                    reason: 'already_processed_or_locked'
                }, 200);
            }
            return c.json({
                accepted: true,
                analysis_id: analysisId
            }, 202);
        }
        catch (error) {
            const response = toErrorResponse(error, 'analysis failed');
            console.error(JSON.stringify({
                event: 'analysis_task_failed',
                analysisId,
                requestId,
                lockOwner,
                status: response.status,
                code: response.payload.error.code,
                message: response.payload.error.message
            }));
            return c.json(response.payload, response.status);
        }
    });
};
//# sourceMappingURL=tasks.js.map