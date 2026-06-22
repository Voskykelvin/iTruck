const mongoose = require('mongoose');

function transactionsSupported() {
  if (mongoose.connection.readyState !== 1) return false;
  const type = mongoose.connection.client?.topology?.description?.type;
  return ['ReplicaSetWithPrimary', 'Sharded'].includes(type);
}

async function runInTransaction(work) {
  if (!transactionsSupported()) return work(null);
  return mongoose.connection.transaction((session) => work(session));
}

function sessionOptions(session, options = {}) {
  return session ? { ...options, session } : options;
}

async function createOne(Model, payload, session) {
  if (!session) return Model.create(payload);
  const [record] = await Model.create([payload], { session });
  return record;
}

module.exports = { createOne, runInTransaction, sessionOptions, transactionsSupported };
