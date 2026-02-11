import { CloudTasksClient } from '@google-cloud/tasks'

const tasksClient = new CloudTasksClient()

const projectId = process.env.GCP_PROJECT_ID
const taskQueueName = process.env.TASK_QUEUE_NAME
const taskLocation = process.env.TASK_LOCATION
const tasksTargetBaseUrl = process.env.TASKS_TARGET_URL
const taskServiceAccountEmail = process.env.TASK_SERVICE_ACCOUNT_EMAIL

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
  if (!taskServiceAccountEmail) {
    throw new Error('TASK_SERVICE_ACCOUNT_EMAIL is required')
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

export const enqueueAnalysisTask = async (
  input: EnqueueAnalysisTaskInput
): Promise<string> => {
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
