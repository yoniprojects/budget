// Reads the same Firestore doc the app itself reads/writes:
// db.collection('budgetApp').doc(SECRET_ID)
//
// Auth: FIREBASE_SERVICE_ACCOUNT_JSON (a full service account key, as JSON
// text) must be set as a GitHub secret. Generate it in the Firebase console:
// Project settings -> Service accounts -> Generate new private key.

const admin = require('firebase-admin');

function initFirebase(){
  if(admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function fetchAppState(){
  initFirebase();
  const db = admin.firestore();
  const secretId = process.env.FIRESTORE_SECRET_ID;
  if(!secretId) throw new Error('FIRESTORE_SECRET_ID env var is not set');

  const snap = await db.collection('budgetApp').doc(secretId).get();
  if(!snap.exists) throw new Error(`No Firestore doc found for budgetApp/${secretId}`);

  const data = snap.data();
  return {
    period: data.period,
    expenseCategories: data.expenseCategories || [],
    incomeSources: data.incomeSources || [],
    budgets: data.budgets || [],
    txExpenses: data.txExpenses || [],
    txIncome: data.txIncome || [],
    sheetData: data.sheetData || []
  };
}

module.exports = { fetchAppState };
