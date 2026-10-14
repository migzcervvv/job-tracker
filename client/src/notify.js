import { toast } from "sonner";

function messageOptions(description) {
  return { description, duration: 6000 };
}

export const notify = {
  success: (title, description) =>
    toast.success(title, messageOptions(description)),
  error: (title, description) =>
    toast.error(title, messageOptions(description)),
  info: (title, description) => toast.info(title, messageOptions(description)),
  promise: (promise, options) => {
    // The library returns a toast ID. Callers need the actual operation result.
    const operation = Promise.resolve(promise);
    toast.promise(operation, options);
    return operation;
  },
};
