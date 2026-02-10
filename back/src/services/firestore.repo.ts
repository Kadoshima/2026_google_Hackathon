// TODO: implement FirestoreRepo
import { Firestore } from '@google-cloud/firestore';

const projectId = process.env.GCP_PROJECT_ID
const databaseId = process.env.FIRESTORE_DB

if (!projectId) {
    throw new Error('GCP_PROJECT_ID is required')
}

export const firestore = new Firestore ({
    projectId,
    ...(databaseId ?  { databaseId } : {})
})