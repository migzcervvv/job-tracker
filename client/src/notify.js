import { gooeyToast } from 'goey-toast';

export const notify = {
  success: (title, description) => gooeyToast.success(title, description ? { description } : undefined),
  error: (title, description) => gooeyToast.error(title, description ? { description } : undefined),
  info: (title, description) => gooeyToast.info(title, description ? { description } : undefined),
  promise: (promise, options) => gooeyToast.promise(promise, options),
};
