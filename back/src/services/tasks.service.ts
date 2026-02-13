import { CloudTasksClient } from '@google-cloud/tasks'
import { runAnalysisTask } from './tasks/analysis.task-runner.js'
import { toErrorResponse } from '../utils/errors.js'

const tasksClient = new CloudTasksClient()

const projectId = process.env.GCP_PROJECT_ID
const taskQueueName = process.env.TASK_QUEUE_NAME
const taskLocation = process.env.TASK_LOCATION
const tasksTargetBaseUrl = process.env.TASKS_TARGET_URL
const taskServiceAccountEmail = process.env.TASK_SERVICE_ACCOUNT_EMAIL
const rawTasksDispatchMode = (process.env.TASKS_DISPATCH_MODE ?? 'cloud_tasks').toLowerCase()
const tasksDispatchMode = normalizeDispatchMode(rawTasksDispatchMode)

console.info(
  JSON.stringify({
    event: 'tasks_dispatch_mode',
    mode: tasksDispatchMode
  })
)

function normalizeDispatchMode(mode: string): 'cloud_tasks' | 'in_process' {
  if (mode === 'cloud_tasks' || mode === 'in_process') {
    return mode
  }

  console.warn(
    JSON.stringify({
      event: 'tasks_dispatch_mode_invalid',
      value: mode,
      fallback: 'cloud_tasks'
    })
  )
  return 'cloud_tasks'
}

const requireTaskConfig = () => {
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID is required')
  }
  if (!taskQueueName) {
    throw new Error('TASK_QUEUE_NAME is required')
  }
  if (!taskLocation) {
    throw new Error('TASK_LOCATION is required')
  }
  if (!tasksTargetBaseUrl) {
    throw new Error('TASKS_TARGET_URL is required')
  }
  if (tasksTargetBaseUrl.includes('your-api-domain')) {
    throw new Error('TASKS_TARGET_URL must be a real endpoint (placeholder is not allowed)')
  }
  if (!taskServiceAccountEmail) {
    throw new Error('TASK_SERVICE_ACCOUNT_EMAIL is required')
  }
  if (taskServiceAccountEmail.includes('your-cloud-tasks-sa@')) {
    throw new Error(
      'TASK_SERVICE_ACCOUNT_EMAIL must be a real service account (placeholder is not allowed)'
    )
  }

  return {
    projectId,
    taskQueueName,
    taskLocation,
    tasksTargetBaseUrl,
    taskServiceAccountEmail
  }
}

export const getAnalysisQueuePath = (): string => {
  const config = requireTaskConfig()
  return tasksClient.queuePath(config.projectId, config.taskLocation, config.taskQueueName)
}

export type EnqueueAnalysisTaskInput = {
  analysisId: string
}

export const getTasksDispatchMode = (): 'cloud_tasks' | 'in_process' => tasksDispatchMode

export const enqueueAnalysisTask = async (
  input: EnqueueAnalysisTaskInput
): Promise<string> => {
  if (tasksDispatchMode === 'in_process') {
    return enqueueAnalysisTaskInProcess(input)
  }

  const config = requireTaskConfig()
  const parent = tasksClient.queuePath(
    config.projectId,
    config.taskLocation,
    config.taskQueueName
  )

  const targetUrl = `${config.tasksTargetBaseUrl.replace(/\/$/, '')}/internal/tasks/analysis`
  const payload = Buffer.from(
    JSON.stringify({ analysis_id: input.analysisId })
  ).toString('base64')

  const [response] = await tasksClient.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        oidcToken: {
          serviceAccountEmail: config.taskServiceAccountEmail
        }
      }
    }
  })

  return response.name ?? ''
}

const enqueueAnalysisTaskInProcess = (
  input: EnqueueAnalysisTaskInput
): string => {
  const requestId = `in_process_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const lockOwner = `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  queueMicrotask(async () => {
    try {
      await runAnalysisTask({
        analysisId: input.analysisId,
        requestId,
        lockOwner
      })
    } catch (error) {
      const response = toErrorResponse(error, 'analysis failed')
      console.error(
        JSON.stringify({
          event: 'analysis_task_failed',
          analysisId: input.analysisId,
          requestId,
          lockOwner,
          status: response.status,
          code: response.payload.error.code,
          message: response.payload.error.message
        })
      )
    }
  })

  return `${requestId}/${input.analysisId}`
}
