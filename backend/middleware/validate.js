export function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.validated = result;
      next();
    } catch (err) {
      res.status(400).json({
        error: 'Validation failed',
        details: err.errors?.map(e => `${e.path.join('.')}: ${e.message}`) || [err.message]
      });
    }
  };
}
