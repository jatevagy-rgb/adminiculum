const multer = function (_opts) {
  const fn = function (_req, _res, next) { next(); };
  fn.single = function () { return function (_req, _res, next) { next(); }; };
  return fn;
};
multer.memoryStorage = function () { return {}; };
multer.diskStorage = function () { return {}; };
module.exports = multer;
module.exports.default = multer;
