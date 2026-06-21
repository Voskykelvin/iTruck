function immutableError(label) {
  const err = new Error(`${label} records are immutable`);
  err.status = 409;
  return err;
}

function makeImmutable(schema, label) {
  schema.pre('save', function rejectRepeatedSave(next) {
    if (this.isNew) return next();
    return next(immutableError(label));
  });

  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndDelete', 'deleteMany'].forEach(
    (operation) => {
      schema.pre(operation, function rejectMutation(next) {
        next(immutableError(label));
      });
    }
  );

  schema.pre('deleteOne', { document: true, query: true }, function rejectDelete(next) {
    next(immutableError(label));
  });
}

module.exports = { makeImmutable };
